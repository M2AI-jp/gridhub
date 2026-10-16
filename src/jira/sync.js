import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasumeError } from '../engine/index.js';
import { exportIssues } from '../linear/export.js';
import { mapFromRecords } from '../linear/import.js';

// §9 の Status → Jira の statusCategory（new / indeterminate / done）
const CATEGORY = {
  Backlog: 'new', Todo: 'new', 'In Progress': 'indeterminate', 'In Review': 'indeterminate', Done: 'done',
};
// 同じ statusCategory に遷移が複数あるとき、名前が合うものを優先する
const PREFERRED_NAME = {
  Backlog: ['Backlog', 'To Do'], Todo: ['To Do', 'Todo'], 'In Progress': ['In Progress'], 'In Review': ['In Review'], Done: ['Done'],
};
const SEARCH_FIELDS = ['summary', 'description', 'status', 'assignee', 'labels', 'created'];
const PAGE_SIZE = 100;

function fail(code, message, exitCode = 2) {
  return new MasumeError(code, message, exitCode);
}

// ---- .masume/jira.json（マスID ↔ Jira の issue の対応表） ----

export function jiraFile(root) {
  return join(root, '.masume', 'jira.json');
}

export function readJiraState(root) {
  let text;
  try {
    text = readFileSync(jiraFile(root), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { issues: {} };
    throw error;
  }
  let saved;
  try {
    saved = JSON.parse(text);
  } catch {
    throw fail('E_JIRA_CONFIG', '.masume/jira.json を読めません（JSON が壊れています）');
  }
  if (typeof saved !== 'object' || saved === null || Array.isArray(saved)) {
    throw fail('E_JIRA_CONFIG', '.masume/jira.json の形が不正です');
  }
  const issues = typeof saved.issues === 'object' && saved.issues !== null && !Array.isArray(saved.issues) ? saved.issues : {};
  return { ...saved, issues };
}

function writeJiraState(root, state) {
  mkdirSync(join(root, '.masume'), { recursive: true });
  const file = jiraFile(root);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  renameSync(temp, file);
}

// ---- push ----

/** 送り先のプロジェクトキーを --project と対応表から決め、食い違いを止める。 */
export function resolveProject(saved, options, { required }) {
  const project = options.project ?? saved.project;
  if (!project && required) throw fail('E_USAGE', '--project で Jira のプロジェクトキー（例: TOY）を指定してください');
  if (saved.project && project !== saved.project) {
    throw fail('E_USAGE', `.masume/jira.json はプロジェクト ${saved.project} 用です（--project ${project}）。別のプロジェクトへ送るなら、先にこのファイルを退けてください`);
  }
  return project;
}

const adf = (text) => ({
  type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** 送る予定: マスごとに、作成か更新か、Jira の summary / description / labels / Status。 */
export function planPush(view, saved) {
  const issues = new Map(exportIssues(view).map((issue) => [issue.ID, issue]));
  return [...issues.values()].map((issue) => {
    const node = view.nodes[issue.ID];
    return {
      id: issue.ID,
      action: saved.issues[issue.ID]?.key ? 'update' : 'create',
      summary: `[${issue.ID}] ${issue.Title}`,
      description: issue.Description,
      labels: ['masume', node.type === 'gate' ? 'gate' : node.owner, ...(node.state === 'stale' ? ['masume-stale'] : [])],
      status: issue.Status,
    };
  });
}

/** 目的の statusCategory へ向かう遷移を選ぶ。名前が合うものを優先し、無ければ最初の候補。 */
export function pickTransition(transitions, status) {
  const category = CATEGORY[status];
  const candidates = (transitions ?? []).filter((entry) => entry?.to?.statusCategory?.key === category);
  const names = PREFERRED_NAME[status] ?? [];
  return candidates.find((entry) => names.includes(entry.name) || names.includes(entry.to?.name)) ?? candidates[0];
}

const issuePath = (key) => `/rest/api/3/issue/${encodeURIComponent(key)}`;

/** 今の statusCategory が目的と違えば遷移する。遷移したら true、そろっていれば false。 */
async function alignStatus(client, key, status) {
  const current = await client.request('GET', `${issuePath(key)}?fields=status`);
  const now = current?.fields?.status?.statusCategory?.key;
  if (now === CATEGORY[status]) return false;
  const available = await client.request('GET', `${issuePath(key)}/transitions`);
  const transition = pickTransition(available?.transitions, status);
  if (!transition) {
    throw fail('E_JIRA_TRANSITION', `${key} を Status「${status}」（${CATEGORY[status]}）にする遷移が見つかりません（今は ${current?.fields?.status?.name ?? '不明'}）`, 1);
  }
  await client.request('POST', `${issuePath(key)}/transitions`, { transition: { id: transition.id } });
  return true;
}

export async function pushIssues({ root, client, saved, plan, project, log = () => {} }) {
  let found;
  try {
    found = await client.request('GET', `/rest/api/3/project/${encodeURIComponent(project)}`);
  } catch (error) {
    if (error?.status === 404) throw fail('E_JIRA', `プロジェクト ${project} が Jira に見つかりません`);
    throw error;
  }

  const state = { project, issues: { ...saved.issues } };
  writeJiraState(root, state);

  let created = 0;
  let updated = 0;
  let transitioned = 0;
  const stuck = [];
  for (const entry of plan) {
    const known = state.issues[entry.id];
    let key;
    if (known?.key) {
      key = known.key;
      try {
        await client.request('PUT', issuePath(key), {
          fields: { summary: entry.summary, description: adf(entry.description), labels: entry.labels },
        });
      } catch (error) {
        if (error?.status === 404) {
          throw fail('E_JIRA', `${entry.id} の issue ${key} が Jira に見つかりません。作り直すなら .masume/jira.json の issues から ${entry.id} を消してください`);
        }
        throw error;
      }
      updated++;
      log(`更新 ${entry.id} → ${key}`);
    } else {
      const result = await client.request('POST', '/rest/api/3/issue', {
        fields: {
          project: { key: project }, summary: entry.summary, description: adf(entry.description),
          issuetype: { name: 'Task' }, labels: entry.labels,
        },
      });
      if (!result?.key) throw fail('E_JIRA_API', `Jira が ${entry.id} の issue を作った返事に key がありません`, 1);
      key = result.key;
      state.issues[entry.id] = { key: result.key, id: result.id };
      writeJiraState(root, state); // 途中で止まっても、作った issue を二重に作らない
      created++;
      log(`作成 ${entry.id} → ${key}`);
    }
    try {
      if (await alignStatus(client, key, entry.status)) {
        transitioned++;
        log(`遷移 ${entry.id} → ${entry.status}`);
      }
    } catch (error) {
      if (error?.code !== 'E_JIRA_TRANSITION') throw error;
      stuck.push({ id: entry.id, key, status: entry.status, message: `${entry.id}: ${error.message}` });
    }
  }
  return { project, projectName: found?.name ?? project, created, updated, transitioned, stuck, issues: state.issues };
}

// ---- pull ----

/** Atlassian Document Format から text を連結する（段落などの区切りは改行）。 */
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToText).join('');
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  if (node.type === 'mention' || node.type === 'emoji' || node.type === 'inlineCard') return node.attrs?.text ?? node.attrs?.shortName ?? node.attrs?.url ?? '';
  const children = Array.isArray(node.content) ? node.content : [];
  if (node.type === 'doc' || node.type === 'bulletList' || node.type === 'orderedList') {
    return children.map(adfToText).join('\n').replace(/\n+$/u, '');
  }
  return children.map(adfToText).join('');
}

/** Jira の created（`+0900` のようにコロン無し）を Date.parse が確実に読める形にする。 */
function isoCreated(value) {
  return typeof value === 'string' ? value.replace(/([+-]\d{2})(\d{2})$/u, '$1:$2') : '';
}

export async function pullRecords(client, project) {
  const found = await client.request('GET', `/rest/api/3/project/${encodeURIComponent(project)}`).catch((error) => {
    if (error?.status === 404) throw fail('E_JIRA', `プロジェクト ${project} が Jira に見つかりません`);
    throw error;
  });
  const issues = [];
  let token;
  for (;;) {
    const body = { jql: `project = ${project} ORDER BY created ASC`, fields: SEARCH_FIELDS, maxResults: PAGE_SIZE };
    if (token) body.nextPageToken = token;
    const page = await client.request('POST', '/rest/api/3/search/jql', body);
    issues.push(...(page?.issues ?? []));
    const next = page?.isLast === false || (page?.isLast === undefined && page?.nextPageToken) ? page.nextPageToken : undefined;
    if (!next || next === token) break;
    token = next;
  }
  return {
    projectName: found?.name ?? project,
    records: issues.map((issue) => {
      const fields = issue.fields ?? {};
      return {
        id: issue.key ?? '',
        title: fields.summary ?? '',
        detail: adfToText(fields.description),
        // statusCategory が done なら完了扱い（§9 の import が省く Done に揃える）
        status: fields.status?.statusCategory?.key === 'done' ? 'Done' : (fields.status?.name ?? ''),
        assignee: fields.assignee?.displayName ?? '',
        labels: (fields.labels ?? []).map((label) => String(label).trim()).filter(Boolean),
        estimate: '',
        created: isoCreated(fields.created),
        project: found?.name ?? project,
      };
    }),
  };
}

export async function pullMap(client, { project }) {
  const { records } = await pullRecords(client, project);
  if (records.length === 0) throw fail('E_JIRA_EMPTY', `プロジェクト ${project} に issue が1件もありません`, 1);
  return { map: mapFromRecords(records), count: records.length };
}
