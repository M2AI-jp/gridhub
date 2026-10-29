// E18「承認のマスでは、仲間のファイルを読むだけで見せる」— 書記（第16章）。CONTRACTS §74.1。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, readLog } from '../helpers.mjs';
import * as engine from '../../src/engine/index.js';

function tutorial() {
  const dir = tmp('gridhub-e18-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  const r = masume(['new', 'tutorial.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  engine.writeHandFile(dir, 'apprentice', 'ai/hello.txt', 'こんにちは、GridHub！\n');
  engine.writeHandFile(dir, 'player', 'human/request.json', '{"name":"GridHub"}\n');
  return dir;
}

test('§74.1 人間が承認のマスにいるとき、handReviewFiles は指令書とすぐ次のゲートの説明に書かれた、だれかの縄張りの守られていないファイルを返す。ほかのときは空', () => {
  const dir = tutorial();
  engine.writeHandFile(dir, 'apprentice', 'ai/notes.txt', '説明に書かれていないファイル\n');
  const before = readLog(dir).length;
  const review = engine.handReviewFiles(dir, 'player').files;
  // H1 の説明に human/request.json、すぐ次のゲート G1 の説明に human/request.json・ai/hello.txt・ai/card.json（まだ無い）
  assert.deepEqual(review.map((f) => [f.path, f.owner]), [['ai/hello.txt', 'apprentice'], ['human/request.json', 'player']], 'パスの順。いまあるものだけ。説明に無い ai/notes.txt・判定（checks/）・地図・SOLUTIONS.json・README は出さない');
  assert.equal(review[0].size, Buffer.byteLength('こんにちは、GridHub！\n'));
  assert.deepEqual(engine.handReviewFiles(dir, 'apprentice').files, [], 'エージェントの役には出さない');
  assert.equal(readLog(dir).length, before, '冒険の書は変わらない');
  assert.equal(masume(['stamp', 'H1', '--as', 'player', '--dir', dir]).code, 0);
  assert.deepEqual(engine.handReviewFiles(dir, 'player').files, [], 'ハンコのマスを過ぎたら出さない');
});

test('§74.1 readHandFile は読むだけのファイルに readonly: true をつけ、writeHandFile は書かない（E_TERRITORY）。守られた場所は E_SEALED', () => {
  const dir = tutorial();
  assert.deepEqual(engine.readHandFile(dir, 'player', 'ai/hello.txt'), { path: 'ai/hello.txt', exists: true, content: 'こんにちは、GridHub！\n', readonly: true });
  assert.throws(() => engine.writeHandFile(dir, 'player', 'ai/hello.txt', '書き換え'), (e) => e.code === 'E_TERRITORY');
  assert.deepEqual(engine.readHandFile(dir, 'player', 'human/request.json'), { path: 'human/request.json', exists: true, content: '{"name":"GridHub"}\n' });
  assert.throws(() => engine.readHandFile(dir, 'player', 'checks/hello.mjs'), (e) => e.code === 'E_SEALED');
  assert.deepEqual(engine.readHandFile(dir, 'player', 'ai/card.json'), { path: 'ai/card.json', exists: false, content: '', readonly: true }, '説明に書かれていて、まだ無い');
  engine.writeHandFile(dir, 'apprentice', 'ai/notes.txt', 'x');
  assert.throws(() => engine.readHandFile(dir, 'player', 'ai/notes.txt'), (e) => e.code === 'E_TERRITORY', '縄張りに合っても、説明に書かれていなければ読めない');
  assert.throws(() => engine.readHandFile(dir, 'apprentice', 'human/request.json'), (e) => e.code === 'E_TERRITORY', 'エージェントの役は仲間のファイルを読めない');
  assert.equal(masume(['stamp', 'H1', '--as', 'player', '--dir', dir]).code, 0);
  assert.throws(() => engine.readHandFile(dir, 'player', 'ai/hello.txt'), (e) => e.code === 'E_TERRITORY', 'ハンコのマスを過ぎたら読めない');
});
