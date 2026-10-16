import { stamp } from '../engine/index.js';
import { gameRoot, parseArgs, printCheckResult, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { 'no-boss': 'boolean' });
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: stamp <nodeId> --as <humanId>');
  const root = gameRoot(command);
  const result = await stamp(root, args[0], { actor, as: actor, boss: !options['no-boss'] });
  if (options.json) console.log(JSON.stringify(result));
  else printCheckResult(root, result);
  return result.exitCode;
}
