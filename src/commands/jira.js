import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildView, findRoot, MasumeError } from '../engine/index.js';
import { parseArgs, usage } from '../linear/cli.js';
import { createClient } from '../jira/client.js';
import { planPush, pullMap, pushIssues, readJiraState, resolveProject } from '../jira/sync.js';

const USAGE = 'つかいかた: jira push [--project KEY] [--dry-run] / jira pull --project KEY --out <map.json> [--quest-id KEY] [--title T]';

function gameRoot({ options, cwd, env }) {
  const root = options.dir !== undefined ? resolve(cwd, options.dir)
    : env.MASUME_DIR ? resolve(cwd, env.MASUME_DIR) : findRoot(cwd);
  if (!root) throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません', 2);
  return root;
}

async function push(parsed) {
  const { options, env } = parsed;
  if (options.out !== undefined) usage('--out は pull だけで使います');
  if (options['quest-id'] !== undefined || options.title !== undefined) usage('--quest-id と --title は pull だけで使います');
  const root = gameRoot(parsed);
  const view = buildView(root);
  if (!view.integrity.ok) {
    throw new MasumeError('E_CURSED', `冒険の書が呪われています（seq ${view.integrity.errors[0]?.seq}）`, 3);
  }
  const saved = readJiraState(root);
  const dryRun = options['dry-run'] === true;
  const project = resolveProject(saved, options, { required: !dryRun });
  const plan = planPush(view, saved);

  if (dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, dryRun: true, project: project ?? null, issues: plan.map(({ id, action, status, summary }) => ({ id, action, status, summary })) }));
    } else {
      console.log(`送り先: Jira プロジェクト ${project ?? '（未指定）'}（--dry-run: 通信しません）`);
      for (const entry of plan) console.log(`  ${entry.action === 'create' ? '作成予定' : '更新予定'} ${entry.id}  ${entry.status}  ${entry.summary}`);
    }
    return 0;
  }

  const client = createClient({ env });
  const lines = [];
  const result = await pushIssues({ root, client, saved, plan, project, log: (line) => lines.push(line) });
  const summary = `作成 ${result.created}件・更新 ${result.updated}件・遷移 ${result.transitioned}件`;
  if (options.json) {
    console.log(JSON.stringify({ ok: result.stuck.length === 0, ...result }));
  } else {
    console.log(`Jira に同期しました（プロジェクト ${result.project}「${result.projectName}」）`);
    for (const line of lines) console.log(`  ${line}`);
    console.log(summary);
  }
  if (result.stuck.length > 0) {
    for (const entry of result.stuck) {
      if (entry.code === 'E_JIRA_TRANSITION') console.error(`[E_JIRA_TRANSITION] ${entry.message}`);
    }
    console.error(`飛ばしたマス: ${result.stuck.map((entry) => `${entry.id}（${entry.reason}）`).join('、')}`);
    return 1;
  }
  return 0;
}

async function pull(parsed) {
  const { options, cwd, env } = parsed;
  if (options['dry-run']) usage('--dry-run は push だけで使います');
  if (!options.project) usage('--project で Jira のプロジェクトキー（例: NOTE）を指定してください');
  if (!options.out) usage('--out で地図の下書きの出力先を指定してください');
  const client = createClient({ env });
  const { map, count } = await pullMap(client, { project: options.project, questId: options['quest-id'], title: options.title });
  const output = resolve(cwd, options.out);
  writeFileSync(output, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  if (options.json) console.log(JSON.stringify({ ok: true, file: output, issues: count }));
  else console.log(`Jira から ${count} 件の issue を読み、地図の下書きを保存しました: ${output}\n${map.quest.pitch}`);
  return 0;
}

export async function run(argv, ctx) {
  const parsed = parseArgs(argv, ctx, { project: 'string', out: 'string', 'dry-run': 'boolean', 'quest-id': 'string', title: 'string' });
  const { args, options } = parsed;
  for (const key of ['project', 'out']) {
    if (options[key] === '') usage(`--${key} に空文字は指定できません`);
  }
  if (args.length !== 1 || !['push', 'pull'].includes(args[0])) usage(USAGE);
  return args[0] === 'push' ? push(parsed) : pull(parsed);
}
