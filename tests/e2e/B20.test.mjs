// B20「手で進める」— 盤面（第16章）。CONTRACTS §71。
// /api/hand・/api/file・/api/step・/api/check・/api/stamp・/api/battle は偽の窓口で配る（伝令に頼らない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__masume && window.__masume.ready';
const base = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const who = base.characters.find((c) => c.status !== 'done');
const LOADED = `document.querySelector('#hand')?.dataset.loaded === 'true' && document.querySelector('#hand').dataset.busy !== 'true'`;

const brief = (current, { kind = 'agent', waiting = [] } = {}) => ({
  seq: 12, commit: null,
  character: { id: who.id, name: who.name, kind, territory: ['ai/**'], level: 2, xp: 0, xp_next: 3, max_level: false, vision: 1, status: current?.type === 'gate' ? 'waiting' : 'working' },
  current, visible: [], fog: 0, party: [], waiting_for: waiting,
});
const TASK = { id: 'A1', type: 'task', title: 'あいさつを書く', detail: 'ai/hello.txt に「こんにちは、GridHub！」と書く', check: { kind: 'cmd', run: 'node checks/hello.mjs', seal: ['checks/hello.mjs'], cases: ['あいさつの形', '名前がそろう'] }, sealed: true, seal_broken: false, rollback_to: null };
const STAMP = { id: 'H1', type: 'task', title: '名前を決める', detail: 'human/request.json を作ってハンコ', check: { kind: 'stamp', by: who.id }, sealed: true, seal_broken: false, rollback_to: null };
const GATE = { id: 'G1', type: 'gate', title: '合流', detail: '二人のカード', check: { kind: 'cmd', run: 'node checks/join.mjs' }, sealed: true, seal_broken: false, rollback_to: null };

async function withHand(fn, { hand = () => ({ ok: true, brief: brief(TASK), territory: ['ai/**'], files: [{ path: 'ai/hello.txt', size: 12 }, { path: 'ai/notes/memo.md', size: 4 }], solutions: [{ path: 'ai/hello.txt', content: 'こんにちは、GridHub！\n' }] }), replies = {}, query = '' } = {}) {
  const calls = [];
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const post = (path, fallback) => async (req, res) => {
    const body = JSON.parse(await readBody(req));
    calls.push({ path, body, masume: req.headers['x-masume'] });
    const [status, reply] = (replies[path] ?? fallback)(body);
    json(res, status, reply);
  };
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, base),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
    'GET /api/hand': (req, res) => {
      calls.push({ path: 'GET /api/hand', query: new URL(req.url, 'http://x').searchParams.get('character') });
      json(res, 200, hand());
    },
    'GET /api/file': (req, res) => {
      const u = new URL(req.url, 'http://x');
      calls.push({ path: 'GET /api/file', query: [u.searchParams.get('character'), u.searchParams.get('path')] });
      json(res, 200, { ok: true, path: u.searchParams.get('path'), exists: true, content: `中身: ${u.searchParams.get('path')}` });
    },
    'POST /api/file': post('/api/file', (b) => [200, { ok: true, path: b.path, bytes: Buffer.byteLength(b.content) }]),
    'POST /api/step': post('/api/step', () => [200, { ok: true, exit: 1, node: 'A1', cases: [{ name: 'あいさつの形', ok: true }, { name: '名前がそろう', ok: false }], seq: 13 }]),
    'POST /api/check': post('/api/check', () => [200, { ok: true, passed: true, exit: 0, ready: 'G1' }]),
    'POST /api/stamp': post('/api/stamp', () => [200, { ok: true, ready: null }]),
    'POST /api/battle': post('/api/battle', (b) => [200, { ok: true, ready: b.gate }]),
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/${query}`);
    await page.waitFor(READY, { timeout: 20000 });
    await fn(page, calls);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

async function openHand(page) {
  await page.eval(`window.__masume.select('char', ${JSON.stringify(who.id)})`);
  await page.waitFor(`!!document.querySelector('#drawer button[data-hand="${who.id}"]')`, { message: 'キャラクターシートに「手で進める」' });
  await page.eval(`document.querySelector('#drawer button[data-hand="${who.id}"]').click()`);
  await page.waitFor(LOADED, { timeout: 10000, message: '#hand を読み終える' });
}

const visible = (sel) => `(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.offsetParent !== null; })()`;

test('§71.1・§71.2 キャラクターシートの「手で進める」で、手で進める欄（#hand）を開き、指令書・縄張り・書けるファイル', { timeout: 120000 }, async () => {
  await withHand(async (page, calls) => {
    await openHand(page);
    assert.ok(calls.some((c) => c.path === 'GET /api/hand' && c.query === who.id), 'GET /api/hand?character=');
    const got = await page.eval(`(() => ({
      char: document.querySelector('#hand').dataset.char,
      brief: document.querySelector('#hand-brief').innerText,
      files: [...document.querySelectorAll('#hand-files li[data-path]')].map((li) => li.dataset.path),
      label: document.querySelector('#drawer button[data-hand]').innerText,
    }))()`);
    assert.equal(got.char, who.id);
    for (const w of ['あいさつを書く', 'ai/hello.txt に「こんにちは、GridHub！」と書く', 'ai/**', 'あいさつの形', '名前がそろう']) assert.ok(got.brief.includes(w), `#hand-brief に ${w}`);
    assert.deepEqual(got.files, ['ai/hello.txt', 'ai/notes/memo.md']);
    assert.match(got.label, /手で進める/);
    assert.equal(await page.eval(visible('#hand-step')), true, '歩く');
    assert.equal(await page.eval(visible('#hand-check')), true, '宣言判定');
    assert.equal(await page.eval(visible('#hand-stamp')), false, 'ハンコのマスではない');
    await page.eval(`document.querySelector('#hand-close').click()`);
    await page.waitFor(`document.querySelector('#hand').hidden`, { message: '閉じる' });
  });
});

