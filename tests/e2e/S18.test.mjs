// S18: 盤面からのマージと、書き込みの窓口の守り（CONTRACTS §80.32・§80.33。監査の手直し）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { startServeEnv } from '../helpers2.mjs';
import { tmp, masume, setupDungeon, gitc, GIT_ENV, ROOT } from '../helpers6.mjs';
import { fromLoopback } from '../../src/server/index.js';

const HEAD = 'a'.repeat(40);

function fakeGh() {
  const gh = join(tmp('s18-gh-'), 'gh');
  const args = `${gh}.args`;
  const open = JSON.stringify([{ number: 7, title: 'x', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'feature/s18', headRefOid: HEAD, author: { login: 'a' } }]);
  writeFileSync(gh, `#!/bin/sh\nif [ "$2" = "list" ]; then echo '${open}'; exit 0; fi\nif [ "$2" = "merge" ]; then echo "$@" > '${args}'; exit 0; fi\nexit 0\n`);
  chmodSync(gh, 0o755);
  return { gh, args };
}

function game() {
  const dir = tmp('s18-');
  gitc(dir, 'init', '-q', '-b', 'main');
  setupDungeon(dir, { save: true });
  masume(['new', 'dungeon.map.json'], { cwd: dir, env: GIT_ENV });
  gitc(dir, 'checkout', '-q', '-b', 'feature/s18');
  return dir;
}

const post = (url, body) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });

test('§80.32 盤面のマージは、盤面が見ていた先頭のコミットのときだけ（gh pr merge --match-head-commit）', async () => {
  const dir = game();
  const { gh, args } = fakeGh();
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  try {
    const bad = await post(`${srv.url}/api/prs/merge`, { number: 7, head: 'main' });
    assert.equal(bad.status, 400, 'head が40桁の16進でなければ 400');
    assert.equal(existsSync(args), false, '400 のときは gh を呼ばない');

    const ok = await post(`${srv.url}/api/prs/merge`, { number: 7, head: HEAD.toUpperCase() });
    assert.equal(ok.status, 200, await ok.clone().text());
    const called = readFileSync(args, 'utf8').trim().split(/\s+/u);
    assert.deepEqual(called.slice(0, 4), ['pr', 'merge', '7', '--merge']);
    const at = called.indexOf('--match-head-commit');
    assert.ok(at > 0, `--match-head-commit を渡す: ${called.join(' ')}`);
    assert.equal(called[at + 1], HEAD, '先頭のコミットは小文字の40桁で渡す');

    const board = readFileSync(join(ROOT, 'web', 'board', 'march-prs.js'), 'utf8');
    assert.match(board, /merge\(p\.number,\s*p\.headRefOid\)/u, '盤面は札の PR の先頭のコミットを送る');
  } finally {
    await srv.stop();
  }
});

test('§80.33 書き込み・起動の窓口（POST）は、ループバックからだけ受ける', () => {
  for (const address of ['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1']) {
    assert.equal(fromLoopback({ socket: { remoteAddress: address } }), true, address);
  }
  for (const address of ['192.168.1.5', '10.0.0.2', '::ffff:192.168.1.5', 'fe80::1', '', undefined]) {
    assert.equal(fromLoopback({ socket: { remoteAddress: address } }), false, String(address));
  }
});

test('§80.33 --host 0.0.0.0 でも、別の住所から来た POST は 403（見るだけはできる）', async (t) => {
  const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  if (!lan) {
    t.skip('この機械に LAN の IPv4 が無い');
    return;
  }
  const dir = game();
  const proc = spawn(process.execPath, [join(ROOT, 'bin', 'gridhub.js'), 'serve', '--port', '0', '--host', '0.0.0.0', '--dir', dir, '--no-open'], {
    cwd: dir, env: { ...process.env, ...GIT_ENV, NO_COLOR: '1', MASUME_DIR: '' },
  });
  try {
    const url = await new Promise((res, rej) => {
      let out = '';
      const timer = setTimeout(() => rej(new Error(`serve が起動しない:\n${out}`)), 15000);
      proc.stdout.on('data', (d) => {
        out += d;
        const m = out.match(/http:\/\/[^\s]+/u);
        if (m) {
          clearTimeout(timer);
          res(m[0].replace(/\/$/u, ''));
        }
      });
    });
    const port = new URL(url).port;
    const near = await post(`http://127.0.0.1:${port}/api/note`, { character: 'nobody', text: 'x' });
    assert.notEqual(near.status, 403, 'ループバックからは窓口まで届く');
    const far = await fetch(`http://${lan}:${port}/api/note`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1', host: `${lan}:${port}` },
      body: JSON.stringify({ character: 'nobody', text: 'x' }),
    });
    assert.equal(far.status, 403, 'LAN の住所からの POST は断る');
    const look = await fetch(`http://${lan}:${port}/api/state`);
    assert.equal(look.status, 200, '見るだけ（GET）はできる');
  } finally {
    proc.kill('SIGTERM');
  }
});
