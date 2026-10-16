// CLI担当の単独E2E専用。製品の抽選や履歴保存は実装せず、固定応答と呼出記録だけを持つ。
import { copyCli, FIXTURE_ROWS, join, mkdirSync, readFileSync, writeFileSync, existsSync } from './support.mjs';

export const FAKE_ADVICE = '足元を確かめて進みましょう。';

const tracePrelude = `
import { appendFileSync, readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const trace = entry => appendFileSync(process.env.OMIKUJI_FAKE_TRACE, JSON.stringify({
  ...entry, cwd: process.cwd(), file: process.env.OMIKUJI_HISTORY_FILE
}) + '\\n');
const error = (code, status) => {
  console.error('[' + code + '] フェイクが指定どおりに失敗しました');
  process.exit(status);
};
`;

const fortuneFake = `${tracePrelude}
trace({ module: 'fortune', args });
if (process.env.OMIKUJI_FAKE_FORTUNE === 'fail') error('E_USAGE', 2);
if (process.env.OMIKUJI_FAKE_FORTUNE === 'bad-json') {
  console.log('not-json');
  process.exit(0);
}
if (args.length !== 0 && !(args.length === 2 && args[0] === '--seed')) error('E_USAGE', 2);
console.log(JSON.stringify({ fortune: '中吉', advice: ${JSON.stringify(FAKE_ADVICE)}, seed: args.length ? args[1] : null }));
`;

const historyFake = `${tracePrelude}
const input = args[0] === 'append' ? readFileSync(0, 'utf8') : null;
trace({ module: 'history', args, input });
if (process.env.OMIKUJI_FAKE_HISTORY === 'fail') error(args[0] === 'list' ? 'E_HISTORY_CORRUPT' : 'E_HISTORY_IO', 1);
if (process.env.OMIKUJI_FAKE_HISTORY === 'bad-json') {
  console.log('not-json');
  process.exit(0);
}
if (args.length !== 1) error('E_USAGE', 2);
if (args[0] === 'append') {
  const value = JSON.parse(input);
  console.log(JSON.stringify({ ...value, drawnAt: '2026-01-02T03:04:07.000Z' }));
} else if (args[0] === 'list') {
  console.log(process.env.OMIKUJI_FAKE_HISTORY === 'empty' ? '[]' : ${JSON.stringify(JSON.stringify(FIXTURE_ROWS))});
} else error('E_USAGE', 2);
`;

export const FAKE_SOURCES = Object.freeze({ fortune: fortuneFake, history: historyFake });

export function fixtureCli(dir) {
  const root = copyCli(dir);
  for (const [owner, content] of Object.entries(FAKE_SOURCES)) {
    mkdirSync(join(root, 'src', owner), { recursive: true });
    writeFileSync(join(root, 'src', owner, 'main.mjs'), content, 'utf8');
  }
  const trace = join(dir, '呼出記録.jsonl');
  const env = {
    OMIKUJI_FAKE_TRACE: trace,
    OMIKUJI_FAKE_FORTUNE: '',
    OMIKUJI_FAKE_HISTORY: '',
  };
  return {
    root, env, trace,
    reset() { writeFileSync(trace, '', 'utf8'); },
    calls() {
      return existsSync(trace) ? readFileSync(trace, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : [];
    },
  };
}
