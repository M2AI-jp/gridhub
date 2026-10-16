import { MasumeError } from '../engine/index.js';

export const DEFAULT_URL = 'https://api.linear.app/graphql';
const TIMEOUT_MS = 30000;

// operationName は CONTRACTS §16 の表のとおり。文書は本物の Linear API の形に合わせている。
export const DOCUMENTS = {
  MasumeTeams: `query MasumeTeams($key: String!) {
  teams(filter: { key: { eq: $key } }) {
    nodes { id key name states { nodes { id name type } } }
  }
}`,
  MasumeProjects: `query MasumeProjects($name: String!) {
  projects(filter: { name: { eq: $name } }) {
    nodes { id name }
  }
}`,
  MasumeProjectCreate: `mutation MasumeProjectCreate($input: ProjectCreateInput!) {
  projectCreate(input: $input) {
    success
    project { id name }
  }
}`,
  MasumeIssueCreate: `mutation MasumeIssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue { id identifier url }
  }
}`,
  MasumeIssueUpdate: `mutation MasumeIssueUpdate($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue { id identifier }
  }
}`,
};

const ISSUE_FIELDS = `identifier title description estimate createdAt
      state { name type }
      assignee { name }
      labels { nodes { name } }
      project { name }`;

/** project が指定されていれば、その名前の issue だけに絞る。 */
export function issuesDocument(withProject) {
  const filter = withProject
    ? '{ team: { key: { eq: $key } }, project: { name: { eq: $project } } }'
    : '{ team: { key: { eq: $key } } }';
  const variables = withProject ? '$key: String!, $project: String, $after: String' : '$key: String!, $after: String';
  return `query MasumeIssues(${variables}) {
  issues(filter: ${filter}, first: 100, after: $after) {
    nodes {
      ${ISSUE_FIELDS}
    }
    pageInfo { hasNextPage endCursor }
  }
}`;
}

function failure(code, message, exitCode) {
  return new MasumeError(code, message, exitCode);
}

/** キーは値だけを持ち、メッセージやログには出さない。 */
export function createClient({ env, fetchImpl = globalThis.fetch }) {
  const key = (env.LINEAR_API_KEY ?? '').trim();
  if (!key) throw failure('E_LINEAR_AUTH', 'LINEAR_API_KEY が設定されていません。Linear の API キーを環境変数に入れてください', 2);
  const url = env.MASUME_LINEAR_URL || DEFAULT_URL;

  async function request(operationName, variables = {}, query = DOCUMENTS[operationName]) {
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: key },
        body: JSON.stringify({ query, variables, operationName }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      throw failure('E_LINEAR_NETWORK', `Linear に届きません（${operationName}）: ${error?.cause?.code ?? error?.message ?? error}`, 1);
    }
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
    const messages = Array.isArray(payload?.errors)
      ? payload.errors.map((entry) => entry?.message).filter(Boolean).join(' / ') : '';
    if (response.status === 401 || response.status === 403) {
      throw failure('E_LINEAR_AUTH', `Linear に認証されませんでした${messages ? `: ${messages}` : ''}。LINEAR_API_KEY を確かめてください`, 2);
    }
    if (!response.ok) {
      throw failure('E_LINEAR_API', `Linear がエラーを返しました（${operationName}, HTTP ${response.status}）${messages ? `: ${messages}` : ''}`, 1);
    }
    if (messages) throw failure('E_LINEAR_API', `Linear がエラーを返しました（${operationName}）: ${messages}`, 1);
    if (!payload || typeof payload.data !== 'object' || payload.data === null) {
      throw failure('E_LINEAR_API', `Linear の返事を読めません（${operationName}）`, 1);
    }
    return payload.data;
  }

  return { url, request };
}
