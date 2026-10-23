// B3「台帳とハンコを用意する」— Linear風の台帳、ルール、ハンコとボス戦のボタン、判定出力へのリンク。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));
const LINEAR = { cleared: 'Done', current: 'In Progress', waiting: 'In Review', ready: 'In Review', stale: 'Todo', open: 'Todo', fog: 'Backlog' };

test('台帳: マスがそのまま Linear のステータスで並ぶ', async () => {
  const srv = await serveStatic();
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?fixture=demo&view=list`);
    await page.waitFor('window.__masume && window.__masume.ready');
    const r = await page.eval(`(() => ({
      active: document.querySelector('#view-list').classList.contains('active'),
      rows: Object.fromEntries([...document.querySelectorAll('#ledger tr[data-node]')].map((tr) => [tr.dataset.node, tr.dataset.status])),
      groups: [...document.querySelectorAll('#ledger tbody[data-group]')].map((g) => g.dataset.group),
    }))()`);
    assert.equal(r.active, true);
    const expected = Object.fromEntries(Object.entries(fixture.nodes).filter(([, n]) => n.type !== 'camp').map(([id, n]) => [id, LINEAR[n.state]]));
    assert.deepEqual(r.rows, expected, '宿屋以外のマスが1行ずつ、Linear のステータスで');
    assert.equal(r.groups[0], 'In Progress', '進行中が一番上');

    await page.goto(`${srv.url}/?fixture=demo&view=rules`);
    await page.waitFor('window.__masume && window.__masume.ready');
    const rules = await page.eval(`({ active: document.querySelector('#view-rules').classList.contains('active'), text: document.querySelector('#rules').innerText })`);
    assert.equal(rules.active, true);
    // 第11章 §52（GM）: じゅもんはやめた。遊び方には、記録の番号（seq）で戻ることを書く
    for (const w of ['記録の番号', 'load', '消しゴム', '結合ゲート', 'ハンコ', '封印']) assert.match(rules.text, new RegExp(w));
    assert.doesNotMatch(rules.text, /じゅもん/);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('ハンコとボス戦のボタンは、本物の盤面では X-Masume 付きで POST する', async () => {
  const posts = [];
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const srv = await serveStatic(join(ROOT, 'web'), {
    'GET /api/state': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(fixture));
    },
    'GET /api/stream': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      res.write('event: hello\ndata: {}\n\n');
    },
    'POST /api/stamp': async (req, res) => {
      posts.push({ path: '/api/stamp', headers: req.headers, body: JSON.parse(await readBody(req)) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, ready: null }));
    },
    'POST /api/battle': async (req, res) => {
      posts.push({ path: '/api/battle', headers: req.headers, body: JSON.parse(await readBody(req)) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?select=H1`);
    await page.waitFor('window.__masume && window.__masume.ready');
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { message: 'ライブ表示' });
    assert.equal(await page.eval(`!!document.querySelector('#drawer button[data-stamp="H1"][data-as="player"]')`), true, 'ハンコのボタン');
    await page.eval(`document.querySelector('#drawer button[data-stamp="H1"]').click()`);
    await waitUntil(() => posts.length >= 1, { message: 'ハンコの POST' });
    assert.equal(posts[0].path, '/api/stamp');
    assert.equal(posts[0].headers['x-masume'], '1');
    assert.match(posts[0].headers['content-type'], /application\/json/);
    assert.deepEqual(posts[0].body, { node: 'H1', as: 'player' });

    // 判定の出力へのリンク（S1 の判定成功は seq 2）
    await page.eval(`window.__masume.select('node', 'S1')`);
    const link = await page.eval(`[...document.querySelectorAll('#drawer a')].map((a) => a.getAttribute('href'))`);
    const s1 = fixture.log.find((e) => e.node === 'S1' && e.type === 'check_passed');
    assert.ok(link.includes(`api/output/${s1.seq}`), `判定出力へのリンク: ${link}`);

    // G1 がそろった（ready）盤面ではボス戦のボタン
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      for (const c of v.characters) if (v.nodes.G1.members.includes(c.id)) { c.pos = c.path.indexOf('G1'); c.at = 'G1'; c.status = 'waiting'; }
      v.nodes.G1.state = 'ready';
      window.__masume.render(v);
      window.__masume.select('node', 'G1');
    })()`);
    assert.equal(await page.eval(`!!document.querySelector('#drawer button[data-battle="G1"]')`), true, 'ボス戦のボタン');
    await page.eval(`document.querySelector('#drawer button[data-battle="G1"]').click()`);
    await waitUntil(() => posts.length >= 2, { message: 'ボス戦の POST' });
    assert.equal(posts[1].path, '/api/battle');
    assert.equal(posts[1].headers['x-masume'], '1');
    assert.deepEqual(posts[1].body, { gate: 'G1' });
  } finally {
    await page.close();
    await srv.close();
  }
});
