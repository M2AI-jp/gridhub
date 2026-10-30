import { inspectLog } from './store.js';
import { sortieStatus } from './sortie.js';
import { chronicle, endingText } from './chronicle.js';
import { buildMargins } from './margins.js';
import { isSealed, nodeXp } from './state.js';
import { t } from './words.js';

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

/** 冒険の書の1行を、人の読める文に（盤面のログと `gridhub log` が使う）。map は characters（name）を引く地図 */
export function logEntry(event, map) {
  const data = event.data ?? {};
  const character = data.character ?? null;
  const node = data.gate ?? data.node ?? data.node_before ?? null;
  const name = map?.characters.find(({ id }) => id === character)?.name ?? character;
  let ok = null;
  let text;
  switch (event.type) {
    case 'genesis': text = t('log.genesis'); break;
    case 'sealed': text = t('log.sealed', node); break;
    case 'seal_broken':
      text = character === null ? t('log.seal_broken', node) : t('log.seal_broken.by', name, node);
      break;
    case 'check_passed':
      ok = true;
      text = t('log.check_passed', name, node);
      break;
    case 'check_failed':
      ok = false;
      text = t('log.check_failed', name, node, data.failed);
      break;
    case 'gate_cleared':
      ok = true;
      text = t('log.gate_cleared', node);
      break;
    case 'gate_failed': {
      ok = false;
      const blamed = data.blamed ?? [];
      const names = blamed.map((id) => map?.characters.find((c) => c.id === id)?.name ?? id);
      const all = (data.members ?? []).every((id) => blamed.includes(id));
      text = t('log.gate_failed', node, all, names.join('、'));
      break;
    }
    case 'stamped': {
      ok = true;
      const by = map?.characters.find(({ id }) => id === data.by)?.name ?? data.by;
      text = data.by === character ? t('log.stamped.self', name, node) : t('log.stamped.by', by, name, node);
      break;
    }
    case 'note': text = t('log.note', name, data.text); break;
    case 'amended': text = t('log.amended', data.version); break;
    case 'loaded': text = t('log.loaded', data.to_seq); break;
    case 'wish': text = t('log.wish', data.text); break;
    case 'sortie':
      text = t('log.sortie', name, `${data.agent}${data.model ? ` ${data.model}` : ''}`);
      break;
    case 'stepped': {
      ok = data.code === 0;
      const list = data.cases?.[data.node] ?? [];
      text = t('log.stepped', name, node, list.filter((c) => c.ok === true).length, list.length);
      break;
    }
    case 'saved': {
      const names = (data.characters ?? []).map((id) => map?.characters.find((c) => c.id === id)?.name ?? id);
      ok = Boolean(data.commit);
      text = data.commit
        ? t('log.saved', names.join('、'), data.node ?? t('start'), data.commit.slice(0, 7))
        : t('log.saved.failed', data.error ?? '不明');
      break;
    }
    case 'pushed':
      ok = data.ok === true;
      text = ok ? t('log.pushed', data.remote, data.branch, String(data.commit).slice(0, 7)) : t('log.pushed.failed', data.error ?? '不明');
      break;
    case 'restored':
      ok = !data.error;
      text = data.error
        ? t('log.restored.failed', name, data.error)
        : t('log.restored', name, String(data.commit).slice(0, 7), data.stash ? data.stash.slice(0, 7) : null);
      break;
    case 'returned':
      ok = data.advanced === true;
      text = t('log.returned', name, data.node_before, data.node_after ?? null, ok);
      break;
    default: text = t('log.other', event.type);
  }
  return {
    seq: event.seq, ts: event.ts, type: event.type, actor: event.actor,
    character, node, ok, text: text.replace(/[\r\n\u2028\u2029]+/gu, ' '),
  };
}

// snapshot は、呼ぶ側がもう inspectLog で読んであれば渡す（二度読まない）
export function buildView(root, snapshot = inspectLog(root)) {
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
      max_level: character.level >= 9, // §60: 最大は Lv9（RULEBOOK §4）。経験値は貯まり続けるが、字は「Lv9（最大）」
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
  const { margins, news } = map
    ? buildMargins({ map, state, events, tracker: chronicled.margins })
    : { margins: [], news: [] };
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
    margins,
    news,
    push: lastPushed(snapshot.events),
  };
}

/** いちばん新しい「町でセーブしたあとに GitHub へ送った結果」（§59.3） */
function lastPushed(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const { type, seq, data } = events[i];
    if (type !== 'pushed' || !data) continue;
    return {
      seq, node: data.node ?? null, ok: data.ok === true, commit: data.commit ?? null,
      remote: data.remote ?? null, branch: data.branch ?? null, error: data.ok === true ? null : (data.error ?? '不明'),
    };
  }
  return null;
}
