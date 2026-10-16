// B7「表示を守る」— CONTRACTS §29（盤面: 表示の守り）。伝令の窓口は、このファイルの中の小さな偽物で判定する。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers3.mjs';

const WEB = join(ROOT, 'web');
const demo = () => JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const json = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]'));
/** タイトルと head.seq を変えたビュー（描き直されたかを見分ける目印） */
const viewOf = (title, seq) => {
  const v = demo();
  v.quest.title = title;
  v.head.seq = seq;
  return v;
};
const titleOf = (page) => page.eval(`document.querySelector('.quest-title')?.textContent ?? null`);
/** 冒険の書が読めないときに伝令が返すビュー（先頭の行から壊れている） */
const cursedView = () => ({
  masume: 1, quest: null, map_version: null, characters: [], nodes: {}, log: [], head: null,
  integrity: { ok: false, errors: [{ seq: 0, code: 'E_PARSE', message: 'イベント行を読めません' }] }, finished: false,
});
const CURSED_TEXT = '冒険の書が呪われています';

/**
 * 本物の盤面（web/）に、伝令の窓口 /api/* の偽物を足す。
 *  live.view … /api/state が返すビュー      live.change() … つながっている SSE に change を送る
 *  live.streamCalls / live.stateCalls … 受けた回数    handlers.state / handlers.stream … 差し替え
 */
async function liveServer(view, handlers = {}) {
  const live = { view, clients: new Set(), streamCalls: 0, stateCalls: 0, posts: [], change: () => { for (const c of live.clients) c.write('event: change\ndata: {}\n\n'); } };
  const routes = {
    'GET /api/state': (req, res) => {
      live.stateCalls++;
      if (handlers.state) return handlers.state(req, res, live);
      json(res, 200, live.view);
    },
    'GET /api/stream': (req, res) => {
      live.streamCalls++;
      if (handlers.stream) return handlers.stream(req, res, live);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      res.write('retry: 500\nevent: hello\ndata: {}\n\n');
      live.clients.add(res);
      res.on('close', () => live.clients.delete(res));
    },
    'GET /api/party': (req, res) => json(res, 200, handlers.party ?? { ok: true, running: false, code: null, log: '' }),
    'GET /api/quest': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '' }),
    ...handlers.routes,
  };
  const srv = await serveStatic(WEB, routes);
  return Object.assign(live, { url: srv.url, close: srv.close });
}

/** 盤面が出るまで待つ（ロビーではなく） */
const boardReady = (page) => page.waitFor('window.__masume && window.__masume.ready && !window.__masume.lobby && document.querySelectorAll(".pawn[data-char]").length > 0', { timeout: 15000, message: '盤面が出る' });

// ---------- 29.1 fixture / script / 失敗の表示 ----------

