import { check } from '../engine/index.js';
import { gameRoot, parseArgs, printCheckResult, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { 'no-boss': 'boolean' });
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: check <characterId|gateId> [--no-boss]');
  const root = gameRoot(command);
  let result;
  try {
    result = await check(root, args[0], { actor, boss: !options['no-boss'] });
  } catch (error) {
    if (!options.json && error.code === 'E_PARTY_INCOMPLETE') console.log(error.message);
    throw error;
  }
  if (options.json) console.log(JSON.stringify(result));
  else printCheckResult(root, result);
  return result.exitCode;
}
