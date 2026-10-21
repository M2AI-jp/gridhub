// 見本の盤面（fixtures/demo-state.json・demo-script.json・end-state.json）をつくる。第11章のビュー（CONTRACTS §5・§40〜§43）。
// GridHub 自身の冒険を、途中まで進んだ想定で並べる（地図はこのファイルの中。テスト1件 = 1マス）。
// 使い方: node web/fixtures/make-demo.mjs（そのあと make-demo2.mjs）
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const cmd = (id, cases, extra = {}) => ({
  kind: 'cmd',
  run: `node --test tests/e2e/${id}.test.mjs`,
  seal: [`tests/e2e/${id}.test.mjs`],
  ...(cases ? { cases } : {}),
  ...extra,
});

export const MAP = {
  masume: 1,
  quest: {
    id: 'GRID',
    title: 'GridHubをつくる',
    pitch: 'テストが通ったぶんだけ進む開発すごろく GridHub を、GridHub 自身のルールでつくる。',
    goal: 'GOAL',
    save: 'git',
  },
  characters: [
    { id: 'board', name: '賢者クロード', kind: 'agent', agent: 'claude', job: 'sage', color: 'blue', module: '盤面（web/board）', territory: ['web/index.html', 'web/board/**', 'web/fixtures/**'], path: ['B1', 'B2', 'G1', 'B3', 'B4', 'GOAL'] },
    { id: 'engine', name: '書記', kind: 'agent', agent: 'codex', job: 'scribe', color: 'yellow', module: 'ルールと冒険の書（src/engine）', territory: ['src/engine/**'], path: ['E1', 'E2', 'C1', 'E3', 'G1', 'E4', 'G2', 'E5', 'GOAL'] },
    { id: 'server', name: '伝令', kind: 'agent', agent: 'codex', job: 'herald', color: 'green', module: 'HTTP と SSE（src/server）', territory: ['src/server/**'], path: ['S1', 'S2', 'G1', 'C2', 'S3', 'S4', 'GOAL'] },
    { id: 'gmkit', name: '地図職人', kind: 'agent', agent: 'claude', job: 'cartographer', color: 'orange', module: '地図と同期（src/linear）', territory: ['src/linear/**'], path: ['M1', 'M2', 'G2', 'M3', 'GOAL'] },
    { id: 'assets', name: '絵師', kind: 'agent', agent: 'claude', job: 'painter', color: 'pink', module: '絵（web/assets）', territory: ['web/assets/**'], path: ['A1', 'A2', 'C3', 'A3', 'GOAL'] },
    { id: 'player', name: '勇者（あなた）', kind: 'human', agent: 'human', job: 'hero', color: 'purple', module: '人間の判断', path: ['H1', 'GOAL'] },
  ],
  nodes: {
    B1: { type: 'task', title: 'svg#board に方眼ノートを描く', check: cmd('B1', ['ページは 36×51 目', '方眼はページの中だけ', 'No. と Date を刷る']) },
    B2: { type: 'task', title: '駒が1マスずつ歩く', check: cmd('B2', ['square のマスに立つ', '間のマスを1つずつ踏む', 'walks に steps を足す', '動きを減らす設定では跳ぶ']) },
    B3: { type: 'task', title: '見開きをめくる #page-next', check: cmd('B3', ['見開きは2ページ', '#page-no は 1–2 / N', '.page-flip が <use> で回る']) },
    B4: { type: 'task', title: 'エンディング #ending を出す', check: cmd('B4', ['ending.text を出す', '#ending-close で閉じる']) },
    E1: { type: 'task', title: 'log.jsonl に genesis を書く', check: cmd('E1', ['genesis が1行', 'hash が sha256', 'じゅもんは12字']) },
    E2: { type: 'task', title: 'gridhub check で判定をくだす', detail: '宣言判定: 封印を確かめ、町から今のマスまでを累積で走らせる。通れば前進、落ちれば Lv−1 で町から。', check: cmd('E2', ['封印が無ければ E_UNSEALED', '通れば pos+1 と xp', '落ちれば Lv−1 で町へ', 'outputs/ に出力を残す']) },
    C1: { type: 'camp', title: '宿屋「ふたつ星亭」' },
    E3: { type: 'task', title: 'gridhub step で1件ずつ歩く', check: cmd('E3', ['✔ と ✖ を読む', 'TAP の ok / not ok', 'cases と名前で結ぶ', 'stepped を記録する', '位置もレベルも変えない']) },
    E4: { type: 'task', title: 'saved で町に Git セーブ', check: cmd('E4', ['縄張りだけコミット', 'index に触れない', '負けたら stash に墓']) },
    E5: { type: 'task', title: 'ending の文をつくる', check: cmd('E5', ['テスト 42/42 で始まる', '強敵の数で文が変わる']) },
    S1: { type: 'task', title: 'GET /api/state でビューを返す', check: cmd('S1', ['200 と JSON', 'E_NO_GAME なら 404']) },
    S2: { type: 'task', title: 'GET /api/stream で change を送る', check: cmd('S2', ['hello を送る', '書かれたら change', '切れても漏れない']) },
    C2: { type: 'camp', title: '港町の宿「しおかぜ」' },
    S3: { type: 'task', title: 'POST /api/stamp と /api/battle', check: cmd('S3', ['X-Masume が無ければ 403', 'stamp を記録する', 'battle で結合を走らせる']) },
    S4: { type: 'task', title: 'POST /api/sortie に tactic', check: cmd('S4', ['careful / balanced / bold', 'ほかの値は 400', '省略なら何も足さない']) },
    M1: { type: 'task', title: 'quest.map.json を検証する', check: cmd('M1', ['必須の項目が無ければ E_FORMAT', 'path のマスが無ければ E_REF', 'gate の members を補う']) },
    M2: { type: 'task', title: 'check.cases を地図に書く', check: cmd('M2', ['cases は 1〜50 件', '名前の重複は E_CHECK', 'stamp には書けない']) },
    M3: { type: 'task', title: 'Linear に - [x] で同期', check: cmd('M3', null) },
    A1: { type: 'task', title: '駒の絵 sprites 12枚', check: cmd('A1', ['12枚そろう', '6000 バイト以下']) },
    A2: { type: 'task', title: 'モンスターの絵 8枚', check: cmd('A2', ['8枚そろう', 'var(--monster) で塗れる', '8枚すべて違う絵']) },
    C3: { type: 'camp', title: 'アトリエの村' },
    A3: { type: 'task', title: 'ロゴ GridHub を描く', check: cmd('A3', ['方眼に合う', 'GridHub と読める']) },
    H1: { type: 'task', title: '盤面で遊んでハンコを押す', check: { kind: 'stamp', by: 'player' } },
    G1: { type: 'gate', title: '結合: 冒険が盤面に映る', check: cmd('G1', ['/api/state の駒が盤面に立つ', 'step で駒が1マス進む', 'SSE で描き直す']) },
    G2: { type: 'gate', title: '結合: 地図の cases で歩ける', check: cmd('G2', ['cases のマスが並ぶ', 'step の結果が図鑑に入る']) },
    GOAL: { type: 'gate', title: 'あがり: GridHub で GridHub をつくる', check: cmd('GOAL', ['全部の判定が通る', '冒険の書は正常', 'README は GridHub']) },
  },
};

