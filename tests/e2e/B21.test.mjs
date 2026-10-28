// B21「手で進めるの手直し」— 盤面（第16章）。CONTRACTS §74.3。
// 読むだけのファイル・ファイル名の例・進んだら空に・アプリの中の言い方。窓口は偽物で配る。
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
const HOME = `?home=${encodeURIComponent('http://127.0.0.1:43210/')}`;

const node = (id, over = {}) => ({ id, type: 'task', title: `${id} のマス`, detail: `${id} の説明`, check: { kind: 'cmd', run: `node checks/${id}.mjs` }, sealed: true, seal_broken: false, rollback_to: null, ...over });
const STAMP = node('H2', { title: 'カードを承認する', detail: 'human/request.json・ai/hello.txt・ai/card.json を読み、確認後に gridhub stamp H2 --as player でハンコを押します。', check: { kind: 'stamp', by: who.id } });
const hand = (current, { kind = 'agent', territory = ['ai/**'], files = [], solutions = [], review = [] } = {}) => ({
  ok: true,
  brief: { seq: 1, commit: null, character: { id: who.id, name: who.name, kind, territory, level: 1, xp: 0, xp_next: 2, max_level: false, vision: 0, status: 'working' }, current, visible: [], fog: 0, party: [], waiting_for: [] },
  territory, files, solutions, review,
});

async function withBoard(fn, { hands, view = base, query = '' }) {
  const calls = [];
  let n = 0;
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, view),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
    'GET /api/hand': (req, res) => json(res, 200, hands[Math.min(n++, hands.length - 1)]),
    'GET /api/file': (req, res) => {
      const path = new URL(req.url, 'http://x').searchParams.get('path');
      const readonly = path.startsWith('ai/') && hands[0].brief.character.kind === 'human';
      json(res, 200, { ok: true, path, exists: true, content: `中身: ${path}`, ...(readonly ? { readonly: true } : {}) });
    },
    'POST /api/file': async (req, res) => { calls.push(JSON.parse(await readBody(req))); json(res, 200, { ok: true, path: 'x', bytes: 1 }); },
    'POST /api/check': async (req, res) => { await readBody(req); json(res, 200, { ok: true, passed: true, exit: 0, ready: null }); },
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
  await page.waitFor(`!!document.querySelector('#drawer button[data-hand="${who.id}"]')`);
  await page.eval(`document.querySelector('#drawer button[data-hand="${who.id}"]').click()`);
  await page.waitFor(LOADED, { timeout: 10000, message: '#hand を読み終える' });
}

test('§74.3 承認のマスでは、読むだけのファイル（#hand-review）を押すと中身を出し、書き込み欄は読むだけ（保存できない）。自分のファイルを開けばまた書ける', { timeout: 120000 }, async () => {
  const h = hand(STAMP, { kind: 'human', territory: ['human/**'], files: [{ path: 'human/request.json', size: 9 }], review: [{ path: 'ai/card.json', size: 20, owner: 'apprentice' }, { path: 'human/request.json', size: 9, owner: who.id }] });
  await withBoard(async (page, calls) => {
    await openHand(page);
    assert.match(await page.eval(`document.querySelector('#hand-review').innerText`), /読むだけのファイル/);
    assert.deepEqual(await page.eval(`[...document.querySelectorAll('#hand-review li[data-path]')].map((li) => li.dataset.path)`), ['ai/card.json', 'human/request.json']);
    await page.eval(`document.querySelector('#hand-review li[data-path="ai/card.json"]').click()`);
    await page.waitFor(`document.querySelector('#hand-content').value === '中身: ai/card.json'`, { message: '読むだけのファイルの中身' });
    const ro = await page.eval(`({ ro: document.querySelector('#hand-content').readOnly, save: document.querySelector('#hand-save').disabled, label: (() => { const e = document.querySelector('#hand-readonly'); return !!e && !e.hidden && e.innerText; })() })`);
    assert.deepEqual([ro.ro, ro.save], [true, true], '読むだけ・保存できない');
    assert.match(ro.label, /読むだけ/);
    await page.eval(`document.querySelector('#hand-files li[data-path="human/request.json"]').click()`);
    await page.waitFor(`document.querySelector('#hand-content').value === '中身: human/request.json' && !document.querySelector('#hand-content').readOnly && !document.querySelector('#hand-save').disabled`, { message: '自分のファイルはまた書ける' });
    assert.equal(await page.eval(`document.querySelector('#hand-readonly').hidden`), true);
    assert.equal(calls.length, 0);
  }, { hands: [h] });
});

