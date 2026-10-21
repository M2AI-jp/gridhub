// S8「歩く道具と作戦の窓口」— CONTRACTS §47（第11章）の伝令の分。
// MCP の masume_step、POST /api/sortie の tactic、GET /api/party の tactic。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getJson, newToy, readLog, waitUntil, startServeEnv, fakeAgent, mcpClient } from '../helpers3.mjs';
import { newDungeon, setCases, passAll } from '../helpers5.mjs';

const post = (url, body, headers = { 'x-masume': '1' }) =>
  getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const partyJson = (dir, obj) => writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify(obj));

test('§47.1 MCP の masume_step: 今のダンジョンの判定だけを走らせ、テスト1件ずつ記録する（as の既定は character）', async () => {
  const dir = newDungeon();
  const c = mcpClient(['--dir', dir], { cwd: dir });
  try {
    await c.start();
    const list = await c.request('tools/list');
    const tool = list.result.tools.find((t) => t.name === 'masume_step');
    assert.ok(tool, 'masume_step がある');
    assert.deepEqual(tool.inputSchema.required, ['character']);
    assert.ok(tool.inputSchema.properties.as);
    assert.match(tool.description, /[ぁ-ん]/);

    setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
    const fail = await c.call('masume_step', { character: 'a' });
    assert.equal(fail.isError, true, 'テストが落ちていれば isError');
    assert.match(fail.text, /歩いた: a A1 テスト 1\/2/);
    assert.match(fail.text, /いちばん手前のモンスター: y が 2/);
    const stepped = readLog(dir).filter((e) => e.type === 'stepped');
    assert.equal(stepped.length, 1);
    assert.equal(stepped[0].actor, 'a', 'as の既定は character');

    passAll(dir, 'A1');
    const ok = await c.call('masume_step', { character: 'a', as: 'gm' });
    assert.equal(ok.isError, false, ok.text);
    assert.match(ok.text, /全部倒した/);
    assert.equal(readLog(dir).filter((e) => e.type === 'stepped').at(-1).actor, 'gm');
    const bad = await c.call('masume_step', { character: 'h' });
    assert.equal(bad.isError, true);
    assert.match(bad.text, /E_NEEDS_STAMP/);
  } finally {
    await c.close();
  }
});

test('§47.3 GET /api/party の tactic: party.json の tactic が3つの id のどれかならその id、それ以外は null', async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir);
  try {
    assert.equal((await getJson(`${srv.url}/api/party`)).body.tactic, null, 'party.json が無ければ null');
    for (const id of ['careful', 'balanced', 'bold']) {
      partyJson(dir, { agent: 'claude', tactic: id });
      assert.equal((await getJson(`${srv.url}/api/party`)).body.tactic, id);
    }
    for (const other of ['いのちだいじに', 'yolo', 3, null]) {
      partyJson(dir, { agent: 'claude', tactic: other });
      assert.equal((await getJson(`${srv.url}/api/party`)).body.tactic, null, `${JSON.stringify(other)} は null`);
    }
  } finally {
    await srv.stop();
  }
});

test('§47.2 POST /api/sortie の tactic: id なら --tactic を渡す。省略なら何も足さない。ほかの値は 400 E_USAGE（何も起動しない）', async () => {
  const dir = newToy();
  const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('lazy') });
  const finish = () => waitUntil(async () => {
    const x = await getJson(`${srv.url}/api/party`);
    return x.body.running === false && x.body.code !== null ? x.body : null;
  }, { timeout: 60000, message: 'パーティが止まる' });
  try {
    for (const bad of ['yolo', 'いのちだいじに', 1, true, {}]) {
      const r = await post(`${srv.url}/api/sortie`, { agent: 'claude', tactic: bad });
      assert.equal(r.status, 400, `${JSON.stringify(bad)}: ${r.text}`);
      assert.equal(r.body.code, 'E_USAGE');
    }
    const idle = await getJson(`${srv.url}/api/party`);
    assert.equal(idle.body.running, false, '不正な作戦では何も起動しない');
    assert.equal(idle.body.code ?? null, null);

    const r = await post(`${srv.url}/api/sortie`, { agent: 'claude', tactic: 'bold', only: ['a'] });
    assert.equal(r.status, 202, r.text);
    const p = await finish();
    assert.match(p.log, /--tactic bold/, '軍師に --tactic を渡す');
    assert.match(p.log, /出撃準備: [^\n]*作戦: ガンガンいこうぜ/);

    const n = await post(`${srv.url}/api/sortie`, { agent: 'claude', tactic: null, only: ['a'] });
    assert.equal(n.status, 202, n.text);
    const q = await finish();
    const last = q.log.slice(q.log.lastIndexOf('===== 出撃'));
    assert.doesNotMatch(last.split('\n').slice(0, 3).join('\n'), /--tactic/, 'null なら何も足さない');
    assert.match(last, /作戦: バッチリがんばれ/, '既定の作戦');
  } finally {
    await srv.stop();
  }
});
