// B8「盤面から箱のソケットを開ける」— CONTRACTS §34（第7章）。伝令の窓口は、このファイルの中の小さな偽物で判定する。
// 入口の #gm-allow-listen・出撃の窓の #sortie-allow-listen と、窓を開くたびに GET /api/party の既定値（allow_listen・agent・parallel）を使うこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers3.mjs';

const WEB = join(ROOT, 'web');
const demo = () => JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]'));
const EXPLAIN = ['127.0.0.1', 'ローカル', 'インターネット', 'codex にだけ効'];

/**
 * 本物の盤面（web/）に、伝令の窓口 /api/* の偽物を足す。
 *  live.view … /api/state が返すビュー（null なら E_NO_GAME）  live.party … GET /api/party が返す本文（関数なら毎回呼ぶ）
 *  live.posts … 受けた POST（{path, body}）
 */
async function liveServer(view, party) {
  const live = { view, party, posts: [] };
  const routes = {
    'GET /api/state': (req, res) => (live.view ? json(res, 200, live.view) : json(res, 404, { ok: false, code: 'E_NO_GAME', error: '冒険の書が見つかりません' })),
    'GET /api/stream': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      res.write('event: hello\ndata: {}\n\n');
    },
    'GET /api/party': (req, res) => {
      const p = typeof live.party === 'function' ? live.party(req, res) : live.party;
      if (p === undefined) return; // 関数の中で答えた
      json(res, 200, p);
    },
    'GET /api/quest': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '' }),
    'POST /api/quest': async (req, res) => {
      live.posts.push({ path: '/api/quest', body: JSON.parse(await readBody(req)) });
      json(res, 202, { ok: true });
    },
    'POST /api/sortie': async (req, res) => {
      live.posts.push({ path: '/api/sortie', body: JSON.parse(await readBody(req)) });
      json(res, 202, { ok: true });
    },
  };
  const srv = await serveStatic(WEB, routes);
  return Object.assign(live, { url: srv.url, close: srv.close });
}

const IDLE = { ok: true, running: false, code: null, log: '' };
const boardReady = (page) => page.waitFor('window.__masume && window.__masume.ready && !window.__masume.lobby && document.querySelectorAll(".pawn[data-char]").length > 0', { timeout: 15000, message: '盤面が出る' });
const lobbyReady = (page) => page.waitFor('window.__masume && window.__masume.lobby === true && !document.querySelector("#lobby").hidden', { timeout: 15000, message: 'ロビーが出る' });

async function wish(page, text) {
  await page.eval(`(() => { const w = document.querySelector('#wish'); w.value = ${JSON.stringify(text)}; w.dispatchEvent(new Event('input', { bubbles: true })); })()`);
}

