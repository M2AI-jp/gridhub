// B16「縦のノート」— CONTRACTS §57（第12章）。ユーザーの言葉「ノートって縦だからね？」。
// 縦長の画面では1ページずつ縦に、横長の画面では見開きのまま。向きが変わったら切り替わる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStatic, openBrowserWith } from '../helpers4.mjs';

const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

const LOOK = `JSON.stringify((() => {
  const sheets = [...document.querySelectorAll('#paper .page[data-page] .page-sheet')].map((s) => {
    const r = s.getBoundingClientRect();
    return { page: s.closest('.page').dataset.page, x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const seen = sheets.filter((s) => s.w > 1 && s.x < vw - 1 && s.x + s.w > 1 && s.y < vh - 1 && s.y + s.h > 1);
  return {
    single: window.__masume.single, spread: window.__masume.spread, pages: window.__masume.pages,
    no: document.querySelector('#page-no').textContent.trim(),
    seen, vw, scrollW: document.documentElement.scrollWidth,
  };
})())`;

async function look(page) {
  await page.waitFor(`!window.__masume.flipping`, { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 400));
  return JSON.parse(await page.eval(LOOK));
}

async function withSize(fn, { width, height }) {
  const srv = await serveStatic();
  const page = await openBrowserWith({ width, height });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor(READY, { timeout: 15000 });
    await fn(page);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

function assertSingle(r, label) {
  assert.equal(r.single, true, `${label}: __masume.single`);
  assert.equal(r.no, `${r.spread} / ${r.pages}`, `${label}: 1ページずつの #page-no（${r.no}）`);
  const big = r.seen.filter((s) => s.w > r.vw * 0.4);
  assert.equal(big.length, 1, `${label}: 見えているページは1枚（${JSON.stringify(r.seen.map((s) => s.page))}）`);
  assert.ok(big[0].h > big[0].w, `${label}: ページは縦長（${Math.round(big[0].w)}×${Math.round(big[0].h)}）`);
  assert.ok(big[0].x >= -1 && big[0].x + big[0].w <= r.vw + 1, `${label}: ページは画面の幅に収まる`);
  assert.ok(r.scrollW <= r.vw + 1, `${label}: 横にはみ出さない（${r.scrollW} > ${r.vw}）`);
}

test('§57.1〜§57.3 縦長の画面（1024×1366 のタブレット・1080×1920 の縦置きモニター）では1ページずつ縦に', { timeout: 120000 }, async () => {
  for (const size of [{ width: 1024, height: 1366 }, { width: 1080, height: 1920 }]) {
    await withSize(async (page) => {
      const r = await look(page);
      assertSingle(r, `${size.width}×${size.height}`);
      await page.eval(`document.querySelector('#page-next').click()`);
      await page.waitFor(`window.__masume.spread === ${r.spread + 1} && !window.__masume.flipping`, { timeout: 5000, message: '次のページへ1枚ずつ' });
    }, size);
  }
});

test('§57.1 横長の画面（1366×1024）は見開きのまま', { timeout: 120000 }, async () => {
  await withSize(async (page) => {
    const r = await look(page);
    assert.equal(r.single, false);
    assert.match(r.no, /^\d+–\d+ \/ \d+$/, `見開きの #page-no（${r.no}）`);
  }, { width: 1366, height: 1024 });
});

test('§57.4 画面の向きが変わったら切り替わる（見開き → 1ページずつ → 見開き）', { timeout: 120000 }, async () => {
  await withSize(async (page) => {
    await page.eval(`window.__masume.turnTo(3, { animate: false }); true`);
    let r = await look(page);
    assert.equal(r.single, false);
    const left = r.spread;
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 1366, deviceScaleFactor: 1, mobile: false });
    await page.waitFor(`window.__masume.single === true`, { timeout: 5000, message: '縦にしたら1ページずつ' });
    r = await look(page);
    assertSingle(r, '縦にしたあと');
    assert.equal(r.spread, left, '見開きの左のページから');
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1366, height: 1024, deviceScaleFactor: 1, mobile: false });
    await page.waitFor(`window.__masume.single === false`, { timeout: 5000, message: '横に戻したら見開き' });
    r = await look(page);
    assert.match(r.no, /^\d+–\d+ \/ \d+$/);
  }, { width: 1366, height: 1024 });
});

test('§57.1 スマホ（390×844）は今までどおり1ページずつ', { timeout: 120000 }, async () => {
  await withSize(async (page) => {
    assertSingle(await look(page), '390×844');
  }, { width: 390, height: 844 });
});
