// gridhub words — ことば（冒険のことば / 開発のことば）を見る・変える（CONTRACTS §76）。書記の担当。
import { existsSync } from 'node:fs';
import { gameRoot, guessRoot, parseArgs, usage } from '../engine/cli.js';
import { logFile } from '../engine/paths.js';
import { MasumeError } from '../engine/errors.js';
import { WORDS, resolveWords, setWordsSetting, t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, cwd, env } = command;
  if (args.length > 1) usage(t('words.help'));
  if (args.length === 0) {
    const root = guessRoot({ cwd, env, dir: options.dir });
    const { words, source } = resolveWords({ root, env, flag: options.words ?? null });
    if (options.json) console.log(JSON.stringify({ words, source }));
    else console.log(t('words.now', words, t(`words.source.${source}`)));
    return 0;
  }
  const mode = args[0];
  if (!WORDS.includes(mode)) usage(`${t('words.help')}\n\n[${mode}] は game でも dev でもありません`);
  const root = gameRoot(command);
  if (!existsSync(logFile(root))) throw new MasumeError('E_NO_GAME', t('err.nogame'));
  const result = setWordsSetting(root, mode);
  resolveWords({ root, env, flag: options.words ?? null });
  if (options.json) console.log(JSON.stringify(result));
  else console.log(t('words.set', mode));
  return 0;
}
