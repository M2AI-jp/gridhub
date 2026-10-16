// S5「LLM の道具箱を開く」— CONTRACTS §19 の MCP サーバー（masume mcp）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmp, newToy, flag, view, char, readLog, mcpClient, fakeGm } from '../helpers3.mjs';

test('初期化・道具の一覧・資料', async () => {
  const dir = newToy();
  const c = mcpClient(['--dir', dir], { cwd: dir });
  try {
    const init = await c.start();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    assert.equal(init.result.serverInfo.name, 'masume');
    assert.ok(init.result.capabilities.tools);
    assert.ok(init.result.capabilities.resources);
    const ping = await c.request('ping');
    assert.deepEqual(ping.result, {});
    const list = await c.request('tools/list');
    const names = list.result.tools.map((t) => t.name).sort();
    assert.deepEqual(names, ['masume_brief', 'masume_check', 'masume_jumon', 'masume_log', 'masume_note', 'masume_quest', 'masume_stamp', 'masume_status', 'masume_verify']);
    for (const t of list.result.tools) {
      assert.ok(t.description && /[ぁ-んァ-ン一-龥]/.test(t.description), `${t.name} に日本語の説明`);
      assert.equal(t.inputSchema.type, 'object');
    }
    assert.ok(list.result.tools.find((t) => t.name === 'masume_brief').inputSchema.required.includes('character'));
    const res = await c.request('resources/list');
    const uris = res.result.resources.map((r) => r.uri);
    for (const u of ['masume://docs/RULEBOOK.md', 'masume://docs/GM_GUIDE.md', 'masume://docs/CONTRACTS.md']) assert.ok(uris.includes(u), u);
    const read = await c.request('resources/read', { uri: 'masume://docs/RULEBOOK.md' });
    assert.equal(read.result.contents[0].mimeType, 'text/markdown');
    assert.match(read.result.contents[0].text, /マスメ ルールブック/);
    const bad = await c.request('resources/read', { uri: 'masume://docs/NOPE.md' });
    assert.equal(bad.error.code, -32602);
    const unknown = await c.request('no/such/method');
    assert.equal(unknown.error.code, -32601);
    c.raw('{これは壊れたJSON');
    await new Promise((r) => setTimeout(r, 300));
    const parseErr = c.stray.find((m) => m && m.error && m.error.code === -32700);
    assert.ok(parseErr, '壊れた JSON には -32700');
    assert.equal(parseErr.id, null);
  } finally {
    await c.close();
  }
});

test('道具で遊ぶ: 指令書を読み、宣言判定し、日誌を書く', async () => {
  const dir = newToy();
  const c = mcpClient(['--dir', dir], { cwd: dir });
  try {
    await c.start();
    const brief = await c.call('masume_brief', { character: 'a' });
    assert.equal(brief.isError, false);
    assert.match(brief.text, /剣をとぐ/);
    assert.match(brief.text, /ふっかつのじゅもん/);
    const bj = await c.call('masume_brief', { character: 'a', json: true });
    assert.equal(JSON.parse(bj.text).current.id, 'A1');

    const fail = await c.call('masume_check', { target: 'a' });
    assert.equal(fail.isError, true, '判定失敗は isError');
    assert.match(fail.text, /判定失敗/);
    flag(dir, 'A1');
    const ok = await c.call('masume_check', { target: 'a' });
    assert.equal(ok.isError, false, ok.text);
    assert.match(ok.text, /判定成功/);
    assert.equal(char(view(dir), 'a').at, 'A2');
    const passed = readLog(dir).filter((e) => e.type === 'check_passed').pop();
    assert.equal(passed.actor, 'a', 'as の既定はキャラクター');

    const note = await c.call('masume_note', { character: 'a', text: 'MCP から書いた日誌' });
    assert.equal(note.isError, false);
    assert.equal(readLog(dir).pop().data.text, 'MCP から書いた日誌');
    const st = await c.call('masume_status', { json: true });
    assert.equal(JSON.parse(st.text).quest.id, 'TOY');
    const j = await c.call('masume_jumon', {});
    assert.match(j.text, /[ぁ-ん]{3}( [ぁ-ん]{3}){3}/);
    const v = await c.call('masume_verify', {});
    assert.equal(v.isError, false);
    assert.match(v.text, /冒険の書は正常です/);
    const lg = await c.call('masume_log', { tail: 3 });
    assert.match(lg.text, /note/);
    const stamp = await c.call('masume_stamp', { node: 'H1', as: 'h' });
    assert.equal(stamp.isError, false, stamp.text);
    assert.equal(char(view(dir), 'h').at, 'FIN');
    const nope = await c.call('masume_teleport', {});
    assert.equal(nope.isError, true);
    const missing = await c.call('masume_brief', {});
    assert.equal(missing.isError, true, '引数の不足');
  } finally {
    await c.close();
  }
});

test('冒険の書が無くても起動し、願いから冒険を始められる（cmd: は受け付けない）', async () => {
  const root = tmp('masume-mcp-');
  const c = mcpClient(['--dir', root], { cwd: root, env: { MASUME_GM_OVERRIDE: fakeGm('good') } });
  try {
    await c.start();
    const st = await c.call('masume_status', {});
    assert.equal(st.isError, true, 'まだ冒険の書が無い');
    const bad = await c.call('masume_quest', { wish: 'メモ', gm: 'cmd:true' });
    assert.equal(bad.isError, true);
    const q = await c.call('masume_quest', { wish: 'メモアプリのようなアプリを作りたい', gm: 'claude' }, { timeout: 60000 });
    assert.equal(q.isError, false, q.text);
    assert.match(q.text, /ふっかつのじゅもん/);
    assert.equal(view(root).quest.id, 'MEMO');
  } finally {
    await c.close();
  }
});
