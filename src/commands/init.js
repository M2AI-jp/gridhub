import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { MasumeError } from '../engine/index.js';
import { fileEntry, printSetup, setupProject } from '../quest/setup.js';

const USAGE = '使い方: masume init [--dir D] [--agent claude|codex [--network]] [--force] [--json]';

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
        network: { type: 'boolean' },
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

  // --network は party.json に書く項目なので、書き先の agent が決まっていなければ使えない（§31.4）
  if (values.network && values.agent === undefined) {
    throw new MasumeError('E_USAGE', `--network は --agent と一緒に指定してください（party.json に network: true を書くため）\n${USAGE}`);
  }

  const cwd = ctx.cwd ?? process.cwd();
  const result = setupProject({
    root: resolve(cwd, values.dir ?? '.'),
    agent: values.agent,
    force: Boolean(values.force),
    network: Boolean(values.network),
  }, ctx);
  if (values.json) {
    console.log(JSON.stringify({ ok: true, root: result.root, files: result.files.map(fileEntry) }));
  } else {
    printSetup((text) => console.log(text), result);
  }
  return 0;
}
