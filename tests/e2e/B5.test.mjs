// B5「出撃を指揮する」— 出撃の指揮、駒のふきだし、キャラクターシートの出撃の記録（CONTRACTS §18）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers2.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo2-state.json'), 'utf8'));
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });

test('出撃中の駒にはふきだし、出撃の指揮と止める', async () => {
  const engine = fixture.characters.find((c) => c.id === 'engine');
  assert.ok(engine.sortie, '見本では書記が出撃中');
  let running = false;
  const posts = [];
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const srv = await serveStatic(join(ROOT, 'web'), {
    'GET /api/state': (req, res) => json(res, 200, fixture),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running, code: running ? null : 2, log: running ? '軍師: 書記を出撃させた' : 'ハンコ待ち: H1' }),
    'POST /api/sortie': async (req, res) => { posts.push({ path: 'sortie', headers: req.headers, body: JSON.parse(await readBody(req)) }); running = true; json(res, 202, { ok: true }); },
    'POST /api/party/stop': async (req, res) => { posts.push({ path: 'stop', headers: req.headers, body: await readBody(req) }); running = false; json(res, 200, { ok: true, stopped: true }); },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.ready');
    const r = await page.eval(`(() => ({
      bubble: document.querySelector('.pawn[data-char="engine"] .sortie-bubble')?.textContent || '',
      others: document.querySelectorAll('.sortie-bubble').length,
      card: document.querySelector('.party-card[data-char="engine"]').innerText,
    }))()`);
    assert.match(r.bubble, /codex/);
    assert.equal(r.others, fixture.characters.filter((c) => c.sortie).length, '出撃中の駒にだけふきだし');
    assert.match(r.card, /出撃中/);

    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal')?.open === true`, { message: '出撃の指揮がひらく' });
    const working = fixture.characters.filter((c) => c.kind === 'agent' && c.status === 'working').map((c) => c.id);
    const boxes = await page.eval(`[...document.querySelectorAll('#sortie-modal input[name="sortie-only"]')].map((b) => b.value)`);
    assert.deepEqual([...boxes].sort(), [...working].sort(), '作業中のエージェントだけが選べる');
    await page.eval(`(() => {
      const a = document.querySelector('#sortie-agent'); a.value = 'codex'; a.dispatchEvent(new Event('change', { bubbles: true }));
      const m = document.querySelector('#sortie-model'); m.value = 'gpt-5'; m.dispatchEvent(new Event('input', { bubbles: true }));
      const p = document.querySelector('#sortie-parallel'); p.value = '2'; p.dispatchEvent(new Event('input', { bubbles: true }));
      const boxes = [...document.querySelectorAll('#sortie-modal input[name="sortie-only"]')];
      boxes.forEach((b, i) => { b.checked = i === 0; b.dispatchEvent(new Event('change', { bubbles: true })); });
      document.querySelector('#sortie-go').click();
    })()`);
    await waitUntil(() => posts.length === 1, { message: '出撃の POST' });
    assert.equal(posts[0].headers['x-masume'], '1');
    // 第7章 §34.2: codex のときはチェックの状態（ここでは既定の外れ）を allow_listen として必ず送る
    // 第11章 §50.12: 作戦も必ず送る（GET /api/party に tactic が無ければ balanced）
    assert.deepEqual(posts[0].body, { agent: 'codex', model: 'gpt-5', parallel: 2, only: [boxes[0]], allow_listen: false, tactic: 'balanced' });
    await page.waitFor(`document.querySelector('#party-status')?.dataset.running === 'true'`, { message: '出撃中の表示' });
    assert.match(await page.eval(`document.querySelector('#party-status').innerText`), /出撃中/);
    await page.eval(`document.querySelector('#party-stop').click()`);
    await waitUntil(() => posts.length === 2, { message: '止める POST' });
    assert.equal(posts[1].path, 'stop');
    assert.equal(posts[1].headers['x-masume'], '1');
    await page.waitFor(`document.querySelector('#party-status')?.dataset.running === 'false'`, { message: '止まった表示' });

    // キャラクターシートに出撃の記録と出力へのリンク
    await page.eval(`window.__masume.select('char', 'engine')`);
    const sheet = await page.eval(`(() => ({ rows: document.querySelectorAll('#drawer .sortie-row').length, links: [...document.querySelectorAll('#drawer .sortie-row a')].map((a) => a.getAttribute('href')) }))()`);
    const returned = fixture.log.filter((e) => e.type === 'returned' && e.character === 'engine');
    const sorties = fixture.log.filter((e) => e.type === 'sortie' && e.character === 'engine');
    assert.equal(sheet.rows, sorties.length, '出撃1回につき1行');
    for (const e of returned) assert.ok(sheet.links.includes(`api/output/${e.seq}`), `帰還 seq ${e.seq} の出力へのリンク`);
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    assert.deepEqual(exceptions, []);
  } finally {
    await page.close();
    await srv.close();
  }
});
