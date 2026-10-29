import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MasumeError, findRoot } from '../engine/index.js';
import { initHelp, wantsHelp } from '../quest/help.js';
import { fileEntry, printSetup, setupProject } from '../quest/setup.js';
import { WORDS, resolveWords } from '../engine/words.js';

const USAGE = '使い方: gridhub init [--dir D] [--agent claude|codex [--allow-listen]] [--force] [--json]';

export async function run(argv, ctx) {
  // --help は何より先に答える。ほかの引数があっても、何も書かない（§32.2）
  if (wantsHelp(argv)) {
    console.log(initHelp());
    return 0;
  }
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        agent: { type: 'string' },
        as: { type: 'string' },
        force: { type: 'boolean' },
        'allow-listen': { type: 'boolean' },
        json: { type: 'boolean' },
        words: { type: 'string' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    throw new MasumeError('E_USAGE', `引数が不正です（${error.message.split('\n')[0]}）\n${USAGE}`);
  }
  const { values } = parsed;
  if (values.words !== undefined && !WORDS.includes(values.words)) throw new MasumeError('E_USAGE', `--words は game か dev です: ${values.words}`);
  resolveWords({ root: values.dir !== undefined ? resolve(ctx.cwd, values.dir) : findRoot(ctx.cwd), env: ctx.env ?? process.env, flag: values.words ?? null });
  for (const key of ['dir', 'agent']) {
    if (values[key] !== undefined && !values[key].trim()) throw new MasumeError('E_USAGE', `--${key} に空文字は指定できません`);
  }

  // --allow-listen は party.json に書く項目なので、書き先の agent が決まっていなければ使えない（§31.4）
  if (values['allow-listen'] && values.agent === undefined) {
    throw new MasumeError('E_USAGE', `--allow-listen は --agent と一緒に指定してください（party.json に allow_listen: true を書くため）\n${USAGE}`);
  }

  const cwd = ctx.cwd ?? process.cwd();
  const result = setupProject({
    root: resolve(cwd, values.dir ?? '.'),
    agent: values.agent,
    force: Boolean(values.force),
    allowListen: Boolean(values['allow-listen']),
  }, ctx);
  if (values.json) {
    console.log(JSON.stringify({ ok: true, root: result.root, files: result.files.map(fileEntry) }));
  } else {
    printSetup((text) => console.log(text), result);
  }
  return 0;
}
