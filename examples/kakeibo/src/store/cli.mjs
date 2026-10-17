import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

function fail(code, message, status) {
  process.stderr.write(`[${code}] ${message}\n`);
  process.exit(status);
}

function readExpenses(file) {
  let bytes;
  try {
    bytes = readFileSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    fail('E_STORE', '台帳を読み込めません。', 1);
  }

  let ledger;
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    ledger = JSON.parse(text);
  } catch {
    fail('E_STORE', '台帳のJSONを読み取れません。', 1);
  }

  if (!hasExactFields(ledger, ['version', 'expenses'])
      || ledger.version !== 1 || !Array.isArray(ledger.expenses)) {
    fail('E_STORE', '台帳の形式またはバージョンが不正です。', 1);
  }

  const ids = new Set();
  for (const expense of ledger.expenses) {
    if (!isValidStoredExpense(expense)) {
      fail('E_STORE', '台帳に不正な支出が含まれています。', 1);
    }
    if (ids.has(expense.id)) {
      fail('E_STORE', '台帳の支出IDが重複しています。', 1);
    }
    ids.add(expense.id);
  }
  return ledger.expenses;
}

function hasExactFields(value, fields) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function isValidStoredExpense(expense) {
  if (!hasExactFields(expense, ['id', 'date', 'amount', 'category', 'note'])) {
    return false;
  }
  if (typeof expense.id !== 'string' || expense.id.length < 1 || expense.id.length > 80
      || /[^A-Za-z0-9_-]/.test(expense.id)) {
    return false;
  }
  if (!isValidDate(expense.date)
      || !Number.isInteger(expense.amount) || expense.amount < 1 || expense.amount > 1_000_000_000) {
    return false;
  }
  if (typeof expense.category !== 'string' || expense.category !== expense.category.trim()) {
    return false;
  }
  const categoryLength = [...expense.category].length;
  return categoryLength >= 1 && categoryLength <= 40
    && typeof expense.note === 'string' && [...expense.note].length <= 200;
}

function isValidDate(date) {
  if (typeof date !== 'string' || date.length !== 10
      || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split('-').map(Number);
  if (year < 1 || month < 1 || month > 12) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function readInput() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    fail('E_INPUT', '支出のJSONを読み取れません。', 2);
  }

  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('E_INPUT', '支出はJSONオブジェクトで指定してください。', 2);
  }
  const fields = new Set(['date', 'amount', 'category', 'note']);
  if (Object.keys(input).some((field) => !fields.has(field))) {
    fail('E_INPUT', '支出に指定できない項目が含まれています。', 2);
  }
  if (!isValidDate(input.date)) {
    fail('E_INPUT', '日付は年0001〜9999の実在する日をYYYY-MM-DD形式で指定してください。', 2);
  }
  if (!Number.isInteger(input.amount) || input.amount < 1 || input.amount > 1_000_000_000) {
    fail('E_INPUT', '金額は1〜1000000000円の整数で指定してください。', 2);
  }
  if (typeof input.category !== 'string') {
    fail('E_INPUT', 'カテゴリは文字列で指定してください。', 2);
  }
  const category = input.category.trim();
  const categoryLength = [...category].length;
  if (categoryLength < 1 || categoryLength > 40) {
    fail('E_INPUT', 'カテゴリは前後の空白を除いて1〜40文字で指定してください。', 2);
  }
  const note = Object.hasOwn(input, 'note') ? input.note : '';
  if (typeof note !== 'string' || [...note].length > 200) {
    fail('E_INPUT', 'メモは200文字以内の文字列で指定してください。', 2);
  }

  return { date: input.date, amount: input.amount, category, note };
}

function addExpense(file, input) {
  const expenses = readExpenses(file);
  const ids = new Set(expenses.map((expense) => expense.id));
  let id;
  do {
    id = randomUUID();
  } while (ids.has(id));

  const expense = { id, ...input };
  expenses.push(expense);
  try {
    writeFileSync(file, `${JSON.stringify({ version: 1, expenses })}\n`, 'utf8');
  } catch {
    fail('E_STORE', '台帳を保存できません。', 1);
  }
  return { expense };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !['add', 'list'].includes(args[0])) {
    fail('E_USAGE', 'add または list を指定してください。', 2);
  }

  const file = process.env.KAKEIBO_FILE;
  if (!file || !isAbsolute(file)) {
    fail('E_CONFIG', 'KAKEIBO_FILE に台帳の絶対パスを指定してください。', 2);
  }

  const result = args[0] === 'add'
    ? addExpense(file, readInput())
    : { expenses: readExpenses(file) };
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main();
