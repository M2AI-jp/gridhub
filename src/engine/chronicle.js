// 積み上げ（CONTRACTS §40 のビュー・§42・§43.5）。すべて冒険の書から導く。
// 戦いの記録は、ロード（loaded）しても巻き戻らない（起きた戦いは起きた）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonical } from './canonical.js';
import { casesOf } from './cases.js';
import { containedFile } from './paths.js';
import { replay } from './state.js';

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
  const saves = [];
  const restores = [];
  let goal = null;
  let chapterStart = 0;
  let ending = null;

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
          if (stat.streak >= 2) {
            stat.strong = true;
            incidents.push({ seq, kind: 'strong', character });
            strongCase ??= { node: id, case: name };
          }
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
    }
  };

  const state = replay(root, events, { before, after });
  return { state, fights, people, firstTry, saves, restores, incidents, ending, nodeCases, bestiary };
}

/** 章のエンディングの文（§42.1）。記録が違えば、文も違う。技術の言葉を先に */
export function endingText(map, stats) {
  const names = map.characters.map(({ name }) => name);
  const party = names.length > 1 ? `${names.slice(0, -1).join('、')} と ${names.at(-1)}` : names[0];
  const goal = map.nodes[map.quest.goal];
  const lines = [];
  lines.push(`テスト ${stats.defeated}/${stats.tests} が通った。魔王の城 ${map.quest.goal}「${goal?.title ?? ''}」、陥落。`);
  lines.push(stats.fails === 0
    ? `${party} は、一度も倒れずにここまで来た。`
    : `${party} は ${stats.fails} 度倒れ、そのたびに町から立ち上がった。`);
  lines.push(stats.medals > 0
    ? `一発で抜けたダンジョンは ${stats.medals}。ちいさなメダルが、袋の中で鳴っている。`
    : '一発で抜けたダンジョンはなかった。それでも、出口はすべて越えた。');
  if (stats.strong > 0) {
    lines.push(`何度も負けた強敵を ${stats.strong} 体倒した。${stats.skills > 0 ? `その手ごたえは ${stats.skills} つの技になり、次の代へ渡る。` : 'その手ごたえは、まだ日誌に書かれていない。'}`);
  }
  if (stats.revived > 0) lines.push(`倒したはずのテストが ${stats.revived} 度よみがえった。気づいて、もう一度倒した。`);
  if (stats.treasures > 0) lines.push(`判定のほころびを見つけて、宝箱を ${stats.treasures} つ開けた。`);
  if (stats.traps > 0) lines.push(`封印に手をかけた跡が ${stats.traps} つ。冒険の書は、それも覚えている。`);
  lines.push(stats.sorties > 0
    ? `出撃 ${stats.sorties} 回。代は替わっても、日誌と技は受け継がれた。`
    : 'この章は、出撃なしで歩ききった。');
  lines.push(`――『${map.quest.title}』、ひとつの章が幕を閉じる。次のページは、まだ白い。`);
  return lines.join('\n');
}
