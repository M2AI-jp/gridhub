// S7「窓口から箱のソケットを開ける」— CONTRACTS §33（第7章）。
// 盤面だけで遊ぶ人も、POST /api/sortie・POST /api/quest・MCP の masume_quest で allow_listen を頼める。GET /api/party は party.json の allow_listen を見せる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, getJson, newToy, waitUntil, startServeEnv, fakeGm, fakeAgent } from '../helpers2.mjs';
import { mcpClient } from '../helpers3.mjs';

const post = (url, body) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });
const NOTICE = /^箱のソケット: /m;

/** パーティが止まるまで待って、その様子（log・code）を返す */
async function partyDone(url) {
  return waitUntil(async () => {
    const x = await getJson(`${url}/api/party`);
    return x.body.running === false && x.body.code !== null ? x.body : null;
  }, { timeout: 60000, message: 'パーティが止まる' });
}

const partyJson = (dir, value) => writeFileSync(join(dir, '.masume', 'party.json'), typeof value === 'string' ? value : JSON.stringify(value));

test('§33.1 POST /api/sortie の allow_listen: true は --allow-listen、false は --no-allow-listen、省略は party.json のまま', { timeout: 180000 }, async () => {
  // true: party.json が無くても開ける（エージェントが差し替えられていても「箱のソケット:」の知らせが出る）
  {
    const dir = newToy();
    const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('good') });
    try {
      const r = await post(`${srv.url}/api/sortie`, { agent: 'codex', allow_listen: true });
      assert.equal(r.status, 202, r.text);
      const p = await partyDone(srv.url);
      assert.match(p.log, NOTICE, `allow_listen: true で「箱のソケット:」の知らせ\n${p.log}`);
    } finally {
      await srv.stop();
    }
  }
  // false: party.json が開けていても、その出撃だけ閉じる
  {
    const dir = newToy();
    partyJson(dir, { allow_listen: true });
    const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('good') });
    try {
      const r = await post(`${srv.url}/api/sortie`, { agent: 'codex', allow_listen: false });
      assert.equal(r.status, 202, r.text);
      const p = await partyDone(srv.url);
      assert.doesNotMatch(p.log, NOTICE, `allow_listen: false なら閉じる（--no-allow-listen）\n${p.log}`);
    } finally {
      await srv.stop();
    }
  }
  // 省略: party.json の値が効く（開けている / 書いていない）
  for (const [json, expect] of [[{ allow_listen: true }, true], [null, false]]) {
    const dir = newToy();
    if (json) partyJson(dir, json);
    const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('good') });
    try {
      const r = await post(`${srv.url}/api/sortie`, { agent: 'codex' });
      assert.equal(r.status, 202, r.text);
      const p = await partyDone(srv.url);
      if (expect) assert.match(p.log, NOTICE, `省略なら party.json の allow_listen: true が効く\n${p.log}`);
      else assert.doesNotMatch(p.log, NOTICE, `省略で party.json も無ければ開けない\n${p.log}`);
    } finally {
      await srv.stop();
    }
  }
});

test('§33.1 allow_listen が真偽値でなければ 400 E_USAGE で、パーティは起動しない', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('good') });
  try {
    for (const v of ['true', 1, 0, {}, []]) {
      const r = await post(`${srv.url}/api/sortie`, { agent: 'codex', allow_listen: v });
      assert.equal(r.status, 400, `allow_listen: ${JSON.stringify(v)} → ${r.text}`);
      assert.equal(r.body.code, 'E_USAGE');
    }
    const p = await getJson(`${srv.url}/api/party`);
    assert.equal(p.body.running, false);
    assert.equal(p.body.code, null, 'パーティは一度も起動していない');
    // null は省略と同じ
    const ok = await post(`${srv.url}/api/sortie`, { agent: 'codex', allow_listen: null });
    assert.equal(ok.status, 202, ok.text);
    await partyDone(srv.url);
  } finally {
    await srv.stop();
  }
});

test('§33.3 GET /api/party は party.json の出撃の既定値（allow_listen・agent・parallel）を見せる', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir);
  try {
    const get = async () => {
      const b = (await getJson(`${srv.url}/api/party`)).body;
      return { allow_listen: b.allow_listen, agent: b.agent, parallel: b.parallel, ok: b.ok };
    };
    assert.deepEqual(await get(), { allow_listen: false, agent: null, parallel: null, ok: true }, 'party.json が無い');
    partyJson(dir, { allow_listen: true, agent: 'codex', parallel: 2 });
    assert.deepEqual(await get(), { allow_listen: true, agent: 'codex', parallel: 2, ok: true });
    partyJson(dir, { agent: 'claude', parallel: 8 });
    assert.deepEqual(await get(), { allow_listen: false, agent: 'claude', parallel: 8, ok: true });
    partyJson(dir, { allow_listen: 'true', agent: 'cmd:true', parallel: 9 });
    assert.deepEqual(await get(), { allow_listen: false, agent: null, parallel: null, ok: true }, '文字列の "true"・cmd:・範囲の外は既定値にしない');
    partyJson(dir, { allow_listen: 1, agent: 'gpt', parallel: 1.5 });
    assert.deepEqual(await get(), { allow_listen: false, agent: null, parallel: null, ok: true });
    partyJson(dir, '{ こわれた');
    assert.deepEqual(await get(), { allow_listen: false, agent: null, parallel: null, ok: true }, '壊れた party.json でも窓口は答える');
  } finally {
    await srv.stop();
  }
  // 冒険の書が無くても答える
  const empty = tmp('masume-lobby-');
  const srv2 = await startServeEnv(empty);
  try {
    const p = await getJson(`${srv2.url}/api/party`);
    assert.equal(p.status, 200, p.text);
    assert.deepEqual([p.body.allow_listen, p.body.agent, p.body.parallel], [false, null, null]);
  } finally {
    await srv2.stop();
  }
});

