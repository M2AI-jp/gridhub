import { readFileSync } from 'node:fs';
import { step } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { outputFile } from '../engine/store.js';
import { t } from '../engine/words.js';

const MARK = { true: '✔', false: '✖', null: '・' };

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: step <characterId>（今のダンジョンの判定だけを走らせる。何度でも・罰なし）');
  const root = gameRoot(command);
  const result = await step(root, args[0], { actor });
  if (options.json) {
    console.log(JSON.stringify(result));
    return result.exitCode;
  }
  const { seq, data } = result.events[0];
  const cases = data.cases[data.node] ?? [];
  console.log(t('step.walked', data.character, data.node, cases.filter((c) => c.ok === true).length, cases.length));
  for (const c of cases) console.log(`  ${MARK[c.ok]} ${c.name}`);
  const next = cases.find((c) => c.ok !== true);
  if (next) console.log(t('step.next', next.name));
  else console.log(t('step.all', data.character));
  if (data.code !== 0) {
    const file = outputFile(root, seq);
    if (file) {
      console.log(t('check.output'));
      console.log(readFileSync(file, 'utf8').replace(/\r?\n$/u, '').split(/\r\n|\n|\r/u).slice(-40).join('\n'));
    }
  }
  return result.exitCode;
}
