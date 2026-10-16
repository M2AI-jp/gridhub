// 第3章の判定の共通道具（MCP のクライアント・偽の Jira）。GM の縄張り・封印対象。
import { spawn } from 'node:child_process';
import { BIN, listen } from './helpers.mjs';

export * from './helpers2.mjs';

/** masume mcp を起動して、JSON-RPC で話すクライアント */
export function mcpClient(args = [], { cwd, env = {} } = {}) {
  const p = spawn(process.execPath, [BIN, 'mcp', ...args], { cwd, env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderr = '';
  let nextId = 1;
  const waiting = new Map();
  const stray = [];
  p.stdout.setEncoding('utf8');
  p.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        stray.push(line);
        continue;
      }
      if (msg.id !== undefined && waiting.has(msg.id)) {
        waiting.get(msg.id)(msg);
        waiting.delete(msg.id);
      } else stray.push(msg);
    }
  });
  p.stderr.on('data', (d) => (stderr += d));
  const client = {
    proc: p,
    stray,
    stderr: () => stderr,
    request(method, params = {}, { timeout = 60000 } = {}) {
      const id = nextId++;
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`MCP ${method} が ${timeout}ms 以内に返らない\n${stderr}`)), timeout);
        waiting.set(id, (msg) => (clearTimeout(t), res(msg)));
        p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    },
    notify(method, params = {}) {
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
    },
    raw(line) {
      p.stdin.write(line + '\n');
    },
    async call(name, args = {}, opts) {
      const r = await client.request('tools/call', { name, arguments: args }, opts);
      if (r.error) throw new Error(`tools/call ${name}: ${JSON.stringify(r.error)}`);
      return { isError: r.result.isError === true, text: (r.result.content || []).map((c) => c.text).join('\n') };
    },
    async start() {
      const init = await client.request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'masume-test', version: '0' } });
      client.notify('notifications/initialized');
      return init;
    },
    close() {
      return new Promise((res) => {
        if (p.exitCode !== null) return res();
        p.once('exit', () => res());
        p.stdin.end();
        setTimeout(() => p.kill('SIGTERM'), 1000);
      });
    },
  };
  return client;
}

// ---- 偽の Jira（REST v3） ----
export const JIRA_ENV = (url) => ({ MASUME_JIRA_URL: url, JIRA_EMAIL: 'gm@example.com', JIRA_API_TOKEN: 'jira_test_token' });
const AUTH = 'Basic ' + Buffer.from('gm@example.com:jira_test_token').toString('base64');

export async function fakeJira({ seedIssues = [] } = {}) {
  const http = await import('node:http');
  const STATUSES = {
    todo: { name: 'To Do', statusCategory: { key: 'new' } },
    progress: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
    review: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
    done: { name: 'Done', statusCategory: { key: 'done' } },
  };
  const TRANSITIONS = [
    { id: '11', name: 'To Do', to: STATUSES.todo },
    { id: '21', name: 'In Progress', to: STATUSES.progress },
    { id: '31', name: 'In Review', to: STATUSES.review },
    { id: '41', name: 'Done', to: STATUSES.done },
  ];
  const db = { requests: [], projects: [{ id: '10000', key: 'TOY', name: 'おもちゃ' }, { id: '10001', key: 'NOTE', name: 'ノート' }], issues: [], seed: seedIssues };
  let n = 0;
  const send = (res, status, body) => {
    res.statusCode = status;
    if (body === undefined) return res.end();
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      const u = new URL(req.url, 'http://x');
      let body;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {}
      db.requests.push({ method: req.method, path: u.pathname, query: u.search, headers: req.headers, body });
      if (req.headers.authorization !== AUTH) return send(res, 401, { errorMessages: ['Unauthorized'] });
      let m;
      if (req.method === 'GET' && (m = u.pathname.match(/^\/rest\/api\/3\/project\/([^/]+)$/))) {
        const p = db.projects.find((x) => x.key === m[1]);
        return p ? send(res, 200, p) : send(res, 404, { errorMessages: ['No project'] });
      }
      if (req.method === 'POST' && u.pathname === '/rest/api/3/issue') {
        n++;
        const issue = { id: String(20000 + n), key: `${body.fields.project.key}-${n}`, fields: { ...body.fields, status: STATUSES.todo } };
        db.issues.push(issue);
        return send(res, 201, { id: issue.id, key: issue.key, self: `http://x/rest/api/3/issue/${issue.id}` });
      }
      if ((m = u.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)(\/transitions)?$/))) {
        const issue = db.issues.find((x) => x.key === m[1] || x.id === m[1]);
        if (!issue) return send(res, 404, { errorMessages: ['No issue'] });
        if (m[2] && req.method === 'GET') return send(res, 200, { transitions: TRANSITIONS });
        if (m[2] && req.method === 'POST') {
          const t = TRANSITIONS.find((x) => x.id === body?.transition?.id);
          if (!t) return send(res, 400, { errorMessages: ['bad transition'] });
          issue.fields.status = t.to;
          return send(res, 204);
        }
        if (req.method === 'GET') return send(res, 200, { id: issue.id, key: issue.key, fields: { status: issue.fields.status } });
        if (req.method === 'PUT') {
          Object.assign(issue.fields, body.fields);
          return send(res, 204);
        }
      }
      if (req.method === 'POST' && u.pathname === '/rest/api/3/search/jql') {
        const key = (body?.jql || '').match(/project\s*=\s*"?([A-Z0-9]+)"?/)?.[1];
        return send(res, 200, { issues: db.seed.filter((i) => i.key.startsWith(key + '-')) });
      }
      send(res, 404, { errorMessages: [`no route ${req.method} ${u.pathname}`] });
    });
  });
  const url = await listen(server);
  return { url, db, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))) };
}

const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

/** Linear の見本と同じ中身の Jira の issue（pull 用） */
export const NOTE_JIRA = [
  ['NOTE-1', 'ログイン画面を作る', 'メールとパスワードでログインできる', 'To Do', 'new', 'Aki', ['frontend'], '2026-09-01T10:00:00.000+0900'],
  ['NOTE-2', 'ユーザーAPIを作る', 'POST /users でユーザーを作れる, 重複はエラー', 'In Progress', 'indeterminate', 'Ben', ['backend'], '2026-09-01T11:00:00.000+0900'],
  ['NOTE-3', 'ノートを保存する', 'ノートを保存して一覧できる', 'To Do', 'new', 'Ben', ['backend'], '2026-09-02T09:00:00.000+0900'],
  ['NOTE-4', 'エディタ画面を作る', 'Markdown で書ける', 'Backlog', 'new', 'Aki', ['frontend'], '2026-09-02T10:00:00.000+0900'],
  ['NOTE-5', 'ログインしてノートを保存できる', '結合テスト', 'To Do', 'new', 'Aki', ['E2E'], '2026-09-03T09:00:00.000+0900'],
  ['NOTE-6', '招待メールを送る', '招待メールを送る', 'Done', 'done', 'Ben', ['backend'], '2026-08-30T09:00:00.000+0900'],
  ['NOTE-7', '利用規約を書く', '規約の文面', 'To Do', 'new', null, ['legal'], '2026-09-04T09:00:00.000+0900'],
  ['NOTE-8', '共有リンクを作る', 'ノートを共有リンクで見せる', 'To Do', 'new', 'Ben', ['backend'], '2026-09-05T09:00:00.000+0900'],
].map(([key, summary, text, name, cat, who, labels, created]) => ({
  key,
  fields: { summary, description: adf(text), status: { name, statusCategory: { key: cat } }, assignee: who ? { displayName: who } : null, labels, created },
}));
