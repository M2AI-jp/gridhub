import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MasumeError } from './errors.js';
import { findRoot, logFile } from './paths.js';
import { inspectLog, outputFile, requireHealthy } from './store.js';
import { WORDS, resolveWords, t } from './words.js';

export function usage(message) {
  throw new MasumeError('E_USAGE', message);
}

/** argv の --words game|dev（--words=dev でも）。無ければ null。自分で引数を読むコマンドが、ことばを決めるのに使う（§76.2） */
export function wordsFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') return null;
    if (arg === '--words') return WORDS.includes(argv[i + 1]) ? argv[i + 1] : null;
    if (arg.startsWith('--words=')) {
      const value = arg.slice('--words='.length);
      return WORDS.includes(value) ? value : null;
    }
  }
  return null;
}

/** 冒険の書のある場所を、引数・環境変数・今いる場所から推し量る（無ければ null。ことばの設定を読むため） */
export function guessRoot({ cwd, env, dir }) {
  if (dir !== undefined) return resolve(cwd, dir);
  if (env?.MASUME_DIR) return resolve(cwd, env.MASUME_DIR);
  return findRoot(cwd);
}

export function parseArgs(argv, ctx, extra = {}) {
  const types = { dir: 'string', as: 'string', json: 'boolean', words: 'string', ...extra };
  const options = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (!argument.startsWith('--')) {
      args.push(argument);
      continue;
    }
    const equal = argument.indexOf('=');
    const key = argument.slice(2, equal === -1 ? undefined : equal);
    if (!Object.hasOwn(types, key)) usage(`知らないオプションです: --${key}`);
    if (types[key] === 'boolean') {
      if (equal !== -1) usage(`--${key} に値は指定できません`);
      options[key] = true;
    } else {
      const value = equal === -1 ? argv[++i] : argument.slice(equal + 1);
      if (value === undefined || (equal === -1 && value.startsWith('--'))) usage(`--${key} の値が必要です`);
      options[key] = value;
    }
  }
  if (options.dir === '' || options.as === '') usage('--dir と --as に空文字は指定できません');
  if (options.words !== undefined && !WORDS.includes(options.words)) usage(`--words は game か dev です: ${options.words}`);
  const cwd = ctx.cwd ?? process.cwd();
  const env = ctx.env ?? process.env;
  // ことば（§76）: --words > GRIDHUB_WORDS > 冒険の .masume/words.json > game。ここで決めて、以後の t() に効かせる
  resolveWords({ root: guessRoot({ cwd, env, dir: options.dir }), env, flag: options.words ?? null });
  return { args, options, cwd, env, actor: options.as ?? (env.MASUME_ACTOR || 'gm') };
}

export function gameRoot(command, { creating = false, optional = false } = {}) {
  const { cwd, env, options } = command;
  const root = options.dir !== undefined ? resolve(cwd, options.dir)
    : creating ? resolve(cwd)
      : env.MASUME_DIR ? resolve(cwd, env.MASUME_DIR) : findRoot(cwd);
  if (!root && !optional) throw new MasumeError('E_NO_GAME', t('err.nogame'));
  return root;
}

export function guardExistingGame(command) {
  const root = gameRoot(command, { optional: true });
  if (root && existsSync(logFile(root))) requireHealthy(inspectLog(root));
}

export function printValidation(result) {
  for (const { code, path, message } of [...result.errors, ...result.warnings]) {
    console.log(`[${code}] ${path}: ${message}`);
  }
  if (result.ok) console.log('地図は正常です');
}

export function printCorruption(errors) {
  if (errors.length > 0) {
    console.error(`${t('verify.cursed', errors[0].seq)}。読めたイベントだけを表示します`);
  }
}

function printFailureOutput(root, seq, node) {
  const file = outputFile(root, seq);
  if (!file) return;
  const output = readFileSync(file, 'utf8');
  // 累積判定では最後の区間が失敗したマス。前の成功出力を混ぜない。
  const heading = `=== ${node}: `;
  const boundary = output.lastIndexOf(`\n${heading}`);
  const failed = boundary >= 0 ? output.slice(boundary + 1) : output;
  console.log(failed.replace(/\r?\n$/u, '').split(/\r\n|\n|\r/u).slice(-40).join('\n'));
}

export function printCheckResult(root, result) {
  for (const { seq, type, data } of result.events) {
    switch (type) {
      case 'check_passed':
        console.log(t('check.passed', data.character, data.node));
        break;
      case 'check_failed':
        console.log(t('check.failed', data.character, data.failed));
        printFailureOutput(root, seq, data.failed);
        break;
      case 'stamped':
        console.log(t('check.stamped', data.by, data.node));
        break;
      case 'gate_cleared':
        console.log(t('check.gate_cleared', data.gate, data.members.join('、')));
        break;
      case 'gate_failed':
        console.log(t('check.gate_failed', data.blamed.length === data.members.length, data.gate, data.blamed.join('、')));
        printFailureOutput(root, seq, data.gate);
        break;
    }
  }
}
