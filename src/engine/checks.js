import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './canonical.js';
import { MasumeError } from './errors.js';
import { containedFile } from './paths.js';
import { casesOf } from './cases.js';
import { gitInfo, killActiveChecks, runChecks } from './runner.js';
import { lastSave, restoreTerritory, saveTerritory } from './save.js';
import { autoPush, gitSettings } from './remote.js';
import { gateParty, isSealed, readyGate, reduceEvent, replay, sealFiles } from './state.js';
import {
  appendEventsLocked, defaultActor, inspectLog, requireHealthy, withLockAsync, writeDurable,
} from './store.js';

function checkTarget(state, target) {
  const character = state.characters[target];
  if (character?.status === 'done') throw new MasumeError('E_DONE', `${target} はもうあがっています`);
  const path = character && state.map.characters.find(({ id }) => id === target).path;
  const node = character ? path[character.pos] : target;
  if (state.map.nodes[node]?.type === 'gate') {
    if (state.nodes[node].cleared) throw new MasumeError('E_DONE', `${node} はもう突破しています`);
    const party = gateParty(state, node);
    if (!party.ready) {
      const names = party.missing.map((id) => state.map.characters.find((member) => member.id === id).name);
      throw new MasumeError('E_PARTY_INCOMPLETE', `${node} の仲間が揃っていません: ${names.join('、')}`);
    }
    return { node, gate: true, members: party.members, segment: [node] };
  }
  if (!character) throw new MasumeError('E_UNKNOWN', `キャラクターまたはゲートが見つかりません: ${target}`);
  if (state.map.nodes[node].check.kind === 'stamp') {
    throw new MasumeError('E_NEEDS_STAMP', `${node} は人間のハンコが必要です`);
  }
  const segment = path.slice(character.checkpoint + 1, character.pos + 1)
    .filter((id) => state.map.nodes[id].type === 'task' && state.map.nodes[id].check.kind === 'cmd');
  return { node, gate: false, members: [target], segment };
}

function brokenSeal(root, state, segment) {
  // 未封印なら、区間のどこにあっても何も記録しない。
  for (const id of segment) {
    if (!isSealed(state.map.nodes[id], state.nodes[id].files)) {
      throw new MasumeError('E_UNSEALED', `${id} は未封印です。GM に封印を依頼してください`);
    }
  }
  for (const node of segment) {
    const files = [];
    for (const path of sealFiles(state.map.nodes[node])) {
      const expected = state.nodes[node].files[path];
      const file = containedFile(root, path);
      let actual = null;
      try {
        if (file) actual = sha256(readFileSync(file));
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error;
      }
      if (actual !== expected) files.push({ path, expected, actual });
    }
    if (files.length) return { node, files };
  }
  return null;
}

function requireSealed(root, state, segment, { actor, character, previous }) {
  const broken = brokenSeal(root, state, segment);
  if (!broken) return;
  appendEventsLocked(root, [{ type: 'seal_broken', data: { character, ...broken } }],
    { actor, previous });
  throw new MasumeError('E_SEAL_BROKEN', `${broken.node} の封印が破れています`);
}

function requireUnchanged(state, before, target) {
  if (state.revision !== before.revision
    || before.members.some((id) => state.characters[id]?.epoch !== before.epochs[id])) {
    throw new MasumeError('E_CONFLICT', `${target} の状態が判定中に変わりました。もう一度判定してください`);
  }
}

async function withCheckSignals(operation) {
  let interrupted = null;
  const handlers = Object.entries({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 }).map(([signal, code]) => {
    const handler = () => {
      interrupted ??= new MasumeError('E_INTERRUPTED', `判定を中断しました（${signal}）`, code);
      killActiveChecks();
    };
    process.on(signal, handler);
    return [signal, handler];
  });
  const requireRunning = () => {
    if (interrupted) throw interrupted;
  };
  try {
    const result = await operation(requireRunning);
    requireRunning();
    return result;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  }
}

function readyAfter(state, members) {
  return [...new Set(members.map((id) => readyGate(state, id)).filter((gate) => gate !== null))];
}

async function fightReady(root, result, gates, { actor, boss }) {
  if (!boss || result.exitCode !== 0) return result;
  for (const gate of gates) {
    const battle = await check(root, gate, { actor, boss });
    result.events.push(...battle.events);
    result.exitCode = battle.exitCode;
    if (battle.exitCode !== 0) break;
  }
  return result;
}

const positions = (state) => Object.fromEntries(Object.entries(state.characters).map(([id, c]) => [id, c.pos]));
const hasTerritory = (map, id) => (map.characters.find((c) => c.id === id)?.territory ?? []).length > 0;

// 町・ゲートのセーブと、設定がオンならそのすぐ後に GitHub へ送った結果（§59.2）。送れなくても判定は変えない。
function savedAndPushed(root, saved) {
  const specs = [{ type: 'saved', data: saved }];
  if (saved.commit && gitSettings(root).auto_push) specs.push({ type: 'pushed', data: autoPush(root, saved) });
  return specs;
}

