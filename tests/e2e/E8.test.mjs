// E8「テスト1件ずつ歩く」— CONTRACTS §39・§40・§41（第11章）。マス = テスト1件。step は罰のない普通の戦い。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, tmp, masume, masumeJson, gridhub, view, char, readLog,
  dungeonMap, setupDungeon, newDungeon, setCases, passAll, CASES, events,
} from '../helpers5.mjs';

const validate = (map) => {
  const dir = tmp('gridhub-e8v-');
  writeFileSync(join(dir, 'm.json'), JSON.stringify(map));
  return masumeJson(['validate', 'm.json'], { cwd: dir }).data;
};
const codes = (r) => r.errors.map((e) => e.code);

test('§39 地図: check.cases と quest.save の検査', () => {
  assert.equal(validate(dungeonMap()).ok, true, 'cases のある地図は正しい');
  assert.equal(validate(dungeonMap({ save: true })).ok, true, 'quest.save: "git" は正しい');
  const bad = (mutate) => { const m = dungeonMap(); mutate(m); return validate(m); };
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = []))).includes('E_CHECK'), '空の cases');
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = ['x', 'x']))).includes('E_CHECK'), '重複');
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = ['x', 3]))).includes('E_CHECK'), '文字列でない');
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = ['  ']))).includes('E_CHECK'), '空白だけ');
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = Array.from({ length: 51 }, (_, i) => `t${i}`)))).includes('E_CHECK'), '51件');
  assert.ok(codes(bad((m) => (m.nodes.A1.check.cases = ['あ'.repeat(121)]))).includes('E_CHECK'), '121文字');
  assert.ok(codes(bad((m) => (m.nodes.H1.check.cases = ['x']))).includes('E_CHECK'), 'stamp に cases');
  assert.ok(codes(bad((m) => (m.quest.save = 'svn'))).includes('E_FORMAT'), 'quest.save は git だけ');
});

test('§38 gridhub が受付係、masume は別名', () => {
  const g = gridhub(['--help']);
  assert.equal(g.code, 0);
  assert.match(g.out.split('\n')[0], /GridHub/);
  assert.match(g.out, /step/);
  assert.match(gridhub(['--version']).out, /^gridhub \S+ \(rules 1\)/);
  assert.match(masume(['--version']).out, /^gridhub /, 'masume も同じ受付係');
  const dir = newDungeon();
  assert.equal(gridhub(['status', '--dir', dir]).code, 0);
});

