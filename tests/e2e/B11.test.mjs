// B11「縦の5mm方眼ノートの世界地図」— CONTRACTS §50.1〜§50.4・§50.6（第11章）。見本（?fixture=demo）をヘッドレス Chrome で開いて確かめる。
// 見本 demo に求めること（盤面がつくる）: ページが3枚以上・キャラクターが3人以上・ゲートとあがりと町・cases のあるマス。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser } from '../helpers4.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));
const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

async function withDemo(fn, { url = '/?fixture=demo', width = 1440, height = 900 } = {}) {
  const srv = await serveStatic();
  const page = await openBrowser({ width, height });
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

const TOOLS = `
  const U = Number(document.querySelector('#grid-5mm').getAttribute('width'));
  const num = (el, a) => Number(el.getAttribute(a));
  const box = (el) => el.getAttribute('data-box').trim().split(/\\s+/).map(Number);
  const sheetOf = (p) => document.querySelector('#paper .page[data-page="' + p + '"] .page-sheet');
  const bbox = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  const inside = (a, b, tol = 1) => a.x >= b.x - tol && a.y >= b.y - tol && a.x + a.w <= b.x + b.w + tol && a.y + a.h <= b.y + b.h + tol;
`;
const inPage = (body) => `(() => { ${TOOLS} ${body} })()`;

test('見本の条件（盤面がつくる見本）', () => {
  assert.ok(fixture.characters.length >= 3, 'キャラクターが3人以上');
  const nodes = Object.values(fixture.nodes);
  for (const t of ['gate', 'camp', 'task']) assert.ok(nodes.some((n) => n.type === t), `${t} がある`);
  assert.ok(nodes.some((n) => Array.isArray(n.cases) && n.cases.length >= 2), 'cases のあるマス');
  assert.ok(fixture.bestiary && Number.isInteger(fixture.bestiary.total), '図鑑');
});

test('§50.1 ページ: B5 の縦（36×51 目）が見開きで並び、方眼はページの中だけ。上の余白に No. と Date', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const pages = [...document.querySelectorAll('#paper .page[data-page]')];
      const sheets = pages.map((p) => p.querySelectorAll('.page-sheet').length);
      const sizes = pages.map((p) => { const s = p.querySelector('.page-sheet'); return [num(s, 'width') / U, num(s, 'height') / U]; });
      const grids = [...document.querySelectorAll('#paper [fill="url(#grid-5mm)"]')];
      const allSheets = pages.map((p) => bbox(p.querySelector('.page-sheet')));
      const gridsInside = grids.every((g) => allSheets.some((s) => inside(bbox(g), s)));
      const one = bbox(pages[0].querySelector('.page-sheet'));
      const two = pages[1] ? bbox(pages[1].querySelector('.page-sheet')) : null;
      return JSON.stringify({
        n: pages.length, numbers: pages.map((p) => p.dataset.page), sheets, sizes, grids: grids.length, gridsInside,
        sideBySide: !!two && Math.abs(one.y - two.y) < 1 && two.x >= one.x + one.w - 1 && two.x <= one.x + one.w + 3 * U,
        gutter: document.querySelectorAll('#paper .page-gutter').length,
        text: [...document.querySelectorAll('#paper text')].map((t) => t.textContent).join(' '),
        stageBg: getComputedStyle(document.querySelector('#stage')).backgroundColor,
        paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim(),
      });
    `)));
    assert.ok(r.n >= 3, `ページが3枚以上（${r.n}）`);
    assert.deepEqual(r.numbers, Array.from({ length: r.n }, (_, i) => String(i + 1)), 'data-page は1始まりの連番');
    assert.ok(r.sheets.every((n) => n === 1), 'ページごとに .page-sheet が1つ');
    for (const [w, h] of r.sizes) assert.deepEqual([w, h], [36, 51], 'B5 の縦は 36×51 目');
    assert.ok(r.grids >= r.n, '方眼の紙');
    assert.equal(r.gridsInside, true, '方眼はどれかのページの紙の中だけ');
    assert.equal(r.sideBySide, true, 'ページ1と2が見開きで左右に並ぶ');
    assert.ok(r.gutter >= 1, '綴じ目 .page-gutter');
    assert.match(r.text, /No\./);
    assert.match(r.text, /Date/);
    assert.notEqual(r.stageBg, r.paper, 'ページの外は机');
  });
});

test('§50.2 すべてを方眼に合わせる: マス・モンスター・札・題名の字は目の整数', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const bad = [];
      const check = (el, paperSel, kind) => {
        const [x, y, w, h] = box(el);
        if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0) { bad.push(kind + ' 整数でない ' + el.getAttribute('data-box')); return; }
        const s = sheetOf(el.getAttribute('data-page'));
        if (!s) { bad.push(kind + ' ページが無い'); return; }
        const p = el.querySelector(paperSel);
        if (!p) { bad.push(kind + ' 紙が無い ' + (el.dataset.node || '')); return; }
        const d = [num(p, 'x') - (num(s, 'x') + x * U), num(p, 'y') - (num(s, 'y') + y * U), num(p, 'width') - w * U, num(p, 'height') - h * U];
        if (d.some((v) => Math.abs(v) > 0.01)) bad.push(kind + ' ずれ ' + (el.dataset.node || '') + ' ' + d.join(','));
      };
      const nodes = [...document.querySelectorAll('#node-layer .node')];
      for (const n of nodes) check(n, n.classList.contains('gate') ? '.gate-paper' : '.cell-paper', 'node');
      const sqs = [...document.querySelectorAll('#monster-layer .sq')];
      for (const q of sqs) check(q, '.sq-paper', 'sq');
      const cells = [...document.querySelectorAll('.quest-title .title-cell')];
      const cellBoxes = cells.map(box);
      return JSON.stringify({
        bad: bad.slice(0, 10), nodes: nodes.length, sqs: sqs.length,
        cells: cells.map((c) => c.textContent), cellInts: cellBoxes.every((b) => b.every(Number.isInteger) && b[2] === b[3] && b[2] === cellBoxes[0][2]),
        title: document.querySelector('.quest-title').textContent,
      });
    `)));
    assert.deepEqual(r.bad, [], '方眼からずれたものがない');
    assert.equal(r.nodes, Object.keys(fixture.nodes).length);
    assert.ok(r.sqs > 0, 'モンスターのマス');
    assert.equal(r.title, fixture.quest.title, '.quest-title の字は題名');
    assert.equal(r.cells.join(''), fixture.quest.title, '題名は1字1マス');
    assert.ok(r.cells.every((c) => [...c].length === 1), '1マスに1字');
    assert.equal(r.cellInts, true, '題名のマスは目の整数の同じ大きさの正方形');
  });
});

