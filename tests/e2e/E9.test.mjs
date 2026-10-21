// E9「積み上げと指令書」— CONTRACTS §42・§44（第11章）。代・技・メダル・宝・罠・図鑑・エンディングを冒険の書から導く。
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  masume, masumeJson, gridhub, view, char, newDungeon, setCases, passAll, setFlag, CASES,
} from '../helpers5.mjs';

const check = (dir, who) => masume(['check', who, '--dir', dir, '--as', who]);

/** a と b を FIN の手前まで進め、h のハンコであがる。opts で遊び方を変える */
function playToEnd(dir, { struggle = false, sorties = 0 } = {}) {
  for (let i = 0; i < sorties; i++) {
    const s = masumeJson(['sortie', 'a', '--agent', 'test', '--dir', dir]);
    masume(['return', 'a', '--sortie', String(s.data?.seq ?? JSON.parse(s.out).seq), '--code', '0', '--dir', dir]);
  }
  if (struggle) {
    setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
    assert.equal(check(dir, 'a').code, 1);
    gridhub(['step', 'a', '--dir', dir]);
  }
  for (const n of ['A1', 'A2', 'A3', 'B1', 'B2', 'G1']) passAll(dir, n);
  setFlag(dir, 'FIN');
  for (const who of ['a', 'a', 'a', 'b', 'b']) assert.equal(check(dir, who).code, 0, `${who} の宣言`);
  const st = masume(['stamp', 'H1', '--as', 'h', '--dir', dir]);
  assert.equal(st.code, 0, st.all);
  return view(dir);
}

test('§42 代: 出撃1回が1代（出撃していなければ1）', () => {
  const dir = newDungeon();
  assert.equal(char(view(dir), 'a').generation, 1);
  for (let i = 0; i < 3; i++) {
    const s = masumeJson(['sortie', 'a', '--agent', 'claude', '--dir', dir]);
    assert.equal(s.code, 0, s.all);
    masume(['return', 'a', '--sortie', String(s.data.seq), '--code', '0', '--dir', dir]);
  }
  assert.equal(char(view(dir), 'a').generation, 3);
  assert.equal(char(view(dir), 'b').generation, 1);
});

