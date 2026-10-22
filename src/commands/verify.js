import { inspectLog } from '../engine/store.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: verify [--json]');
  const { ok, errors, warnings, head } = inspectLog(gameRoot(command));
  const result = { ok, errors, warnings, head };
  if (options.json) console.log(JSON.stringify(result));
  else if (!ok) {
    console.log(`冒険の書は呪われています（seq ${errors[0].seq}）`);
    for (const { seq, code, message } of errors) console.log(`[${code}] seq ${seq}: ${message}`);
  } else {
    console.log('冒険の書は正常です');
    if (head) console.log(`記録: seq ${head.seq}（${head.hash.slice(0, 12)}）`);
  }
  return ok ? 0 : 3;
}