test('29.1 fixture・script は /^[A-Za-z0-9_-]+$/ のときだけ使う。URL の文字列は実行されない', async () => {
  const srv = await serveStatic(WEB);
  const page = await openBrowser();
  try {
    const payloads = [
      `<img id=pwn src=x onerror="window.__pwn=1">`,
      `x"><svg onload="window.__pwn=1">`,
      `demo' onerror='window.__pwn=1`,
      `../../package`,
      `demo.json`,
    ];
    const inert = async (label) => {
      await sleep(600);
      assert.equal(await page.eval('window.__pwn ?? null'), null, `${label}: URL の文字列が実行された`);
      assert.equal(await page.eval(`document.querySelectorAll('img, [onerror], [onload], script:not([src])').length`), 0, `${label}: URL の文字列が要素になった`);
    };
    for (const p of payloads) {
      await page.goto(`${srv.url}/?fixture=${encodeURIComponent(p)}`);
      await inert(`fixture=${p}`);
      const fetched = await page.eval(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /-(state|script)\\.json/.test(n))`);
      assert.deepEqual(fetched, [], `fixture=${p}: 決まりに合わない名前では見本を取りにいかない`);
    }
    for (const p of payloads) {
      await page.goto(`${srv.url}/?fixture=demo&script=${encodeURIComponent(p)}`);
      await inert(`script=${p}`);
      const fetched = await page.eval(`performance.getEntriesByType('resource').map((e) => e.name).filter((n) => n.includes('-script.json'))`);
      assert.deepEqual(fetched, [], `script=${p}: 決まりに合わない名前では台本を取りにいかない`);
    }
    // 対照: 決まりに合う名前は今までどおり使える
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    // 決まりに合うが無い見本: 失敗はテキストで出る（要素にならない）
    await page.goto(`${srv.url}/?fixture=nope_1`);
    await page.waitFor(`document.querySelector('#toast')?.innerText.trim().length > 0`, { message: '読み込めなかった知らせが出る' });
    assert.equal(await page.eval(`document.querySelectorAll('#toast img, #toast svg, #toast script').length`), 0);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('29.1 /api/state の失敗の本文（code・error）に HTML があっても、テキストとして出る', async () => {
  const evilCode = '<img id=pwn1 src=x onerror="window.__pwn=1">';
  const evilMsg = '<svg id=pwn2 onload="window.__pwn=2"></svg><img src=x onerror="window.__pwn=3">';
  for (const status of [500, 404]) {
    const live = await liveServer(null, { state: (req, res) => json(res, status, { ok: false, code: evilCode, error: evilMsg }) });
    const page = await openBrowser();
    try {
      await page.goto(`${live.url}/`);
      await sleep(2500);
      assert.equal(await page.eval('window.__pwn ?? null'), null, `HTTP ${status}: 本文の HTML が実行された`);
      assert.equal(await page.eval(`document.querySelectorAll('img, svg[onload], [onerror], [onload]').length`), 0, `HTTP ${status}: 本文の HTML が要素になった`);
      assert.deepEqual(exceptions(page), []);
    } finally {
      await page.close();
      await live.close();
    }
  }
});

// ---------- 29.2 head / quest が null のビュー ----------

test('29.2 head や quest が null のビューでも落ちず「冒険の書が呪われています」と verify / repair の案内を出し、次のビューを描ける', async () => {
  const srv = await serveStatic(WEB);
  const page = await openBrowser();
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const variants = {
      '全部 null / 空': cursedView(),
      'head だけ null': (() => { const v = demo(); v.head = null; v.integrity = { ok: false, errors: [{ seq: 0, code: 'E_PARSE', message: 'x' }] }; return v; })(),
      'quest だけ null': (() => { const v = demo(); v.quest = null; v.integrity = { ok: false, errors: [{ seq: 0, code: 'E_PARSE', message: 'x' }] }; return v; })(),
    };
    const render = (v) => page.eval(`(() => { try { window.__masume.render(${JSON.stringify(v)}); return null; } catch (e) { return String(e && e.stack || e); } })()`);
    for (const [name, bad] of Object.entries(variants)) {
      // 良い → 悪い → 悪い → 良い の順で（前の描画が null のビューだったときの次の描画も確かめる）
      assert.equal(await render(demo()), null, `${name}: 良いビューが描ける`);
      assert.equal(await render(bad), null, `${name}: 悪いビューを描いて落ちない`);
      const text = await page.eval('document.body.innerText');
      assert.ok(text.includes(CURSED_TEXT), `${name}: 「${CURSED_TEXT}」が出る`);
      assert.ok(text.includes('masume verify'), `${name}: masume verify の案内`);
      assert.ok(text.includes('masume repair'), `${name}: masume repair の案内`);
      assert.equal(await page.eval(`document.querySelector('#integrity').dataset.ok`), 'false', `${name}: セーブの印が呪われを示す`);
      assert.equal(await render(bad), null, `${name}: 悪いビューが続いても落ちない`);
      assert.equal(await render(demo()), null, `${name}: 悪いビューのあとの次の描画が落ちない`);
      assert.equal(await page.eval(`document.querySelectorAll('.pawn[data-char]').length`), demo().characters.length, `${name}: 良いビューに戻れば駒が出る`);
      const after = await page.eval('document.body.innerText');
      assert.ok(!after.includes(CURSED_TEXT), `${name}: 戻ったら呪いの表示は消える`);
      assert.equal(await page.eval(`document.querySelector('#integrity').dataset.ok`), 'true');
    }
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('29.2 ライブ: 冒険の書が読めない状態から、直ったら盤面に戻る', async () => {
  const live = await liveServer(cursedView());
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    await page.waitFor(`document.body.innerText.includes('masume repair')`, { message: 'repair の案内が出る' });
    const text = await page.eval('document.body.innerText');
    assert.ok(text.includes(CURSED_TEXT) && text.includes('masume verify'));
    // 直った（次のビューは seq が先頭から読める）
    live.view = demo();
    live.change();
    await page.waitFor(`document.querySelectorAll('.pawn[data-char]').length === ${demo().characters.length}`, { timeout: 8000, message: '直ったら盤面が出る' });
    assert.ok(!(await page.eval('document.body.innerText')).includes(CURSED_TEXT));
    // また壊れ、また直る
    live.view = cursedView();
    live.change();
    await page.waitFor(`document.body.innerText.includes('masume repair')`, { timeout: 8000, message: 'また壊れたら案内が出る' });
    live.view = demo();
    live.change();
    await page.waitFor(`document.querySelectorAll('.pawn[data-char]').length === ${demo().characters.length} && !document.body.innerText.includes('masume repair')`, { timeout: 8000, message: 'また直ったら盤面が出る' });
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

// ---------- 29.3 /api/state の一時的な失敗 ----------

test('29.3 /api/state が一時的に失敗しても盤面を覆わず #live だけに出し、取れたら「ライブ」に戻る', async () => {
  let mode = 'ok';
  const live = await liveServer(demo(), {
    state: (req, res, l) => {
      if (mode === '500json') return json(res, 500, { ok: false, code: 'E_INTERNAL', error: 'boom' });
      if (mode === '500text') { res.writeHead(500, { 'content-type': 'text/plain' }); return res.end('Internal Server Error'); }
      if (mode === '502html') { res.writeHead(502, { 'content-type': 'text/html' }); return res.end('<h1>Bad Gateway</h1>'); }
      if (mode === 'drop') return req.socket.destroy();
      return json(res, 200, l.view);
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { message: '最初はライブ' });
    const pawns = demo().characters.length;
    const nodes = Object.keys(demo().nodes).length;
    for (const kind of ['500json', '500text', '502html', 'drop']) {
      mode = kind;
      live.change();
      await page.waitFor(`document.querySelector('#live').dataset.mode !== 'live'`, { timeout: 6000, message: `${kind}: 端の表示が失敗を示す` });
      const r = await page.eval(`(() => {
        const n = document.querySelector('#notice');
        return {
          notice: !!n && !n.hidden && getComputedStyle(n).display !== 'none',
          pawns: document.querySelectorAll('.pawn[data-char]').length,
          nodes: document.querySelectorAll('#node-layer .node').length,
          liveText: document.querySelector('#live').textContent,
          cover: document.body.innerText.includes('冒険の書が見つかりません'),
        };
      })()`);
      assert.equal(r.notice, false, `${kind}: 盤面を覆うお知らせを出さない`);
      assert.equal(r.cover, false, `${kind}: 「冒険の書が見つかりません」で覆わない`);
      assert.equal(r.pawns, pawns, `${kind}: 盤面（駒）はそのまま`);
      assert.equal(r.nodes, nodes, `${kind}: 盤面（マス）はそのまま`);
      assert.notEqual(r.liveText.trim(), 'ライブ', `${kind}: 端の表示は「ライブ」のままではない`);

      mode = 'ok';
      live.change();
      await page.waitFor(`document.querySelector('#live').dataset.mode === 'live' && document.querySelector('#live').textContent.trim() === 'ライブ'`, { timeout: 6000, message: `${kind}: 取れたら「ライブ」に戻る` });
    }
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

test('29.3 冒険の書が無くなったとき（E_NO_GAME）は、今までどおり入口（ロビー）になる', async () => {
  let mode = 'ok';
  const live = await liveServer(demo(), {
    state: (req, res, l) => (mode === 'none' ? json(res, 404, { ok: false, code: 'E_NO_GAME', error: '冒険の書が見つかりません' }) : json(res, 200, l.view)),
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    mode = 'none';
    live.change();
    await page.waitFor(`window.__masume.lobby === true && !document.querySelector('#lobby').hidden`, { timeout: 6000, message: 'ロビーに切り替わる' });
    assert.equal(await page.eval(`document.querySelector('#live').dataset.mode`), 'lobby');
  } finally {
    await page.close();
    await live.close();
  }
});

// ---------- 29.4 POST が届かない ----------

const NO_SERVER = 'サーバーに届きません';
const hasText = (text) => `document.body.innerText.includes(${JSON.stringify(text)})`;

test('29.4 入口: 願いの POST が届かなかったら「サーバーに届きません」と知らせ、ボタンを押せる状態に戻す', async () => {
  let posts = 0;
  const live = await liveServer(null, {
    state: (req, res) => json(res, 404, { ok: false, code: 'E_NO_GAME', error: '冒険の書が見つかりません' }),
    routes: { 'POST /api/quest': (req, res) => { posts++; req.socket.destroy(); } },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await page.waitFor('window.__masume && window.__masume.lobby === true', { timeout: 15000, message: 'ロビーが出る' });
    await page.eval(`(() => { const w = document.querySelector('#wish'); w.value = 'メモアプリのようなアプリを作りたい'; w.dispatchEvent(new Event('input', { bubbles: true })); })()`);
    assert.equal(await page.eval(`document.querySelector('#start-quest').disabled`), false);
    await page.eval(`document.querySelector('#start-quest').click()`);
    await waitUntil(() => posts >= 1, { message: '願いの POST' }); // 切れた POST はブラウザが1回やり直すことがある
    await page.waitFor(hasText(NO_SERVER), { timeout: 6000, message: `「${NO_SERVER}」と知らせる` });
    await page.waitFor(`document.querySelector('#start-quest').disabled === false`, { timeout: 4000, message: '「冒険をはじめる」を押せる状態に戻る' });
    assert.deepEqual(exceptions(page), [], '未処理の例外を出さない');
  } finally {
    await page.close();
    await live.close();
  }
});

test('29.4 盤面: 出撃・止める・ハンコ・ボス戦の POST が届かなくても、知らせてボタンを押せる状態に戻す', async () => {
  const view = demo();
  view.nodes.G1.state = 'ready'; // ボス戦の準備OK（[data-battle] が出る）
  const attempts = [];
  const dead = (name) => (req, res) => { attempts.push(name); req.socket.destroy(); };
  const live = await liveServer(view, {
    party: { ok: true, running: true, code: null, log: '軍師: 出撃中' }, // 「止める」が出る
    routes: {
      'POST /api/sortie': dead('sortie'),
      'POST /api/party/stop': dead('stop'),
      'POST /api/stamp': dead('stamp'),
      'POST /api/battle': dead('battle'),
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    const clearToasts = () => page.eval(`document.querySelector('#toast').innerHTML = ''`);
    const settle = async (name, enabledExpr) => {
      await waitUntil(() => attempts.includes(name), { message: `${name} の POST` });
      await page.waitFor(hasText(NO_SERVER), { timeout: 6000, message: `${name}: 「${NO_SERVER}」と知らせる` });
      await page.waitFor(enabledExpr, { timeout: 4000, message: `${name}: ボタンを押せる状態に戻る` });
    };

    // 出撃
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true`, { message: '出撃の窓がひらく' });
    await clearToasts();
    await page.eval(`document.querySelector('#sortie-go').click()`);
    await settle('sortie', `document.querySelector('#sortie-go').disabled === false`);
    await page.eval(`document.querySelector('#sortie-cancel').click()`);

    // 止める（出撃中の表示になるのを待つ）
    await page.waitFor(`document.querySelector('#party-status').dataset.running === 'true' && !document.querySelector('#party-stop').hidden`, { timeout: 8000, message: '「止める」が出る' });
    await clearToasts();
    await page.eval(`document.querySelector('#party-stop').click()`);
    await settle('stop', `document.querySelector('#party-stop').disabled === false`);

    // ハンコ（H1 は勇者のハンコ待ち）
    await page.eval(`window.__masume.select('node', 'H1')`);
    await page.waitFor(`!!document.querySelector('[data-stamp="H1"]')`, { message: 'ハンコのボタン' });
    await clearToasts();
    await page.eval(`document.querySelector('[data-stamp="H1"]').click()`);
    await settle('stamp', `document.querySelector('[data-stamp="H1"]')?.disabled === false`);

    // ボス戦
    await page.eval(`window.__masume.select('node', 'G1')`);
    await page.waitFor(`!!document.querySelector('[data-battle="G1"]')`, { message: 'ボス戦のボタン' });
    await clearToasts();
    await page.eval(`document.querySelector('[data-battle="G1"]').click()`);
    await settle('battle', `document.querySelector('[data-battle="G1"]')?.disabled === false`);
    assert.deepEqual(exceptions(page), [], '未処理の例外を出さない');
  } finally {
    await page.close();
    await live.close();
  }
});

