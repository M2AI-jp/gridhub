import { readMap } from './store.js';

export const nodeXp = (node) => node.xp ?? (node.type === 'camp' ? 0 : node.type === 'gate' ? 3 : 1);
export const sealFiles = (node) => node.check?.kind === 'cmd' ? [...new Set(node.check.seal ?? [])] : [];

export function gateMembers(state, gate) {
  return state.map.characters.filter(({ path }) => path.includes(gate)).map(({ id }) => id);
}

export function gateParty(state, gate) {
  const members = state.map.nodes[gate]?.type === 'gate' ? gateMembers(state, gate) : [];
  const waiting = members.filter((id) => {
    const character = state.characters[id];
    const path = state.map.characters.find((entry) => entry.id === id).path;
    return character.status === 'waiting' && path[character.pos] === gate;
  });
  const missing = members.filter((id) => !waiting.includes(id));
  return { members, waiting, missing, ready: members.length > 0 && missing.length === 0 };
}

export function readyGate(state, characterId) {
  const character = state.characters[characterId];
  if (!character || character.status !== 'waiting') return null;
  const path = state.map.characters.find(({ id }) => id === characterId).path;
  const gate = path[character.pos];
  return gateParty(state, gate).ready ? gate : null;
}

export function isSealed(node, files) {
  const paths = sealFiles(node);
  return paths.length === 0 || (files !== null && files !== undefined
    && Object.keys(files).length === paths.length && paths.every((path) => Object.hasOwn(files, path)));
}

function arrive(state, character, seq) {
  const path = state.map.characters.find(({ id }) => id === character.id).path;
  while (state.map.nodes[path[character.pos]]?.type === 'camp') {
    const node = state.nodes[path[character.pos]];
    node.cleared = true;
    node.stale = false;
    node.lastSeq = seq;
    character.checkpoint = character.pos++;
  }
  character.status = character.pos >= path.length ? 'done'
    : state.map.nodes[path[character.pos]].type === 'gate' ? 'waiting' : 'working';
}

function initialState(map, version, { arriveNow = true } = {}) {
  const state = {
    map,
    version,
    revision: 0,
    characters: Object.create(null),
    nodes: Object.create(null),
  };
  for (const id of Object.keys(map.nodes)) {
    state.nodes[id] = {
      cleared: false, stale: false, files: null, sealedSeq: null, brokenSeq: null,
      clears: 0, fails: 0, lastSeq: null,
    };
  }
  for (const { id } of map.characters) {
    const character = {
      id, pos: 0, level: 1, xp: 0, checkpoint: -1, status: 'working',
      clears: 0, fails: 0, epoch: 0, lastNote: null,
    };
    state.characters[id] = character;
    if (arriveNow) arrive(state, character, 0);
  }
  return state;
}

function amendState(state, map, version, seq) {
  const next = initialState(map, version, { arriveNow: false });
  next.revision = seq;
  for (const id of Object.keys(next.nodes)) {
    if (state.nodes[id]) next.nodes[id] = state.nodes[id];
  }
  for (const id of Object.keys(next.characters)) {
    if (state.characters[id]) {
      next.characters[id] = state.characters[id];
      next.characters[id].epoch++;
    }
    arrive(next, next.characters[id], seq);
  }
  return next;
}

function gainXp(character, xp) {
  character.xp += xp;
  while (character.level < 9 && character.xp >= character.level + 1) {
    character.xp -= character.level + 1;
    character.level++;
  }
}

function passTask(state, character, id, seq) {
  const node = state.nodes[id];
  if (!node.stale) gainXp(character, nodeXp(state.map.nodes[id]));
  node.cleared = true;
  node.stale = false;
  node.clears++;
  node.lastSeq = seq;
  character.clears++;
  character.pos++;
  character.epoch++;
  arrive(state, character, seq);
}

