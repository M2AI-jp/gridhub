// B9「手書きの方眼ノートにする」— CONTRACTS §36（第9章）。見本の盤面（?fixture=demo）をヘッドレス Chrome で開いて確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, openBrowserWith, RECORD_ANIMATIONS, waitUntil } from '../helpers4.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));
const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ページの中で使う小道具（色・書体・箱）
const TOOLS = `
  const rgb = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (m) return m[1].split(',').map((x) => parseFloat(x)); const h = String(s).trim().replace('#', ''); const v = h.length === 3 ? h.split('').map((c) => c + c) : h.match(/../g); return v.map((x) => parseInt(x, 16)); };
  const lum = (c) => { const [r, g, b] = c.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const family = (el) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
  const bbox = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const union = (els) => { const bs = els.map(bbox); const x = Math.min(...bs.map((b) => b.x)); const y = Math.min(...bs.map((b) => b.y)); return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y }; };
  const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
  const vb = () => { const [x, y, w, h] = document.querySelector('#board').getAttribute('viewBox').split(/\\s+/).map(Number); return { x, y, w, h }; };
  const paper = () => rgb(getComputedStyle(document.documentElement).getPropertyValue('--paper'));
  // 紙の上に見える色（要素とその先祖の不透明度を、紙の色に重ねる）
  const seen = (el, prop) => { const c = rgb(getComputedStyle(el)[prop]); let a = c.length > 3 ? c[3] : 1; a *= parseFloat(getComputedStyle(el)[prop === 'fill' ? 'fillOpacity' : 'opacity']) || 1; for (let e = el; e && e.nodeType === 1; e = e.parentElement) a *= parseFloat(getComputedStyle(e).opacity); const p = paper(); return c.slice(0, 3).map((v, i) => v * a + p[i] * (1 - a)); };
  const dashKeyframes = () => { const names = new Set(); const walk = (rules) => { for (const r of rules) { if (r.type === CSSRule.KEYFRAMES_RULE && /stroke-dashoffset/.test(r.cssText)) names.add(r.name); if (r.cssRules) walk(r.cssRules); } }; for (const s of document.styleSheets) { try { walk(s.cssRules); } catch {} } return names; };
  const LINES = '#node-layer .cell-line, #node-layer .gate-line, .road[data-char] [data-tool]';
  const drawnLines = () => [...document.querySelectorAll(LINES)].filter((el) => { const cs = getComputedStyle(el); return cs.strokeDasharray !== 'none' && Math.abs(parseFloat(cs.strokeDashoffset) || 0) > 0.01; }).map((el) => (el.closest('[data-node]') || el.closest('[data-char]'))?.getAttribute('data-node') || el.closest('[data-char]')?.getAttribute('data-char'));
  const running = () => document.getAnimations().filter((a) => a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#board')).map((a) => a.animationName || a.transitionProperty || '?');
`;
const inPage = (body) => `(() => { ${TOOLS} ${body} })()`;

async function withDemo(fn, { url = '/?fixture=demo', width = 1440, height = 900, media = [], record = false } = {}) {
  const srv = await serveStatic();
  const page = record || media.length ? await openBrowserWith({ width, height, media, preload: record ? RECORD_ANIMATIONS : '' }) : await openBrowser({ width, height });
  try {
    await page.goto(`${srv.url}${url}`);
    await page.waitFor(READY, { timeout: 15000 });
    await fn(page);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§36.1 ノートの1ページ: 端のある紙・綴じのリング・余白の赤線・紙のむら。方眼はページの中だけ、外は机', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const q = (s) => [...document.querySelectorAll(s)];
      const sheet = q('#paper .page-sheet');
      const grids = q('#paper [fill="url(#grid-5mm)"], #paper [fill="url(\\'#grid-5mm\\')"]');
      const text = q('#paper text').map((t) => t.textContent).join(' ');
      return JSON.stringify({
        sheets: sheet.length,
        rings: q('#paper .page-binding .ring').length,
        margin: q('#paper .page-margin').length,
        grain: q('#paper .page-grain').length,
        grids: grids.length,
        gridsInside: sheet.length === 1 && grids.every((g) => inside(bbox(g), bbox(sheet[0]))),
        stageBg: rgb(getComputedStyle(document.querySelector('#stage')).backgroundColor).slice(0, 3).join(','),
        paper: paper().slice(0, 3).join(','),
        text,
        title: document.querySelector('.quest-title').textContent,
      });
    `)));
    assert.equal(r.sheets, 1, 'ページの紙 .page-sheet が1枚');
    assert.ok(r.rings >= 3, `綴じのリング .page-binding .ring が3つ以上（${r.rings}）`);
    assert.ok(r.margin >= 1, '余白の赤い縦線 .page-margin');
    assert.ok(r.grain >= 1, '紙の色むら .page-grain');
    assert.ok(r.grids >= 1, '5mm方眼で塗った紙がある');
    assert.equal(r.gridsInside, true, '方眼はページの紙の中だけ');
    assert.notEqual(r.stageBg, r.paper, `ページの外は机（#stage の背景が紙の色 ${r.paper} ではない）`);
    assert.match(r.text, /No\./, '印刷の No.');
    assert.match(r.text, /Date/, '印刷の Date');
    assert.equal(r.title, fixture.quest.title, '.quest-title は題名だけ');

    // 「全体」で、綴じを含むページ全体が見える
    await page.eval(`document.querySelector('[data-zoom="fit"]').click()`);
    await sleep(300);
    const fit = JSON.parse(await page.eval(inPage(`
      const page = union([document.querySelector('#paper .page-sheet'), document.querySelector('#paper .page-binding')]);
      return JSON.stringify({ page, vb: vb(), ok: inside(page, vb(), 2) });
    `)));
    assert.equal(fit.ok, true, `「全体」でページ全体（綴じを含む）が見える: ${JSON.stringify(fit)}`);
  });
});

