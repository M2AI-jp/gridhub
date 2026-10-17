import { parseArgs } from 'node:util';
import { MasumeError } from '../engine/index.js';
import { runQuest } from '../quest/index.js';

const USAGE = '使い方: masume quest "<願い>" [--gm claude|codex|cmd:<command>] [--model M] [--dir D] [--force] [--retries N] [--network] [--dry-run] [--json]';

export async function run(argv, ctx) {
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
        network: { type: 'boolean' },
        json: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: true,
    });
  } catch (error) {
    throw new MasumeError('E_USAGE', `引数が不正です（${error.message.split('\n')[0]}）\n${USAGE}`);
  }
  const { values, positionals } = parsed;

  const wish = positionals.join(' ').trim();
  if (!wish) throw new MasumeError('E_USAGE', `願いを書いてください（例: masume quest "メモアプリのようなアプリを作りたい"）\n${USAGE}`);
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
    network: Boolean(values.network),
    json: values.json,
    actor: values.as ?? (env.MASUME_ACTOR || 'gm'),
  }, ctx);
}
