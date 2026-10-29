import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from '../server/index.js';
import { holdUntilStopped } from '../server/lifeline.js';

function usageError(message) {
  return Object.assign(new Error(message), { code: 'E_USAGE', exitCode: 2 });
}

/** ブラウザで URL を開く（OS の open / xdg-open / start）。開けたかは待たない。失敗したら false */
export function openBrowser(url, platform = process.platform) {
  const [file, args] = platform === 'darwin' ? ['open', [url]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  try {
    const child = spawn(file, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
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
        open: { type: 'boolean' },
        'no-open': { type: 'boolean', default: false },
        lifeline: { type: 'boolean', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: gridhub serve [--port N] [--host H] [--dir D] [--open|--no-open] [--lifeline]');
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
  if (values.dir !== undefined && !(existsSync(root) && statSync(root).isDirectory())) {
    // 無いフォルダで黙って入口を出さない（打ち間違いに気づけるように）
    throw usageError(`--dir のフォルダがありません: ${root}（新しく始めるなら mkdir -p で作ってから、もう一度）`);
  }
  const running = await startServer({ root, port, host: values.host });
  const lobby = !existsSync(logFile(root));

  console.log(`盤面: ${running.url}`);
  if (lobby) console.log('冒険の書はまだありません。盤面の入口で願いを書いて、冒険をはじめてください。');
  // ブラウザを開く: --open なら必ず。言われなければ、人がターミナルから打ったとき（stdout が端末）だけ。
  // パイプの先・アプリ（--lifeline）・CI では開かない。--no-open で止められる
  const interactive = Boolean(process.stdout.isTTY) && !values.lifeline && !(ctx.env ?? process.env).CI;
  const wantOpen = values['no-open'] ? false : values.open === true || interactive;
  if (wantOpen) {
    console.log(openBrowser(running.url) ? 'ブラウザで開きます（開かなければ、上の URL をブラウザに貼ってください。--no-open で開かずに済ませられます）'
      : '（ブラウザを開けませんでした。上の URL をブラウザで開いてください）');
  } else if (!values.lifeline) console.log('上の URL をブラウザで開いてください（--open で、gridhub が開きます）');
  // 止める合図（SIGINT・SIGTERM・SIGHUP。--lifeline なら標準入力が閉じたときも。§68.2）を待つ
  return holdUntilStopped(running.stop, { lifeline: values.lifeline });
}
