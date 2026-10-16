import { resolve } from 'node:path';
import { validateMap } from '../engine/index.js';
import { readMapFile } from '../engine/map.js';
import { guardExistingGame, parseArgs, printValidation, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options, cwd } = command;
  if (args.length !== 1) usage('つかいかた: validate <map>');
  guardExistingGame(command);
  let result;
  try {
    result = validateMap(readMapFile(resolve(cwd, args[0])));
  } catch (error) {
    if (error.code !== 'E_INVALID_MAP') throw error;
    result = { ok: false, errors: [{ code: 'E_FORMAT', path: '$', message: error.message }], warnings: [] };
  }
  if (options.json) console.log(JSON.stringify(result));
  else printValidation(result);
  return result.ok ? 0 : 1;
}
