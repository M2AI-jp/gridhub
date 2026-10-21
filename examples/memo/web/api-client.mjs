// API クライアント（CONTRACTS.md §4）。ブラウザでも Node でも動く。
export function createClient(baseUrl = '', fetchImpl) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));

  async function request(method, path, payload) {
    const init = { method };
    if (payload !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(payload);
    }
    const res = await doFetch(base + path, init);
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = undefined;
    }
    if (!(res.status >= 200 && res.status < 300)) {
      const err = new Error((data && data.message) || `HTTP ${res.status}`);
      err.status = res.status;
      err.code = data && data.error;
      throw err;
    }
    return data;
  }

  return {
    async list(q) {
      const data = await request('GET', q ? `/api/memos?q=${encodeURIComponent(q)}` : '/api/memos');
      return data.memos;
    },
    create: (input) => request('POST', '/api/memos', input),
    update: (id, patch) => request('PUT', `/api/memos/${encodeURIComponent(id)}`, patch),
    async remove(id) {
      await request('DELETE', `/api/memos/${encodeURIComponent(id)}`);
    },
  };
}
