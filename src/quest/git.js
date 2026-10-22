// 語り部: Git でセーブする新しい冒険（CONTRACTS §46.2・§46.3）。
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const IDENTITY = { name: 'GridHub', email: 'gridhub@localhost' };

function git(root, args, env = {}) {
  const base = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete base[key];
  const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd: root, env: { ...base, ...env }, encoding: 'utf8', timeout: 60_000 });
  return { ok: !r.error && r.status === 0, missing: r.error?.code === 'ENOENT', out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
}

/** 生まれた地図に quest.save が無ければ "git" を足して、quest.map.json も書き直す。足したら true */
export function ensureGitSave(mapFile) {
  const map = JSON.parse(readFileSync(mapFile, 'utf8'));
  if (map?.quest && typeof map.quest === 'object' && !Object.hasOwn(map.quest, 'save')) {
    map.quest.save = 'git';
    writeFileSync(mapFile, `${JSON.stringify(map, null, 2)}\n`);
    return true;
  }
  return false;
}

/**
 * ルートが Git の作業ツリーの中でなければ git init する。
 * 戻り値: { initialized: true } / { initialized: false }（もとから Git の中）/ { initialized: false, error }（git が無いなど）
 */
export function ensureRepository(root) {
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (inside.missing) return { initialized: false, error: 'git が見つかりません' };
  if (inside.ok && inside.out === 'true') return { initialized: false };
  const init = git(root, ['init', '-q']);
  if (!init.ok) return { initialized: false, error: init.missing ? 'git が見つかりません' : `git init に失敗しました: ${init.err}` };
  return { initialized: true };
}

/** git init した冒険の、ルートの全部（.gitignore に従う）を「gridhub: 冒険のはじまり」としてコミットする。フックは走らせない */
export function commitBeginning(root) {
  const name = git(root, ['config', 'user.name']).out || IDENTITY.name;
  const email = git(root, ['config', 'user.email']).out || IDENTITY.email;
  const env = { GIT_AUTHOR_NAME: name, GIT_COMMITTER_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_EMAIL: email };
  const add = git(root, ['add', '-A', '--', '.'], env);
  if (!add.ok) return { commit: null, error: `git add に失敗しました: ${add.err}` };
  const commit = git(root, ['commit', '-q', '--no-verify', '--no-gpg-sign', '--allow-empty', '-m', 'gridhub: 冒険のはじまり'], env);
  if (!commit.ok) return { commit: null, error: `git commit に失敗しました: ${commit.err}` };
  return { commit: git(root, ['rev-parse', 'HEAD']).out };
}
