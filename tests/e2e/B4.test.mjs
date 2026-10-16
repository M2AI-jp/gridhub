// B4「願いの入口をつくる」— 冒険の書が無いときのロビー（CONTRACTS §18）。伝令の窓口は偽物で判定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers2.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });

test('ロビーで願いを書くと、GM の様子が見え、冒険の書が生まれたら盤面になる', async () => {
  let created = false;
  let questDone = false;
  const posts = [];
  const streams = [];
  const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  const srv = await serveStatic(join(ROOT, 'web'), {
    'GET /api/state': (req, res) => (created ? json(res, 200, fixture) : json(res, 404, { ok: false, code: 'E_NO_GAME', error: '冒険の書が見つかりません' })),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); streams.push(res); },
    'GET /api/quest': (req, res) => json(res, 200, { ok: true, running: posts.length > 0 && !questDone, code: questDone ? 0 : null, log: posts.length ? `偽のGM: 地図を描いています…${questDone ? '\n冒険の書をひらきました' : ''}` : '' }),
    'POST /api/quest': async (req, res) => {
      posts.push({ headers: req.headers, body: JSON.parse(await readBody(req)) });
      json(res, 202, { ok: true });
      setTimeout(() => { created = true; questDone = true; for (const s of streams) s.write('event: change\ndata: {}\n\n'); }, 2500);
    },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(`(() => { const l = document.querySelector('#lobby'); return l && !l.hidden && getComputedStyle(l).display !== 'none'; })()`, { message: 'ロビーが出る' });
    const r = await page.eval(`(() => ({
      wish: !!document.querySelector('#lobby textarea#wish'),
      gm: [...document.querySelectorAll('#lobby select#gm option')].map((o) => o.value),
      model: !!document.querySelector('#lobby input#gm-model'),
      disabled: document.querySelector('#lobby button#start-quest').disabled,
    }))()`);
    assert.equal(r.wish, true);
    assert.deepEqual(r.gm, ['claude', 'codex']);
    assert.equal(r.model, true);
    assert.equal(r.disabled, true, '願いが空なら始められない');

    await page.eval(`(() => {
      const t = document.querySelector('#wish'); t.value = 'メモアプリのようなアプリを作りたい'; t.dispatchEvent(new Event('input', { bubbles: true }));
      const g = document.querySelector('#gm'); g.value = 'codex'; g.dispatchEvent(new Event('change', { bubbles: true }));
      const m = document.querySelector('#gm-model'); m.value = 'gpt-5'; m.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#start-quest').click();
    })()`);
    await waitUntil(() => posts.length === 1, { message: '願いの POST' });
    assert.equal(posts[0].headers['x-masume'], '1');
    assert.deepEqual(posts[0].body, { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex', model: 'gpt-5' });
    await page.waitFor(`(document.querySelector('#quest-progress')?.innerText || '').includes('偽のGM')`, { message: 'GM の様子が見える' });
    await page.waitFor(`document.querySelectorAll('.pawn[data-char]').length === ${fixture.characters.length}`, { timeout: 15000, message: '盤面になる' });
    await page.waitFor(`(() => { const l = document.querySelector('#lobby'); return !l || l.hidden || getComputedStyle(l).display === 'none'; })()`, { message: 'ロビーが消える' });
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    assert.deepEqual(exceptions, []);
  } finally {
    await page.close();
    await srv.close();
  }
});
