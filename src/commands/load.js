import { load } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: load <seq>');
  const root = gameRoot(command);
  const result = load(root, args[0], { actor });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`seq ${result.to_seq} の状態をロードしました\n${recordLine(root, result.head)}`);
  return 0;
}
