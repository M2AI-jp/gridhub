// S15「ことばの窓口」— 伝令。CONTRACTS §76.2。
// GET /api/words は冒険の設定（--words・GRIDHUB_WORDS・.masume/words.json）を、POST /api/words は設定に書いてその場で切り替える。
// MCP の道具の題・説明と instructions も、いまのことばで出る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newToy, startServe, getJson, mcpClient } from '../helpers3.mjs';

const post = (url, body, headers = { 'X-Masume': '1' }) => getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

test('§76.2 GET /api/words は既定 game（未設定）。POST /api/words で .masume/words.json に書き、GET とエラー文がその場で切り替わる', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServe(dir);
  try {
    let r = await getJson(`${srv.url}/api/words`);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true, words: 'game', set: false, source: 'default' });

    const denied = await post(`${srv.url}/api/words`, { words: 'dev' }, {});
    assert.equal(denied.status, 403, 'X-Masume が無ければ 403');
    const bad = await post(`${srv.url}/api/words`, { words: 'elvish' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'E_USAGE');

    r = await post(`${srv.url}/api/words`, { words: 'dev' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.deepEqual(r.body, { ok: true, words: 'dev' });
    assert.deepEqual(JSON.parse(readFileSync(join(dir, '.masume', 'words.json'), 'utf8')), { words: 'dev' });
    r = await getJson(`${srv.url}/api/words`);
    assert.deepEqual(r.body, { ok: true, words: 'dev', set: true, source: 'file' });
    // 窓口のエラー文も開発のことばに（ボス戦 → 結合テスト）
    const battle = await post(`${srv.url}/api/battle`, { gate: 'NOPE' });
    assert.ok(battle.status >= 400 && battle.status < 500, `知らないゲートは 4xx（${battle.status}）`);
    assert.match(battle.body.error, /その結合テストはありません/);

    r = await post(`${srv.url}/api/words`, { words: 'game' });
    assert.deepEqual(r.body, { ok: true, words: 'game' });
    const again = await post(`${srv.url}/api/battle`, { gate: 'NOPE' });
    assert.match(again.body.error, /その結合ゲートはありません/);
  } finally {
    await srv.stop();
  }
});

test('§76.2 serve --words dev と GRIDHUB_WORDS: 設定より優先し、GET /api/words の source は env', { timeout: 120000 }, async () => {
  const dir = newToy();
  const srv = await startServe(dir, ['--words', 'dev']);
  try {
    const r = await getJson(`${srv.url}/api/words`);
    assert.deepEqual(r.body, { ok: true, words: 'dev', set: false, source: 'env' });
    // 設定に game と書いても、このサーバーのあいだは --words（環境変数）が勝つ
    await post(`${srv.url}/api/words`, { words: 'game' });
    assert.deepEqual((await getJson(`${srv.url}/api/words`)).body, { ok: true, words: 'dev', set: true, source: 'env' });
  } finally {
    await srv.stop();
  }
});

test('§76.2 MCP の道具の題・説明・instructions が、ことばの設定に合う', { timeout: 120000 }, async () => {
  const dir = newToy();
  const game = mcpClient(['--dir', dir], { cwd: dir });
  try {
    const init = await game.start();
    assert.match(init.result.instructions, /指令書/);
    const list = await game.request('tools/list');
    const step = list.result.tools.find((t) => t.name === 'masume_step');
    assert.equal(step.title, '歩く');
    assert.match(step.description, /いまのダンジョン/);
    assert.match(step.inputSchema.properties.character.description, /キャラクター/);
  } finally {
    await game.close();
  }
  const dev = mcpClient(['--dir', dir, '--words', 'dev'], { cwd: dir });
  try {
    const init = await dev.start();
    assert.match(init.result.instructions, /作業指示/);
    assert.doesNotMatch(init.result.instructions, /指令書|縄張り|冒険の書/);
    const list = await dev.request('tools/list');
    const step = list.result.tools.find((t) => t.name === 'masume_step');
    assert.equal(step.title, 'テストを走らせる（step）');
    assert.match(step.description, /いまのタスク/);
    assert.doesNotMatch(step.description, /ダンジョン|モンスター/);
    assert.match(step.inputSchema.properties.character.description, /担当/);
    assert.deepEqual(list.result.tools.map((t) => t.name).sort(), ['masume_brief', 'masume_check', 'masume_log', 'masume_note', 'masume_quest', 'masume_stamp', 'masume_status', 'masume_step', 'masume_verify'], '道具の名前は変わらない');
    // 道具の出力（brief）も開発のことば
    const brief = await dev.call('masume_brief', { character: 'a' });
    assert.match(brief.text, /^作業指示: /m);
    assert.match(brief.text, /記録: seq \d+/);
  } finally {
    await dev.close();
  }
});
