// S12「アプリの起動役（gridhub app）」— 伝令（第16章）。CONTRACTS §68。
// はじめの画面の中身（web/start.html）は盤面の担当なので、GET / は startApp に別の web を渡して確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, tmp, newToy, getJson, waitUntil, startApp, startGridhub, postJson, listening, pathWith,
} from '../helpers8.mjs';

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

test('§68.1・§68.3 startApp は web の start.html を / に配り、ほかは web から。gridhub app は1行目に URL を出す', { timeout: 60000 }, async () => {
  const web = tmp('gridhub-s12-web-');
  writeFileSync(join(web, 'start.html'), '<!doctype html><title>はじめ</title><p id="probe">はじめの画面</p>');
  mkdirSync(join(web, 'board'));
  writeFileSync(join(web, 'board', 'x.css'), 'body{}');
  const { startApp: start } = await import('../../src/server/app.js');
  const app = await start({ port: 0, host: '127.0.0.1', home: tmp('gridhub-s12-home-'), play: tmp('gridhub-s12-play-'), webRoot: web });
  try {
    const top = await fetch(app.url);
    assert.equal(top.status, 200);
    assert.match(top.headers.get('content-type'), /text\/html/);
    assert.match(await top.text(), /id="probe"/);
    assert.equal((await fetch(new URL('board/x.css', app.url))).status, 200);
    assert.equal((await fetch(new URL('../etc/passwd', app.url))).status, 404);
  } finally {
    await app.stop();
  }
  const cli = await startApp();
  try {
    assert.match(cli.output().split('\n')[0], /^GridHub: http:\/\/127\.0\.0\.1:\d+\/$/);
  } finally {
    await cli.stop();
  }
});

test('§68.4 GET /api/app: 版・Node・claude（PATH の中）・in_app・home・play・最近のフォルダ（はじめは空）', { timeout: 60000 }, async () => {
  const withClaude = await startApp({ claude: true, inApp: true });
  try {
    const { status, body } = await getJson(`${withClaude.url}/api/app`);
    assert.equal(status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.version, PKG.version);
    assert.equal(body.node, process.versions.node);
    assert.equal(body.in_app, true);
    assert.deepEqual(body.claude, { found: true, path: withClaude.path.claude });
    assert.equal(body.home, withClaude.home);
    assert.equal(body.play, withClaude.play);
    assert.deepEqual(body.recent, []);
    assert.equal(body.current, null);
  } finally {
    await withClaude.stop();
  }
  const without = await startApp({ claude: false });
  try {
    const { body } = await getJson(`${without.url}/api/app`);
    assert.deepEqual(body.claude, { found: false, path: null });
    assert.equal(body.in_app, false);
  } finally {
    await without.stop();
  }
});

test('§68.5 POST /api/app/open: X-Masume が要る・絶対パスでなければ 400・無いフォルダは 404。冒険の書が無ければ入口、あれば盤面。前の盤面は止まる', { timeout: 90000 }, async () => {
  const app = await startApp();
  try {
    const empty = tmp('gridhub-s12-empty-');
    assert.equal((await postJson(`${app.url}/api/app/open`, { dir: empty }, { masume: false })).status, 403);
    const relative = await postJson(`${app.url}/api/app/open`, { dir: 'some/where' });
    assert.equal(relative.status, 400);
    assert.equal(relative.body.code, 'E_USAGE');
    const missing = await postJson(`${app.url}/api/app/open`, { dir: join(empty, 'nai') });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, 'E_NO_DIR');

    const lobby = await postJson(`${app.url}/api/app/open`, { dir: empty });
    assert.equal(lobby.status, 200, lobby.text);
    assert.equal(lobby.body.ok, true);
    assert.equal(lobby.body.dir, empty);
    assert.equal(lobby.body.has_game, false);
    const lobbyUrl = new URL(lobby.body.url);
    assert.equal(lobbyUrl.hostname, '127.0.0.1');
    assert.equal(lobbyUrl.searchParams.get('home'), `${app.url}/`);
    assert.equal((await getJson(new URL('/api/health', lobbyUrl))).status, 200);
    const state = await getJson(new URL('/api/state', lobbyUrl));
    assert.equal(state.status, 404, '入口（冒険の書がまだ無い）');
    assert.equal(state.body.code, 'E_NO_GAME');

    const game = newToy();
    const board = await postJson(`${app.url}/api/app/open`, { dir: game });
    assert.equal(board.status, 200, board.text);
    assert.equal(board.body.has_game, true);
    const view = await getJson(new URL('/api/state', board.body.url));
    assert.equal(view.status, 200);
    assert.ok(view.body.characters.length > 0, '盤面');
    await waitUntil(async () => !(await listening(lobby.body.url)), { timeout: 10000, message: '前の盤面のサーバーが止まる' });
    const now = await getJson(`${app.url}/api/app`);
    assert.deepEqual(now.body.current, { dir: game, url: board.body.url });
  } finally {
    await app.stop();
  }
});

