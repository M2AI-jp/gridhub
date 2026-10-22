// B14「余白のマス」— CONTRACTS §53.6（第11章・ユーザーの指示）。盤面（賢者クロード）が、ビューの margins と news を描く。
// 見本のビュー（web/fixtures/demo-state.json）に、§53.2 の規則で余白を足したものを /api/state で配る（書記を待たずに確かめる）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__masume && window.__masume.ready';
const base = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const nameOf = (id) => base.characters.find((c) => c.id === id)?.name ?? id;

/** §53.2 の置き方で余白をつくる。各キャラクターの最初の2つは起きている（lines がある）ことにする */
function withMargins(view) {
  const margins = [];
  for (const c of view.characters) {
    let n = 0;
    c.path.forEach((id, i) => {
      const node = view.nodes[id];
      if (i === c.path.length - 1 || !node || !['task', 'camp'].includes(node.type)) return;
      const next = view.nodes[c.path[i + 1]];
      const kind = node.type === 'camp' ? 'npc' : next?.type === 'gate' ? 'talk' : 'news';
      const happened = n++ < 2;
      const partner = view.characters.find((o) => o.id !== c.id)?.id ?? c.id;
      const lines = !happened ? [] : kind === 'news'
        ? [{ who: null, text: `号外: ${c.name} が ${id}「${node.title}」を抜けた（テスト 3/3）` }, { who: null, text: 'メモアプリでは、タグで絞り込む作りがよく使われる' }]
        : kind === 'npc'
          ? [{ who: '宿屋の主人', text: `${c.name}さん、おつかれさま。テスト 5 件、通ってきたね` }, { who: '宿屋の主人', text: 'セーブは commit a1b2c3d。変えたファイルは 2 件' }]
          : [{ who: c.id, text: 'GET /api/memos は配列で返す' }, { who: partner, text: 'じゃあ一覧はそれで描く' }];
      margins.push({
        id: `m-${id}`, road: c.id, after: id, kind,
        title: kind === 'news' ? '瓦版' : kind === 'npc' ? `${node.title} の住人` : `${c.name} と ${nameOf(partner)}`,
        lines, seq: happened ? 3 : null, commit: happened ? 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' : null,
      });
    });
  }
  const news = [
    { text: 'メモアプリでは、タグで絞り込む作りがよく使われる', kind: 'domain', seq: null },
    { text: `号外: ${base.characters[0].name} が ${base.characters[0].path[0]} を抜けた（テスト 2/2）`, kind: 'extra', seq: 5 },
  ];
  return { ...view, margins, news };
}

const VIEW = withMargins(base);

