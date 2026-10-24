// S9「GitHub に送る窓口」— CONTRACTS §56.3（第12章）。gridhub serve の GET /api/git と POST /api/git/push。
// リモートは手元の bare リポジトリ。本物の GitHub には触らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServeEnv } from '../helpers2.mjs';
import {
  tmp, masume, masumeJson, getJson, setupDungeon, gitc, bareRemote, remoteHead, commitFile, NO_GH, GIT_ENV,
} from '../helpers6.mjs';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const post = (url, headers = { 'X-Masume': '1' }) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{}' });

/** Git の作業ツリーの中の冒険（ふりだしのコミットあり）。remote: bare リポジトリをつなぐか */
function gitDungeon({ remote = true } = {}) {
  const dir = tmp('gridhub-s9-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  const r = masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV });
  assert.equal(r.code, 0, r.all);
  commitFile(dir, 'README.md', '# ダンジョン\n');
  const bare = remote ? bareRemote() : null;
  if (bare) assert.equal(gitc(dir, 'remote', 'add', 'origin', bare).code, 0);
  return { dir, bare };
}

test('§56.3 GET /api/git は gridhub remote --json と同じ。POST /api/git/push で bare リポジトリに送れる（X-Masume が要る）', { timeout: 120000 }, async () => {
  const { dir, bare } = gitDungeon();
  const srv = await startServeEnv(dir, ENV);
  try {
    let g = await getJson(`${srv.url}/api/git`);
    assert.equal(g.status, 200);
    assert.deepEqual(g.body, masumeJson(['remote', '--dir', dir], { env: ENV }).data, 'remote --json と同じ');
    assert.equal(g.body.upstream, null);
    assert.equal(g.body.remote.url, bare);

    const denied = await post(`${srv.url}/api/git/push`, {});
    assert.equal(denied.status, 403, 'X-Masume が無ければ 403');
    assert.equal(remoteHead(bare), null, '送っていない');
    const cross = await post(`${srv.url}/api/git/push`, { 'X-Masume': '1', Origin: 'http://evil.example' });
    assert.equal(cross.status, 403, 'よそのページからは 403');

    const head = gitc(dir, 'rev-parse', 'HEAD').out;
    const ok = await post(`${srv.url}/api/git/push`);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.ok, true);
    assert.equal(ok.body.branch, 'main');
    assert.equal(ok.body.commit, head);
    assert.equal(ok.body.ahead, 0);
    assert.equal(remoteHead(bare), head, 'bare リポジトリに届いた');
    g = await getJson(`${srv.url}/api/git`);
    assert.equal(g.body.upstream, 'origin/main');
    assert.equal(g.body.ahead, 0);

    // 手でコミットすると ahead 1、送ると 0
    const h2 = commitFile(dir, 'notes.txt', 'メモ\n');
    assert.equal((await getJson(`${srv.url}/api/git`)).body.ahead, 1);
    const again = await post(`${srv.url}/api/git/push`);
    assert.equal(again.status, 200);
    assert.equal(remoteHead(bare), h2);

    // 先に進んだリモートには force push しない → 409
    const other = tmp('gridhub-s9-other-');
    gitc(other, 'clone', '-q', bare, '.');
    const theirs = commitFile(other, 'theirs.txt', 'ほかの人\n');
    gitc(other, 'push', '-q', 'origin', 'main');
    commitFile(dir, 'mine.txt', 'わたし\n');
    const conflict = await post(`${srv.url}/api/git/push`);
    assert.equal(conflict.status, 409, JSON.stringify(conflict.body));
    assert.equal(conflict.body.ok, false);
    assert.equal(remoteHead(bare), theirs, 'リモートは上書きされない');
  } finally {
    await srv.stop();
  }
});

test('§56.3 リモートが無い・Git の外なら POST /api/git/push は 400（GET は様子を返す）', { timeout: 120000 }, async () => {
  const { dir } = gitDungeon({ remote: false });
  let srv = await startServeEnv(dir, ENV);
  try {
    const g = await getJson(`${srv.url}/api/git`);
    assert.equal(g.status, 200);
    assert.equal(g.body.inside, true);
    assert.equal(g.body.remote, null);
    const r = await post(`${srv.url}/api/git/push`);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'E_NO_REMOTE');
  } finally {
    await srv.stop();
  }

  const outside = tmp('gridhub-s9-out-');
  setupDungeon(outside);
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: outside, env: ENV }).code, 0);
  srv = await startServeEnv(outside, ENV);
  try {
    const g = await getJson(`${srv.url}/api/git`);
    assert.equal(g.status, 200);
    assert.equal(g.body.inside, false);
    const r = await post(`${srv.url}/api/git/push`);
    assert.equal(r.status, 400);
    assert.equal(r.body.code, 'E_NO_GIT');
  } finally {
    await srv.stop();
  }
});
