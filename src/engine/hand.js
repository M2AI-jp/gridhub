// 手で演じる役のファイル（CONTRACTS §67）。書記の縄張り。
// 盤面から、人間がキャラクターの役を手で演じるときに、そのキャラクターの縄張りの中のファイルだけを読み書きする。
// 封印された判定・地図・冒険の書（.masume/）・.git/ には書かない。冒険の書には何も記録しない（ファイルはゲームの状態ではない）。
// 承認のマス（人間が自分のハンコのマスにいるとき）では、指令書と判定に書かれた仲間のファイルも読むだけで見せる（§74.1）。
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { MasumeError } from './errors.js';
import { logFile } from './paths.js';
import { globToRegExp } from './save.js';
import { buildView } from './view.js';

const MAX_BYTES = 1024 * 1024;
const MAX_FILES = 500;
const SKIP_DIRS = new Set(['.masume', '.git', 'node_modules']);
const PATH_WORD = /[A-Za-z0-9_][A-Za-z0-9_./-]*/gu;

/** パスの形（§67.1 の 1）: 相対で、/ 区切り、空・.・.. の区切りが無い */
function badShape(path) {
  if (typeof path !== 'string' || path === '' || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return true;
  return path.split('/').some((part) => part === '' || part === '.' || part === '..');
}

/** 冒険の書とキャラクター。だめなら MasumeError を返す */
function gameOf(root, characterId) {
  if (!existsSync(logFile(root))) return new MasumeError('E_NO_GAME', '冒険の書がまだありません');
  const view = buildView(root);
  const character = view.characters.find(({ id }) => id === characterId);
  if (!character) return new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${characterId}`);
  const clean = (path) => String(path).replace(/^\.\//u, '');
  const sealed = new Set(Object.values(view.nodes).flatMap((node) => node.check?.seal ?? []).map(clean));
  const territory = character.territory ?? [];
  const patterns = territory.map((glob) => globToRegExp(clean(glob)));
  const at = character.at ? view.nodes[character.at] : null;
  const approving = character.kind === 'human' && character.status === 'working'
    && at?.type === 'task' && at.check?.kind === 'stamp' && at.check.by === character.id;
  // 指令書（いまのマス）と判定（すぐ次のゲート）の説明に書かれたパス。承認のマスでだけ使う（§74.1）
  const mentioned = new Set();
  if (approving) {
    const next = view.nodes[character.path[character.pos + 1]];
    const texts = [at.title, at.detail, next?.type === 'gate' ? next.detail : null];
    for (const word of texts.filter((t) => typeof t === 'string').flatMap((t) => t.match(PATH_WORD) ?? [])) {
      const path = word.replace(/\.+$/u, '');
      if ((path.includes('/') || path.includes('.')) && !badShape(path)) mentioned.add(path);
    }
  }
  const owners = view.characters.map(({ id, territory: globs = [] }) => ({ id, patterns: globs.map((glob) => globToRegExp(clean(glob))) }));
  return {
    character,
    territory,
    isProtected: (path) => path === '.masume' || path.startsWith('.masume/') || path === '.git' || path.startsWith('.git/')
      || sealed.has(path) || path.endsWith('.map.json'),
    inTerritory: (path) => patterns.some((pattern) => pattern.test(path)),
    mentioned,
    ownerOf: (path) => owners.find(({ patterns: globs }) => globs.some((pattern) => pattern.test(path)))?.id ?? null,
  };
}

/** ルートの下の途中・本人に、シンボリックリンクがあるか */
function throughSymlink(root, path) {
  const parts = path.split('/');
  for (let i = 1; i <= parts.length; i++) {
    let info;
    try {
      info = lstatSync(join(root, ...parts.slice(0, i)));
    } catch {
      return false; // ここから先はまだ無い
    }
    if (info.isSymbolicLink()) return true;
  }
  return false;
}

function problemIn(root, game, path) {
  if (game.isProtected(path)) {
    return new MasumeError('E_SEALED', `${path} には書けません（封印された判定・地図・冒険の書は、だれも書き換えない）`);
  }
  if (!game.inTerritory(path)) {
    const where = game.territory.length ? game.territory.join('・') : '（縄張りがありません）';
    return new MasumeError('E_TERRITORY', `${path} は ${game.character.name} の縄張り（${where}）の外です`);
  }
  if (throughSymlink(root, path)) {
    return new MasumeError('E_TERRITORY', `${path} はシンボリックリンクをたどります。縄張りの外を書き換えないよう、書けません`);
  }
  return null;
}

/** 書いてよければ null、だめなら MasumeError（投げない。§67.1） */
export function handPathProblem(root, characterId, path) {
  root = resolve(root);
  if (badShape(path)) {
    return new MasumeError('E_USAGE', 'パスは、ルートからの相対パス（/ 区切り。.. や空の区切りは使えない）で書いてください');
  }
  const game = gameOf(root, characterId);
  if (game instanceof MasumeError) return game;
  return problemIn(root, game, path);
}

/** 承認のマスで読むだけで見せてよいファイルなら、その縄張りの持ち主。だめなら null（§74.1） */
function reviewOwner(root, game, path) {
  if (!game.mentioned.has(path) || game.isProtected(path) || throughSymlink(root, path)) return null;
  return game.ownerOf(path);
}

function requireWritable(root, characterId, path) {
  const problem = handPathProblem(root, characterId, path);
  if (problem) throw problem;
}

/** 縄張りの中の、書いてよいファイル（§67.2） */
export function handFiles(root, characterId) {
  root = resolve(root);
  const game = gameOf(root, characterId);
  if (game instanceof MasumeError) throw game;
  const files = [];
  const walk = (dir, prefix) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (files.length >= MAX_FILES) return;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), path);
        continue;
      }
      if (!entry.isFile() || problemIn(root, game, path) !== null) continue;
      let size = 0;
      try {
        size = lstatSync(join(dir, entry.name)).size;
      } catch {
        continue;
      }
      files.push({ path, size });
    }
  };
  walk(root, '');
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { character: characterId, territory: game.territory, files };
}

/** 承認のマスで、読むだけで見せるファイル（§74.1）。指令書と判定に書かれた、だれかの縄張りの守られていないもの。ほかのときは空 */
export function handReviewFiles(root, characterId) {
  root = resolve(root);
  const game = gameOf(root, characterId);
  if (game instanceof MasumeError) throw game;
  const files = [];
  for (const path of [...game.mentioned].sort()) {
    const owner = reviewOwner(root, game, path);
    if (owner === null) continue;
    let info;
    try {
      info = lstatSync(join(root, path));
    } catch {
      continue; // まだ無い
    }
    if (info.isFile()) files.push({ path, size: info.size, owner });
  }
  return { character: characterId, files };
}

/** 縄張りの中のファイルを読む（§67.3）。無ければ exists: false。承認のマスでは読むだけのファイルも（readonly: true。§74.1） */
export function readHandFile(root, characterId, path) {
  root = resolve(root);
  let readonly = false;
  const problem = handPathProblem(root, characterId, path);
  if (problem) {
    const game = problem.code === 'E_TERRITORY' ? gameOf(root, characterId) : null;
    if (!game || game instanceof MasumeError || reviewOwner(root, game, path) === null) throw problem;
    readonly = true;
  }
  const mark = readonly ? { readonly: true } : {};
  const file = join(root, path);
  let info;
  try {
    info = lstatSync(file);
  } catch {
    return { path, exists: false, content: '', ...mark };
  }
  if (!info.isFile()) throw new MasumeError('E_USAGE', `${path} はファイルではありません`);
  return { path, exists: true, content: readFileSync(file, 'utf8'), ...mark };
}

/** 縄張りの中のファイルを書く（§67.4）。途中のフォルダは作り、一時ファイルから置き換える */
export function writeHandFile(root, characterId, path, content) {
  root = resolve(root);
  if (typeof content !== 'string') throw new MasumeError('E_USAGE', 'content は文字列で渡してください');
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > MAX_BYTES) throw new MasumeError('E_USAGE', `ファイルは 1MiB までです（${bytes} バイト）`);
  requireWritable(root, characterId, path);
  const file = join(root, path);
  try {
    if (lstatSync(file).isDirectory()) throw new MasumeError('E_USAGE', `${path} はフォルダです`);
  } catch (error) {
    if (error instanceof MasumeError) throw error;
  }
  mkdirSync(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.${basename(file)}.gridhub-${process.pid}-${Date.now()}.tmp`);
  try {
    writeFileSync(temp, content, 'utf8');
    renameSync(temp, file);
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
  return { path, bytes };
}