test('§36.2 筆記具: 霧は鉛筆、マスの枠はボールペン、道と作業中の塗りは蛍光ペン、はなまるは赤ペン', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const out = { nodes: [], roads: [], current: [], hanamaru: [] };
      for (const n of document.querySelectorAll('#node-layer .node')) {
        const lines = [...n.querySelectorAll('.cell-line, .gate-line')];
        out.nodes.push({ id: n.dataset.node, state: n.dataset.state, lines: lines.map((l) => ({ tool: l.getAttribute('data-tool'), stroke: rgb(getComputedStyle(l).stroke).slice(0, 3), filter: getComputedStyle(l).filter })) });
        if (n.dataset.state === 'current') out.current.push({ id: n.dataset.node, markers: n.querySelectorAll('[data-tool="marker"]').length });
      }
      for (const r of document.querySelectorAll('.road[data-char]')) {
        const ms = [...r.querySelectorAll('[data-tool="marker"]')];
        out.roads.push({ id: r.dataset.char, n: ms.length, ok: ms.every((m) => { const cs = getComputedStyle(m); const op = parseFloat(cs.opacity) * parseFloat(cs.strokeOpacity); return cs.mixBlendMode === 'multiply' && op < 1; }) });
      }
      for (const h of document.querySelectorAll('#node-layer .hanamaru')) out.hanamaru.push({ tool: h.getAttribute('data-tool'), stroke: rgb(getComputedStyle(h).stroke).slice(0, 3) });
      return JSON.stringify(out);
    `)));
    const states = new Set(r.nodes.map((n) => n.state));
    for (const s of ['fog', 'current', 'cleared']) assert.ok(states.has(s), `見本に ${s} のマスがある`);
    for (const n of r.nodes) {
      assert.ok(n.lines.length >= 1, `${n.id} に枠（.cell-line / .gate-line）`);
      for (const l of n.lines) {
        if (n.state === 'fog') {
          assert.equal(l.tool, 'pencil', `霧のマス ${n.id} の枠は鉛筆`);
          const [a, b, c] = l.stroke;
          assert.ok(Math.max(a, b, c) - Math.min(a, b, c) <= 40, `鉛筆は灰色（${n.id}: ${l.stroke}）`);
          assert.notEqual(l.filter, 'none', `鉛筆の線にはざらつき（filter）がある（${n.id}）`);
        } else {
          assert.equal(l.tool, 'ballpoint', `${n.id}（${n.state}）の枠はボールペン`);
          assert.deepEqual(l.stroke, [29, 43, 92], `ボールペン紺 #1d2b5c（${n.id}）`);
        }
      }
    }
    assert.equal(r.roads.length, fixture.characters.length, '道はキャラクターに1つ');
    for (const road of r.roads) {
      assert.ok(road.n >= 1, `道 ${road.id} は蛍光ペンで引く`);
      assert.equal(road.ok, true, `道 ${road.id} の蛍光ペンは半透明で、重なると濃くなる（multiply）`);
    }
    for (const c of r.current) assert.ok(c.markers >= 1, `作業中のマス ${c.id} は蛍光ペンで塗る`);
    assert.ok(r.hanamaru.length >= 1, 'はなまるがある');
    for (const h of r.hanamaru) {
      assert.equal(h.tool, 'redpen', 'はなまるは赤ペン');
      assert.deepEqual(h.stroke, [217, 74, 58], 'はなまるは赤ペン #d94a3a');
    }
  });
});