test('§50.3 道はキャラクターごとに1本、ページの上から下へ曲がりながら下りる。名札', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const roads = [...document.querySelectorAll('.road[data-char]')];
      const pts = (d) => (d.match(/-?\\d+(\\.\\d+)?/g) || []).map(Number);
      const turns = roads.map((road) => {
        const lines = [...road.querySelectorAll('[data-tool="marker"]')];
        let horizontal = 0, vertical = 0;
        for (const l of lines) {
          const n = pts(l.getAttribute('d') || '');
          for (let i = 2; i + 1 < n.length; i += 2) { if (Math.abs(n[i] - n[i - 2]) > 1) horizontal++; if (Math.abs(n[i + 1] - n[i - 1]) > 1) vertical++; }
        }
        return { id: road.dataset.char, lines: lines.length, horizontal, vertical };
      });
      return JSON.stringify({
        turns,
        heads: [...document.querySelectorAll('.lane-head[data-char]')].map((h) => ({ id: h.dataset.char, tape: h.querySelectorAll('.tape').length })),
        tags: [...document.querySelectorAll('.lane-tag[data-char]')].map((t) => t.textContent),
      });
    `)));
    const ids = fixture.characters.map((c) => c.id).sort();
    assert.deepEqual(r.turns.map((t) => t.id).sort(), ids, '道はキャラクターに1つ');
    for (const t of r.turns) {
      assert.ok(t.lines >= 1, `道 ${t.id} は蛍光ペン`);
      assert.ok(t.vertical >= 1, `道 ${t.id} は上から下へ`);
    }
    assert.ok(r.turns.some((t) => t.horizontal >= 2), '道はまっすぐではなく、横にも曲がる');
    assert.deepEqual(r.heads.map((h) => h.id).sort(), ids, 'ふりだしの名札はキャラに1つ');
    for (const h of r.heads) assert.ok(h.tape >= 1, '名札はマスキングテープで貼る');
    assert.ok(r.tags.length >= 1, '2ページ目からの名札 .lane-tag');
    assert.ok(r.tags.some((t) => /[↓↑]p\.\d+/.test(t)), '駒が別のページにいれば ↓p.N / ↑p.N');
  });
});

test('§50.4 景色はマスではない（どのマス・札・城とも重ならない）。各ページに1つ以上', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const solid = [...document.querySelectorAll('#node-layer .cell-paper, #node-layer .gate-paper, #monster-layer .sq-paper')].map(bbox);
      const scenery = [...document.querySelectorAll('.scenery[data-kind]')];
      const pages = [...document.querySelectorAll('#paper .page[data-page]')].map((p) => bbox(p.querySelector('.page-sheet')));
      const perPage = pages.map((s) => scenery.filter((g) => inside(bbox(g), s, 2)).length);
      const hits = [];
      for (const g of scenery) { const b = bbox(g); if (solid.some((s) => overlap(b, s))) hits.push(g.dataset.kind + '@' + Math.round(b.x) + ',' + Math.round(b.y)); }
      return JSON.stringify({ kinds: [...new Set(scenery.map((g) => g.dataset.kind))], perPage, hits: hits.slice(0, 8) });
    `)));
    assert.ok(r.kinds.length >= 4, `景色の種類が4つ以上（${r.kinds}）`);
    assert.ok(r.kinds.some((k) => ['mountain', 'mountains'].includes(k)), '山');
    assert.ok(r.kinds.some((k) => ['lake', 'sea'].includes(k)), '湖か海');
    for (const [i, n] of r.perPage.entries()) assert.ok(n >= 1, `ページ ${i + 1} に景色`);
    assert.deepEqual(r.hits, [], '景色はマスと重ならない');
  });
});

