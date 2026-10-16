import { MasumeError } from '../engine/index.js';

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2;
const MAX_WAIT_MS = 10000;

function failure(code, message, exitCode) {
  return new MasumeError(code, message, exitCode);
}

/** Jira のエラー本文（errorMessages / errors）を1行にする。 */
function messagesOf(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const lines = [];
  if (Array.isArray(payload.errorMessages)) lines.push(...payload.errorMessages);
  if (payload.errors && typeof payload.errors === 'object') lines.push(...Object.values(payload.errors));
  return lines.filter((line) => typeof line === 'string' && line).join(' / ');
}

/**
 * Jira Cloud REST v3 の窓口。ベース URL は MASUME_JIRA_URL > JIRA_BASE_URL、
 * 認証は Basic（JIRA_EMAIL:JIRA_API_TOKEN）。トークンは値だけを持ち、メッセージやログには出さない。
 */
export function createClient({ env, fetchImpl = globalThis.fetch }) {
  const baseUrl = (env.MASUME_JIRA_URL || env.JIRA_BASE_URL || '').trim().replace(/\/+$/u, '');
  const email = (env.JIRA_EMAIL ?? '').trim();
  const token = (env.JIRA_API_TOKEN ?? '').trim();
  const missing = [
    [baseUrl, 'MASUME_JIRA_URL（または JIRA_BASE_URL）'],
    [email, 'JIRA_EMAIL'],
    [token, 'JIRA_API_TOKEN'],
  ].filter(([value]) => !value).map(([, name]) => name);
  if (missing.length > 0) {
    throw failure('E_JIRA_AUTH', `${missing.join('・')} が設定されていません。Jira の URL・メールアドレス・API トークンを環境変数に入れてください`, 2);
  }
  const authorization = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;

  /** 成功なら返事の JSON（204 などで本文が無ければ null）。失敗は MasumeError（`status` に HTTP ステータス）。 */
  async function request(method, path, body) {
    const label = `${method} ${path.split('?')[0]}`;
    for (let attempt = 0; ; attempt++) {
      let response;
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
      } catch (error) {
        throw failure('E_JIRA_NETWORK', `Jira に届きません（${label}）: ${error?.cause?.code ?? error?.message ?? error}`, 1);
      }
      if (response.status === 429 && attempt < MAX_RETRIES) {
        const wait = Number(response.headers.get('retry-after'));
        await new Promise((resolve) => setTimeout(resolve, Math.min(MAX_WAIT_MS, Number.isFinite(wait) && wait > 0 ? wait * 1000 : 1000)));
        continue;
      }
      const text = await response.text();
      let payload;
      try {
        payload = text ? JSON.parse(text) : null;
      } catch {
        payload = undefined;
      }
      const messages = messagesOf(payload);
      let error;
      if (response.status === 401 || response.status === 403) {
        error = failure('E_JIRA_AUTH', `Jira に認証されませんでした（${label}, HTTP ${response.status}）${messages ? `: ${messages}` : ''}。JIRA_EMAIL と JIRA_API_TOKEN を確かめてください`, 2);
      } else if (!response.ok) {
        error = failure('E_JIRA_API', `Jira がエラーを返しました（${label}, HTTP ${response.status}）${messages ? `: ${messages}` : ''}`, 1);
      } else if (payload === undefined) {
        error = failure('E_JIRA_API', `Jira の返事を読めません（${label}）`, 1);
      }
      if (error) {
        error.status = response.status;
        throw error;
      }
      return payload;
    }
  }

  return { baseUrl, request };
}
