import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from '../server/index.js';

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
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: masume serve [--port N] [--host H] [--dir D]');
  }

  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port > 65535) {
    throw usageError('--port には 0 から 65535 までの整数を指定してください');
  }
  if (!values.host.trim()) throw usageError('--host にホスト名を指定してください');
  if (values.dir !== undefined && !values.dir.trim()) {
    throw usageError('--dir に冒険の書のある場所を指定してください');
  }

  const { findRoot } = await import('../engine/index.js');
  const root = values.dir === undefined ? findRoot(ctx.cwd) : resolve(ctx.cwd, values.dir);
  if (!root) {
    throw Object.assign(new Error('冒険の書が見つかりません'), { code: 'E_NO_GAME', exitCode: 2 });
  }
  const running = await startServer({ root, port, host: values.host });

  return new Promise((resolveRun, rejectRun) => {
    let stopping = false;
    const cleanup = () => {
      process.off('SIGINT', shutdown);
      process.off('SIGTERM', shutdown);
    };
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      running.stop().then(() => {
        cleanup();
        resolveRun(0);
      }, (error) => {
        cleanup();
        rejectRun(error);
      });
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    console.log(`盤面: ${running.url}`);
  });
}
