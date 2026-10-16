import { MasumeError } from '../engine/index.js';
import { endpointUrl, publicPayload, waitForRetry } from './http.js';

export const DEFAULT_URL = 'https://api.linear.app/graphql';
const TIMEOUT_MS = 30000;
const MAX_RETRIES = 3;

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
  const rawKey = env.LINEAR_API_KEY ?? '';
  if (!/^[\x20-\x7E]*$/u.test(rawKey)) {
    throw failure('E_LINEAR_AUTH', 'LINEAR_API_KEY は印字可能な ASCII で指定してください', 2);
  }
  const key = rawKey.trim();
  if (!key) throw failure('E_LINEAR_AUTH', 'LINEAR_API_KEY が設定されていません。Linear の API キーを環境変数に入れてください', 2);
  const url = endpointUrl(env.MASUME_LINEAR_URL || DEFAULT_URL);
  const assertPublic = (value) => publicPayload(value, [rawKey, key], 'LINEAR');

  async function request(operationName, variables = {}, query = DOCUMENTS[operationName]) {
    for (let attempt = 0; ; attempt++) {
      let response;
      let text;
      try {
        response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: key },
          body: JSON.stringify({ query, variables, operationName }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        text = await response.text();
      } catch {
        // fetch の例外にはヘッダーや URL が含まれ得るので転記しない。
        throw failure('E_LINEAR_NETWORK', 'Linear との通信が完了しませんでした', 1);
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await waitForRetry(response.headers.get('retry-after'));
        continue;
      }
      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = undefined;
      }
      const errors = Array.isArray(payload?.errors) ? payload.errors : [];
      // 本文は分類だけに使い、秘密が反射され得るメッセージを出力しない。
      const notFound = errors.some((entry) => /not found|could not find/iu.test(
        `${entry?.message ?? ''} ${entry?.extensions?.userPresentableMessage ?? ''}`,
      ));
      let error;
      if (response.status === 401) {
        error = failure('E_LINEAR_AUTH', 'Linear に認証されませんでした。LINEAR_API_KEY を確かめてください', 2);
      } else if (response.status === 403) {
        error = failure('E_LINEAR_API', 'Linear の操作に必要な権限がありません', 1);
        error.skipReason = '権限がありません';
      } else if (!response.ok || errors.length > 0) {
        error = failure('E_LINEAR_API', `Linear がエラーを返しました（HTTP ${response.status}）`, 1);
        if (notFound || response.status === 404) error.skipReason = 'issue が見つかりません';
      } else if (!payload || typeof payload.data !== 'object' || payload.data === null) {
        error = failure('E_LINEAR_API', 'Linear の返事を読めません', 1);
      }
      if (error) {
        error.status = response.status;
        throw error;
      }
      return assertPublic(payload.data);
    }
  }

  return { url, request, assertPublic };
}