test('§34.1 入口: #gm-allow-listen と説明があり、チェックしたときだけ allow_listen: true を送る', { timeout: 120000 }, async () => {
  const live = await liveServer(null, IDLE);
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${live.url}/`);
    await lobbyReady(page);
    const box = JSON.parse(await page.eval(`JSON.stringify((() => { const c = document.querySelector('#lobby-form #gm-allow-listen'); return c && { type: c.type, checked: c.checked, disabled: c.disabled }; })())`));
    assert.deepEqual(box, { type: 'checkbox', checked: false, disabled: false }, '入口のフォームに、外れたチェックボックス #gm-allow-listen');
    const text = await page.eval(`document.querySelector('#lobby-form').innerText`);
    for (const w of EXPLAIN) assert.ok(text.includes(w), `入口の説明に「${w}」`);

    // 外れたまま → allow_listen を入れない
    await wish(page, 'メモアプリのようなアプリを作りたい');
    await page.eval(`document.querySelector('#gm').value = 'codex'`);
    await page.eval(`document.querySelector('#start-quest').click()`);
    await waitUntil(() => live.posts.length >= 1, { message: '願いの POST' });
    assert.equal(live.posts[0].path, '/api/quest');
    assert.equal(live.posts[0].body.gm, 'codex');
    assert.ok(!('allow_listen' in live.posts[0].body), `外れていれば allow_listen を入れない: ${JSON.stringify(live.posts[0].body)}`);

    // チェック → allow_listen: true（GM が claude でも押せる。party.json に持ち越すため）
    await page.goto(`${live.url}/`);
    await lobbyReady(page);
    await wish(page, '家計簿のようなアプリを作りたい');
    await page.eval(`document.querySelector('#gm').value = 'claude'; document.querySelector('#gm').dispatchEvent(new Event('change', { bubbles: true }))`);
    assert.equal(await page.eval(`document.querySelector('#gm-allow-listen').disabled`), false, 'GM が claude でも押せる');
    await page.eval(`document.querySelector('#gm-allow-listen').click()`);
    assert.equal(await page.eval(`document.querySelector('#gm-allow-listen').checked`), true);
    await page.eval(`document.querySelector('#start-quest').click()`);
    await waitUntil(() => live.posts.length >= 2, { message: '2回目の願いの POST' });
    assert.equal(live.posts[1].body.allow_listen, true, `チェックしたら allow_listen: true: ${JSON.stringify(live.posts[1].body)}`);
    assert.equal(live.posts[1].body.gm, 'claude');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

test('§34.2 出撃の窓: 開くたびに GET /api/party の既定値（allow_listen・agent・parallel）を使い、チェックの状態を必ず送る', { timeout: 120000 }, async () => {
  const live = await liveServer(demo(), { ...IDLE, allow_listen: true, agent: 'codex', parallel: 2 });
  const page = await openBrowser({ width: 1440, height: 900 });
  const open = async () => {
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true`, { message: '出撃の窓がひらく' });
  };
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await open();
    await page.waitFor(`document.querySelector('#sortie-allow-listen')?.checked === true && document.querySelector('#sortie-agent').value === 'codex' && document.querySelector('#sortie-parallel').value === '2'`,
      { timeout: 5000, message: 'party.json の allow_listen・agent・parallel が既定になる' });
    assert.equal(await page.eval(`document.querySelector('#sortie-allow-listen').disabled`), false, 'codex なら押せる');
    const text = await page.eval(`document.querySelector('#sortie-modal').innerText`);
    for (const w of EXPLAIN) assert.ok(text.includes(w), `出撃の窓の説明に「${w}」`);

    await page.eval(`document.querySelector('#sortie-go').click()`);
    await waitUntil(() => live.posts.length >= 1, { message: '出撃の POST' });
    assert.equal(live.posts[0].path, '/api/sortie');
    assert.equal(live.posts[0].body.agent, 'codex');
    assert.equal(live.posts[0].body.parallel, 2);
    assert.equal(live.posts[0].body.allow_listen, true, `チェックが入っていれば true: ${JSON.stringify(live.posts[0].body)}`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === false`, { message: '出撃したら窓が閉じる' });

    // もう一度開く → また既定はチェック。外して出撃 → false を送る
    await open();
    await page.waitFor(`document.querySelector('#sortie-allow-listen').checked === true`, { timeout: 5000, message: '開き直しても既定はチェック' });
    await page.eval(`document.querySelector('#sortie-allow-listen').click()`);
    await page.eval(`document.querySelector('#sortie-go').click()`);
    await waitUntil(() => live.posts.length >= 2, { message: '2回目の出撃の POST' });
    assert.equal(live.posts[1].body.allow_listen, false, `外したら false を送る: ${JSON.stringify(live.posts[1].body)}`);

    // party.json が開けていない・エージェントを書いていない → 外れていて、エージェントと同時の数はそのまま
    live.party = { ...IDLE, allow_listen: false, agent: null, parallel: null };
    await page.waitFor(`document.querySelector('#sortie-modal').open === false`);
    await page.eval(`document.querySelector('#sortie-agent').value = 'codex'; document.querySelector('#sortie-parallel').value = '5';`);
    await open();
    await page.waitFor(`document.querySelector('#sortie-allow-listen').checked === false`, { timeout: 5000, message: '既定は外れる' });
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(await page.eval(`document.querySelector('#sortie-agent').value`), 'codex', 'agent が null なら今のまま');
    assert.equal(await page.eval(`document.querySelector('#sortie-parallel').value`), '5', 'parallel が null なら今のまま');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

test('§34.3 エージェントが codex でないあいだは押せず「codex にだけ効きます」。本文に allow_listen を入れない', { timeout: 120000 }, async () => {
  const live = await liveServer(demo(), { ...IDLE, allow_listen: true, agent: 'claude', parallel: 3 });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true && document.querySelector('#sortie-agent').value === 'claude'`, { timeout: 5000, message: '窓がひらき、claude が選ばれる' });
    await page.waitFor(`document.querySelector('#sortie-allow-listen')?.disabled === true`, { timeout: 5000, message: 'claude のあいだは押せない' });
    assert.ok((await page.eval(`document.querySelector('#sortie-modal').innerText`)).includes('codex にだけ効きます'));
    await page.eval(`document.querySelector('#sortie-go').click()`);
    await waitUntil(() => live.posts.length >= 1, { message: '出撃の POST' });
    assert.equal(live.posts[0].body.agent, 'claude');
    assert.ok(!('allow_listen' in live.posts[0].body), `claude なら allow_listen を入れない: ${JSON.stringify(live.posts[0].body)}`);

    // codex に切り替えると押せる
    await page.waitFor(`document.querySelector('#sortie-modal').open === false`);
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true`);
    await page.eval(`(() => { const s = document.querySelector('#sortie-agent'); s.value = 'codex'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await page.waitFor(`document.querySelector('#sortie-allow-listen').disabled === false`, { timeout: 5000, message: 'codex に切り替えると押せる' });
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

test('§34.2 GET /api/party が失敗しても窓はひらき、チェックは外れている', { timeout: 120000 }, async () => {
  let fail = false;
  const live = await liveServer(demo(), (req, res) => {
    if (fail) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('boom');
      return undefined;
    }
    return { ...IDLE, allow_listen: true, agent: 'codex', parallel: 3 };
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    fail = true;
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true`, { message: '窓はひらく' });
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(await page.eval(`document.querySelector('#sortie-allow-listen').checked`), false, '読めなければ外す');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});