// ---- ビューを組み立てる ----
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ';
const jumonOf = (hex) => {
  const n = BigInt('0x' + hex.slice(0, 18));
  const s = Array.from({ length: 12 }, (_, i) => KANA[Number((n >> BigInt(66 - 6 * i)) & 63n)]).join('');
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
};
const sha = (s) => createHash('sha1').update(String(s)).digest('hex');
const XP_DEFAULT = { task: 1, gate: 3, camp: 0 };
const T0 = Date.UTC(2026, 9, 19, 0, 30);

/**
 * テストの結果の書き方（1字が1件）:
 *  o 通った / x 落ちた / - まだ / R 復活（通ったあとで落ちたまま）/ S 強敵を倒した（2回落ちてから通った）
 *  X 2回以上落ちている / r 復活したあと、また通った
 */
function casesOf(n, code, ranCases) {
  const names = n.check?.cases || ranCases || [];
  return names.map((name, i) => {
    const c = (code || '').charAt(i) || '-';
    const base = { name, ok: null, losses: 0, revived: 0, strong: false };
    if (c === 'o') return { ...base, ok: true };
    if (c === 'x') return { ...base, ok: false, losses: 1 };
    if (c === 'X') return { ...base, ok: false, losses: 2 };
    if (c === 'R') return { ...base, ok: false, losses: 1, revived: 1 };
    if (c === 'r') return { ...base, ok: true, losses: 1, revived: 1 };
    if (c === 'S') return { ...base, ok: true, losses: 2, strong: true };
    return base;
  });
}

