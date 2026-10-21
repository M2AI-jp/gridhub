import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';

function notFound(id) {
  const e = new Error(`memo not found: ${id}`);
  e.code = 'E_NOT_FOUND';
  return e;
}

function fail(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

const len = (s) => [...s].length;

function validate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw fail('E_INVALID', 'input must be an object');
  }
  for (const k of ['title', 'body']) {
    if (input[k] !== undefined && typeof input[k] !== 'string') {
      throw fail('E_INVALID', `${k} must be a string`);
    }
  }
}

function checkMemo(title, body) {
  if (len(title) > 100) throw fail('E_TOO_LONG', 'title is too long');
  if (len(body) > 10000) throw fail('E_TOO_LONG', 'body is too long');
  if (title.trim() === '' && body.trim() === '') throw fail('E_EMPTY', 'memo is empty');
}

export async function createStore(dir) {
  await mkdir(dir, { recursive: true });
  const file = join(dir, 'memos.json');

  let data = { nextId: 1, memos: [] };
  try {
    data = JSON.parse(await readFile(file, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }

  let queue = Promise.resolve();
  const serial = (fn) => {
    const run = queue.then(fn);
    queue = run.catch(() => {});
    return run;
  };

  async function save() {
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(data));
    await rename(tmp, file);
  }

  return {
    create(input) {
      return serial(async () => {
        validate(input);
        checkMemo(input.title ?? '', input.body ?? '');
        const now = new Date().toISOString();
        const memo = {
          id: String(data.nextId),
          title: input.title ?? '',
          body: input.body ?? '',
          createdAt: now,
          updatedAt: now,
        };
        const prev = data;
        data = { nextId: prev.nextId + 1, memos: [...prev.memos, memo] };
        try {
          await save();
        } catch (e) {
          data = prev;
          throw e;
        }
        return { ...memo };
      });
    },

    list({ q } = {}) {
      return serial(async () => {
        const needle = typeof q === 'string' ? q.trim().toLowerCase() : '';
        return data.memos
          .filter((m) => !needle || m.title.toLowerCase().includes(needle) || m.body.toLowerCase().includes(needle))
          .map((m) => ({ ...m }))
          .reverse();
      });
    },

    get(id) {
      return serial(async () => {
        const memo = data.memos.find((m) => m.id === String(id));
        return memo ? { ...memo } : null;
      });
    },

    update(id, input) {
      return serial(async () => {
        const i = data.memos.findIndex((m) => m.id === String(id));
        if (i < 0) throw notFound(id);
        validate(input);
        const memo = { ...data.memos[i] };
        if (input.title !== undefined) memo.title = input.title;
        if (input.body !== undefined) memo.body = input.body;
        checkMemo(memo.title, memo.body);
        memo.updatedAt = new Date().toISOString();
        const prev = data;
        const memos = prev.memos.slice();
        memos[i] = memo;
        data = { ...prev, memos };
        try {
          await save();
        } catch (e) {
          data = prev;
          throw e;
        }
        return { ...memo };
      });
    },

    remove(id) {
      return serial(async () => {
        const i = data.memos.findIndex((m) => m.id === String(id));
        if (i < 0) throw notFound(id);
        const prev = data;
        data = { ...prev, memos: prev.memos.filter((_, j) => j !== i) };
        try {
          await save();
        } catch (e) {
          data = prev;
          throw e;
        }
      });
    },
  };
}