test('§50.6 ダンジョンの出口の札・町・中ボス・魔王の城。技術の言葉が先', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const by = (id) => document.querySelector('#node-layer .node[data-node="' + id + '"]');
      const out = {};
      for (const id of Object.keys(window.__masume.view.nodes)) {
        const n = by(id);
        out[id] = { cls: n.getAttribute('class'), title: n.querySelector('.cell-title, .gate-title')?.textContent || '', tests: n.querySelector('.cell-tests, .gate-hp')?.textContent || '', commit: n.querySelector('.save-commit')?.textContent || '', text: n.textContent };
      }
      return JSON.stringify(out);
    `)));
    for (const [id, n] of Object.entries(fixture.nodes)) {
      const d = r[id];
      assert.ok(d, `${id} が描かれる`);
      assert.match(d.cls, new RegExp(`\\b${n.type}\\b`), `${id} は .node.${n.type}`);
      if (n.type === 'task' && n.check?.kind === 'cmd' && n.tests?.total > 0) assert.match(d.tests, new RegExp(`テスト ${n.tests.pass}/${n.tests.total}`), `${id} の札に テスト p/t`);
      if (n.type === 'camp' && n.save?.commit) assert.match(d.commit, new RegExp(`commit ${n.save.commit.slice(0, 7)}`), `町 ${id} に commit`);
      if (n.type === 'gate' && n.tests?.total > 0) assert.match(d.tests, new RegExp(`テスト ${n.tests.pass}/${n.tests.total}`), `中ボス ${id} の HP`);
    }
    assert.match(r[fixture.quest.goal].cls, /\bgoal\b/, 'あがりは魔王の城');
  });
});

test('狭い画面（390px）でも横にはみ出さない', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = await page.eval(`({ sw: document.documentElement.scrollWidth, iw: innerWidth, board: document.querySelector('#board').getBoundingClientRect().width, no: document.querySelector('#page-no')?.textContent || '' })`);
    assert.ok(r.sw <= r.iw + 1, `横スクロールが出ない (${r.sw} > ${r.iw})`);
    assert.ok(r.board > 300);
    assert.match(r.no, /^\s*\d+\s*\/\s*\d+\s*$/, `狭い画面は1ページずつ（${r.no}）`);
  }, { width: 390, height: 844 });
});
