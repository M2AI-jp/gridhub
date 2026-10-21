// 第11章の判定の共通道具（テスト1件ずつのダンジョン・Git のセーブ）。GM の縄張り・封印対象。キャラクターは編集しないこと。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeJson, view, char, readLog, ROOT } from './helpers4.mjs';

export * from './helpers4.mjs';

export const GRIDHUB = join(ROOT, 'bin', 'gridhub.js');

/** gridhub（bin/gridhub.js）を同期で実行する */
export function gridhub(args, { cwd = ROOT, env = {}, timeout = 120000 } = {}) {
  const r = spawnSync(process.execPath, [GRIDHUB, ...args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env },
    encoding: 'utf8',
    timeout,
  });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '', all: (r.stdout || '') + (r.stderr || '') };
}

// テストの名前ごとの成否を flags/<node>.json（{"名前": "ok" | "fail" | "skip"}）から読み、node --test の spec の形で出す。
// 書いていない名前は落ちる。どれかが落ちたら終了コード 1。TAP=1 なら TAP の形で出す。
const CASES_SCRIPT = `import { readFileSync } from 'node:fs';
const node = process.argv[2];
const names = JSON.parse(process.argv[3] || '[]');
let flags = {};
try { flags = JSON.parse(readFileSync('flags/' + node + '.json', 'utf8')); } catch {}
const tap = process.env.TAP === '1' || flags.__tap;
let failed = 0;
let n = 0;
if (tap) console.log('TAP version 13');
for (const name of names) {
  const v = flags[name] || 'fail';
  n++;
  if (v === 'fail') failed++;
  if (tap) console.log((v === 'fail' ? 'not ok ' : 'ok ') + n + ' - ' + name + (v === 'skip' ? ' # SKIP' : ''));
  else console.log((v === 'ok' ? '✔ ' : v === 'skip' ? '﹣ ' : '✖ ') + name + ' (0.5ms)' + (v === 'skip' ? ' # SKIP' : ''));
}
if (!tap && failed) { console.log('✖ failing tests:'); for (const name of names) if ((flags[name] || 'fail') === 'fail') console.log('✖ ' + name + ' (0.5ms)'); }
process.exit(failed ? 1 : 0);
`;

const FLAG_SCRIPT = `import { readFileSync } from 'node:fs';
const id = process.argv[2];
let v = '';
try { v = readFileSync('flags/' + id, 'utf8').trim(); } catch {}
if (v === 'ok') { console.log('PASS ' + id); process.exit(0); }
console.log('FAIL ' + id);
if (v.startsWith('blame:')) console.log('MASUME_BLAME: ' + v.slice(6));
process.exit(1);
`;

const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
export const casesCheck = (id, names, { declare = true } = {}) => ({
  kind: 'cmd',
  run: `node checks/cases.mjs ${id} ${q(JSON.stringify(names))}`,
  seal: ['checks/cases.mjs'],
  ...(declare ? { cases: names } : {}),
});
const flagCheck = (id) => ({ kind: 'cmd', run: `node checks/flag.mjs ${id}`, seal: ['checks/flag.mjs'] });

export const CASES = {
  A1: ['x が 1', 'y が 2'],
  A2: ['z が 3', 'w が 4', 'v が 5'],
  A3: ['u が 6', 't が 7'],
  B1: ['p が 8'],
  B2: ['q が 9', 'r が 10'],
  G1: ['結合 1', '結合 2'],
};