async function withBoard(fn, view = VIEW, { expectMargins = true } = {}) {
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, view),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 15000 });
    if (expectMargins) await page.waitFor(`document.querySelectorAll('#margin-layer .margin-sq').length > 0`, { timeout: 10000, message: '余白のマスが描かれる' });
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
`;
const inPage = (body) => `(() => { ${TOOLS} ${body} })()`;

test('見本の条件（余白の3つの種類がそろう）', () => {
  const kinds = new Set(VIEW.margins.map((m) => m.kind));
  for (const k of ['talk', 'npc', 'news']) assert.ok(kinds.has(k), `見本に ${k} の余白がある`);
  assert.ok(VIEW.margins.some((m) => m.lines.length) && VIEW.margins.some((m) => !m.lines.length), '起きている余白と、まだの余白');
});

test('§53.6 余白のマスは、道の上の after のすぐ後に、方眼に合わせて描かれ、マス・札・城・モンスターと重ならない', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    const r = JSON.parse(await page.eval(inPage(`
      const bad = [];
      const sqs = [...document.querySelectorAll('#margin-layer .margin-sq')];
      const solid = [...document.querySelectorAll('#node-layer .cell-paper, #node-layer .gate-paper, #monster-layer .sq-paper')].map(bbox);
      const items = sqs.map((el) => {
        const [x, y, w, h] = box(el);
        const s = sheetOf(el.getAttribute('data-page'));
        const p = el.querySelector('.margin-paper');
        if (![x, y, w, h].every(Number.isInteger) || w <= 0 || h <= 0) bad.push('整数でない ' + el.dataset.margin);
        else if (!s || !p) bad.push('ページか紙が無い ' + el.dataset.margin);
        else {
          const d = [num(p, 'x') - (num(s, 'x') + x * U), num(p, 'y') - (num(s, 'y') + y * U), num(p, 'width') - w * U, num(p, 'height') - h * U];
          if (d.some((v) => Math.abs(v) > 0.01)) bad.push('ずれ ' + el.dataset.margin + ' ' + d.join(','));
          if (solid.some((b) => overlap(bbox(p), b))) bad.push('重なり ' + el.dataset.margin);
        }
        return { id: el.dataset.margin, kind: el.dataset.kind, road: el.dataset.road, after: el.dataset.after, happened: el.dataset.happened, page: el.dataset.page };
      });
      const pageOf = Object.fromEntries([...document.querySelectorAll('#node-layer .node[data-node]')].map((n) => [n.dataset.node, n.dataset.page]));
      const inNodes = [...document.querySelectorAll('#node-layer [data-node]')].filter((n) => n.dataset.node.startsWith('m-')).length;
      return JSON.stringify({ bad: bad.slice(0, 10), items, pageOf, inNodes });
    `)));
    assert.deepEqual(r.bad, [], '方眼からずれた・重なった余白がない');
    assert.deepEqual(r.items.map((m) => [m.id, m.kind, m.road, m.after, m.happened]),
      VIEW.margins.map((m) => [m.id, m.kind, m.road, m.after, String(m.lines.length > 0)]), 'ビューの margins がそのまま並ぶ');
    for (const m of r.items) {
      const c = VIEW.characters.find((x) => x.id === m.road);
      const next = c.path[c.path.indexOf(m.after) + 1];
      assert.ok([r.pageOf[m.after], r.pageOf[next]].includes(m.page), `${m.id} は ${m.after} か次の ${next} と同じページ（${m.page}）`);
    }
    assert.equal(r.inNodes, 0, '余白は #node-layer のマスに入らない');
  });
});

test('§53.6 起きている余白は、ふきだしと <title> にすべての行の字（話し手の名前つき）。瓦版（#news）に view.news', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    const r = JSON.parse(await page.eval(`JSON.stringify({
      sqs: [...document.querySelectorAll('#margin-layer .margin-sq')].map((el) => ({
        id: el.dataset.margin, title: el.querySelector('title')?.textContent || '', bubble: !!el.querySelector('.margin-bubble'),
      })),
      news: [...document.querySelectorAll('#news .news-item')].map((n) => ({ kind: n.dataset.kind, text: n.textContent.trim() })),
    })`));
    for (const m of VIEW.margins) {
      const sq = r.sqs.find((s) => s.id === m.id);
      assert.ok(sq, m.id);
      if (!m.lines.length) continue;
      assert.ok(sq.bubble, `${m.id} にふきだし .margin-bubble`);
      for (const l of m.lines) {
        const who = l.who === null ? '' : `${VIEW.characters.some((c) => c.id === l.who) ? nameOf(l.who) : l.who}: `;
        assert.ok(sq.title.includes(`${who}${l.text}`), `${m.id} の <title> に「${who}${l.text}」: ${sq.title}`);
      }
    }
    assert.deepEqual(r.news.map((n) => n.kind), VIEW.news.map((n) => n.kind), '#news は view.news の順');
    r.news.forEach((n, i) => assert.ok(n.text.includes(VIEW.news[i].text), `#news[${i}] の字`));
  });
});

test('§53.6 margins と news の無いビュー（古いエンジン）では、余白を描かず、エラーも出さない', { timeout: 120000 }, async () => {
  const { margins, news, ...old } = VIEW;
  await withBoard(async (page) => {
    await new Promise((r) => setTimeout(r, 1000));
    assert.equal(await page.eval(`document.querySelectorAll('#margin-layer .margin-sq').length`), 0);
  }, old, { expectMargins: false });
});
