// 積み上げ（CONTRACTS §40 のビュー・§42・§43.5）。すべて冒険の書から導く。
// 戦いの記録は、ロード（loaded）しても巻き戻らない（起きた戦いは起きた）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical } from './canonical.js';
import { casesOf } from './cases.js';
import { marginTracker } from './margins.js';
import { containedFile } from './paths.js';
import { replay } from './state.js';
import { t } from './words.js';

const JUDGED = new Set(['check_passed', 'check_failed', 'gate_cleared', 'gate_failed', 'stepped']);
// 第10章までのイベント（data.cases が無い）の読み直しは、出力のハッシュごとに覚えておく。
const outputCache = new Map();

function ranOf(event) {
  const { type, data } = event;
  if (type === 'stepped') return [data.node];
  if (type === 'gate_cleared' || type === 'gate_failed') return [data.gate];
  return Array.isArray(data.ran) && data.ran.length ? data.ran : [data.failed ?? data.node];
}

function casesFromOutput(root, event, map) {
  const ran = ranOf(event);
  const key = `${event.data.output_hash}:${ran.join(',')}:${canonical(ran.map((id) => map.nodes[id]?.check?.cases ?? null))}`;
  if (outputCache.has(key)) return outputCache.get(key);
  let cases = {};
  try {
    const file = containedFile(resolve(root, '.masume'), event.data.output);
    if (file) cases = casesOf(readFileSync(file, 'utf8'), ran, map);
  } catch {
    cases = {};
  }
  if (outputCache.size > 2000) outputCache.clear();
  outputCache.set(key, cases);
  return cases;
}

const isCmdTask = (node) => node?.type === 'task' && node.check?.kind === 'cmd';

