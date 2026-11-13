// S17「判定中の Git push とロック・封印の競合」— 指令の回帰判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  GIT_ENV, NO_GH, ROOT, bareRemote, char, gitc, masume, masumeAsync, newToy, passAll,
  readLog, setupDungeon, setupToy, tmp, view, waitUntil,
} from '../helpers6.mjs';
import { handPathProblem } from '../../src/engine/index.js';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const run = (dir, args) => masume([...args, '--dir', dir], { env: ENV });
const check = (dir, who) => run(dir, ['check', who, '--as', who]);

test('auto_push の遅い push 中もロックを放し、note・verify・saved・pushed が成立する', { timeout: 60000 }, async () => {
  const dir = tmp('gridhub-s17-push-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const bare = bareRemote();
  assert.equal(gitc(dir, 'remote', 'add', 'origin', bare).code, 0);
  const started = join(bare, 'push.started');
  const release = join(bare, 'push.release');
  const hook = join(bare, 'hooks', 'pre-receive');
  writeFileSync(hook, `#!/bin/sh
touch '${started}'
while [ ! -f '${release}' ]; do sleep 0.05; done
`);
  chmodSync(hook, 0o755);
  assert.equal(run(dir, ['remote', '--auto-push', 'on']).code, 0);

  passAll(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'a', 'during-push.js'), 'export const value = 1;\n');
  passAll(dir, 'A2');
  const judging = masumeAsync(['check', 'a', '--dir', dir, '--as', 'a'], { cwd: dir, env: ENV });
  await waitUntil(() => existsSync(started), { timeout: 30000, message: '遅い push が始まる' });
  assert.equal(existsSync(join(dir, '.masume', 'lock')), false, 'push 中は冒険の書のロックを持たない');

  const notePromise = masumeAsync(['note', 'a', 'push 中の申し送り', '--dir', dir, '--as', 'a'], { cwd: dir, env: ENV });
  let timer;
  const noted = await new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), 10000);
    notePromise.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
  writeFileSync(release, '');
  const judged = await judging;
  assert.ok(noted, 'push を解放する前に note が終わる');
  assert.equal(noted.code, 0, noted?.all);

  assert.equal(judged.code, 0, judged.all);
  assert.equal(run(dir, ['verify']).code, 0, run(dir, ['verify']).all);
  const log = readLog(dir);
  const saved = log.find((event) => event.type === 'saved' && event.data.node === 'AC');
  const pushed = log.find((event) => event.type === 'pushed' && event.data.node === 'AC');
  assert.ok(saved?.data.commit, 'saved が記録される');
  assert.ok(pushed, 'pushed が記録される');
  assert.ok(pushed.seq > saved.seq, 'pushed は saved のあとに記録される');
  assert.ok(log.some((event) => event.type === 'note' && event.data.text === 'push 中の申し送り'));
  assert.equal(view(dir).push.commit, saved.data.commit);
});

test('古いロックを複数の待ち手が処理しても、取得済みの新しいロックを消さない', { timeout: 30000 }, async () => {
  const dir = tmp('gridhub-s17-lock-');
  mkdirSync(join(dir, '.masume'), { recursive: true });
  const lock = join(dir, '.masume', 'lock');
  const critical = join(dir, '.masume', 'critical');
  writeFileSync(lock, JSON.stringify({ pid: 999999999, actor: 'dead', ts: new Date(0).toISOString() }));
  const old = new Date(Date.now() - 60_000);
  utimesSync(lock, old, old);
  const store = pathToFileURL(join(ROOT, 'src', 'engine', 'store.js')).href;
  const script = `import { closeSync, openSync, unlinkSync } from 'node:fs';
import { withLock } from ${JSON.stringify(store)};
const root = process.argv[1];
withLock(root, 'waiter', () => {
  let fd;
  try { fd = openSync(root + '/.masume/critical', 'wx'); }
  catch { process.exitCode = 17; return; }
  try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250); }
  finally { closeSync(fd); unlinkSync(root + '/.masume/critical'); }
});
`;
  const children = Array.from({ length: 8 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir], { stdio: 'ignore' });
    child.once('close', (code) => resolve(code));
  }));
  const codes = await Promise.all(children);
  assert.deepEqual(codes, Array(8).fill(0));
  assert.equal(existsSync(lock), false, '最後にロックが片づく');
});

test('保護された場所・封印ファイル・map.json は大文字小文字を変えても書けない', () => {
  const dir = newToy();
  for (const path of ['.MASUME/log.jsonl', '.Git/config', 'Checks/FLAG.MJS', 'thing.MAP.JSON']) {
    const problem = handPathProblem(dir, 'a', path);
    assert.equal(problem?.code, 'E_SEALED', path);
  }
});

test('判定中に正しく封印し直されたら seal_broken ではなく E_CONFLICT になる', () => {
  const dir = tmp('gridhub-s17-reseal-');
  setupToy(dir);
  const bin = join(ROOT, 'bin', 'gridhub.js');
  writeFileSync(join(dir, 'checks', 'flag.mjs'), `import { spawnSync } from 'node:child_process';
const r = spawnSync(process.execPath, [${JSON.stringify(bin)}, 'seal', 'A1', '--dir', process.env.MASUME_ROOT, '--as', 'gm'], {
  cwd: process.env.MASUME_ROOT, env: { ...process.env, MASUME_DIR: '' }, encoding: 'utf8'
});
if (r.status !== 0) { console.error(r.stdout, r.stderr); process.exit(r.status || 1); }
console.log('PASS A1');
`);
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir, env: ENV }).code, 0);
  const before = readLog(dir).length;
  const result = check(dir, 'a');
  assert.equal(result.code, 2, result.all);
  assert.match(result.all, /E_CONFLICT/);
  const added = readLog(dir).slice(before);
  assert.deepEqual(added.map((event) => event.type), ['sealed']);
  assert.equal(added.some((event) => event.type === 'seal_broken'), false);
  assert.equal(char(view(dir), 'a').at, 'A1');
  assert.equal(run(dir, ['verify']).code, 0);
});
