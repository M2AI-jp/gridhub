import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildView, findRoot, MasumeError } from '../engine/index.js';
import { parseArgs, usage } from '../linear/cli.js';
import { exportIssues, issuesCsv } from '../linear/export.js';

export async function run(argv, ctx) {
  const { args, options, cwd, env } = parseArgs(argv, ctx, { format: 'string', out: 'string' });
  if (args.length !== 1 || args[0] !== 'linear') {
    usage('つかいかた: export linear [--format json|csv] [--out file]');
  }
  const format = options.format ?? 'json';
  if (format !== 'json' && format !== 'csv') usage('--format は json または csv を指定してください');
  if (options.out === '') usage('--out に出力先を指定してください');
  if (format === 'csv' && options.json && options.out === undefined) {
    usage('CSV を --json と一緒に使うときは --out に出力先を指定してください');
  }
  const root = options.dir !== undefined ? resolve(cwd, options.dir)
    : env.MASUME_DIR ? resolve(cwd, env.MASUME_DIR) : findRoot(cwd);
  if (!root) throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません', 2);
  const view = buildView(root);
  if (!view.integrity.ok) {
    const first = view.integrity.errors[0];
    throw new MasumeError('E_CURSED', `冒険の書が呪われています（seq ${first?.seq}）`, 3);
  }
  const issues = exportIssues(view);
  const output = format === 'csv' ? issuesCsv(issues) : `${JSON.stringify(issues, null, 2)}\n`;
  if (options.out !== undefined) {
    writeFileSync(resolve(cwd, options.out), output, 'utf8');
    if (options.json) console.log(JSON.stringify(issues));
  } else {
    process.stdout.write(output);
  }
  return 0;
}
