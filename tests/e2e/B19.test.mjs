// B19「はじめの画面」— 盤面（第16章）。CONTRACTS §70。
// /api/app と /api/app/open・/api/app/tutorial は偽の窓口で配る（伝令に頼らない）。アプリの中は window.webkit の偽物で真似る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, openBrowserWith, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__gridhubStart && window.__gridhubStart.ready === true';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const APP_SHIM = `window.__posted = []; window.webkit = { messageHandlers: { gridhub: { postMessage(m) { window.__posted.push(JSON.parse(JSON.stringify(m))); } } } };`;

const info = (over = {}) => ({
  ok: true, version: '0.3.0', node: '22.22.0', in_app: false,
  claude: { found: true, path: '/opt/homebrew/bin/claude' },
  home: '/Users/you/Library/Application Support/GridHub', play: '/Users/you/GridHub',
  recent: [
    { dir: '/Users/you/GridHub/チュートリアル', name: 'チュートリアル', has_game: true, title: 'はじめての GridHub', missing: false },
    { dir: '/Users/you/memo', name: 'memo', has_game: false, title: null, missing: false },
    { dir: '/Users/you/old', name: 'old', has_game: true, title: '古い冒険', missing: true },
  ],
  current: null,
  ...over,
});

async function withStart(fn, { app = info(), open, tutorial, preload = '' } = {}) {
  const posts = [];
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const srv = await serveStatic(WEB, {
    'GET /': (req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(readFileSync(join(WEB, 'start.html')));
    },
    'GET /api/app': (req, res) => json(res, 200, app),
    'POST /api/app/open': async (req, res) => {
      const body = JSON.parse(await readBody(req));
      posts.push({ path: '/api/app/open', body, masume: req.headers['x-masume'] });
      const [status, reply] = open ? open(body) : [200, { ok: true, dir: body.dir, url: '/start.html?opened=1', has_game: false }];
      json(res, status, reply);
    },
    'POST /api/app/tutorial': async (req, res) => {
      const body = await readBody(req);
      posts.push({ path: '/api/app/tutorial', body, masume: req.headers['x-masume'] });
      const [status, reply] = tutorial ? tutorial() : [200, { ok: true, dir: '/Users/you/GridHub/チュートリアル 2', url: '/start.html?tutorial=1', has_game: true }];
      json(res, status, reply);
    },
    'POST /api/app/forget': async (req, res) => {
      const body = JSON.parse(await readBody(req));
      posts.push({ path: '/api/app/forget', body, masume: req.headers['x-masume'] });
      json(res, 200, { ok: true, recent: app.recent.filter((r) => r.dir !== body.dir) });
    },
  });
  const page = preload ? await openBrowserWith({ width: 1280, height: 820, preload }) : await openBrowser({ width: 1280, height: 820 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 15000, message: 'はじめの画面' });
    await fn(page, posts, srv);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§70.1 はじめの画面: 方眼ノートの紙に、フォルダを選ぶ・チュートリアルで遊ぶ・最近のフォルダ・Node.js の版', { timeout: 120000 }, async () => {
  await withStart(async (page) => {
    const got = await page.eval(`(() => {
      const t = (s) => document.querySelector(s)?.innerText ?? null;
      const paper = getComputedStyle(document.querySelector('#start'));
      return {
        choose: t('#choose-folder'), tutorial: t('#tutorial'), node: t('#env-node'),
        recent: [...document.querySelectorAll('#recent li[data-dir]')].map((li) => ({ dir: li.dataset.dir, missing: li.dataset.missing, text: li.innerText, open: !!li.querySelector('button.open-recent'), forget: !!li.querySelector('button.forget') })),
        bg: paper.backgroundColor, image: paper.backgroundImage, css: [...document.styleSheets].some((s) => (s.href || '').endsWith('board/board.css')),
        title: document.title,
      };
    })()`);
    assert.match(got.choose, /フォルダを選ぶ/);
    assert.match(got.tutorial, /チュートリアルで遊ぶ/);
    assert.match(got.node, /22\.22\.0/);
    assert.equal(got.recent.length, 3);
    assert.deepEqual(got.recent.map((r) => r.dir), info().recent.map((r) => r.dir));
    assert.ok(got.recent.every((r) => r.open && r.forget), '開く・外すボタン');
    assert.match(got.recent[0].text, /はじめての GridHub/);
    assert.equal(got.recent[2].missing, 'true', '消えたフォルダ');
    assert.ok(got.css, 'board/board.css（方眼ノートの紙）を使う');
    assert.equal(got.bg, 'rgb(253, 250, 240)', '紙の色（--paper）');
    assert.match(got.image, /linear-gradient/, '方眼の罫');
    assert.match(got.title, /GridHub/);
  });
});

