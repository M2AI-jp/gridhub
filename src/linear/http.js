import { setTimeout as delay } from 'node:timers/promises';
import { MasumeError } from '../engine/index.js';

/** URL 自体はエラーに含めない。userinfo は通信より前に断る。 */
export function endpointUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MasumeError('E_USAGE', '同期先の URL が不正です', 2);
  }
  if (url.username || url.password || /^https?:\/\/[^/?#]*@/iu.test(value)) {
    throw new MasumeError('E_USAGE', '同期先の URL にユーザー情報は指定できません', 2);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new MasumeError('E_USAGE', '同期先の URL は HTTP または HTTPS にしてください', 2);
  }
  return url.href;
}

/** Retry-After の秒数と HTTP-date に従う。省略・不正な値は1秒待つ。 */
export async function waitForRetry(value) {
  const text = value?.trim() ?? '';
  let ms = 1000;
  if (/^\d+(?:\.\d+)?$/u.test(text)) ms = Number(text) * 1000;
  else if (text && Number.isFinite(Date.parse(text))) ms = Math.max(0, Date.parse(text) - Date.now());
  if (!Number.isFinite(ms)) ms = 1000;
  // setTimeout の上限を超えても即座に再送しない。
  while (ms > 0) {
    const chunk = Math.min(ms, 2 ** 31 - 1);
    await delay(chunk);
    ms -= chunk;
  }
}

/** 成功本文に秘密が反射されても、呼出元が表示・保存する前に止める。 */
export function publicPayload(payload, secrets, service) {
  const needles = [...new Set(secrets.filter(Boolean).flatMap((secret) => [secret, encodeURIComponent(secret)]))];
  const containsSecret = (value) => {
    if (typeof value === 'string') {
      return needles.some((secret) => value.includes(secret))
        || /https?:\/\/[^/\s?#]*@/iu.test(value);
    }
    if (value && typeof value === 'object') {
      return Object.entries(value).some(([key, entry]) => containsSecret(key) || containsSecret(entry));
    }
    return false;
  };
  if (containsSecret(payload)) {
    throw new MasumeError(`E_${service}_API`, '同期先の返事に秘密情報が含まれるため、表示・保存を中止しました', 1);
  }
  return payload;
}
