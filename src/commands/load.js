import { load } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: load <seq|commit>（記録の番号 seq か、冒険の書に記録された Git のコミット）');
  const result = load(gameRoot(command), args[0], { actor });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`seq ${result.to_seq} の状態をロードしました（コードは Git で戻す: git checkout <commit>）\n${recordLine(result.head)}`);
  return 0;
}
