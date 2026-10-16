import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { sha256 } from './canonical.js';
import { MasumeError } from './errors.js';
import { replay } from './state.js';
import {
  appendEventsLocked, inspectLog, requireHealthy, withLock, writeDurable,
} from './store.js';

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const optionalText = (value, name) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new MasumeError('E_USAGE', `${name} は文字列で指定してください`);
  return value === '' ? null : value;
};

// 出撃中 = その sortie の seq を data.sortie に持つ returned がまだ無い。盤面の状態は変えないので、
// 再生ではなくイベント列から導く。未帰還が複数あれば、いちばん新しい出撃を採る。
export function sortieStatus(events) {
  const returned = new Set(events.filter(({ type }) => type === 'returned').map(({ data }) => data?.sortie));
  const counts = Object.create(null);
  const current = Object.create(null);
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type !== 'sortie' || typeof data.character !== 'string') continue;
    counts[data.character] = (counts[data.character] ?? 0) + 1;
    if (returned.has(event.seq)) continue;
    current[data.character] = {
      seq: event.seq, agent: data.agent ?? null, model: data.model ?? null,
      node: data.node ?? null, since: event.ts,
    };
  }
  return { current, counts };
}

function findCharacter(state, characterId) {
  const definition = state.map.characters.find(({ id }) => id === characterId);
  if (!definition) throw new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${characterId}`);
  return definition;
}

export function recordSortie(root, characterId, { actor = 'party', agent, model = null } = {}) {
  root = resolve(root);
  if (!isText(agent)) throw new MasumeError('E_USAGE', '--agent にエージェントの名前を指定してください');
  const modelName = optionalText(model, 'model');
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const state = replay(root, snapshot.events);
    const definition = findCharacter(state, characterId);
    if (definition.kind === 'human') {
      throw new MasumeError('E_USAGE', `${definition.name} は人間なので出撃できません`);
    }
    const character = state.characters[characterId];
    if (character.status === 'done') {
      throw new MasumeError('E_DONE', `${definition.name} はもうあがっています`);
    }
    const busy = sortieStatus(snapshot.events).current[characterId];
    if (busy) {
      throw new MasumeError('E_BUSY', `${definition.name} はすでに出撃中です（seq ${busy.seq}）`);
    }
    return appendEventsLocked(root, [{
      type: 'sortie',
      data: { character: characterId, node: definition.path[character.pos], agent, model: modelName },
    }], { actor, previous: snapshot.events.at(-1) })[0];
  });
}

export function recordReturn(root, characterId, { actor = 'party', sortie, code, log = '' } = {}) {
  root = resolve(root);
  if (!Number.isSafeInteger(sortie) || sortie < 0) {
    throw new MasumeError('E_USAGE', '--sortie には出撃イベントの seq（0以上の整数）を指定してください');
  }
  if (!Number.isSafeInteger(code)) {
    throw new MasumeError('E_USAGE', '--code には終了コード（整数）を指定してください');
  }
  if (typeof log !== 'string' && !(log instanceof Uint8Array)) {
    throw new MasumeError('E_USAGE', 'log は文字列かバイト列で指定してください');
  }
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    const { events } = snapshot;
    const state = replay(root, events);
    const definition = findCharacter(state, characterId);
    const start = events[sortie];
    if (!start || start.type !== 'sortie' || start.data?.character !== characterId) {
      throw new MasumeError('E_USAGE', `${characterId} の出撃 seq ${sortie} は見つかりません`);
    }
    if (events.some((event) => event.type === 'returned' && event.data?.sortie === sortie)) {
      throw new MasumeError('E_USAGE', `出撃 seq ${sortie} はもう帰還しています`);
    }
    // 出撃した時点の位置は、その seq までを再生して導く。
    const then = replay(root, events.slice(0, sortie + 1)).characters[characterId];
    const now = state.characters[characterId];
    const output = `outputs/sortie-${String(sortie).padStart(6, '0')}.log`;
    const bytes = typeof log === 'string' ? Buffer.from(log, 'utf8') : Buffer.from(log);
    mkdirSync(resolve(root, '.masume', 'outputs'), { recursive: true });
    // 先にファイルを書いてから追記する。repair 後の未参照ファイルは今回の出力で置き換える。
    writeDurable(resolve(root, '.masume', output), bytes, 'w');
    return appendEventsLocked(root, [{
      type: 'returned',
      data: {
        sortie, character: characterId,
        node_before: start.data.node ?? null,
        node_after: definition.path[now.pos] ?? null,
        advanced: now.pos > then.pos,
        code, output, output_hash: sha256(bytes),
      },
    }], { actor, previous: events.at(-1) })[0];
  });
}

export function recordWish(root, { actor = 'gm', text, gm = null, model = null } = {}) {
  root = resolve(root);
  if (!isText(text)) throw new MasumeError('E_USAGE', '願いの文章を指定してください');
  const gmName = optionalText(gm, 'gm');
  const modelName = optionalText(model, 'model');
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    return appendEventsLocked(root, [{ type: 'wish', data: { text, gm: gmName, model: modelName } }],
      { actor, previous: snapshot.events.at(-1) })[0];
  });
}
