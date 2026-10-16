// G4「結合: パーティが自分で進む」— 盤面（出撃）＋伝令（窓口）＋軍師（party）＋書記（出撃の記録）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { masume, newToy, flag, view, char, readLog, openBrowser, startServeEnv, fakeAgent, waitUntil } from '../helpers2.mjs';

test('盤面の出撃ボタンで、駒がふきだしを出して進み、ボス戦を越え、ハンコであがる', async () => {
  const dir = newToy({ withB3: true });
  flag(dir, 'G1');
  flag(dir, 'FIN');
  const srv = await startServeEnv(dir, { MASUME_AGENT_OVERRIDE: fakeAgent('slow', 700) });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal')?.open === true`);
    await page.eval(`document.querySelector('#sortie-go').click()`);
    // 出撃中のふきだしが見える
    await page.waitFor(`document.querySelectorAll('.sortie-bubble').length > 0`, { timeout: 15000, message: 'ふきだし' });
    // ハンコ待ちまで自分で進む
    await page.waitFor(`(() => { const at = (id) => document.querySelector('.pawn[data-char="' + id + '"]')?.dataset.at; return at('a') === 'FIN' && at('b') === 'FIN'; })()`, { timeout: 90000, message: 'a と b があがりの前にそろう' });
    await page.waitFor(`document.querySelector('#party-status')?.dataset.running === 'false'`, { timeout: 30000, message: 'パーティが止まる' });
    assert.match(await page.eval(`document.querySelector('#party-status').innerText`), /ハンコ待ち/);
    let v = view(dir);
    assert.equal(v.nodes.G1.state, 'cleared', 'パーティが G1 のボス戦をした');
    assert.equal(char(v, 'h').at, 'H1');
    const sorties = readLog(dir).filter((e) => e.type === 'sortie');
    assert.equal(sorties.length, 7);
    assert.equal(document_free(sorties), true);

    // 人間のハンコで、あがり
    await page.eval(`window.__masume.select('node', 'H1')`);
    await page.waitFor(`!!document.querySelector('#drawer button[data-stamp="H1"]')`);
    await page.eval(`document.querySelector('#drawer button[data-stamp="H1"]').click()`);
    await waitUntil(() => view(dir).finished, { timeout: 30000, message: 'あがり' });
    await page.waitFor(`document.body.classList.contains('finished')`, { timeout: 15000, message: '盤面もあがり' });
    v = view(dir);
    assert.ok(v.characters.every((c) => c.status === 'done'));
    assert.equal(masume(['verify', '--dir', dir]).code, 0);
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    if (exceptions.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(exceptions, []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

function document_free(sorties) {
  return sorties.every((s) => s.data.character !== 'h');
}
