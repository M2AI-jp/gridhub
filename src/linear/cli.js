import { parseArgs as parseNodeArgs } from 'node:util';
import { MasumeError } from '../engine/index.js';

export function usage(message) {
  throw new MasumeError('E_USAGE', message, 2);
}

// 他の担当の CLI 内部に依存せず、共通オプションを同じ形で受け取る。
export function parseArgs(argv, ctx = {}, extra = {}) {
  const types = { dir: 'string', as: 'string', json: 'boolean', ...extra };
  let parsed;
  try {
    parsed = parseNodeArgs({
      args: argv,
      options: Object.fromEntries(Object.entries(types).map(([key, type]) => [key, { type }])),
      allowPositionals: true,
      strict: true,
    });
  } catch {
    usage('引数が不正です。オプション名と値を確認してください');
  }
  for (const key of ['dir', 'as']) {
    if (parsed.values[key] === '') usage(`--${key} に空文字は指定できません`);
  }
  return {
    args: parsed.positionals,
    options: parsed.values,
    cwd: ctx.cwd ?? process.cwd(),
    env: ctx.env ?? process.env,
  };
}
