import { findJumon } from '../engine/jumon.js';
import { inspectLog } from '../engine/store.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { jumon: 'string' });
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: verify [--json]');
  const snapshot = inspectLog(gameRoot(command));
  const { ok, errors, warnings, head } = snapshot;
  const result = { ok, errors, warnings, head };
  if (options.jumon !== undefined) result.found = findJumon(snapshot.events, options.jumon);
  if (options.json) console.log(JSON.stringify(result));
  else if (!ok) {
    console.log(`冒険の書は呪われています（seq ${errors[0].seq}）`);
    for (const { seq, code, message } of errors) console.log(`[${code}] seq ${seq}: ${message}`);
  } else {
    console.log('冒険の書は正常です');
    if (options.jumon !== undefined) {
      console.log(result.found ? `じゅもんが見つかりました（seq ${result.found.seq}）` : 'じゅもんが見つかりません');
    }
  }
  if (!ok) return 3;
  return options.jumon !== undefined && result.found === null ? 1 : 0;
}