// 判定の記録のすぐ後に続く、Git のセーブ（町・ゲート）と巻き戻し（負け）。quest.save が "git" の冒険だけ（§43）。
function saveFollowUps(root, state, before, event, history) {
  const map = state.map;
  if (map.quest.save !== 'git') return [];
  const { type, data, seq } = event;
  const specs = [];
  if (type === 'check_passed' || type === 'stamped') {
    const path = map.characters.find(({ id }) => id === data.character).path;
    const camps = path.slice(before[data.character] + 1, state.characters[data.character].pos)
      .filter((id) => map.nodes[id]?.type === 'camp');
    if (camps.length) specs.push(...savedAndPushed(root, saveTerritory(root, map, [data.character], camps.at(-1))));
  } else if (type === 'gate_cleared') {
    specs.push(...savedAndPushed(root, saveTerritory(root, map, data.members, data.gate)));
  } else if (type === 'check_failed' || type === 'gate_failed') {
    const losers = type === 'check_failed' ? [data.character] : data.blamed ?? [];
    for (const id of losers.filter((member) => hasTerritory(map, member))) {
      specs.push({
        type: 'restored',
        data: restoreTerritory(root, map, id, type === 'check_failed' ? data.failed : data.gate, seq, lastSave(history, id)),
      });
    }
  }
  return specs;
}

async function runCheck(root, target, { actor = defaultActor(), boss = true }, requireRunning) {
  root = resolve(root);
  const before = await withLockAsync(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const selection = checkTarget(state, target);
    requireSealed(root, state, selection.segment, {
      actor, character: selection.gate ? null : target, previous: snapshot.events.at(-1),
    });
    return {
      ...selection, map: state.map, revision: state.revision, sealState: state,
      epochs: Object.fromEntries(selection.members.map((id) => [id, state.characters[id].epoch])),
    };
  }, requireRunning);

  // 判定中はロックを持たず、他キャラクターや日誌の書き込みを妨げない。
  const result = await runChecks(root, target, before.segment, before.map, {
    async beforeRun(node) {
      requireRunning();
      await withLockAsync(root, actor, () => {
        const snapshot = requireHealthy(inspectLog(root));
        const state = replay(root, snapshot.events);
        requireUnchanged(state, before, target);
        requireSealed(root, before.sealState, [node], {
          actor, character: before.gate ? null : target, previous: snapshot.events.at(-1),
        });
      }, requireRunning);
    },
  });
  requireRunning();
  const git = gitInfo(root);
  const committed = await withLockAsync(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    requireUnchanged(state, before, target);
    // 判定開始時の封印と比較し、実行中の書き換えを再封印でも隠せないようにする。
    requireSealed(root, before.sealState, before.segment, {
      actor, character: before.gate ? null : target, previous: snapshot.events.at(-1),
    });
    const seq = snapshot.events.at(-1).seq + 1;
    const output = `outputs/${String(seq).padStart(6, '0')}.log`;
    mkdirSync(resolve(root, '.masume', 'outputs'), { recursive: true });
    // repair 後に同じ seq の未参照ファイルが残っていても、今回の証拠で置き換える。
    writeDurable(resolve(root, '.masume', output), result.output, 'w');
    const passed = result.failed === null;
    const named = new Set(result.blamed);
    const blamed = before.members.filter((id) => named.has(id));
    const data = {
      ...(before.gate ? {
        gate: before.node, members: before.members,
        ...(passed ? {} : { blamed: blamed.length ? blamed : before.members }),
      } : {
        character: target,
        node: before.node,
        ...(passed ? {} : { failed: result.failed }),
        ran: result.ran,
      }),
      cases: casesOf(result.output, result.ran, before.map),
      output,
      output_hash: sha256(result.output),
      duration_ms: result.duration_ms,
      git,
    };
    const events = appendEventsLocked(root, [{
      type: before.gate ? (passed ? 'gate_cleared' : 'gate_failed')
        : (passed ? 'check_passed' : 'check_failed'),
      data,
    }], { actor, previous: snapshot.events.at(-1) });
    const positionsBefore = positions(state);
    reduceEvent(state, events[0]);
    events.push(...appendEventsLocked(root,
      saveFollowUps(root, state, positionsBefore, events[0], [...snapshot.events, ...events]),
      { actor, previous: events[0] }));
    return {
      result: { exitCode: passed ? 0 : 1, events },
      gates: passed ? readyAfter(state, before.members) : [],
    };
  }, requireRunning);
  return fightReady(root, committed.result, committed.gates, { actor, boss });
}

