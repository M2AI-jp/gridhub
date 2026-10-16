import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, usage } from '../linear/cli.js';
import { importLinear } from '../linear/import.js';

export async function run(argv, ctx) {
  const { args, options, cwd } = parseArgs(argv, ctx, {
    out: 'string', 'quest-id': 'string', title: 'string',
  });
  if (args.length !== 2 || args[0] !== 'linear' || !options.out) {
    usage('つかいかた: import linear <csv> --out <map.json> [--quest-id KEY] [--title T]');
  }
  const map = importLinear(readFileSync(resolve(cwd, args[1]), 'utf8'), {
    questId: options['quest-id'], title: options.title,
  });
  const output = resolve(cwd, options.out);
  writeFileSync(output, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  if (options.json) console.log(JSON.stringify({ ok: true, file: output }));
  else console.log(`地図の下書きを保存しました: ${output}\n${map.quest.pitch}`);
  return 0;
}
