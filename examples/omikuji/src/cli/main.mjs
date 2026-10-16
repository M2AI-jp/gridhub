import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArguments } from './args.mjs';

const help = `使い方:
  node src/cli/main.mjs [--seed <文字列>] [--json]
  node src/cli/main.mjs --history [--json]
  node src/cli/main.mjs --help

オプション:
  --seed <文字列>  指定した文字列で抽選結果を再現します。
  --json           結果をJSONで表示します。
  --history        保存した履歴を表示します。--seed とは併用できません。
  --help           この使い方を表示します。単独で指定してください。

各オプションの順番は自由ですが、重複はできません。
seedは空文字や -- で始まる文字列を指定できません。
--seed=value 形式や位置引数には対応していません。
`;

const fortunes = ['大吉', '中吉', '小吉', '吉', '末吉', '凶'];

class DependencyError extends Error {
  constructor(line = '[E_DEPENDENCY] 依存先の応答を確認できませんでした。\n', exitCode = 1) {
    super(line);
    this.line = line;
    this.exitCode = exitCode;
  }
}

function hasFields(value, fields) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function validDrawFields(value) {
  return fortunes.includes(value.fortune)
    && typeof value.advice === 'string'
    && value.advice.trim().length > 0
    && [...value.advice].length <= 120
    && !/[\r\n]/u.test(value.advice)
    && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value.advice)
    && (value.seed === null
      || (typeof value.seed === 'string' && value.seed.length > 0 && !value.seed.startsWith('--')));
}

function isDraw(value) {
  return hasFields(value, ['fortune', 'advice', 'seed']) && validDrawFields(value);
}

function isRecord(value) {
  if (!hasFields(value, ['fortune', 'advice', 'seed', 'drawnAt'])
    || !validDrawFields(value) || typeof value.drawnAt !== 'string') {
    return false;
  }
  const date = new Date(value.drawnAt);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value.drawnAt;
}

function callJson(entry, args, validate, input) {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL(entry, import.meta.url)), ...args],
    {
      cwd: process.cwd(),
      env: process.env,
      encoding: 'utf8',
      input,
    },
  );
  if (result.error || result.status === null) {
    throw new DependencyError();
  }
  if (result.status !== 0) {
    if (result.stdout === '' && /^\[E_[A-Z_]+\] [^\r\n]+\n$/u.test(result.stderr)) {
      throw new DependencyError(result.stderr, result.status);
    }
    throw new DependencyError();
  }
  if (result.stderr !== '') {
    throw new DependencyError();
  }
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new DependencyError();
  }
  if (!validate(value)) {
    throw new DependencyError();
  }
  return value;
}

function main() {
  let options;
  try {
    options = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`[E_USAGE] ${error.message}\n`);
    process.exitCode = 2;
    return;
  }

  if (options.help) {
    process.stdout.write(help);
    return;
  }
  try {
    if (options.history) {
      const records = callJson(
        '../history/main.mjs',
        ['list'],
        (value) => Array.isArray(value) && value.every(isRecord),
      );
      process.stdout.write(
        options.json
          ? `${JSON.stringify(records)}\n`
          : records.length === 0
            ? '履歴はありません。\n'
            : records.map((record) => `${record.drawnAt}\t${record.fortune}\t${record.advice}\n`).join(''),
      );
      return;
    }

    const draw = callJson(
      '../fortune/main.mjs',
      options.seed === null ? [] : ['--seed', options.seed],
      (value) => isDraw(value) && value.seed === options.seed,
    );
    const drawJson = `${JSON.stringify(draw)}\n`;
    callJson(
      '../history/main.mjs',
      ['append'],
      (value) => isRecord(value)
        && value.fortune === draw.fortune
        && value.advice === draw.advice
        && value.seed === draw.seed,
      drawJson,
    );
    process.stdout.write(
      options.json
        ? drawJson
        : `運勢: ${draw.fortune}\nひとこと: ${draw.advice}\n`,
    );
  } catch (error) {
    const failure = error instanceof DependencyError ? error : new DependencyError();
    process.stderr.write(failure.line);
    process.exitCode = failure.exitCode;
  }
}

main();