async function runStamp(root, nodeId, { actor = defaultActor(), as = actor, boss = true }, requireRunning) {
  requireRunning();
  root = resolve(root);
  const result = await withLockAsync(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const node = state.map.nodes[nodeId];
    const owner = state.map.characters.find(({ path }) => path.includes(nodeId));
    const character = owner && state.characters[owner.id];
    // 押せないときは、理由を分けて言う（--as 忘れ・本人違い・マス違い・押し済み）
    const label = node?.title ? `${nodeId}「${node.title}」` : nodeId;
    const refuse = (why) => {
      throw new MasumeError('E_STAMP', `${label} にハンコを押せません: ${why}`);
    };
    if (!node) refuse('そのマスは地図にありません');
    if (node.type !== 'task' || node.check?.kind !== 'stamp') refuse('ハンコのマスではありません（判定で進むマス）');
    if (as === undefined || as === null || as === '') refuse(`だれが押すかを --as <人間のID> で指定してください（このマスのハンコは ${node.check.by}）`);
    if (node.check.by !== as) refuse(`このマスのハンコは ${node.check.by} が押します（--as ${node.check.by}）。${as} ではありません`);
    if (!character) refuse('このマスはどの道にもありません');
    const at = owner.path[character.pos];
    if (at !== nodeId) refuse(state.nodes[nodeId]?.cleared ? 'もう押してあります' : `${owner.id} はいま ${at ?? 'あがり'} にいます`);
    if (character.status !== 'working') refuse(`${owner.id} は ${nodeId} で仲間を待っています`);
    const events = appendEventsLocked(root, [{
      type: 'stamped', data: { character: owner.id, node: nodeId, by: as },
    }], { actor, previous: snapshot.events.at(-1) });
    const positionsBefore = positions(state);
    reduceEvent(state, events[0]);
    events.push(...appendEventsLocked(root,
      saveFollowUps(root, state, positionsBefore, events[0], [...snapshot.events, ...events]),
      { actor, previous: events[0] }));
    return { exitCode: 0, events, ready: readyGate(state, owner.id) };
  }, requireRunning);
  return fightReady(root, result, result.ready === null ? [] : [result.ready], { actor, boss });
}

export async function check(root, target, options = {}) {
  return withCheckSignals((requireRunning) => runCheck(root, target, options, requireRunning));
}

export async function stamp(root, nodeId, options = {}) {
  return withCheckSignals((requireRunning) => runStamp(root, nodeId, options, requireRunning));
}

// 歩く（§41）: 今のダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する。位置・レベル・epoch は変えない。
function stepTarget(state, characterId) {
  const definition = state.map.characters.find(({ id }) => id === characterId);
  const character = state.characters[characterId];
  if (!definition || !character) throw new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${characterId}`);
  if (character.status === 'done') throw new MasumeError('E_DONE', `${characterId} はもうあがっています`);
  const node = definition.path[character.pos];
  const spec = state.map.nodes[node];
  if (character.status === 'waiting' || spec.type !== 'task') {
    throw new MasumeError('E_USAGE', `${characterId} は ${node} で仲間を待っています。歩けるのはダンジョン（task）の中だけです`);
  }
  if (spec.check.kind === 'stamp') throw new MasumeError('E_NEEDS_STAMP', `${node} は人間のハンコが必要です`);
  return { node, gate: false, members: [characterId], segment: [node] };
}

async function runStep(root, characterId, { actor = defaultActor() }, requireRunning) {
  root = resolve(root);
  const before = await withLockAsync(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const selection = stepTarget(state, characterId);
    requireSealed(root, state, selection.segment, {
      actor, character: characterId, previous: snapshot.events.at(-1),
    });
    return {
      ...selection, map: state.map, revision: state.revision, sealState: state,
      epochs: { [characterId]: state.characters[characterId].epoch },
    };
  }, requireRunning);
  const result = await runChecks(root, characterId, before.segment, before.map, {
    async beforeRun() { requireRunning(); },
  });
  requireRunning();
  const git = gitInfo(root);
  return withLockAsync(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    requireUnchanged(state, before, characterId);
    requireSealed(root, before.sealState, before.segment, {
      actor, character: characterId, previous: snapshot.events.at(-1),
    });
    const seq = snapshot.events.at(-1).seq + 1;
    const output = `outputs/${String(seq).padStart(6, '0')}.log`;
    mkdirSync(resolve(root, '.masume', 'outputs'), { recursive: true });
    writeDurable(resolve(root, '.masume', output), result.output, 'w');
    const code = result.failed === null ? 0 : result.code ?? 1;
    const events = appendEventsLocked(root, [{
      type: 'stepped',
      data: {
        character: characterId, node: before.node, cases: casesOf(result.output, result.ran, before.map),
        code, output, output_hash: sha256(result.output), duration_ms: result.duration_ms, git,
      },
    }], { actor, previous: snapshot.events.at(-1) });
    return { exitCode: code === 0 ? 0 : 1, events };
  }, requireRunning);
}

export async function step(root, characterId, options = {}) {
  return withCheckSignals((requireRunning) => runStep(root, characterId, options, requireRunning));
}
