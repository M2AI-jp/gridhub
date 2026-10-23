// E10「町 = セーブ = Git のコミット」— CONTRACTS §43（第11章）。負けたら町のコミットに戻り、戻す前の変更は墓（git stash）に残る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  tmp, masume, masumeJson, gridhub, view, char, setupDungeon, setCases, passAll, setFlag,
  git, gitInit, GIT_ENV, events,
} from '../helpers5.mjs';

const run = (dir, args) => masume([...args, '--dir', dir], { env: GIT_ENV });
const check = (dir, who) => run(dir, ['check', who, '--as', who]);
const write = (dir, file, text) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), text);
};

function gitDungeon() {
  const dir = tmp('gridhub-e10-');
  gitInit(dir);
  setupDungeon(dir, { save: true });
  const r = masume(['new', 'dungeon.map.json'], { cwd: dir, env: GIT_ENV });
  assert.equal(r.code, 0, r.all);
  return dir;
}

test('§43.3 ふりだし: 冒険の書が生まれると、Git の最初のコミット（ふりだし）を記録する', () => {
  const dir = gitDungeon();
  const saved = events(dir, 'saved');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].data.node, null);
  assert.deepEqual([...saved[0].data.characters].sort(), ['a', 'b', 'h']);
  assert.match(saved[0].data.commit, /^[0-9a-f]{40}$/);
  assert.equal(git(dir, ['rev-parse', 'HEAD']).out, saved[0].data.commit);
  assert.match(git(dir, ['log', '-1', '--format=%s']).out, /^gridhub save: ふりだし/);
  assert.match(git(dir, ['log', '-1', '--format=%an <%ae>']).out, /GridHub <gridhub@localhost>/, '名前が無ければ GridHub');
  assert.equal(git(dir, ['ls-tree', '-r', '--name-only', 'HEAD']).out, '', '縄張りの外（地図・判定）はコミットしない');
  assert.equal(view(dir).log.find((e) => e.type === 'saved').text, '戦士アリス、魔法使いボブ、勇者ひとみ が ふりだし でセーブした（commit ' + saved[0].data.commit.slice(0, 7) + '）');
});

