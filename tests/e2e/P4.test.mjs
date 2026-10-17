// P4「箱のネットワークを開ける」— CONTRACTS §30（第5章）。
// codex の箱（-s workspace-write）のネットワークを、--network / --no-network / .masume/party.json の network で開け閉めする。
// 本物の codex は呼ばない。--dry-run と、PATH の先頭に置いた偽の codex（引数を書き残す）で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masumeEnv, newToy, view, char, readLog } from '../helpers3.mjs';

const NET = 'sandbox_workspace_write.network_access=true';
/** §13 のアダプタのコマンド（§30.2 の -c を足すかどうか） */
const codexLine = (dir, { net = false, model } = {}) =>
  `codex exec -C ${dir} -s workspace-write ${net ? `-c ${NET} ` : ''}--skip-git-repo-check ${model ? `-m ${model} ` : ''}-`;
const codexArgv = (dir, { net = false } = {}) =>
  ['exec', '-C', dir, '-s', 'workspace-write', ...(net ? ['-c', NET] : []), '--skip-git-repo-check', '-'];
const party = (dir, args, env = {}) => masumeEnv(['party', '--dir', dir, ...args], { cwd: dir, env });
const partyJson = (dir, obj) => writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify(obj));

// ---- 偽の codex（このファイルの中だけ） ----
// 受け取った引数を <MASUME_DIR>/codex/<キャラ>-<マス>.json に残し、偽のエージェントと同じく
// flags/<マス> に ok を書いて宣言判定（--no-boss）して終わる。
const FAKE_BIN = tmp('masume-p4-bin-');
const FAKE_CODEX = join(FAKE_BIN, 'fake-codex.mjs');
writeFileSync(FAKE_CODEX, `import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
try { readFileSync(0); } catch {}
const env = process.env;
const dir = env.MASUME_DIR;
mkdirSync(dir + '/codex', { recursive: true });
writeFileSync(dir + '/codex/' + env.MASUME_CHARACTER + '-' + env.MASUME_NODE + '.json', JSON.stringify({ argv: process.argv.slice(2) }));
console.log('偽の codex: ' + process.argv.slice(2).join(' '));
mkdirSync(dir + '/flags', { recursive: true });
writeFileSync(dir + '/flags/' + env.MASUME_NODE, 'ok');
const r = spawnSync(process.execPath, [env.MASUME_BIN, 'check', env.MASUME_CHARACTER, '--as', env.MASUME_CHARACTER, '--no-boss', '--dir', dir], { encoding: 'utf8' });
console.log(r.stdout + r.stderr);
`);
writeFileSync(join(FAKE_BIN, 'codex'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CODEX)} "$@"\n`);
chmodSync(join(FAKE_BIN, 'codex'), 0o755);
const WITH_CODEX = { PATH: `${FAKE_BIN}:${process.env.PATH}` };
const recorded = (dir) => {
  let files = [];
  try {
    files = readdirSync(join(dir, 'codex')).sort();
  } catch {}
  return files.map((f) => ({ file: f, ...JSON.parse(readFileSync(join(dir, 'codex', f), 'utf8')) }));
};

// ---- §30.2・§30.4・§30.5 ----

test('§30.2 --network で codex の箱を開ける。--dry-run の出撃予定は起動するコマンドと同じ。既定は閉じたまま', async () => {
  const dir = newToy();
  const before = readLog(dir).length;

  const open = await party(dir, ['--dry-run', '--agent', 'codex', '--network']);
  assert.equal(open.code, 0, open.all);
  assert.ok(open.all.includes(`出撃予定: a ${codexLine(dir, { net: true })}`), `a のコマンドに -c ${NET}:\n${open.all}`);
  assert.ok(open.all.includes(`出撃予定: b ${codexLine(dir, { net: true })}`), `b のコマンドに -c ${NET}:\n${open.all}`);
  assert.doesNotMatch(open.all, /出撃予定: h /, '人間には出撃しない');

  const model = await party(dir, ['--dry-run', '--agent', 'codex', '--model', 'gpt-5', '--network']);
  assert.equal(model.code, 0, model.all);
  assert.ok(model.all.includes(`出撃予定: a ${codexLine(dir, { net: true, model: 'gpt-5' })}`), `-m は -c の後ろ:\n${model.all}`);

  const closed = await party(dir, ['--dry-run', '--agent', 'codex']);
  assert.equal(closed.code, 0, closed.all);
  assert.ok(closed.all.includes(`出撃予定: a ${codexLine(dir)}`), closed.all);
  assert.doesNotMatch(closed.all, /network_access/, '--network が無ければ箱は閉じたまま（§30.5）');

  assert.equal(readLog(dir).length, before, 'dry-run は冒険の書に書かない');
});

// ---- §30.3 ----

test('§30.3 claude と cmd: のコマンドは --network でも変わらない。MASUME_AGENT_OVERRIDE が codex なら開ける', async () => {
  const dir = newToy();
  const c = await party(dir, ['--dry-run', '--agent', 'claude', '--network']);
  assert.equal(c.code, 0, c.all);
  assert.match(c.all, /^出撃予定: a claude -p --model sonnet --permission-mode bypassPermissions$/m, c.all);
  assert.doesNotMatch(c.all, /network_access/, 'claude には足さない');

  const x = await party(dir, ['--dry-run', '--agent', 'cmd:echo やあ', '--network']);
  assert.equal(x.code, 0, x.all);
  assert.match(x.all, /^出撃予定: a echo やあ$/m, x.all);
  assert.doesNotMatch(x.all, /network_access/, 'cmd: には足さない');

  const oc = await party(dir, ['--dry-run', '--agent', 'claude', '--network'], { MASUME_AGENT_OVERRIDE: 'codex' });
  assert.equal(oc.code, 0, oc.all);
  assert.ok(oc.all.includes(`出撃予定: a ${codexLine(dir, { net: true })}`), `上書きが codex なら開ける:\n${oc.all}`);

  const ox = await party(dir, ['--dry-run', '--agent', 'codex', '--network'], { MASUME_AGENT_OVERRIDE: 'cmd:echo うわがき' });
  assert.equal(ox.code, 0, ox.all);
  assert.match(ox.all, /^出撃予定: a echo うわがき$/m, ox.all);
  assert.doesNotMatch(ox.all, /network_access/, '上書きが cmd: なら足さない');
});

// ---- §30.1 ----

test('§30.1 .masume/party.json の network が既定になり、--network / --no-network がそれに勝つ', async () => {
  const dir = newToy();
  partyJson(dir, { agent: 'codex', network: true });
  const p = await party(dir, ['--dry-run']);
  assert.equal(p.code, 0, p.all);
  assert.ok(p.all.includes(`出撃予定: a ${codexLine(dir, { net: true })}`), `party.json の network: true で開ける:\n${p.all}`);

  const n = await party(dir, ['--dry-run', '--no-network']);
  assert.equal(n.code, 0, n.all);
  assert.ok(n.all.includes(`出撃予定: a ${codexLine(dir)}`), `--no-network が party.json に勝つ:\n${n.all}`);
  assert.doesNotMatch(n.all, /network_access/);

  partyJson(dir, { agent: 'codex', network: false });
  const f = await party(dir, ['--dry-run']);
  assert.equal(f.code, 0, f.all);
  assert.doesNotMatch(f.all, /network_access/, 'party.json の network: false なら閉じたまま');
  const o = await party(dir, ['--dry-run', '--network']);
  assert.equal(o.code, 0, o.all);
  assert.ok(o.all.includes(`出撃予定: a ${codexLine(dir, { net: true })}`), `--network が party.json に勝つ:\n${o.all}`);

  partyJson(dir, { agent: 'codex', parallel: 2 });
  const none = await party(dir, ['--dry-run']);
  assert.equal(none.code, 0, none.all);
  assert.doesNotMatch(none.all, /network_access/, 'network を書かなければ閉じたまま');
});

test('§30.1 使い方の誤り: party.json の network が true/false でない・--network=… ・両方を付ける', async () => {
  const dir = newToy();
  for (const bad of ['yes', 1, null, 'true']) {
    partyJson(dir, { agent: 'codex', network: bad });
    const r = await party(dir, ['--dry-run']);
    assert.equal(r.code, 2, `network: ${JSON.stringify(bad)} は E_USAGE/2\n${r.all}`);
    assert.match(r.all, /E_USAGE/, r.all);
  }
  partyJson(dir, { agent: 'codex' });
  const both = await party(dir, ['--dry-run', '--network', '--no-network']);
  assert.equal(both.code, 2, both.all);
  assert.match(both.all, /E_USAGE/);
  const eq = await party(dir, ['--dry-run', '--network=true']);
  assert.equal(eq.code, 2, eq.all);
  assert.match(eq.all, /E_USAGE/);
  const ok = await party(dir, ['--dry-run', '--network']);
  assert.equal(ok.code, 0, `正しい使い方は通る:\n${ok.all}`);
});

// ---- 本当に起動する（偽の codex） ----

test('§30.2・§30.4 偽の codex: --network なら起動する codex の引数に -c が入り、そのまま進める。無ければ入らない', async () => {
  const dir = newToy();
  const r = await party(dir, ['--agent', 'codex', '--network', '--only', 'a', '--rounds', '1'], WITH_CODEX);
  assert.equal(r.code, 2, `巡回の上限で止まる\n${r.all}`);
  assert.equal(char(view(dir), 'a').at, 'A2', `偽の codex で1マス進んだ\n${r.all}`);
  const [rec] = recorded(dir);
  assert.ok(rec, `偽の codex が起動された\n${r.all}`);
  assert.deepEqual(rec.argv, codexArgv(dir, { net: true }), '-s workspace-write のすぐ後ろに -c と値（別々の引数）');
  const s = readLog(dir).find((e) => e.type === 'sortie');
  assert.equal(s.data.agent, 'codex');
  assert.match(r.all, /^出撃準備: .*network_access=true/m, `出撃準備の行にも、起動するコマンドが出る\n${r.all}`);

  const dir2 = newToy();
  const c = await party(dir2, ['--agent', 'codex', '--only', 'b', '--rounds', '1'], WITH_CODEX);
  assert.equal(c.code, 2, c.all);
  assert.equal(char(view(dir2), 'b').at, 'B2', c.all);
  assert.deepEqual(recorded(dir2)[0]?.argv, codexArgv(dir2), '--network が無ければ -c は入らない');
  assert.doesNotMatch(c.all, /network_access/);
});

test('§30.1 偽の codex: party.json の network: true で開け、--no-network で閉じる', async () => {
  const dir = newToy();
  partyJson(dir, { agent: 'codex', network: true, parallel: 1 });
  const r = await party(dir, ['--only', 'a', '--rounds', '1'], WITH_CODEX);
  assert.equal(r.code, 2, r.all);
  assert.deepEqual(recorded(dir)[0]?.argv, codexArgv(dir, { net: true }), r.all);

  const n = await party(dir, ['--only', 'b', '--rounds', '1', '--no-network'], WITH_CODEX);
  assert.equal(n.code, 2, n.all);
  const b = recorded(dir).find((x) => x.file.startsWith('b-'));
  assert.ok(b, n.all);
  assert.deepEqual(b.argv, codexArgv(dir), '--no-network なら閉じたまま');
});