test('§71.2 ファイルを押すと読み込み、書いて保存すると POST /api/file。見本を写すは欄に入れるだけ（保存しない）', { timeout: 120000 }, async () => {
  await withHand(async (page, calls) => {
    await openHand(page);
    await page.eval(`document.querySelector('#hand-files li[data-path="ai/notes/memo.md"]').click()`);
    await page.waitFor(`document.querySelector('#hand-content').value === '中身: ai/notes/memo.md'`, { message: 'ファイルを読み込む' });
    assert.equal(await page.eval(`document.querySelector('#hand-path').value`), 'ai/notes/memo.md');
    const posts = () => calls.filter((c) => c.path === '/api/file').length;
    await page.eval(`document.querySelector('#hand button[data-sample="ai/hello.txt"]').click()`);
    await page.waitFor(`document.querySelector('#hand-content').value === 'こんにちは、GridHub！\\n'`, { message: '見本を欄に入れる' });
    assert.equal(await page.eval(`document.querySelector('#hand-path').value`), 'ai/hello.txt');
    assert.equal(posts(), 0, '見本を写しただけでは保存しない');
    await page.eval(`(() => { const t = document.querySelector('#hand-content'); t.value = 'こんにちは、勇者！'; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#hand-save').click(); })()`);
    await waitUntil(() => posts() === 1, { message: 'POST /api/file' });
    assert.deepEqual(calls.find((c) => c.path === '/api/file'), { path: '/api/file', body: { character: who.id, path: 'ai/hello.txt', content: 'こんにちは、勇者！' }, masume: '1' });
    await page.waitFor(`document.querySelector('#hand-msg').dataset.ok === 'true'`, { message: '保存できた' });
  });
});

