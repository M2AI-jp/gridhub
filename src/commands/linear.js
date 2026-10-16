import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildView, findRoot, MasumeError } from '../engine/index.js';
import { createClient } from '../linear/client.js';
import { parseArgs, usage } from '../linear/cli.js';
import { planPush, pullMap, pushIssues, readLinearState, resolveTarget } from '../linear/sync.js';

const USAGE = 'つかいかた: linear push [--team KEY] [--project NAME] [--dry-run] / linear pull --team KEY [--project NAME] --out <map.json> [--quest-id KEY] [--title T]';

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
  const saved = readLinearState(root);
  const dryRun = options['dry-run'] === true;
  const target = resolveTarget(saved, options, view, { requireTeam: !dryRun });
  const plan = planPush(view, saved);

  if (dryRun) {
    if (options.json) {
      console.log(JSON.stringify({ ok: true, dryRun: true, team: target.team ?? null, project: target.project, issues: plan.map(({ id, action, status, title }) => ({ id, action, status, title })) }));
    } else {
      console.log(`送り先: チーム ${target.team ?? '（未指定）'}・プロジェクト「${target.project}」（--dry-run: 通信しません）`);
      for (const entry of plan) console.log(`  ${entry.action === 'create' ? '作成予定' : '更新予定'} ${entry.id}  ${entry.status}  ${entry.title}`);
    }
    return 0;
  }

  const client = createClient({ env });
  const lines = [];
  const result = await pushIssues({ root, view, client, saved, plan, target, log: (line) => lines.push(line) });
  if (options.json) {
    console.log(JSON.stringify({ ok: result.skipped.length === 0, ...result }));
  } else {
    console.log(`Linear に同期しました（チーム ${result.team}・プロジェクト「${result.project.name}」）`);
    for (const line of lines) console.log(`  ${line}`);
    console.log(`作成 ${result.created}件・更新 ${result.updated}件`);
  }
  if (result.skipped.length > 0) {
    console.error(`飛ばしたマス: ${result.skipped.map(({ id, reason }) => `${id}（${reason}）`).join('・')}`);
    return 1;
  }
  return 0;
}

async function pull(parsed) {
  const { options, cwd, env } = parsed;
  if (options['dry-run']) usage('--dry-run は push だけで使います');
  if (!options.team) usage('--team でチームのキー（例: ENG）を指定してください');
  if (!options.out) usage('--out で地図の下書きの出力先を指定してください');
  const client = createClient({ env });
  const { map, count } = await pullMap(client, {
    team: options.team, project: options.project, questId: options['quest-id'], title: options.title,
  });
  const output = resolve(cwd, options.out);
  writeFileSync(output, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  if (options.json) console.log(JSON.stringify({ ok: true, file: output, issues: count }));
  else console.log(`Linear から ${count} 件の issue を読み、地図の下書きを保存しました: ${output}\n${map.quest.pitch}`);
  return 0;
}

export async function run(argv, ctx) {
  const parsed = parseArgs(argv, ctx, {
    team: 'string', project: 'string', out: 'string', 'dry-run': 'boolean', 'quest-id': 'string', title: 'string',
  });
  const { args, options } = parsed;
  for (const key of ['team', 'project', 'out']) {
    if (options[key] === '') usage(`--${key} に空文字は指定できません`);
  }
  if (args.length !== 1 || !['push', 'pull'].includes(args[0])) usage(USAGE);
  return args[0] === 'push' ? push(parsed) : pull(parsed);
}
