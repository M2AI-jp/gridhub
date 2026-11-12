// 町 = セーブ = Git のコミット（CONTRACTS §43）。quest.save が "git" の冒険だけが使う。
// ユーザーのほかの変更やステージ（index）には触れない。push・フック・署名はしない。
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, rmdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { t } from './words.js';

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

export function gitRunner(cwd, extraEnv = {}) {
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
  let info;
  try {
    // 1回で聞く（git を起こす回数を減らす）。作業ツリーの外（.git の中を含む）なら失敗するか、1行目が true でない
    info = git(['rev-parse', '--is-inside-work-tree', '--show-toplevel', '--show-prefix', '--absolute-git-dir'], { allowFail: true });
  } catch (error) {
    return { error: error.message };
  }
  const [inside, topLine, prefixLine, gitDirLine] = info.out.split('\n');
  if (info.code !== 0 || inside?.trim() !== 'true' || !topLine || !gitDirLine) {
    return { error: 'ゲームのルートが Git の作業ツリーの中ではありません' };
  }
  const top = topLine.trim();
  const prefix = prefixLine.trim();
  const run = gitRunner(top);
  const head = run(['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true });
  // 「キー 値」の行（値の無い設定は「キー」だけ）。同じキーが何度もあれば、git config と同じく最後のもの
  const config = new Map(run(['config', '--get-regexp', '^user\\.(name|email)$'], { allowFail: true }).out
    .split('\n').filter(Boolean).map((line) => {
      const space = line.indexOf(' ');
      return space === -1 ? [line, ''] : [line.slice(0, space), line.slice(space + 1).trim()];
    }));
  const name = config.get('user.name') ?? '';
  const email = config.get('user.email') ?? '';
  const identity = {
    GIT_AUTHOR_NAME: name || FALLBACK.name, GIT_COMMITTER_NAME: name || FALLBACK.name,
    GIT_AUTHOR_EMAIL: email || FALLBACK.email, GIT_COMMITTER_EMAIL: email || FALLBACK.email,
  };
  // merge・rebase・cherry-pick・revert・bisect の途中は、ユーザーの作業の最中なので触らない。
  const gitDir = gitDirLine.trim();
  const busy = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'BISECT_LOG']
    .find((entry) => existsSync(join(gitDir, entry)));
  if (busy) return { error: `Git が ${busy} の途中なので、触りません（終わってから続けてください）` };
  return { top, prefix, git: gitRunner(top, identity), head: head.code === 0 ? head.out.trim() : null };
}

/** ルートからの相対パスのファイルの、作業ツリーでの lstat（無ければ null） */
function lstatOrNull(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}

/** 中身が空になったディレクトリを、stop の手前まで消す */
function pruneEmpty(directory, stop) {
  let current = directory;
  while (current.startsWith(`${stop}/`) && current !== stop) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch {
      return;
    }
    current = dirname(current);
  }
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
    if (!target) return { ...base, stash: null, error: t('err.restore.none') };
    const repo = repository(resolve(root));
    if (repo.error) return { ...base, stash: null, error: repo.error };
    if (repo.git(['cat-file', '-e', `${target}^{commit}`], { allowFail: true }).code !== 0) {
      return { ...base, stash: null, error: `戻り先のコミット ${target.slice(0, 7)} が見つかりません` };
    }
    const inTerritory = matcher(map, [characterId]);
    const base_ = join(repo.top, repo.prefix);
    // 戻り先から取り出すファイル（いまの HEAD と戻り先で違う縄張りのファイル）
    const restoring = repo.head && repo.head !== target ? diffFiles(repo, target, repo.head).filter(inTerritory) : [];
    // 墓に入れるもの: 縄張りの変更・追加・削除と、取り出すと上書きされる .gitignore されたファイル。
    // （ユーザーの変更は、どれも墓に残ってから作業ツリーが変わる。何も無くならない）
    const changed = changedFiles(repo).filter(inTerritory);
    const ignored = restoring.filter((file) => !changed.includes(file)
      && repo.git(['cat-file', '-e', `${repo.head}:${repo.prefix}${file}`], { allowFail: true }).code !== 0
      && lstatOrNull(join(base_, file)) !== null);
    const graveFiles = [...new Set([...changed, ...ignored])].sort();
    let stash = null;
    if (graveFiles.length) {
      const before = repo.git(['rev-parse', '-q', '--verify', 'refs/stash'], { allowFail: true }).out.trim();
      repo.git(['stash', 'push', ignored.length ? '--all' : '--include-untracked', '-q',
        '-m', `gridhub grave: ${characterId} ${node} seq ${seq}`, '--', ...graveFiles.map((file) => `:(literal)${repo.prefix}${file}`)]);
      const after = repo.git(['rev-parse', '-q', '--verify', 'refs/stash'], { allowFail: true }).out.trim();
      stash = after && after !== before ? after : null;
      // 墓に入ったことを確かめてから、作業ツリーを変える
      const left = changedFiles(repo).filter(inTerritory);
      if (!stash || left.length) {
        return { ...base, stash, error: t('err.restore.grave', left.slice(0, 3).join('、') || 'stash が作れません') };
      }
    }
    // 消すものを先に（ファイルとディレクトリが入れ替わるときのため）、それから書く。
    const entries = restoring.map((file) => {
      const listed = repo.git(['ls-tree', '-z', target, '--', `${repo.prefix}${file}`]).out;
      const match = /^(\d+) (\w+) ([0-9a-f]+)\t/u.exec(listed);
      return { file, path: join(base_, file), mode: match?.[1] ?? null, type: match?.[2] ?? null, oid: match?.[3] ?? null };
    });
    for (const { path } of entries) {
      const stat = lstatOrNull(path);
      if (stat && !stat.isDirectory()) unlinkSync(path);
      pruneEmpty(dirname(path), repo.top);
    }
    for (const { path, mode, type, oid } of entries) {
      if (type !== 'blob') continue; // 戻り先に無い（消すだけ）・サブモジュールは書かない
      const bytes = repo.git(['cat-file', 'blob', oid], { raw: true }).out;
      mkdirSync(dirname(path), { recursive: true });
      // 縄張りの外のファイルが入ったディレクトリかもしれないので、消さずに止める（ここまでの変更は墓にある）
      if (lstatOrNull(path)?.isDirectory()) throw new GitError(`${path} がディレクトリなので戻せません`);
      if (mode === '120000') {
        symlinkSync(bytes.toString('utf8'), path);
      } else {
        writeFileSync(path, bytes, { flag: 'wx' });
        if (mode === '100755') chmodSync(path, 0o755);
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
