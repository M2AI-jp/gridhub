// GM管理のE2E補助。製品のモジュールをimportせず、公開CLIと生成物を検証する。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync,
  statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { assert, existsSync, mkdirSync, readFileSync, writeFileSync, join, resolve };
export const ROOT = resolve(process.env.MASUME_ROOT || join(dirname(fileURLToPath(import.meta.url)), '..'));
export const ENTRIES = {
  fortune: 'src/fortune/main.mjs',
  history: 'src/history/main.mjs',
  cli: 'src/cli/main.mjs',
};
export const FORTUNES = ['大吉', '中吉', '小吉', '吉', '末吉', '凶'];
export const SEEDS = [
  '0', '1', '01', '42', 'alpha', '神社', ' seed ', "quote'\";$(echo NO)",
  ...Array.from({ length: 24 }, (_, n) => `おみくじ-${n}`),
];
export const FIXTURE_DRAW = { fortune: '中吉', advice: '足元を確かめて進みましょう。', seed: '記録用' };
export const FIXTURE_ROWS = [
  { fortune: '大吉', advice: '新しいことを始めましょう。', seed: '最初', drawnAt: '2026-01-02T03:04:05.000Z' },
  { fortune: '凶', advice: '今日はゆっくり休みましょう。', seed: null, drawnAt: '2026-01-02T03:04:06.000Z' },
];

const oneLine = value => String(value).replace(/[\r\n\t]+/g, ' ').slice(0, 700);

