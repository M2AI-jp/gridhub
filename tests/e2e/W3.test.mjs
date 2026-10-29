// W3「スマホの縦でもはみ出さない」— 看板屋（第17章）。CONTRACTS §75.4。
// スマホの縦（幅 320・375・390）・タブレット（768）・パソコン（1280）で、ページが横にはみ出さず、字が読める大きさ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SITE, serveStatic, openBrowser } from '../helpers9.mjs';

const SIZES = [[320, 640], [375, 812], [390, 844], [768, 1024], [1280, 800]];

/** はみ出し: ページの横幅と、画面の右・左からはみ出す要素（コードの箱 pre の中は、箱の中で動かせるので見ない） */
const MEASURE = `(() => {
  const w = document.documentElement.clientWidth;
  const over = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('pre') && el.tagName !== 'PRE') continue;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.position === 'absolute' && el.matches('.skip')) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > w + 1 || r.left < -1) over.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : '') + ' ' + Math.round(r.left) + '〜' + Math.round(r.right));
  }
  const small = [...document.querySelectorAll('p, li, dd, dt, figcaption, h1, h2, h3, a')].filter((e) => e.offsetParent !== null && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 13).map((e) => e.tagName.toLowerCase() + ' ' + getComputedStyle(e).fontSize);
  const pres = [...document.querySelectorAll('pre')].map((p) => ({ scroll: getComputedStyle(p).overflowX, fits: p.getBoundingClientRect().right <= w + 1 }));
  return { w, scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, over: over.slice(0, 12), small: small.slice(0, 12), pres, imgs: [...document.images].filter((i) => i.getBoundingClientRect().width > w + 1).map((i) => i.getAttribute('src')) };
})()`;

test('§75.4 スマホの縦（幅 320・375・390）・タブレット（768）・パソコン（1280）で、ページが横にはみ出さない（コードの箱は箱の中で横に動かせる）', { timeout: 180000 }, async () => {
  const srv = await serveStatic(SITE);
  try {
    for (const [width, height] of SIZES) {
      const page = await openBrowser({ width, height });
      try {
        await page.goto(`${srv.url}/`);
        await page.waitFor(`document.fonts.status === 'loaded' && [...document.images].filter((i) => i.loading !== 'lazy').every((i) => i.complete)`, { timeout: 20000 });
        const r = await page.eval(MEASURE);
        const at = `幅 ${width}`;
        assert.ok(r.scrollWidth <= r.w, `${at}: ページの横幅 ${r.scrollWidth} が画面 ${r.w} に収まる`);
        assert.ok(r.bodyScroll <= r.w, `${at}: body の横幅 ${r.bodyScroll}`);
        assert.deepEqual(r.over, [], `${at}: はみ出す要素`);
        assert.deepEqual(r.imgs, [], `${at}: 画面より広い画像`);
        for (const p of r.pres) {
          assert.ok(p.fits, `${at}: コードの箱が画面に収まる`);
          assert.ok(['auto', 'scroll'].includes(p.scroll), `${at}: コードの箱は箱の中で横に動かせる（overflow-x: ${p.scroll}）`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await srv.close();
  }
});

test('§75.4 スマホの縦（幅 320）でも、字は 13px 以上、上の帯の目次とボタンは押せる大きさ', { timeout: 120000 }, async () => {
  const srv = await serveStatic(SITE);
  const page = await openBrowser({ width: 320, height: 640 });
  try {
    await page.goto(`${srv.url}/`);
    const r = await page.eval(MEASURE);
    assert.deepEqual(r.small, [], '13px より小さい字');
    const targets = await page.eval(`[...document.querySelectorAll('.top nav a, .btn')].map((a) => { const b = a.getBoundingClientRect(); return { t: a.textContent.trim(), h: Math.round(b.height), w: Math.round(b.width) }; })`);
    assert.ok(targets.length >= 4, `目次とボタン ${targets.length}`);
    for (const t of targets) assert.ok(t.h >= 24 && t.w >= 24, `「${t.t}」の大きさ ${t.w}×${t.h}`);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§75.2 見出し（h1・h2・h3）は、幅 320・375・1280 で句のまとまり（.ph）で折れ、句の途中で折れない', { timeout: 120000 }, async () => {
  const srv = await serveStatic(SITE);
  try {
    for (const width of [320, 375, 1280]) {
      const page = await openBrowser({ width, height: 800 });
      try {
        await page.goto(`${srv.url}/`);
        const r = await page.eval(`(() => {
          const heads = [...document.querySelectorAll('h1, h2, h3')];
          const loose = heads.flatMap((h) => [...h.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => h.tagName + ': ' + n.textContent.trim()));
          const broken = heads.flatMap((h) => {
            const line = parseFloat(getComputedStyle(h).lineHeight);
            return [...h.querySelectorAll('.ph')].filter((p) => p.getBoundingClientRect().height > line * 1.3).map((p) => h.tagName + ': ' + p.textContent);
          });
          return { heads: heads.length, phs: document.querySelectorAll('h1 .ph, h2 .ph, h3 .ph').length, loose, broken };
        })()`);
        assert.ok(r.heads >= 10 && r.phs >= r.heads, `幅 ${width}: 見出し ${r.heads}・句 ${r.phs}`);
        assert.deepEqual(r.loose, [], `幅 ${width}: 句で包んでいない見出しの字`);
        assert.deepEqual(r.broken, [], `幅 ${width}: 途中で折れた句`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await srv.close();
  }
});

test('§75.2 スマホの縦（375×812）でも、1画面目に盤面の写真と駒やモンスターの絵が入り、ヘッダーのリンクは1行に収まる', { timeout: 120000 }, async () => {
  const srv = await serveStatic(SITE);
  const page = await openBrowser({ width: 375, height: 812 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(`[...document.querySelectorAll('#hero img')].every((i) => i.complete)`, { timeout: 20000 });
    const r = await page.eval(`(() => {
      const h = innerHeight;
      const seen = (el) => { const b = el.getBoundingClientRect(); return Math.max(0, Math.min(b.bottom, h) - Math.max(b.top, 0)); };
      const photo = document.querySelector('#hero img[src="img/board.png"]');
      return { h, photo: photo ? Math.round(seen(photo)) : 0, decos: [...document.querySelectorAll('#hero img.deco')].filter((i) => seen(i) >= 20).length, title: Math.round(document.querySelector('h1').getBoundingClientRect().top) };
    })()`);
    assert.ok(r.title < 200, `見出しが上のほうに（${r.title}px）`);
    assert.ok(r.photo >= 150, `盤面の写真が1画面目に ${r.photo}px 見える`);
    assert.ok(r.decos >= 4, `駒やモンスターの絵が1画面目に ${r.decos} つ`);
    const tops = await page.eval(`[...document.querySelectorAll('.top nav a')].map((a) => Math.round(a.getBoundingClientRect().top))`);
    assert.ok(tops.length >= 5 && new Set(tops).size === 1, `ヘッダーのリンクは1行に（${tops.join(', ')}）`);
  } finally {
    await page.close();
    await srv.close();
  }
});
