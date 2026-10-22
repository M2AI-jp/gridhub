// G1「結合: 盤面に冒険が映る」— 書記（エンジン）＋伝令（サーバー）＋賢者クロード（盤面）の結合E2E。
// 本物の冒険の書を masume serve で配り、ブラウザの盤面に映り、宣言判定で駒がライブに動く。
import test from 'node:test';
import assert from 'node:assert/strict';
import { masume, newToy, flag, view, startServe, getJson, sseClient, openBrowser } from '../helpers.mjs';

test('本物の冒険の書が盤面に映り、判定で駒がライブに動く', async () => {
  const dir = newToy();
  let srv;
  try {
    srv = await startServe(dir);
  } catch (e) {
    console.log('MASUME_BLAME: server');
    throw e;
  }
  const page = await openBrowser({ width: 1440, height: 900 });
  const stream = sseClient(`${srv.url}/api/stream`);
  try {
    // API は status --json と同じ（書記 × 伝令）
    const st = await getJson(`${srv.url}/api/state`);
    if (st.status !== 200) console.log('MASUME_BLAME: server');
    assert.equal(st.status, 200, st.text);
    assert.deepEqual(st.body, view(dir), '/api/state = masume status --json');
    const health = await getJson(`${srv.url}/api/health`);
    assert.deepEqual(health.body, { ok: true, masume: 1 });
    await stream.waitFor('hello', { timeout: 5000 });

    // 盤面に映る（伝令 × 賢者クロード）
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000, message: '盤面が描かれる' });
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { message: 'ライブ接続' });
    const first = await page.eval(`(() => ({
      nodes: document.querySelectorAll('#node-layer [data-node]').length,
      pawns: Object.fromEntries([...document.querySelectorAll('.pawn[data-char]')].map((g) => [g.dataset.char, g.dataset.at])),
      title: document.querySelector('.quest-title').textContent,
    }))()`);
    const v0 = view(dir);
    assert.equal(first.nodes, Object.keys(v0.nodes).length);
    assert.deepEqual(first.pawns, { a: 'A1', b: 'B1', h: 'H1' });
    assert.equal(first.title, 'おもちゃの冒険');

    // 宣言判定 → SSE → 盤面の駒が動く（書記 × 伝令 × 賢者クロード）
    const since = stream.events.length;
    flag(dir, 'A1');
    const r = masume(['check', 'a', '--dir', dir, '--as', 'a']);
    assert.equal(r.code, 0, r.all);
    await stream.waitFor('change', { timeout: 5000, since });
    await page.waitFor(`document.querySelector('.pawn[data-char="a"]').dataset.at === 'A2'`, { timeout: 10000, message: '駒 a が A2 へ進む' });
    await page.waitFor(`document.querySelector('#node-layer [data-node="A1"]').dataset.state === 'cleared'`, { message: 'A1 にはなまる' });
    const after = await page.eval(`({
      log: [...document.querySelectorAll('#log .log-entry')].map((li) => li.dataset.type),
    })`);
    const v1 = view(dir);
    // 第11章: ふっかつのじゅもんは外した（盤面に出す値はビューに無い）
    assert.equal(v1.head.jumon, undefined);
    assert.ok(after.log.includes('check_passed'), '冒険の書に判定成功が流れる');

    // 失敗も映る（消しゴムとレベル）
    const r2 = masume(['check', 'a', '--dir', dir, '--as', 'a']);
    assert.equal(r2.code, 1, r2.all);
    await page.waitFor(`document.querySelector('.pawn[data-char="a"]').dataset.at === 'A1'`, { timeout: 10000, message: '駒 a が ふりだしへ戻される' });
    await page.waitFor(`document.querySelector('#node-layer [data-node="A1"]').dataset.state === 'stale'`, { message: 'A1 が消しゴムで消される' });
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    if (exceptions.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(exceptions, []);
  } finally {
    stream.close();
    await page.close();
    await srv.stop();
  }
  assert.ok(/盤面: http:\/\/127\.0\.0\.1:\d+\//.test(srv.output()), 'serve は盤面のURLを出す');
});
