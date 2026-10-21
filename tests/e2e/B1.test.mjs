// B1「方眼ノートに道を描く」— 盤面が見本のビューを 5mm 方眼ノートのすごろくとして描けるか。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser } from '../helpers.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));

test('見本の盤面: 紙・道・マス・ゲート・宿屋・駒・じゅもん', async () => {
  const srv = await serveStatic();
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const r = await page.eval(`(() => {
      const q = (s) => document.querySelector(s);
      const qa = (s) => [...document.querySelectorAll(s)];
      return {
        svg: !!q('svg#board'),
        grid5: !!q('#grid-5mm'),
        grid10: !!q('#grid-10mm'),
        nodes: Object.fromEntries(qa('#node-layer [data-node]').map((g) => [g.dataset.node, g.dataset.state])),
        gates: qa('#node-layer .node.gate').length,
        camps: qa('#node-layer .node.camp').length,
        roads: qa('.road[data-char]').map((p) => p.dataset.char),
        pawns: Object.fromEntries(qa('.pawn[data-char]').map((g) => [g.dataset.char, g.dataset.at])),
        heads: qa('.lane-head[data-char]').length,
        jumon: q('#jumon').textContent.trim(),
        party: qa('.party-card[data-char]').length,
        log: qa('#log .log-entry').length,
        integrity: q('#integrity').dataset.ok,
        title: q('.quest-title')?.textContent,
        viewBox: q('#board').getAttribute('viewBox'),
      };
    })()`);
    assert.ok(r.svg && r.grid5 && r.grid10, '5mm方眼（10mm実線入り）の紙');
    const expectNodes = Object.fromEntries(Object.entries(fixture.nodes).map(([id, n]) => [id, n.state]));
    assert.deepEqual(r.nodes, expectNodes, 'すべてのマスが、ビューの state のまま描かれる');
    assert.equal(r.gates, Object.values(fixture.nodes).filter((n) => n.type === 'gate').length);
    assert.equal(r.camps, Object.values(fixture.nodes).filter((n) => n.type === 'camp').length);
    assert.deepEqual([...r.roads].sort(), fixture.characters.map((c) => c.id).sort(), 'キャラクターごとに道');
    assert.deepEqual(r.pawns, Object.fromEntries(fixture.characters.map((c) => [c.id, c.at ?? ''])), '駒は今いるマスに立つ');
    assert.equal(r.heads, fixture.characters.length, 'ふりだしの名札');
    assert.equal(r.jumon, fixture.head.jumon);
    assert.equal(r.party, fixture.characters.length);
    assert.equal(r.log, Math.min(80, fixture.log.length));
    assert.equal(r.integrity, 'true');
    assert.equal(r.title, fixture.quest.title);
    assert.ok(r.viewBox, 'カメラが合っている');
    const exceptions = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    assert.deepEqual(exceptions, [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
});

// 第11章（§50.3・§50.6）で直した: 道は横に並ぶ帯ではなく、ページの上から下へ下りる縦の道になった。
// 「ゲートが名札の高さにかかる」という横の道の前提をやめ、ゲート（城壁の帯）がメンバーの道の横の範囲
// （ゲートの直前のマスの札の真ん中）にかかり、帯がその札より下にあることを確かめる。
test('ゲートは道を合流させる: 城壁の帯が、メンバーの道（ゲートの直前のマス）の横の範囲にかかる', async () => {
  const srv = await serveStatic();
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const r = await page.eval(`(() => {
      const box = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const v = window.__masume.view;
      const gate = document.querySelector('#node-layer [data-node="G1"] .gate-paper');
      const before = Object.fromEntries(v.nodes.G1.members.map((m) => {
        const path = v.characters.find((c) => c.id === m).path;
        const prev = path[path.indexOf('G1') - 1];
        const el = document.querySelector('#node-layer [data-node="' + prev + '"] .cell-paper');
        return [m, { prev, box: el ? box(el) : null, page: document.querySelector('#node-layer [data-node="' + prev + '"]')?.dataset.page }];
      }));
      return { gate: box(gate), gatePage: document.querySelector('#node-layer [data-node="G1"]').dataset.page, before };
    })()`);
    for (const [m, b] of Object.entries(r.before)) {
      assert.ok(b.box, `${m} のゲートの直前のマス ${b.prev} の札`);
      const mid = b.box.x + b.box.w / 2;
      if (b.page === r.gatePage) {
        assert.ok(mid > r.gate.x && mid < r.gate.x + r.gate.w, `ゲート G1 の帯は ${m} の道（${b.prev} の真下）にかかっている`);
        assert.ok(b.box.y + b.box.h <= r.gate.y + 0.5, `${m} の ${b.prev} はゲートより上（道は上から下へ）`);
      }
    }
  } finally {
    await page.close();
    await srv.close();
  }
});

test('スマホの幅でも横にはみ出さない', async () => {
  const srv = await serveStatic();
  const page = await openBrowser({ width: 390, height: 844 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const r = await page.eval(`({ sw: document.documentElement.scrollWidth, iw: innerWidth, board: document.querySelector('#board').getBoundingClientRect().width })`);
    assert.ok(r.sw <= r.iw + 1, `横スクロールが出ない (${r.sw} > ${r.iw})`);
    assert.ok(r.board > 300, '盤面が表示されている');
  } finally {
    await page.close();
    await srv.close();
  }
});
