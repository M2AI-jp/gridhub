// S10「自動で送る設定の窓口」— CONTRACTS §59.5（第13章）。POST /api/git/auto で .masume/git.json を書き、GET /api/git の auto_push に映る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServeEnv } from '../helpers2.mjs';
import { tmp, masume, getJson, setupDungeon, gitc, NO_GH, GIT_ENV } from '../helpers6.mjs';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const post = (url, body, headers = { 'X-Masume': '1' }) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('§59.5 POST /api/git/auto で切り替え、GET /api/git の auto_push に映る（X-Masume が要る・真偽でなければ 400）', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-s10-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const srv = await startServeEnv(dir, ENV);
  try {
    assert.equal((await getJson(`${srv.url}/api/git`)).body.auto_push, false, '初めはオフ');
    assert.equal((await post(`${srv.url}/api/git/auto`, { auto_push: true }, {})).status, 403, 'X-Masume が無ければ 403');
    assert.equal((await post(`${srv.url}/api/git/auto`, { auto_push: true }, { 'X-Masume': '1', Origin: 'http://evil.example' })).status, 403);
    const bad = await post(`${srv.url}/api/git/auto`, { auto_push: 'yes' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'E_USAGE');
    const on = await post(`${srv.url}/api/git/auto`, { auto_push: true });
    assert.equal(on.status, 200, JSON.stringify(on.body));
    assert.deepEqual(on.body, { ok: true, auto_push: true });
    assert.equal(JSON.parse(readFileSync(join(dir, '.masume', 'git.json'), 'utf8')).auto_push, true);
    assert.equal((await getJson(`${srv.url}/api/git`)).body.auto_push, true);
    const off = await post(`${srv.url}/api/git/auto`, { auto_push: false });
    assert.deepEqual(off.body, { ok: true, auto_push: false });
    assert.equal((await getJson(`${srv.url}/api/git`)).body.auto_push, false);
  } finally {
    await srv.stop();
  }
});
