// E3「仲間と合流する」— CONTRACTS §4.4〜4.5（ゲート）、§5（state）、§6（指令書）、§7（モジュールAPI）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, masume, masumeJson, newToy, flag, view, char, readLog } from '../helpers.mjs';

const check = (dir, who, extra = []) => masume(['check', who, '--dir', dir, '--as', who, ...extra]);

test('霧: Lv1 の指令書には現在のマスしか出ない', () => {
  const dir = newToy();
  const v = view(dir);
  assert.equal(v.nodes.A1.state, 'current');
  assert.equal(v.nodes.A2.state, 'fog');
  assert.equal(v.nodes.G1.state, 'fog');
  const b = masume(['brief', 'a', '--dir', dir]);
  assert.equal(b.code, 0, b.all);
  assert.match(b.out, /剣をとぐ/);
  assert.match(b.out, /node checks\/flag\.mjs A1/);
  assert.match(b.out, /ふっかつのじゅもん/);
  assert.doesNotMatch(b.out, /盾をみがく/, '霧の先（A2）のタイトルは出ない');
  assert.doesNotMatch(b.out, /洞窟の番人/, '霧の先（G1）のタイトルは出ない');
  const j = masumeJson(['brief', 'a', '--dir', dir]);
  assert.equal(j.code, 0, j.all);
  assert.equal(j.data.character.id, 'a');
  assert.equal(j.data.character.vision, 0);
  assert.equal(j.data.current.id, 'A1');
  assert.equal(j.data.current.sealed, true);
  assert.equal(j.data.current.check.run, 'node checks/flag.mjs A1');
  assert.deepEqual(j.data.visible, []);
  assert.equal(j.data.fog, 6);
  assert.equal(j.data.jumon, v.head.jumon);
  assert.deepEqual(j.data.party.map((p) => p.id), ['b', 'h']);
  assert.ok(Array.isArray(j.data.rules) && j.data.rules.length >= 3);
  assert.doesNotMatch(JSON.stringify(j.data), /盾をみがく/);
});