function build(scene, log) {
  const chars = MAP.characters.map((c) => {
    const s = scene.chars[c.id];
    const vision = Math.min(s.level - 1, 4);
    const at = s.pos < c.path.length ? c.path[s.pos] : null;
    return {
      ...c,
      pos: s.pos,
      at,
      level: s.level,
      xp: s.xp,
      xp_next: s.level + 1,
      vision,
      status: s.pos >= c.path.length ? 'done' : MAP.nodes[c.path[s.pos]].type === 'gate' ? 'waiting' : 'working',
      checkpoint: s.checkpoint ?? null,
      clears: s.clears ?? s.pos,
      fails: s.fails ?? 0,
      last_note: s.note ?? null,
      generation: s.gen ?? 1,
      revived: s.revived ?? 0,
      strong: s.strong ?? 0,
      skills: s.skills ?? [],
      medals: s.medals ?? 0,
      treasures: s.treasures ?? 0,
      traps: s.traps ?? 0,
      save: s.save ?? null,
      grave: s.grave ?? null,
    };
  });
  const nodes = {};
  for (const [id, n] of Object.entries(MAP.nodes)) {
    const members = chars.filter((c) => c.path.includes(id)).map((c) => c.id);
    const owner = n.type === 'gate' ? null : members[0];
    let state;
    if (scene.cleared.includes(id)) state = 'cleared';
    else if ((scene.stale || []).includes(id)) state = 'stale';
    else if (n.type === 'gate') {
      const waiting = chars.filter((c) => c.at === id);
      if (waiting.length === members.length) state = 'ready';
      else if (waiting.length) state = 'waiting';
      else state = chars.some((c) => c.path.includes(id) && c.path.indexOf(id) > c.pos && c.path.indexOf(id) - c.pos <= c.vision) ? 'open' : 'fog';
    } else {
      const c = chars.find((x) => x.id === owner);
      const i = c.path.indexOf(id);
      state = i === c.pos ? 'current' : i > c.pos && i - c.pos <= c.vision ? 'open' : 'fog';
    }
    const isCmd = n.check?.kind === 'cmd';
    let code = (scene.cases || {})[id];
    if (code === undefined && state === 'cleared') code = 'o'.repeat(n.check?.cases?.length || 0);
    const cases = isCmd ? casesOf(n, code, (scene.ran || {})[id]) : [];
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
      cases,
      tests: { pass: cases.filter((c) => c.ok === true).length, total: cases.length },
      save: (scene.saves || {})[id] ?? null,
      first_try: n.type === 'task' && isCmd ? ((scene.first || {})[id] ?? (scene.cleared.includes(id) ? true : null)) : null,
    };
  }
  for (const c of chars) {
    const n = c.at && nodes[c.at];
    if (!n || n.type !== 'task' || n.check?.kind !== 'cmd') c.square = null;
    else {
      const i = n.cases.findIndex((x) => x.ok !== true);
      c.square = i < 0 ? n.cases.length : i;
    }
  }
  const all = Object.values(nodes).flatMap((n) => n.cases);
  const bestiary = { total: all.length, defeated: all.filter((x) => x.ok === true).length, revived: all.reduce((s, x) => s + x.revived, 0), strong: all.filter((x) => x.strong).length };
  const hash = sha(JSON.stringify([scene, log.length])) + sha(log.length);
  const entries = log.map((e, i) => ({ seq: i, ts: new Date(T0 + i * 6 * 60000).toISOString(), actor: e.actor || e.character || 'gm', character: e.character || null, node: e.node || null, ok: e.ok ?? null, type: e.type, text: e.text }));
  const finished = !!scene.finished;
  return {
    masume: 1,
    quest: MAP.quest,
    map_version: 1,
    characters: chars,
    nodes,
    log: entries,
    head: { seq: entries.length - 1, hash: hash.slice(0, 64), jumon: jumonOf(hash) },
    integrity: { ok: true, errors: [] },
    finished,
    bestiary,
    ending: finished ? scene.ending : null,
  };
}

