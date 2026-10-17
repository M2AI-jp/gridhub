import { CliError, parseArguments } from './arguments.mjs';
import { callStore, callSummary } from './backend.mjs';

const HELP = `家計簿 — 支出を記録し、月ごとに振り返ります。

使い方:
  node src/cli/main.mjs --help
  node src/cli/main.mjs add --date YYYY-MM-DD --amount 金額 --category カテゴリ [--note メモ]
  node src/cli/main.mjs list
  node src/cli/main.mjs summary --month YYYY-MM

コマンド:
  add       支出を追加します。
  list      保存した順で支出を一覧表示します。引数は不要です。
  summary   指定した月の合計とカテゴリ別内訳を表示します。
  --help    この使い方を表示します。台帳の指定は不要です。

入力条件:
  --date      必須。年0001〜9999の実在日を YYYY-MM-DD 形式で指定します。
  --amount    必須。1〜1,000,000,000円の整数を半角数字で指定します。
              先頭のゼロ、符号、小数、指数表記は使えません。
  --category  必須。前後の空白を除いて1〜40文字で指定します。
  --note      任意。200文字以内。省略時は空文字列です。空白や改行を保持します。
  --month     summary で必須。年0001〜9999、月01〜12を YYYY-MM 形式で指定します。
  文字数はUnicodeコードポイントで数えます。
  オプションの順序は自由です。各オプションは1回だけ指定できます。
  空白を含む値は引用符で囲んでください。

環境変数:
  KAKEIBO_FILE  台帳JSONの絶対パスを指定します。保存・一覧・集計で必要です。
`;

try {
  const request = parseArguments(process.argv.slice(2));
  if (request.command === 'help') {
    process.stdout.write(HELP);
  } else {
    const response = request.command === 'summary'
      ? callSummary(request.month)
      : callStore(request);
    process.stdout.write(response.stdout);
    process.stderr.write(response.stderr);
    process.exitCode = response.exitCode;
  }
} catch (error) {
  const failure = error instanceof CliError
    ? error
    : new CliError('E_BACKEND', '処理を完了できませんでした。', 1);
  process.stderr.write(`[${failure.code}] ${failure.message}\n`);
  process.exitCode = failure.exitCode;
}
