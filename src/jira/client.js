import { MasumeError } from '../engine/index.js';
import { endpointUrl, publicPayload, waitForRetry } from '../linear/http.js';

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;

function failure(code, message, exitCode) {
  return new MasumeError(code, message, exitCode);
}

/**
 * Jira Cloud REST v3 の窓口。ベース URL は MASUME_JIRA_URL > JIRA_BASE_URL、
 * 認証は Basic（JIRA_EMAIL:JIRA_API_TOKEN）。トークンは値だけを持ち、メッセージやログには出さない。
 */
export function createClient({ env, fetchImpl = globalThis.fetch }) {
  const rawUrl = (env.MASUME_JIRA_URL || env.JIRA_BASE_URL || '').trim();
  const email = (env.JIRA_EMAIL ?? '').trim();
  const rawToken = env.JIRA_API_TOKEN ?? '';
  if (!/^[\x20-\x7E]*$/u.test(rawToken)) {
    throw failure('E_JIRA_AUTH', 'JIRA_API_TOKEN は印字可能な ASCII で指定してください', 2);
  }
  const token = rawToken.trim();
  const missing = [
    [rawUrl, 'MASUME_JIRA_URL（または JIRA_BASE_URL）'],
    [email, 'JIRA_EMAIL'],
    [token, 'JIRA_API_TOKEN'],
  ].filter(([value]) => !value).map(([, name]) => name);
  if (missing.length > 0) {
    throw failure('E_JIRA_AUTH', `${missing.join('・')} が設定されていません。Jira の URL・メールアドレス・API トークンを環境変数に入れてください`, 2);
  }
  const baseUrl = endpointUrl(rawUrl).replace(/\/+$/u, '');
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const assertPublic = (value) => publicPayload(value, [rawToken, token, authorization.slice(6)], 'JIRA');

  /** 成功なら返事の JSON（204 などで本文が無ければ null）。失敗は MasumeError（`status` に HTTP ステータス）。 */
  async function request(method, path, body) {
    for (let attempt = 0; ; attempt++) {
      let response;
      let text;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            accept: 'application/json',
            authorization,
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        text = await response.text();
      } catch {
        throw failure('E_JIRA_NETWORK', 'Jira との通信が完了しませんでした', 1);
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        await waitForRetry(response.headers.get('retry-after'));
        continue;
      }
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = undefined;
      }
      let error;
      if (response.status === 401) {
        error = failure('E_JIRA_AUTH', 'Jira に認証されませんでした。JIRA_EMAIL と JIRA_API_TOKEN を確かめてください', 2);
      } else if (response.status === 403) {
        error = failure('E_JIRA_API', 'Jira の操作に必要な権限がありません', 1);
      } else if (!response.ok) {
        error = failure('E_JIRA_API', `Jira がエラーを返しました（HTTP ${response.status}）`, 1);
      } else if (payload === undefined) {
        error = failure('E_JIRA_API', 'Jira の返事を読めません', 1);
      }
      if (error) {
        error.status = response.status;
        throw error;
      }
      return assertPublic(payload);
    }
  }

  return { baseUrl, request, assertPublic };
}