const commit = (s) => sha(`commit:${s}`);
const save = (seq, node) => ({ seq, node, commit: commit(`${node}:${seq}`) });

// ---- 冒険の書（ここまでに起きたこと） ----
const log = [
  { type: 'genesis', text: '冒険の書がひらかれた: GridHubをつくる' },
  { type: 'saved', text: '賢者クロード、書記、伝令、地図職人、絵師 が ふりだし でセーブした（commit 3f9a2c1）' },
  { type: 'sealed', node: 'E1', text: 'E1 の判定を封印した' },
  { type: 'sortie', character: 'engine', node: 'E1', text: '書記 が出撃した（codex gpt-5）' },
  { type: 'stepped', character: 'engine', node: 'E1', ok: false, text: '書記 が E1 を歩いた（テスト 1/3）' },
  { type: 'stepped', character: 'engine', node: 'E1', ok: true, text: '書記 が E1 を歩いた（テスト 3/3）' },
  { type: 'check_passed', character: 'server', node: 'S1', ok: true, text: '伝令 が S1「GET /api/state でビューを返す」の判定に成功！ テスト 2/2' },
  { type: 'check_passed', character: 'engine', node: 'E1', ok: true, text: '書記 が E1「log.jsonl に genesis を書く」の判定に成功！ テスト 3/3' },
  { type: 'check_passed', character: 'assets', node: 'A1', ok: true, text: '絵師 が A1「駒の絵 sprites 12枚」の判定に成功！ テスト 2/2' },
  { type: 'check_passed', character: 'board', node: 'B1', ok: true, text: '賢者クロード が B1「svg#board に方眼ノートを描く」の判定に成功！ テスト 3/3' },
  { type: 'check_passed', character: 'gmkit', node: 'M1', ok: true, text: '地図職人 が M1「quest.map.json を検証する」の判定に成功！ テスト 3/3' },
  { type: 'check_failed', character: 'engine', node: 'E2', ok: false, text: '書記 が E2「gridhub check で判定をくだす」の判定に失敗… テスト 2/4、Lv2→1、町から' },
  { type: 'restored', character: 'engine', node: 'E2', text: '書記 の縄張りを commit 3f9a2c1 に戻した（墓: stash 8d1e0b4）' },
  { type: 'stepped', character: 'engine', node: 'E2', ok: false, text: '書記 が E2 を歩いた（テスト 3/4）' },
  { type: 'stepped', character: 'engine', node: 'E2', ok: true, text: '書記 が E2 を歩いた（テスト 4/4）— 強敵を倒した！' },
  { type: 'note', character: 'engine', text: '技: 累積判定は町の次のマスから走らせる。E1 のロックを先に確かめる' },
  { type: 'check_passed', character: 'engine', node: 'E2', ok: true, text: '書記 が E2「gridhub check で判定をくだす」の判定に成功！ テスト 4/4' },
  { type: 'saved', character: 'engine', node: 'C1', text: '書記 が C1 でセーブした（commit a1b2c3d）' },
  { type: 'check_passed', character: 'server', node: 'S2', ok: true, text: '伝令 が S2「GET /api/stream で change を送る」の判定に成功！ G1 で待機' },
  { type: 'stepped', character: 'gmkit', node: 'M2', ok: false, text: '地図職人 が M2 を歩いた（テスト 2/3）' },
  { type: 'check_failed', character: 'gmkit', node: 'M2', ok: false, text: '地図職人 が M2「check.cases を地図に書く」の判定に失敗… M1 のテストが復活した。Lv2→1、ふりだしから' },
  { type: 'restored', character: 'gmkit', node: 'M2', text: '地図職人 の縄張りを commit 3f9a2c1 に戻した（墓: stash 52c0f9e）' },
  { type: 'stepped', character: 'board', node: 'B2', ok: false, text: '賢者クロード が B2 を歩いた（テスト 1/4）' },
  { type: 'stepped', character: 'engine', node: 'E3', ok: false, text: '書記 が E3 を歩いた（テスト 2/5）' },
  { type: 'seal_broken', character: 'assets', node: 'A2', ok: false, text: 'A2 の封印が破れている！（判定ファイルが書き換えられた）' },
];

