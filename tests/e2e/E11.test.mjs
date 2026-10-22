// E11「Git のセーブの作法」— CONTRACTS §43.2（第11章）のうち E10 で確かめていない所。
// ゲームのルートが Git のサブディレクトリでも動く・フックを走らせない・署名しない・ユーザーの名前があればそれを使う。
// そして、Git のセーブはユーザーの変更を決して壊さない（merge の途中は触らない・ignore されたファイルも墓に・リンクの先に書かない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, chmodSync, symlinkSync, rmSync, statSync, lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, setupDungeon, passAll, setCases, git, gitInit, GIT_ENV, events } from '../helpers5.mjs';

const write = (dir, file, text) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), text);
};

test('§43.2 ルートが Git のサブディレクトリ。フックは走らせず、commit.gpgsign があっても署名しない', () => {
  const repo = tmp('gridhub-e11-');
  gitInit(repo);
  for (const hook of ['pre-commit', 'commit-msg', 'post-commit', 'reference-transaction']) {
    write(repo, `.git/hooks/${hook}`, '#!/bin/sh\necho "フックが走った" >&2\nexit 1\n');
    chmodSync(join(repo, '.git', 'hooks', hook), 0o755);
  }
  assert.equal(git(repo, ['config', 'commit.gpgsign', 'true']).code, 0);
  assert.equal(git(repo, ['config', 'user.signingkey', 'GRIDHUB-NO-SUCH-KEY']).code, 0);
  assert.equal(git(repo, ['config', 'user.name', '冒険者']).code, 0);
  assert.equal(git(repo, ['config', 'user.email', 'player@example.com']).code, 0);
  write(repo, 'top.txt', 'ルートの外\n');
  write(repo, 'a/outside.js', 'ルートの外の a/\n');

  const root = join(repo, 'game');
  mkdirSync(root);
  setupDungeon(root, { save: true });
  const r = masume(['new', 'dungeon.map.json'], { cwd: root, env: GIT_ENV });
  assert.equal(r.code, 0, r.all);
  const start = events(root, 'saved')[0];
  assert.match(start.data.commit ?? '', /^[0-9a-f]{40}$/, start.data.error);

  write(root, 'a/x.js', 'x\n');
  passAll(root, 'A1');
  passAll(root, 'A2');
  const check = (who) => masume(['check', who, '--as', who, '--dir', root], { env: GIT_ENV });
  assert.equal(check('a').code, 0);
  const c = check('a');
  assert.equal(c.code, 0, c.all);
  const saved = events(root, 'saved').at(-1);
  assert.equal(saved.data.node, 'AC', saved.data.error);
  assert.deepEqual(saved.data.files, ['a/x.js'], 'ファイルはゲームのルートからの相対パス');
  assert.deepEqual(git(repo, ['show', '--name-only', '--format=', 'HEAD']).out.split('\n'), ['game/a/x.js'], 'ルートの外の a/ はコミットしない');
  assert.equal(git(repo, ['log', '-1', '--format=%an <%ae>']).out, '冒険者 <player@example.com>', 'ユーザーの名前があればそれ');
  assert.equal(git(repo, ['log', '-1', '--format=%G?']).out, 'N', '署名しない');
  assert.doesNotMatch(c.all, /フックが走った/);

  // 負けて戻る（サブディレクトリでも墓に残る）
  write(root, 'a/x.js', 'こわした\n');
  setCases(root, 'A3', {});
  assert.equal(check('a').code, 1);
  const restored = events(root, 'restored').at(-1);
  assert.equal(restored.data.error, undefined, restored.data.error);
  assert.match(restored.data.stash, /^[0-9a-f]{40}$/);
  assert.equal(readFileSync(join(root, 'a', 'x.js'), 'utf8'), 'x\n');
  assert.equal(readFileSync(join(repo, 'a', 'outside.js'), 'utf8'), 'ルートの外の a/\n', 'ルートの外は触らない');
  assert.equal(masume(['verify', '--dir', root]).code, 0);
});

/** a を町（AC）まで進めてセーブさせた Git の冒険 */
function townDungeon(prepare = () => {}) {
  const root = tmp('gridhub-e11t-');
  gitInit(root);
  setupDungeon(root, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: root, env: GIT_ENV }).code, 0);
  prepare(root);
  passAll(root, 'A1');
  passAll(root, 'A2');
  const check = (who) => masume(['check', who, '--as', who, '--dir', root], { env: GIT_ENV });
  assert.equal(check('a').code, 0);
  assert.equal(check('a').code, 0);
  assert.equal(events(root, 'saved').at(-1).data.node, 'AC');
  return { root, check };
}

test('§43 Git が merge の途中なら、セーブも巻き戻しもしない（ユーザーの作業を壊さない）', () => {
  const { root, check } = townDungeon((r) => write(r, 'a/x.js', '1\n'));
  write(root, 'a/x.js', 'merge の途中の変更\n');
  const head = git(root, ['rev-parse', 'HEAD']).out;
  writeFileSync(join(root, '.git', 'MERGE_HEAD'), `${head}\n`);
  setCases(root, 'A3', {});
  assert.equal(check('a').code, 1, '判定の結果は変わらない');
  const restored = events(root, 'restored').at(-1);
  assert.match(restored.data.error, /MERGE_HEAD/);
  assert.equal(restored.data.stash, null);
  assert.equal(readFileSync(join(root, 'a', 'x.js'), 'utf8'), 'merge の途中の変更\n', '作業ツリーはそのまま');
  assert.equal(git(root, ['stash', 'list']).out, '');
  assert.equal(masume(['verify', '--dir', root]).code, 0);
});

