// 第12章の判定の共通道具（GitHub につなぐ導線: 手元の bare リポジトリ・偽の gh）。GM の縄張り・封印対象。キャラクターは編集しないこと。
// 本物の GitHub には決して触らない。リモートは手元の bare リポジトリ、gh は偽のコマンド（MASUME_GH）で確かめる。
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp } from './helpers5.mjs';

export * from './helpers5.mjs';

const GIT_ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };

/** dir で git を走らせる（名前・メールは一時的に与える）。{code, out, err} */
export function gitc(dir, ...args) {
  const env = { ...process.env, ...GIT_ENV };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete env[k];
  const r = spawnSync('git', ['-c', 'user.name=人', '-c', 'user.email=human@localhost', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=/dev/null', ...args], { cwd: dir, env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '').trim(), err: r.stderr || '' };
}

/** 手でコミットする（ファイルを書いて add して commit）。コミットの sha（40桁）を返す */
export function commitFile(dir, file, text, message = `手で ${file}`) {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), text);
  for (const args of [['add', file], ['commit', '-q', '-m', message]]) {
    const r = gitc(dir, ...args);
    if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${r.err}`);
  }
  return gitc(dir, 'rev-parse', 'HEAD').out;
}

/** main ブランチと最初のコミットのある作業ツリー */
export function gitRepo(prefix = 'gridhub-git-') {
  const dir = tmp(prefix);
  const r = gitc(dir, 'init', '-q', '-b', 'main');
  if (r.code !== 0) throw new Error(`git init: ${r.err}`);
  commitFile(dir, 'README.md', '# メモ\n', '最初のコミット');
  return dir;
}

/** 手元の bare リポジトリ（GitHub の代わり）。そのパスを返す */
export function bareRemote() {
  const dir = join(tmp('gridhub-bare-'), 'remote.git');
  mkdirSync(dir, { recursive: true });
  const r = gitc(dir, 'init', '-q', '--bare', '-b', 'main');
  if (r.code !== 0) throw new Error(`git init --bare: ${r.err}`);
  return dir;
}

/** bare リポジトリの、あるブランチのコミット（無ければ null） */
export function remoteHead(bare, branch = 'main') {
  const r = gitc(bare, 'rev-parse', '-q', '--verify', `refs/heads/${branch}`);
  return r.code === 0 ? r.out : null;
}

/** 偽の gh。mode: 'anon'（入っているがログインしていない）| 'authed'（ログインしている）。そのパスを返す */
export function fakeGh(mode = 'anon') {
  const dir = tmp('gridhub-gh-');
  const file = join(dir, 'gh');
  writeFileSync(file, `#!/bin/sh
if [ "$1" = "--version" ]; then echo "gh version 2.99.0 (fake)"; exit 0; fi
if [ "$1" = "auth" ] && [ "$2" = "status" ]; then
  ${mode === 'authed' ? 'echo "Logged in to github.com as fake"; exit 0' : 'echo "You are not logged into any GitHub hosts." 1>&2; exit 1'}
fi
echo "偽の gh: $*" 1>&2
exit 1
`);
  chmodSync(file, 0o755);
  return file;
}

/** gh が入っていないことにする MASUME_GH */
export const NO_GH = '/nonexistent/gridhub-no-gh';
export { GIT_ENV };
