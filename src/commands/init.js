import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MasumeError } from '../engine/index.js';
import { fileEntry, printSetup, setupProject } from '../quest/setup.js';

const USAGE = '使い方: masume init [--dir D] [--agent claude|codex] [--force] [--json]';

export async function run(argv, ctx) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        dir: { type: 'string' },
        agent: { type: 'string' },
        as: { type: 'string' },
        force: { type: 'boolean' },
        json: { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    });
  } catch (error) {
    throw new MasumeError('E_USAGE', `引数が不正です（${error.message.split('\n')[0]}）\n${USAGE}`);
  }
  const { values } = parsed;
  for (const key of ['dir', 'agent']) {
    if (values[key] !== undefined && !values[key].trim()) throw new MasumeError('E_USAGE', `--${key} に空文字は指定できません`);
  }

  const cwd = ctx.cwd ?? process.cwd();
  const result = setupProject({ root: resolve(cwd, values.dir ?? '.'), agent: values.agent, force: Boolean(values.force) }, ctx);
  if (values.json) {
    console.log(JSON.stringify({ ok: true, root: result.root, files: result.files.map(fileEntry) }));
  } else {
    printSetup((text) => console.log(text), result);
  }
  return 0;
}
