// B15「札と吹き出しが重ならない」— CONTRACTS §55（第12章）。docs/board-zoom.png で、瓦版の切り抜きと駒の吹き出しが重なって字が隠れていた。
// 見本 demo・demo2・end の、すべての見開きで、1440×900 と 1200×761 の画面で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveStatic, openBrowser } from '../helpers4.mjs';

const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

// 画面に描かれているものの矩形（幅か高さが0のものは数えない）
const SCAN = `JSON.stringify((() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  const shown = (r) => r.w > 0.5 && r.h > 0.5;
  const over = (a, b) => a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
  const inside = (a, b) => a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.w <= b.x + b.w + 1 && a.y + a.h <= b.y + b.h + 1;
  const label = (el) => (el.closest('[data-node]')?.dataset.node || el.closest('[data-margin]')?.dataset.margin || el.closest('[data-char]')?.dataset.char || '') + ' ' + (el.getAttribute('class') || el.tagName);
  const bad = [];
  const bubbles = [...document.querySelectorAll('.pawn-say, .margin-bubble')].map((el) => ({ el, r: rect(el) })).filter((b) => shown(b.r));
  const texts = [...document.querySelectorAll('#node-layer .node text, .lane-head text, .lane-tag text')].map((el) => ({ el, r: rect(el) })).filter((t) => shown(t.r) && (t.el.textContent || '').trim());
  for (let i = 0; i < bubbles.length; i++) for (let j = i + 1; j < bubbles.length; j++) {
    if (over(bubbles[i].r, bubbles[j].r)) bad.push('吹き出しどうし: ' + label(bubbles[i].el) + ' × ' + label(bubbles[j].el));
  }
  for (const b of bubbles) for (const t of texts) {
    if (!b.el.contains(t.el) && over(b.r, t.r)) bad.push('吹き出しが字に重なる: ' + label(b.el) + ' × ' + label(t.el) + '「' + t.el.textContent.trim().slice(0, 12) + '」');
  }
  for (const b of bubbles) {
    const bg = b.el.querySelector('.bubble-bg, .mg-bubble-bg') || b.el;
    const box = rect(bg);
    for (const t of b.el.querySelectorAll('text')) { const r = rect(t); if (shown(r) && !inside(r, box)) bad.push('吹き出しの字が切れる: ' + label(b.el) + '「' + t.textContent.trim().slice(0, 12) + '」'); }
  }
  for (const n of document.querySelectorAll('#node-layer .node')) {
    const paper = n.querySelector('.cell-paper, .gate-paper');
    if (!paper) continue;
    const box = rect(paper);
    if (!shown(box)) continue;
    for (const t of n.querySelectorAll('text')) { const r = rect(t); if (shown(r) && (t.textContent || '').trim() && !inside(r, box)) bad.push('札の字が切れる: ' + n.dataset.node + '「' + t.textContent.trim().slice(0, 12) + '」'); }
  }
  return { bad, bubbles: bubbles.length, texts: texts.length };
})())`;

async function scanAll(fixture, { width, height }) {
  const srv = await serveStatic();
  const page = await openBrowser({ width, height });
  try {
    await page.goto(`${srv.url}/?fixture=${fixture}`);
    await page.waitFor(READY, { timeout: 15000 });
    const pages = await page.eval('window.__masume.pages');
    const step = (await page.eval('window.__masume.single')) ? 1 : 2;
    const found = [];
    let bubbles = 0;
    for (let p = 1; p <= pages; p += step) {
      await page.eval(`window.__masume.turnTo(${p}, { animate: false }); true`);
      await page.waitFor(`!window.__masume.flipping`, { timeout: 5000 });
      await new Promise((r) => setTimeout(r, 300));
      const r = JSON.parse(await page.eval(SCAN));
      bubbles += r.bubbles;
      for (const b of r.bad) found.push(`p.${p}: ${b}`);
    }
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
    return { found, bubbles };
  } finally {
    await page.close();
    await srv.close();
  }
}

for (const fixture of ['demo', 'demo2', 'end']) {
  for (const size of [{ width: 1440, height: 900 }, { width: 1200, height: 761 }]) {
    test(`§55 見本 ${fixture}（${size.width}×${size.height}）: 吹き出しどうし・吹き出しと字が重ならず、字が切れない`, { timeout: 180000 }, async () => {
      const r = await scanAll(fixture, size);
      assert.deepEqual(r.found.slice(0, 20), [], `重なり・切れ（${r.found.length} 件）`);
      if (fixture !== 'end') assert.ok(r.bubbles > 0, '吹き出しを数えた');
    });
  }
}
