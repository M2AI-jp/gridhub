// A1: サーバーを起動して画面を配る（src/server/main.mjs）。ストアはにせ物で差し替える。
import { join, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { runChecks, assert, tmp, startServer, get, ROOT } from './lib/helpers.mjs';

const fakeStore = join(ROOT, 'checks/fixtures/fake-store.mjs');

function rawGet(base, path) {
  const u = new URL(base);
  return new Promise((res, rej) => {
    http.get({ host: u.hostname, port: u.port, path, agent: false }, (r) => {
      let t = '';
      r.on('data', (d) => (t += d));
      r.on('end', () => res({ status: r.statusCode, text: t }));
    }).on('error', rej);
  });
}

{
  const T = tmp();
  const dir = T.dir;
  const web = join(dir, 'web');
  mkdirSync(web);
  writeFileSync(join(web, 'index.html'), '<!doctype html><h1>hello-memo</h1>');
  writeFileSync(join(web, 'app.mjs'), 'export const x = 1;\n');
  writeFileSync(join(web, 'style.css'), 'body{margin:0}\n');
  writeFileSync(join(dir, 'secret.txt'), 'TOP-SECRET');
  const data = join(dir, 'data');

  let srv;
  const steps = [
    ['起動して LISTENING を出す', async () => {
      srv = await startServer({ dataDir: data, webDir: web, storeModule: fakeStore });
      assert.match(srv.base, /^http:\/\/127\.0\.0\.1:\d+$/);
    }, 'api'],
    ['GET /api/health → {ok:true}', async () => {
      const r = await get(srv.base, '/api/health');
      assert.equal(r.status, 200);
      assert.match(r.ct, /application\/json/);
      assert.deepEqual(r.json, { ok: true });
    }, 'api'],
    ['GET / は index.html（text/html; charset=utf-8）', async () => {
      const r = await get(srv.base, '/');
      assert.equal(r.status, 200);
      assert.match(r.ct, /^text\/html;\s*charset=utf-8/i);
      assert.ok(r.text.includes('hello-memo'));
    }, 'api'],
    ['静的ファイルの Content-Type', async () => {
      const js = await get(srv.base, '/app.mjs');
      assert.equal(js.status, 200);
      assert.match(js.ct, /^text\/javascript/i, `.mjs の Content-Type が ${js.ct}`);
      assert.equal(js.text, 'export const x = 1;\n');
      const css = await get(srv.base, '/style.css');
      assert.match(css.ct, /^text\/css/i);
    }, 'api'],
    ['無いファイルは 404', async () => {
      assert.equal((await get(srv.base, '/nope.txt')).status, 404);
    }, 'api'],
    ['web の外は読めない（../ と %2e%2e）', async () => {
      for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/a/../../secret.txt']) {
        const r = await rawGet(srv.base, p);
        assert.ok(!r.text.includes('TOP-SECRET'), `${p} で web の外が読めた`);
        assert.ok([400, 404].includes(r.status), `${p} が ${r.status}`);
      }
    }, 'api'],
    ['未知の /api/ は 404 + E_NO_ROUTE', async () => {
      const r = await get(srv.base, '/api/unknown');
      assert.equal(r.status, 404);
      assert.match(r.ct, /application\/json/);
      assert.equal(r.json.error, 'E_NO_ROUTE');
    }, 'api'],
    ['SIGTERM で終了コード 0', async () => {
      const code = await srv.stop();
      srv = null;
      assert.equal(code, 0, `終了コードが ${code}`);
    }, 'api'],
  ];
  await runChecks(steps, async () => {
    if (srv) await srv.stop();
    T.cleanup();
  });
}