test('§40・§41 歩く: テスト1件ずつ記録し、位置もレベルも変わらない。駒は最初に落ちているマスに立つ', () => {
  const dir = newDungeon();
  let v = view(dir);
  assert.deepEqual(v.nodes.A1.cases.map((c) => [c.name, c.ok]), CASES.A1.map((n) => [n, null]), 'まだ戦っていないモンスター');
  assert.deepEqual(v.nodes.A1.tests, { pass: 0, total: 2 });
  assert.equal(char(v, 'a').square, 0);
  assert.equal(char(v, 'h').square, null, 'stamp のマスでは square は null');
  const before = char(v, 'a');

  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
  const r = gridhub(['step', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(r.code, 1, r.all);
  assert.match(r.out, /歩いた: a A1 テスト 1\/2/);
  assert.match(r.out, /✔ x が 1/);
  assert.match(r.out, /✖ y が 2/);
  assert.match(r.out, /いちばん手前のモンスター: y が 2/);
  const s = events(dir, 'stepped').at(-1);
  assert.equal(s.data.character, 'a');
  assert.equal(s.data.node, 'A1');
  assert.equal(s.data.code, 1);
  assert.deepEqual(s.data.cases, { A1: [{ name: 'x が 1', ok: true }, { name: 'y が 2', ok: false }] });
  assert.match(s.data.output, /^outputs\/\d{6}\.log$/);
  v = view(dir);
  const after = char(v, 'a');
  for (const k of ['pos', 'at', 'level', 'xp', 'fails', 'clears', 'status']) assert.deepEqual(after[k], before[k], `歩いても ${k} は変わらない`);
  assert.equal(after.square, 1, '駒は最初に落ちているマス（y が 2）に立つ');
  assert.deepEqual(v.nodes.A1.tests, { pass: 1, total: 2 });
  assert.equal(v.log.at(-1).type, 'stepped');
  assert.match(v.log.at(-1).text, /戦士アリス が A1 を歩いた（テスト 1\/2）/);
  assert.equal(v.log.at(-1).ok, false);

  passAll(dir, 'A1');
  const ok = masumeJson(['step', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(ok.code, 0, ok.all);
  assert.equal(ok.data.exitCode, 0);
  assert.equal(ok.data.events[0].type, 'stepped');
  const t = gridhub(['step', 'a', '--dir', dir, '--as', 'a']);
  assert.match(t.out, /全部倒した。出口で宣言する: gridhub check a/);
  v = view(dir);
  assert.equal(char(v, 'a').square, 2, '全部倒したら出口の前');
  assert.equal(char(v, 'a').at, 'A1', 'まだ宣言していないので A1 のまま');
  assert.equal(masume(['verify', '--dir', dir]).code, 0, 'stepped の出力も鎖に入る');
});

test('§41 歩けないとき: 知らないキャラ・ハンコ・ゲート待ち・あがり・未封印・封印破り', () => {
  const dir = newDungeon();
  assert.match(gridhub(['step', 'zzz', '--dir', dir]).err, /E_UNKNOWN/);
  assert.match(gridhub(['step', 'h', '--dir', dir]).err, /E_NEEDS_STAMP/);
  passAll(dir, 'B1');
  passAll(dir, 'B2');
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 0);
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 0);
  const w = gridhub(['step', 'b', '--dir', dir]);
  assert.equal(w.code, 2);
  assert.match(w.err, /E_USAGE/, 'ゲートで待機中は歩けない');

  appendFileSync(join(dir, 'checks', 'cases.mjs'), '\n// いたずら\n');
  const n = readLog(dir).length;
  const b = gridhub(['step', 'a', '--dir', dir]);
  assert.equal(b.code, 2);
  assert.match(b.err, /E_SEAL_BROKEN/);
  assert.equal(readLog(dir).at(-1).type, 'seal_broken');
  assert.equal(readLog(dir).length, n + 1);

  const dir2 = tmp('gridhub-e8u-');
  setupDungeon(dir2);
  const m = dungeonMap();
  m.nodes.A1.check.seal = ['checks/later.mjs'];
  writeFileSync(join(dir2, 'dungeon.map.json'), JSON.stringify(m));
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir2 }).code, 0);
  const u = gridhub(['step', 'a', '--dir', dir2]);
  assert.equal(u.code, 2);
  assert.match(u.err, /E_UNSEALED/);
  assert.equal(readLog(dir2).filter((e) => e.type === 'stepped').length, 0, '未封印は記録しない');
});

