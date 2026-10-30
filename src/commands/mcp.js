import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findRoot } from '../engine/index.js';
import { WORDS, resolveWords, t } from '../engine/words.js';
import { serveMcp } from '../mcp/index.js';

function usageError(message) {
  return Object.assign(new Error(message), { code: 'E_USAGE', exitCode: 2 });
}

function packageVersion(repo) {
  try {
    return JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

/** gridhub mcp [--dir D] — 標準入出力の MCP サーバー（CONTRACTS §19）。stdout はプロトコル専用。 */
export async function run(argv, ctx) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: { dir: { type: 'string' }, words: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: gridhub mcp [--dir D] [--words game|dev]');
  }
  if (values.words !== undefined && !WORDS.includes(values.words)) throw usageError(`--words は game か dev です: ${values.words}`);
  if (values.dir !== undefined && !values.dir.trim()) {
    throw usageError('--dir に冒険の書のある場所を指定してください');
  }

  const env = ctx.env ?? process.env;
  // ルート: --dir > MASUME_DIR > カレントから冒険の書を探す > カレント（冒険の書が無くても起動する）
  const root = values.dir !== undefined ? resolve(ctx.cwd, values.dir)
    : env.MASUME_DIR ? resolve(ctx.cwd, env.MASUME_DIR)
      : (findRoot(ctx.cwd) ?? resolve(ctx.cwd));

  // ことば（§76）: --words > GRIDHUB_WORDS > この冒険の設定 > game
  resolveWords({ root, env, flag: values.words ?? null });
  process.stderr.write(`gridhub mcp: ${t('book')}の場所は ${root}\n`);
  return serveMcp({ root, bin: ctx.bin, repo: ctx.root, cwd: ctx.cwd, env, version: packageVersion(ctx.root) });
}
