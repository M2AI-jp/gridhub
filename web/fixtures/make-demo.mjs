// 見本の盤面（fixtures/demo-state.json, demo-script.json）をつくる。
// マスメ自身の地図（quests/masume.map.json）を、途中まで進んだ想定で並べる。
// 使い方: node web/fixtures/make-demo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const map = JSON.parse(readFileSync(join(here, '..', '..', 'quests', 'masume.map.json'), 'utf8'));
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ';
const jumonOf = (hex) => {
  const n = BigInt('0x' + hex.slice(0, 18));
  const s = Array.from({ length: 12 }, (_, i) => KANA[Number((n >> BigInt(66 - 6 * i)) & 63n)]).join('');
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
};

const XP_DEFAULT = { task: 1, gate: 3, camp: 0 };

/** 場面（各キャラの位置など）から CONTRACTS §5 のビューをつくる */
function build(scene, log) {
  const chars = map.characters.map((c) => {
    const s = scene.chars[c.id];
    const vision = Math.min(s.level - 1, 4);
    return {
      ...c,
      pos: s.pos,
      at: s.pos < c.path.length ? c.path[s.pos] : null,
      level: s.level,
      xp: s.xp,
      xp_next: s.level + 1,
      vision,
      status: s.pos >= c.path.length ? 'done' : map.nodes[c.path[s.pos]].type === 'gate' ? 'waiting' : 'working',
      checkpoint: s.checkpoint ?? null,
      clears: s.clears ?? s.pos,
      fails: s.fails ?? 0,
      last_note: s.note ?? null,
    };
  });
  const nodes = {};
  for (const [id, n] of Object.entries(map.nodes)) {
    const members = chars.filter((c) => c.path.includes(id)).map((c) => c.id);
    const owner = n.type === 'gate' ? null : members[0];
    let state;
    if (scene.cleared.includes(id)) state = 'cleared';
    else if (scene.stale.includes(id)) state = 'stale';
    else if (n.type === 'gate') {
      const waiting = chars.filter((c) => c.at === id);
      if (waiting.length === members.length) state = 'ready';
      else if (waiting.length) state = 'waiting';
      else state = chars.some((c) => c.path.includes(id) && c.path.indexOf(id) - c.pos <= c.vision && c.path.indexOf(id) > c.pos) ? 'open' : 'fog';
    } else {
      const c = chars.find((x) => x.id === owner);
      const i = c.path.indexOf(id);
      state = i === c.pos ? 'current' : i > c.pos && i - c.pos <= c.vision ? 'open' : 'fog';
    }
    nodes[id] = {
      ...n,
      xp: n.xp ?? XP_DEFAULT[n.type],
      ...(n.type === 'task' ? { rollback_to: n.rollback_to ?? '@camp' } : {}),
      id,
      owner,
      members,
      state,
      sealed: n.type === 'camp' || n.check?.kind === 'stamp' ? true : !(scene.unsealed || []).includes(id),
      seal_broken: (scene.broken || []).includes(id),
      clears: scene.cleared.includes(id) ? 1 : 0,
      fails: (scene.fails || {})[id] || 0,
      last_seq: null,
    };
  }
  const hash = createHash('sha256').update(JSON.stringify([scene, log.length])).digest('hex');
  return {
    masume: 1,
    quest: map.quest,
    map_version: 1,
    characters: chars,
    nodes,
    log: log.map((e, i) => ({ seq: i, ts: new Date(Date.UTC(2026, 9, 16, 1, 0) + i * 7 * 60000).toISOString(), actor: e.actor || 'gm', character: e.character || null, node: e.node || null, ok: e.ok ?? null, type: e.type, text: e.text })),
    head: { seq: log.length - 1, hash, jumon: jumonOf(hash) },
    integrity: { ok: true, errors: [] },
    finished: !!scene.finished,
  };
}

const log = [
  { type: 'genesis', text: '冒険の書がひらかれた: マスメ — マスメでマスメをつくる' },
  { type: 'sealed', node: 'E1', text: 'E1 の判定を封印した' },
  { type: 'check_passed', character: 'server', node: 'S1', ok: true, actor: 'server', text: '伝令 が S1「盤面を配る」の判定に成功！' },
  { type: 'check_passed', character: 'assets', node: 'A1', ok: true, actor: 'assets', text: '絵師 が A1「仲間の似顔絵を描く」の判定に成功！' },
  { type: 'check_passed', character: 'engine', node: 'E1', ok: true, actor: 'engine', text: '書記 が E1「冒険の書をひらく」の判定に成功！' },
  { type: 'check_passed', character: 'gmkit', node: 'M1', ok: true, actor: 'gmkit', text: '地図職人 が M1「ことづけの地図を描く」の判定に成功！' },
  { type: 'check_passed', character: 'board', node: 'B1', ok: true, actor: 'board', text: '賢者クロード が B1「方眼ノートに道を描く」の判定に成功！' },
  { type: 'check_failed', character: 'engine', node: 'E2', ok: false, actor: 'engine', text: '書記 が E2「判定をくだす」の判定に失敗… E1 で転倒、Lv2→1、E1 まで戻された' },
  { type: 'note', character: 'engine', actor: 'engine', text: '書記の日誌: 累積判定で E1 のロックが壊れていた。直してから再挑戦する' },
  { type: 'check_passed', character: 'engine', node: 'E1', ok: true, actor: 'engine', text: '書記 が E1 を再検証して突破（経験値なし）' },
  { type: 'check_passed', character: 'engine', node: 'E2', ok: true, actor: 'engine', text: '書記 が E2「判定をくだす」の判定に成功！ 宿屋「ふたつ星亭」で一休み' },
  { type: 'check_passed', character: 'server', node: 'S2', ok: true, actor: 'server', text: '伝令 が S2「早馬を走らせる」の判定に成功！ G1 で待機' },
  { type: 'check_failed', character: 'gmkit', node: 'M2', ok: false, actor: 'gmkit', text: '地図職人 が M2「はじめての冒険を用意する」の判定に失敗… M1 で転倒、Lv2→1、M1 まで戻された' },
  { type: 'seal_broken', character: 'assets', node: 'A2', ok: false, actor: 'assets', text: 'A2 の封印が破れている！（判定ファイルが書き換えられた）' },
];

