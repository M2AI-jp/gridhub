import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasumeError } from '../engine/index.js';
import { issuesDocument } from './client.js';
import { exportIssues } from './export.js';
import { mapFromRecords } from './import.js';

const STATE_RULES = {
  Backlog: (states) => states.find((state) => state.type === 'backlog'),
  Todo: (states) => states.find((state) => state.type === 'unstarted'),
  'In Progress': (states) => states.find((state) => state.type === 'started' && state.name === 'In Progress')
    ?? states.find((state) => state.type === 'started'),
  'In Review': (states) => states.find((state) => state.type === 'started' && state.name === 'In Review')
    ?? states.find((state) => state.type === 'started'),
  Done: (states) => states.find((state) => state.type === 'completed'),
};

function fail(code, message, exitCode = 2) {
  return new MasumeError(code, message, exitCode);
}

// ---- .masume/linear.json（マスID ↔ Linear の issue の対応表） ----

export function linearFile(root) {
  return join(root, '.masume', 'linear.json');
}

export function readLinearState(root) {
  let text;
  try {
    text = readFileSync(linearFile(root), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { issues: {} };
    throw error;
  }
  let saved;
  try {
    saved = JSON.parse(text);
  } catch {
    throw fail('E_LINEAR_CONFIG', '.masume/linear.json を読めません（JSON が壊れています）');
  }
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
    throw fail('E_LINEAR_CONFIG', '.masume/linear.json の形が不正です');
  }
  const issues = typeof saved.issues === 'object' && saved.issues !== null && !Array.isArray(saved.issues) ? saved.issues : {};
  return { ...saved, issues };
}

function writeLinearState(root, state) {
  mkdirSync(join(root, '.masume'), { recursive: true });
  const file = linearFile(root);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

// ---- push ----

/** 送り先（チーム・プロジェクト名）を --team / --project と対応表から決め、食い違いを止める。 */
export function resolveTarget(saved, options, view, { requireTeam }) {
  const team = options.team ?? saved.team;
  const project = options.project ?? saved.project?.name ?? view.quest.title;
  if (!team && requireTeam) throw fail('E_USAGE', '--team でチームのキー（例: ENG）を指定してください');
  if (saved.team && team !== saved.team) {
    throw fail('E_USAGE', `.masume/linear.json はチーム ${saved.team} 用です（--team ${team}）。別のチームへ送るなら、先にこのファイルを退けてください`);
  }
  if (saved.project?.name && project !== saved.project.name) {
    throw fail('E_USAGE', `.masume/linear.json はプロジェクト「${saved.project.name}」用です（--project ${project}）。別のプロジェクトへ送るなら、先にこのファイルを退けてください`);
  }
  return { team, project };
}

/** 送る予定: マスごとに、作成か更新か、Linear の title / description / Status。 */
export function planPush(view, saved) {
  return exportIssues(view).map((issue) => ({
    id: issue.ID,
    action: saved.issues[issue.ID]?.id ? 'update' : 'create',
    title: `[${issue.ID}] ${issue.Title}`,
    description: issue.Description,
    status: issue.Status,
  }));
}

function stateFor(team, status) {
  return STATE_RULES[status](team.states?.nodes ?? []);
}

function ensureSuccess(result, what) {
  if (!result?.success) throw fail('E_LINEAR_API', `Linear が${what}に失敗しました`, 1);
}

export async function pushIssues({ root, view, client, saved, plan, target, log = () => {} }) {
  const teams = (await client.request('MasumeTeams', { key: target.team })).teams?.nodes ?? [];
  const team = teams[0];
  if (!team) throw fail('E_LINEAR_TEAM', `チーム ${target.team} が Linear に見つかりません`);

  // 何も作る前に、写せない状態がないか確かめる（途中まで作って止まるのを避ける）。
  const states = new Map();
  for (const status of new Set(plan.map((entry) => entry.status))) {
    const state = stateFor(team, status);
    if (!state) throw fail('E_LINEAR_STATE', `チーム ${target.team} に Status「${status}」に当たる状態がありません`);
    states.set(status, state);
  }

  let project = (await client.request('MasumeProjects', { name: target.project })).projects?.nodes?.[0];
  if (!project) {
    const created = (await client.request('MasumeProjectCreate', { input: { name: target.project, teamIds: [team.id] } })).projectCreate;
    ensureSuccess(created, `プロジェクト「${target.project}」の作成`);
    project = created.project;
  }

  const state = { team: target.team, project: { id: project.id, name: project.name }, issues: { ...saved.issues } };
  writeLinearState(root, state);

  let created = 0;
  let updated = 0;
  for (const entry of plan) {
    const stateId = states.get(entry.status).id;
    const known = state.issues[entry.id];
    if (known?.id) {
      const result = (await client.request('MasumeIssueUpdate', {
        id: known.id, input: { title: entry.title, description: entry.description, stateId },
      })).issueUpdate;
      ensureSuccess(result, `${entry.id} の更新`);
      updated++;
      log(`更新 ${entry.id} → ${known.identifier ?? result.issue?.identifier ?? known.id}`);
    } else {
      const result = (await client.request('MasumeIssueCreate', {
        input: { teamId: team.id, projectId: project.id, title: entry.title, description: entry.description, stateId },
      })).issueCreate;
      ensureSuccess(result, `${entry.id} の作成`);
      state.issues[entry.id] = { id: result.issue.id, identifier: result.issue.identifier };
      writeLinearState(root, state); // 途中で止まっても、作った issue を二重に作らない
      created++;
      log(`作成 ${entry.id} → ${result.issue.identifier}${result.issue.url ? ` ${result.issue.url}` : ''}`);
    }
  }
  return { team: target.team, project: state.project, created, updated, issues: state.issues };
}

// ---- pull ----

export async function pullRecords(client, { team, project }) {
  const nodes = [];
  let after;
  for (;;) {
    const variables = { key: team, project: project ?? null };
    if (after) variables.after = after;
    const page = (await client.request('MasumeIssues', variables, issuesDocument(project != null))).issues;
    nodes.push(...(page?.nodes ?? []));
    const next = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : undefined;
    if (!next || next === after) break;
    after = next;
  }
  return nodes.map((issue) => ({
    id: issue.identifier ?? '',
    title: issue.title ?? '',
    detail: issue.description ?? '',
    status: issue.state?.name ?? '',
    assignee: issue.assignee?.name ?? '',
    labels: (issue.labels?.nodes ?? []).map((label) => String(label.name).trim()).filter(Boolean),
    estimate: issue.estimate == null ? '' : String(issue.estimate),
    created: issue.createdAt ?? '',
    project: issue.project?.name ?? '',
  }));
}

export async function pullMap(client, { team, project }) {
  const records = await pullRecords(client, { team, project });
  if (records.length === 0) {
    throw fail('E_LINEAR_EMPTY', `チーム ${team}${project ? `・プロジェクト「${project}」` : ''} に issue が1件もありません`, 1);
  }
  return { map: mapFromRecords(records), count: records.length };
}
