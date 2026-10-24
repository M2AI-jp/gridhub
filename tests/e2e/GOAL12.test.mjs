// GOAL12「あがり（第12章）: 仕上げ」— 第1章〜第12章のすべての判定と、すべての冒険の書と、README。
// 瓦版は作っている製品の話題・札と吹き出しが重ならない・GitHub につなぐ導線・縦のノート（CONTRACTS §54〜§58）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, masume } from '../helpers6.mjs';

// あがりの GOAL〜GOAL12 を除く、第1章〜第12章の判定
const FILES = [
  'A1', 'A2', 'A3', 'A4',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10', 'E11', 'E12', 'E13', 'E14',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9', 'G10',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8',
  'P1', 'P2', 'P3', 'P4', 'P5', 'P6',
  'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'SOLO',
].map((id) => join('tests', 'e2e', `${id}.test.mjs`));

const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const BOOKS = ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial'];

test('第1章〜第12章のすべての判定が、まとめて本当に通る', () => {
  for (const f of FILES) assert.ok(existsSync(join(ROOT, f)), f);
  const all = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL'));
  assert.deepEqual(all.map((f) => join('tests', 'e2e', f)).sort(), [...FILES].sort(), 'あがり以外の判定はすべて数に入れる');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('MASUME_') && k !== 'MASUME_CHROME') delete env[k];
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...FILES], { cwd: ROOT, env, encoding: 'utf8', timeout: 60 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= FILES.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('GridHub 自身と、残っているすべての冒険の書が正常。地図と package.json は第12章', () => {
  for (const d of BOOKS) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  assert.equal(JSON.parse(read('quests/masume.map.json')).quest.goal, 'GOAL12');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL12.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/, 'あがりの判定は npm test に入れない');
});

test('§54 瓦版は、作っている製品の話題（このリポジトリと3つの examples の地図。3件以上・newsProblems が無い）', async () => {
  const { newsProblems } = await import(pathToFileURL(join(ROOT, 'src', 'quest', 'news.js')).href);
  for (const d of ['.', 'examples/memo', 'examples/kakeibo', 'examples/omikuji']) {
    const status = masume(['status', '--json', '--dir', join(ROOT, d)]);
    assert.equal(status.code, 0, `${d}: ${status.all}`);
    const v = JSON.parse(status.out);
    const news = v.quest.news ?? [];
    assert.ok(news.length >= 3, `${d} の地図に製品の話題が3件以上（${news.length}）`);
    const product = `${v.quest.title} ${v.quest.pitch ?? ''}`;
    assert.deepEqual(newsProblems(news, product), [], `${d} の話題に問題が無い`);
    const domain = v.news.filter((n) => n.kind === 'domain').map((n) => n.text);
    assert.deepEqual(domain, news, `${d} の瓦版に、地図の話題が出る`);
    if (v.news.some((n) => n.kind === 'extra')) assert.deepEqual(v.news.slice(0, 2).map((n) => n.kind).sort(), ['domain', 'extra'], `${d} の瓦版の上のほうに号外と話題の両方`);
  }
});

test('README に GitHub につなぐ導線（gridhub remote・gridhub push・盤面の送るボタン）と縦のノート', () => {
  const readme = read('README.md');
  assert.match(readme, /^# GridHub/m);
  assert.match(readme, /gridhub remote/);
  assert.match(readme, /gridhub push/);
  assert.match(readme, /force push はしません|force push しません/);
  assert.match(readme, /送る[」』]?\s*ボタン|「GitHub に送る」/);
  assert.match(readme, /gh auth login/);
  assert.match(readme, /gh repo create/);
  assert.match(readme, /縦長の画面[^\n]*1ページずつ/);
  assert.match(readme, /第12章/);
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
});