test('§68.5・§68.7 最近のフォルダ: 新しい順・同じ場所は1つ・最大10件・recent.json に残り、起こし直しても読める。forget で外す。消えたフォルダは missing', { timeout: 120000 }, async () => {
  const first = await startApp();
  const dirs = Array.from({ length: 12 }, (_, i) => tmp(`gridhub-s12-r${i}-`));
  try {
    for (const dir of dirs) assert.equal((await postJson(`${first.url}/api/app/open`, { dir })).status, 200);
    assert.equal((await postJson(`${first.url}/api/app/open`, { dir: dirs[5] })).status, 200);
    const { body } = await getJson(`${first.url}/api/app`);
    const listed = body.recent.map((r) => r.dir);
    assert.equal(listed.length, 10, '最大10件');
    assert.equal(listed[0], dirs[5], 'いちばん新しいのが先頭');
    assert.equal(new Set(listed).size, listed.length, '同じ場所は1つ');
    assert.deepEqual(listed.slice(1, 4), [dirs[11], dirs[10], dirs[9]]);
    assert.ok(!listed.includes(dirs[0]) && !listed.includes(dirs[1]), '古いものから落ちる');
    for (const r of body.recent) {
      assert.equal(r.has_game, false);
      assert.equal(r.missing, false);
      assert.equal(typeof r.name, 'string');
    }
    assert.ok(existsSync(join(first.home, 'recent.json')), 'recent.json');
  } finally {
    await first.stop();
  }
  renameSync(dirs[11], `${dirs[11]}-moved`);
  const second = await startApp({ home: first.home, play: first.play });
  try {
    let { body } = await getJson(`${second.url}/api/app`);
    assert.equal(body.recent[0].dir, dirs[5], '起こし直しても読める');
    assert.equal(body.recent.find((r) => r.dir === dirs[11]).missing, true, '消えたフォルダ');
    const forget = await postJson(`${second.url}/api/app/forget`, { dir: dirs[5] });
    assert.equal(forget.status, 200);
    assert.ok(!forget.body.recent.some((r) => r.dir === dirs[5]));
    ({ body } = await getJson(`${second.url}/api/app`));
    assert.ok(!body.recent.some((r) => r.dir === dirs[5]), 'forget で外れた');
  } finally {
    await second.stop();
  }
});

test('§68.6 POST /api/app/tutorial: play の下にチュートリアル（2回目は「チュートリアル 2」）を写し、冒険の書を作って盤面を開く', { timeout: 90000 }, async () => {
  const app = await startApp();
  try {
    const one = await postJson(`${app.url}/api/app/tutorial`, {});
    assert.equal(one.status, 200, one.text);
    assert.equal(one.body.dir, join(app.play, 'チュートリアル'));
    assert.equal(one.body.has_game, true);
    for (const f of ['tutorial.map.json', 'SOLUTIONS.json', 'checks/hello.mjs', '.masume/log.jsonl']) assert.ok(existsSync(join(one.body.dir, f)), f);
    const view = await getJson(new URL('/api/state', one.body.url));
    assert.equal(view.status, 200);
    assert.equal(view.body.quest.id, 'TUT');
    const two = await postJson(`${app.url}/api/app/tutorial`, {});
    assert.equal(two.body.dir, join(app.play, 'チュートリアル 2'));
    const { body } = await getJson(`${app.url}/api/app`);
    assert.deepEqual(body.recent.slice(0, 2).map((r) => [r.dir, r.has_game, r.title]), [
      [two.body.dir, true, view.body.quest.title], [one.body.dir, true, view.body.quest.title],
    ]);
  } finally {
    await app.stop();
  }
});

test('§68.2 命綱: --lifeline なら標準入力を閉じると止まり、開いていた盤面のサーバーも止まる。SIGTERM でも止まる。gridhub serve --lifeline も同じ', { timeout: 90000 }, async () => {
  const app = await startApp({ lifeline: true });
  const opened = await postJson(`${app.url}/api/app/open`, { dir: newToy() });
  assert.equal(opened.status, 200);
  assert.equal(await listening(opened.body.url), true);
  app.proc.stdin.end();
  const code = await Promise.race([app.exited, new Promise((r) => setTimeout(() => r('timeout'), 15000))]);
  assert.notEqual(code, 'timeout', `標準入力を閉じたら止まる\n${app.output()}`);
  assert.equal(await listening(app.url), false, '起動役が止まる');
  assert.equal(await listening(opened.body.url), false, '盤面のサーバーも止まる');

  const term = await startApp({ lifeline: true });
  term.proc.kill('SIGTERM');
  assert.notEqual(await Promise.race([term.exited, new Promise((r) => setTimeout(() => r('timeout'), 15000))]), 'timeout', 'SIGTERM で止まる');

  const serve = await startGridhub(['serve', '--port', '0', '--lifeline', '--dir', newToy()], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH } });
  serve.proc.stdin.end();
  assert.notEqual(await Promise.race([serve.exited, new Promise((r) => setTimeout(() => r('timeout'), 15000))]), 'timeout', 'serve --lifeline も止まる');
  assert.equal(await listening(serve.url), false);
});
