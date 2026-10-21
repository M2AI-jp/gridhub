// B10「外の字を待たずに盤面を描く」— CONTRACTS §37（第10章）。Google Fonts が返ってこない（つながるが黙る）ときも、盤面は手元の書体で描かれる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStatic, openBrowserWith } from '../helpers4.mjs';

const READY = 'window.__masume && window.__masume.ready && document.querySelectorAll(".pawn[data-char]").length > 0';

test('§37 Google Fonts が返ってこなくても盤面が描かれ、§36.3 の <link>（1つに3つの family）はそのまま', { timeout: 60000 }, async () => {
  const srv = await serveStatic();
  const page = await openBrowserWith();
  try {
    // 外の字の取得を、ブラウザの中で止めたままにする（返事をしない）
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*://fonts.googleapis.com/*' }, { urlPattern: '*://fonts.gstatic.com/*' }] });
    // readyState の complete は待たない（止まっている外の CSS が load を遅らせるのは正しい）
    await page.send('Page.navigate', { url: `${srv.url}/?fixture=demo` });
    await page.waitFor(READY, { timeout: 8000, message: 'Google Fonts を待たずに盤面が出る' });
    const links = await page.eval(`[...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.getAttribute('href'))`);
    assert.equal(links.length, 1, `Google Fonts は1つの <link>: ${links}`);
    assert.equal((links[0].match(/family=/g) || []).length, 3, `1つの <link> に3つの family: ${links[0]}`);
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]')), [], '未処理の例外を出さない');
  } finally {
    await page.close();
    await srv.close();
  }
});
