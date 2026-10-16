import { writeNote } from '../engine/game.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length < 2) usage('つかいかた: note <characterId> <text…>');
  const event = writeNote(gameRoot(command), args[0], args.slice(1).join(' '), { actor });
  if (options.json) console.log(JSON.stringify(event));
  else console.log(`${args[0]} の日誌を記録しました（seq ${event.seq}）`);
  return 0;
}