function rollbackCharacter(state, character, position, seq) {
  const path = state.map.characters.find(({ id }) => id === character.id).path;
  for (let i = position; i < character.pos; i++) {
    const node = state.nodes[path[i]];
    if (node.cleared) {
      node.cleared = false;
      node.stale = true;
      node.lastSeq = seq;
    }
  }
  character.level = Math.max(1, character.level - 1);
  character.xp = 0;
  character.fails++;
  character.pos = position;
  character.epoch++;
  arrive(state, character, seq);
}

function failTask(state, character, failed, seq) {
  const path = state.map.characters.find(({ id }) => id === character.id).path;
  const rollback = state.map.nodes[failed].rollback_to ?? '@camp';
  const target = rollback === '@camp' ? character.checkpoint + 1
    : path.indexOf(rollback === '@here' ? failed : rollback);
  state.nodes[failed].fails++;
  state.nodes[failed].lastSeq = seq;
  rollbackCharacter(state, character, Math.max(character.checkpoint + 1, target), seq);
}

function passGate(state, gate, members, seq) {
  const node = state.nodes[gate];
  node.cleared = true;
  node.stale = false;
  node.clears++;
  node.lastSeq = seq;
  for (const id of members) {
    const character = state.characters[id];
    gainXp(character, nodeXp(state.map.nodes[gate]));
    character.clears++;
    character.checkpoint = character.pos++;
    character.epoch++;
    arrive(state, character, seq);
  }
}

// 記録された事実だけを適用する。判定コマンドやファイルの現在の内容には依存しない。
export function reduceEvent(state, event) {
  const { type, data, seq } = event;
  const character = state.characters[data?.character];
  const node = state.nodes[data?.node];
  switch (type) {
    case 'sealed':
      if (node) {
        node.files = { ...data.files };
        node.sealedSeq = seq;
        node.lastSeq = seq;
      }
      break;
    case 'seal_broken':
      if (node) {
        node.brokenSeq = seq;
        node.lastSeq = seq;
      }
      break;
    case 'check_passed':
    case 'check_failed':
      if (character && node) {
        for (const id of [data.node, ...(data.ran ?? [])]) {
          if (state.nodes[id]) state.nodes[id].lastSeq = seq;
        }
        if (type === 'check_passed') passTask(state, character, data.node, seq);
        else failTask(state, character, data.failed, seq);
      }
      break;
    case 'stamped':
      if (character && node) passTask(state, character, data.node, seq);
      break;
    case 'gate_cleared':
    case 'gate_failed': {
      const gate = state.nodes[data.gate];
      if (!gate || state.map.nodes[data.gate].type !== 'gate') break;
      const members = gateMembers(state, data.gate);
      if (type === 'gate_cleared') {
        passGate(state, data.gate, members, seq);
      } else {
        const blamed = members.filter((id) => (data.blamed ?? []).includes(id));
        gate.fails++;
        gate.lastSeq = seq;
        for (const id of blamed.length ? blamed : members) {
          const member = state.characters[id];
          rollbackCharacter(state, member, member.checkpoint + 1, seq);
        }
      }
      break;
    }
    case 'note':
      if (character) {
        character.lastNote = data.text;
        character.epoch++;
      }
      break;
    // 知らないイベントは、前方互換のため無視する。
  }
  return state;
}

export function replay(root, events) {
  const genesis = events[0];
  if (!genesis || genesis.type !== 'genesis') return null;
  let state = initialState(readMap(root, genesis.data.map_file), genesis.data.version);
  // ロードの参照先だけを保存する。過去の loaded を含む時点も、再帰せず復元できる。
  const targets = new Set(events.filter(({ type }) => type === 'loaded').map(({ data }) => data.to_seq));
  const snapshots = new Map();
  for (const event of events) {
    if (event.type === 'amended') {
      state = amendState(state, readMap(root, event.data.map_file), event.data.version, event.seq);
    } else if (event.type === 'loaded') {
      state = structuredClone(snapshots.get(event.data.to_seq));
      // epoch まで過去に戻っても、実行中の判定は新しい盤面へ追記できない。
      state.revision = event.seq;
    } else {
      reduceEvent(state, event);
    }
    if (targets.has(event.seq)) snapshots.set(event.seq, structuredClone(state));
  }
  return state;
}
