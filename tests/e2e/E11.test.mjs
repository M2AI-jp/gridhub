// E11「Git のセーブの作法」— CONTRACTS §43.2（第11章）のうち E10 で確かめていない所。
// ゲームのルートが Git のサブディレクトリでも動く・フックを走らせない・署名しない・ユーザーの名前があればそれを使う。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
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