const base = {
  chars: {
    board: { pos: 1, level: 2, xp: 0, clears: 1 },
    engine: { pos: 3, level: 2, xp: 0, checkpoint: 'C1', clears: 3, fails: 1, note: '累積判定で E1 のロックが壊れていた。直してから再挑戦する' },
    server: { pos: 2, level: 2, xp: 0, clears: 2 },
    gmkit: { pos: 0, level: 1, xp: 0, clears: 1, fails: 1 },
    assets: { pos: 1, level: 1, xp: 1, clears: 1 },
    player: { pos: 0, level: 1, xp: 0, clears: 0 },
  },
  cleared: ['B1', 'E1', 'E2', 'C1', 'S1', 'S2', 'A1'],
  stale: ['M1'],
  unsealed: ['M3', 'E4'],
  broken: ['A2'],
  fails: { E2: 0, E1: 1, M1: 1 },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const frames = [];
let scene = clone(base);
let L = clone(log);
frames.push(build(scene, L));

// 1) 書記が E3 を突破して G1 に到着
scene = clone(scene);
scene.chars.engine = { ...scene.chars.engine, pos: 4, xp: 1, clears: 4 };
scene.cleared.push('E3');
L = [...L, { type: 'check_passed', character: 'engine', node: 'E3', ok: true, actor: 'engine', text: '書記 が E3「仲間と合流する」の判定に成功！ G1 で待機' }];
frames.push(build(scene, L));

// 2) 地図職人が M1 を直して再検証
scene = clone(scene);
scene.chars.gmkit = { ...scene.chars.gmkit, pos: 1, clears: 2 };
scene.stale = scene.stale.filter((x) => x !== 'M1');
scene.cleared.push('M1');
L = [...L, { type: 'check_passed', character: 'gmkit', node: 'M1', ok: true, actor: 'gmkit', text: '地図職人 が M1 を再検証して突破（経験値なし）' }];
frames.push(build(scene, L));

// 3) 賢者クロードが B2 を突破 → G1 がそろってボス戦 → 撃破、解散
scene = clone(scene);
scene.chars.board = { ...scene.chars.board, pos: 3, level: 3, xp: 1, checkpoint: 'G1', clears: 3 };
scene.chars.engine = { ...scene.chars.engine, pos: 5, level: 3, xp: 1, checkpoint: 'G1', clears: 5 };
scene.chars.server = { ...scene.chars.server, pos: 3, level: 3, xp: 0, checkpoint: 'G1', clears: 3 };
scene.cleared.push('B2', 'G1');
L = [
  ...L,
  { type: 'check_passed', character: 'board', node: 'B2', ok: true, actor: 'board', text: '賢者クロード が B2「駒が動き冒険の書が流れる」の判定に成功！ G1 で待機' },
  { type: 'gate_cleared', node: 'G1', ok: true, text: '結合ゲート G1「結合: 盤面に冒険が映る」突破！ 賢者クロード・書記・伝令 が解散' },
];
frames.push(build(scene, L));

// 4) 絵師の A2 で封印が直され、判定成功
scene = clone(scene);
scene.broken = [];
scene.chars.assets = { ...scene.chars.assets, pos: 2, level: 2, xp: 0, clears: 2 };
scene.cleared.push('A2');
L = [
  ...L,
  { type: 'sealed', node: 'A2', text: 'A2 の判定を封印しなおした' },
  { type: 'check_passed', character: 'assets', node: 'A2', ok: true, actor: 'assets', text: '絵師 が A2「道具と標識を描く」の判定に成功！ あがりで待機' },
];
frames.push(build(scene, L));

writeFileSync(join(here, 'demo-state.json'), JSON.stringify(frames[0], null, 2) + '\n');
writeFileSync(join(here, 'demo-script.json'), JSON.stringify({ interval: 1800, frames }, null, 1) + '\n');
console.log(`demo-state.json と demo-script.json（${frames.length}場面）を書いた`);
