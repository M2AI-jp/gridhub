// E17「手で演じる役のファイル（縄張りの中だけ）」— 書記（第16章）。CONTRACTS §67。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, readLog } from '../helpers.mjs';
import * as engine from '../../src/engine/index.js';

/** 縄張りに、わざと守られた場所（封印された判定・地図・.masume・.git）を含めた冒険 */
function handGame() {
  const dir = tmp('gridhub-e17-');
  const map = {
    masume: 1,
    quest: { id: 'HND', title: '手で進める', goal: 'G' },
    characters: [
      { id: 'a', name: 'エー', kind: 'agent', job: 'scribe', color: 'blue', territory: ['work/**', 'checks/**', '*.map.json', '.masume/**', '.git/**'], path: ['T1', 'G'] },
      { id: 'b', name: 'ビー', kind: 'human', job: 'hero', color: 'pink', territory: ['human/**'], path: ['H1', 'G'] },
      { id: 'c', name: 'シー', kind: 'agent', job: 'mage', color: 'green', path: ['T2', 'G'] },
    ],
    nodes: {
      T1: { type: 'task', title: 'ひとつめ', check: { kind: 'cmd', run: 'node checks/t1.mjs', seal: ['checks/t1.mjs'] } },
      T2: { type: 'task', title: 'ふたつめ', check: { kind: 'cmd', run: 'node -e 0' } },
      H1: { type: 'task', title: 'ハンコ', check: { kind: 'stamp', by: 'b' } },
      G: { type: 'gate', title: 'あがり', check: { kind: 'cmd', run: 'node -e 0' } },
    },
  };
  mkdirSync(join(dir, 'checks'));
  writeFileSync(join(dir, 'checks', 't1.mjs'), 'process.exit(0);\n');
  writeFileSync(join(dir, 'checks', 'helper.mjs'), 'export const x = 1;\n');
  writeFileSync(join(dir, 'quest.map.json'), JSON.stringify(map, null, 2));
  const r = masume(['new', 'quest.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return dir;
}

const codeOf = (problem) => problem?.code ?? null;

test('§67.1 handPathProblem: 形のおかしいパスは E_USAGE、冒険の書が無ければ E_NO_GAME、いないキャラクターは E_UNKNOWN', () => {
  const dir = handGame();
  for (const bad of ['', '/work/x', 'work\\x', 'work/../x', 'work//x', './work/x', 'work/.', 'work/x\0', 42, null]) {
    assert.equal(codeOf(engine.handPathProblem(dir, 'a', bad)), 'E_USAGE', `E_USAGE: ${JSON.stringify(bad)}`);
  }
  assert.ok(engine.handPathProblem(dir, 'a', '') instanceof engine.MasumeError, 'MasumeError を返す（投げない）');
  assert.equal(codeOf(engine.handPathProblem(tmp('gridhub-e17-none-'), 'a', 'work/x')), 'E_NO_GAME');
  assert.equal(codeOf(engine.handPathProblem(dir, 'zz', 'work/x')), 'E_UNKNOWN');
  assert.equal(engine.handPathProblem(dir, 'a', 'work/ok.txt'), null);
  assert.equal(engine.handPathProblem(dir, 'b', 'human/request.json'), null);
});

test('§67.1 封印された判定・地図・.masume/・.git/ は縄張りの中でも E_SEALED、縄張りの外と縄張りの無いキャラクターは E_TERRITORY', () => {
  const dir = handGame();
  for (const path of ['checks/t1.mjs', 'quest.map.json', 'other.map.json', '.masume/log.jsonl', '.masume/x.txt', '.git/config']) {
    assert.equal(codeOf(engine.handPathProblem(dir, 'a', path)), 'E_SEALED', `E_SEALED: ${path}`);
  }
  assert.equal(engine.handPathProblem(dir, 'a', 'checks/helper.mjs'), null, '縄張りの中の、封印されていないファイル');
  assert.equal(codeOf(engine.handPathProblem(dir, 'a', 'other/x.txt')), 'E_TERRITORY');
  assert.equal(codeOf(engine.handPathProblem(dir, 'b', 'work/x.txt')), 'E_TERRITORY', 'ほかの人の縄張り');
  assert.equal(codeOf(engine.handPathProblem(dir, 'c', 'work/x.txt')), 'E_TERRITORY', '縄張りが無い');
});

test('§67.1 シンボリックリンクをたどる・本人がシンボリックリンクなら E_TERRITORY（ルートの外を書き換えない）', () => {
  const dir = handGame();
  const outside = tmp('gridhub-e17-outside-');
  writeFileSync(join(outside, 'secret.txt'), 'そのまま\n');
  mkdirSync(join(dir, 'work'));
  symlinkSync(outside, join(dir, 'work', 'out'));
  symlinkSync(join(outside, 'secret.txt'), join(dir, 'work', 'secret.txt'));
  assert.equal(codeOf(engine.handPathProblem(dir, 'a', 'work/out/secret.txt')), 'E_TERRITORY');
  assert.equal(codeOf(engine.handPathProblem(dir, 'a', 'work/secret.txt')), 'E_TERRITORY');
  assert.throws(() => engine.writeHandFile(dir, 'a', 'work/secret.txt', '書き換え'), (e) => e.code === 'E_TERRITORY');
  assert.equal(readFileSync(join(outside, 'secret.txt'), 'utf8'), 'そのまま\n', 'ルートの外は書き換わらない');
  assert.ok(!engine.handFiles(dir, 'a').files.some((f) => f.path.startsWith('work/out') || f.path === 'work/secret.txt'), '一覧にシンボリックリンクを出さない');
});

test('§67.2〜§67.4 handFiles・readHandFile・writeHandFile: 縄張りの中のファイルを一覧し、読み、書く（途中のフォルダを作る・1MiB まで）。冒険の書には何も記録しない', () => {
  const dir = handGame();
  const before = readLog(dir).length;
  const empty = engine.readHandFile(dir, 'a', 'work/sub/new.txt');
  assert.deepEqual(empty, { path: 'work/sub/new.txt', exists: false, content: '' });
  const wrote = engine.writeHandFile(dir, 'a', 'work/sub/new.txt', 'こんにちは、GridHub！\n');
  assert.deepEqual(wrote, { path: 'work/sub/new.txt', bytes: Buffer.byteLength('こんにちは、GridHub！\n') });
  assert.equal(readFileSync(join(dir, 'work', 'sub', 'new.txt'), 'utf8'), 'こんにちは、GridHub！\n');
  assert.deepEqual(engine.readHandFile(dir, 'a', 'work/sub/new.txt'), { path: 'work/sub/new.txt', exists: true, content: 'こんにちは、GridHub！\n' });
  engine.writeHandFile(dir, 'a', 'work/a.txt', 'A');
  const list = engine.handFiles(dir, 'a');
  assert.equal(list.character, 'a');
  assert.deepEqual(list.territory, ['work/**', 'checks/**', '*.map.json', '.masume/**', '.git/**']);
  assert.deepEqual(list.files.map((f) => f.path), ['checks/helper.mjs', 'work/a.txt', 'work/sub/new.txt'], 'パスの順。封印・地図・.masume は出さない');
  assert.equal(list.files.find((f) => f.path === 'work/a.txt').size, 1);
  assert.deepEqual(engine.handFiles(dir, 'b').files, []);
  assert.throws(() => engine.writeHandFile(dir, 'a', 'checks/t1.mjs', 'process.exit(0)'), (e) => e.code === 'E_SEALED');
  assert.throws(() => engine.readHandFile(dir, 'b', 'work/a.txt'), (e) => e.code === 'E_TERRITORY');
  assert.throws(() => engine.writeHandFile(dir, 'a', 'work/big.txt', 'あ'.repeat(350_000)), (e) => e.code === 'E_USAGE', '1MiB を超える');
  assert.throws(() => engine.writeHandFile(dir, 'a', 'work/x.txt', 123), (e) => e.code === 'E_USAGE', '中身は文字列');
  assert.equal(readLog(dir).length, before, '冒険の書は変わらない');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});
