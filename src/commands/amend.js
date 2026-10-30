import { resolve } from 'node:path';
import { amend } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor, cwd } = command;
  if (args.length !== 1) usage('つかいかた: amend <map>');
  const result = amend(gameRoot(command), resolve(cwd, args[0]), { actor });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(`${t('amend.done', result.version)}\n${recordLine(result.head)}`);
  return 0;
}
