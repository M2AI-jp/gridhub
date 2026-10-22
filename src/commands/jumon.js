// 旧版との互換（CONTRACTS §52）: 第10章までの `jumon` コマンド。人に見せる目印は seq と Git のコミット。
import { MasumeError, verify } from '../engine/index.js';
import { gameRoot, parseArgs, printCorruption, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: jumon [--json]');
  const result = verify(gameRoot(command));
  if (!result.head) throw new MasumeError('E_CURSED', '冒険の書は呪われています。じゅもんを読めるイベントがありません', 3);
  printCorruption(result.errors);
  if (options.json) console.log(JSON.stringify(result.head));
  else console.log(result.head.jumon);
  return 0;
}
