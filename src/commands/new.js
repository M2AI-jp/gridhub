import { resolve } from 'node:path';
import { newGame } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { force: 'boolean' });
  const { args, options, actor, cwd } = command;
  if (args.length !== 1) usage('つかいかた: new <map> [--force]');
  const root = gameRoot(command, { creating: true });
  const result = newGame(root, resolve(cwd, args[0]), { actor, force: options.force });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`冒険の書をひらきました\n${recordLine(root, result.head)}`);
  return 0;
}