/** テスト1件ずつのダンジョンの地図。a: A1 A2 AC A3 G1 FIN / b: B1 B2 G1 FIN / h: H1 FIN */
export function dungeonMap({ save = false } = {}) {
  return {
    masume: 1,
    quest: { id: 'DUN', title: 'ダンジョンの冒険', pitch: 'テスト1件が1マス', goal: 'FIN', ...(save ? { save: 'git' } : {}) },
    characters: [
      { id: 'a', name: '戦士アリス', kind: 'agent', agent: 'test', job: 'warrior', color: 'yellow', territory: ['a/**'], path: ['A1', 'A2', 'AC', 'A3', 'G1', 'FIN'] },
      { id: 'b', name: '魔法使いボブ', kind: 'agent', agent: 'test', job: 'mage', color: 'blue', territory: ['b/**', 'shared/{b1,b2}.txt'], path: ['B1', 'B2', 'G1', 'FIN'] },
      { id: 'h', name: '勇者ひとみ', kind: 'human', agent: 'human', job: 'hero', color: 'pink', path: ['H1', 'FIN'] },
    ],
    nodes: {
      A1: { type: 'task', title: 'POST /api/x で x を保存する', check: casesCheck('A1', CASES.A1) },
      A2: { type: 'task', title: 'GET /api/x で一覧を返す', check: casesCheck('A2', CASES.A2) },
      AC: { type: 'camp', title: '村の宿屋' },
      A3: { type: 'task', title: 'x を消す', check: casesCheck('A3', CASES.A3), rollback_to: '@here' },
      B1: { type: 'task', title: '画面の骨組み', check: casesCheck('B1', CASES.B1) },
      B2: { type: 'task', title: '一覧を描く', check: casesCheck('B2', CASES.B2) },
      G1: { type: 'gate', title: '結合: 画面から x を保存できる', check: casesCheck('G1', CASES.G1) },
      H1: { type: 'task', title: '王様の承認', check: { kind: 'stamp', by: 'h' } },
      FIN: { type: 'gate', title: 'あがり: x を保存して一覧できる', check: flagCheck('FIN') },
    },
  };
}

/** 材料を dir に置く（new はしない） */
export function setupDungeon(dir, { save = false, map = dungeonMap({ save }) } = {}) {
  mkdirSync(join(dir, 'checks'), { recursive: true });
  mkdirSync(join(dir, 'flags'), { recursive: true });
  writeFileSync(join(dir, 'checks', 'cases.mjs'), CASES_SCRIPT);
  writeFileSync(join(dir, 'checks', 'flag.mjs'), FLAG_SCRIPT);
  writeFileSync(join(dir, 'dungeon.map.json'), JSON.stringify(map, null, 2));
  return join(dir, 'dungeon.map.json');
}

export function newDungeon(opts = {}) {
  const dir = tmp('gridhub-dun-');
  setupDungeon(dir, opts);
  const r = masume(['new', 'dungeon.map.json'], { cwd: dir });
  if (r.code !== 0) throw new Error(`new に失敗: ${r.all}`);
  return dir;
}

/** flags/<node>.json に、テストの名前ごとの成否を書く（{名前: 'ok'|'fail'|'skip'}。true/false も可） */
export function setCases(dir, node, results) {
  const out = {};
  for (const [k, v] of Object.entries(results)) out[k] = v === true ? 'ok' : v === false ? 'fail' : v;
  writeFileSync(join(dir, 'flags', `${node}.json`), JSON.stringify(out));
}

/** そのマスのテストを全部通す */
export function passAll(dir, node) {
  setCases(dir, node, Object.fromEntries(CASES[node].map((n) => [n, 'ok'])));
}

export function setFlag(dir, id, value = 'ok') {
  writeFileSync(join(dir, 'flags', id), value);
}

export function unsetFlag(dir, id) {
  rmSync(join(dir, 'flags', id), { force: true });
}

/** Git の作業ツリーにする。名前・メールは設定しない（GridHub が自分で補う） */
export const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
export function git(dir, args) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
  return { code: r.status, out: (r.stdout || '').trim(), err: r.stderr || '' };
}
export function gitInit(dir) {
  const r = git(dir, ['init', '-q', '-b', 'main']);
  if (r.code !== 0) throw new Error(`git init に失敗: ${r.err}`);
}

export function events(dir, type) {
  return readLog(dir).filter((e) => !type || e.type === type);
}

export { view, char, masumeJson, readFileSync };
