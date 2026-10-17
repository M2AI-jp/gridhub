export class CliError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function usage(message) {
  throw new CliError('E_USAGE', message);
}

function input(message) {
  throw new CliError('E_INPUT', message);
}

function parseOptions(args, allowed, required) {
  const options = new Map();

  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if (!allowed.includes(name)) {
      usage('未知のオプション、または余分な引数があります。');
    }
    if (options.has(name)) {
      usage('同じオプションを複数回指定できません。');
    }

    const value = args[index + 1];
    if (value === undefined) {
      usage('オプションの値がありません。');
    }
    options.set(name, value);
  }

  if (required.some((name) => !options.has(name))) {
    usage('必須オプションがありません。使い方は --help で確認できます。');
  }
  return options;
}

function isMonth(value) {
  return value.length === 7
    && /^[0-9]{4}-[0-9]{2}$/u.test(value)
    && Number(value.slice(0, 4)) >= 1
    && Number(value.slice(5, 7)) >= 1
    && Number(value.slice(5, 7)) <= 12;
}

function isDate(value) {
  if (value.length !== 10
      || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u.test(value)
      || !isMonth(value.slice(0, 7))) {
    return false;
  }

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function parseExpense(options) {
  const date = options.get('--date');
  if (!isDate(date)) {
    input('日付は年0001〜9999の実在する日を YYYY-MM-DD 形式で指定してください。');
  }

  const amountText = options.get('--amount');
  const amount = Number(amountText);
  if (!/^[1-9][0-9]*$/u.test(amountText)
      || !Number.isInteger(amount)
      || amount < 1
      || amount > 1_000_000_000
      || String(amount) !== amountText) {
    input('金額は1〜1,000,000,000円の整数を、先頭のゼロや符号なしの半角数字で指定してください。');
  }

  const category = options.get('--category').trim();
  const categoryLength = [...category].length;
  if (categoryLength < 1 || categoryLength > 40) {
    input('カテゴリは前後の空白を除いて1〜40文字で指定してください。');
  }

  const note = options.get('--note') ?? '';
  if ([...note].length > 200) {
    input('メモは200文字以内で指定してください。');
  }

  return { date, amount, category, note };
}

export function parseArguments(args) {
  const [command, ...rest] = args;
  switch (command) {
    case '--help':
      if (rest.length !== 0) {
        usage('--help に追加の引数は指定できません。');
      }
      return { command: 'help' };
    case 'add': {
      const options = parseOptions(
        rest,
        ['--date', '--amount', '--category', '--note'],
        ['--date', '--amount', '--category'],
      );
      return { command, expense: parseExpense(options) };
    }
    case 'list':
      if (rest.length !== 0) {
        usage('list に引数やオプションは指定できません。');
      }
      return { command };
    case 'summary': {
      const options = parseOptions(rest, ['--month'], ['--month']);
      const month = options.get('--month');
      if (!isMonth(month)) {
        usage('月は年0001〜9999、月01〜12の YYYY-MM 形式で指定してください。');
      }
      return { command, month };
    }
    default:
      usage('add、list、summary のいずれかを指定してください。使い方は --help で確認できます。');
  }
}
