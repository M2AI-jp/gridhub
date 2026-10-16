import { inspectLog } from '../engine/store.js';
import { gameRoot, parseArgs, printCorruption, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { tail: 'string' });
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: log [--tail N] [--json]');
  if (options.tail !== undefined && (!/^\d+$/u.test(options.tail) || !Number.isSafeInteger(Number(options.tail)))) {
    usage('--tail は0以上の整数で指定してください');
  }
  const snapshot = inspectLog(gameRoot(command));
  printCorruption(snapshot.errors);
  const count = options.tail === undefined ? snapshot.events.length : Number(options.tail);
  const events = count === 0 ? [] : snapshot.events.slice(-count);
  if (options.json) console.log(JSON.stringify(events));
  else for (const event of events) {
    console.log(`${event.seq} ${event.ts} ${event.actor} ${event.type} ${JSON.stringify(event.data)}`);
  }
  return 0;
}
