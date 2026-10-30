// B22「盤面のことば」— 盤面（CONTRACTS §75）。
// 1つのボタンで、冒険のことば（モンスター・ダンジョン・町）と開発のことば（テスト・タスク・コミット）を切り替える。
// 選んだほうは localStorage と ?words= に残る。はじめの画面にも同じボタン。見本の盤面（?fixture=）だけで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__masume && window.__masume.ready';
const base = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const camp = Object.keys(base.nodes).find((id) => base.nodes[id].type === 'camp');
const task = Object.keys(base.nodes).find((id) => base.nodes[id].type === 'task' && base.nodes[id].check?.kind === 'cmd');
const TOGGLE = `document.querySelector('#words-toggle')`;
const MODE = `document.documentElement.dataset.words`;
const text = (sel) => `document.querySelector(${JSON.stringify(sel)}).innerText`;

async function withBoard(fn, { query = '' } = {}) {
  const srv = await serveStatic(WEB);
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?fixture=demo${query}`);
    await page.waitFor(READY, { timeout: 20000 });
    await fn(page, srv.url);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§75.1 既定は冒険のことば: #words-toggle は「冒険のことば」、<html data-words="game">。あそびかた・町の説明・なかまの欄に開発のことばが混ざらない', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    assert.equal(await page.eval(MODE), 'game');
    const btn = await page.eval(`({ text: ${TOGGLE}.innerText, pressed: ${TOGGLE}.getAttribute('aria-pressed'), title: ${TOGGLE}.title })`);
    assert.match(btn.text, /冒険のことば/);
    assert.equal(btn.pressed, 'false');
    assert.match(btn.title, /開発のことば/, '押すと何になるかが title に');
    assert.match(await page.eval(text('nav.tabs')), /あそびかた/);
    await page.eval(`window.__masume.setView('rules')`);
    const rules = await page.eval(text('#rules'));
    assert.match(rules, /あそびかた/);
    assert.doesNotMatch(rules, /使い方|累積判定（check）|git checkout/, '見えている字は冒険のことばだけ');
    await page.eval(`window.__masume.setView('board'); window.__masume.select('node', ${JSON.stringify(camp)})`);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === ${JSON.stringify(camp)}`);
    const drawer = await page.eval(text('#drawer'));
    assert.match(drawer, /宿屋/);
    assert.doesNotMatch(drawer, /git commit/, '町の説明に commit を並べない（commit の印そのものは看板にだけ）');
    assert.match(await page.eval(text('#party')), /代目/);
    assert.match(await page.eval(text('#bestiary')), /モンスター図鑑/);
    assert.match(await page.eval(text('.legend')), /モンスター = テスト1件/);
  });
});

test('§75.2 ボタンを押すと開発のことばに切り替わり、盤面・あそびかた（使い方）・詳細・右の欄が描き直される。localStorage と ?words=dev に残る', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    await page.eval(`window.__masume.select('node', ${JSON.stringify(camp)})`);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === ${JSON.stringify(camp)}`);
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`, { message: 'data-words が dev' });
    const btn = await page.eval(`({ text: ${TOGGLE}.innerText, pressed: ${TOGGLE}.getAttribute('aria-pressed') })`);
    assert.match(btn.text, /開発のことば/);
    assert.equal(btn.pressed, 'true');
    assert.equal(await page.eval(`localStorage.getItem('gridhub.words')`), 'dev');
    assert.equal(await page.eval(`new URL(location.href).searchParams.get('words')`), 'dev');
    assert.match(await page.eval(text('nav.tabs')), /使い方/);
    assert.match(await page.eval(text('#drawer')), /git commit/, '町の説明が開発のことばに');
    assert.doesNotMatch(await page.eval(text('#drawer')), /宿屋に泊まって/);
    assert.match(await page.eval(text('#party')), /起動 \d+回目/);
    assert.match(await page.eval(text('#bestiary')), /テスト一覧/);
    assert.match(await page.eval(text('.legend')), /マス = テスト1件/);
    assert.match(await page.eval(text('#export-notebook')), /SVG/);
    // 盤面（SVG）の字も描き直される: 町の「泊まった」→「コミット」、ふりだしの手引き
    const svg = await page.eval(`document.querySelector('#board').textContent`);
    assert.match(svg, /マス1つ ＝ テスト1件/);
    assert.doesNotMatch(svg, /泊まった|モンスター1体/);
    await page.eval(`window.__masume.setView('rules')`);
    const rules = await page.eval(text('#rules'));
    assert.match(rules, /使い方/);
    assert.doesNotMatch(rules, /あそびかた|全滅/);
    assert.doesNotMatch(rules, /じゅもん/);
    // もう一度押すと冒険のことばに戻り、URL から ?words= が消える
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'game'`);
    assert.equal(await page.eval(`localStorage.getItem('gridhub.words')`), 'game');
    assert.equal(await page.eval(`new URL(location.href).searchParams.get('words')`), null);
    assert.match(await page.eval(text('#rules')), /あそびかた/);
  });
});

test('§75.3 選んだことばは localStorage から次に開いたときも効く。URL の ?words= は localStorage より優先', { timeout: 120000 }, async () => {
  await withBoard(async (page, url) => {
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    await page.goto(`${url}/?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(MODE), 'dev', 'localStorage から dev');
    assert.match(await page.eval(text('nav.tabs')), /使い方/);
    await page.goto(`${url}/?fixture=demo&words=game`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(MODE), 'game', '?words=game が勝つ');
    assert.match(await page.eval(text('nav.tabs')), /あそびかた/);
    await page.goto(`${url}/?fixture=demo&words=nonsense`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(MODE), 'dev', '知らない値は無視して localStorage');
  });
});

