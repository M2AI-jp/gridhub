// S13「手で演じる窓口」— 伝令（第16章）。CONTRACTS §69。
// 本物のチュートリアルの冒険を gridhub serve で配り、指令書・ファイル・歩く・宣言判定を HTTP だけで進める。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, tmp, masume, getJson, waitUntil, startGridhub, postJson, pathWith,
} from '../helpers8.mjs';

const SOLUTIONS = JSON.parse(readFileSync(join(ROOT, 'quests', 'tutorial', 'SOLUTIONS.json'), 'utf8'));

async function withTutorial(fn) {
  const dir = tmp('gridhub-s13-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  const n = masume(['new', 'tutorial.map.json'], { cwd: dir });
  assert.equal(n.code, 0, n.all);
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH }, cwd: dir });
  try {
    await fn(srv.url, dir);
  } finally {
    await srv.stop();
  }
}

const view = async (url) => (await getJson(`${url}/api/state`)).body;
const at = async (url, id) => (await view(url)).characters.find((c) => c.id === id);
const sample = (node, i = 0) => SOLUTIONS[node][i];

test('§69.1 GET /api/hand: 指令書・縄張り・書けるファイル・見本（SOLUTIONS.json のいまのマスの分）', { timeout: 60000 }, async () => {
  await withTutorial(async (url) => {
    const player = await getJson(`${url}/api/hand?character=player`);
    assert.equal(player.status, 200);
    assert.equal(player.body.ok, true);
    assert.equal(player.body.brief.character.id, 'player');
    assert.equal(player.body.brief.current.id, 'H1');
    assert.deepEqual(player.body.territory, ['human/**']);
    assert.deepEqual(player.body.files, []);
    assert.deepEqual(player.body.solutions, SOLUTIONS.H1);
    const apprentice = await getJson(`${url}/api/hand?character=apprentice`);
    assert.equal(apprentice.body.brief.current.id, 'A1');
    assert.deepEqual(apprentice.body.solutions, SOLUTIONS.A1);
    const unknown = await getJson(`${url}/api/hand?character=nobody`);
    assert.equal(unknown.status, 404);
    assert.equal(unknown.body.code, 'E_UNKNOWN');
    assert.equal((await getJson(`${url}/api/hand`)).status, 400);
  });
});

test('§69.2 GET・POST /api/file: 縄張りの中は読み書きでき、外は 403 E_TERRITORY、封印された判定は 403 E_SEALED、X-Masume が要る', { timeout: 60000 }, async () => {
  await withTutorial(async (url, dir) => {
    const s = sample('H1');
    assert.equal((await postJson(`${url}/api/file`, { character: 'player', path: s.path, content: s.content }, { masume: false })).status, 403);
    const wrote = await postJson(`${url}/api/file`, { character: 'player', path: s.path, content: s.content });
    assert.equal(wrote.status, 200, wrote.text);
    assert.deepEqual(wrote.body, { ok: true, path: s.path, bytes: Buffer.byteLength(s.content) });
    assert.equal(readFileSync(join(dir, s.path), 'utf8'), s.content);
    const read = await getJson(`${url}/api/file?character=player&path=${encodeURIComponent(s.path)}`);
    assert.deepEqual(read.body, { ok: true, path: s.path, exists: true, content: s.content });
    const listed = await getJson(`${url}/api/hand?character=player`);
    assert.deepEqual(listed.body.files.map((f) => f.path), [s.path]);
    const outside = await postJson(`${url}/api/file`, { character: 'player', path: 'ai/hello.txt', content: 'x' });
    assert.equal(outside.status, 403);
    assert.equal(outside.body.code, 'E_TERRITORY');
    const sealed = await postJson(`${url}/api/file`, { character: 'apprentice', path: 'checks/hello.mjs', content: 'process.exit(0)' });
    assert.equal(sealed.status, 403);
    assert.equal(sealed.body.code, 'E_SEALED');
    assert.notEqual(readFileSync(join(dir, 'checks', 'hello.mjs'), 'utf8'), 'process.exit(0)', '判定は書き換わらない');
    const bad = await postJson(`${url}/api/file`, { character: 'player', path: '../escape.txt', content: 'x' });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'E_USAGE');
    assert.equal((await postJson(`${url}/api/file`, { character: 'player', path: 'human/x.txt' })).status, 400, 'content が無い');
  });
});

