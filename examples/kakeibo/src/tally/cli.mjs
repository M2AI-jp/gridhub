import { readFileSync } from 'node:fs';

function isValidMonth(month) {
  return typeof month === 'string'
    && month.length === 7
    && /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(month)
    && month.slice(0, 4) !== '0000';
}

function isValidDate(date) {
  if (typeof date !== 'string'
    || date.length !== 10
    || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)
    || !isValidMonth(date.slice(0, 7))) {
    return false;
  }

  const [year, month, day] = date.split('-').map(Number);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function hasExactFields(value, fields) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every((field) => Object.hasOwn(value, field));
}

function isValidExpense(expense) {
  if (!hasExactFields(expense, ['id', 'date', 'amount', 'category', 'note'])) {
    return false;
  }

  const { id, date, amount, category, note } = expense;
  return typeof id === 'string'
    && id.length >= 1
    && id.length <= 80
    && !/[^A-Za-z0-9_-]/.test(id)
    && isValidDate(date)
    && Number.isInteger(amount)
    && amount >= 1
    && amount <= 1_000_000_000
    && typeof category === 'string'
    && category === category.trim()
    && [...category].length >= 1
    && [...category].length <= 40
    && typeof note === 'string'
    && [...note].length <= 200;
}

function isValidInput(input) {
  if (!hasExactFields(input, ['expenses']) || !Array.isArray(input.expenses)) {
    return false;
  }

  const ids = new Set();
  for (const expense of input.expenses) {
    if (!isValidExpense(expense) || ids.has(expense.id)) return false;
    ids.add(expense.id);
  }
  return true;
}

function summarizeMonth(expenses, month) {
  let count = 0;
  let total = 0;
  const categories = new Map();

  for (const expense of expenses) {
    if (expense.date.slice(0, 7) !== month) continue;

    count += 1;
    total += expense.amount;

    const subtotal = categories.get(expense.category) ?? {
      category: expense.category,
      count: 0,
      total: 0,
    };
    subtotal.count += 1;
    subtotal.total += expense.amount;
    categories.set(expense.category, subtotal);
  }

  const byCategory = [...categories.keys()]
    .sort()
    .map((category) => categories.get(category));

  return { month, currency: 'JPY', count, total, byCategory };
}

const args = process.argv.slice(2);

if (args.length !== 2 || args[0] !== 'month' || !isValidMonth(args[1])) {
  process.stderr.write('[E_USAGE] month YYYY-MM を指定してください。\n');
  process.exitCode = 2;
} else {
  try {
    const input = JSON.parse(readFileSync(0, 'utf8'));
    if (!isValidInput(input)) throw new Error('支出入力が不正です。');
    const result = summarizeMonth(input.expenses, args[1]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('[E_INPUT] 支出のJSONまたは保存済みレコードが不正です。\n');
    process.exitCode = 2;
  }
}