test('§74.3 ファイル名の欄の例は、見本があれば見本のパス、無ければ縄張りから（ai/hello.txt の決め打ちをしない）', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    await openHand(page);
    const ph = await page.eval(`document.querySelector('#hand-path').placeholder`);
    assert.match(ph, /^human\//, `例: ${ph}`);
  }, { hands: [hand(node('H1', { check: { kind: 'stamp', by: who.id } }), { kind: 'human', territory: ['human/**'] })] });
  await withBoard(async (page) => {
    await openHand(page);
    assert.equal(await page.eval(`document.querySelector('#hand-path').placeholder`), 'ai/card.json');
  }, { hands: [hand(node('A2'), { solutions: [{ path: 'ai/card.json', content: '{}' }] })] });
});

test('§74.3 次のマスに進んだら、ファイル名と中身の欄を空にする', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    await openHand(page);
    await page.eval(`(() => { document.querySelector('#hand-path').value = 'ai/hello.txt'; document.querySelector('#hand-content').value = 'こんにちは'; })()`);
    await page.eval(`document.querySelector('#hand-check').click()`);
    await page.waitFor(`${LOADED} && /A2/.test(document.querySelector('#hand-brief').innerText)`, { timeout: 10000, message: '次のマス（A2）を読み直す' });
    assert.equal(await page.eval(`document.querySelector('#hand-path').value`), '');
    assert.equal(await page.eval(`document.querySelector('#hand-content').value`), '');
  }, { hands: [hand(node('A1')), hand(node('A2'))] });
});

test('§74.3 アプリの中（?home= が手元）では、指令書・マスの説明・キャラクターシートに CLI の言い方を出さない（ボタンの名前に言い換え、CLI は「ターミナルでは」で畳む）', { timeout: 120000 }, async () => {
  const view = structuredClone(base);
  const target = Object.keys(view.nodes).find((id) => view.nodes[id].type === 'task');
  view.nodes[target].detail = 'ai/hello.txt を書いて gridhub check apprentice --as apprentice で宣言します。歩くなら gridhub step apprentice。';
  const h = hand(STAMP, { kind: 'human', territory: ['human/**'] });
  await withBoard(async (page) => {
    await openHand(page);
    const brief = await page.eval(`document.querySelector('#hand-brief').innerText`);
    assert.doesNotMatch(brief, /gridhub|masume/, `指令書: ${brief}`);
    assert.match(brief, /「ハンコを押す」/);
    await page.eval(`document.querySelector('#hand-close').click()`);
    await page.eval(`window.__masume.select('char', ${JSON.stringify(who.id)})`);
    await page.waitFor(`!document.querySelector('#drawer').hidden && !!document.querySelector('#drawer details.cli')`, { message: 'CLI は畳む' });
    const sheet = await page.eval(`({ open: document.querySelector('#drawer details.cli').open, summary: document.querySelector('#drawer details.cli summary').innerText, text: document.querySelector('#drawer').innerText })`);
    assert.equal(sheet.open, false, '初めは閉じている');
    assert.match(sheet.summary, /ターミナルでは/);
    assert.doesNotMatch(sheet.text, /gridhub (brief|step|check)/, 'キャラクターシートの見えている字に CLI が無い');
    await page.eval(`window.__masume.select('node', ${JSON.stringify(target)})`);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === ${JSON.stringify(target)}`);
    const nodeText = await page.eval(`document.querySelector('#drawer').innerText`);
    assert.doesNotMatch(nodeText, /gridhub (check|step)/, `マスの説明: ${nodeText.slice(0, 200)}`);
    assert.match(nodeText, /「宣言判定」/);
    assert.match(nodeText, /「歩く」/);
  }, { hands: [h], view, query: HOME });
  await withBoard(async (page) => {
    await page.eval(`window.__masume.select('node', ${JSON.stringify(target)})`);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === ${JSON.stringify(target)}`);
    assert.match(await page.eval(`document.querySelector('#drawer').innerText`), /gridhub check apprentice/, 'アプリの外は今までどおり');
  }, { hands: [h], view });
});
