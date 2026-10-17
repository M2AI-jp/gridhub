import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export { assert, existsSync, readFileSync, writeFileSync, join };
export const root = resolve(process.env.MASUME_ROOT || join(dirname(fileURLToPath(import.meta.url)), '../..'));
export const entries = {
  store: 'src/store/cli.mjs',
  tally: 'src/tally/cli.mjs',
  cli: 'src/cli/main.mjs',
};

export function requireEntry(owner) {
  assert.ok(existsSync(join(root, entries[owner])), `未実装: ${entries[owner]} が必要です`);
}

export function run(owner, args, { input = '', env = {}, cwd = root } = {}) {
  requireEntry(owner);
  const childEnv = { ...process.env };
  for (const key of Object.keys(childEnv)) {
    if (key.startsWith('KAKEIBO_') || ['NODE_TEST_CONTEXT', 'NODE_OPTIONS', 'FORCE_COLOR', 'NO_COLOR'].includes(key)) delete childEnv[key];
  }
  const result = spawnSync(process.execPath, [join(root, entries[owner]), ...args], {
    cwd,
    env: { ...childEnv, ...env },
    input: typeof input === 'string' ? input : JSON.stringify(input),
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${owner} がシグナルで終了しました: ${result.signal}`);
  return result;
}

export function success(result, label = 'コマンド') {
  assert.equal(result.status, 0, `${label} が成功しません: ${result.stderr.trim()}`);
  assert.equal(result.stderr, '', `${label} の成功時stderrは空である必要があります`);
  let value;
  try { value = JSON.parse(result.stdout); }
  catch { assert.fail(`${label} はstdoutにJSONオブジェクト1個を返す必要があります`); }
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${label} の出力はオブジェクトです`);
  return value;
}

export function failure(result, code, status = 2) {
  assert.equal(result.status, status, `${code} の終了コードは${status}です`);
  assert.equal(result.stdout, '', `${code} の失敗時stdoutは空です`);
  assert.match(result.stderr.trim(), new RegExp(`^\\[${code}\\] [^\\r\\n]+$`), `${code} の説明を1行で返してください`);
  assert.match(result.stderr, /[\u3040-\u30ff\u3400-\u9fff]/u, `${code} の説明は日本語です`);
}

export function expense(id, date, amount, category, note = '') {
  return { id, date, amount, category, note };
}

export function added(result, expected) {
  const value = success(result, '支出追加');
  assert.deepEqual(Object.keys(value).sort(), ['expense']);
  assert.match(value.expense?.id ?? '', /^[A-Za-z0-9_-]{1,80}$/);
  assert.deepEqual(value.expense, { ...expected, id: value.expense.id });
  return value.expense;
}

export function listed(result, expected) {
  const value = success(result, '支出一覧');
  assert.deepEqual(value, { expenses: expected });
  return value;
}

export function phase(owner, fn) {
  try { return fn(); }
  catch (error) {
    // An unidentified multi-module mismatch uses the gate's ordinary all-member rollback.
    if (owner && !error.blame) error.blame = owner;
    throw error;
  }
}

export async function check(id, fn, { gate = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), `kakeibo-${id}-`));
  try {
    await fn(dir);
    console.log(`PASS ${id}`);
  } catch (error) {
    const message = String(error.message || error).split(/\r?\n/).filter(Boolean).join(' ').slice(0, 1600);
    console.error(`FAIL ${id}: ${message}`);
    if (gate && error.blame) console.error(`MASUME_BLAME: ${error.blame}`);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
