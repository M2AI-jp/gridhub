// B18「自動で送る切り替えと、最大レベルの仲間の欄」— CONTRACTS §59.6・§60.2（第13章）。
// GET /api/git・POST /api/git/auto と、view.push・max_level を偽の窓口で配る。本物の GitHub には触らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__masume && window.__masume.ready';
const base = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
const COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';

const git = (auto) => ({
  inside: true, branch: 'main', head: COMMIT, remote: { name: 'origin', url: 'https://github.com/someone/memo.git', github: true },
  upstream: 'origin/main', ahead: 0, behind: 0, gh: { installed: true, authenticated: true }, auto_push: auto,
  steps: [
    { id: 'git', done: true, text: 'Git の作業ツリーにする', command: 'git init' },
    { id: 'gh', done: true, text: 'gh を入れる: https://cli.github.com/', command: null },
    { id: 'login', done: true, text: 'GitHub にログインする', command: 'gh auth login' },
    { id: 'repo', done: true, text: 'リポジトリを作ってつなぐ', command: 'gh repo create memo --private --source . --remote origin' },
    { id: 'push', done: true, text: 'GitHub に送る', command: 'gridhub push' },
  ],
});

/** 見本のビューに、最大レベルの仲間と、送った結果を足す */
function viewWith(push) {
  const v = structuredClone(base);
  v.characters.forEach((c, i) => {
    if (i === 0) Object.assign(c, { level: 9, xp: 16, xp_next: 10, max_level: true });
    else c.max_level = c.level === 9;
  });
  v.push = push;
  return v;
}

async function withBoard(fn, { push = null, auto = false } = {}) {
  let current = auto;
  const posts = [];
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
  const view = viewWith(push);
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, view),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
    'GET /api/git': (req, res) => json(res, 200, git(current)),
    'POST /api/git/auto': async (req, res) => {
      const body = JSON.parse(await readBody(req));
      posts.push({ body, masume: req.headers['x-masume'] });
      current = body.auto_push;
      json(res, 200, { ok: true, auto_push: current });
    },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 15000 });
    await page.waitFor(`!!document.querySelector('#git-panel')?.dataset.state`, { timeout: 10000, message: '#git-panel' });
    await fn(page, posts, view);
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('§59.6 セーブの欄の切り替え（#git-auto）は auto_push を映し、切り替えると X-Masume 付きで POST /api/git/auto', { timeout: 120000 }, async () => {
  await withBoard(async (page, posts) => {
    await page.waitFor(`document.querySelector('#git-auto') !== null`, { timeout: 10000, message: '#git-auto' });
    const box = await page.eval(`(() => { const b = document.querySelector('#git-auto'); return { type: b.type, checked: b.checked, label: (b.closest('label') || b.parentElement).innerText }; })()`);
    assert.equal(box.type, 'checkbox');
    assert.equal(box.checked, false, '初めはオフ');
    assert.match(box.label, /町でセーブしたら GitHub に送る/);
    await page.eval(`document.querySelector('#git-auto').click()`);
    await waitUntil(() => posts.length === 1, { message: 'POST /api/git/auto' });
    assert.deepEqual(posts[0], { body: { auto_push: true }, masume: '1' });
    await page.waitFor(`document.querySelector('#git-auto').checked === true`, { timeout: 5000, message: '読み直してオン' });
    await page.eval(`document.querySelector('#git-auto').click()`);
    await waitUntil(() => posts.length === 2, { message: 'もう一度 POST' });
    assert.deepEqual(posts[1].body, { auto_push: false });
  });
});

test('§59.6 送った結果（view.push）を盤面に（#git-last）。送れたら commit、送れなければ理由', { timeout: 120000 }, async () => {
  await withBoard(async (page) => {
    await page.waitFor(`document.querySelector('#git-last')?.dataset.ok === 'true'`, { timeout: 10000, message: '#git-last' });
    assert.match(await page.eval(`document.querySelector('#git-last').innerText`), /GitHub に送った（commit abcdef1）/);
  }, { push: { seq: 40, node: 'C1', ok: true, commit: COMMIT, remote: 'origin', branch: 'main', error: null }, auto: true });
  await withBoard(async (page) => {
    await page.waitFor(`document.querySelector('#git-last')?.dataset.ok === 'false'`, { timeout: 10000, message: '#git-last（送れなかった）' });
    assert.match(await page.eval(`document.querySelector('#git-last').innerText`), /GitHub に送れなかった: リモートが先に進んでいます/);
  }, { push: { seq: 41, node: 'C1', ok: false, commit: COMMIT, remote: 'origin', branch: 'main', error: 'リモートが先に進んでいます' }, auto: true });
});

test('§60.2 仲間の欄: 最大なら「Lv9（最大）」で経験値の分数を出さない（data-max="true"）', { timeout: 120000 }, async () => {
  await withBoard(async (page, posts, view) => {
    const cards = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('.party-card[data-char]')].map((c) => ({ id: c.dataset.char, max: c.dataset.max || '', lv: c.querySelector('.lv')?.innerText || '' })))`));
    const top = view.characters[0];
    const card = cards.find((c) => c.id === top.id);
    assert.ok(card, `${top.id} の仲間の欄`);
    assert.equal(card.max, 'true');
    assert.match(card.lv, /Lv\s*9\s*（最大）/);
    assert.doesNotMatch(card.lv, /経験値/);
    for (const c of view.characters.slice(1)) {
      const k = cards.find((x) => x.id === c.id);
      if (!k || c.max_level) continue;
      assert.notEqual(k.max, 'true', `${c.id} は最大でない`);
      assert.match(k.lv, new RegExp(`経験値 ${c.xp}/${c.xp_next}`), `${c.id}: ${k.lv}`);
    }
  });
});
