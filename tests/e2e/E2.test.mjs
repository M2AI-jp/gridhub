// E2「判定をくだす」— CONTRACTS §4.1〜4.3, 4.6, 4.7 と §5（status --json）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, appendFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeAsync, newToy, setupToy, toyMap, flag, unflag, view, char, readLog, sha256 } from '../helpers.mjs';

const check = (dir, who, extra = []) => masume(['check', who, '--dir', dir, '--as', who, ...extra]);

test('ふりだし: 全員が最初のマスにいる', () => {
  const dir = newToy();
  const v = view(dir);
  assert.equal(v.masume, 1);
  assert.equal(v.quest.id, 'TOY');
  assert.equal(v.map_version, 1);
  assert.deepEqual(v.characters.map((c) => c.id), ['a', 'b', 'h']);
  const a = char(v, 'a');
  assert.equal(a.name, '戦士アリス');
  assert.equal(a.job, 'warrior');
  assert.deepEqual(
    { pos: a.pos, at: a.at, level: a.level, xp: a.xp, xp_next: a.xp_next, vision: a.vision, status: a.status, checkpoint: a.checkpoint, clears: a.clears, fails: a.fails },
    { pos: 0, at: 'A1', level: 1, xp: 0, xp_next: 2, vision: 0, status: 'working', checkpoint: null, clears: 0, fails: 0 },
  );
  assert.equal(v.nodes.A1.state, 'current');
  assert.equal(v.nodes.A1.owner, 'a');
  assert.deepEqual(v.nodes.A1.members, ['a']);
  assert.equal(v.nodes.A1.xp, 1);
  assert.equal(v.nodes.A1.rollback_to, '@camp');
  assert.equal(v.nodes.A1.sealed, true);
  assert.equal(v.nodes.B3.sealed, false, 'B3 は判定ファイルが無いので未封印');
  assert.equal(v.nodes.G1.owner, null);
  assert.deepEqual(v.nodes.G1.members, ['a', 'b']);
  assert.equal(v.nodes.G1.xp, 3);
  assert.equal(v.nodes.AC.xp, 0);
  assert.equal(v.finished, false);
  assert.equal(v.integrity.ok, true);
  assert.match(v.head.jumon, /^[ぁ-ん]{3}( [ぁ-ん]{3}){3}$/);
  assert.ok(Array.isArray(v.log) && v.log[0].type === 'genesis');
  for (const e of v.log) assert.ok('seq' in e && 'text' in e && 'ok' in e && 'character' in e && 'node' in e);
});

test('判定に失敗しても Lv1 より下がらず、成功すれば進む', () => {
  const dir = newToy();
  const f = check(dir, 'a');
  assert.equal(f.code, 1, f.all);
  assert.match(f.out, /判定失敗/);
  let a = char(view(dir), 'a');
  assert.deepEqual([a.at, a.level, a.xp, a.fails], ['A1', 1, 0, 1]);
  const failed = readLog(dir).pop();
  assert.equal(failed.type, 'check_failed');
  assert.equal(failed.data.character, 'a');
  assert.equal(failed.data.node, 'A1');
  assert.equal(failed.data.failed, 'A1');
  assert.deepEqual(failed.data.ran, ['A1']);
  assert.equal(failed.actor, 'a');

  flag(dir, 'A1');
  const p = check(dir, 'a');
  assert.equal(p.code, 0, p.all);
  assert.match(p.out, /判定成功/);
  const v = view(dir);
  a = char(v, 'a');
  assert.deepEqual([a.at, a.level, a.xp, a.clears], ['A2', 1, 1, 1]);
  assert.equal(v.nodes.A1.state, 'cleared');
  assert.equal(v.nodes.A1.clears, 1);
  assert.equal(v.nodes.A2.state, 'current');

  // 判定の出力が証拠として残る
  const passed = readLog(dir).pop();
  assert.equal(passed.type, 'check_passed');
  assert.deepEqual(passed.data.ran, ['A1']);
  const out = join(dir, '.masume', passed.data.output);
  assert.ok(existsSync(out), passed.data.output);
  assert.equal(passed.data.output_hash, sha256(readFileSync(out)));
  assert.match(readFileSync(out, 'utf8'), /=== A1: node checks\/flag\.mjs A1 ===[\s\S]*PASS A1/);
  assert.equal(typeof passed.data.duration_ms, 'number');
  assert.ok('git' in passed.data);
});

