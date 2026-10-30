// GOAL14「あがり（第14章）: リリースの支度」— CONTRACTS §62・§63。公開（タグ・Release）はしない。§77 で、配る支度からパッケージの道具を外した（package.json の files は見ない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers6.mjs';

// あがりの GOAL〜GOAL14 を除く、第1章〜第14章の判定
const FILES = readdirSync(join(ROOT, 'tests', 'e2e')).filter((f) => f.endsWith('.test.mjs') && !f.startsWith('GOAL')).sort().map((f) => join('tests', 'e2e', f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('第1章〜第14章のすべての判定が、まとめて本当に通る', () => {
  for (const id of ['M9', 'G11', 'E15', 'E16', 'S10', 'B18', 'SOLO']) assert.ok(FILES.includes(join('tests', 'e2e', `${id}.test.mjs`)), `${id} を数に入れる`);
  assert.ok(FILES.length >= 81, `判定ファイル ${FILES.length}`);
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

test('すべての冒険の書が正常。地図と package.json は第14章（版 0.3.0・engines >=22・MIT。files は持たない §77）', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'examples/memo', 'demos/mcp-tutorial']) {
    const r = masume(['verify', '--dir', join(ROOT, d)]);
    assert.equal(r.code, 0, `${d}: ${r.all}`);
  }
  assert.equal(JSON.parse(read('quests/masume.map.json')).quest.goal, 'GOAL14');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '0.3.0');
  assert.equal(pkg.engines?.node, '>=22');
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.files, undefined, 'パッケージの道具で配るための files は持たない（§77.1）');
  assert.equal(pkg.bin, undefined, 'パッケージの道具で入れるための bin は持たない（§77.1）');
  assert.equal(pkg.scripts['test:goal'], 'node --test tests/e2e/GOAL14.test.mjs');
  assert.doesNotMatch(pkg.scripts.test, /GOAL/);
  const v = masume(['--version']);
  assert.equal(v.out.trim(), `gridhub ${pkg.version} (rules 1)`);
});

test('LICENSE は MIT の本文、CHANGELOG.md に 0.3.0 とそれより前、README の版の例と Node.js 22 以上', () => {
  const license = read('LICENSE');
  assert.match(license, /^MIT License\n/);
  assert.match(license, /^Copyright \(c\) 20\d\d \S.*$/m);
  assert.match(license, /Permission is hereby granted, free of charge, to any person obtaining a copy/);
  assert.match(license, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);

  const changelog = read('CHANGELOG.md');
  const heads = [...changelog.matchAll(/^## (\d+\.\d+\.\d+)\b/gm)].map((m) => m[1]);
  assert.equal(heads[0], '0.3.0', `いちばん上は 0.3.0（見出し: ${heads.join(', ')}）`);
  assert.ok(heads.includes('0.1.0'), 'それより前（0.1.0）');
  const latest = changelog.slice(changelog.indexOf('## 0.3.0'), changelog.indexOf(`## ${heads[1]}`));
  for (const w of ['GridHub', 'gridhub step', 'じゅもん', '余白', '瓦版', 'gridhub remote', 'gridhub push', '自動で', '縦', 'Lv9（最大）', 'Node.js 22']) {
    assert.ok(latest.includes(w), `0.3.0 の項に「${w}」`);
  }
  for (const w of ['第11章', '第13章']) assert.ok(latest.includes(w), `0.3.0 の項に ${w}`);
  assert.match(changelog, /0\.2\.0/, '0.2.0 を 0.3.0 にまとめたこと');

  const readme = read('README.md');
  const pkg = JSON.parse(read('package.json'));
  assert.match(readme, new RegExp(`gridhub --version\\s+# gridhub ${pkg.version.replace(/\./g, '\\.')} \\(rules 1\\)`));
  assert.match(readme, /Node\.js 22 以上/);
  assert.match(readme, /第14章/);
  assert.match(readme, /CHANGELOG\.md/);
  for (const f of ['README.md', 'AGENTS.md', 'docs/CONTRACTS.md', 'quests/tutorial/README.md']) {
    assert.doesNotMatch(read(f), /Node\.js\s*20/, `${f} に Node.js 20 が残っていない`);
  }
  const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]).filter((u) => !/^https?:/.test(u));
  for (const img of images) assert.ok(existsSync(join(ROOT, img)), `README の絵 ${img} がある`);
});
