// 人に見せる「いまの記録」の目印（CONTRACTS §52）: 冒険の書の seq と、Git のコミット。
// 改ざんを見つけるのはハッシュの鎖（verify）、過去に戻るのは load <seq>。
import { spawnSync } from 'node:child_process';

/** ルートが Git の作業ツリーの中なら HEAD の短いハッシュ（7桁）、そうでなければ null */
export function gitCommitOf(root) {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[key];
  const r = spawnSync('git', ['rev-parse', '--verify', '-q', '--short=7', 'HEAD'], {
    cwd: root, env, encoding: 'utf8', timeout: 10_000,
  });
  return !r.error && r.status === 0 && /^[0-9a-f]{7,}$/u.test(r.stdout.trim()) ? r.stdout.trim() : null;
}

/** `記録: seq 42 / Git: commit a1b2c3d`（Git の外なら seq だけ） */
export function recordLine(root, head) {
  const commit = gitCommitOf(root);
  return `記録: seq ${head?.seq ?? '-'}${commit ? ` / Git: commit ${commit}` : ''}`;
}
