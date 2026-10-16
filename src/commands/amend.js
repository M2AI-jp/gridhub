import { amend } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: amend <map>');
  const result = amend(gameRoot(command), args[0], { actor });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`地図を第${result.version}版に改訂しました\nふっかつのじゅもん: ${result.head.jumon}`);
  return 0;
}
