import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical, sha256 } from './canonical.js';
import { MasumeError } from './errors.js';
import { findJumon, headOf } from './jumon.js';
import { readMapFile, validateMap } from './map.js';
import { containedFile, logFile } from './paths.js';
import { saveTerritory } from './save.js';
import { gateMembers, isSealed, replay, sealFiles } from './state.js';
import {
  appendEventsLocked, defaultActor, inspectLog, requireHealthy, withLock, writeDurable,
} from './store.js';

function collectSeals(root, map, nodeIds, { skipMissing = () => false } = {}) {
  const specifications = [];
  for (const node of nodeIds) {
    if (!Object.hasOwn(map.nodes, node)) {
      throw new MasumeError('E_UNKNOWN', `マスが見つかりません: ${node}`);
    }
    const paths = sealFiles(map.nodes[node]);
    if (paths.length === 0) continue;
    const entries = [];
    let missing = false;
    for (const relative of paths) {
      const file = containedFile(root, relative);
      try {
        if (!file) throw new MasumeError('E_SEAL_MISSING', `封印するファイルの場所が正しくありません: ${relative}`);
        entries.push([relative, sha256(readFileSync(file))]);
      } catch (error) {
        if (skipMissing(node) && ['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) {
          missing = true;
          break;
        }
        throw new MasumeError('E_SEAL_MISSING', `封印するファイルを読めません: ${relative}`);
      }
    }
    if (!missing) specifications.push({ type: 'sealed', data: { node, files: Object.fromEntries(entries) } });
  }
  return specifications;
}

export function newGame(root, mapPath, { actor = defaultActor(), force = false } = {}) {
  root = resolve(root);
  const map = readMapFile(mapPath);
  const validation = validateMap(map);
  if (!validation.ok) {
    throw new MasumeError('E_INVALID_MAP', `地図が不正です\n${validation.errors
      .map(({ code, path, message }) => `[${code}] ${path}: ${message}`).join('\n')}`, 1);
  }
  const directory = resolve(root, '.masume');
  if (existsSync(directory) && !force) {
    throw new MasumeError('E_EXISTS', '冒険の書はすでにあります。作り直す場合は --force を指定してください');
  }
  // 読めない封印ファイルが原因で、中途半端な初期化・既存データの削除を起こさない。
  const seals = collectSeals(root, map, Object.keys(map.nodes), { skipMissing: () => true });
  mkdirSync(root, { recursive: true });
  try {
    mkdirSync(directory);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    if (!force) throw new MasumeError('E_EXISTS', '冒険の書はすでにあります');
  }
  return withLock(root, actor, () => {
    if (existsSync(logFile(root))) requireHealthy(inspectLog(root));
    if (force) {
      // 同期先の issue との対応は、冒険の書を作り直しても引き継ぐ。
      for (const entry of readdirSync(directory)) {
        if (!['lock', 'linear.json', 'jira.json'].includes(entry)) {
          rmSync(resolve(directory, entry), { recursive: true, force: true });
        }
      }
    }
    mkdirSync(resolve(directory, 'maps'), { recursive: true });
    mkdirSync(resolve(directory, 'outputs'), { recursive: true });
    const mapFile = 'maps/0001.json';
    writeDurable(resolve(directory, mapFile), canonical(map) + '\n');
    const events = appendEventsLocked(root, [
      {
        type: 'genesis',
        data: { masume: 1, rules: 1, quest_id: map.quest.id, version: 1, map_file: mapFile, map_hash: sha256(canonical(map)) },
      },
      ...seals,
    ], { actor });
    // Git でセーブする冒険は、ふりだしで全員の縄張りをセーブする（§43.3）。
    if (map.quest.save === 'git') {
      events.push(...appendEventsLocked(root, [{
        type: 'saved', data: saveTerritory(root, map, map.characters.map(({ id }) => id), null),
      }], { actor, previous: events.at(-1) }));
    }
    return { head: headOf(events) };
  });
}

export function seal(root, nodeIds, { actor = defaultActor() } = {}) {
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const map = state.map;
    const ids = nodeIds === 'all'
      ? Object.keys(map.nodes).filter((id) => sealFiles(map.nodes[id]).length > 0)
      : [...new Set(nodeIds)];
    // --all は材料がそろわないマスを保留する。個別指定なら全件の追記を中止する。
    const specifications = collectSeals(root, map, ids, {
      skipMissing: () => nodeIds === 'all',
    });
    const events = appendEventsLocked(root, specifications, { actor, previous: snapshot.events.at(-1) });
    const sealed = new Set(events.map(({ data }) => data.node));
    return { events, pending: nodeIds === 'all' ? ids.filter((id) => !sealed.has(id)) : [] };
  });
}

