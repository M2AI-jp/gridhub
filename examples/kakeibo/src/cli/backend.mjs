import { spawnSync } from 'node:child_process';
import { accessSync, constants, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliError } from './arguments.mjs';

function backendError(message) {
  return new CliError('E_BACKEND', message, 1);
}

function callBackend(backendPath, args, input, name) {
  try {
    if (!isAbsolute(backendPath) || !backendPath.endsWith('.mjs') || !statSync(backendPath).isFile()) {
      throw backendError(`${name}バックエンドを起動できませんでした。`);
    }
    accessSync(backendPath, constants.R_OK);
  } catch {
    throw backendError(`${name}バックエンドを起動できませんでした。`);
  }

  const result = spawnSync(process.execPath, [backendPath, ...args], {
    encoding: 'utf8',
    input,
    env: process.env,
    shell: false,
    maxBuffer: Infinity,
  });

  if (result.error || result.signal || result.status === null) {
    throw backendError(`${name}バックエンドを実行できませんでした。`);
  }

  if (result.status !== 0) {
    const errorLine = result.stderr.split(/\r?\n/u, 1)[0];
    if (!errorLine) {
      throw backendError(`${name}バックエンドからエラーの説明が返りませんでした。`);
    }
    return { stdout: '', stderr: `${errorLine}\n`, exitCode: result.status };
  }

  let response;
  try {
    response = JSON.parse(result.stdout);
  } catch {
    throw backendError(`${name}バックエンドから正しいJSONが返りませんでした。`);
  }
  if (response === null || typeof response !== 'object' || Array.isArray(response)) {
    throw backendError(`${name}バックエンドからJSONオブジェクトが返りませんでした。`);
  }

  return { stdout: `${JSON.stringify(response)}\n`, stderr: '', exitCode: 0 };
}

export function callStore(request) {
  const storePath = process.env.KAKEIBO_STORE_CLI
    ?? fileURLToPath(new URL('../store/cli.mjs', import.meta.url));
  const input = request.command === 'add' ? JSON.stringify(request.expense) : '';
  return callBackend(storePath, [request.command], input, '保存');
}

export function callSummary(month) {
  const expenses = callStore({ command: 'list' });
  if (expenses.exitCode !== 0) {
    return expenses;
  }

  const tallyPath = process.env.KAKEIBO_TALLY_CLI
    ?? fileURLToPath(new URL('../tally/cli.mjs', import.meta.url));
  return callBackend(tallyPath, ['month', month], expenses.stdout, '集計');
}
