// X1: 世界（CONTRACTS §83 / OVERLAY.md v1 §§1–8）。外部パッケージ・本物の手帳は使わない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { networkInterfaces } from 'node:os';
import {
  tmp, gridhub, setupDungeon, dungeonMap, passAll, setCases, waitUntil, openBrowserWith,
  fakeCodecity, launchWorld,
} from '../helpers-world.mjs';
import { startServeEnv } from '../helpers2.mjs';
import { adventureOverlay, boundOverlay, readAdventure } from '../../src/engine/world.js';
import { startServer } from '../../src/server/index.js';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const overlayFile = dir => join(dir, '.masume', 'world-overlay.json');
const diagnosticsFile = dir => join(dir, '.masume', 'world-overlay.diagnostics.json');
const post = (url, body = {}, headers = {}) => fetch(`${url.replace(/\/$/u, '')}/api/world`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1', ...headers }, body: JSON.stringify(body),
});

function game(t, { map = dungeonMap(), name } = {}) {
  const dir = tmp('gridhub-x1-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  setupDungeon(dir, { map });
  if (name) writeFileSync(join(dir, 'package.json'), JSON.stringify({ name }));
  const result = gridhub(['new', 'dungeon.map.json'], { cwd: dir });
  assert.equal(result.code, 0, result.all);
  return dir;
}
function writeOverlay(dir, extra = []) {
  const result = gridhub(['world', '--overlay', '--dir', dir, ...extra]);
  assert.equal(result.code, 0, result.all);
  return readJson(overlayFile(dir));
}

// 生成実装とは独立に、合意した v1 の境界を検査する。
function validOverlay(value) {
  assert.equal(value.version, 1);
  assert.equal(Object.hasOwn(value, 'unplaced'), false);
  assert.ok(Buffer.byteLength(JSON.stringify(value, null, 2) + '\n') <= 1_000_000);
  assert.ok(value.markers.length <= 2000);
  assert.ok(value.people.length <= 100);
  const groupIds = new Set(value.groups.map(g => g.id));
  assert.equal(groupIds.size, value.groups.length);
  const all = [...value.markers, ...value.people, ...(value.goal?.id ? [value.goal] : [])];
  assert.equal(new Set(all.map(item => item.id)).size, all.length);
  const markerIds = new Set(value.markers.map(m => m.id));
  const text = (s, max) => { assert.equal(typeof s, 'string'); assert.ok([...s].length <= max); assert.doesNotMatch(s, /[\r\n\0]/u); };
  for (const g of value.groups) {
    text(g.label, 60);
    assert.ok(g.paths.every(p => !p.startsWith('/') && !p.split('/').includes('..')));
  }
  for (const item of all) {
    text(item.label ?? item.name, 60);
    assert.ok((item.lines || []).length <= 6);
    for (const line of item.lines || []) text(line, 80);
    assert.equal(Object.keys(item.at).length, 1);
    assert.ok(['path', 'group', 'landmark', 'building', ...(value.people.includes(item) ? ['marker'] : [])].includes(Object.keys(item.at)[0]));
    if (item.at.group) assert.ok(groupIds.has(item.at.group));
    if (item.at.marker) assert.ok(markerIds.has(item.at.marker));
  }
  for (const marker of value.markers) {
    assert.ok(['record', 'board', 'gate'].includes(marker.kind));
    if (marker.kind === 'record') assert.ok(['passed', 'failed', 'unverified'].includes(marker.state));
  }
  if (value.title) { text(value.title.text, 60); text(value.title.sub, 80); }
}

test('種は初回だけ決まり、package.name・題・記録が変わっても変わらない。無ければフォルダ名', t => {
  const dir = game(t, { name: 'fixed-town' });
  assert.equal(existsSync(join(dir, '.masume', 'world.json')), false);
  const first = writeOverlay(dir);
  assert.equal(first.seed, 'fixed-town');
  assert.deepEqual(readJson(join(dir, '.masume', 'world.json')), { seed: 'fixed-town' });
  assert.deepEqual(writeOverlay(dir), first);
  writeFileSync(join(dir, 'package.json'), '{"name":"renamed-package"}');
  const map = dungeonMap();
  map.quest.title = '題だけを直した';
  writeFileSync(join(dir, 'renamed.json'), JSON.stringify(map));
  const amended = gridhub(['amend', join(dir, 'renamed.json'), '--dir', dir]);
  assert.equal(amended.code, 0, amended.all);
  const renamed = writeOverlay(dir);
  assert.equal(renamed.seed, first.seed);
  assert.equal(renamed.title.text, map.quest.title);
  assert.deepEqual(renamed.groups, first.groups);
  const unnamed = game(t);
  assert.equal(writeOverlay(unnamed).seed, basename(unnamed));
});

test('読めない・壊れた world.json は E_WORLD。設定と直前の正常な overlay を上書きしない', t => {
  const dir = game(t);
  writeOverlay(dir);
  const before = readFileSync(overlayFile(dir), 'utf8');
  const seed = join(dir, '.masume', 'world.json');
  for (const bad of ['{', 'null', '[]', '{}', '{"seed":0}', '{"seed":""}']) {
    writeFileSync(seed, bad);
    const result = gridhub(['world', '--overlay', '--dir', dir]);
    assert.equal(result.code, 2);
    assert.match(result.err, /\[E_WORLD\]/u);
    assert.equal(readFileSync(seed, 'utf8'), bad);
    assert.equal(readFileSync(overlayFile(dir), 'utf8'), before);
  }
  rmSync(seed);
  mkdirSync(seed);
  assert.match(gridhub(['world', '--overlay', '--dir', dir]).err, /\[E_WORLD\]/u);
});

test('overlay は v1。通過を除き、落ちた・まだ・担当の掲示板・現在地・承認と目的地を載せる', t => {
  const dir = game(t);
  mkdirSync(join(dir, 'a'));
  writeFileSync(join(dir, 'a', 'store.js'), '// territory\n');
  const original = writeOverlay(dir);
  validOverlay(original);
  assert.deepEqual(original.groups.map(g => g.paths), [['a/**'], ['b/**', 'shared/{b1,b2}.txt'], []]);
  assert.equal(original.markers.find(m => m.id === 'A1').at.path, 'a/store.js');
  assert.deepEqual(original.markers.find(m => m.id === 'H1').at, { landmark: 'town_hall' });
  assert.deepEqual(original.goal.at, { landmark: 'town_hall' });
  assert.equal(original.goal.look, 'castle', '§83.2: 目的地には魔王の城の候補の絵を頼む');
  assert.equal(original.markers.filter(m => m.kind === 'board').length, 3);
  setCases(dir, 'A1', { 'x が 1': true, 'y が 2': false });
  assert.equal(gridhub(['step', 'a', '--dir', dir]).code, 1);
  const failed = writeOverlay(dir);
  assert.equal(failed.markers.find(m => m.id === 'A1').state, 'failed');
  assert.equal(failed.markers.find(m => m.id === 'B1').state, 'unverified');
  // 1つの記録で変わったマスと担当だけが変わる。町の種・地区・ほかの担当は同じ。
  const keyed = items => new Map(items.map(item => [item.id, item]));
  const prevMarkers = keyed(original.markers);
  assert.deepEqual(failed.markers.filter(m => JSON.stringify(m) !== JSON.stringify(prevMarkers.get(m.id))).map(m => m.id), ['A1', 'board-a']);
  const prevPeople = keyed(original.people);
  assert.deepEqual(failed.people.filter(p => JSON.stringify(p) !== JSON.stringify(prevPeople.get(p.id))).map(p => p.id), ['a']);
  assert.deepEqual(failed.groups, original.groups);
  assert.equal(failed.seed, original.seed);
  assert.deepEqual(failed.goal, original.goal);
  passAll(dir, 'A1');
  assert.equal(gridhub(['step', 'a', '--dir', dir]).code, 0);
  const passed = writeOverlay(dir);
  assert.equal(passed.markers.some(m => m.id === 'A1'), false);
  assert.deepEqual(passed.people.find(p => p.id === 'a').at, { group: 'a' });
  validOverlay(passed);
  const dev = writeOverlay(dir, ['--words', 'dev']);
  assert.match(dev.markers.find(m => m.id === 'board-a').lines[0], /タスク/u);
  assert.match(dev.people.find(p => p.id === 'b').lines[0], /タスク/u);
  assert.doesNotMatch(dev.people.find(p => p.id === 'b').lines.join(' '), /モンスター/u);
});

test('置けない物は診断へ。ID は人・札・目的地で一意、group は別。文字・件数・1MB を守る', t => {
  const dir = game(t);
  const input = readAdventure(dir);
  // 入力の task ID が担当 ID と同じでも衝突させず、通過後も残りの ID を変えない。
  input.view.nodes.a = { ...input.view.nodes.A1, id: 'a', check: { kind: 'cmd', run: 'node missing.mjs' } };
  const result = adventureOverlay(input);
  assert.ok(result.diagnostics.some(d => d.id === 'marker-a'));
  assert.equal(result.overlay.markers.some(m => m.id === 'marker-a'), false);
  validOverlay(result.overlay);
  const raw = result.overlay;
  raw.title.text = '😀'.repeat(61);
  raw.title.sub = '題'.repeat(81);
  raw.markers = Array.from({ length: 2002 }, (_, i) => ({
    id: `m${i}`, kind: 'record', state: 'unverified', at: { group: 'a' },
    label: '😀'.repeat(61), lines: Array.from({ length: 7 }, () => '漢'.repeat(81)),
  }));
  raw.people = Array.from({ length: 102 }, (_, i) => ({
    id: `p${i}`, name: '😀'.repeat(61), at: { marker: 'm2001' }, lines: [], _group: 'a',
  }));
  const bounded = boundOverlay(raw);
  validOverlay(bounded.overlay);
  assert.equal([...bounded.overlay.title.text].length, 60);
  assert.equal(bounded.overlay.people.length, 100);
  assert.deepEqual(bounded.overlay.people[0].at, { group: 'a' });
  assert.ok(bounded.diagnostics.some(d => /2000/u.test(d.reason)));
  assert.ok(bounded.diagnostics.some(d => /100/u.test(d.reason)));
  assert.ok(bounded.diagnostics.some(d => /1MB/u.test(d.reason)));
  raw.seed = 'x'.repeat(1_000_000);
  assert.throws(() => boundOverlay(raw), { code: 'E_WORLD' });

  // 実際の CLI でも代表ファイルが無い task の診断を別ファイルに残す。
  const map = dungeonMap();
  map.nodes.A1.check = { kind: 'cmd', run: 'node missing.mjs' };
  const missing = game(t, { map });
  const overlay = writeOverlay(missing);
  assert.equal(overlay.markers.some(m => m.id === 'A1'), false);
  assert.ok(readJson(diagnosticsFile(missing)).some(d => d.id === 'A1' && d.reason));
});

test('--out は指定ファイルへ書く。正本と種はリンク経由でも上書きできない', t => {
  const dir = game(t);
  const output = join(dir, 'export', 'overlay.json');
  assert.equal(gridhub(['world', '--overlay', '--dir', dir, '--out', output]).code, 0);
  validOverlay(readJson(output));
  const log = join(dir, '.masume', 'log.jsonl'), before = readFileSync(log, 'utf8');
  symlinkSync(join(dir, '.masume'), join(dir, 'record-link'), 'dir');
  for (const out of [log, join(dir, 'record-link', 'log.jsonl'), join(dir, '.masume', 'world.json')]) {
    const result = gridhub(['world', '--overlay', '--dir', dir, '--out', out]);
    assert.match(result.err, /\[E_WORLD\]/u);
  }
  assert.equal(readFileSync(log, 'utf8'), before);
});

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

for (const mode of ['normal', 'shift']) test(`CLI は解析行の後の URL を使う（${mode}）。更新に追随し、命綱で親子が止まる`, { timeout: 25_000 }, async t => {
  const dir = game(t), fake = fakeCodecity({ mode });
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const requested = await freePort();
  const session = launchWorld(dir, ['--port', String(requested), '--codecity', fake, '--lifeline'], { GRIDHUB_CODECITY: '/does/not/exist' });
  t.after(() => session.stop());
  const url = await session.ready();
  assert.equal(session.output().split('\n')[0], `世界: ${url}`);
  const args = readJson(join(fake, 'args.json'));
  assert.deepEqual(args.args, [dir, '--overlay', overlayFile(dir), '--port', String(requested)]);
  assert.equal(url, readFileSync(join(fake, 'url'), 'utf8'));
  if (mode === 'normal') assert.equal(new URL(url).port, String(requested));
  else assert.notEqual(new URL(url).port, String(requested));
  const before = readJson(overlayFile(dir));
  passAll(dir, 'A1');
  assert.equal(gridhub(['step', 'a', '--dir', dir]).code, 0);
  await waitUntil(() => readJson(overlayFile(dir)).source.seq > before.source.seq);
  const after = readJson(overlayFile(dir));
  assert.equal(after.markers.some(m => m.id === 'A1'), false);
  assert.equal(after.seed, before.seed);
  session.proc.stdin.end();
  assert.deepEqual(await session.exited, { code: 0, signal: null });
  assert.ok(existsSync(join(fake, 'stopped')));
  assert.throws(() => process.kill(args.pid, 0), { code: 'ESRCH' });
});

test('CLI は codecity 不在なら E_NO_CODECITY、先に終了・30秒無応答なら末尾を添えた E_WORLD', { timeout: 45_000 }, async t => {
  const dir = game(t);
  const absent = gridhub(['world', '--dir', dir], { env: { GRIDHUB_CODECITY: '' } });
  assert.equal(absent.code, 2);
  assert.match(absent.err, /\[E_NO_CODECITY\] codecity が見つかりません。--codecity か GRIDHUB_CODECITY で場所を渡してください/u);
  for (const mode of ['early', 'silent']) {
    const fake = fakeCodecity({ mode });
    t.after(() => rmSync(fake, { recursive: true, force: true }));
    const session = launchWorld(dir, [], { GRIDHUB_CODECITY: fake });
    t.after(() => session.stop());
    const exit = await session.exited;
    assert.equal(exit.code, 2);
    assert.equal(session.output(), '');
    assert.match(session.error(), /\[E_WORLD\]/u);
    assert.match(session.error(), /地面: 準備完了/u);
    if (mode === 'early') assert.match(session.error(), /試験用の起動失敗/u);
    else {
      assert.match(session.error(), /30秒/u);
      assert.ok(existsSync(join(fake, 'stopped')));
    }
  }
});

for (const signal of ['SIGINT', 'SIGTERM', 'lifeline']) test(`URL を待つ途中でも ${signal} で親子を停止する`, { timeout: 15_000 }, async t => {
  const dir = game(t), fake = fakeCodecity({ delay: 60_000 });
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const session = launchWorld(dir, ['--codecity', fake, '--lifeline']);
  t.after(() => session.stop());
  await waitUntil(() => existsSync(join(fake, 'url')));
  if (signal === 'lifeline') session.proc.stdin.end();
  else session.proc.kill(signal);
  assert.deepEqual(await session.exited, { code: 0, signal: null });
  assert.equal(session.output(), '');
  assert.ok(existsSync(join(fake, 'stopped')));
});

test('POST /api/world は同時・2回目とも同じ URL。停止で子も終了し、再起動できる', { timeout: 30_000 }, async t => {
  const dir = game(t), fake = fakeCodecity({ delay: 100 });
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const server = await startServeEnv(dir, { GRIDHUB_CODECITY: fake, MASUME_GH: '/does/not/exist' });
  t.after(() => server.stop());
  const [first, second] = await Promise.all([post(server.url), post(server.url)]);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  const one = await first.json(), two = await second.json();
  assert.equal(one.ok, true);
  assert.deepEqual(two, one);
  assert.deepEqual(await (await post(server.url)).json(), one);
  assert.equal(readFileSync(join(fake, 'starts'), 'utf8'), 'start\n');
  const pid = readJson(join(fake, 'args.json')).pid;
  process.kill(pid, 'SIGTERM');
  await waitUntil(() => { try { process.kill(pid, 0); return false; } catch { return true; } });
  const restarted = await post(server.url);
  assert.equal(restarted.status, 200);
  assert.equal(readFileSync(join(fake, 'starts'), 'utf8'), 'start\nstart\n');
  const secondPid = readJson(join(fake, 'args.json')).pid;
  await server.stop();
  assert.throws(() => process.kill(secondPid, 0), { code: 'ESRCH' });
});

test('POST /api/world は不在なら404、ヘッダ・Origin・JSON とループバックの作法を守る', { timeout: 20_000 }, async t => {
  const dir = game(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const missing = await startServeEnv(dir, { GRIDHUB_CODECITY: '' });
  t.after(() => missing.stop());
  const result = await post(missing.url);
  assert.equal(result.status, 404);
  assert.equal((await result.json()).code, 'E_NO_CODECITY');
  assert.equal((await post(missing.url, {}, { 'x-masume': '' })).status, 403);
  assert.equal((await post(missing.url, {}, { origin: 'http://example.invalid' })).status, 403);
  assert.equal((await post(missing.url, [])).status, 400);
  const malformed = await fetch(`${missing.url}/api/world`, { method: 'POST', headers: { 'x-masume': '1' }, body: '{' });
  assert.equal(malformed.status, 400);
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  if (!lan) { t.diagnostic('LAN IPv4 が無いため LAN 実接続だけ未実施'); return; }
  const previous = process.env.GRIDHUB_CODECITY;
  process.env.GRIDHUB_CODECITY = fake;
  const server = await startServer({ root: dir, port: 0, host: '0.0.0.0', home: process.env.GRIDHUB_APP_HOME });
  t.after(async () => {
    await server.stop();
    if (previous === undefined) delete process.env.GRIDHUB_CODECITY;
    else process.env.GRIDHUB_CODECITY = previous;
  });
  const far = await post(`http://${lan}:${server.port}`);
  assert.equal(far.status, 403);
  assert.equal((await far.json()).code, 'E_FORBIDDEN');
  assert.equal(existsSync(join(fake, 'args.json')), false);
  assert.equal((await fetch(`http://${lan}:${server.port}/api/state`)).status, 200);
});

test('Chrome の「世界」は POST を送り、新しいタブを開く。レーン・ノートを保ち、不在時は設定欄を出す', { timeout: 60_000 }, async t => {
  const dir = game(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const server = await startServeEnv(dir, { GRIDHUB_CODECITY: fake, MASUME_GH: '/does/not/exist' });
  t.after(() => server.stop());
  const page = await openBrowserWith({ width: 1440, height: 900 });
  t.after(() => page.close());
  await page.goto(`${server.url}/`);
  await page.waitFor('window.__masume?.ready', { timeout: 20_000 });
  assert.equal(await page.eval(`document.querySelector('#mode-switch #world-open')?.textContent`), '世界');
  // 実際の fetch と window.open を通し、戻り値だけ控える（通信・タブは偽物にしない）。
  await page.eval(`window.__worldPosts = []; window.__worldTabs = [];
    { const originalFetch = window.fetch; window.fetch = (...args) => {
      if (String(args[0]).endsWith('api/world')) window.__worldPosts.push(args);
      return originalFetch(...args);
    }; const originalOpen = window.open; window.open = (...args) => {
      const tab = originalOpen(...args); window.__worldTabs.push(tab); return tab;
    }; }`);
  const mode = await page.eval('window.__masume.mode');
  const clickWorld = async () => {
    const { x, y } = await page.eval(`(() => { const r = document.querySelector('#world-open').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  };
  await clickWorld();
  await page.waitFor(`window.__worldPosts.length === 1 && !document.querySelector('#world-open').disabled`);
  assert.equal(await page.eval(`window.__worldPosts[0][1].method`), 'POST');
  assert.equal(await page.eval(`window.__worldPosts[0][1].headers['x-masume']`), '1');
  assert.equal(await page.eval(`window.__worldTabs.length`), 1);
  assert.equal(await page.eval(`!!window.__worldTabs[0] && !window.__worldTabs[0].closed`), true);
  const worldUrl = readFileSync(join(fake, 'url'), 'utf8');
  await waitUntil(async () => (await page.send('Target.getTargets')).targetInfos.some(target => target.type === 'page' && target.url === worldUrl),
    { message: '新しいタブが codecity の URL を開く' });
  assert.equal(await page.eval('window.__masume.mode'), mode);
  assert.equal(readFileSync(join(fake, 'starts'), 'utf8'), 'start\n');
  await page.eval(`document.querySelector('#mode-switch [data-mode="note"]').click()`);
  assert.equal(await page.eval('window.__masume.mode'), 'note');

  const missing = await startServeEnv(dir, { GRIDHUB_CODECITY: '', MASUME_GH: '/does/not/exist' });
  t.after(() => missing.stop());
  await page.goto(`${missing.url}/`);
  await page.waitFor('window.__masume?.ready', { timeout: 20_000 });
  await clickWorld();
  await page.waitFor(`document.querySelector('#world-codecity')?.hidden === false`);
  assert.equal(await page.eval(`document.querySelector('#toast').textContent.includes('codecity が見つかりません')`), false);
  assert.equal(await page.eval(`document.querySelector('#world-open').disabled`), false);
  assert.deepEqual(page.console.filter(line => line.startsWith('[exception]')), []);
});

// §83.6: それぞれ専用の置き場所で、ほかの判定の設定とも混ざらないようにする。
function settingsHome(t) {
  const home = tmp('gridhub-x1-settings-');
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
}
const remember = (url, body, headers) => fetch(`${url.replace(/\/$/u, '')}/api/world/codecity`, {
  method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1', ...headers }, body: JSON.stringify(body),
});
async function click(page, selector) {
  const { x, y } = await page.eval(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
}

test('§83.6 CLI の場所は --codecity → 環境変数 → settings.json。上位が無効なら下位で起動しない', { timeout: 30_000 }, async t => {
  const dir = game(t), home = settingsHome(t);
  const flag = fakeCodecity(), environment = fakeCodecity(), saved = fakeCodecity();
  for (const fake of [flag, environment, saved]) t.after(() => rmSync(fake, { recursive: true, force: true }));
  const settings = join(home, 'settings.json');
  const contents = JSON.stringify({ codecity: saved, other: { keep: true } });
  writeFileSync(settings, contents);
  const env = { GRIDHUB_APP_HOME: home, GRIDHUB_CODECITY: environment };
  for (const [extra, variables, expected] of [
    [['--codecity', flag], env, flag],
    [[], env, environment],
    [[], { ...env, GRIDHUB_CODECITY: '' }, saved],
  ]) {
    const session = launchWorld(dir, extra, variables);
    t.after(() => session.stop());
    const url = await session.ready();
    assert.equal(url, readFileSync(join(expected, 'url'), 'utf8'));
    assert.match(await (await fetch(url)).text(), /偽の町/u);
    await session.stop();
  }
  for (const [extra, variables] of [
    [['--codecity', join(home, 'missing')], env],
    [[], { ...env, GRIDHUB_CODECITY: join(home, 'missing') }],
  ]) {
    const session = launchWorld(dir, extra, variables);
    t.after(() => session.stop());
    assert.equal((await session.exited).code, 2);
    assert.match(session.error(), /\[E_NO_CODECITY\]/u);
  }
  assert.equal(readFileSync(settings, 'utf8'), contents, '読むだけでは設定を書き換えない');
  for (const fake of [flag, environment, saved]) assert.equal(readFileSync(join(fake, 'starts'), 'utf8'), 'start\n');
});

test('§83.6 保存 API は200・400、ほかの設定を保ち、同じサーバーと再起動後の世界が保存先を使う', { timeout: 25_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const file = join(home, 'settings.json');
  const before = { words: 'dev', future: { nested: [1, 2] }, codecity: '/old/missing' };
  writeFileSync(file, JSON.stringify(before));
  const env = { GRIDHUB_APP_HOME: home, GRIDHUB_CODECITY: '', MASUME_GH: '/does/not/exist' };
  const server = await startServeEnv(dir, env);
  t.after(() => server.stop());
  assert.equal((await post(server.url)).status, 404);
  const folderEntry = join(home, 'directory-entry');
  mkdirSync(join(folderEntry, 'codecity.mjs'), { recursive: true });
  for (const path of [undefined, null, false, 42, {}, [], '', ' ', join(home, 'missing'), folderEntry]) {
    const result = await remember(server.url, { path });
    assert.equal(result.status, 400, JSON.stringify(path));
    assert.equal((await result.json()).code, 'E_NO_CODECITY');
    assert.deepEqual(readJson(file), before);
  }
  for (const body of [[], null, 'folder']) assert.equal((await remember(server.url, body)).status, 400);
  const result = await remember(server.url, { path: fake });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true, path: fake });
  assert.deepEqual(readJson(file), { ...before, codecity: fake });
  assert.equal(existsSync(join(fake, 'starts')), false, '覚えるだけでは起動しない');
  const world = await post(server.url);
  assert.equal(world.status, 200);
  assert.match(await (await fetch((await world.json()).url)).text(), /偽の町/u);
  await server.stop();
  const restarted = await startServeEnv(dir, env);
  t.after(() => restarted.stop());
  assert.equal((await post(restarted.url)).status, 200);
  assert.equal(readFileSync(join(fake, 'starts'), 'utf8'), 'start\nstart\n');
});

test('§83.6 保存 API は X-Masume・Origin・JSON・ループバックを守り、startServer の home にだけ書く', { timeout: 20_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const server = await startServer({ root: dir, port: 0, host: '0.0.0.0', home });
  t.after(() => server.stop());
  const url = `http://127.0.0.1:${server.port}`;
  assert.equal((await remember(url, { path: fake }, { 'x-masume': '' })).status, 403);
  assert.equal((await remember(url, { path: fake }, { origin: 'http://example.invalid' })).status, 403);
  assert.equal((await fetch(`${url}/api/world/codecity`, { method: 'POST', headers: { 'x-masume': '1' }, body: '{' })).status, 400);
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  if (lan) {
    const remote = await remember(`http://${lan}:${server.port}`, { path: fake });
    assert.equal(remote.status, 403);
    assert.equal((await remote.json()).code, 'E_FORBIDDEN');
  } else t.diagnostic('LAN IPv4 が無いため LAN 実接続だけ未実施');
  assert.equal(existsSync(join(home, 'settings.json')), false, '拒否したリクエストは書かない');
  assert.equal((await remember(url, { path: fake }, { origin: url })).status, 200);
  assert.deepEqual(readJson(join(home, 'settings.json')), { codecity: fake });
  const world = await post(url);
  assert.equal(world.status, 200, '指定した home を世界の起動も使う');
  assert.equal((await world.json()).url, readFileSync(join(fake, 'url'), 'utf8'));
});

test('§83.6 壊れた settings.json を保存で消さず、上位の明示指定なら設定を読まずに開ける', { timeout: 20_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const file = join(home, 'settings.json');
  const server = await startServeEnv(dir, { GRIDHUB_APP_HOME: home, GRIDHUB_CODECITY: '' });
  t.after(() => server.stop());
  for (const text of ['{"keep":', '[]', 'null']) {
    writeFileSync(file, text);
    const reply = await remember(server.url, { path: fake });
    assert.equal(reply.ok, false);
    assert.equal((await reply.json()).code, 'E_WORLD');
    assert.equal(readFileSync(file, 'utf8'), text);
  }
  const session = launchWorld(dir, ['--codecity', fake], { GRIDHUB_APP_HOME: home });
  t.after(() => session.stop());
  assert.match(await session.ready(), /^http:\/\/127\.0\.0\.1:/u);
});

test('§83.6 Chrome で不在時の欄に入力して覚えると、世界を再試行して新しいタブで開く', { timeout: 60_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const server = await startServeEnv(dir, { GRIDHUB_APP_HOME: home, GRIDHUB_CODECITY: '', MASUME_GH: '/does/not/exist' });
  t.after(() => server.stop());
  const page = await openBrowserWith({ width: 1280, height: 820 });
  t.after(() => page.close());
  await page.goto(`${server.url}/?words=game`);
  await page.waitFor('window.__masume?.ready');
  await click(page, '#world-open');
  await page.waitFor(`document.querySelector('#world-codecity')?.hidden === false && !document.querySelector('#world-open').disabled`);
  assert.equal(await page.eval(`document.querySelector('#world-codecity-choose').hidden`), true);
  assert.equal(await page.eval(`document.querySelector('#world-codecity-title').textContent`), '世界を開く準備');
  assert.equal(await page.eval(`document.querySelector('#world-codecity-save').textContent`), '覚える');
  assert.equal(await page.eval(`document.querySelector('#world-codecity a').href`), 'https://github.com/M2AI-jp/codecity-inspector');
  assert.match(await page.eval(`document.querySelector('#world-codecity').textContent`), /git clone/u);
  await click(page, '#words-toggle');
  assert.equal(await page.eval(`document.querySelector('#world-codecity-title').textContent`), 'codecity の場所を設定');
  await click(page, '#world-codecity-path');
  await page.send('Input.insertText', { text: join(home, 'missing') });
  await click(page, '#world-codecity-save');
  await page.waitFor(`!document.querySelector('#world-codecity-error').hidden && !document.querySelector('#world-open').disabled`);
  assert.equal(existsSync(join(home, 'settings.json')), false);
  await page.eval(`document.querySelector('#world-codecity-path').value = ''`);
  await click(page, '#world-codecity-path');
  await page.send('Input.insertText', { text: fake });
  await click(page, '#world-codecity-save');
  await page.waitFor(`document.querySelector('#world-codecity').hidden && !document.querySelector('#world-open').disabled`);
  assert.deepEqual(readJson(join(home, 'settings.json')), { codecity: fake });
  const url = readFileSync(join(fake, 'url'), 'utf8');
  await waitUntil(async () => (await page.send('Target.getTargets')).targetInfos.some(target => target.type === 'page' && target.url === url));
  assert.deepEqual(page.console.filter(line => line.startsWith('[exception]')), []);
});

test('§83.6 Chrome のアプリ印ではフォルダ選択を通知し、選択結果を保存して外部ブラウザへ世界を渡す', { timeout: 60_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const chosen = join(home, `codecity の "町" 'フォルダ'`);
  symlinkSync(fake, chosen, 'dir');
  const server = await startServeEnv(dir, { GRIDHUB_APP_HOME: home, GRIDHUB_CODECITY: '', MASUME_GH: '/does/not/exist' });
  t.after(() => server.stop());
  const preload = `window.__posted = []; window.webkit = { messageHandlers: { gridhub: { postMessage(m) { window.__posted.push(JSON.parse(JSON.stringify(m))); } } } };`;
  const page = await openBrowserWith({ width: 1280, height: 820, preload });
  t.after(() => page.close());
  await page.goto(`${server.url}/?app=1`);
  await page.waitFor('window.__masume?.ready');
  await click(page, '#world-open');
  await page.waitFor(`document.querySelector('#world-codecity')?.hidden === false && !document.querySelector('#world-open').disabled`);
  assert.equal(await page.eval(`document.querySelector('#world-codecity-choose').hidden`), false);
  assert.equal(await page.eval(`document.querySelector('#world-codecity-choose').textContent`), 'フォルダを選ぶ');
  await click(page, '#world-codecity-choose');
  assert.deepEqual(await page.eval(`window.__posted.filter(m => m.type === 'codecity')`), [{ type: 'codecity' }]);
  assert.equal(existsSync(join(home, 'settings.json')), false, '選択を通知しただけでは保存しない');
  await page.eval(`window.gridhubApp.codecityChosen(${JSON.stringify(chosen)})`);
  await page.waitFor(`window.__posted.some(m => m.type === 'openExternal')`);
  assert.deepEqual(readJson(join(home, 'settings.json')), { codecity: chosen });
  assert.deepEqual(await page.eval(`window.__posted.filter(m => m.type === 'openExternal')`), [
    { type: 'openExternal', url: readFileSync(join(fake, 'url'), 'utf8') },
  ]);
  assert.equal(await page.eval(`document.querySelector('#world-codecity').hidden`), true);
  assert.deepEqual(page.console.filter(line => line.startsWith('[exception]')), []);
});
