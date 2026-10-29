import { writeNote } from '../engine/game.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length < 2) usage('つかいかた: note <characterId> <text…>');
  const event = writeNote(gameRoot(command), args[0], args.slice(1).join(' '), { actor });
  if (options.json) console.log(JSON.stringify(event));
  else console.log(t('note.done', args[0], event.seq));
  return 0;
}