test('§40 宣言の記録にもテスト1件ずつ。前に倒したテストが落ちたら復活、2回負けてから倒したら強敵', () => {
  const dir = newDungeon();
  passAll(dir, 'A1');
  const c1 = masume(['check', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(c1.code, 0, c1.all);
  assert.deepEqual(events(dir, 'check_passed').at(-1).data.cases, { A1: CASES.A1.map((name) => ({ name, ok: true })) });

  // A2: z が 3 に2回負けてから倒す（強敵）
  setCases(dir, 'A2', { 'z が 3': 'fail', 'w が 4': 'ok', 'v が 5': 'ok' });
  gridhub(['step', 'a', '--dir', dir]);
  gridhub(['step', 'a', '--dir', dir]);
  let v = view(dir);
  assert.equal(v.nodes.A2.cases[0].losses, 2);
  assert.equal(v.nodes.A2.cases[0].strong, false);
  passAll(dir, 'A2');
  gridhub(['step', 'a', '--dir', dir]);
  v = view(dir);
  assert.equal(v.nodes.A2.cases[0].strong, true, '2回負けてから倒した = 強敵');
  assert.equal(v.nodes.A2.cases[1].strong, false);
  assert.equal(char(v, 'a').strong, 1);

  // A1 の x を壊して宣言する（累積判定で A1 が先に落ちる） → 復活
  setCases(dir, 'A1', { 'x が 1': 'fail', 'y が 2': 'ok' });
  const c2 = masume(['check', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(c2.code, 1);
  const failed = events(dir, 'check_failed').at(-1);
  assert.deepEqual(failed.data.cases.A1, [{ name: 'x が 1', ok: false }, { name: 'y が 2', ok: true }]);
  assert.equal(failed.data.cases.A2, undefined, '走らせなかったマスは記録しない');
  v = view(dir);
  assert.equal(v.nodes.A1.cases[0].revived, 1, '一度倒したテストが落ちた = 復活');
  assert.equal(v.nodes.A1.cases[0].ok, false);
  assert.equal(v.nodes.A1.cases[1].revived, 0);
  assert.equal(char(v, 'a').revived, 1);
  assert.equal(v.nodes.A2.cases[0].ok, true, '走らせなかったマスの結果は前のまま');
});

test('§40 出力の読み方: TAP・SKIP・まとめの繰り返し・cases の無いマス・名前が合わないとき', () => {
  const dir = tmp('gridhub-e8p-');
  setupDungeon(dir);
  const m = dungeonMap();
  // B1: cases を書かない（出てきたテストがマスになる）。B2: 名前が1つも合わない cases（出てきた順）
  m.nodes.B1.check = { kind: 'cmd', run: 'node checks/tap.mjs', seal: ['checks/tap.mjs'] };
  m.nodes.B2.check = { kind: 'cmd', run: 'node checks/plain.mjs', seal: ['checks/plain.mjs'], cases: ['一つめ', '二つめ'] };
  writeFileSync(join(dir, 'checks', 'tap.mjs'), [
    "console.log('TAP version 13');",
    "console.log('# Subtest: 外側');",
    "console.log('    ok 1 - 内側のテスト');",
    "console.log('ok 1 - 外側');",
    "console.log('not ok 2 - 二番目 # TODO まだ');",
    "console.log('ok 3 - 三番目 # SKIP 飛ばす');",
    "console.log('not ok 4 - 四番目');",
    "console.log('1..4');",
    'process.exit(1);',
  ].join('\n'));
  writeFileSync(join(dir, 'checks', 'plain.mjs'), "console.log('PASS alpha');\nconsole.log('FAIL beta');\nprocess.exit(1);\n");
  writeFileSync(join(dir, 'dungeon.map.json'), JSON.stringify(m));
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir }).code, 0);
  assert.deepEqual(view(dir).nodes.B1.cases, [], 'まだ走らせていない cases の無いマスは []（？のマス）');
  assert.equal(char(view(dir), 'b').square, 0);
  gridhub(['step', 'b', '--dir', dir]);
  let v = view(dir);
  assert.deepEqual(v.nodes.B1.cases.map((c) => [c.name, c.ok]), [['外側', true], ['二番目', null], ['三番目', null], ['四番目', false]],
    'いちばん浅い字下げのテストが出てきた順。TODO・SKIP は結果なし');
  assert.equal(char(v, 'b').square, 1, '結果なしも倒していない');

  // spec の形と「✖ failing tests:」のまとめ（A1 は名前で一致）
  setCases(dir, 'A1', { 'x が 1': 'skip', 'y が 2': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  v = view(dir);
  assert.deepEqual(v.nodes.A1.cases.map((c) => [c.name, c.ok, c.losses]), [['x が 1', null, 0], ['y が 2', false, 1]], 'まとめの繰り返しで2回数えない');

  // B2: 名前が合わない → 出てきた順に割り当てる
  writeFileSync(join(dir, 'checks', 'tap.mjs'), "console.log('ok 1 - 外側');\n");
  assert.equal(masume(['seal', 'B1', '--dir', dir]).code, 0);
  const c = masume(['check', 'b', '--dir', dir, '--as', 'b']);
  assert.equal(c.code, 0, c.all);
  gridhub(['step', 'b', '--dir', dir]);
  v = view(dir);
  assert.deepEqual(v.nodes.B2.cases.map((x) => [x.name, x.ok]), [['一つめ', true], ['二つめ', false]]);
  assert.equal(v.nodes.B1.cases.length, 1, 'cases の無いマスは、最後に走らせたときのテスト');
});

test('§40 第10章までの冒険の書: cases の無いイベントは、出力ファイルから読む', () => {
  const v = view(ROOT);
  for (const id of ['E1', 'B9', 'GOAL10']) {
    assert.ok(v.nodes[id].cases.length > 0, `${id} のテストが出力から読める`);
    assert.equal(v.nodes[id].tests.pass, v.nodes[id].tests.total, `${id} は全部倒している`);
  }
  assert.ok(v.bestiary.total >= 100, `図鑑に第10章までのテスト（${v.bestiary.total}）`);
});
