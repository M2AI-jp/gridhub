// gridhub app — アプリの起動役（CONTRACTS §68）。伝令の縄張り。
// はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアル）を配り、選ばれたフォルダの盤面のサーバーを起こす。
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { defaultHome, defaultPlay, startApp } from '../server/app.js';
import { holdUntilStopped } from '../server/lifeline.js';

function usageError(message) {
  return Object.assign(new Error(message), { code: 'E_USAGE', exitCode: 2 });
}

const USAGE = '使い方: gridhub app [--port 0] [--host 127.0.0.1] [--home D] [--play D] [--lifeline]';

export async function run(argv, ctx) {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        port: { type: 'string', default: '0' },
        host: { type: 'string', default: '127.0.0.1' },
        home: { type: 'string' },
        play: { type: 'string' },
        lifeline: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch {
    throw usageError(`引数が不正です。${USAGE}`);
  }
  if (values.help) {
    console.log([
      USAGE,
      '',
      'はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアルで遊ぶ）を配ります。Mac のアプリ（GridHub.app）はこれを起こします。',
      '  --port N     待ち受けるポート（既定 0 = 空いているポート）',
      '  --home D     最近のフォルダを置く場所（既定: GRIDHUB_APP_HOME、macOS は ~/Library/Application Support/GridHub）',
      '  --play D     チュートリアルのフォルダを作る場所（既定: GRIDHUB_PLAY_DIR か ~/GridHub）',
      '  --lifeline   標準入力が閉じたら止まる（アプリが落ちてもサーバーを残さない）',
    ].join('\n'));
    return 0;
  }
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || port > 65535) throw usageError('--port には 0 から 65535 までの整数を指定してください');
  if (!values.host.trim()) throw usageError('--host にホスト名を指定してください');
  for (const name of ['home', 'play']) {
    if (values[name] !== undefined && !values[name].trim()) throw usageError(`--${name} に場所を指定してください`);
  }

  const running = await startApp({
    port,
    host: values.host,
    home: values.home === undefined ? defaultHome(ctx.env) : resolve(ctx.cwd, values.home),
    play: values.play === undefined ? defaultPlay(ctx.env) : resolve(ctx.cwd, values.play),
    env: ctx.env,
  });
  console.log(`GridHub: ${running.url}`);
  return holdUntilStopped(running.stop, { lifeline: values.lifeline });
}