test('累積判定・宿屋・レベルアップ・@here の巻き戻し', () => {
  const dir = newToy();
  flag(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  flag(dir, 'A2');
  const r = check(dir, 'a');
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(readLog(dir).pop().data.ran, ['A1', 'A2'], '宿屋より前の自分のマスをまとめて判定する');
  let v = view(dir);
  let a = char(v, 'a');
  assert.deepEqual([a.at, a.level, a.xp, a.xp_next, a.vision, a.checkpoint], ['A3', 2, 0, 3, 1, 'AC'], '宿屋を通過してレベル2');
  assert.equal(v.nodes.AC.state, 'cleared');

  // A3 は @here: 失敗してもその場。宿屋より前（A1, A2）は再判定しない
  const f = check(dir, 'a');
  assert.equal(f.code, 1, f.all);
  const ev = readLog(dir).pop();
  assert.deepEqual(ev.data.ran, ['A3']);
  v = view(dir);
  a = char(v, 'a');
  assert.deepEqual([a.at, a.level, a.xp, a.fails], ['A3', 1, 0, 1]);
  assert.equal(v.nodes.A1.state, 'cleared');
  assert.equal(v.nodes.A3.fails, 1);
});

test('前のマスを壊したら所定の位置（ふりだし）まで戻され、消しゴムで消される', () => {
  const dir = newToy();
  flag(dir, 'B1');
  assert.equal(check(dir, 'b').code, 0);
  unflag(dir, 'B1'); // あとの作業で B1 を壊した
  flag(dir, 'B2');
  const f = check(dir, 'b');
  assert.equal(f.code, 1, f.all);
  const ev = readLog(dir).pop();
  assert.equal(ev.data.node, 'B2');
  assert.equal(ev.data.failed, 'B1');
  let v = view(dir);
  let b = char(v, 'b');
  assert.deepEqual([b.at, b.pos, b.level, b.xp], ['B1', 0, 1, 0]);
  assert.equal(v.nodes.B1.state, 'stale', 'B1 は消しゴムで消された');
  assert.equal(v.nodes.B1.fails, 1);

  // 直して再判定: 消されたマスは戻るが経験値は入らない
  flag(dir, 'B1');
  assert.equal(check(dir, 'b').code, 0);
  v = view(dir);
  b = char(v, 'b');
  assert.deepEqual([b.at, b.xp, b.level, b.clears], ['B2', 0, 1, 2]);
  assert.equal(v.nodes.B1.state, 'cleared');
  assert.equal(v.nodes.B1.clears, 2);
});

test('封印が破れていたら判定できない（記録は残る）、封印し直せば判定できる', () => {
  const dir = newToy();
  flag(dir, 'B1');
  const before = char(view(dir), 'b');
  appendFileSync(join(dir, 'checks', 'flag.mjs'), '// こっそり\n');
  const r = check(dir, 'b');
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /封印が破れています/);
  assert.match(r.all, /E_SEAL_BROKEN/);
  const ev = readLog(dir).pop();
  assert.equal(ev.type, 'seal_broken');
  assert.equal(ev.data.node, 'B1');
  assert.equal(ev.data.files[0].path, 'checks/flag.mjs');
  const v = view(dir);
  assert.equal(v.nodes.B1.seal_broken, true);
  const after = char(v, 'b');
  assert.deepEqual([after.at, after.level, after.fails], [before.at, before.level, before.fails], '盤面は動かない');

  assert.equal(masume(['seal', '--all', '--dir', dir, '--as', 'gm']).code, 0);
  assert.equal(view(dir).nodes.B1.seal_broken, false);
  assert.equal(check(dir, 'b').code, 0);
});

test('未封印のマスは判定できない', () => {
  const dir = tmp('masume-toy-');
  setupToy(dir);
  rmSync(join(dir, 'checks', 'flag.mjs')); // 判定ファイルが無いまま冒険を始める
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 0);
  setupToy(dir); // あとから判定ファイルが置かれた
  flag(dir, 'A1');
  const r = check(dir, 'a');
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /未封印/);
  assert.match(r.all, /E_UNSEALED/);
  assert.equal(view(dir).nodes.A1.sealed, false);
  assert.equal(masume(['seal', 'A1', '--dir', dir, '--as', 'gm']).code, 0);
  assert.equal(check(dir, 'a').code, 0);
});

test('ハンコ: 人間のマスは本人のハンコでだけ進む', () => {
  const dir = newToy();
  const c = check(dir, 'h');
  assert.equal(c.code, 2, c.all);
  assert.match(c.all, /ハンコ/);
  assert.match(c.all, /E_NEEDS_STAMP/);
  const wrong = masume(['stamp', 'H1', '--dir', dir, '--as', 'a']);
  assert.equal(wrong.code, 2, wrong.all);
  assert.match(wrong.all, /E_STAMP/);
  const ok = masume(['stamp', 'H1', '--dir', dir, '--as', 'h']);
  assert.equal(ok.code, 0, ok.all);
  const ev = readLog(dir).pop();
  assert.equal(ev.type, 'stamped');
  assert.deepEqual(ev.data, { character: 'h', node: 'H1', by: 'h' });
  const v = view(dir);
  const h = char(v, 'h');
  assert.deepEqual([h.at, h.status, h.xp], ['FIN', 'waiting', 1]);
  assert.equal(v.nodes.H1.state, 'cleared');
  assert.equal(v.nodes.FIN.state, 'waiting');
  const twice = masume(['stamp', 'H1', '--dir', dir, '--as', 'h']);
  assert.equal(twice.code, 2, twice.all);
});

test('同時に宣言しても二重には進まない（楽観ロック）', async () => {
  const dir = tmp('masume-toy-');
  const map = toyMap();
  map.nodes.A1.check = { kind: 'cmd', run: 'node -e "setTimeout(() => {}, 2000)"' }; // 2秒かかる判定（封印ファイルなし）
  setupToy(dir, { map });
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 0);
  const rs = await Promise.all([1, 2, 3].map(() => masumeAsync(['check', 'a', '--dir', dir, '--as', 'a'])));
  const all = rs.map((r) => r.all).join('\n---\n');
  assert.equal(rs.filter((r) => r.code === 0).length, 1, all);
  assert.equal(rs.filter((r) => r.code === 2 && /E_CONFLICT/.test(r.all)).length, 2, all);
  const passedA1 = readLog(dir).filter((e) => e.type === 'check_passed' && e.data.node === 'A1');
  assert.equal(passedA1.length, 1);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
  assert.equal(char(view(dir), 'a').at, 'A2');
});

test('知らない相手・あがり済み・人間向けの表示', () => {
  const dir = newToy();
  const u = masume(['check', 'zz', '--dir', dir]);
  assert.equal(u.code, 2, u.all);
  assert.match(u.all, /E_UNKNOWN/);
  const s = masume(['status', '--dir', dir]);
  assert.equal(s.code, 0, s.all);
  for (const word of ['戦士アリス', '魔法使いボブ', '勇者ひとみ', 'A1', 'ふっかつのじゅもん']) assert.match(s.out, new RegExp(word));
});