test('§43.4 巻き戻し: .gitignore されたファイルも墓に残し、実行ビットとシンボリックリンクを戻し、リンクの先には書かない', () => {
  const { root, check } = townDungeon((r) => {
    write(r, 'a/x.js', '町の x\n');
    write(r, 'a/run.sh', '#!/bin/sh\necho 町\n');
    chmodSync(join(r, 'a', 'run.sh'), 0o755);
    symlinkSync('x.js', join(r, 'a', 'link'));
    write(r, 'a/cache.log', '町の cache\n');
    write(r, 'a/evil', '町の evil\n');
  });
  const town = events(root, 'saved').at(-1).data.commit;
  // 町のあとで、ユーザーが自分でコミットした（縄張りのファイルを消し・変え、*.log を ignore にし、a/evil をルートの外へのリンクにした）
  const outside = join(root, '..', `${root.split('/').pop()}-outside.txt`);
  writeFileSync(outside, 'ルートの外\n');
  write(root, 'a/x.js', 'ユーザーがコミットした x\n');
  write(root, '.gitignore', '*.log\n');
  assert.equal(git(root, ['rm', '-q', '--cached', 'a/run.sh', 'a/link', 'a/cache.log', 'a/evil']).code, 0);
  rmSync(join(root, 'a', 'run.sh'));
  rmSync(join(root, 'a', 'link'));
  rmSync(join(root, 'a', 'evil'));
  symlinkSync(outside, join(root, 'a', 'evil'));
  assert.equal(git(root, ['add', 'a/x.js', 'a/evil', '.gitignore']).code, 0);
  assert.equal(git(root, ['-c', 'user.name=u', '-c', 'user.email=u@example.com', 'commit', '-q', '-m', 'ユーザーのコミット']).code, 0);
  write(root, 'a/cache.log', 'ignore された大事なメモ\n');
  write(root, 'a/x.js', 'こわした x\n');

  setCases(root, 'A3', {});
  assert.equal(check('a').code, 1);
  const restored = events(root, 'restored').at(-1);
  assert.equal(restored.data.error, undefined, restored.data.error);
  assert.equal(restored.data.commit, town);
  assert.equal(readFileSync(join(root, 'a', 'x.js'), 'utf8'), '町の x\n');
  assert.equal(readFileSync(join(root, 'a', 'run.sh'), 'utf8'), '#!/bin/sh\necho 町\n');
  assert.ok(statSync(join(root, 'a', 'run.sh')).mode & 0o100, '実行ビットも戻る');
  assert.ok(lstatSync(join(root, 'a', 'link')).isSymbolicLink(), 'シンボリックリンクはリンクとして戻る');
  assert.equal(readlinkSync(join(root, 'a', 'link')), 'x.js');
  assert.equal(readFileSync(join(root, 'a', 'cache.log'), 'utf8'), '町の cache\n');
  assert.ok(!lstatSync(join(root, 'a', 'evil')).isSymbolicLink());
  assert.equal(readFileSync(join(root, 'a', 'evil'), 'utf8'), '町の evil\n');
  assert.equal(readFileSync(outside, 'utf8'), 'ルートの外\n', 'リンクの先（ルートの外）には書かない');
  // 墓から、こわした x も ignore されていたメモも取り出せる（ユーザーのコミット済みの変更は HEAD に残っている）
  assert.match(git(root, ['show', 'HEAD:a/x.js']).out, /ユーザーがコミットした x/);
  const grave = git(root, ['show', `${restored.data.stash}:a/x.js`]);
  assert.equal(grave.out, 'こわした x');
  assert.equal(git(root, ['show', `${restored.data.stash}^3:a/cache.log`]).out, 'ignore された大事なメモ', 'ignore されたファイルも墓に');
});

test('§43・§52.5 load は町のセーブのコミットでも指せる（そのセーブを記録した時点に戻る）。じゅもんは受け付けない', () => {
  const { root, check } = townDungeon((r) => write(r, 'a/x.js', '1\n'));
  const town = events(root, 'saved').at(-1);
  setCases(root, 'A3', { 'u が 6': 'ok', 't が 7': 'ok' });
  assert.equal(check('a').code, 0, 'A3 を抜けて G1 へ');
  // 数字だけの短いコミットは seq と読まれる（§52.5）ので、英字が入るところまで伸ばす
  const short = town.data.commit.slice(0, Math.max(7, town.data.commit.search(/[a-f]/) + 1));
  const r = masume(['load', short, '--dir', root, '--as', 'gm']);
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(events(root, 'loaded').at(-1).data, { to_seq: town.seq });
  const v = JSON.parse(masume(['status', '--json', '--dir', root]).out);
  assert.equal(v.characters.find((c) => c.id === 'a').at, 'A3', '町のセーブの時点（A3 の前）に戻る');
  assert.equal(v.head.jumon, undefined);
  assert.equal(masume(['load', 'ぼぼぼ ぼぼぼ ぼぼぼ ぼぼぼ', '--dir', root, '--as', 'gm']).code, 2);
  assert.equal(masume(['verify', '--dir', root]).code, 0);
});
