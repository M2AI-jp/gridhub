// X1: 世界（CONTRACTS §83 / OVERLAY.md v1 §§1–8）。外部パッケージ・本物の手帳は使わない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  tmp, gridhub, setupDungeon, dungeonMap, passAll, setCases, waitUntil, openBrowserWith,
  fakeCodecity, launchWorld,
} from '../helpers-world.mjs';
import { startServeEnv } from '../helpers2.mjs';
import { adventureOverlay, boundOverlay, readAdventure } from '../../src/engine/world.js';

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const overlayFile = dir => join(dir, '.masume', 'world-overlay.json');
const diagnosticsFile = dir => join(dir, '.masume', 'world-overlay.diagnostics.json');

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

test('§83.4 盤面と伝令から世界の入口を外した: ボタン・欄が無く、POST は知らない窓口と同じ 404', { timeout: 60_000 }, async t => {
  const dir = game(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const server = await startServeEnv(dir, { GRIDHUB_CODECITY: fake, MASUME_GH: '/does/not/exist' });
  t.after(() => server.stop());
  const send = path => fetch(`${server.url.replace(/\/$/u, '')}/${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify({ path: fake }),
  });
  const unknown = await send('api/does-not-exist');
  const unknownText = await unknown.text();
  for (const path of ['api/world', 'api/world/codecity']) {
    const result = await send(path);
    assert.equal(result.status, 404, path);
    assert.equal(await result.text(), unknownText, path);
  }
  assert.equal(existsSync(join(fake, 'starts')), false, '盤面の伝令は codecity を起こさない');
  const page = await openBrowserWith({ width: 1440, height: 900 });
  t.after(() => page.close());
  await page.goto(`${server.url}/`);
  await page.waitFor('window.__masume?.ready', { timeout: 20_000 });
  assert.equal(await page.eval(`document.querySelector('#world-open')`), null);
  assert.equal(await page.eval(`document.querySelector('#world-codecity')`), null);
  assert.equal(await page.eval(`typeof window.gridhubApp?.codecityChosen`), 'undefined');
  assert.deepEqual(await page.eval(`[...document.querySelectorAll('#mode-switch button')].map(b => b.dataset.mode)`), ['march', 'note']);
  assert.deepEqual(page.console.filter(line => line.startsWith('[exception]')), []);
});

// §83.6: それぞれ専用の置き場所で、ほかの判定の設定とも混ざらないようにする。
function settingsHome(t) {
  const home = tmp('gridhub-x1-settings-');
  t.after(() => rmSync(home, { recursive: true, force: true }));
  return home;
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

test('§83.6 壊れた settings.json でも、上位の明示指定なら設定を読まずに開け、設定は書き換えない', { timeout: 20_000 }, async t => {
  const dir = game(t), home = settingsHome(t), fake = fakeCodecity();
  t.after(() => rmSync(fake, { recursive: true, force: true }));
  const file = join(home, 'settings.json');
  writeFileSync(file, '{"keep":');
  const session = launchWorld(dir, ['--codecity', fake], { GRIDHUB_APP_HOME: home });
  t.after(() => session.stop());
  assert.match(await session.ready(), /^http:\/\/127\.0\.0\.1:/u);
  assert.equal(readFileSync(file, 'utf8'), '{"keep":');
});
