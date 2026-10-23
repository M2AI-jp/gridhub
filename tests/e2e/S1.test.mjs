// S1「盤面を配る」— 伝令の最初のマス。CONTRACTS §8 の createServer。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp, listen, getJson } from '../helpers.mjs';

const { createServer } = await import(pathToFileURL(join(ROOT, 'src', 'server', 'index.js')).href);

function makeWeb() {
  const web = tmp('masume-web-');
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>t</title><p id="marker">MASUME-WEB</p>');
  writeFileSync(join(web, 'board.css'), 'body{color:#1d2b5c}');
  writeFileSync(join(web, 'app.js'), 'export const x = 1;');
  mkdirSync(join(web, 'sub'));
  writeFileSync(join(web, 'sub', 'x.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  writeFileSync(join(web, 'data.json'), '{"a":1}');
  return web;
}

const VIEW = {
  masume: 1,
  quest: { id: 'X', title: 'テスト', goal: 'G' },
  map_version: 1,
  characters: [],
  nodes: {},
  log: [],
  head: { seq: 0, hash: 'ab', commit: null },
  integrity: { ok: true, errors: [] },
  finished: false,
};

test('静的配信・API・健康診断', async () => {
  const web = makeWeb();
  const server = createServer({ webRoot: web, getView: () => VIEW });
  assert.equal(typeof server.stop, 'function', 'stop() がある');
  const base = await listen(server);
  try {
    const root = await getJson(`${base}/`);
    assert.equal(root.status, 200);
    assert.match(root.headers.get('content-type'), /^text\/html/);
    assert.match(root.text, /MASUME-WEB/);

    const css = await getJson(`${base}/board.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /^text\/css/);

    const js = await getJson(`${base}/app.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);

    const svg = await getJson(`${base}/sub/x.svg`);
    assert.equal(svg.status, 200);
    assert.match(svg.headers.get('content-type'), /^image\/svg\+xml/);

    const json = await getJson(`${base}/data.json`);
    assert.match(json.headers.get('content-type'), /^application\/json/);

    const state = await getJson(`${base}/api/state`);
    assert.equal(state.status, 200);
    assert.match(state.headers.get('content-type'), /^application\/json/);
    assert.match(state.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(state.body, VIEW);

    const health = await getJson(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(health.body, { ok: true, masume: 1 });

    const missing = await getJson(`${base}/nope.txt`);
    assert.equal(missing.status, 404);
  } finally {
    await server.stop();
  }
});

test('ディレクトリの外には出られない', async () => {
  const web = makeWeb();
  const server = createServer({ webRoot: web, getView: () => VIEW });
  const base = await listen(server);
  try {
    for (const p of ['/..%2f..%2f..%2f..%2fetc%2fpasswd', '/%2e%2e/%2e%2e/%2e%2e/%2e%2e/etc/passwd', '/sub/..%2f..%2f..%2fetc/passwd']) {
      const r = await getJson(base + p);
      assert.ok([400, 403, 404].includes(r.status), `${p} → ${r.status}`);
      assert.doesNotMatch(r.text, /root:/);
    }
  } finally {
    await server.stop();
  }
});

test('getView は Promise でもよく、例外は 500 の JSON になる', async () => {
  const web = makeWeb();
  const asyncServer = createServer({ webRoot: web, getView: async () => ({ ...VIEW, finished: true }) });
  const base = await listen(asyncServer);
  try {
    const r = await getJson(`${base}/api/state`);
    assert.equal(r.status, 200);
    assert.equal(r.body.finished, true);
  } finally {
    await asyncServer.stop();
  }

  const cursed = createServer({
    webRoot: web,
    getView: () => {
      throw Object.assign(new Error('冒険の書が呪われています'), { code: 'E_CURSED' });
    },
  });
  const base2 = await listen(cursed);
  try {
    const r = await getJson(`${base2}/api/state`);
    assert.equal(r.status, 500);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.code, 'E_CURSED');
  } finally {
    await cursed.stop();
  }
});

test('stop() で確実に閉じる', async () => {
  const web = makeWeb();
  const server = createServer({ webRoot: web, getView: () => VIEW });
  const base = await listen(server);
  await getJson(`${base}/api/health`);
  await server.stop();
  await assert.rejects(fetch(`${base}/api/health`));
});