test('ゲート: 待機・全滅・差し戻し・突破・解散', () => {
  const dir = newToy({ withB3: true });
  for (const id of ['A1', 'A2', 'A3']) flag(dir, id);
  for (let i = 0; i < 3; i++) assert.equal(check(dir, 'a').code, 0);
  let v = view(dir);
  assert.deepEqual([char(v, 'a').at, char(v, 'a').status], ['G1', 'waiting']);
  assert.equal(v.nodes.G1.state, 'waiting');

  // 揃っていなければボス戦はできない
  const early = masume(['check', 'G1', '--dir', dir, '--as', 'gm']);
  assert.equal(early.code, 2, early.all);
  assert.match(early.all, /揃っていません/);
  assert.match(early.all, /魔法使いボブ/);
  const waitBrief = masumeJson(['brief', 'a', '--dir', dir]);
  assert.equal(waitBrief.data.character.status, 'waiting');
  assert.deepEqual(waitBrief.data.waiting_for, ['b']);

  // --no-boss で揃えると ready
  flag(dir, 'B1');
  flag(dir, 'B2');
  assert.equal(check(dir, 'b').code, 0);
  assert.equal(check(dir, 'b', ['--no-boss']).code, 0);
  v = view(dir);
  assert.equal(v.nodes.G1.state, 'ready');

  // ボス戦に負ける（BLAME なし）→ 全滅
  const lose = masume(['check', 'G1', '--dir', dir, '--as', 'gm']);
  assert.equal(lose.code, 1, lose.all);
  assert.match(lose.out, /全滅/);
  let ev = readLog(dir).pop();
  assert.equal(ev.type, 'gate_failed');
  assert.equal(ev.data.gate, 'G1');
  assert.deepEqual([...ev.data.members].sort(), ['a', 'b']);
  assert.deepEqual([...ev.data.blamed].sort(), ['a', 'b']);
  v = view(dir);
  let a = char(v, 'a');
  let b = char(v, 'b');
  assert.deepEqual([a.at, a.level, a.xp, a.status], ['A3', 1, 0, 'working'], 'a は宿屋の次（A3）まで戻る');
  assert.deepEqual([b.at, b.level, b.xp], ['B1', 1, 0], 'b はふりだしまで戻る');
  assert.equal(v.nodes.A3.state, 'stale');
  assert.equal(v.nodes.B1.state, 'stale');
  assert.equal(v.nodes.B2.state, 'stale');
  assert.equal(v.nodes.A1.state, 'cleared', '宿屋より前は消えない');
  assert.equal(v.nodes.G1.state, 'fog');
  assert.equal(v.nodes.G1.fails, 1);

  // 責任者だけ差し戻し（MASUME_BLAME: b）。最後に着いた b の判定の中で自動ボス戦
  flag(dir, 'G1', 'blame:b');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(check(dir, 'b').code, 0);
  const auto = check(dir, 'b');
  assert.equal(auto.code, 1, auto.all);
  assert.match(auto.out, /差し戻し/);
  ev = readLog(dir).pop();
  assert.equal(ev.type, 'gate_failed');
  assert.deepEqual(ev.data.blamed, ['b']);
  v = view(dir);
  a = char(v, 'a');
  b = char(v, 'b');
  assert.deepEqual([a.at, a.status, a.level], ['G1', 'waiting', 1], 'a は待ち続ける');
  assert.deepEqual([b.at, b.level], ['B1', 1]);

  // 突破 → 解散
  flag(dir, 'G1');
  assert.equal(check(dir, 'b').code, 0);
  const win = check(dir, 'b');
  assert.equal(win.code, 0, win.all);
  assert.match(win.out, /結合ゲート突破/);
  ev = readLog(dir).pop();
  assert.equal(ev.type, 'gate_cleared');
  assert.equal(ev.data.gate, 'G1');
  v = view(dir);
  a = char(v, 'a');
  b = char(v, 'b');
  assert.deepEqual([a.at, a.level, a.xp, a.checkpoint, a.status], ['A4', 2, 1, 'G1', 'working']);
  assert.deepEqual([b.at, b.level, b.xp, b.checkpoint], ['B3', 2, 1, 'G1']);
  assert.equal(v.nodes.G1.state, 'cleared');
  assert.equal(v.nodes.A4.state, 'current');
  assert.equal(v.nodes.FIN.state, 'open', 'Lv2 は1マス先（あがり）が見える');
  const br = masume(['brief', 'a', '--dir', dir]);
  assert.match(br.out, /宝箱をあける/);
  assert.match(br.out, /あがり/);

  // あがり: h のハンコ → a → b で揃って自動ボス戦
  flag(dir, 'A4');
  flag(dir, 'FIN');
  assert.equal(masume(['stamp', 'H1', '--dir', dir, '--as', 'h']).code, 0);
  assert.equal(check(dir, 'a').code, 0);
  const fin = check(dir, 'b');
  assert.equal(fin.code, 0, fin.all);
  v = view(dir);
  assert.equal(v.finished, true);
  assert.equal(v.nodes.FIN.state, 'cleared');
  for (const c of v.characters) {
    assert.equal(c.status, 'done', `${c.id} はあがり`);
    assert.equal(c.at, null);
  }
  const done = check(dir, 'a');
  assert.equal(done.code, 2, done.all);
  assert.match(done.all, /E_DONE/);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

test('モジュール API: buildView は status --json と同じ、ログに日本語の要約', async () => {
  const dir = newToy();
  flag(dir, 'A1');
  check(dir, 'a');
  check(dir, 'a');
  masume(['note', 'a', 'A2は盾の裏がまだ', '--dir', dir, '--as', 'a']);
  const engine = await import(pathToFileURL(join(ROOT, 'src', 'engine', 'index.js')).href);
  for (const fn of ['findRoot', 'validateMap', 'newGame', 'buildView', 'brief', 'check', 'stamp', 'seal', 'appendEvent', 'verify', 'repair', 'jumonOf', 'logFile', 'outputFile', 'amend', 'load'])
    assert.equal(typeof engine[fn], 'function', `engine.${fn}`);
  assert.equal(typeof engine.MasumeError, 'function');
  const fromModule = JSON.parse(JSON.stringify(engine.buildView(dir)));
  assert.deepEqual(fromModule, view(dir));
  assert.equal(engine.findRoot(join(dir, 'flags')), dir);
  assert.equal(engine.logFile(dir), join(dir, '.masume', 'log.jsonl'));
  const last = fromModule.log[fromModule.log.length - 1];
  assert.equal(last.type, 'note');
  assert.equal(last.character, 'a');
  const failed = fromModule.log.find((e) => e.type === 'check_failed');
  assert.equal(failed.ok, false);
  assert.equal(failed.node, 'A2');
  assert.ok(failed.text.length > 0);
  assert.equal(char(fromModule, 'a').last_note, 'A2は盾の裏がまだ');
  const bj = engine.brief(dir, 'a');
  assert.equal(bj.notes[0].text, 'A2は盾の裏がまだ');
  const failedSeq = readLog(dir).find((e) => e.type === 'check_failed').seq;
  assert.ok(engine.outputFile(dir, failedSeq).endsWith('.log'));
  assert.equal(engine.outputFile(dir, 0), null);

  // ハンコ API: boss:false でも ready になったゲートを教える
  const dir2 = newToy({ withB3: true });
  for (const id of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'G1', 'FIN']) flag(dir2, id);
  for (const who of ['a', 'a', 'a', 'b', 'b', 'a', 'b']) assert.equal(check(dir2, who).code, 0, `check ${who}`);
  const r = await engine.stamp(dir2, 'H1', { actor: 'h', as: 'h', boss: false });
  assert.equal(r.ready, 'FIN');
  assert.equal(engine.buildView(dir2).nodes.FIN.state, 'ready');
});
