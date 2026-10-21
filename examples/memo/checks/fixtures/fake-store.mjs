// API の判定で使う、メモリ上だけのにせストア（CONTRACTS §2 を満たす）。GM の縄張り。
// わざと: create が入力の id をそのまま採用する（API が余計な項目を素通しすると見つかる）。
//         title が "__boom__" なら想定外のエラーを投げる（API が 500 を返して生き残るか見る）。
import { randomUUID } from 'node:crypto';

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

function validate(title, body) {
  if (typeof title !== 'string' || typeof body !== 'string') throw fail('E_INVALID', 'title/body must be string');
  if (title === '__boom__') throw new Error('boom');
  if (title.length > 100 || body.length > 10000) throw fail('E_TOO_LONG');
  if (title.trim() === '' && body.trim() === '') throw fail('E_EMPTY');
}

export async function createStore() {
  const memos = [];
  return {
    async create(input) {
      if (!input || typeof input !== 'object') throw fail('E_INVALID');
      const title = input.title === undefined ? '' : input.title;
      const body = input.body === undefined ? '' : input.body;
      validate(title, body);
      const now = new Date().toISOString();
      const memo = { id: input.id ?? randomUUID(), title, body, createdAt: now, updatedAt: now };
      memos.unshift(memo);
      return { ...memo };
    },
    async list({ q } = {}) {
      const s = typeof q === 'string' ? q.trim().toLowerCase() : '';
      return memos
        .filter((m) => !s || m.title.toLowerCase().includes(s) || m.body.toLowerCase().includes(s))
        .map((m) => ({ ...m }));
    },
    async get(id) {
      const m = memos.find((x) => x.id === id);
      return m ? { ...m } : null;
    },
    async update(id, patch) {
      const m = memos.find((x) => x.id === id);
      if (!m) throw fail('E_NOT_FOUND');
      const title = patch && patch.title !== undefined ? patch.title : m.title;
      const body = patch && patch.body !== undefined ? patch.body : m.body;
      validate(title, body);
      m.title = title;
      m.body = body;
      m.updatedAt = new Date().toISOString();
      return { ...m };
    },
    async remove(id) {
      const i = memos.findIndex((x) => x.id === id);
      if (i < 0) throw fail('E_NOT_FOUND');
      memos.splice(i, 1);
    },
  };
}