test('§33.2 POST /api/quest の allow_listen: true は quest に --allow-listen を渡す（生まれた冒険の party.json に持ち越す）', { timeout: 180000 }, async () => {
  const questDone = (url) => waitUntil(async () => {
    const x = await getJson(`${url}/api/quest`);
    return x.body.running === false && x.body.code !== null ? x.body : null;
  }, { timeout: 60000, message: 'GM が終わる' });
  // true
  {
    const root = tmp('masume-lobby-');
    const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('good') });
    try {
      for (const v of ['yes', 1, {}]) {
        const bad = await post(`${srv.url}/api/quest`, { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', allow_listen: v });
        assert.equal(bad.status, 400, `allow_listen: ${JSON.stringify(v)} → ${bad.text}`);
        assert.equal(bad.body.code, 'E_USAGE');
      }
      assert.equal(existsSync(join(root, '.masume')), false, '400 では GM を呼ばない');
      const r = await post(`${srv.url}/api/quest`, { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', allow_listen: true });
      assert.equal(r.status, 202, r.text);
      const q = await questDone(srv.url);
      assert.equal(q.code, 0, q.log);
      assert.match(q.log, NOTICE, `quest に --allow-listen が届いた（「箱のソケット:」の知らせ）\n${q.log}`);
      const pj = JSON.parse(readFileSync(join(root, '.masume', 'party.json'), 'utf8'));
      assert.equal(pj.allow_listen, true, '生まれた冒険の party.json に allow_listen: true');
      assert.equal((await getJson(`${srv.url}/api/party`)).body.allow_listen, true, 'GET /api/party にも出る');
    } finally {
      await srv.stop();
    }
  }
  // false と省略: 何も足さない
  for (const body of [{ allow_listen: false }, {}]) {
    const root = tmp('masume-lobby-');
    const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('good') });
    try {
      const r = await post(`${srv.url}/api/quest`, { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', ...body });
      assert.equal(r.status, 202, r.text);
      const q = await questDone(srv.url);
      assert.equal(q.code, 0, q.log);
      assert.doesNotMatch(q.log, NOTICE, `${JSON.stringify(body)}: 箱のソケットは頼んでいない\n${q.log}`);
      const file = join(root, '.masume', 'party.json');
      const pj = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
      assert.notEqual(pj.allow_listen, true, `${JSON.stringify(body)}: party.json で開けない`);
    } finally {
      await srv.stop();
    }
  }
});

test('§33.4 MCP の masume_quest も allow_listen を受け取る（説明にも目的と注意）', { timeout: 180000 }, async () => {
  const root = tmp('masume-mcp-');
  const c = mcpClient(['--dir', root], { cwd: root, env: { MASUME_GM_OVERRIDE: fakeGm('good') } });
  try {
    await c.start();
    const list = await c.request('tools/list');
    const tool = list.result.tools.find((t) => t.name === 'masume_quest');
    assert.equal(tool.inputSchema.properties.allow_listen?.type, 'boolean', 'allow_listen は boolean');
    assert.ok(!(tool.inputSchema.required || []).includes('allow_listen'), 'allow_listen は省略できる');
    const desc = `${tool.description}\n${tool.inputSchema.properties.allow_listen.description || ''}`;
    assert.match(desc, /127\.0\.0\.1/, '説明に目的');
    assert.match(desc, /インターネット/, '説明に注意');
    const bad = await c.call('masume_quest', { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', allow_listen: 'yes' });
    assert.equal(bad.isError, true, '真偽値でなければ道具のエラー');
    assert.equal(existsSync(join(root, '.masume')), false);
    const q = await c.call('masume_quest', { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', allow_listen: true }, { timeout: 60000 });
    assert.equal(q.isError, false, q.text);
    const pj = JSON.parse(readFileSync(join(root, '.masume', 'party.json'), 'utf8'));
    assert.equal(pj.allow_listen, true, 'MCP から頼んでも party.json に持ち越す');
  } finally {
    await c.close();
  }
});