test('§71.2 歩く・宣言判定の結果を、知らせ（#hand-msg）とテスト1件ずつ（#hand-result）に。動いたあとは読み直す', { timeout: 120000 }, async () => {
  await withHand(async (page, calls) => {
    await openHand(page);
    const reads = () => calls.filter((c) => c.path === 'GET /api/hand').length;
    const before = reads();
    await page.eval(`document.querySelector('#hand-step').click()`);
    await page.waitFor(`document.querySelectorAll('#hand-result li').length === 2 && ${LOADED}`, { message: '歩いた結果' });
    assert.deepEqual(calls.find((c) => c.path === '/api/step'), { path: '/api/step', body: { character: who.id }, masume: '1' });
    assert.equal(await page.eval(`document.querySelectorAll('#hand-result li.ok').length`), 1);
    assert.equal(await page.eval(`document.querySelectorAll('#hand-result li.ng').length`), 1);
    assert.equal(await page.eval(`document.querySelector('#hand-msg').dataset.ok`), 'false', 'まだ落ちているテストがある');
    await waitUntil(() => reads() > before, { message: '歩いたあとで読み直す' });
    const mid = reads();
    await page.eval(`document.querySelector('#hand-check').click()`);
    await waitUntil(() => calls.some((c) => c.path === '/api/check'), { message: 'POST /api/check' });
    await page.waitFor(`document.querySelector('#hand-msg').dataset.ok === 'true' && ${LOADED}`, { message: '宣言判定の結果' });
    assert.match(await page.eval(`document.querySelector('#hand-msg').innerText`), /G1/, 'そろったゲートを知らせる');
    await waitUntil(() => reads() > mid, { message: '宣言のあとで読み直す' });
  });
  await withHand(async (page) => {
    await openHand(page);
    await page.eval(`document.querySelector('#hand-check').click()`);
    await page.waitFor(`document.querySelector('#hand-msg').dataset.ok === 'false' && ${LOADED}`, { message: '失敗は data-ok=false' });
  }, { replies: { '/api/check': () => [200, { ok: true, passed: false, exit: 1, ready: null }] } });
});

test('§71.2 ハンコのマスで本人が人間ならハンコのボタン（#hand-stamp）、ゲートで仲間がそろえばボス戦のボタン（#hand-battle）', { timeout: 120000 }, async () => {
  await withHand(async (page, calls) => {
    await openHand(page);
    assert.equal(await page.eval(visible('#hand-stamp')), true, 'ハンコ');
    assert.equal(await page.eval(visible('#hand-step')), false, 'ハンコのマスでは歩かない');
    await page.eval(`document.querySelector('#hand-stamp').click()`);
    await waitUntil(() => calls.some((c) => c.path === '/api/stamp'), { message: 'POST /api/stamp' });
    assert.deepEqual(calls.find((c) => c.path === '/api/stamp').body, { node: 'H1', as: who.id });
  }, { hand: () => ({ ok: true, brief: brief(STAMP, { kind: 'human' }), territory: ['human/**'], files: [], solutions: [] }) });
  await withHand(async (page, calls) => {
    await openHand(page);
    assert.equal(await page.eval(visible('#hand-battle')), true, 'ボス戦を始める');
    await page.eval(`document.querySelector('#hand-battle').click()`);
    await waitUntil(() => calls.some((c) => c.path === '/api/battle'), { message: 'POST /api/battle' });
    assert.deepEqual(calls.find((c) => c.path === '/api/battle').body, { gate: 'G1' });
  }, { hand: () => ({ ok: true, brief: brief(GATE, { waiting: [] }), territory: ['ai/**'], files: [], solutions: [] }) });
  await withHand(async (page) => {
    await openHand(page);
    assert.equal(await page.eval(visible('#hand-battle')), false, '仲間がそろうまでは出さない');
    assert.match(await page.eval(`document.querySelector('#hand-brief').innerText`), /待って/);
  }, { hand: () => ({ ok: true, brief: brief(GATE, { waiting: ['player'] }), territory: ['ai/**'], files: [], solutions: [] }) });
});

test('§71.2・§71.3 書きかけは盤面が新しくなっても消えない（#drawer と別の欄）。見本の盤面では「手で進める」を出さない', { timeout: 120000 }, async () => {
  await withHand(async (page) => {
    await openHand(page);
    await page.eval(`(() => { document.querySelector('#hand-path').value = 'ai/draft.txt'; document.querySelector('#hand-content').value = '書きかけ'; })()`);
    await page.eval(`window.__masume.render(${JSON.stringify(base)})`);
    await page.eval(`window.__masume.select('char', ${JSON.stringify(who.id)})`);
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await page.eval(`document.querySelector('#hand-content').value`), '書きかけ');
    assert.equal(await page.eval(`document.querySelector('#hand-path').value`), 'ai/draft.txt');
    assert.ok(!(await page.eval(`document.querySelector('#drawer').contains(document.querySelector('#hand'))`)), '#hand は #drawer の外');
  });
  await withHand(async (page) => {
    await page.eval(`window.__masume.select('char', ${JSON.stringify(who.id)})`);
    await page.waitFor(`!document.querySelector('#drawer').hidden`, { message: 'キャラクターシート' });
    assert.equal(await page.eval(`!!document.querySelector('button[data-hand]')`), false, '見本の盤面では出さない');
  }, { query: '?fixture=demo' });
});
