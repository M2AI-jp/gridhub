// 町 = セーブ = Git のコミット（CONTRACTS §43）。quest.save が "git" の冒険だけが使う。
// ユーザーのほかの変更やステージ（index）には触れない。push・フック・署名はしない。
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, unlinkSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const FALLBACK = { name: 'GridHub', email: 'gridhub@localhost' };

/** territory の glob（`**`・`*`・`?`・`{a,b}`）を正規表現にする */
export function globToRegExp(glob) {
  let out = '';
  let depth = 0;
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') {
          i++;
          out += '(?:.*/)?';
        } else out += '.*';
      } else out += '[^/]*';
    } else if (c === '?') out += '[^/]';
    else if (c === '{') {
      depth++;
      out += '(?:';
    } else if (c === '}' && depth > 0) {
      depth--;
      out += ')';
    } else if (c === ',' && depth > 0) out += '|';
    else out += c.replace(/[.+^$()|[\]\\]/gu, '\\$&');
  }
  return new RegExp(`^${out}$`, 'u');
}

function matcher(map, characterIds) {
  const patterns = map.characters.filter(({ id }) => characterIds.includes(id))
    .flatMap(({ territory }) => territory ?? [])
    .map((glob) => globToRegExp(glob.replace(/^\.\//u, '')));
  return (file) => !file.startsWith('.masume/') && patterns.some((pattern) => pattern.test(file));
}

function baseEnv() {
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' };
  for (const key of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[key];
  return env;
}

class GitError extends Error {}

function gitRunner(cwd, extraEnv = {}) {
  const env = { ...baseEnv(), ...extraEnv };
  return (args, { input, allowFail = false, raw = false, env: more = {} } = {}) => {
    // フックは走らせない（reference-transaction・post-commit なども）。
    const r = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd, env: { ...env, ...more }, input, timeout: 60_000, maxBuffer: 64 * 1024 * 1024,
      encoding: raw ? 'buffer' : 'utf8',
    });
    if (r.error) throw new GitError(`git を起動できません: ${r.error.code ?? r.error.message}`);
    if (r.status !== 0 && !allowFail) {
      throw new GitError(`git ${args[0]} に失敗しました: ${String(r.stderr || r.stdout).trim().split('\n').at(-1)}`);
    }
    return { code: r.status, out: raw ? r.stdout : r.stdout.replace(/\n$/u, ''), err: r.stderr };
  };
}

/** Git の作業ツリーの情報（ルートの中でなければ null） */
function repository(root) {
  const git = gitRunner(root);
  let inside;
  try {
    inside = git(['rev-parse', '--is-inside-work-tree'], { allowFail: true });
  } catch (error) {
    return { error: error.message };
  }
  if (inside.code !== 0 || inside.out.trim() !== 'true') {
    return { error: 'ゲームのルートが Git の作業ツリーの中ではありません' };
  }
  const top = git(['rev-parse', '--show-toplevel']).out.trim();
  const prefix = git(['rev-parse', '--show-prefix']).out.trim();
  const run = gitRunner(top);
  const head = run(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
  const name = run(['config', 'user.name'], { allowFail: true }).out.trim();
  const email = run(['config', 'user.email'], { allowFail: true }).out.trim();
  const identity = {
    GIT_AUTHOR_NAME: name || FALLBACK.name, GIT_COMMITTER_NAME: name || FALLBACK.name,
    GIT_AUTHOR_EMAIL: email || FALLBACK.email, GIT_COMMITTER_EMAIL: email || FALLBACK.email,
  };
  return { top, prefix, git: gitRunner(top, identity), head: head.code === 0 ? head.out.trim() : null };
}

/** ルートの中で、Git で変更・追加・削除されているファイル（ルートからの相対パス） */
function changedFiles(repo) {
  const out = repo.git(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--',
    repo.prefix ? `:(literal)${repo.prefix}` : '.']).out;
  const files = [];
  for (const entry of out.split('\0')) {
    if (entry.length < 4) continue;
    const path = entry.slice(3);
    if (!path.startsWith(repo.prefix)) continue;
    files.push(path.slice(repo.prefix.length));
  }
  return files;
}

/** コミットとコミットのあいだで違うファイル（ルートからの相対パス） */
function diffFiles(repo, from, to) {
  const out = repo.git(['diff', '--name-only', '--no-renames', '-z', from, to, '--',
    repo.prefix ? `:(literal)${repo.prefix}` : '.']).out;
  return out.split('\0').filter(Boolean).filter((path) => path.startsWith(repo.prefix))
    .map((path) => path.slice(repo.prefix.length));
}

/**
 * キャラクターたちの縄張りのファイルだけを1つのコミットにする。
 * 戻り値は saved イベントの data（失敗したら commit: null と error）。
 */
export function saveTerritory(root, map, characterIds, node) {
  const base = { characters: characterIds, node };
  let repo;
  try {
    repo = repository(resolve(root));
    if (repo.error) return { ...base, commit: null, error: repo.error };
    const inTerritory = matcher(map, characterIds);
    const files = changedFiles(repo).filter(inTerritory).sort();
    if (files.length === 0 && repo.head) return { ...base, commit: repo.head, changed: false, files: [] };
    const scratch = mkdtempSync(join(tmpdir(), 'gridhub-index-'));
    try {
      const index = { GIT_INDEX_FILE: join(scratch, 'index') };
      if (repo.head) repo.git(['read-tree', repo.head], { env: index });
      else repo.git(['read-tree', '--empty'], { env: index });
      if (files.length) {
        repo.git(['update-index', '--add', '--remove', '-z', '--stdin'],
          { env: index, input: files.map((file) => repo.prefix + file).join('\0') + '\0' });
      }
      const tree = repo.git(['write-tree'], { env: index }).out.trim();
      const title = node === null ? 'gridhub save: ふりだし' : `gridhub save: ${node} ${map.nodes[node]?.title ?? ''}`.trimEnd();
      const names = characterIds.map((id) => map.characters.find((c) => c.id === id)?.name ?? id).join('、');
      const message = `${title}\n\n${names} のセーブ（GridHub）\n`;
      const commit = repo.git(['commit-tree', '--no-gpg-sign', tree, ...(repo.head ? ['-p', repo.head] : [])],
        { input: message }).out.trim();
      repo.git(['update-ref', '-m', title, 'HEAD', commit, repo.head ?? '']);
      // 本物の index は、セーブしたファイルだけ HEAD に合わせる（ほかのステージはそのまま）。
      if (files.length) {
        repo.git(['reset', '-q', commit, '--pathspec-from-file=-', '--pathspec-file-nul'],
          { input: files.map((file) => repo.prefix + file).join('\0') + '\0', allowFail: true });
      }
      return { ...base, commit, changed: true, files };
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  } catch (error) {
    return { ...base, commit: null, error: error.message };
  }
}

/**
 * 負けたキャラクターの縄張りを、町のコミットに戻す。戻す前の変更は git stash（墓）に残す。
 * target は戻り先のコミット（無ければ null）。戻り値は restored イベントの data。
 */
export function restoreTerritory(root, map, characterId, node, seq, target) {
  const base = { character: characterId, node, commit: target };
  try {
    if (!target) return { ...base, stash: null, error: 'このキャラクターのセーブ（町のコミット）がありません' };
    const repo = repository(resolve(root));
    if (repo.error) return { ...base, stash: null, error: repo.error };
    const inTerritory = matcher(map, [characterId]);
    const changed = changedFiles(repo).filter(inTerritory).sort();
    let stash = null;
    if (changed.length) {
      const before = repo.git(['rev-parse', '-q', '--verify', 'refs/stash'], { allowFail: true }).out.trim();
      repo.git(['stash', 'push', '--include-untracked', '-q',
        '-m', `gridhub grave: ${characterId} ${node} seq ${seq}`, '--', ...changed.map((file) => `:(literal)${repo.prefix}${file}`)]);
      const after = repo.git(['rev-parse', '-q', '--verify', 'refs/stash'], { allowFail: true }).out.trim();
      stash = after && after !== before ? after : null;
    }
    // いまの作業ツリー（= HEAD）と戻り先で違う縄張りのファイルを、戻り先から取り出す。
    if (repo.head && repo.head !== target) {
      for (const file of diffFiles(repo, target, repo.head).filter(inTerritory)) {
        const path = join(repo.top, repo.prefix, file);
        const blob = repo.git(['cat-file', '-e', `${target}:${repo.prefix}${file}`], { allowFail: true });
        if (blob.code === 0) {
          const bytes = repo.git(['cat-file', 'blob', `${target}:${repo.prefix}${file}`], { raw: true }).out;
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, bytes);
        } else {
          try {
            unlinkSync(path);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }
      }
    }
    return { ...base, stash };
  } catch (error) {
    return { ...base, stash: null, error: error.message };
  }
}

/** そのキャラクターを含む最新の（commit が null でない）saved のコミット */
export function lastSave(events, characterId) {
  for (let i = events.length - 1; i >= 0; i--) {
    const { type, data } = events[i];
    if (type === 'saved' && data?.commit && (data.characters ?? []).includes(characterId)) return data.commit;
  }
  return null;
}
