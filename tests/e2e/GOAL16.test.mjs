// GOAL16「あがり（第16章）: Mac のアプリで遊ぶ」— CONTRACTS §66〜§73。公開（タグ・Release・アプリの zip）はしない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, extname, join } from 'node:path';
import { ROOT, masume, oldNameHits, showHits, distPaths } from '../helpers7.mjs';

// あがりの GOAL〜GOAL16 を除く、第1章〜第16章の判定
const FILES = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL')).sort().map((f) => join('tests', 'e2e', f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第16章のすべての判定が、まとめて本当に通る', () => {
  for (const id of ['D1', 'D2', 'D3', 'E17', 'S12', 'S13', 'B19', 'B20', 'G12', 'M10', 'G11', 'SOLO']) assert.ok(FILES.includes(join('tests', 'e2e', `${id}.test.mjs`)), `${id} を数に入れる`);
  assert.ok(FILES.length >= 95, `判定ファイル ${FILES.length}`);
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

test('すべての冒険の書が正常。地図と package.json は第16章（scripts.mac・test に大工の判定）', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  const map = JSON.parse(read('quests/masume.map.json'));
  assert.equal(map.quest.goal, 'GOAL16');
  const mac = map.characters.find((c) => c.id === 'mac');
  assert.ok(mac && mac.territory.includes('mac/**'), '大工の縄張りは mac/**');
  assert.equal(map.nodes.H4?.check?.kind, 'stamp', '王様の城（H4）は勇者のハンコ');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL16.test.mjs');
  assert.equal(pkg.scripts.mac, 'sh mac/build.sh');
  assert.match(pkg.scripts.test, /tests\/e2e\/\[[A-Z]*D[A-Z]*\]\*\.test\.mjs/, 'test の判定に大工の判定（D*）');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/);
});

test('§64.1・§77.2 配るものに旧名が無い。README に「Mac アプリで遊ぶ」、CHANGELOG に第16章', { timeout: 240000 }, () => {
  const { paths } = distPaths(); // 配るもの（§77.2）。sh mac/build.sh が詰めた中身
  assert.ok(paths.includes('web/start.html'), 'はじめの画面も配るものに入る');
  assert.ok(!paths.some((f) => f.startsWith('mac/')), 'mac/ は配るものに入れない');
  const TEXT = new Set(['.md', '.js', '.mjs', '.json', '.html', '.css', '.svg', '.txt', '']);
  const skipFile = new Set(['docs/CONTRACTS.md']);
  const skipLine = { 'src/quest/setup.js': (t) => /^const IGNORE_HEADING = /.test(t), 'web/board/board.css': (t) => /^\/\*.*\*\/\s*$/.test(t) };
  const found = [];
  for (const f of paths) {
    if (!TEXT.has(extname(f)) || skipFile.has(f)) continue;
    const hits = oldNameHits(read(f)).filter((h) => !skipLine[f]?.(h.text));
    if (hits.length) found.push(showHits(f, hits));
  }
  assert.deepEqual(found, [], `旧名が残っている:\n${found.join('\n')}`);

  const readme = read('README.md');
  const section = readme.match(/^## [^\n]*Mac アプリで遊ぶ[^\n]*\n([\s\S]*?)(?=^## )/m);
  assert.ok(section, 'README に「Mac アプリで遊ぶ」の節');
  for (const w of ['sh mac/build.sh', 'dist/GridHub.app', '右クリック', '「開く」', 'Node.js 22 以上', 'claude', 'チュートリアル', 'フォルダを選ぶ']) {
    assert.ok(section[1].includes(w), `「Mac アプリで遊ぶ」に ${w}`);
  }
  assert.match(read('CHANGELOG.md'), /第16章/);
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
});
