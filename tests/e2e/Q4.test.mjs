// Q4「GM の箱を開けて持ち越す」— CONTRACTS §31（第5章）。
// masume quest --network で codex の GM の箱を開け、生まれた冒険の .masume/party.json に network: true を持ち越す。init --network も。
// 本物の codex は呼ばない。--dry-run と、PATH の先頭に置いた偽の codex（引数を書き残して偽の GM を走らせる）で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, newToy, readLog, fakeGm } from '../helpers3.mjs';

const WISH = 'メモアプリのようなアプリを作りたい';
const NET = 'sandbox_workspace_write.network_access=true';
const codexLine = (dir, { net = false, model } = {}) =>
  `codex exec -C ${dir} -s workspace-write ${net ? `-c ${NET} ` : ''}--skip-git-repo-check ${model ? `-m ${model} ` : ''}-`;
const codexArgv = (dir, { net = false } = {}) =>
  ['exec', '-C', dir, '-s', 'workspace-write', ...(net ? ['-c', NET] : []), '--skip-git-repo-check', '-'];
const quest = (args, env = {}) => masumeEnv(['quest', ...args], { cwd: tmp('masume-cwd-'), env });
const partyJsonOf = (dir) => JSON.parse(readFileSync(join(dir, '.masume', 'party.json'), 'utf8'));

// ---- 偽の codex（このファイルの中だけ） ----
// 受け取った引数を <cwd>/codex-argv-<n>.json に残し、プロンプトをそのまま偽の GM（第2章の fakeGm good）に渡す。
const FAKE_BIN = tmp('masume-q4-bin-');
const FAKE_CODEX = join(FAKE_BIN, 'fake-codex.mjs');
writeFileSync(FAKE_CODEX, `import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let prompt = '';
try { prompt = readFileSync(0); } catch {}
const n = readdirSync('.').filter((f) => f.startsWith('codex-argv-')).length + 1;
writeFileSync('codex-argv-' + n + '.json', JSON.stringify(process.argv.slice(2)));
const r = spawnSync('/bin/sh', ['-c', ${JSON.stringify(fakeGm('good').slice('cmd:'.length))}], { input: prompt, stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(r.status ?? 1);
`);
writeFileSync(join(FAKE_BIN, 'codex'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CODEX)} "$@"\n`);
chmodSync(join(FAKE_BIN, 'codex'), 0o755);
const WITH_CODEX = { PATH: `${FAKE_BIN}:${process.env.PATH}` };

// ---- §31.1・§31.2 ----

test('§31.1・§31.2 quest --network --dry-run: codex の GM のコマンドに -c が入る。claude は変わらない。無ければ閉じたまま', async () => {
  const root = tmp('masume-q4-');
  const d = await quest([WISH, '--dir', root, '--gm', 'codex', '--network', '--dry-run']);
  assert.equal(d.code, 0, d.all);
  assert.ok(d.all.includes(codexLine(root, { net: true })), `GM のコマンドに -c ${NET}:\n${d.all}`);

  const m = await quest([WISH, '--dir', root, '--gm', 'codex', '--model', 'gpt-5', '--network', '--dry-run']);
  assert.equal(m.code, 0, m.all);
  assert.ok(m.all.includes(codexLine(root, { net: true, model: 'gpt-5' })), `-m は -c の後ろ:\n${m.all}`);

  const closed = await quest([WISH, '--dir', root, '--gm', 'codex', '--dry-run']);
  assert.equal(closed.code, 0, closed.all);
  assert.ok(closed.all.includes(codexLine(root)), closed.all);
  assert.doesNotMatch(closed.all, /network_access/, '--network が無ければ閉じたまま');

  const c = await quest([WISH, '--dir', root, '--gm', 'claude', '--network', '--dry-run']);
  assert.equal(c.code, 0, c.all);
  assert.match(c.all, /claude -p --model sonnet --permission-mode bypassPermissions/);
  assert.doesNotMatch(c.all, /network_access/, 'claude の GM には足さない');

  const j = await quest([WISH, '--dir', root, '--gm', 'codex', '--network', '--dry-run', '--json']);
  assert.equal(j.code, 0, j.all);
  assert.equal(JSON.parse(j.out).command, codexLine(root, { net: true }), '--json の command も同じ');

  const o = await quest([WISH, '--dir', root, '--gm', 'claude', '--network', '--dry-run'], { MASUME_GM_OVERRIDE: 'codex' });
  assert.equal(o.code, 0, o.all);
  assert.ok(o.all.includes(codexLine(root, { net: true })), `MASUME_GM_OVERRIDE が codex なら開ける:\n${o.all}`);

  assert.deepEqual(readdirSync(root), [], 'dry-run は何も書かない');
});

// ---- §31.1・§31.3（本当に起動する） ----

test('§31.1・§31.3 偽の codex: quest --network で GM の箱を開け、生まれた冒険の party.json に network: true を持ち越す', async () => {
  const root = join(tmp('masume-q4-'), 'memo');
  const r = await quest([WISH, '--dir', root, '--gm', 'codex', '--network'], WITH_CODEX);
  assert.equal(r.code, 0, r.all);
  const argv = JSON.parse(readFileSync(join(root, 'codex-argv-1.json'), 'utf8'));
  assert.deepEqual(argv, codexArgv(root, { net: true }), '-s workspace-write のすぐ後ろに -c と値（別々の引数）');
  assert.equal(readLog(root).find((e) => e.type === 'wish').data.gm, 'codex');
  assert.deepEqual(partyJsonOf(root), { agent: 'codex', parallel: 3, network: true }, '出撃の箱も開けたまま始まる');
  assert.equal(masume(['verify', '--dir', root]).code, 0);

  const root2 = join(tmp('masume-q4-'), 'memo');
  const n = await quest([WISH, '--dir', root2, '--gm', 'codex'], WITH_CODEX);
  assert.equal(n.code, 0, n.all);
  assert.deepEqual(JSON.parse(readFileSync(join(root2, 'codex-argv-1.json'), 'utf8')), codexArgv(root2), '--network が無ければ -c は入らない');
  assert.deepEqual(partyJsonOf(root2), { agent: 'codex', parallel: 3 }, '--network が無ければ network に触らない（第3章どおり）');
  assert.doesNotMatch(n.all, /network_access/);
});

// ---- §31.4 ----

test('§31.4 init --agent codex --network は party.json に network: true を足す。ほかの項目は残す。--agent なしは E_USAGE', () => {
  const dir = newToy();
  const r = masume(['init', '--dir', dir, '--agent', 'codex', '--network']);
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(partyJsonOf(dir), { agent: 'codex', parallel: 3, network: true });

  writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify({ agent: 'claude', model: 'opus', parallel: 2 }));
  const k = masume(['init', '--dir', dir, '--agent', 'codex', '--network']);
  assert.equal(k.code, 0, k.all);
  assert.deepEqual(partyJsonOf(dir), { agent: 'codex', model: 'opus', parallel: 2, network: true }, 'ほかの項目は残す');

  const plain = masume(['init', '--dir', dir, '--agent', 'claude']);
  assert.equal(plain.code, 0, plain.all);
  assert.deepEqual(partyJsonOf(dir), { agent: 'claude', model: 'opus', parallel: 2, network: true }, '--network の無い init は network に触らない');

  const u = masume(['init', '--dir', dir, '--network']);
  assert.equal(u.code, 2, u.all);
  assert.match(u.all, /E_USAGE/);
  assert.equal(masume(['verify', '--dir', dir]).code, 0, '冒険の書は壊さない');
});