const base = {
  chars: {
    board: { pos: 1, level: 2, xp: 0, clears: 1, gen: 2, medals: 1, save: save(1, null) },
    engine: { pos: 3, level: 2, xp: 0, checkpoint: 'C1', clears: 3, fails: 1, gen: 3, medals: 1, strong: 1, note: '累積判定は町の次のマスから走らせる。E1 のロックを先に確かめる', skills: [{ seq: 15, ts: new Date(T0 + 15 * 360000).toISOString(), text: '累積判定は町の次のマスから走らせる。E1 のロックを先に確かめる', node: 'E2', case: '落ちれば Lv−1 で町へ' }], save: save(17, 'C1'), grave: { seq: 12, node: 'E2', commit: commit('null:1'), stash: sha('grave:engine') } },
    server: { pos: 2, level: 2, xp: 1, clears: 2, gen: 1, medals: 2, save: save(1, null) },
    gmkit: { pos: 0, level: 1, xp: 0, clears: 1, fails: 1, gen: 2, revived: 1, medals: 1, save: save(1, null), grave: { seq: 21, node: 'M2', commit: commit('null:1'), stash: sha('grave:gmkit') } },
    assets: { pos: 1, level: 2, xp: 0, clears: 1, gen: 1, medals: 1, traps: 1, save: save(1, null) },
    player: { pos: 0, level: 1, xp: 0, clears: 0 },
  },
  cleared: ['B1', 'E1', 'E2', 'C1', 'S1', 'S2', 'A1'],
  stale: ['M1'],
  cases: { B2: 'oxx-', E2: 'oorS', E3: 'ooxx-', M1: 'oRo', M2: 'oox', A2: 'oox', E1: 'ooo' },
  first: { E2: false, E1: true },
  unsealed: ['E4'],
  broken: ['A2'],
  fails: { E2: 1, M2: 1 },
  saves: { C1: save(17, 'C1') },
};

const clone = (x) => JSON.parse(JSON.stringify(x));
const frames = [];
let scene = clone(base);
let L = clone(log);
frames.push(build(scene, L));

// 1) 書記が E3 を歩いて、テストを2件倒す（駒が2マス進む）
scene = clone(scene);
scene.cases.E3 = 'oooo-';
L = [...L, { type: 'stepped', character: 'engine', node: 'E3', ok: false, text: '書記 が E3 を歩いた（テスト 4/5）' }];
frames.push(build(scene, L));

// 2) 書記が E3 を抜けて G1 で待機。地図職人は M1 の復活したテストを倒し直す
scene = clone(scene);
scene.cases.E3 = 'ooooo';
scene.chars.engine = { ...scene.chars.engine, pos: 4, xp: 1, clears: 4, medals: 2 };
scene.cleared.push('E3');
scene.first.E3 = true;
scene.cases.M1 = 'oro';
scene.chars.gmkit = { ...scene.chars.gmkit, pos: 1, clears: 2 };
scene.stale = [];
scene.cleared.push('M1');
scene.cases.M2 = 'oo-';
L = [
  ...L,
  { type: 'check_passed', character: 'engine', node: 'E3', ok: true, text: '書記 が E3「gridhub step で1件ずつ歩く」の判定に成功！ テスト 5/5、G1 で待機' },
  { type: 'check_passed', character: 'gmkit', node: 'M1', ok: true, text: '地図職人 が M1 の復活したテストを倒し直した（テスト 3/3）' },
];
frames.push(build(scene, L));