// ---------- 29.5 SSE ----------

test('29.5 SSE の hello で読み直す（つなぎ直したとき、切れている間に変わった分を取りこぼさない）', async () => {
  const live = await liveServer(viewOf('V1', 13), {
    stream: (req, res, l) => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      res.write('retry: 300\nevent: hello\ndata: {}\n\n');
      if (l.streamCalls === 1) {
        // 最初の接続: 少したったら、change を送らないまま内容だけ変えて切る
        setTimeout(() => { l.view = viewOf('V2 (切れている間に変わった)', 14); res.end(); }, 700);
      } else {
        l.clients.add(res);
        res.on('close', () => l.clients.delete(res));
      }
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await page.waitFor(`document.querySelector('.quest-title')?.textContent === 'V1'`, { message: '最初は V1' });
    // 15秒ごとの読み直しより前に、hello で読み直して V2 になる
    await page.waitFor(`document.querySelector('.quest-title')?.textContent.startsWith('V2')`, { timeout: 9000, message: 'つなぎ直したときの hello で V2 を読み直す' });
    assert.ok(live.streamCalls >= 2, 'SSE はつなぎ直されている');
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { message: 'ライブの表示' });
  } finally {
    await page.close();
    await live.close();
  }
});

test('29.5 SSE が閉じたら（HTTP エラーで CLOSED になっても）数秒後につなぎ直し、以降の change も受け取る', async () => {
  const live = await liveServer(viewOf('V1', 13), {
    stream: (req, res, l) => {
      if (l.streamCalls === 1) {
        res.writeHead(503, { 'content-type': 'text/plain' }); // EventSource は二度とつなぎ直さず CLOSED になる
        return res.end('unavailable');
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      res.write('retry: 500\nevent: hello\ndata: {}\n\n');
      l.clients.add(res);
      res.on('close', () => l.clients.delete(res));
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await waitUntil(() => live.streamCalls >= 2 && live.clients.size >= 1, { timeout: 13000, interval: 100, message: '数秒のうちに SSE をつなぎ直す' });
    live.view = viewOf('V2', 14);
    live.change();
    await page.waitFor(`document.querySelector('.quest-title')?.textContent === 'V2'`, { timeout: 4000, message: 'つなぎ直した SSE の change で描き直す' });
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { timeout: 4000, message: 'ライブの表示に戻る' });
  } finally {
    await page.close();
    await live.close();
  }
});

test('29.5 今より古い応答（head.seq が小さい）では描き直さない', async () => {
  const live = await liveServer(viewOf('V1', 13), {
    state: (req, res, l) => {
      if (l.armed) {
        l.armed = false; // この1回だけ遅い（古いビューを遅れて返す）
        return setTimeout(() => json(res, 200, viewOf('OLD-SLOW', 14)), 1500);
      }
      json(res, 200, l.view);
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    await page.waitFor(`document.querySelector('.quest-title')?.textContent === 'V1'`);
    await sleep(500); // 最初の hello の読み直しが済むのを待つ
    live.view = viewOf('NEWEST', 15);
    live.armed = true;
    live.change(); // 遅い（seq 14 を返す）
    await sleep(400);
    live.change(); // 速い（seq 15 を返す）
    await page.waitFor(`document.querySelector('.quest-title')?.textContent === 'NEWEST'`, { timeout: 4000, message: '新しい応答が描かれる' });
    await sleep(2500); // 遅れた古い応答が届く
    assert.equal(await titleOf(page), 'NEWEST', '遅れて届いた古い応答で上書きしない');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await live.close();
  }
});

test('29.5 入口（冒険の書なし）を経て、seq の小さい新しい冒険が来ても盤面に映る', async () => {
  let mode = 'game1';
  const live = await liveServer(viewOf('GAME1', 40), {
    state: (req, res) => {
      if (mode === 'none') return json(res, 404, { ok: false, code: 'E_NO_GAME', error: '冒険の書が見つかりません' });
      json(res, 200, mode === 'game1' ? viewOf('GAME1', 40) : viewOf('GAME2', 3));
    },
  });
  const page = await openBrowser();
  try {
    await page.goto(`${live.url}/`);
    await boardReady(page);
    assert.equal(await titleOf(page), 'GAME1');
    mode = 'none';
    live.change();
    await page.waitFor('window.__masume.lobby === true', { timeout: 6000, message: '入口になる' });
    mode = 'game2';
    live.change();
    await page.waitFor(`document.querySelector('.quest-title')?.textContent === 'GAME2' && document.querySelectorAll('.pawn[data-char]').length > 0`, { timeout: 10000, message: '新しい冒険（seq が小さい）が盤面に映る' });
  } finally {
    await page.close();
    await live.close();
  }
});

// ---------- 29.6 書き出しの SVG は XML として正しい ----------

test('29.6 書き出しの SVG は、NBSP・制御文字・記号を含む文字列でも XML として正しく、単独で開ける', async () => {
  let svgText = '';
  const srv = await serveStatic(WEB, { 'GET /export.svg': (req, res) => { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(svgText); } });
  const page = await openBrowser({ width: 1500, height: 800 });
  try {
    const cases = {
      NBSP: (v) => { v.nodes.B1.title = '方眼ノートに 道を描く'; v.quest.title = '冒険 の書'; v.characters[0].name = '賢者 クロード'; },
      制御文字: (v) => { v.nodes.B1.title = 'a\u0001b\u000bc\u000cd\u001fe'; v.characters[0].name = 'x\u0008y'; v.quest.pitch = 'p\u0002q'; },
      記号: (v) => { v.nodes.B1.title = `A&B <C> "D" 'E' ]]> </style>`; v.quest.title = 'T&T <x> "q"'; v.quest.pitch = 'p&p <b>'; },
    };
    for (const [name, mutate] of Object.entries(cases)) {
      const v = demo();
      mutate(v);
      await page.goto(`${srv.url}/?fixture=demo`);
      await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
      const info = await page.eval(`(() => {
        window.__masume.render(${JSON.stringify(v)});
        const text = window.__masume.exportSvg();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        const err = doc.querySelector('parsererror');
        return { text, error: err ? err.textContent.slice(0, 200) : null, root: doc.documentElement.nodeName, nodes: doc.querySelectorAll('[data-node]').length, chars: doc.querySelectorAll('[data-char]').length };
      })()`);
      assert.equal(info.error, null, `${name}: XML として読める: ${info.error}`);
      assert.equal(info.root, 'svg', name);
      assert.equal(info.nodes, Object.keys(v.nodes).length, `${name}: マスが全部ある`);
      assert.ok(info.chars >= v.characters.length, `${name}: 駒がある`);
      // 単独のファイルとして開く
      svgText = info.text;
      await page.goto(`${srv.url}/export.svg`);
      const open = await page.eval(`JSON.stringify({ root: document.documentElement.nodeName, err: !!document.querySelector('parsererror'), nodes: document.querySelectorAll('[data-node]').length })`);
      assert.deepEqual(JSON.parse(open), { root: 'svg', err: false, nodes: Object.keys(v.nodes).length }, `${name}: 単独で開ける`);
    }
    // NBSP の文字は消えない（見える文字はそのまま残る）
    const v = demo();
    cases.NBSP(v);
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const text = await page.eval(`(() => { window.__masume.render(${JSON.stringify(v)}); const d = new DOMParser().parseFromString(window.__masume.exportSvg(), 'image/svg+xml'); return d.documentElement.textContent.replace(/\\s+/g, ''); })()`);
    assert.ok(text.includes('冒険の書'), `NBSP を含む題名が残る`);
    assert.ok(text.includes('賢者クロード'), `NBSP を含む名前が残る`);
  } finally {
    await page.close();
    await srv.close();
  }
});

// ---------- 29.7 狭い画面 ----------

for (const width of [375, 860]) {
  test(`29.7 狭い画面（${width}px）で、マスやキャラクターを選ぶと詳細が画面の中に出る`, async () => {
    const wrap = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#888"><iframe id="f" src="/?fixture=demo" style="border:0;display:block;width:${width}px;height:700px"></iframe>`;
    const srv = await serveStatic(WEB, { 'GET /wrap': (req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(wrap); } });
    const page = await openBrowser({ width: 900, height: 800 });
    // iframe の中が「画面」: そこでの幅・高さ・スクロールで見える範囲を調べる
    const inFrame = (body) => `(() => { const w = document.getElementById('f').contentWindow; const d = w.document; ${body} })()`;
    const visible = inFrame(`
      const el = d.querySelector('#drawer');
      if (!el || el.hidden) return false;
      const r = el.getBoundingClientRect();
      const shown = Math.min(r.bottom, w.innerHeight) - Math.max(r.top, 0);
      return r.height > 0 && shown >= Math.min(r.height, 160) && r.left >= -1 && r.right <= w.innerWidth + 1;`);
    try {
      await page.goto(`${srv.url}/wrap`);
      await page.waitFor(inFrame(`return w.__masume && w.__masume.ready === true && w.innerWidth === ${width};`), { timeout: 15000, message: `${width}px の画面で盤面が出る` });
      assert.equal(await page.eval(inFrame(`return d.querySelector('#drawer').hidden;`)), true, '最初は詳細が閉じている');

      // マスを選ぶ（盤面のマスをタップ）
      await page.eval(inFrame(`d.querySelector('#node-layer [data-node="B2"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));`));
      await page.waitFor(inFrame(`return d.querySelector('#drawer').dataset.id === 'B2';`), { message: 'マスの詳細がひらく' });
      await page.waitFor(visible, { timeout: 4000, message: `マスの詳細が画面の中に出る（${width}px）` });

      // 閉じて、スクロールを戻し、キャラクターを選ぶ（なかま一覧のカードをタップ）
      await page.eval(inFrame(`w.__masume.select(null); w.scrollTo(0, 0);`));
      await page.waitFor(inFrame(`return d.querySelector('#drawer').hidden && w.scrollY === 0;`), { message: '詳細を閉じて先頭に戻る' });
      await page.eval(inFrame(`d.querySelector('.party-card[data-char="engine"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));`));
      await page.waitFor(inFrame(`return d.querySelector('#drawer').dataset.id === 'engine';`), { message: 'キャラクターシートがひらく' });
      await page.waitFor(visible, { timeout: 4000, message: `キャラクターシートが画面の中に出る（${width}px）` });

      // 盤面の名札（道の先頭）からも
      await page.eval(inFrame(`w.__masume.select(null); w.scrollTo(0, 0);`));
      await page.waitFor(inFrame(`return d.querySelector('#drawer').hidden && w.scrollY === 0;`));
      await page.eval(inFrame(`d.querySelector('.lane-head[data-char="gmkit"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));`));
      await page.waitFor(inFrame(`return d.querySelector('#drawer').dataset.id === 'gmkit';`), { message: '名札からキャラクターシート' });
      await page.waitFor(visible, { timeout: 4000, message: `名札から開いたキャラクターシートも画面の中に出る（${width}px）` });
    } finally {
      await page.close();
      await srv.close();
    }
  });
}

// ---------- 29.8 job・マスID・キャラIDが Object のプロパティ名でも描ける ----------

/** ビュー v の中の ID を付けかえる（マスID / キャラID） */
function rename(v, kind, from, to) {
  if (kind === 'node') {
    v.nodes = Object.fromEntries(Object.entries(v.nodes).map(([k, n]) => [k === from ? to : k, n.id === from ? { ...n, id: to } : n]));
    for (const c of v.characters) {
      c.path = c.path.map((p) => (p === from ? to : p));
      if (c.at === from) c.at = to;
      if (c.checkpoint === from) c.checkpoint = to;
    }
    for (const e of v.log) if (e.node === from) e.node = to;
    if (v.quest.goal === from) v.quest.goal = to;
  } else {
    for (const c of v.characters) if (c.id === from) c.id = to;
    for (const n of Object.values(v.nodes)) {
      if (n.owner === from) n.owner = to;
      n.members = (n.members || []).map((m) => (m === from ? to : m));
      if (n.check?.by === from) n.check = { ...n.check, by: to };
    }
    for (const e of v.log) if (e.character === from) e.character = to;
  }
}

test('29.8 job・color・マスID・キャラIDが constructor・toString・__proto__ などでも描ける', async () => {
  const srv = await serveStatic(WEB);
  const page = await openBrowser();
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    const render = (v) => page.eval(`(() => { try { window.__masume.render(${JSON.stringify(v)}); return null; } catch (e) { return String(e && e.stack || e); } })()`);
    const junk = /native code|\[object |function\s*\w*\s*\(/;
    const markup = () => page.eval(`['#board', '#party-list-wrap', '#ledger', '#log'].map((s) => document.querySelector(s).outerHTML).join('\\n')`);

    // 対照: ふつうのビューには、そういう文字列は出ない
    assert.equal(await render(demo()), null);
    assert.doesNotMatch(await markup(), junk, '対照: ふつうの見本にも出ている（判定の前提が崩れた）');

    const make = (stateOfB2 = 'current') => {
      const v = demo();
      rename(v, 'node', 'B2', 'constructor');
      rename(v, 'node', 'E3', 'toString');
      rename(v, 'node', 'S3', 'valueOf');
      rename(v, 'node', 'A1', 'hasOwnProperty');
      rename(v, 'char', 'server', 'constructor');
      v.nodes.constructor.state = stateOfB2;
      const byId = Object.fromEntries(v.characters.map((c) => [c.id, c]));
      byId.board.job = 'constructor';
      byId.board.color = 'constructor';
      byId.engine.job = '__proto__';
      byId.engine.color = '__proto__';
      byId.constructor.job = 'toString';
      byId.gmkit.job = 'hasOwnProperty';
      byId.gmkit.color = 'valueOf';
      return v;
    };

    const v1 = make('current');
    assert.equal(await render(v1), null, 'job・color・ID が Object のプロパティ名でも描画が落ちない');
    const counts = await page.eval(`({
      nodes: document.querySelectorAll('#node-layer .node').length,
      pawns: document.querySelectorAll('.pawn[data-char]').length,
      cards: document.querySelectorAll('.party-card').length,
      heads: document.querySelectorAll('.lane-head').length,
      roads: document.querySelectorAll('.road[data-char]').length,
    })`);
    const nChars = v1.characters.length;
    assert.deepEqual(counts, { nodes: Object.keys(v1.nodes).length, pawns: nChars, cards: nChars, heads: nChars, roads: nChars }, 'マスも駒もなかまも道も全部描かれる');
    assert.doesNotMatch(await markup(), junk, 'Object の関数が文字列になって属性や class に入っていない');

    // 選べる（詳細も描ける）
    for (const id of ['constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      await page.eval(`window.__masume.select('node', ${JSON.stringify(id)})`);
      const d = JSON.parse(await page.eval(`JSON.stringify({ id: document.querySelector('#drawer').dataset.id, kind: document.querySelector('#drawer').dataset.kind, html: document.querySelector('#drawer').innerHTML })`));
      assert.equal(d.id, id, `マス ${id} の詳細がひらく`);
      assert.ok(d.html.includes(v1.nodes[id].title.slice(0, 6)), `マス ${id} の詳細にタイトルが出る`);
      assert.doesNotMatch(d.html, junk);
    }
    await page.eval(`window.__masume.select('char', 'constructor')`);
    const sheet = JSON.parse(await page.eval(`JSON.stringify({ id: document.querySelector('#drawer').dataset.id, html: document.querySelector('#drawer').innerHTML })`));
    assert.equal(sheet.id, 'constructor', 'キャラクター constructor のシートがひらく');
    assert.ok(sheet.html.includes(v1.characters.find((c) => c.id === 'constructor').name));
    assert.doesNotMatch(sheet.html, junk);
    await page.eval(`window.__masume.setView('list')`);
    assert.equal(await page.eval(`document.querySelectorAll('#ledger tr[data-node="constructor"]').length`), 1, '台帳にも constructor のマスが並ぶ');
    assert.doesNotMatch(await markup(), junk);
    await page.eval(`window.__masume.setView('board')`);

    // 次の描画（状態が変わる・ログが増える）でも落ちない
    const v2 = make('cleared');
    v2.head.seq += 2;
    for (let i = 1; i <= 2; i++) v2.log.push({ seq: v1.head.seq + i, ts: new Date().toISOString(), type: 'check_passed', actor: 'constructor', character: 'constructor', node: 'constructor', ok: true, text: `constructor が突破した ${i}` });
    assert.equal(await render(v2), null, '次の描画でも落ちない');
    assert.doesNotMatch(await markup(), junk);
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});
