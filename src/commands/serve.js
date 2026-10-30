import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { startServer } from '../server/index.js';
import { holdUntilStopped } from '../server/lifeline.js';
import { WORDS, t } from '../engine/words.js';

function usageError(message) {
  return Object.assign(new Error(message), { code: 'E_USAGE', exitCode: 2 });
}

/**
 * ブラウザで URL を開く（OS の open / xdg-open / start）。起動できたか（コマンドがあるか）だけを待ち、ページが開いたかは待たない。
 * 起動できなければ false（xdg-open の無い Linux など。ENOENT は spawn のあとから 'error' で来る）
 */
export function openBrowser(url, platform = process.platform) {
  const [file, args] = platform === 'darwin' ? ['open', [url]]
    : platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  return new Promise((done) => {
    let child;
    try {
      child = spawn(file, args, { stdio: 'ignore', detached: true });
    } catch {
      done(false);
      return;
    }
    child.once('spawn', () => {
      child.unref();
      done(true);
    });
    child.once('error', () => done(false));
  });
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
        words: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError('引数が不正です。使い方: gridhub serve [--port N] [--host H] [--dir D] [--open|--no-open] [--lifeline] [--words game|dev]');
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
  if (values.dir !== undefined && !(existsSync(root) && statSync(root).isDirectory())) {
    // 無いフォルダで黙って入口を出さない（打ち間違いに気づけるように）
    throw usageError(`--dir のフォルダがありません: ${root}（新しく始めるなら mkdir -p で作ってから、もう一度）`);
  }
  const running = await startServer({ root, port, host: values.host });
  const lobby = !existsSync(logFile(root));

  console.log(t('serve.board', running.url));
  if (lobby) console.log(t('serve.lobby'));
  // ブラウザを開く（§78.7）: --open なら必ず。言われなければ、人がターミナルから打ったとき（stdout が端末）だけ。
  // パイプの先・アプリ（--lifeline）・CI では開かない。--no-open で止められる
  const interactive = Boolean(process.stdout.isTTY) && !values.lifeline && !(ctx.env ?? process.env).CI;
  const wantOpen = values['no-open'] ? false : values.open === true || interactive;
  if (wantOpen) {
    console.log(await openBrowser(running.url) ? t('serve.open.ok') : t('serve.open.ng'));
  } else if (!values.lifeline) console.log(t('serve.open.hint'));
  // 止める合図（SIGINT・SIGTERM・SIGHUP。--lifeline なら標準入力が閉じたときも。§68.2）を待つ
  return holdUntilStopped(running.stop, { lifeline: values.lifeline });
}