test('§36.3 字: 題名・ふりだし・あがりはマジック、マスはボールペン、霧は鉛筆。3つの書体を1つの <link> で読む', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const fog = document.querySelector('#node-layer .cell-title.pencil-text');
      const ink = document.querySelector('#node-layer .cell-title:not(.pencil-text)');
      const start = [...document.querySelectorAll('#board text')].find((t) => t.textContent.includes('ふりだし'));
      const goal = document.querySelector('#node-layer .node.goal .gate-title');
      const links = [...document.querySelectorAll('link[rel="stylesheet"][href*="fonts.googleapis.com"]')].map((l) => l.getAttribute('href'));
      return JSON.stringify({
        title: family(document.querySelector('.quest-title')),
        ink: ink && family(ink),
        fog: fog && family(fog),
        start: start && family(start),
        goal: goal && family(goal),
        links,
      });
    `)));
    assert.ok(r.ink && r.fog, 'ボールペンの題と鉛筆の題がある');
    assert.equal(new Set([r.title, r.ink, r.fog]).size, 3, `3つの書体が違う: 題名 ${r.title} / マス ${r.ink} / 霧 ${r.fog}`);
    assert.equal(r.start, r.title, `「ふりだし」は題名と同じマジックの字（${r.start}）`);
    assert.equal(r.goal, r.title, `あがりの旗は題名と同じマジックの字（${r.goal}）`);
    assert.equal(r.links.length, 1, `Google Fonts は1つの <link>: ${r.links}`);
    assert.equal((r.links[0].match(/family=/g) || []).length, 3, `1つの <link> に3つの family: ${r.links[0]}`);
  });
});

test('§36.4 物: 駒はシール、名札は付箋とマスキングテープ、冒険の書はルーズリーフ、知らせは傾いた付箋', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      return JSON.stringify({
        pawns: [...document.querySelectorAll('.pawn[data-char]')].map((p) => { const b = p.querySelector('.pawn-body'); return b ? getComputedStyle(b).filter : 'none'; }),
        heads: [...document.querySelectorAll('.lane-head[data-char]')].map((h) => h.querySelectorAll('.tape').length),
        punch: document.querySelectorAll('#side .punch').length,
      });
    `)));
    assert.equal(r.pawns.length, fixture.characters.length);
    for (const f of r.pawns) assert.notEqual(f, 'none', '駒はシール（.pawn-body に filter）');
    assert.equal(r.heads.length, fixture.characters.length);
    for (const n of r.heads) assert.ok(n >= 1, '名札はマスキングテープ（.tape）で貼る');
    assert.ok(r.punch >= 3, `ルーズリーフのとじ穴 #side .punch が3つ以上（${r.punch}）`);

    await page.eval(`document.querySelector('#copy-jumon').click()`);
    await page.waitFor(`document.querySelectorAll('#toast .toast').length > 0`, { message: '知らせが出る' });
    await sleep(900);
    const m = await page.eval(`getComputedStyle(document.querySelector('#toast .toast')).transform`);
    const v = (m.match(/matrix\(([^)]+)\)/) || [])[1]?.split(',').map(Number);
    assert.ok(v && Math.abs(v[1]) > 0.001, `知らせの付箋は少し傾いている（transform: ${m}）`);
  });
});

test('§36.5 動き: 最初はペンで引くように線が出て、描き終わると全部見える。突破したマスのはなまるも赤ペンで描かれる', { timeout: 120000 }, async () => {
  // 線は左から順に描かれていく（待ち時間のあとで始まる）ので、数秒のうちに始まるのを待つ
  const started = async (page, body, ok) => {
    let r = null;
    await waitUntil(async () => ok((r = JSON.parse(await page.eval(inPage(body))))), { timeout: 8000, message: 'ペンで描くアニメーションが始まる' }).catch(() => {});
    return r;
  };
  await withDemo(async (page) => {
    const r = await started(page, `
      const names = dashKeyframes();
      const a = (window.__anims || []).filter((x) => x.inBoard && names.has(x.name));
      return JSON.stringify({
        names: [...names],
        cells: a.filter((x) => /(^|\\s)(cell-line|gate-line)(\\s|$)/.test(x.cls)).length,
        roads: a.filter((x) => x.road && x.tool === 'marker').length,
      });
    `, (x) => x.cells > 0 && x.roads > 0);
    assert.ok(r.cells > 0, `マスの枠がペンで引くように出る（stroke-dashoffset のアニメーション: ${r.names}）`);
    assert.ok(r.roads > 0, `道が蛍光ペンで引くように出る（${r.names}）`);
    await page.waitFor(inPage(`const names = dashKeyframes(); return !document.getAnimations().some((a) => a.playState === 'running' && names.has(a.animationName) && a.effect && a.effect.target && a.effect.target.matches && a.effect.target.matches(LINES));`), { timeout: 12000, message: '描き終わる' });
    assert.deepEqual(JSON.parse(await page.eval(inPage(`return JSON.stringify(drawnLines());`))), [], '描き終わったら、線はすべて見えている');
  }, { record: true });

  await withDemo(async (page) => {
    await page.waitFor('window.__masume.done === true', { timeout: 20000 });
    const r = await started(page, `
      const names = dashKeyframes();
      return JSON.stringify((window.__anims || []).filter((x) => x.inBoard && x.fresh && /hanamaru/.test(x.cls) && names.has(x.name)).map((x) => x.node));
    `, (x) => x.includes('A2'));
    assert.ok(r.includes('A2'), `最後の場面で突破した A2 のはなまるが、赤ペンで描かれるように出る（${r}）`);
  }, { url: '/?fixture=demo&script=demo&interval=300', record: true });
});