test('§69.3 POST /api/step: いまのダンジョンの判定だけを走らせる（位置は変わらない）。ハンコのマスでは 409', { timeout: 90000 }, async () => {
  await withTutorial(async (url) => {
    const before = await postJson(`${url}/api/step`, { character: 'apprentice' });
    assert.equal(before.status, 200, before.text);
    assert.equal(before.body.ok, true);
    assert.equal(before.body.node, 'A1');
    assert.notEqual(before.body.exit, 0, '書く前は落ちる');
    assert.ok(Array.isArray(before.body.cases));
    assert.equal(typeof before.body.seq, 'number');
    const s = sample('A1');
    assert.equal((await postJson(`${url}/api/file`, { character: 'apprentice', path: s.path, content: s.content })).status, 200);
    const after = await postJson(`${url}/api/step`, { character: 'apprentice' });
    assert.equal(after.body.exit, 0, after.text);
    assert.equal((await at(url, 'apprentice')).at, 'A1', '歩いても位置は変わらない');
    const stamp = await postJson(`${url}/api/step`, { character: 'player' });
    assert.equal(stamp.status, 409);
    assert.equal(stamp.body.code, 'E_NEEDS_STAMP');
    assert.equal((await postJson(`${url}/api/step`, { character: 'apprentice' }, { masume: false })).status, 403);
  });
});

test('§69.4 POST /api/check: 宣言判定（ボス戦は省く）。通れば passed: true で進み、仲間がそろえば ready を返して、ボス戦を別に始める', { timeout: 150000 }, async () => {
  await withTutorial(async (url) => {
    const failed = await postJson(`${url}/api/check`, { character: 'apprentice' });
    assert.equal(failed.status, 200, failed.text);
    assert.deepEqual([failed.body.ok, failed.body.passed, failed.body.ready], [true, false, null]);
    assert.notEqual(failed.body.exit, 0);
    for (const node of ['A1', 'A2']) {
      const s = sample(node);
      assert.equal((await postJson(`${url}/api/file`, { character: 'apprentice', path: s.path, content: s.content })).status, 200);
      const passed = await postJson(`${url}/api/check`, { character: 'apprentice' });
      assert.equal(passed.body.passed, true, passed.text);
      assert.equal(passed.body.exit, 0);
      assert.equal(passed.body.ready, null, '勇者はまだ来ていない');
    }
    assert.equal((await at(url, 'apprentice')).at, 'G1');
    const waiting = await postJson(`${url}/api/check`, { character: 'apprentice' });
    assert.equal(waiting.status, 409, '待っているあいだは宣言できない');
    const s = sample('H1');
    assert.equal((await postJson(`${url}/api/file`, { character: 'player', path: s.path, content: s.content })).status, 200);
    const stamped = await postJson(`${url}/api/stamp`, { node: 'H1', as: 'player' });
    assert.equal(stamped.body.ready, 'G1', '仲間がそろった');
    await waitUntil(async () => (await view(url)).nodes.G1.state === 'cleared', { timeout: 60000, message: 'ボス戦が別に走って、G1 を突破する' });
    // あとで宣言して仲間がそろう形: 見習いが A3 を終えて、勇者の H2 を待つ GOAL の手前まで
    const a3 = sample('A3');
    assert.equal((await postJson(`${url}/api/file`, { character: 'apprentice', path: a3.path, content: a3.content })).status, 200);
    assert.equal((await postJson(`${url}/api/stamp`, { node: 'H2', as: 'player' })).body.ready, null, '勇者が先に GOAL へ');
    const last = await postJson(`${url}/api/check`, { character: 'apprentice' });
    assert.equal(last.body.passed, true, last.text);
    assert.equal(last.body.ready, 'GOAL', '宣言で仲間がそろったら ready');
    await waitUntil(async () => (await view(url)).finished === true, { timeout: 60000, message: 'ボス戦が別に走って、あがる' });
  });
});

test('§69.5 同じキャラクターの step・check は同時に1つだけ（2つ目は 409 E_BUSY）', { timeout: 60000 }, async () => {
  await withTutorial(async (url) => {
    const [one, two] = await Promise.all([
      postJson(`${url}/api/step`, { character: 'apprentice' }),
      postJson(`${url}/api/check`, { character: 'apprentice' }),
    ]);
    const statuses = [one.status, two.status].sort();
    assert.deepEqual(statuses, [200, 409], `${one.text}\n${two.text}`);
    assert.equal([one, two].find((r) => r.status === 409).body.code, 'E_BUSY');
  });
});
