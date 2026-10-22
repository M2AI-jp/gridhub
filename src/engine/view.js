import { inspectLog } from './store.js';
import { sortieStatus } from './sortie.js';
import { chronicle, endingText } from './chronicle.js';
import { isSealed, nodeXp } from './state.js';

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
  const node = data.gate ?? data.node ?? data.node_before ?? null;
  const name = map?.characters.find(({ id }) => id === character)?.name ?? character;
  let ok = null;
  let text;
  switch (event.type) {
    case 'genesis': text = '冒険の書がひらかれた'; break;
    case 'sealed': text = `${node} の判定ファイルが封印された`; break;
    case 'seal_broken':
      text = character === null ? `${node} の封印が破れていた`
        : `${name} が ${node} の封印破りを見つけた`;
      break;
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
    case 'stamped': {
      ok = true;
      const by = map?.characters.find(({ id }) => id === data.by)?.name ?? data.by;
      text = data.by === character ? `${name} が ${node} にハンコを押した` : `${by} が ${name} の ${node} にハンコを押した`;
      break;
    }
    case 'note': text = `${name} の日誌: ${data.text}`; break;
    case 'amended': text = `地図が第${data.version}版に改訂された`; break;
    case 'loaded': text = `冒険の書の seq ${data.to_seq} の状態をロードした`; break;
    case 'wish': text = `願い: ${data.text}`; break;
    case 'sortie':
      text = `${name} が出撃した（${data.agent}${data.model ? ` ${data.model}` : ''}）`;
      break;
    case 'stepped': {
      ok = data.code === 0;
      const list = data.cases?.[data.node] ?? [];
      text = `${name} が ${node} を歩いた（テスト ${list.filter((c) => c.ok === true).length}/${list.length}）`;
      break;
    }
    case 'saved': {
      const names = (data.characters ?? []).map((id) => map?.characters.find((c) => c.id === id)?.name ?? id);
      ok = Boolean(data.commit);
      text = data.commit
        ? `${names.join('、')} が ${data.node ?? 'ふりだし'} でセーブした（commit ${data.commit.slice(0, 7)}）`
        : `セーブできなかった: ${data.error ?? '不明'}`;
      break;
    }
    case 'restored':
      ok = !data.error;
      text = data.error
        ? `${name} の縄張りを戻せなかった: ${data.error}`
        : `${name} の縄張りを commit ${String(data.commit).slice(0, 7)} に戻した（墓: ${data.stash ? `stash ${data.stash.slice(0, 7)}` : 'なし'}）`;
      break;
    case 'returned':
      ok = data.advanced === true;
      text = `${name} が帰還した（${data.node_before} → ${data.node_after ?? 'あがり'}、${ok ? '進んだ' : '進めなかった'}）`;
      break;
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
  const chronicled = events[0]?.type === 'genesis' ? chronicle(root, events) : null;
  const state = chronicled?.state ?? null;
  const map = state?.map;
  const count = (kind, id) => chronicled.incidents.filter((i) => i.kind === kind && i.character === id).length;
  const lastSaved = (predicate) => {
    const found = chronicled.saves.filter((e) => e.data.commit && predicate(e.data)).at(-1);
    return found ?? null;
  };
  const sorties = sortieStatus(events);
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
      sortie: sorties.current[definition.id] ?? null,
      sorties: sorties.counts[definition.id] ?? 0,
      generation: Math.max(1, sorties.counts[definition.id] ?? 0),
      square: null,
      revived: count('revived', definition.id),
      strong: count('strong', definition.id),
      skills: [...(chronicled.people.get(definition.id)?.skills ?? [])].reverse(),
      medals: definition.path.filter((id) => chronicled.firstTry.get(id) === true).length,
      treasures: chronicled.people.get(definition.id)?.treasures ?? 0,
      traps: chronicled.people.get(definition.id)?.traps ?? 0,
      save: (() => {
        const found = lastSaved((data) => (data.characters ?? []).includes(definition.id));
        return found && { seq: found.seq, node: found.data.node, commit: found.data.commit };
      })(),
      grave: (() => {
        const found = chronicled.restores.filter((e) => e.data.character === definition.id && e.data.stash).at(-1);
        return found ? { seq: found.seq, node: found.data.node, commit: found.data.commit, stash: found.data.stash } : null;
      })(),
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
      cases: chronicled.nodeCases(map, id),
      first_try: definition.type === 'task' && definition.check?.kind === 'cmd'
        ? chronicled.firstTry.get(id) ?? null : null,
      save: (() => {
        const found = lastSaved((data) => data.node === id);
        return found && { seq: found.seq, commit: found.data.commit };
      })(),
    };
    node.tests = { pass: node.cases.filter(({ ok }) => ok === true).length, total: node.cases.length };
    node.state = nodeState(node, progress, members, byId);
    return [id, node];
  }));
  for (const character of characters) {
    const at = character.at && nodes[character.at];
    if (at && at.type === 'task' && at.check?.kind === 'cmd' && character.status === 'working') {
      const index = at.cases.findIndex(({ ok }) => ok !== true);
      character.square = index === -1 ? at.cases.length : index;
    }
  }
  const finished = map ? state.nodes[map.quest.goal].cleared : false;
  const ending = finished && chronicled.ending && chronicled.ending.gate === map.quest.goal
    ? { seq: chronicled.ending.seq, text: endingText(map, chronicled.ending.stats), stats: chronicled.ending.stats }
    : null;
  return {
    masume: 1,
    quest: map?.quest ?? null,
    map_version: state?.version ?? null,
    characters,
    nodes,
    log: snapshot.events.slice(-200).map((event) => logEntry(event, map)),
    head: snapshot.head,
    integrity: { ok: snapshot.ok, errors: snapshot.errors },
    finished,
    bestiary: map ? chronicled.bestiary(map) : { total: 0, defeated: 0, revived: 0, strong: 0 },
    ending,
  };
}
