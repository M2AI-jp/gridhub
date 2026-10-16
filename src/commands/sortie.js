import { recordSortie } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { agent: 'string', model: 'string' });
  const { args, options, env } = command;
  if (args.length !== 1 || options.agent === undefined) {
    usage('つかいかた: sortie <characterId> --agent <name> [--model M]');
  }
  // --as も MASUME_ACTOR も無ければ、API の既定（party）で記録する。
  const actor = options.as ?? (env.MASUME_ACTOR || undefined);
  const event = recordSortie(gameRoot(command), args[0], { actor, agent: options.agent, model: options.model ?? null });
  if (options.json) console.log(JSON.stringify(event));
  else console.log(`${args[0]} の出撃を記録しました（seq ${event.seq}）`);
  return 0;
}
