import { inspectLog } from './store.js';
import { isSealed, nodeXp, replay } from './state.js';

function nodeState(node, progress, members, characters) {
  if (progress.cleared) return 'cleared';
  if (node.type !== 'gate') {
    if (progress.stale) return 'stale';
    if (members.some((character) => characters[character].at === node.id)) return 'current';
  } else {
    const waiting = members.filter((character) => characters[character].at === node.id
      && characters[character].status === 'waiting').length;
    if (waiting === members.length && waiting > 0) return 'ready';
    if (waiting > 0) return 'waiting';
  }
  if (members.some((id) => {
    const character = characters[id];
    const distance = character.path.indexOf(node.id) - character.pos;
    return distance > 0 && distance <= character.vision;
  })) return 'open';
  return 'fog';
}

function logEntry(event, map) {
  const data = event.data ?? {};
  const character = data.character ?? null;
  const node = data.gate ?? data.node ?? null;
  const name = map?.characters.find(({ id }) => id === character)?.name ?? character;
  let ok = null;
  let text;
  switch (event.type) {
    case 'genesis': text = '冒険の書がひらかれた'; break;
    case 'sealed': text = `${node} の判定ファイルが封印された`; break;
    case 'seal_broken': text = `${name} が ${node} の封印破りを見つけた`; break;
    case 'check_passed':
      ok = true;
      text = `${name} が ${node} の判定に成功した`;
      break;
    case 'check_failed':
      ok = false;
      text = `${name} が ${node} を判定し、${data.failed} で失敗した`;
      break;
    case 'gate_cleared':
      ok = true;
      text = `${node} の結合ゲート突破。仲間が解散した`;
      break;
    case 'gate_failed': {
      ok = false;
      const blamed = data.blamed ?? [];
      const names = blamed.map((id) => map?.characters.find((c) => c.id === id)?.name ?? id);
      const all = (data.members ?? []).every((id) => blamed.includes(id));
      text = `${node} のボス戦で${all ? '全滅' : '差し戻し'}: ${names.join('、')}`;
      break;
    }
    case 'stamped':
      ok = true;
      text = `${data.by} が ${name} の ${node} にハンコを押した`;
      break;
    case 'note': text = `${name} の日誌: ${data.text}`; break;
    case 'amended': text = `地図が第${data.version}版に改訂された`; break;
    case 'loaded': text = `冒険の書の seq ${data.to_seq} の状態をロードした`; break;
    default: text = `イベントが記録された（${event.type}）`;
  }
  return {
    seq: event.seq, ts: event.ts, type: event.type, actor: event.actor,
    character, node, ok, text: text.replace(/[\r\n\u2028\u2029]+/gu, ' '),
  };
}

export function buildView(root) {
  const snapshot = inspectLog(root);
  // 呪いがある場合、確かめられた先頭区間だけを再生して API に返す。
  // CLI の status はこの integrity を見て E_CURSED にする。
  const events = snapshot.ok ? snapshot.events
    : snapshot.records.slice(0, snapshot.errors[0].seq).map(({ event }) => event);
  const state = replay(root, events);
  const map = state?.map;
  const characters = map?.characters.map((definition) => {
    const character = state.characters[definition.id];
    return {
      ...definition,
      pos: character.pos,
      at: definition.path[character.pos] ?? null,
      level: character.level,
      xp: character.xp,
      xp_next: character.level + 1,
      vision: Math.min(character.level - 1, 4),
      status: character.status,
      checkpoint: definition.path[character.checkpoint] ?? null,
      clears: character.clears,
      fails: character.fails,
      last_note: character.lastNote,
    };
  }) ?? [];
  const byId = Object.fromEntries(characters.map((character) => [character.id, character]));
  const nodes = Object.fromEntries(Object.entries(map?.nodes ?? {}).map(([id, definition]) => {
    const progress = state.nodes[id];
    const members = characters.filter(({ path }) => path.includes(id)).map((character) => character.id);
    const node = {
      ...definition,
      xp: nodeXp(definition),
      ...(definition.type === 'task' ? { rollback_to: definition.rollback_to ?? '@camp' } : {}),
      id,
      owner: definition.type === 'gate' ? null : members[0],
      members,
      sealed: isSealed(definition, progress.files),
      seal_broken: progress.brokenSeq !== null && progress.brokenSeq > (progress.sealedSeq ?? -1),
      clears: progress.clears,
      fails: progress.fails,
      last_seq: progress.lastSeq,
    };
    node.state = nodeState(node, progress, members, byId);
    return [id, node];
  }));
  return {
    masume: 1,
    quest: map?.quest ?? null,
    map_version: state?.version ?? null,
    characters,
    nodes,
    log: snapshot.events.slice(-200).map((event) => logEntry(event, map)),
    head: snapshot.head,
    integrity: { ok: snapshot.ok, errors: snapshot.errors },
    finished: map ? state.nodes[map.quest.goal].cleared : false,
  };
}