test('§43.2・§43.3 町に着くと、縄張りの変更だけをコミットする（ほかの変更やステージには触れない）', () => {
  const dir = gitDungeon();
  write(dir, 'a/x.js', 'export const x = 1;\n');
  write(dir, 'b/ui.js', 'export const ui = 1;\n');
  write(dir, 'notes.txt', 'メモ\n');
  write(dir, 'staged.txt', 'ステージしたもの\n');
  assert.equal(git(dir, ['add', 'staged.txt']).code, 0);
  passAll(dir, 'A1');
  passAll(dir, 'A2');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(events(dir, 'saved').length, 1, 'まだ町に着いていない');
  write(dir, 'a/y.js', 'export const y = 2;\n');
  const c = check(dir, 'a');
  assert.equal(c.code, 0, c.all);
  const saved = events(dir, 'saved').at(-1);
  assert.equal(saved.data.node, 'AC');
  assert.deepEqual(saved.data.characters, ['a']);
  assert.equal(saved.data.changed, true);
  assert.deepEqual([...saved.data.files].sort(), ['a/x.js', 'a/y.js']);
  assert.equal(git(dir, ['rev-parse', 'HEAD']).out, saved.data.commit);
  assert.match(git(dir, ['log', '-1', '--format=%s']).out, /^gridhub save: AC 村の宿屋/);
  assert.deepEqual(git(dir, ['show', '--name-only', '--format=', 'HEAD']).out.split('\n').sort(), ['a/x.js', 'a/y.js']);
  const status = git(dir, ['status', '--porcelain']).out;
  assert.match(status, /^A  staged\.txt$/m, 'ステージしたものはステージのまま');
  assert.match(status, /^\?\? b\//m, 'ほかの人の縄張りはそのまま');
  assert.match(status, /^\?\? notes\.txt$/m);
  assert.doesNotMatch(status, /a\//, 'a の縄張りはコミット済み');
  const v = view(dir);
  assert.deepEqual(char(v, 'a').save, { seq: saved.seq, node: 'AC', commit: saved.data.commit });
  assert.deepEqual(v.nodes.AC.save, { seq: saved.seq, commit: saved.data.commit });
  assert.match(v.log.find((e) => e.seq === saved.seq).text, /戦士アリス が AC でセーブした（commit [0-9a-f]{7}）/);
});

test('§43.4 負けたら、縄張りを町のコミットに戻す。戻す前の変更は墓（git stash）に残る', () => {
  const dir = gitDungeon();
  write(dir, 'a/x.js', 'export const x = 1;\n');
  passAll(dir, 'A1');
  passAll(dir, 'A2');
  check(dir, 'a');
  check(dir, 'a');
  const town = events(dir, 'saved').at(-1).data.commit;
  // 町のあとで変えたもの（変更・追加）
  write(dir, 'a/x.js', 'export const x = 999; // こわした\n');
  write(dir, 'a/new.js', 'export const n = 1;\n');
  write(dir, 'b/keep.js', 'b のもの\n');
  setCases(dir, 'A3', { 'u が 6': 'ok', 't が 7': 'fail' });
  const f = check(dir, 'a');
  assert.equal(f.code, 1);
  const failed = events(dir, 'check_failed').at(-1);
  const restored = events(dir, 'restored').at(-1);
  assert.equal(restored.seq, failed.seq + 1, '判定の記録のすぐ後');
  assert.equal(restored.data.character, 'a');
  assert.equal(restored.data.node, 'A3');
  assert.equal(restored.data.commit, town);
  assert.match(restored.data.stash, /^[0-9a-f]{40}$/);
  assert.equal(readFileSync(join(dir, 'a', 'x.js'), 'utf8'), 'export const x = 1;\n', '町のコミットに戻った');
  assert.equal(existsSync(join(dir, 'a', 'new.js')), false, '町のあとで足したファイルも墓へ');
  assert.equal(readFileSync(join(dir, 'b', 'keep.js'), 'utf8'), 'b のもの\n', 'ほかの人の縄張りは触らない');
  assert.match(git(dir, ['stash', 'list']).out, /gridhub grave: a A3 seq \d+/);
  const v = view(dir);
  assert.deepEqual(char(v, 'a').grave, { seq: restored.seq, node: 'A3', commit: town, stash: restored.data.stash });
  const b = masumeJson(['brief', 'a', '--dir', dir]).data;
  assert.equal(b.save, 'git');
  assert.equal(b.grave.command, `git stash apply ${restored.data.stash}`);
  assert.match(gridhub(['brief', 'a', '--dir', dir]).out, new RegExp(`墓: git stash apply ${restored.data.stash}`));
  assert.match(v.log.find((e) => e.seq === restored.seq).text, /戦士アリス の縄張りを commit [0-9a-f]{7} に戻した（墓: stash [0-9a-f]{7}）/);
  // 墓から取り出せる
  assert.equal(git(dir, ['stash', 'apply', restored.data.stash]).code, 0);
  assert.equal(readFileSync(join(dir, 'a', 'x.js'), 'utf8'), 'export const x = 999; // こわした\n');
});

test('§43.3・§43.4 ゲート: 突破でメンバー全員の縄張りを1つのコミットに。負けたら責任のある仲間だけ戻す', () => {
  const dir = gitDungeon();
  for (const n of ['A1', 'A2', 'A3', 'B1', 'B2']) passAll(dir, n);
  write(dir, 'a/x.js', 'a\n');
  for (let i = 0; i < 3; i++) assert.equal(check(dir, 'a').code, 0);
  write(dir, 'b/ui.js', 'b\n');
  write(dir, 'shared/b1.txt', 'b の共有\n');
  write(dir, 'shared/zz.txt', 'だれのでもない\n');
  setCases(dir, 'G1', { '結合 1': 'ok', '結合 2': 'fail' });
  write(dir, 'a/x.js', 'a かえた\n');
  assert.equal(check(dir, 'b').code, 0);
  const aTown = events(dir, 'saved').filter((e) => e.data.characters.includes('a')).at(-1).data.commit;
  assert.equal(check(dir, 'b').code, 1, 'b がそろってボス戦、結合 2 で負ける');
  const failed = events(dir, 'gate_failed').at(-1);
  assert.deepEqual([...failed.data.blamed].sort(), ['a', 'b'], 'MASUME_BLAME が無ければ全員');
  const restored = events(dir, 'restored').filter((e) => e.seq > failed.seq);
  assert.deepEqual(restored.map((e) => e.data.character).sort(), ['a', 'b']);
  assert.equal(existsSync(join(dir, 'b', 'ui.js')), false, 'b の町はふりだし（b の縄張りは空）');
  assert.equal(existsSync(join(dir, 'shared', 'b1.txt')), false, '{a,b} の glob も縄張り');
  assert.equal(readFileSync(join(dir, 'a', 'x.js'), 'utf8'), 'a\n', 'a は町（AC）のコミットのまま');
  assert.equal(readFileSync(join(dir, 'shared', 'zz.txt'), 'utf8'), 'だれのでもない\n', '縄張りの外は触らない');
  assert.equal(git(dir, ['rev-parse', 'HEAD']).out, aTown, '戻すときはコミットしない');

  // 直して、もう一度ボス戦 → 突破でメンバー全員の縄張りを1つのコミットに
  setCases(dir, 'G1', { '結合 1': 'ok', '結合 2': 'ok' });
  write(dir, 'a/g.js', 'a gate\n');
  write(dir, 'b/g.js', 'b gate\n');
  write(dir, 'shared/b1.txt', 'b の共有\n');
  assert.equal(run(dir, ['check', 'a', '--as', 'a', '--no-boss']).code, 0);
  assert.equal(run(dir, ['check', 'b', '--as', 'b', '--no-boss']).code, 0);
  assert.equal(run(dir, ['check', 'b', '--as', 'b', '--no-boss']).code, 0);
  assert.equal(char(view(dir), 'a').status, 'waiting');
  const win = run(dir, ['check', 'G1']);
  assert.equal(win.code, 0, win.all);
  const saved = events(dir, 'saved').at(-1);
  assert.equal(saved.data.node, 'G1');
  assert.deepEqual([...saved.data.characters].sort(), ['a', 'b']);
  const files = git(dir, ['show', '--name-only', '--format=', 'HEAD']).out.split('\n').sort();
  assert.deepEqual(files, ['a/g.js', 'b/g.js', 'shared/b1.txt']);
  assert.deepEqual(view(dir).nodes.G1.save.commit, saved.data.commit);
});

test('§43 quest.save が無い冒険では Git に触らない。Git の外なら記録だけ（判定は変えない）', () => {
  const dir = tmp('gridhub-e10n-');
  gitInit(dir);
  setupDungeon(dir, { save: false });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: GIT_ENV }).code, 0);
  write(dir, 'a/x.js', 'x\n');
  passAll(dir, 'A1');
  passAll(dir, 'A2');
  check(dir, 'a');
  check(dir, 'a');
  setCases(dir, 'A3', {});
  check(dir, 'a');
  assert.equal(events(dir, 'saved').length + events(dir, 'restored').length, 0);
  assert.notEqual(git(dir, ['rev-parse', '--verify', '-q', 'HEAD']).code, 0, 'コミットしない');
  assert.equal(readFileSync(join(dir, 'a', 'x.js'), 'utf8'), 'x\n');

  const out = tmp('gridhub-e10o-');
  setupDungeon(out, { save: true });
  const r = masume(['new', 'dungeon.map.json'], { cwd: out, env: { ...GIT_ENV, GIT_CEILING_DIRECTORIES: join(out, '..') } });
  assert.equal(r.code, 0, r.all);
  const s = events(out, 'saved');
  assert.equal(s.length, 1);
  assert.equal(s[0].data.commit, null);
  assert.equal(typeof s[0].data.error, 'string');
  setFlag(out, 'FIN');
  assert.equal(masume(['verify', '--dir', out]).code, 0);
});
