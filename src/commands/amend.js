import { resolve } from 'node:path';
import { amend } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor, cwd } = command;
  if (args.length !== 1) usage('つかいかた: amend <map>');
  const root = gameRoot(command);
  const result = amend(root, resolve(cwd, args[0]), { actor });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`地図を第${result.version}版に改訂しました\n${recordLine(root, result.head)}`);
  return 0;
}
