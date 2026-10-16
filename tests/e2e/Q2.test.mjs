// Q2「よその冒険の支度をする」— CONTRACTS §21（masume init と、quest のあとの支度）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, masumeEnv, newToy, fakeGm } from '../helpers3.mjs';

test('init: AGENTS.md・CLAUDE.md・.gitignore を置く。何度やっても重ならない', () => {
  const dir = tmp('masume-init-');
  writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
  const r = masume(['init', '--dir', dir]);
  assert.equal(r.code, 0, r.all);
  const agents = readFileSync(join(dir, 'AGENTS.md'), 'utf8');
  const bin = join(ROOT, 'bin', 'masume.js');
  for (const w of ['マスメ', `node "${bin}" brief`, 'check', '--as', 'note', '--no-boss', '縄張り', '封印', 'git', join(ROOT, 'docs', 'RULEBOOK.md')]) assert.ok(agents.includes(w), `AGENTS.md に「${w}」`);
  const claude = readFileSync(join(dir, 'CLAUDE.md'), 'utf8');
  assert.match(claude.split('\n')[0], /マスメ/);
  assert.match(claude, /^@AGENTS\.md$/m);
  const gi = () => readFileSync(join(dir, '.gitignore'), 'utf8').split('\n').filter(Boolean);
  for (const l of ['node_modules/', '.masume/lock', '.masume/state.json', '.masume/party.log']) assert.ok(gi().includes(l), l);
  assert.equal(masume(['init', '--dir', dir]).code, 0);
  assert.equal(gi().filter((l) => l === '.masume/lock').length, 1, '二度目でも重ならない');
});

test('init: 既にある AGENTS.md は --force なしでは触らない。冒険の書があれば party.json', () => {
  const dir = newToy();
  writeFileSync(join(dir, 'AGENTS.md'), '# 自分で書いた AGENTS.md\n');
  const r = masume(['init', '--dir', dir, '--agent', 'codex']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /AGENTS\.md はそのまま/);
  assert.equal(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), '# 自分で書いた AGENTS.md\n');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.masume', 'party.json'), 'utf8')), { agent: 'codex', parallel: 3 });
  const f = masume(['init', '--dir', dir, '--force']);
  assert.equal(f.code, 0, f.all);
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /マスメ/);
  assert.equal(masume(['verify', '--dir', dir]).code, 0, '冒険の書は壊さない');
});

test('quest のあとには支度が済んでいる', async () => {
  const root = tmp('masume-quest-');
  const r = await masumeEnv(['quest', 'メモアプリのようなアプリを作りたい', '--dir', root, '--gm', fakeGm('good')], { cwd: root });
  assert.equal(r.code, 0, r.all);
  assert.ok(existsSync(join(root, 'AGENTS.md')));
  assert.ok(existsSync(join(root, 'CLAUDE.md')));
  assert.ok(readFileSync(join(root, '.gitignore'), 'utf8').includes('.masume/lock'));
});
