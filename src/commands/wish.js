import { recordWish } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { gm: 'string', model: 'string' });
  const { args, options, actor } = command;
  if (args.length < 1) usage('つかいかた: wish <text…> [--gm G] [--model M]');
  const event = recordWish(gameRoot(command), {
    actor, text: args.join(' '), gm: options.gm ?? null, model: options.model ?? null,
  });
  if (options.json) console.log(JSON.stringify(event));
  else console.log(`願いを記録しました（seq ${event.seq}）`);
  return 0;
}
