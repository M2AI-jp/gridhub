import { mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './canonical.js';
import { MasumeError } from './errors.js';
import { containedFile } from './paths.js';
import { gitInfo, runChecks } from './runner.js';
import { gateParty, isSealed, readyGate, reduceEvent, replay, sealFiles } from './state.js';
import {
  appendEventsLocked, defaultActor, inspectLog, requireHealthy, withLock, writeDurable,
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

export async function check(root, target, { actor = defaultActor(), boss = true } = {}) {
  root = resolve(root);
  const before = withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const selection = checkTarget(state, target);
    const broken = brokenSeal(root, state, selection.segment);
    if (broken) {
      appendEventsLocked(root, [{ type: 'seal_broken', data: { character: selection.gate ? null : target, ...broken } }],
        { actor, previous: snapshot.events.at(-1) });
      throw new MasumeError('E_SEAL_BROKEN', `${broken.node} の封印が破れています`);
    }
    return {
      ...selection, map: state.map, revision: state.revision,
      epochs: Object.fromEntries(selection.members.map((id) => [id, state.characters[id].epoch])),
    };
  });

  // 判定中はロックを持たず、他キャラクターや日誌の書き込みを妨げない。
  const result = await runChecks(root, target, before.segment, before.map);
  const git = gitInfo(root);
  const committed = withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    if (state.revision !== before.revision
      || before.members.some((id) => state.characters[id]?.epoch !== before.epochs[id])) {
      throw new MasumeError('E_CONFLICT', `${target} の状態が判定中に変わりました。もう一度判定してください`);
    }
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
    reduceEvent(state, events[0]);
    return {
      result: { exitCode: passed ? 0 : 1, events },
      gates: passed ? readyAfter(state, before.members) : [],
    };
  });
  return fightReady(root, committed.result, committed.gates, { actor, boss });
}

export async function stamp(root, nodeId, { actor = defaultActor(), as = actor, boss = true } = {}) {
  root = resolve(root);
  const result = withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const node = state.map.nodes[nodeId];
    const owner = state.map.characters.find(({ path }) => path.includes(nodeId));
    const character = owner && state.characters[owner.id];
    if (node?.type !== 'task' || node.check.kind !== 'stamp' || node.check.by !== as
      || !character || character.status !== 'working' || owner.path[character.pos] !== nodeId) {
      throw new MasumeError('E_STAMP', `${nodeId} にハンコを押せません。指定された本人と現在のマスを確認してください`);
    }
    const events = appendEventsLocked(root, [{
      type: 'stamped', data: { character: owner.id, node: nodeId, by: as },
    }], { actor, previous: snapshot.events.at(-1) });
    reduceEvent(state, events[0]);
    return { exitCode: 0, events, ready: readyGate(state, owner.id) };
  });
  return fightReady(root, result, result.ready === null ? [] : [result.ready], { actor, boss });
}
