// GitHub につなぐ導線（CONTRACTS §56.1）: ゲームのルートの Git の様子と、GitHub につなぐ手引き。冒険の書は要らない。
// --auto-push on|off（§59.1）は、冒険ごとの「町でセーブしたら GitHub に送る」設定を書く（冒険の書が要る）。
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { MasumeError } from '../engine/errors.js';
import { logFile } from '../engine/paths.js';
import { remoteInfo, setAutoPush } from '../engine/remote.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { 'auto-push': 'string' });
  if (command.args.length !== 0) usage('つかいかた: remote [--auto-push on|off] [--json]');
  const auto = command.options['auto-push'];
  if (auto !== undefined) {
    if (auto !== 'on' && auto !== 'off') usage('つかいかた: remote --auto-push on|off');
    const game = gameRoot(command);
    if (!existsSync(logFile(game))) throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません（設定は冒険ごとに書きます）');
    const settings = setAutoPush(game, auto === 'on');
    if (command.options.json) console.log(JSON.stringify(settings));
    else console.log(`町でセーブしたら GitHub に送る: ${settings.auto_push ? 'オン' : 'オフ'}`);
    return 0;
  }
  const root = gameRoot(command, { optional: true }) ?? resolve(command.cwd);
  const info = remoteInfo(root);
  if (command.options.json) {
    console.log(JSON.stringify(info));
    return 0;
  }
  if (!info.inside) console.log('Git: このフォルダは Git で管理されていません');
  else {
    console.log(`Git: ブランチ ${info.branch ?? '（HEAD が切り離されている）'}${info.head ? `（commit ${info.head.slice(0, 7)}）` : '（まだコミットが無い）'}`);
    console.log(`リモート: ${info.remote ? `${info.remote.name} ${info.remote.url ?? ''}${info.remote.github ? '（GitHub）' : ''}`.trim() : 'まだつながっていません'}`);
    console.log(info.upstream === null ? 'GitHub に送っていないセーブ: まだ一度も送っていない' : `GitHub に送っていないセーブ: ${info.ahead}${info.behind ? `（リモートにだけあるコミット: ${info.behind}）` : ''}`);
  }
  if (info.inside) console.log(`町でセーブしたら GitHub に送る: ${info.auto_push ? 'オン' : 'オフ'}（gridhub remote --auto-push on|off）`);
  console.log(`GitHub CLI（gh）: ${info.gh.installed ? (info.gh.authenticated ? 'ログインしています' : '入っているが、ログインしていない') : '入っていない'}`);
  const todo = info.steps.filter((step) => !step.done);
  if (todo.length === 0) console.log('手引き: すべて済んでいます');
  else {
    console.log('手引き（まだのもの）:');
    for (const step of todo) {
      console.log(step.text);
      if (step.command) console.log(`  $ ${step.command}`);
    }
  }
  return 0;
}
