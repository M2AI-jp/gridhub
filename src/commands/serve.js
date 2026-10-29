import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from '../server/index.js';
import { holdUntilStopped } from '../server/lifeline.js';
import { WORDS, t } from '../engine/words.js';

function usageError(message) {
  return Object.assign(new Error(message), { code: 'E_USAGE', exitCode: 2 });
}

export async function run(argv, ctx) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        port: { type: 'string', default: '5005' },
        host: { type: 'string', default: '127.0.0.1' },
        dir: { type: 'string' },
        lifeline: { type: 'boolean', default: false },
        words: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: gridhub serve [--port N] [--host H] [--dir D] [--lifeline] [--words game|dev]');
  }
  // ことば（§76）: --words はこのサーバーのあいだ、環境変数と同じ強さで効く（盤面から変えるまで）
  if (values.words !== undefined) {
    if (!WORDS.includes(values.words)) throw usageError(`--words は game か dev です: ${values.words}`);
    process.env.GRIDHUB_WORDS = values.words;
  }

  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port > 65535) {
    throw usageError('--port には 0 から 65535 までの整数を指定してください');
  }
  if (!values.host.trim()) throw usageError('--host にホスト名を指定してください');
  if (values.dir !== undefined && !values.dir.trim()) {
    throw usageError('--dir に冒険の書のある場所を指定してください');
  }

  // 冒険の書が無くても開く（入口＝ロビー。CONTRACTS §15）。--dir が無ければ、上へたどって見つけた冒険の書、無ければカレント。
  const { findRoot, logFile } = await import('../engine/index.js');
  const root = values.dir === undefined ? (findRoot(ctx.cwd) ?? resolve(ctx.cwd)) : resolve(ctx.cwd, values.dir);
  const running = await startServer({ root, port, host: values.host });
  const lobby = !existsSync(logFile(root));

  console.log(t('serve.board', running.url));
  if (lobby) console.log(t('serve.lobby'));
  // 止める合図（SIGINT・SIGTERM・SIGHUP。--lifeline なら標準入力が閉じたときも。§68.2）を待つ
  return holdUntilStopped(running.stop, { lifeline: values.lifeline });
}
