import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MasumeError, findRoot } from '../engine/index.js';
import { questHelp, wantsHelp } from '../quest/help.js';
import { runQuest } from '../quest/index.js';
import { WORDS, resolveWords } from '../engine/words.js';

const USAGE = '使い方: gridhub quest "<願い>" [--gm claude|codex|cmd:<command>] [--model M] [--dir D] [--force] [--retries N] [--allow-listen] [--dry-run] [--json]';

export async function run(argv, ctx) {
  // --help は何より先に答える。ほかの引数があっても、何も書かず GM も呼ばない（§32.2）
  if (wantsHelp(argv)) {
    console.log(questHelp());
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        gm: { type: 'string' },
        model: { type: 'string' },
        dir: { type: 'string' },
        as: { type: 'string' },
        retries: { type: 'string' },
        force: { type: 'boolean' },
        'dry-run': { type: 'boolean' },
        'allow-listen': { type: 'boolean' },
        json: { type: 'boolean' },
        words: { type: 'string' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new MasumeError('E_USAGE', `引数が不正です（${error.message.split('\n')[0]}）\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (values.words !== undefined && !WORDS.includes(values.words)) throw new MasumeError('E_USAGE', `--words は game か dev です: ${values.words}`);
  resolveWords({ root: values.dir !== undefined ? resolve(ctx.cwd, values.dir) : findRoot(ctx.cwd), env: ctx.env ?? process.env, flag: values.words ?? null });

  const wish = positionals.join(' ').trim();
  if (!wish) throw new MasumeError('E_USAGE', `願いを書いてください（例: gridhub quest "メモアプリのようなアプリを作りたい"）\n${USAGE}`);
  for (const key of ['gm', 'model', 'dir', 'as']) {
    if (values[key] !== undefined && !values[key].trim()) throw new MasumeError('E_USAGE', `--${key} に空文字は指定できません`);
  }
  if (values.retries !== undefined && !/^\d+$/u.test(values.retries)) {
    throw new MasumeError('E_USAGE', '--retries には 0 以上の整数を指定してください');
  }

  const env = ctx.env ?? process.env;
  return runQuest({
    wish,
    dir: values.dir,
    gm: values.gm,
    model: values.model,
    force: values.force,
    retries: values.retries === undefined ? undefined : Number(values.retries),
    dryRun: values['dry-run'],
    allowListen: Boolean(values['allow-listen']),
    json: values.json,
    actor: values.as ?? (env.MASUME_ACTOR || 'gm'),
  }, ctx);
}