// 3) 賢者クロードが B2 を抜け、G1 がそろって中ボス戦 → 撃破
scene = clone(scene);
scene.cases.B2 = 'oooo';
scene.chars.board = { ...scene.chars.board, pos: 3, level: 3, xp: 1, checkpoint: 'G1', clears: 3 };
scene.chars.engine = { ...scene.chars.engine, pos: 5, level: 3, xp: 1, checkpoint: 'G1', clears: 5 };
scene.chars.server = { ...scene.chars.server, pos: 3, level: 3, xp: 0, checkpoint: 'G1', clears: 3, save: save(31, 'G1') };
scene.cleared.push('B2', 'G1');
scene.cases.G1 = 'ooo';
scene.saves.G1 = save(31, 'G1');
L = [
  ...L,
  { type: 'check_passed', character: 'board', node: 'B2', ok: true, text: '賢者クロード が B2「駒が1マスずつ歩く」の判定に成功！ G1 で待機' },
  { type: 'gate_cleared', node: 'G1', ok: true, text: '中ボス G1「結合: 冒険が盤面に映る」を撃破！ テスト 3/3 — 賢者クロード・書記・伝令 が解散' },
  { type: 'saved', node: 'G1', text: '賢者クロード、書記、伝令 が G1 でセーブした（commit 7c4e9a0）' },
];
frames.push(build(scene, L));

// 4) GM が A2 の判定を直して封印し直し（宝）、絵師が A2 を抜ける
scene = clone(scene);
scene.broken = [];
scene.cases.A2 = 'ooo';
scene.chars.assets = { ...scene.chars.assets, pos: 2, level: 2, xp: 1, clears: 2, treasures: 1 };
scene.cleared.push('A2');
L = [
  ...L,
  { type: 'sealed', node: 'A2', text: 'A2 の判定を封印しなおした（宝箱: 判定のバグを見つけた）' },
  { type: 'check_passed', character: 'assets', node: 'A2', ok: true, text: '絵師 が A2「モンスターの絵 8枚」の判定に成功！ テスト 3/3' },
];
frames.push(build(scene, L));

// ---- あがった見本（ending あり） ----
const endScene = clone(scene);
for (const c of MAP.characters) endScene.chars[c.id] = { ...endScene.chars[c.id], pos: c.path.length, level: Math.max(3, endScene.chars[c.id].level + 2), xp: 0 };
endScene.cleared = Object.keys(MAP.nodes);
endScene.stale = [];
endScene.cases = { E2: 'oorS', M1: 'oro', B2: 'oooo', G1: 'ooo' };
endScene.ran = { M3: ['Done なら - [x]', 'Todo なら - [ ]'] };
endScene.cases.M3 = 'oo';
endScene.finished = true;
const endLog = [
  ...L,
  { type: 'stamped', character: 'player', node: 'H1', ok: true, text: '勇者（あなた） が H1 にハンコを押した' },
  { type: 'gate_cleared', node: 'GOAL', ok: true, text: '魔王 GOAL「あがり: GridHub で GridHub をつくる」を撃破！ テスト 3/3 — あがり！' },
];
endScene.ending = {
  seq: endLog.length - 1,
  text: [
    'テスト 63/63 が通った。GridHubをつくる、あがり。',
    '一発で出口を抜けたダンジョンは 14 のうち 12（ちいさなメダル 12枚）。',
    '書記 は E2 で2度負けたテストを倒し、その技を3代目に伝えた。',
    '地図職人 の M1 で復活したテストは、町に戻って倒し直した。',
    '絵師 は判定のバグを見つけて宝箱を1つ開けた。出撃は 19 回。',
  ].join('\n'),
  stats: { tests: 63, defeated: 63, medals: 12, strong: 1, revived: 1, treasures: 1, traps: 1, skills: 1, sorties: 19, fails: 2 },
};
const end = build(endScene, endLog);
end.ending.stats.tests = end.bestiary.total;
end.ending.stats.defeated = end.bestiary.defeated;
end.ending.text = end.ending.text.replace('テスト 63/63', `テスト ${end.bestiary.defeated}/${end.bestiary.total}`);

writeFileSync(join(here, 'demo-state.json'), JSON.stringify(frames[0], null, 2) + '\n');
writeFileSync(join(here, 'demo-script.json'), JSON.stringify({ interval: 1800, frames }, null, 1) + '\n');
writeFileSync(join(here, 'end-state.json'), JSON.stringify(end, null, 2) + '\n');
console.log(`demo-state.json・demo-script.json（${frames.length}場面）・end-state.json を書いた`);