test('§75.4 アプリの中（?home=）の言い換えは、いまのことばのボタンの名前になる（開発のことばなら「判定する」「テストを走らせる」）', { timeout: 120000 }, async () => {
  const detail = 'ai/hello.txt を書いて gridhub check apprentice --as apprentice で宣言します。歩くなら gridhub step apprentice。';
  const render = `(() => { const v = structuredClone(window.__masume.view); v.nodes[${JSON.stringify(task)}].detail = ${JSON.stringify(detail)}; window.__masume.render(v); window.__masume.select('node', ${JSON.stringify(task)}); return true; })()`;
  await withBoard(async (page) => {
    await page.eval(render);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === ${JSON.stringify(task)}`);
    const game = await page.eval(text('#drawer'));
    assert.match(game, /「宣言判定」/);
    assert.match(game, /「歩く」/);
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    const dev = await page.eval(text('#drawer'));
    assert.match(dev, /「判定する」/);
    assert.match(dev, /「テストを走らせる」/);
    assert.doesNotMatch(dev, /gridhub (check|step)|「宣言判定」/);
  }, { query: `&home=${encodeURIComponent('http://127.0.0.1:43210/')}` });
});

test('§75.5 はじめの画面にも同じボタン。押すと説明が切り替わり、盤面を開いても同じことば', { timeout: 120000 }, async () => {
  const srv = await serveStatic(WEB, {
    'GET /api/app': (req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, node: '22.0.0', version: '0.3.0', recent: [{ dir: '/Users/you/memo', name: 'memo', title: 'メモ', has_game: true, missing: false }], claude: { found: false } }));
    },
  });
  const page = await openBrowser({ width: 1100, height: 800 });
  try {
    await page.goto(`${srv.url}/start.html`);
    await page.waitFor('window.__gridhubStart && window.__gridhubStart.ready', { timeout: 20000 });
    assert.equal(await page.eval(MODE), 'game');
    assert.match(await page.eval(text('#start')), /冒険の書あり/);
    assert.match(await page.eval(text('#env-claude')), /チュートリアルは claude なしで遊べます/);
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    assert.match(await page.eval(text('#start')), /セーブデータあり/);
    assert.doesNotMatch(await page.eval(text('#start')), /冒険の書あり/);
    assert.equal(await page.eval(`localStorage.getItem('gridhub.words')`), 'dev');
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(MODE), 'dev', '盤面でも同じことば');
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
});

// ---- §76.3 本物の盤面と窓口の同期（GET/POST /api/words）。窓口は偽物で配る ----
async function withLive(fn, { words = null, query = '' } = {}) {
  const posts = [];
  let setting = words; // 偽の冒険の設定（null なら未設定）
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, base),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
    'GET /api/words': (req, res) => json(res, 200, { ok: true, words: setting ?? 'game', set: setting !== null, source: setting ? 'file' : 'default' }),
    'POST /api/words': async (req, res) => {
      const body = JSON.parse(await readBody(req));
      posts.push({ body, masume: req.headers['x-masume'] });
      setting = body.words;
      json(res, 200, { ok: true, words: body.words });
    },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/${query}`);
    await page.waitFor(READY, { timeout: 20000 });
    await fn(page, posts, srv.url);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§76.3 本物の盤面は、URL にもブラウザにも選択が無ければ、この冒険の設定（GET /api/words）を既定にする', { timeout: 120000 }, async () => {
  await withLive(async (page) => {
    await page.waitFor(`${MODE} === 'dev'`, { timeout: 10000, message: '冒険の設定（dev）が既定になる' });
    assert.match(await page.eval(text('nav.tabs')), /使い方/);
    assert.match(await page.eval(`${TOGGLE}.innerText`), /開発のことば/);
  }, { words: 'dev' });
  // 設定が無ければ game のまま。?words= があれば URL が勝つ
  await withLive(async (page) => {
    assert.equal(await page.eval(MODE), 'game');
  });
  await withLive(async (page) => {
    assert.equal(await page.eval(MODE), 'game', '?words=game が冒険の設定（dev）より優先');
  }, { words: 'dev', query: '?words=game' });
});

test('§76.3 本物の盤面で切り替えると、X-Masume 付きで POST /api/words に書く（届かなくても切り替えは効く）', { timeout: 120000 }, async () => {
  await withLive(async (page, posts) => {
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    await waitUntil(() => posts.length >= 1, { timeout: 5000, message: 'POST /api/words' });
    assert.deepEqual(posts.map((p) => p.body), [{ words: 'dev' }], `POST /api/words の本文: ${JSON.stringify(posts)}`);
    assert.equal(posts[0].masume, '1', 'X-Masume: 1');
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'game'`);
    await waitUntil(() => posts.length >= 2, { timeout: 5000, message: '2回目の POST /api/words' });
    assert.deepEqual(posts.map((p) => p.body), [{ words: 'dev' }, { words: 'game' }]);
  });
});

// ---- §76.7 Mac のアプリの中（window.webkit の偽物。B19 と同じ）----
import { openBrowserWith } from '../helpers4.mjs';
const APP_SHIM = `window.__posted = []; window.webkit = { messageHandlers: { gridhub: { postMessage(m) { window.__posted.push(JSON.parse(JSON.stringify(m))); } } } };`;

async function withApp(fn, { preload = APP_SHIM, path = '/?fixture=demo' } = {}) {
  const srv = await serveStatic(WEB, {
    'GET /api/app': (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, node: '22.0.0', version: '0.3.0', recent: [], claude: { found: true }, in_app: true })); },
  });
  const page = await openBrowserWith({ width: 1440, height: 900, preload });
  try {
    await page.goto(`${srv.url}${path}`);
    await page.waitFor(path.startsWith('/start') ? 'window.__gridhubStart && window.__gridhubStart.ready' : READY, { timeout: 20000 });
    await fn(page);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§76.7 アプリが覚えていることば（window.__gridhubWords）は、ブラウザの選択より優先し、URL の ?words= には負ける。開いただけではアプリに何も送らない', { timeout: 120000 }, async () => {
  await withApp(async (page) => {
    assert.equal(await page.eval(MODE), 'dev', 'window.__gridhubWords = dev が効く');
    assert.match(await page.eval(text('nav.tabs')), /使い方/);
    assert.deepEqual(await page.eval('window.__posted'), [], '開いただけでは postMessage しない');
  }, { preload: `${APP_SHIM} window.__gridhubWords = 'dev'; try { localStorage.setItem('gridhub.words', 'game'); } catch (e) {}` });
  await withApp(async (page) => {
    assert.equal(await page.eval(MODE), 'game', '?words=game が勝つ');
  }, { preload: `${APP_SHIM} window.__gridhubWords = 'dev';`, path: '/?fixture=demo&words=game' });
  await withApp(async (page) => {
    assert.equal(await page.eval(MODE), 'dev', 'はじめの画面でも効く');
    assert.match(await page.eval(text('#start')), /セーブデータ/);
  }, { preload: `${APP_SHIM} window.__gridhubWords = 'dev';`, path: '/start.html' });
});

test('§76.7 アプリの中で切り替えると postMessage({type: "words", words}) でアプリに知らせる。外（窓口が無い）では何も起きない', { timeout: 120000 }, async () => {
  await withApp(async (page) => {
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    assert.deepEqual(await page.eval('window.__posted'), [{ type: 'words', words: 'dev' }]);
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'game'`);
    assert.deepEqual(await page.eval('window.__posted'), [{ type: 'words', words: 'dev' }, { type: 'words', words: 'game' }]);
  });
  await withApp(async (page) => {
    await page.eval(`${TOGGLE}.click()`);
    await page.waitFor(`${MODE} === 'dev'`);
    assert.equal(await page.eval('typeof window.webkit'), 'undefined');
  }, { preload: '' });
});