export function chronicle(root, events) {
  const fights = new Map(); // nodeId -> { order: [name], stats: Map(name -> stat) }
  const people = new Map(); // characterId -> 積み上げ
  const firstTry = new Map();
  const lastSealed = new Map();
  const incidents = []; // {seq, kind, character}
  const firsts = []; // はじめて倒したテスト {seq, node, case, character, strong, losses}（勇者の手帳のシール。§79）
  const cures = []; // 復活していたテストを倒し直した {seq, node, case, character}
  const goals = []; // 魔王の撃破（章のあがり）{seq, gate, stats}
  const saves = [];
  const restores = [];
  let goal = null;
  let chapterStart = 0;
  let ending = null;
  const margins = marginTracker(); // 余白のマス（§53）の出典

  const person = (id) => {
    if (!people.has(id)) {
      people.set(id, { revived: 0, strong: 0, treasures: 0, traps: 0, skills: [], pending: null });
    }
    return people.get(id);
  };
  const fight = (id) => {
    if (!fights.has(id)) fights.set(id, { order: [], stats: new Map() });
    return fights.get(id);
  };
  const nodeCases = (map, id) => {
    const record = fights.get(id);
    const names = map.nodes[id]?.check?.cases ?? record?.order ?? [];
    return names.map((name) => {
      const stat = record?.stats.get(name);
      return {
        name, ok: stat?.ok ?? null, losses: stat?.losses ?? 0, revived: stat?.revived ?? 0, strong: stat?.strong ?? false,
      };
    });
  };
  const bestiary = (map) => {
    const all = Object.keys(map.nodes).flatMap((id) => nodeCases(map, id));
    return {
      total: all.length,
      defeated: all.filter(({ ok }) => ok === true).length,
      revived: all.reduce((sum, { revived }) => sum + revived, 0),
      strong: all.filter(({ strong }) => strong).length,
    };
  };

  function fought(state, event) {
    const { data, seq } = event;
    const results = data.cases && typeof data.cases === 'object' ? data.cases : casesFromOutput(root, event, state.map);
    const character = data.character ?? null;
    let strongCase = null;
    for (const [id, list] of Object.entries(results)) {
      if (!Array.isArray(list)) continue;
      const record = fight(id);
      if (!state.map.nodes[id]?.check?.cases && list.length) record.order = list.map(({ name }) => name);
      for (const { name, ok } of list) {
        if (ok !== true && ok !== false) continue;
        if (!record.stats.has(name)) {
          record.stats.set(name, { ok: null, losses: 0, revived: 0, strong: false, passed: false, streak: 0 });
        }
        const stat = record.stats.get(name);
        if (ok === false) {
          stat.losses++;
          stat.streak++;
          if (stat.passed) {
            stat.revived++;
            incidents.push({ seq, kind: 'revived', character });
          }
        } else {
          const strong = stat.streak >= 2;
          if (strong) {
            stat.strong = true;
            incidents.push({ seq, kind: 'strong', character });
            strongCase ??= { node: id, case: name };
          }
          if (!stat.passed) firsts.push({ seq, node: id, case: name, character, strong, losses: stat.losses });
          else if (stat.ok === false) cures.push({ seq, node: id, case: name, character });
          stat.streak = 0;
          stat.passed = true;
        }
        stat.ok = ok;
      }
    }
    if (character && strongCase) person(character).pending = strongCase;
  }

  const before = (state, event) => {
    const { type, seq } = event;
    const data = event.data ?? {};
    margins.before(state);
    if (seq === 0) goal = state.map.quest.goal;
    if (JUDGED.has(type)) fought(state, event);
    switch (type) {
      case 'check_passed':
      case 'check_failed':
        if (isCmdTask(state.map.nodes[data.node]) && !firstTry.has(data.node)) {
          firstTry.set(data.node, type === 'check_passed');
          if (type === 'check_passed') incidents.push({ seq, kind: 'medal', character: data.character });
        }
        if (type === 'check_failed') incidents.push({ seq, kind: 'fail', character: data.character });
        break;
      case 'gate_failed':
        incidents.push({ seq, kind: 'fail', character: null });
        break;
      case 'seal_broken':
        if (data.character) {
          person(data.character).traps++;
          incidents.push({ seq, kind: 'trap', character: data.character });
        }
        break;
      case 'sealed': {
        const previous = lastSealed.get(data.node);
        if (previous !== undefined && previous !== canonical(data.files ?? {})) {
          for (const definition of state.map.characters) {
            const at = definition.path[state.characters[definition.id]?.pos];
            const status = state.characters[definition.id]?.status;
            if (at !== data.node || !['working', 'waiting'].includes(status)) continue;
            person(definition.id).treasures++;
            incidents.push({ seq, kind: 'treasure', character: definition.id });
          }
        }
        lastSealed.set(data.node, canonical(data.files ?? {}));
        break;
      }
      case 'note': {
        const someone = data.character && person(data.character);
        if (someone?.pending) {
          someone.skills.push({ seq, ts: event.ts, text: data.text, node: someone.pending.node, case: someone.pending.case });
          someone.pending = null;
          incidents.push({ seq, kind: 'skill', character: data.character });
        }
        break;
      }
      case 'sortie':
        if (data.character) {
          person(data.character).pending = null;
          incidents.push({ seq, kind: 'sortie', character: data.character });
        }
        break;
      case 'saved':
        saves.push(event);
        break;
      case 'restored':
        restores.push(event);
        break;
    }
  };

  const after = (state, event) => {
    const { type, seq } = event;
    const data = event.data ?? {};
    margins.after(state, event);
    if ((type === 'amended' || type === 'loaded') && state.map.quest.goal !== goal) {
      goal = state.map.quest.goal;
      chapterStart = seq;
    }
    if (type === 'gate_cleared' && data.gate === state.map.quest.goal) {
      const within = incidents.filter((incident) => incident.seq >= chapterStart && incident.seq <= seq);
      const count = (kind) => within.filter((incident) => incident.kind === kind).length;
      const book = bestiary(state.map);
      ending = {
        gate: data.gate,
        seq,
        stats: {
          tests: book.total, defeated: book.defeated, medals: count('medal'), strong: count('strong'),
          revived: count('revived'), treasures: count('treasure'), traps: count('trap'), skills: count('skill'),
          sorties: count('sortie'), fails: count('fail'),
        },
      };
      goals.push(ending);
    }
  };

  const state = replay(root, events, { before, after });
  return { state, fights, people, firstTry, saves, restores, incidents, firsts, cures, goals, ending, nodeCases, bestiary, margins };
}

/** 章のエンディングの文（§42.1）。記録が違えば、文も違う。技術の言葉を先に */
export function endingText(map, stats) {
  const names = map.characters.map(({ name }) => name);
  const party = names.length > 1 ? `${names.slice(0, -1).join('、')} と ${names.at(-1)}` : names[0];
  const goal = map.nodes[map.quest.goal];
  const lines = [];
  lines.push(t('ending.1', stats.defeated, stats.tests, map.quest.goal, goal?.title ?? ''));
  lines.push(stats.fails === 0
    ? t('ending.2.clean', party)
    : t('ending.2.fell', party, stats.fails));
  lines.push(stats.medals > 0
    ? t('ending.3.medals', stats.medals)
    : t('ending.3.none'));
  if (stats.strong > 0) {
    lines.push(t('ending.4', stats.strong, stats.skills));
  }
  if (stats.revived > 0) lines.push(t('ending.5', stats.revived));
  if (stats.treasures > 0) lines.push(t('ending.6', stats.treasures));
  if (stats.traps > 0) lines.push(t('ending.7', stats.traps));
  lines.push(stats.sorties > 0
    ? t('ending.8.sorties', stats.sorties)
    : t('ending.8.none'));
  lines.push(t('ending.9', map.quest.title));
  return lines.join('\n');
}
