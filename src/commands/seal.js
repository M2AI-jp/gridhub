import { seal } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { all: 'boolean' });
  const { args, options, actor } = command;
  if ((options.all && args.length > 0) || (!options.all && args.length === 0)) {
    usage('つかいかた: seal <nodeId…> または seal --all');
  }
  const result = seal(gameRoot(command), options.all ? 'all' : args, { actor });
  if (options.json) console.log(JSON.stringify(result));
  else {
    console.log(t('seal.done', result.events.length));
    if (result.pending.length > 0) console.log(t('seal.pending', result.pending.join('、')));
  }
  return 0;
}
