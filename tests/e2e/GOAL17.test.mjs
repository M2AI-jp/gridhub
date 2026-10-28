// GOAL17「あがり（第17章）: 紹介ページ」— CONTRACTS §75。公開（ページを置く・DNS・npm publish・タグ・Release）はしない。置くのは監督。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers9.mjs';

// あがりの GOAL〜GOAL17 を除く、第1章〜第17章の判定
const FILES = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL')).sort().map((f) => join('tests', 'e2e', f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第17章のすべての判定が、まとめて本当に通る', () => {
  for (const id of ['W1', 'W2', 'W3', 'E18', 'S14', 'B21', 'D1', 'G12', 'SOLO']) assert.ok(FILES.includes(join('tests', 'e2e', `${id}.test.mjs`)), `${id} を数に入れる`);
  assert.ok(FILES.length >= 101, `判定ファイル ${FILES.length}`);
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

test('すべての冒険の書が正常。地図と package.json は第17章（看板屋の縄張りは site/**、test に看板屋の判定）', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  const map = JSON.parse(read('quests/masume.map.json'));
  assert.equal(map.quest.goal, 'GOAL17');
  const site = map.characters.find((c) => c.id === 'site');
  assert.ok(site && site.territory.includes('site/**'), '看板屋の縄張りは site/**');
  for (const c of map.characters) assert.equal(c.path.at(-1), 'GOAL17', `${c.id} の道は GOAL17 で終わる`);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL17.test.mjs');
  assert.match(pkg.scripts.test, /tests\/e2e\/\[[A-Z]*W[A-Z]*\]\*\.test\.mjs/, 'npm test に看板屋の判定（W*）');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/);
});

test('§75.5 紹介ページは包みに入らない。README に紹介ページ（site/・gridhub.matsunai.com）、CHANGELOG に第17章', () => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, npm_config_loglevel: 'silent' } });
  assert.equal(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);
  assert.ok(files.includes('web/start.html'), '包みは今までどおり');
  assert.deepEqual(files.filter((f) => f.startsWith('site/') || f.startsWith('tools/')), [], '紹介ページと、その道具は包みに入らない');
  const readme = read('README.md');
  assert.match(readme, /紹介ページ/u);
  assert.match(readme, /site\//u);
  assert.match(readme, /gridhub\.matsunai\.com/u);
  assert.match(read('CHANGELOG.md'), /第17章/u);
});