test('§70.2 アプリの中では「フォルダを選ぶ」で postMessage({type: "chooseFolder"})、folderChosen で開いて移る', { timeout: 120000 }, async () => {
  await withStart(async (page, posts) => {
    await page.eval(`document.querySelector('#choose-folder').click()`);
    await page.waitFor(`window.__posted.length === 1`, { message: 'postMessage' });
    assert.deepEqual(await page.eval('window.__posted'), [{ type: 'chooseFolder' }]);
    assert.equal(await page.eval(`!!document.querySelector('#folder-form') && !document.querySelector('#folder-form').hidden`), false, 'アプリの中ではパスの欄を出さない');
    await page.eval(`window.gridhubApp.folderChosen('/Users/you/新しい冒険')`);
    await waitUntil(() => posts.length === 1, { message: 'POST /api/app/open' });
    assert.deepEqual(posts[0], { path: '/api/app/open', body: { dir: '/Users/you/新しい冒険' }, masume: '1' });
    await page.waitFor(`location.search.includes('opened=1')`, { message: '返ってきた url に移る' });
  }, { preload: APP_SHIM, app: info({ in_app: true }) });
});

test('§70.2・§70.3 ブラウザでは #folder-form にパスを書いて開く。できなければ #start-error。チュートリアルは POST /api/app/tutorial。最近のフォルダから開く・外す', { timeout: 120000 }, async () => {
  await withStart(async (page, posts) => {
    await page.eval(`document.querySelector('#choose-folder').click()`);
    await page.waitFor(`!document.querySelector('#folder-form').hidden`, { message: '#folder-form' });
    await page.eval(`(() => { const i = document.querySelector('#folder-path'); i.value = '/nai/folder'; document.querySelector('#folder-form').requestSubmit(); })()`);
    await waitUntil(() => posts.length === 1, { message: 'POST /api/app/open' });
    assert.deepEqual(posts[0].body, { dir: '/nai/folder' });
    await page.waitFor(`/フォルダがありません/.test(document.querySelector('#start-error').innerText)`, { message: '#start-error に理由' });
    await page.eval(`document.querySelector('#recent li[data-dir="/Users/you/memo"] button.forget').click()`);
    await waitUntil(() => posts.length === 2, { message: 'POST /api/app/forget' });
    assert.deepEqual(posts[1], { path: '/api/app/forget', body: { dir: '/Users/you/memo' }, masume: '1' });
    await page.waitFor(`!document.querySelector('#recent li[data-dir="/Users/you/memo"]')`, { message: '外したフォルダが消える' });
    await page.eval(`document.querySelector('#tutorial').click()`);
    await waitUntil(() => posts.length === 3, { message: 'POST /api/app/tutorial' });
    assert.equal(posts[2].path, '/api/app/tutorial');
    assert.equal(posts[2].masume, '1');
    await page.waitFor(`location.search.includes('tutorial=1')`, { message: 'チュートリアルの盤面に移る' });
  }, { open: () => [404, { ok: false, code: 'E_NO_DIR', error: 'フォルダがありません: /nai/folder' }] });
  await withStart(async (page, posts) => {
    await page.eval(`document.querySelector('#recent li[data-dir="/Users/you/memo"] button.open-recent').click()`);
    await waitUntil(() => posts.length === 1, { message: '最近のフォルダから開く' });
    assert.deepEqual(posts[0].body, { dir: '/Users/you/memo' });
    await page.waitFor(`location.search.includes('opened=1')`);
  });
});

test('§70.4 claude が無ければ、入れ方と「チュートリアルは claude なしで遊べます」', { timeout: 120000 }, async () => {
  await withStart(async (page) => {
    const env = await page.eval(`(() => { const e = document.querySelector('#env-claude'); return { found: e.dataset.found, text: e.innerText }; })()`);
    assert.equal(env.found, 'false');
    assert.match(env.text, /claude（Claude Code）が見つかりません/);
    assert.match(env.text, /npm install -g @anthropic-ai\/claude-code/);
    assert.match(env.text, /チュートリアルは claude なしで遊べます/);
  }, { app: info({ claude: { found: false, path: null } }) });
  await withStart(async (page) => {
    assert.equal(await page.eval(`document.querySelector('#env-claude').dataset.found`), 'true');
  });
});

test('§70.5 盤面の ?home= が手元（127.0.0.1・localhost）のときだけ「はじめの画面」のリンク', { timeout: 120000 }, async () => {
  const view = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(view)); },
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
  });
  const page = await openBrowser({ width: 1280, height: 820 });
  try {
    await page.goto(`${srv.url}/?home=${encodeURIComponent('http://127.0.0.1:43210/')}`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 20000 });
    const link = await page.eval(`(() => { const a = document.querySelector('a#home-link'); return a && !a.hidden ? { href: a.href, text: a.innerText } : null; })()`);
    assert.ok(link, 'a#home-link');
    assert.equal(link.href, 'http://127.0.0.1:43210/');
    assert.match(link.text, /はじめの画面/);
    for (const bad of ['https://evil.example/', 'javascript:alert(1)', 'http://127.0.0.1.evil.example/']) {
      await page.goto(`${srv.url}/?home=${encodeURIComponent(bad)}`);
      await page.waitFor('window.__masume && window.__masume.ready', { timeout: 20000 });
      assert.equal(await page.eval(`(() => { const a = document.querySelector('a#home-link'); return !!a && !a.hidden; })()`), false, `出さない: ${bad}`);
    }
  } finally {
    await page.close();
    await srv.close();
  }
});