test('§36.5 動きを減らす（prefers-reduced-motion: reduce）: 盤面で動き続けるものが無く、最初から描き終わった姿', { timeout: 120000 }, async () => {
  const media = [{ name: 'prefers-reduced-motion', value: 'reduce' }];
  for (const url of ['/?fixture=demo', '/?fixture=demo&script=demo&interval=300']) {
    await withDemo(async (page) => {
      if (url.includes('script')) await page.waitFor('window.__masume.done === true', { timeout: 20000 });
      assert.equal(await page.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`), true, '動きを減らす設定');
      await sleep(1500);
      assert.deepEqual(JSON.parse(await page.eval(inPage(`return JSON.stringify(running());`))), [], `盤面で動き続けるアニメーションが無い（${url}）`);
      assert.deepEqual(JSON.parse(await page.eval(inPage(`return JSON.stringify(drawnLines());`))), [], `線はすべて見えている（${url}）`);
    }, { url, media, record: true });
  }
});

test('§36.6 読みやすさ: マスの題と冒険の書は 4.5 以上、霧のマスの題は 3 以上（紙の色に対して）', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const p = paper();
      const ratio = (sel, prop) => [...document.querySelectorAll(sel)].map((el) => contrast(seen(el, prop), p));
      return JSON.stringify({
        ink: ratio('#node-layer .cell-title:not(.pencil-text)', 'fill'),
        fog: ratio('#node-layer .cell-title.pencil-text', 'fill'),
        log: ratio('#log .le-text', 'color'),
      });
    `)));
    assert.ok(r.ink.length && r.fog.length && r.log.length);
    assert.ok(Math.min(...r.ink) >= 4.5, `マスの題（ボールペン）のコントラスト比 ${Math.min(...r.ink).toFixed(2)} >= 4.5`);
    assert.ok(Math.min(...r.log) >= 4.5, `冒険の書の字のコントラスト比 ${Math.min(...r.log).toFixed(2)} >= 4.5`);
    assert.ok(Math.min(...r.fog) >= 3, `霧のマスの題（鉛筆）のコントラスト比 ${Math.min(...r.fog).toFixed(2)} >= 3`);
  });
});

test('§36.7 書き出し: ノートの1ページ（紙と綴じ）が viewBox に収まり、1目 = 5mm の実寸', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const text = window.__masume.exportSvg();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const root = doc.documentElement;
      const [x, y, w, h] = root.getAttribute('viewBox').split(/\\s+/).map(Number);
      const parts = [document.querySelector('#paper .page-sheet'), document.querySelector('#paper .page-binding')];
      const page = parts.every(Boolean) ? union(parts) : null;
      return JSON.stringify({
        xml: !doc.querySelector('parsererror') && root.nodeName === 'svg',
        sheet: !!doc.querySelector('[class~="page-sheet"]'),
        rings: doc.querySelectorAll('[class~="ring"]').length,
        vb: { x, y, w, h },
        width: root.getAttribute('width'),
        height: root.getAttribute('height'),
        unit: Number(document.querySelector('#grid-5mm').getAttribute('width')),
        page,
        inside: !!page && inside(page, { x, y, w, h }, 1),
      });
    `)));
    assert.equal(r.xml, true, 'XML として正しい');
    assert.equal(r.sheet, true, '書き出しにページの紙 .page-sheet');
    assert.ok(r.rings >= 3, '書き出しに綴じのリング');
    assert.equal(r.inside, true, `ページ全体と綴じが viewBox の中: ${JSON.stringify(r)}`);
    assert.ok(r.unit > 0, '1目の大きさ');
    const mm = (s) => Number(String(s).replace(/mm$/, ''));
    assert.match(String(r.width), /^[\d.]+mm$/);
    assert.ok(Math.abs(mm(r.width) - (r.vb.w / r.unit) * 5) < 0.2, `幅 ${r.width} = ${r.vb.w} ÷ ${r.unit} × 5`);
    assert.ok(Math.abs(mm(r.height) - (r.vb.h / r.unit) * 5) < 0.2, `高さ ${r.height} = ${r.vb.h} ÷ ${r.unit} × 5`);
  });
});
