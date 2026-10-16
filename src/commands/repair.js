import { repair } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 0) usage('つかいかた: repair');
  const result = repair(gameRoot(command), { actor });
  if (options.json) console.log(JSON.stringify(result));
  else if (result.moved === 0) console.log('冒険の書は正常です。修復は不要です');
  else console.log(`冒険の書を修復しました。${result.kept}件を残し、${result.moved}行を ${result.file} に退避しました`);
  return 0;
}
