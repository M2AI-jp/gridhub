// B12「マス = テスト1件 = モンスター。駒は最初に落ちているマスに立つ」— CONTRACTS §50.5・§50.7・§50.11（第11章）。
// 見本 demo に求めること: ok が true・false・null のテスト、復活したまま（revived > 0 で ok !== true）のテスト、
// cases が [] の cmd の task、task の上で square が途中（0 < square < cases.length）の駒。
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

const cmdTasks = Object.values(fixture.nodes).filter((n) => n.type === 'task' && n.check?.kind === 'cmd');

test('見本の条件', () => {
  const all = cmdTasks.flatMap((n) => n.cases || []);
  for (const ok of [true, false, null]) assert.ok(all.some((c) => c.ok === ok), `ok: ${ok} のテスト`);
  assert.ok(all.some((c) => c.revived > 0 && c.ok !== true), '復活したままのテスト');
  assert.ok(cmdTasks.some((n) => n.cases.length === 0), 'まだ走らせていないダンジョン（？のマス）');
  assert.ok(fixture.characters.some((c) => c.square !== null && c.square > 0 && c.square < fixture.nodes[c.at].cases.length), '途中のマスに立つ駒');
});

test('§50.5 モンスターはテスト1件に1体。倒したら赤い斜線、復活したら赤い丸、？のマス', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(`(() => {
      const out = {};
      for (const q of document.querySelectorAll('#monster-layer .sq[data-node]')) {
        (out[q.dataset.node] ||= []).push({ i: q.dataset.case, ok: q.dataset.ok, slain: !!q.querySelector('.slain'), revived: !!q.querySelector('.revived'), title: q.querySelector('title')?.textContent || '', page: q.dataset.page });
      }
      return JSON.stringify(out);
    })()`));
    for (const n of cmdTasks) {
      const sq = r[n.id] || [];
      if (n.cases.length === 0) {
        assert.deepEqual(sq.map((s) => s.i), ['?'], `${n.id} はまだ戦っていない「？」のマスが1つ`);
        continue;
      }
      assert.deepEqual(sq.map((s) => s.i), n.cases.map((_, i) => String(i)), `${n.id} のモンスターはテストの数だけ、順番どおり`);
      n.cases.forEach((c, i) => {
        const s = sq[i];
        assert.equal(s.ok, String(c.ok), `${n.id}[${i}] の data-ok`);
        assert.ok(s.title.includes(c.name), `${n.id}[${i}] の title にテストの名前`);
        assert.equal(s.slain, c.ok === true, `${n.id}[${i}] 倒したテストだけに赤い斜線`);
        assert.equal(s.revived, c.revived > 0 && c.ok !== true, `${n.id}[${i}] 復活したままなら赤い丸`);
      });
    }
    const others = Object.values(fixture.nodes).filter((n) => !(n.type === 'task' && n.check?.kind === 'cmd')).map((n) => n.id);
    for (const id of others) assert.equal(r[id], undefined, `${id}（ハンコ・町・ゲート）の前にモンスターは置かない`);
  });
});

test('§50.5 モンスターは、そのダンジョンの札の手前（同じ道の上、札より上か同じ高さのページ）に並ぶ', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(`(() => {
      const abs = (el) => { const b = el.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
      const out = [];
      for (const n of document.querySelectorAll('#node-layer .node.task')) {
        const sqs = [...document.querySelectorAll('#monster-layer .sq[data-node="' + n.dataset.node + '"]')];
        if (!sqs.length) continue;
        const card = abs(n.querySelector('.cell-paper'));
        const last = sqs[sqs.length - 1];
        const lb = abs(last.querySelector('.sq-paper'));
        out.push({ id: n.dataset.node, cardPage: Number(n.dataset.page), lastPage: Number(last.dataset.page), above: lb.y + lb.h <= card.y + 0.5 });
      }
      return JSON.stringify(out);
    })()`));
    assert.ok(r.length > 0);
    for (const x of r) {
      assert.ok(x.lastPage <= x.cardPage, `${x.id} のモンスターは札のページか、その前のページ`);
      if (x.lastPage === x.cardPage) assert.equal(x.above, true, `${x.id} のモンスターは札の手前（上）`);
    }
  });
});

test('§50.7 駒は、最初に落ちているテストのマスに立つ（全部倒していれば札の前）', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(`(() => {
      const center = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, l: b.left, r: b.right, t: b.top, b: b.bottom }; };
      const out = {};
      for (const p of document.querySelectorAll('.pawn[data-char]')) {
        const sq = p.dataset.square === '' ? null : document.querySelector('#monster-layer .sq[data-node="' + p.dataset.at + '"][data-case="' + p.dataset.square + '"]');
        const foot = p.querySelector('.pawn-foot') || p;
        out[p.dataset.char] = { at: p.dataset.at, square: p.dataset.square, level: p.dataset.level, page: p.dataset.page, sq: sq ? center(sq.querySelector('.sq-paper')) : null, pawn: center(foot), sqPage: sq?.dataset.page ?? null };
      }
      return JSON.stringify(out);
    })()`));
    for (const c of fixture.characters) {
      const p = r[c.id];
      assert.ok(p, `${c.id} の駒`);
      assert.equal(p.at, c.at ?? '');
      assert.equal(p.level, String(c.level));
      assert.equal(p.square, c.square === null || c.square === undefined ? '' : String(c.square), `${c.id} の data-square はビューの square`);
      const n = c.at && fixture.nodes[c.at];
      if (n && n.type === 'task' && n.check?.kind === 'cmd' && c.square < n.cases.length) {
        assert.equal(p.page, p.sqPage, `${c.id} の駒はモンスターと同じページ`);
      }
    }
    // いま見えている見開きの駒は、マスの上に立っている
    const visible = await page.eval(`window.__masume.spread`);
    for (const c of fixture.characters) {
      const p = r[c.id];
      const n = c.at && fixture.nodes[c.at];
      if (!(n && n.type === 'task' && n.check?.kind === 'cmd' && c.square < n.cases.length && n.cases.length > 0)) continue;
      if (![visible, visible + 1].includes(Number(p.page))) continue;
      assert.ok(p.pawn.x >= p.sq.l - 2 && p.pawn.x <= p.sq.r + 2, `${c.id} の駒は ${c.at}[${c.square}] のマスの上（横）`);
    }
  });
});

test('§50.11 右の欄: 代・今のマスのテスト・メダル・図鑑。名前は GridHub', { timeout: 120000 }, async () => {
  await withDemo(async (page) => {
    const r = JSON.parse(await page.eval(`JSON.stringify({
      cards: Object.fromEntries([...document.querySelectorAll('.party-card[data-char]')].map((c) => [c.dataset.char, c.innerText])),
      bestiary: document.querySelector('#bestiary')?.innerText || '',
      title: document.title,
      logo: document.querySelector('.logo')?.textContent || '',
    })`));
    for (const c of fixture.characters) {
      const text = r.cards[c.id];
      assert.ok(text, `${c.id} のカード`);
      assert.match(text, new RegExp(`${c.generation}代目`), `${c.id} は ${c.generation}代目`);
      const n = c.at && fixture.nodes[c.at];
      if (n && n.tests && n.tests.total > 0 && c.status === 'working') assert.match(text, new RegExp(`テスト ${n.tests.pass}/${n.tests.total}`), `${c.id} の今のマスのテスト`);
    }
    assert.match(r.bestiary, new RegExp(`${fixture.bestiary.defeated}\\s*/\\s*${fixture.bestiary.total}`), '図鑑');
    assert.match(r.title, /GridHub/);
    assert.match(r.logo, /GridHub/);
  });
});
