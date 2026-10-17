import { assert, check, run, failure, join } from './lib/harness.mjs';
await check('C1', dir => {
  const env = { KAKEIBO_STORE_CLI: join(dir, 'absent-store.mjs'), KAKEIBO_TALLY_CLI: join(dir, 'absent-tally.mjs') };
  const help = run('cli', ['--help'], { env });
  assert.equal(help.status, 0, '依存なしでヘルプを表示してください');
  assert.equal(help.stderr, '');
  assert.match(help.stdout, /[\u3040-\u30ff\u3400-\u9fff]/u);
  for (const token of ['add', 'list', 'summary', '--date', '--amount', '--category', '--note', '--month', 'KAKEIBO_FILE']) assert.ok(help.stdout.includes(token), `ヘルプに${token}が必要です`);
  const valid = ['add', '--date', '2026-10-01', '--amount', '1200', '--category', '食費'];
  const usage = [[], ['unknown'], ['list', 'extra'], ['list', '--note', 'x'], ['summary'], ['summary', '--month'], ['summary', '--month', '2026-10', '--month', '2026-11'], ['summary', '--month', '2026-13'], ['summary', '--month', '0000-01'], ['summary', '--month', '2026-1'], ['add'], ['add', '--date', '2026-10-01', '--category', '食費'], [...valid, '--unknown', 'x'], [...valid, '--amount', '20'], [...valid, '--note'], [...valid, 'extra']];
  for (const args of usage) failure(run('cli', args, { env }), 'E_USAGE');
  for (const [flag, values] of [['--date', ['2026-02-29', '2026-04-31', '0000-01-01', '2026-1-01']], ['--amount', ['0', '-1', '1.5', '01', '1e3', '1000000001', 'abc']], ['--category', ['', '   ', 'あ'.repeat(41)]]]) {
    for (const value of values) {
      const args = [...valid]; args[args.indexOf(flag) + 1] = value;
      failure(run('cli', args, { env }), 'E_INPUT');
    }
  }
  failure(run('cli', [...valid, '--note', 'あ'.repeat(201)], { env }), 'E_INPUT');
});