export function check(id, scenario, { gate = false } = {}) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `omikuji-${id}-`)));
  try {
    scenario({ dir });
    console.log(`PASS ${id}: E2Eの全シナリオが成功`);
  } catch (error) {
    console.error(`FAIL ${id}: ${oneLine(error.message || error)}`);
    if (gate && error.blame?.length) console.error(`MASUME_BLAME: ${error.blame.join(',')}`);
    process.exitCode = 1;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function blame(ids, operation) {
  try {
    return operation();
  } catch (error) {
    if (!error.blame) error.blame = Array.isArray(ids) ? ids : [ids];
    throw error;
  }
}

export function requireEntry(owner, root = ROOT) {
  const entry = join(root, ENTRIES[owner]);
  assert.ok(ENTRIES[owner], `判定設定: 未知の担当 ${owner}`);
  assert.ok(existsSync(entry), `未実装: ${ENTRIES[owner]}`);
  assert.ok(statSync(entry).isFile(), `入口が通常ファイルではない: ${ENTRIES[owner]}`);
  return entry;
}

export function historyFile(dir) {
  return join(dir, '保存 先', 'おみくじ.jsonl');
}

export function run(owner, args, { dir, root = ROOT, cwd = dir, env = {}, input } = {}) {
  const entry = requireEntry(owner, root);
  const childEnv = { ...process.env, OMIKUJI_HISTORY_FILE: historyFile(dir), ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  delete childEnv.NODE_OPTIONS;
  for (const [key, value] of Object.entries(childEnv)) {
    if (value === null || value === undefined) delete childEnv[key];
  }
  const result = spawnSync(process.execPath, [entry, ...args], {
    cwd, env: childEnv, input, encoding: 'utf8', timeout: 10_000, maxBuffer: 1024 * 1024,
  });
  assert.ok(!result.error, `${owner} の起動失敗: ${result.error?.message}`);
  assert.notEqual(result.status, null, `${owner} が終了しないかシグナルで停止: ${result.signal}`);
  return result;
}

export function success(result, context) {
  assert.equal(result.status, 0, `${context}: 終了0が必要（${result.status}） ${oneLine(result.stderr)}`);
  assert.equal(result.stderr, '', `${context}: 成功時のstderrは空にする`);
  assert.ok(result.stdout.endsWith('\n'), `${context}: stdoutはLFで終える`);
  return result.stdout;
}

export function json(result, context) {
  const text = success(result, context);
  try {
    return JSON.parse(text);
  } catch {
    assert.fail(`${context}: stdoutにはJSON値1つだけを出す（受信: ${oneLine(text)}）`);
  }
}

export function failure(result, code, status, context) {
  assert.equal(result.status, status, `${context}: 終了${status}が必要（${result.status}） ${oneLine(result.stderr)}`);
  assert.equal(result.stdout, '', `${context}: エラー時に成功結果をstdoutへ出してはいけない`);
  assert.match(result.stderr, new RegExp(`^\\[${code}\\] [^\\r\\n]+\\n$`), `${context}: [${code}] 理由 の1行が必要`);
}

export function keys(value, expected, context) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `${context}: JSONオブジェクトが必要`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${context}: 項目が契約と違う`);
}

function fortuneAdvice(value, context) {
  assert.ok(FORTUNES.includes(value.fortune), `${context}: 運勢は指定された6種類のいずれかにする`);
  assert.equal(typeof value.advice, 'string', `${context}: adviceは文字列にする`);
  assert.ok(value.advice.trim().length > 0 && [...value.advice].length <= 120, `${context}: 助言は空白だけでない1〜120文字にする`);
  assert.doesNotMatch(value.advice, /[\r\n]/, `${context}: 助言は一行にする`);
  assert.match(value.advice, /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u, `${context}: 助言に日本語を含める`);
}

function seedValue(seed, context) {
  assert.ok(seed === null || (typeof seed === 'string' && seed.length > 0 && !seed.startsWith('--')), `${context}: seedは有効な文字列またはnullにする`);
}

export function catalog(value) {
  assert.ok(Array.isArray(value), 'カタログは配列にする');
  assert.deepEqual(value.map(row => row?.fortune), FORTUNES, 'カタログは指定順の6種類を1件ずつ返す');
  for (const row of value) {
    keys(row, ['fortune', 'advice'], 'カタログの項目');
    fortuneAdvice(row, 'カタログ');
  }
  return value;
}

export function draw(value, context = '抽選結果') {
  keys(value, ['fortune', 'advice', 'seed'], context);
  fortuneAdvice(value, context);
  seedValue(value.seed, context);
  return value;
}

export function record(value, context = '履歴レコード') {
  keys(value, ['fortune', 'advice', 'seed', 'drawnAt'], context);
  fortuneAdvice(value, context);
  seedValue(value.seed, context);
  assert.equal(typeof value.drawnAt, 'string', `${context}: drawnAtは文字列にする`);
  assert.match(value.drawnAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, `${context}: drawnAtはミリ秒付きISO UTC日時にする`);
  const time = Date.parse(value.drawnAt);
  assert.ok(Number.isFinite(time), `${context}: drawnAtが日時として読めない`);
  assert.equal(new Date(time).toISOString(), value.drawnAt, `${context}: drawnAtは実在する日時にする`);
  return value;
}

export function records(value) {
  assert.ok(Array.isArray(value), '履歴一覧は配列にする');
  value.forEach((row, index) => record(row, `履歴${index + 1}件目`));
  return value;
}

export function resultOf(row) {
  return { fortune: row.fortune, advice: row.advice, seed: row.seed };
}

export function expectedFortune(seed) {
  return FORTUNES[createHash('sha256').update(seed, 'utf8').digest().readUInt32BE(0) % FORTUNES.length];
}

export function matchesCatalog(value, entries, seed) {
  draw(value);
  assert.equal(value.seed, seed, 'seedを省略・変換せず返す（省略時はnull）');
  if (seed !== null) assert.equal(value.fortune, expectedFortune(seed), 'seedの抽選規則がCONTRACTS.md §3と違う');
  assert.equal(value.advice, entries.find(row => row.fortune === value.fortune)?.advice, '抽選の助言をカタログと一致させる');
  return value;
}

export function savedNow(row, started, ended = Date.now()) {
  const time = Date.parse(record(row).drawnAt);
  assert.ok(time >= started - 1000 && time <= ended + 1000, 'drawnAtは今回の保存処理の実時刻にする');
}

export function textDraw(value) {
  return `運勢: ${value.fortune}\nひとこと: ${value.advice}\n`;
}

export function textHistory(rows) {
  return rows.length === 0 ? '履歴はありません。\n' : rows.map(row => `${row.drawnAt}\t${row.fortune}\t${row.advice}\n`).join('');
}

export function writeRows(file, rows, { finalLF = true } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, rows.map(row => JSON.stringify(row)).join('\n') + (rows.length && finalLF ? '\n' : ''), 'utf8');
}

export function fileRecords(file) {
  assert.ok(existsSync(file), '保存後の履歴ファイルがない');
  const raw = readFileSync(file, 'utf8');
  if (raw === '') return [];
  assert.ok(raw.endsWith('\n'), '追記後の履歴ファイルはLFで終える');
  const rows = raw.slice(0, -1).split('\n').map((line, index) => {
    assert.ok(line.length > 0, `履歴${index + 1}行目が空`);
    try { return JSON.parse(line); }
    catch { assert.fail(`履歴${index + 1}行目がJSONではない`); }
  });
  return records(rows);
}

export function noHistory(dir) {
  assert.ok(!existsSync(historyFile(dir)), 'この操作では指定された履歴ファイルを作ってはいけない');
  assert.ok(!existsSync(join(dir, '.omikuji-history.jsonl')), 'この操作では既定の履歴ファイルを作ってはいけない');
}

export function copyCli(dir) {
  requireEntry('cli');
  const stage = join(dir, '隔離 プロジェクト');
  mkdirSync(join(stage, 'src'), { recursive: true });
  cpSync(join(ROOT, 'src/cli'), join(stage, 'src/cli'), { recursive: true });
  return stage;
}
