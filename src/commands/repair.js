import { repair } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 0) usage('つかいかた: repair');
  const result = repair(gameRoot(command), { actor });
  if (options.json) console.log(JSON.stringify(result));
  else if (result.moved === 0) console.log(t('repair.none'));
  else console.log(t('repair.done', result.kept, result.moved, result.file));
  return 0;
}
