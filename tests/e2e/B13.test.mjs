// B13「見開きをめくり、1マスずつ歩き、エンディングを見る」— CONTRACTS §50.8〜§50.12（第11章）。
// 見本（?fixture=demo・?fixture=end・?script=demo）と、伝令の窓口の小さな偽物をヘッドレス Chrome で開いて確かめる。
// 見本に求めること: ページが4枚以上（見開きが2つ以上）、台本 demo で書記が E3 を2マス歩く場面、end に ending。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, openBrowserWith, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const fixture = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const end = JSON.parse(readFileSync(join(WEB, 'fixtures', 'end-state.json'), 'utf8'));
const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withPage(fn, { url = '/?fixture=demo', width = 1440, height = 900, media = [] } = {}) {
  const srv = await serveStatic();
  const page = media.length ? await openBrowserWith({ width, height, media }) : await openBrowser({ width, height });
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

const NAV = `JSON.stringify({
  spread: window.__masume.spread,
  pages: window.__masume.pages,
  dom: document.querySelectorAll('#paper .page[data-page]').length,
  no: document.querySelector('#page-no')?.textContent.trim(),
  prev: !!document.querySelector('#page-prev'),
  next: !!document.querySelector('#page-next'),
  nodes: document.querySelectorAll('#node-layer .node').length,
  sqs: document.querySelectorAll('#monster-layer .sq').length,
  vb: document.querySelector('#board').getAttribute('viewBox'),
})`;

test('見本の条件', () => {
  assert.ok(Object.keys(fixture.nodes).length >= 10);
  assert.ok(end.finished === true && end.ending && typeof end.ending.text === 'string' && Number.isInteger(end.ending.seq), 'end に ending');
});

test('§50.8 見開き: #page-prev・#page-next・#page-no、__masume.spread・pages。めくるあいだは .page-flip の葉が <use href="#world"> で回る', { timeout: 120000 }, async () => {
  await withPage(async (page) => {
    const a = JSON.parse(await page.eval(NAV));
    assert.ok(a.prev && a.next, '#page-prev と #page-next');
    assert.equal(a.pages, a.dom, '__masume.pages はページの数');
    assert.ok(a.pages >= 4, `見本はページが4枚以上（${a.pages}）`);
    assert.equal(a.spread % 2, 1, '見開きの左は奇数のページ');
    assert.equal(a.no, `${a.spread}–${a.spread + 1} / ${a.pages}`, `#page-no は「左–右 / 全部」（${a.no}）`);

    // 次の見開きへ: めくっているあいだに、葉（<use href="#world">）が出る。DOM の数え方は変わらない
    await page.eval(`window.__masume.turnTo(1); true`);
    await page.waitFor(`window.__masume.spread === 1 && !window.__masume.flipping`);
    await page.eval(`document.querySelector('#page-next').click()`);
    const during = JSON.parse(await page.eval(`JSON.stringify({
      leaf: document.querySelectorAll('.page-flip').length,
      uses: [...document.querySelectorAll('.page-flip use')].map((u) => u.getAttribute('href')),
      nodes: document.querySelectorAll('#node-layer .node').length,
      sqs: document.querySelectorAll('#monster-layer .sq').length,
    })`));
    assert.equal(during.leaf, 1, 'めくる葉 .page-flip が1枚');
    assert.ok(during.uses.length >= 1 && during.uses.every((h) => h === '#world'), `葉の中身は <use href="#world">（${during.uses}）`);
    assert.equal(during.nodes, a.nodes, 'めくっていても .node の数は変わらない');
    assert.equal(during.sqs, a.sqs, 'めくっていても .sq の数は変わらない');
    await page.waitFor(`window.__masume.spread === 3 && document.querySelectorAll('.page-flip').length === 0`, { timeout: 5000, message: 'めくり終わる' });
    const b = JSON.parse(await page.eval(NAV));
    assert.equal(b.no, `3–4 / ${b.pages}`);
    assert.notEqual(b.vb, a.vb, '見えるところが次の見開きに移る');

    // 見えている見開きの2ページは、盤面の中に収まっている
    const fit = JSON.parse(await page.eval(`(() => {
      const [x, y, w, h] = document.querySelector('#board').getAttribute('viewBox').split(/\\s+/).map(Number);
      const s = [3, 4].map((n) => document.querySelector('#paper .page[data-page="' + n + '"] .page-sheet').getBBox());
      return JSON.stringify(s.map((b) => b.x >= x - 2 && b.y >= y - 2 && b.x + b.width <= x + w + 2 && b.y + b.height <= y + h + 2));
    })()`));
    assert.deepEqual(fit, [true, true], 'ページ3・4が見えている');

    // 前へ・turnTo
    await page.eval(`document.querySelector('#page-prev').click()`);
    await page.waitFor(`window.__masume.spread === 1 && !window.__masume.flipping`, { timeout: 5000 });
    await page.eval(`window.__masume.turnTo(4); true`);
    await page.waitFor(`window.__masume.spread === 3 && !window.__masume.flipping`, { timeout: 5000, message: 'turnTo(4) はページ4のある見開き（3–4）' });
  });
});

test('§50.8 動きを減らす設定では、めくる動きなしで切り替わる', { timeout: 120000 }, async () => {
  await withPage(
    async (page) => {
      await page.eval(`window.__masume.turnTo(3); true`);
      const r = JSON.parse(await page.eval(`JSON.stringify({ spread: window.__masume.spread, leaf: document.querySelectorAll('.page-flip').length })`));
      assert.deepEqual(r, { spread: 3, leaf: 0 }, 'すぐに切り替わり、葉は出ない');
    },
    { media: [{ name: 'prefers-reduced-motion', value: 'reduce' }] },
  );
});

test('§50.8 狭い画面（860px 以下）では1ページずつ', { timeout: 120000 }, async () => {
  await withPage(
    async (page) => {
      const a = JSON.parse(await page.eval(NAV));
      assert.equal(a.no, `${a.spread} / ${a.pages}`, `1ページずつの #page-no（${a.no}）`);
      await page.eval(`window.__masume.turnTo(1); true`);
      await page.waitFor(`window.__masume.spread === 1 && !window.__masume.flipping`, { timeout: 5000 });
      await page.eval(`document.querySelector('#page-next').click()`);
      await page.waitFor(`window.__masume.spread === 2 && !window.__masume.flipping`, { timeout: 5000, message: '次のページ（2）へ' });
      assert.equal(await page.eval(`document.querySelector('#page-no').textContent.trim()`), `2 / ${a.pages}`);
    },
    { width: 390, height: 844 },
  );
});

test('§50.8 駒が今の見開きの外のページへ進んだら、そのページの見開きへめくる', { timeout: 120000 }, async () => {
  await withPage(async (page) => {
    await page.eval(`window.__masume.turnTo(1, { animate: false }); true`);
    // 伝令を、別の見開きにあるマスへ進めたビュー
    const target = await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      const pageOf = (id) => Number(document.querySelector('#node-layer .node[data-node="' + id + '"]').dataset.page);
      const c = v.characters.find((x) => x.path.some((id) => pageOf(id) >= 3 && v.nodes[id].type === 'task' && v.nodes[id].check?.kind === 'cmd' && v.nodes[id].cases.length > 0));
      const id = c.path.find((id) => pageOf(id) >= 3 && v.nodes[id].type === 'task' && v.nodes[id].check?.kind === 'cmd' && v.nodes[id].cases.length > 0);
      c.pos = c.path.indexOf(id); c.at = id; c.status = 'working'; c.square = 0;
      v.head = { ...v.head, seq: v.head.seq + 1 };
      window.__masume.render(v);
      return { char: c.id, page: Number(document.querySelector('.pawn[data-char="' + c.id + '"]').dataset.page) };
    })()`);
    assert.ok(target.page >= 3, `駒は3ページ目より後へ（${target.page}）`);
    const want = target.page % 2 ? target.page : target.page - 1;
    await page.waitFor(`window.__masume.spread === ${want} && !window.__masume.flipping`, { timeout: 15000, message: `駒のいる見開き（${want}）へめくる` });
  });
});

test('§50.9 1マスずつ歩く: __masume.walks に {char, from, to, steps}', { timeout: 120000 }, async () => {
  await withPage(
    async (page) => {
      await page.waitFor('window.__masume.done === true', { timeout: 20000 });
      await sleep(2500);
      const walks = await page.eval(`window.__masume.walks`);
      assert.ok(Array.isArray(walks) && walks.length > 0, '歩いた記録がある');
      for (const w of walks) {
        assert.equal(typeof w.char, 'string');
        assert.ok('from' in w && 'to' in w, 'from と to');
        assert.ok(Number.isInteger(w.steps) && w.steps >= 0, 'steps は踏んだマスの数');
      }
      // 台本の1場面目: 書記が E3 のテストを2件倒し、駒は2マス進む（square 2 → 4）
      assert.ok(walks.some((w) => w.char === 'engine' && w.steps === 2 && !w.back), `書記が2マス歩く: ${JSON.stringify(walks)}`);
      assert.ok(walks.filter((w) => !w.back).every((w) => w.steps >= 1), '前に進んだら1マス以上');
    },
    { url: '/?fixture=demo&script=demo&interval=600' },
  );
});

test('§50.10 エンディング: ending があれば #ending（role="dialog"）に text、#ending-close で閉じ、新しい seq でまた開く', { timeout: 120000 }, async () => {
  await withPage(
    async (page) => {
      await page.waitFor(`!document.querySelector('#ending').hidden`, { timeout: 5000, message: 'エンディングが開く' });
      const r = JSON.parse(await page.eval(`JSON.stringify({ role: document.querySelector('#ending').getAttribute('role'), text: document.querySelector('#ending').innerText })`));
      assert.equal(r.role, 'dialog');
      for (const line of end.ending.text.split('\n').filter(Boolean)) assert.ok(r.text.includes(line), `ending.text の「${line}」`);
      await page.eval(`document.querySelector('#ending-close').click()`);
      assert.equal(await page.eval(`document.querySelector('#ending').hidden`), true, '#ending-close で閉じる');
      // 同じ ending で描き直しても開かない。新しい seq なら開く
      await page.eval(`window.__masume.render(window.__masume.view); true`);
      assert.equal(await page.eval(`document.querySelector('#ending').hidden`), true, '同じ ending.seq では開かない');
      await page.eval(`(() => { const v = structuredClone(window.__masume.view); v.ending = { ...v.ending, seq: v.ending.seq + 5, text: 'テスト 1/1 が通った。\\n二度目のあがり。' }; v.head = { ...v.head, seq: v.head.seq + 5 }; window.__masume.render(v); return true; })()`);
      assert.equal(await page.eval(`document.querySelector('#ending').hidden`), false, '新しい ending.seq で開く');
      assert.match(await page.eval(`document.querySelector('#ending').innerText`), /二度目のあがり/);
    },
    { url: '/?fixture=end' },
  );
  // ending が無い見本では開かない
  await withPage(async (page) => {
    await sleep(500);
    assert.equal(await page.eval(`document.querySelector('#ending').hidden`), true, 'ending が null なら開かない');
  });
});

test('§50.12 作戦の窓: #sortie-tactic の既定は GET /api/party の tactic（null なら balanced）。POST /api/sortie の本文に tactic を必ず入れる', { timeout: 120000 }, async () => {
  let tactic = 'bold';
  const posts = [];
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, fixture),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic, agent: 'claude', parallel: 2, allow_listen: false }),
    'POST /api/sortie': async (req, res) => { posts.push(JSON.parse(await readBody(req))); json(res, 202, { ok: true }); },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 15000 });
    const opts = await page.eval(`[...document.querySelectorAll('#sortie-tactic option')].map((o) => [o.value, o.textContent])`);
    assert.deepEqual(opts.map((o) => o[0]), ['careful', 'balanced', 'bold'], '3つの作戦');
    for (const [v, ja] of [['careful', 'いのちだいじに'], ['balanced', 'バッチリがんばれ'], ['bold', 'ガンガンいこうぜ']]) assert.ok(opts.find((o) => o[0] === v)[1].includes(ja), `${v} は ${ja}`);

    const open = async () => {
      await page.eval(`document.querySelector('#sortie-open').click()`);
      await page.waitFor(`document.querySelector('#sortie-modal').open === true`, { message: '出撃の窓がひらく' });
    };
    await open();
    await page.waitFor(`document.querySelector('#sortie-tactic').value === 'bold'`, { timeout: 5000, message: 'party.json の tactic（bold）が既定' });
    await page.eval(`document.querySelector('#sortie-go').click()`);
    await waitUntil(() => posts.length === 1, { message: '出撃の POST' });
    assert.equal(posts[0].tactic, 'bold', `本文に tactic: ${JSON.stringify(posts[0])}`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === false`);

    tactic = null;
    await open();
    await page.waitFor(`document.querySelector('#sortie-tactic').value === 'balanced'`, { timeout: 5000, message: 'tactic が null なら balanced' });
    await page.eval(`(() => { const s = document.querySelector('#sortie-tactic'); s.value = 'careful'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.eval(`document.querySelector('#sortie-go').click()`);
    await waitUntil(() => posts.length === 2, { message: '2回目の出撃の POST' });
    assert.equal(posts[1].tactic, 'careful', `選んだ作戦を送る: ${JSON.stringify(posts[1])}`);
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]')), []);
  } finally {
    await page.close();
    await srv.close();
  }
});
