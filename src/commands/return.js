import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MasumeError } from '../engine/errors.js';
import { recordReturn } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';

const integer = (value) => (typeof value === 'string' && /^-?\d+$/u.test(value) ? Number(value) : NaN);

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { sortie: 'string', code: 'string', log: 'string' });
  const { args, options, cwd, env } = command;
  if (args.length !== 1 || options.sortie === undefined || options.code === undefined) {
    usage('つかいかた: return <characterId> --sortie <seq> --code <n> [--log <file>]');
  }
  let log = '';
  if (options.log !== undefined) {
    try {
      log = readFileSync(resolve(cwd, options.log));
    } catch {
      throw new MasumeError('E_USAGE', `--log のファイルを読めません: ${options.log}`);
    }
  }
  const actor = options.as ?? (env.MASUME_ACTOR || undefined);
  const event = recordReturn(gameRoot(command), args[0], {
    actor, sortie: integer(options.sortie), code: integer(options.code), log,
  });
  if (options.json) console.log(JSON.stringify(event));
  else {
    const { node_before: before, node_after: after, advanced } = event.data;
    console.log(`${args[0]} の帰還を記録しました（seq ${event.seq}、${before} → ${after ?? 'あがり'}、${advanced ? '進んだ' : '進めなかった'}）`);
  }
  return 0;
}
