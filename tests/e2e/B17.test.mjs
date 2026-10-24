// B17「盤面から GitHub につなぐ」— CONTRACTS §56.4（第12章）。セーブの欄の #git-panel。
// GET /api/git と POST /api/git/push は偽の窓口で配る（書記・伝令を待たずに確かめる）。本物の GitHub には触らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser, waitUntil } from '../helpers4.mjs';

const WEB = join(ROOT, 'web');
const READY = 'window.__masume && window.__masume.ready';
const fixture = JSON.parse(readFileSync(join(WEB, 'fixtures', 'demo-state.json'), 'utf8'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

const STEPS = (done) => [
  { id: 'git', done: done.git, text: 'Git の作業ツリーにする', command: 'git init' },
  { id: 'gh', done: done.gh, text: 'gh（GitHub のコマンド）を入れる: https://cli.github.com/', command: null },
  { id: 'login', done: done.login, text: 'GitHub にログインする', command: 'gh auth login' },
  { id: 'repo', done: done.repo, text: 'GitHub にリポジトリを作ってつなぐ', command: 'gh repo create memo --private --source . --remote origin' },
  { id: 'push', done: done.push, text: 'GitHub に送る', command: 'gridhub push' },
];
const base = { inside: true, branch: 'main', head: 'a'.repeat(40), behind: 0, gh: { installed: true, authenticated: true } };
const STATES = {
  outside: { inside: false, branch: null, head: null, remote: null, upstream: null, ahead: null, behind: null, gh: { installed: false, authenticated: null },
    steps: STEPS({ git: false, gh: false, login: false, repo: false, push: false }) },
  noRemote: { ...base, remote: null, upstream: null, ahead: null, behind: null, gh: { installed: true, authenticated: false },
    steps: STEPS({ git: true, gh: true, login: false, repo: false, push: false }) },
  ahead: { ...base, remote: { name: 'origin', url: 'https://github.com/someone/memo.git', github: true }, upstream: 'origin/main', ahead: 2,
    steps: STEPS({ git: true, gh: true, login: true, repo: true, push: false }) },
  never: { ...base, remote: { name: 'origin', url: 'https://github.com/someone/memo.git', github: true }, upstream: null, ahead: null, behind: null,
    steps: STEPS({ git: true, gh: true, login: true, repo: true, push: false }) },
  synced: { ...base, remote: { name: 'origin', url: 'https://github.com/someone/memo.git', github: true }, upstream: 'origin/main', ahead: 0,
    steps: STEPS({ git: true, gh: true, login: true, repo: true, push: true }) },
};

async function withGit(fn, { state, onPush } = {}) {
  let current = state;
  const pushes = [];
  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const srv = await serveStatic(WEB, {
    'GET /api/state': (req, res) => json(res, 200, fixture),
    'GET /api/stream': (req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.write('event: hello\ndata: {}\n\n'); },
    'GET /api/party': (req, res) => json(res, 200, { ok: true, running: false, code: null, log: '', tactic: null, agent: 'claude', parallel: 2, allow_listen: false }),
    'GET /api/git': (req, res) => (current ? json(res, 200, STATES[current]) : json(res, 404, { ok: false, code: 'E_NOT_FOUND', error: 'not found' })),
    'POST /api/git/push': async (req, res) => {
      pushes.push({ masume: req.headers['x-masume'] });
      await new Promise((r) => setTimeout(r, 300)); // 送っているあいだ
      const out = onPush ? onPush() : { status: 200, body: { ok: true, remote: 'origin', branch: 'main', commit: 'a'.repeat(40), ahead: 0, output: '' }, next: 'synced' };
      if (out.next) current = out.next;
      json(res, out.status, out.body);
    },
  });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 15000 });
    await fn(page, pushes, (s) => (current = s));
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

const panel = `JSON.stringify((() => {
  const p = document.querySelector('#git-panel');
  if (!p) return null;
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const btn = document.querySelector('#git-push');
  return {
    visible: vis(p), state: p.dataset.state, text: p.innerText,
    steps: [...p.querySelectorAll('#git-guide li[data-step]')].map((li) => ({ id: li.dataset.step, done: li.dataset.done, code: [...li.querySelectorAll('code')].map((c) => c.textContent.trim()) })),
    remote: document.querySelector('#git-remote')?.innerText ?? null,
    ahead: document.querySelector('#git-ahead')?.innerText ?? null,
    button: btn ? { visible: vis(btn), disabled: btn.disabled } : null,
  };
})())`;
const read = async (page) => JSON.parse(await page.eval(panel));

test('§56.4 Git の外（#git-panel[data-state=outside]）は git init の手引き', { timeout: 120000 }, async () => {
  await withGit(async (page) => {
    await page.waitFor(`document.querySelector('#git-panel')?.dataset.state === 'outside'`, { timeout: 10000, message: 'outside' });
    const p = await read(page);
    assert.ok(p.visible, '#git-panel が見える');
    assert.match(p.text, /git init/);
  }, { state: 'outside' });
});

test('§56.4 リモートが無いときの手引き（#git-guide）は steps の順。まだの手引きのコマンドを <code> で', { timeout: 120000 }, async () => {
  await withGit(async (page) => {
    await page.waitFor(`document.querySelector('#git-panel')?.dataset.state === 'no-remote'`, { timeout: 10000, message: 'no-remote' });
    const p = await read(page);
    const steps = STATES.noRemote.steps;
    assert.deepEqual(p.steps.map((s) => [s.id, s.done]), steps.map((s) => [s.id, String(s.done)]), '手引きは steps の順と done');
    for (const s of steps) {
      if (!s.done && s.command) assert.ok(p.steps.find((x) => x.id === s.id).code.includes(s.command), `${s.id} のコマンド ${s.command}`);
    }
    assert.match(p.text, /https:\/\/cli\.github\.com\//);
  }, { state: 'noRemote' });
});

test('§56.4 送っていないセーブ（#git-ahead）と送るボタン（#git-push）。押すと X-Masume 付きで POST し、送り終えたら synced（押せない）', { timeout: 120000 }, async () => {
  await withGit(async (page, pushes) => {
    await page.waitFor(`document.querySelector('#git-panel')?.dataset.state === 'unpushed'`, { timeout: 10000, message: 'unpushed' });
    let p = await read(page);
    assert.ok(p.remote.includes('https://github.com/someone/memo.git'), `#git-remote にリモート: ${p.remote}`);
    assert.match(p.ahead, /GitHub に送っていないセーブ: 2/);
    assert.ok(p.button && p.button.visible && !p.button.disabled, '#git-push が押せる');
    await page.eval(`document.querySelector('#git-push').click()`);
    await waitUntil(() => pushes.length === 1, { message: 'POST /api/git/push' });
    assert.equal(pushes[0].masume, '1', 'X-Masume: 1');
    assert.equal(await page.eval(`document.querySelector('#git-push').disabled`), true, '送っているあいだは押せない');
    await page.waitFor(`document.querySelector('#git-panel').dataset.state === 'synced'`, { timeout: 10000, message: '送り終えたら synced' });
    p = await read(page);
    assert.match(p.ahead, /GitHub に送っていないセーブ: 0/);
    assert.equal(p.button?.disabled ?? true, true, 'synced では押せない');
    await page.waitFor(`document.querySelectorAll('#toast .toast').length > 0`, { message: '結果を知らせる' });
    assert.equal(pushes.length, 1, '1回だけ送った');
  }, { state: 'ahead' });
});

test('§56.4 まだ一度も送っていない（上流が無い）ときも押せる。送れなければ知らせて、押せる状態に戻る', { timeout: 120000 }, async () => {
  let n = 0;
  await withGit(async (page, pushes) => {
    await page.waitFor(`document.querySelector('#git-panel')?.dataset.state === 'unpushed'`, { timeout: 10000, message: 'unpushed' });
    const p = await read(page);
    assert.match(p.ahead, /まだ一度も送っていない/);
    await page.eval(`document.querySelector('#git-push').click()`);
    await waitUntil(() => pushes.length === 1, { message: 'POST /api/git/push' });
    await page.waitFor(`document.querySelectorAll('#toast .toast').length > 0`, { message: '送れなかったことを知らせる' });
    await page.waitFor(`document.querySelector('#git-push').disabled === false`, { timeout: 10000, message: 'もう一度押せる' });
    assert.equal(await page.eval(`document.querySelector('#git-panel').dataset.state`), 'unpushed');
  }, {
    state: 'never',
    onPush: () => (n++, { status: 409, body: { ok: false, code: 'E_PUSH', error: 'リモートが先に進んでいます（force push はしません）' } }),
  });
});

test('§56.4 GET /api/git が取れなければ、セーブの欄（#git-panel）を出さない', { timeout: 120000 }, async () => {
  await withGit(async (page) => {
    await new Promise((r) => setTimeout(r, 1500));
    const p = await read(page);
    assert.ok(p === null || p.visible === false, '#git-panel は見えない');
  }, { state: null });
});