test('§42 技: 強敵を倒したあとの最初の日誌が技になり、次の代の指令書に出る', () => {
  const dir = newDungeon();
  masume(['note', 'a', 'ただの日誌', '--dir', dir]);
  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  gridhub(['step', 'a', '--dir', dir]);
  passAll(dir, 'A1');
  gridhub(['step', 'a', '--dir', dir]);
  masume(['note', 'a', 'y は文字列で来るので Number() してから比べる', '--dir', dir]);
  masume(['note', 'a', 'もう一つの日誌', '--dir', dir]);
  let a = char(view(dir), 'a');
  assert.equal(a.skills.length, 1, '技は強敵のあとの最初の日誌だけ');
  assert.equal(a.skills[0].text, 'y は文字列で来るので Number() してから比べる');
  assert.equal(a.skills[0].node, 'A1');
  assert.equal(a.skills[0].case, 'y が 2');
  assert.ok(Number.isInteger(a.skills[0].seq));

  // 強敵を倒したあと、日誌を書かずに次の出撃が始まったら、その機会は閉じる
  check(dir, 'a');
  setCases(dir, 'A2', { 'z が 3': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  gridhub(['step', 'a', '--dir', dir]);
  passAll(dir, 'A2');
  gridhub(['step', 'a', '--dir', dir]);
  const s = masumeJson(['sortie', 'a', '--agent', 'claude', '--dir', dir]);
  masume(['note', 'a', '出撃してから書いた日誌', '--dir', dir]);
  a = char(view(dir), 'a');
  assert.equal(a.skills.length, 1);
  masume(['return', 'a', '--sortie', String(s.data.seq), '--code', '0', '--dir', dir]);

  const b = masumeJson(['brief', 'a', '--dir', dir]).data;
  assert.equal(b.generation, 1);
  assert.equal(b.skills[0].text, 'y は文字列で来るので Number() してから比べる');
  const text = gridhub(['brief', 'a', '--dir', dir]).out;
  assert.match(text, /1代目/);
  assert.match(text, /技（受け継いだもの）/);
  assert.match(text, /Number\(\) してから比べる/);
});

test('§42 メダル（一発で出口を抜けた）・宝（GM が判定を直した）・罠（封印破り）', () => {
  const dir = newDungeon();
  passAll(dir, 'A1');
  check(dir, 'a');
  setCases(dir, 'A2', { 'z が 3': 'fail' });
  check(dir, 'a');
  passAll(dir, 'A2');
  assert.equal(check(dir, 'a').code, 0, '町まで戻されたので A1 から');
  assert.equal(check(dir, 'a').code, 0, 'A2 を抜けて町を通り A3 へ');
  let v = view(dir);
  assert.equal(char(v, 'a').at, 'A3');
  assert.equal(v.nodes.A1.first_try, true);
  assert.equal(v.nodes.A2.first_try, false);
  assert.equal(v.nodes.A3.first_try, null);
  assert.equal(v.nodes.AC.first_try, null);
  assert.equal(char(v, 'a').medals, 1);

  // 罠: 判定ファイルを書き換えて宣言すると封印破り
  appendFileSync(join(dir, 'checks', 'cases.mjs'), '\n// いたずら\n');
  assert.equal(check(dir, 'a').code, 2);
  // 宝: GM が判定を直して封印し直す（a は A3 の上、b は B1 の上。同じファイルを使う全マスが封印し直される）
  assert.equal(masume(['seal', 'A3', 'B1', '--dir', dir]).code, 0);
  assert.equal(masume(['seal', 'A3', '--dir', dir]).code, 0, '中身が同じ封印し直しは宝にならない');
  v = view(dir);
  assert.equal(char(v, 'a').traps, 1);
  assert.equal(char(v, 'b').traps, 0);
  assert.equal(char(v, 'a').treasures, 1, 'a のいるダンジョンの判定が直された');
  assert.equal(char(v, 'b').treasures, 1, 'b のいるダンジョンの判定も直された');
  assert.equal(char(v, 'h').treasures, 0);
});

test('§42 図鑑とエンディング: 記録が違えば文も違う', () => {
  const quiet = newDungeon();
  const v1 = view(quiet);
  assert.deepEqual(v1.bestiary.total, Object.values(CASES).flat().length);
  assert.equal(v1.bestiary.defeated, 0);
  assert.equal(v1.ending, null);
  const end1 = playToEnd(quiet);
  assert.equal(end1.finished, true);
  assert.ok(end1.ending, 'あがったらエンディング');
  assert.equal(end1.ending.seq, end1.log.filter((e) => e.type === 'gate_cleared').at(-1).seq);
  assert.equal(typeof end1.ending.text, 'string');
  assert.ok(end1.ending.text.length >= 20);
  assert.match(end1.ending.text, /テスト \d+\/\d+/, '技術の言葉が先');
  assert.equal(end1.ending.stats.medals, 5, '全部一発');
  assert.equal(end1.ending.stats.fails, 0);
  assert.ok(end1.bestiary.defeated >= Object.values(CASES).flat().length);

  const hard = newDungeon();
  const end2 = playToEnd(hard, { struggle: true, sorties: 2 });
  assert.ok(end2.ending);
  assert.equal(end2.ending.stats.fails, 1);
  assert.equal(end2.ending.stats.sorties, 2);
  assert.notEqual(end2.ending.text, end1.ending.text, '記録が違えば文も違う');
});

test('§44 指令書: 今のマスのテスト・いま戦うテスト・歩き方', () => {
  const dir = newDungeon();
  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  const b = masumeJson(['brief', 'a', '--dir', dir]).data;
  assert.deepEqual(b.cases.map((c) => [c.name, c.ok]), [['x が 1', true], ['y が 2', false]]);
  assert.equal(b.next_case, 'y が 2');
  assert.equal(b.square, 1);
  assert.equal(b.medals, 0);
  assert.equal(b.grave, null);
  assert.equal(b.save, null);
  assert.deepEqual(b.skills, []);
  assert.ok(b.rules.some((r) => /gridhub step/.test(r)), 'rules に 1マスずつ');
  const t = gridhub(['brief', 'a', '--dir', dir]).out;
  for (const w of [/戦士アリス（a）[^\n]*1代目/, /テスト 1\/2/, /✔ x が 1/, /✖ y が 2/, /いま戦うテスト: y が 2/, /歩く[^\n]*gridhub step a/, /宣言[^\n]*gridhub check a/, /日誌[^\n]*gridhub note a/, /技（受け継いだもの）: まだない/]) {
    assert.match(t, w);
  }
  passAll(dir, 'A1');
  gridhub(['step', 'a', '--dir', dir]);
  assert.match(gridhub(['brief', 'a', '--dir', dir]).out, /全部倒した。出口で宣言する/);
  assert.equal(masumeJson(['brief', 'a', '--dir', dir]).data.next_case, null);
  writeFileSync(join(dir, 'unused.txt'), '');
});
