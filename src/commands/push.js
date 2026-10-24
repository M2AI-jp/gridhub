// GitHub につなぐ導線（CONTRACTS §56.2）: いまのブランチをリモートに送る。force はしない。冒険の書には書かない。
import { resolve } from 'node:path';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { push } from '../engine/remote.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  if (command.args.length !== 0) usage('つかいかた: push [--json]');
  const root = gameRoot(command, { optional: true }) ?? resolve(command.cwd);
  const result = push(root);
  if (command.options.json) console.log(JSON.stringify(result));
  else if (result.ok) console.log(`GitHub に送った: ${result.remote} ${result.branch}（commit ${result.commit.slice(0, 7)}）`);
  else {
    console.log(`送れませんでした: ${result.remote} ${result.branch}（相手が先に進んでいるなら git pull で取り込んでから、もう一度。ログインしていないなら gh auth login）`);
    console.log(result.output.split('\n').slice(-20).join('\n'));
  }
  return result.ok ? 0 : 1;
}
