import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const fortunes = new Set(['大吉', '中吉', '小吉', '吉', '末吉', '凶']);
const drawKeys = ['fortune', 'advice', 'seed'];
const recordKeys = [...drawKeys, 'drawnAt'];

class HistoryError extends Error {
  constructor(code, exitCode, message) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function hasExactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function hasValidDrawFields(value) {
  return fortunes.has(value.fortune)
    && typeof value.advice === 'string'
    && value.advice.trim().length > 0
    && [...value.advice].length <= 120
    && !/[\r\n]/u.test(value.advice)
    && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value.advice)
    && (value.seed === null
      || (typeof value.seed === 'string'
        && value.seed.length > 0
        && !value.seed.startsWith('--')));
}

function isRecord(value) {
  if (!hasExactKeys(value, recordKeys) || !hasValidDrawFields(value)) return false;
  if (typeof value.drawnAt !== 'string') return false;
  const date = new Date(value.drawnAt);
  return Number.isFinite(date.getTime()) && date.toISOString() === value.drawnAt;
}

function historyPath() {
  return resolve(
    process.cwd(),
    process.env.OMIKUJI_HISTORY_FILE || '.omikuji-history.jsonl',
  );
}

async function readHistory(filePath) {
  let bytes;
  try {
    bytes = await readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') return { contents: '', records: [] };
    throw error;
  }

  try {
    const contents = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(bytes);
    if (contents === '') return { contents, records: [] };

    const lines = contents.split('\n');
    if (lines.at(-1) === '') lines.pop();
    const records = lines.map((line) => JSON.parse(line));
    if (!records.every(isRecord)) throw new Error('Invalid record');
    return { contents, records };
  } catch {
    throw new HistoryError('E_HISTORY_CORRUPT', 1, '履歴が破損しています。');
  }
}

async function listHistory() {
  return (await readHistory(historyPath())).records;
}

async function appendHistory() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let draw;
  try {
    const input = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
      .decode(Buffer.concat(chunks));
    draw = JSON.parse(input);
    if (!hasExactKeys(draw, drawKeys) || !hasValidDrawFields(draw)) {
      throw new Error('Invalid draw');
    }
  } catch {
    throw new HistoryError('E_RECORD', 2, '入力は有効なDrawのJSONで指定してください。');
  }

  const filePath = historyPath();
  const { contents } = await readHistory(filePath);
  const separator = contents !== '' && !contents.endsWith('\n') ? '\n' : '';
  await mkdir(dirname(filePath), { recursive: true });

  const record = {
    fortune: draw.fortune,
    advice: draw.advice,
    seed: draw.seed,
    drawnAt: new Date().toISOString(),
  };
  await appendFile(filePath, `${separator}${JSON.stringify(record)}\n`, 'utf8');
  return record;
}

try {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['list', 'append'].includes(args[0])) {
    throw new HistoryError('E_USAGE', 2, 'list または append を単独で指定してください。');
  }
  const result = args[0] === 'list' ? await listHistory() : await appendHistory();
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  const failure = error instanceof HistoryError
    ? error
    : new HistoryError('E_HISTORY_IO', 1, '履歴の読み書きに失敗しました。');
  process.stderr.write(`[${failure.code}] ${failure.message}\n`);
  process.exitCode = failure.exitCode;
}