export function writeNote(root, character, text, { actor = defaultActor() } = {}) {
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const { map } = replay(root, snapshot.events);
    if (!map.characters.some((entry) => entry.id === character)) {
      throw new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${character}`);
    }
    return appendEventsLocked(root, [{ type: 'note', data: { character, text } }],
      { actor, previous: snapshot.events.at(-1) })[0];
  });
}

function requireSameHistory(state, map) {
  const reject = (message) => { throw new MasumeError('E_AMEND_HISTORY', message, 1); };
  if (map.quest.id !== state.map.quest.id) reject('冒険の ID は変更できません');
  const editable = new Set(['title', 'detail', 'labels', 'estimate']);
  const rulesOf = (node) => Object.fromEntries(Object.entries(node).filter(([key]) => !editable.has(key)));
  for (const character of state.map.characters) {
    const next = map.characters.find(({ id }) => id === character.id);
    if (!next) reject(`既存のキャラクターは削除できません: ${character.id}`);
    const passed = character.path.slice(0, state.characters[character.id].pos);
    for (const [index, id] of passed.entries()) {
      if (next.path[index] !== id) reject(`通過済みの道は変更できません: ${character.id} / ${id}`);
      if (!Object.hasOwn(map.nodes, id)
        || canonical(rulesOf(map.nodes[id])) !== canonical(rulesOf(state.map.nodes[id]))) {
        reject(`通過済みのマスの規則は変更できません: ${id}`);
      }
    }
  }
  for (const [id, node] of Object.entries(state.map.nodes)) {
    if (node.type !== 'gate' || !state.nodes[id].cleared) continue;
    const previous = gateMembers(state, id);
    const next = new Set(map.characters.filter(({ path }) => path.includes(id)).map(({ id }) => id));
    if (previous.length !== next.size || previous.some((member) => !next.has(member))) {
      reject(`突破済みのゲートのメンバーは変更できません: ${id}`);
    }
  }
}

export function amend(root, mapPath, { actor = defaultActor() } = {}) {
  root = resolve(root);
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const map = readMapFile(mapPath);
    const validation = validateMap(map);
    if (!validation.ok) {
      throw new MasumeError('E_INVALID_MAP', `地図が不正です\n${validation.errors
        .map(({ code, path, message }) => `[${code}] ${path}: ${message}`).join('\n')}`, 1);
    }
    const state = replay(root, snapshot.events);
    requireSameHistory(state, map);
    const ids = Object.keys(map.nodes).filter((id) => !isSealed(map.nodes[id], state.nodes[id]?.files));
    const seals = collectSeals(root, map, ids, { skipMissing: () => true });
    // ロードで旧版へ戻っても、過去のイベントが参照する地図は上書きしない。
    let version = snapshot.events.reduce((latest, event) =>
      ['genesis', 'amended'].includes(event.type) ? Math.max(latest, event.data.version) : latest, 0) + 1;
    const directory = resolve(root, '.masume');
    const mapName = () => `maps/${String(version).padStart(4, '0')}.json`;
    while (existsSync(resolve(directory, mapName()))) version++;
    const mapFile = mapName();
    mkdirSync(resolve(directory, 'maps'), { recursive: true });
    writeDurable(resolve(directory, mapFile), canonical(map) + '\n');
    const events = appendEventsLocked(root, [
      { type: 'amended', data: { version, map_file: mapFile, map_hash: sha256(canonical(map)) } },
      ...seals,
    ], { actor, previous: snapshot.events.at(-1) });
    return { version, events, head: headOf(events) };
  });
}

export function load(root, seqOrJumon, { actor = defaultActor() } = {}) {
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const previous = snapshot.events.at(-1);
    const seq = typeof seqOrJumon === 'number' ? seqOrJumon
      : typeof seqOrJumon !== 'string' ? null
        : /^\d+$/u.test(seqOrJumon) ? Number(seqOrJumon)
          : findJumon(snapshot.events, seqOrJumon)?.seq;
    if (!Number.isSafeInteger(seq) || seq < 0 || seq >= previous.seq) {
      throw new MasumeError('E_LOAD', 'ロード先は現在より前の seq を指定してください');
    }
    const events = appendEventsLocked(root, [{ type: 'loaded', data: { to_seq: seq } }],
      { actor, previous });
    return { to_seq: seq, events, head: headOf(events) };
  });
}
