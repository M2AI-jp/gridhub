// E19「ことば（冒険のことば / 開発のことば）」— 書記。CONTRACTS §76.1。
// gridhub words・--words・GRIDHUB_WORDS・.masume/words.json と、開発のことばの brief / step / status / ログの文 / エラー文。
// 既定（冒険のことば）の字は今までどおり（E8・E9・E1 などが見ている）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, gridhub, view, newDungeon, setCases } from '../helpers5.mjs';

const wordsFile = (dir) => join(dir, '.masume', 'words.json');

test('§76.1 gridhub words: 既定は冒険のことば。引数で冒険の設定（.masume/words.json）に書き、引数なしで何で決まったかを出す', () => {
  const dir = newDungeon();
  let r = gridhub(['words', '--dir', dir]);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /^ことば: 冒険のことば（game。既定）/m);
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', dir, '--json']).out), { words: 'game', source: 'default' });

  r = gridhub(['words', 'dev', '--dir', dir]);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /開発のことば（dev）にしました/);
  assert.ok(existsSync(wordsFile(dir)), '.masume/words.json');
  assert.deepEqual(JSON.parse(readFileSync(wordsFile(dir), 'utf8')), { words: 'dev' });
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', dir, '--json']).out), { words: 'dev', source: 'file' });
  assert.match(gridhub(['words', '--dir', dir]).out, /^ことば: 開発のことば（dev。この(冒険|プロジェクト)の設定 \.masume\/words\.json）/m);

  // 決め方の順: --words > GRIDHUB_WORDS > 設定
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', dir, '--json', '--words', 'game']).out), { words: 'game', source: 'flag' });
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', dir, '--json'], { env: { GRIDHUB_WORDS: 'game' } }).out), { words: 'game', source: 'env' });
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', dir, '--json', '--words=dev'], { env: { GRIDHUB_WORDS: 'game' } }).out), { words: 'dev', source: 'flag' });
  // 知らない値は E_USAGE
  r = gridhub(['words', 'elvish', '--dir', dir]);
  assert.equal(r.code, 2);
  assert.match(r.err, /\[E_USAGE\]/);
  r = gridhub(['status', '--dir', dir, '--words', 'elvish']);
  assert.equal(r.code, 2);
  assert.match(r.err, /\[E_USAGE\] --words は game か dev です/);
  // 冒険の書が無い所では書けない（見るのはできる）
  const empty = tmp('gridhub-e19-');
  assert.equal(gridhub(['words', '--dir', empty]).code, 0);
  r = gridhub(['words', 'dev', '--dir', empty]);
  assert.equal(r.code, 2);
  assert.match(r.err, /\[E_NO_GAME\]/);
  // 環境変数の知らない値は無視して既定
  assert.deepEqual(JSON.parse(gridhub(['words', '--dir', empty, '--json'], { env: { GRIDHUB_WORDS: 'klingon' } }).out), { words: 'game', source: 'default' });
});

test('§76.1 開発のことば: brief・step・status・ログの文が開発の言い方になり、冒険のことばでは今までどおり', () => {
  const dir = newDungeon();
  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });

  // 歩く（冒険のことば）
  let r = gridhub(['step', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /歩いた: a A1 テスト 1\/2/);
  assert.match(r.out, /いちばん手前のモンスター: y が 2/);
  // 同じことを開発のことばで
  r = gridhub(['step', 'a', '--dir', dir, '--as', 'a', '--words', 'dev']);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /テストを走らせた: a A1 テスト 1\/2/);
  assert.match(r.out, /次に通すテスト: y が 2/);
  assert.doesNotMatch(r.out, /歩いた|モンスター/, '開発のことばに冒険の言い方が混ざらない');

  // 指令書 / 作業指示
  const game = gridhub(['brief', 'a', '--dir', dir]).out;
  assert.match(game, /^指令書: /m);
  assert.match(game, /^縄張り: /m);
  assert.match(game, /^いま戦うテスト: y が 2/m);
  assert.match(game, /^歩き方:/m);
  const dev = gridhub(['brief', 'a', '--dir', dir, '--words', 'dev']).out;
  assert.match(dev, /^作業指示: /m);
  assert.match(dev, /^担当ファイル: /m);
  assert.match(dev, /^次に通すテスト: y が 2/m);
  assert.match(dev, /^進め方:/m);
  assert.match(dev, /テストを走らせる（何度でも・記録される）: gridhub step a/);
  assert.doesNotMatch(dev, /指令書|縄張り|歩く|モンスター|いま戦う/, `開発のことばの作業指示: ${dev}`);
  assert.match(dev, /^記録: seq \d+/m, '記録の目印はどちらでも同じ');
  // JSON は言い方に関係なく同じ形
  assert.equal(JSON.parse(gridhub(['brief', 'a', '--dir', dir, '--json', '--words', 'dev']).out).next_case, 'y が 2');

  // status と、冒険の書（ログ）の文
  gridhub(['words', 'dev', '--dir', dir]);
  const status = gridhub(['status', '--dir', dir]).out;
  assert.match(status, /合格 \d+・失敗 \d+/);
  assert.doesNotMatch(status, /成功 \d+・失敗/);
  const log = view(dir).log.map((e) => e.text);
  assert.ok(log.some((x) => /^セーブデータを作った$/.test(x)), `genesis の文: ${log[0]}`);
  assert.ok(log.some((x) => /のテストを走らせた（1\/2）/.test(x)), `stepped の文: ${log.at(-1)}`);
  // 設定を game に戻すと、ログの文も冒険のことば
  gridhub(['words', 'game', '--dir', dir]);
  const back = view(dir).log.map((e) => e.text);
  assert.ok(back.some((x) => /^冒険の書がひらかれた$/.test(x)));
  assert.ok(back.some((x) => /を歩いた（テスト 1\/2）/.test(x)));
});

test('§76.1 エラー文と --help も開発のことば。既定の --help は「ルールブック: docs/RULEBOOK.md」で終わる', () => {
  const dir = newDungeon();
  let r = gridhub(['brief', 'nobody', '--dir', dir]);
  assert.match(r.err, /キャラクターが見つかりません: nobody/);
  r = gridhub(['brief', 'nobody', '--dir', dir, '--words', 'dev']);
  assert.match(r.err, /担当が見つかりません: nobody/);
  const empty = tmp('gridhub-e19h-');
  assert.match(gridhub(['status', '--dir', empty]).err, /冒険の書が見つかりません/);
  assert.match(gridhub(['status', '--dir', empty, '--words', 'dev']).err, /セーブデータ（\.masume\/）が見つかりません/);

  const help = gridhub(['--help']);
  assert.match(help.out, /ルールブック: docs\/RULEBOOK\.md\s*$/);
  assert.match(help.out, /words \[game\|dev\]/);
  assert.match(help.out, /（担当: 書記）/);
  const devHelp = gridhub(['--help', '--words', 'dev']);
  assert.match(devHelp.out, /（担当: engine）/);
  assert.doesNotMatch(devHelp.out, /書記|冒険の書/);
  assert.match(gridhub(['step', '--help', '--words', 'dev']).out, /次に通すテスト/);
  assert.match(gridhub(['step', '--help']).out, /いちばん手前のモンスター/);
});
