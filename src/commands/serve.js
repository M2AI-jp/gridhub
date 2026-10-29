import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from '../server/index.js';
import { holdUntilStopped } from '../server/lifeline.js';

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
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: gridhub serve [--port N] [--host H] [--dir D] [--lifeline]');
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

  console.log(`盤面: ${running.url}`);
  if (lobby) console.log('冒険の書はまだありません。盤面の入口で願いを書いて、冒険をはじめてください。');
  // 止める合図（SIGINT・SIGTERM・SIGHUP。--lifeline なら標準入力が閉じたときも。§68.2）を待つ
  return holdUntilStopped(running.stop, { lifeline: values.lifeline });
}
