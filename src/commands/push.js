// GitHub への導線（第12章）: リモートへ送る・自動で送るかを選ぶ・つなぎ方の手引きを見る。
import { buildView } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { ghStatus, gitGuide, gitStatus, push, setAutoPush } from '../engine/remote.js';

const USAGE = 'つかいかた: push [--auto on|off] [--guide] [--json]';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { auto: 'string', guide: 'boolean' });
  const { args, options, actor } = command;
  if (args.length !== 0 || (options.auto !== undefined && !['on', 'off'].includes(options.auto))) usage(USAGE);
  const root = gameRoot(command);

  if (options.auto !== undefined) {
    const event = setAutoPush(root, options.auto === 'on', { actor });
    if (options.json) console.log(JSON.stringify({ auto_push: event.data.auto_push, seq: event.seq }));
    else console.log(`町でセーブしたら、自動でリモートへ送る: ${event.data.auto_push ? 'する' : 'しない'}（記録: seq ${event.seq}）`);
    return 0;
  }

  if (options.guide) {
    const repo = gitStatus(root);
    const gh = ghStatus();
    const { git } = buildView(root);
    const guide = gitGuide(repo, gh, root);
    if (options.json) {
      console.log(JSON.stringify({ repo, gh, auto_push: git.auto_push, last_push: git.last_push, unpushed: git.unpushed, ...guide }));
      return 0;
    }
    console.log(`Git: ${repo.inside ? `${repo.branch ?? '（ブランチなし）'}${repo.head ? ` / commit ${repo.head.slice(0, 7)}` : ''}` : 'このフォルダは Git で管理されていません'}`);
    console.log(`リモート: ${repo.remote ? `${repo.remote.name} ${repo.remote.url ?? ''}`.trim() : 'まだつながっていません'}`);
    if (repo.remote) console.log(`まだ送っていないコミット: ${repo.ahead} 件${repo.behind ? ` / リモートにだけあるコミット: ${repo.behind} 件` : ''}`);
    console.log(`最後に送ったコミット: ${git.last_push ? `${git.last_push.commit?.slice(0, 7)}（${git.last_push.remote} の ${git.last_push.branch}・seq ${git.last_push.seq}）` : 'まだない'}`);
    console.log(`GitHub CLI（gh）: ${gh.installed ? (gh.authed ? `ログイン済み${gh.user ? `（${gh.user}）` : ''}` : '入っているが、ログインしていない') : '入っていない'}`);
    console.log(`町でセーブしたら自動で送る: ${git.auto_push ? 'する' : 'しない'}（gridhub push --auto on|off）`);
    console.log('手引き:');
    guide.steps.forEach((step, index) => {
      console.log(`  ${step.done ? '✔' : index === guide.steps.findIndex((s) => !s.done) ? '→' : '・'} ${index + 1}. ${step.title}${step.command ? `: ${step.command}` : ''}`);
      if (!step.done && step.note) console.log(`       ${step.note}`);
    });
    return 0;
  }

  const result = push(root, { actor });
  if (options.json) console.log(JSON.stringify(result));
  else if (result.exitCode === 0) {
    const { remote, branch, commit } = result.event.data;
    console.log(`${remote} の ${branch} へ送りました（commit ${commit.slice(0, 7)}・記録: seq ${result.event.seq}）`);
  } else console.log(`送れませんでした: ${result.event.data.error}（記録: seq ${result.event.seq}）`);
  return result.exitCode;
}
