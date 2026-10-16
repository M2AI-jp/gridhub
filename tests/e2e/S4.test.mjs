// S4「入口と出撃の窓口を開く」— CONTRACTS §15（ロビー・/api/quest・/api/sortie・/api/party）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmp, getJson, newToy, flag, view, char, sseClient, waitUntil, startServeEnv, fakeGm, fakeAgent } from '../helpers2.mjs';

const post = (url, body, headers = { 'x-masume': '1' }) =>
  getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('ロビー: 冒険の書が無くても開き、願いから冒険が生まれると知らせる', async () => {
  const root = tmp('masume-lobby-');
  const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('good') });
  const stream = sseClient(`${srv.url}/api/stream`);
  try {
    const st = await getJson(`${srv.url}/api/state`);
    assert.equal(st.status, 404, st.text);
    assert.equal(st.body.code, 'E_NO_GAME');
    assert.equal((await getJson(`${srv.url}/`)).status, 200);
    await stream.waitFor('hello');

    assert.equal((await post(`${srv.url}/api/quest`, { wish: 'メモ', gm: 'claude' }, {})).status, 403, 'X-Masume が要る');
    assert.equal((await post(`${srv.url}/api/quest`, { wish: '', gm: 'claude' })).status, 400, '願いが空');
    assert.equal((await post(`${srv.url}/api/quest`, { wish: 'メモ', gm: 'cmd:true' })).status, 400, 'HTTP から cmd: は受けない');
    assert.equal((await post(`${srv.url}/api/quest`, { wish: 'x'.repeat(2001), gm: 'claude' })).status, 400, '願いが長すぎる');

    const since = stream.events.length;
    const r = await post(`${srv.url}/api/quest`, { wish: 'メモアプリのようなアプリを作りたい', gm: 'claude', model: 'sonnet' });
    assert.equal(r.status, 202, r.text);
    assert.deepEqual(r.body, { ok: true });
    await stream.waitFor('change', { since, timeout: 15000 });
    const s = await waitUntil(async () => {
      const x = await getJson(`${srv.url}/api/state`);
      return x.status === 200 ? x.body : null;
    }, { timeout: 15000, message: '冒険の書が生まれる' });
    assert.equal(s.quest.id, 'MEMO');
    const q = await waitUntil(async () => {
      const x = await getJson(`${srv.url}/api/quest`);
      return x.body.running === false && x.body.code !== null ? x.body : null;
    }, { message: '語り部が終わる' });
    assert.equal(q.ok, true);
    assert.equal(q.code, 0);
    assert.match(q.log, /偽のGM/);
    const again = await post(`${srv.url}/api/quest`, { wish: 'もう一つ', gm: 'claude' });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, 'E_EXISTS');
  } finally {
    stream.close();
    await srv.stop();
  }
});

test('出撃の窓口: パーティを起動し、様子を見せ、止められる', async () => {
  const dir = newToy({ withB3: true });
  flag(dir, 'G1');
  flag(dir, 'FIN');
  const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('good') });
  try {
    assert.equal((await post(`${srv.url}/api/sortie`, { agent: 'cmd:true' })).status, 400);
    assert.equal((await post(`${srv.url}/api/sortie`, { agent: 'claude', parallel: 99 })).status, 400);
    assert.equal((await post(`${srv.url}/api/sortie`, { agent: 'claude' }, {})).status, 403);
    const idle = await getJson(`${srv.url}/api/party`);
    assert.deepEqual([idle.body.ok, idle.body.running], [true, false]);

    const r = await post(`${srv.url}/api/sortie`, { agent: 'claude', model: 'sonnet', parallel: 2 });
    assert.equal(r.status, 202, r.text);
    const p = await waitUntil(async () => {
      const x = await getJson(`${srv.url}/api/party`);
      return x.body.running === false && x.body.code !== null ? x.body : null;
    }, { timeout: 60000, message: 'パーティが止まる' });
    assert.equal(p.code, 2);
    assert.match(p.log, /ハンコ待ち/);
    const v = view(dir);
    assert.equal(char(v, 'a').at, 'FIN');
    assert.equal(char(v, 'b').at, 'FIN');
  } finally {
    await srv.stop();
  }

  // 出撃中は二重に起動できず、止められる
  const dir2 = newToy();
  const srv2 = await startServeEnv(dir2, { MASUME_AGENT_OVERRIDE: fakeAgent('slow', 20000) });
  try {
    assert.equal((await post(`${srv2.url}/api/sortie`, { agent: 'codex' })).status, 202);
    await waitUntil(async () => (await getJson(`${srv2.url}/api/party`)).body.running === true, { message: '出撃中' });
    const busy = await post(`${srv2.url}/api/sortie`, { agent: 'codex' });
    assert.equal(busy.status, 409);
    assert.equal(busy.body.code, 'E_BUSY');
    const stop = await post(`${srv2.url}/api/party/stop`, {});
    assert.equal(stop.status, 200);
    assert.deepEqual(stop.body, { ok: true, stopped: true });
    const p = await waitUntil(async () => {
      const x = await getJson(`${srv2.url}/api/party`);
      return x.body.running === false ? x.body : null;
    }, { timeout: 15000, message: '止まる' });
    assert.equal(p.code, 130);
    const none = await post(`${srv2.url}/api/party/stop`, {});
    assert.deepEqual(none.body, { ok: true, stopped: false });
  } finally {
    await srv2.stop();
  }

  // 冒険の書が無ければ出撃できない
  const empty = tmp('masume-lobby-');
  const srv3 = await startServeEnv(empty);
  try {
    const r = await post(`${srv3.url}/api/sortie`, { agent: 'claude' });
    assert.equal(r.status, 409);
    assert.equal(r.body.code, 'E_NO_GAME');
  } finally {
    await srv3.stop();
  }
});
