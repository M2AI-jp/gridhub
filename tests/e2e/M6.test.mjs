// M6「同期を守る」— CONTRACTS §28（地図職人: 同期の守り）。Linear / Jira は、このファイルの中の小さな偽物で判定する。
// 本物の Linear / Jira には通信しない。API キーの代わりに「SECRET…」という目印を使い、どこにも出ないことを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, newToy, listen, fakeLinear, LINEAR_KEY, JIRA_ENV } from '../helpers3.mjs';

// ---------- 道具 ----------

// 手元の環境変数（本物のキーなど）が入り込まないよう、同期に関わるものは毎回上書きする
const BASE_ENV = { LINEAR_API_KEY: '', MASUME_LINEAR_URL: '', JIRA_EMAIL: '', JIRA_API_TOKEN: '', JIRA_BASE_URL: '', MASUME_JIRA_URL: '' };
const linEnv = (url, key = LINEAR_KEY) => ({ ...BASE_ENV, MASUME_LINEAR_URL: url, LINEAR_API_KEY: key });
const jirEnv = (url, over = {}) => ({ ...BASE_ENV, ...JIRA_ENV(url), ...over });
const linear = (args, env, cwd) => masumeEnv(['linear', ...args], { cwd, env });
const jira = (args, env, cwd) => masumeEnv(['jira', ...args], { cwd, env });
const readBody = (req) => new Promise((res) => { let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => res(b)); });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** dir の下のファイルのうち、needle を含むもの */
function filesContaining(dir, needle) {
  const hits = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else if (readFileSync(p, 'utf8').includes(needle)) hits.push(p);
    }
  };
  walk(dir);
  return hits;
}

async function rawServer(handler) {
  const server = http.createServer(handler);
  const url = await listen(server);
  return { url, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))) };
}

/** 閉じたポート（つながらない URL） */
async function deadUrl() {
  const s = await rawServer(() => {});
  const url = s.url;
  await s.close();
  return url;
}

const STATES = [
  { id: 's-backlog', name: 'Backlog', type: 'backlog' },
  { id: 's-todo', name: 'Todo', type: 'unstarted' },
  { id: 's-progress', name: 'In Progress', type: 'started' },
  { id: 's-review', name: 'In Review', type: 'started' },
  { id: 's-done', name: 'Done', type: 'completed' },
  { id: 's-canceled', name: 'Canceled', type: 'canceled' },
];

/**
 * Linear の小さな偽物（push 用）。hook(rec, req, res, st) が true を返したらその要求は hook が応えた。
 * st.ops = 受けた要求 { op, vars, t }、st.issues = 作られた issue
 */
async function miniLinear({ hook } = {}) {
  const st = { ops: [], issues: [], projects: [] };
  let n = 0;
  const srv = await rawServer(async (req, res) => {
    let body = {};
    try { body = JSON.parse(await readBody(req)); } catch {}
    const rec = { op: body.operationName, vars: body.variables ?? {}, t: Date.now() };
    st.ops.push(rec);
    if (hook && hook(rec, req, res, st) === true) return;
    res.setHeader('content-type', 'application/json');
    const out = (data) => res.end(JSON.stringify({ data }));
    const v = rec.vars;
    switch (rec.op) {
      case 'MasumeTeams': return out({ teams: { nodes: v.key === 'TOY' ? [{ id: 'team1', key: 'TOY', name: 'おもちゃ', states: { nodes: STATES } }] : [] } });
      case 'MasumeProjects': return out({ projects: { nodes: st.projects.filter((p) => p.name === v.name) } });
      case 'MasumeProjectCreate': {
        const p = { id: `p${st.projects.length + 1}`, name: v.input.name };
        st.projects.push(p);
        return out({ projectCreate: { success: true, project: p } });
      }
      case 'MasumeIssueCreate': {
        n++;
        const i = { id: `i${n}`, identifier: `TOY-${n}`, url: `https://linear.example/TOY-${n}`, ...v.input };
        st.issues.push(i);
        return out({ issueCreate: { success: true, issue: { id: i.id, identifier: i.identifier, url: i.url } } });
      }
      case 'MasumeIssueUpdate': {
        const i = st.issues.find((x) => x.id === v.id);
        if (!i) return res.end(JSON.stringify({ errors: [{ message: 'Entity not found: Issue' }], data: null }));
        Object.assign(i, v.input);
        return out({ issueUpdate: { success: true, issue: { id: i.id, identifier: i.identifier } } });
      }
      default:
        res.statusCode = 400;
        return res.end(JSON.stringify({ errors: [{ message: `unknown ${rec.op}` }] }));
    }
  });
  return { ...srv, st };
}

const JIRA_AUTH = 'Basic ' + Buffer.from('gm@example.com:jira_test_token').toString('base64');
const JST = {
  todo: { name: 'To Do', statusCategory: { key: 'new' } },
  progress: { name: 'In Progress', statusCategory: { key: 'indeterminate' } },
  review: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
  done: { name: 'Done', statusCategory: { key: 'done' } },
};
const JTRANS = [
  { id: '11', name: 'To Do', to: JST.todo },
  { id: '21', name: 'In Progress', to: JST.progress },
  { id: '31', name: 'In Review', to: JST.review },
  { id: '41', name: 'Done', to: JST.done },
];

/**
 * Jira の小さな偽物。hook(req, u, body, send, st, res) が true を返したらその要求は hook が応えた。
 * st.reqs = 受けた要求、st.issues = 作られた issue
 */
async function miniJira({ hook, seed = [], projects = [{ id: '10000', key: 'TOY', name: 'おもちゃ' }] } = {}) {
  const st = { reqs: [], issues: [] };
  let n = 0;
  const srv = await rawServer(async (req, res) => {
    const raw = await readBody(req);
    const u = new URL(req.url, 'http://x');
    let body;
    try { body = raw ? JSON.parse(raw) : undefined; } catch {}
    st.reqs.push({ method: req.method, path: u.pathname, body, auth: req.headers.authorization });
    const send = (status, b) => {
      res.statusCode = status;
      if (b === undefined) return res.end();
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(b));
    };
    if (req.headers.authorization !== JIRA_AUTH) return send(401, { errorMessages: ['Unauthorized'] });
    if (hook && hook(req, u, body, send, st, res) === true) return;
    let m;
    if (req.method === 'GET' && (m = u.pathname.match(/^\/rest\/api\/3\/project\/([^/]+)$/))) {
      const p = projects.find((x) => x.key === m[1]);
      return p ? send(200, p) : send(404, { errorMessages: ['No project'] });
    }
    if (req.method === 'POST' && u.pathname === '/rest/api/3/issue') {
      n++;
      const issue = { id: String(20000 + n), key: `${body.fields.project.key}-${n}`, fields: { ...body.fields, status: JST.todo } };
      st.issues.push(issue);
      return send(201, { id: issue.id, key: issue.key });
    }
    if ((m = u.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)(\/transitions)?$/))) {
      const issue = st.issues.find((x) => x.key === m[1]);
      if (!issue) return send(404, { errorMessages: ['No issue'] });
      if (m[2] && req.method === 'GET') return send(200, { transitions: JTRANS });
      if (m[2] && req.method === 'POST') {
        const t = JTRANS.find((x) => x.id === body?.transition?.id);
        if (!t) return send(400, { errorMessages: ['bad transition'] });
        issue.fields.status = t.to;
        return send(204);
      }
      if (req.method === 'GET') return send(200, { id: issue.id, key: issue.key, fields: { status: issue.fields.status } });
      if (req.method === 'PUT') {
        Object.assign(issue.fields, body.fields);
        return send(204);
      }
    }
    if (req.method === 'POST' && u.pathname === '/rest/api/3/search/jql') {
      const key = (body?.jql || '').match(/project\s*=\s*"?([A-Za-z0-9_]+)"?/)?.[1];
      return send(200, { issues: seed.filter((i) => i.key.startsWith(`${key}-`)), isLast: true });
    }
    send(404, { errorMessages: [`no route ${req.method} ${u.pathname}`] });
  });
  return { ...srv, st };
}

const adf = (text) => ({ type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const created = (i) => new Date(Date.UTC(2026, 8, 1, 0, 0, i)).toISOString();
/** Linear の issue（pull 用。helpers の fakeLinear が配る形） */
const linIssue = (i, o = {}) => ({
  team: 'NOTE', identifier: `NOTE-${i}`, title: `タスク${i}`, description: `説明${i}`, estimate: null, createdAt: created(i),
  state: { name: 'Todo', type: 'unstarted' }, assignee: { name: 'Aki' }, labels: { nodes: [] }, project: { name: 'ノートアプリ' }, ...o,
});
/** Jira の issue（pull 用） */
const jirIssue = (key, i, summary, o = {}) => ({
  key,
  fields: {
    summary, description: adf(`説明${i}`), status: { name: 'To Do', statusCategory: { key: 'new' } },
    assignee: { displayName: 'Aki' }, labels: [], created: created(i).replace('Z', '+0000'), ...o,
  },
});

// ---------- 28.1 秘密を出さない ----------

test('28.1 Linear: 印字できない API キーは E_LINEAR_AUTH/2。キーはどこにも出ず、通信もしない', async () => {
  const dir = newToy();
  const mock = await miniLinear();
  try {
    const keys = [
      'lin_api_SECRETnl\nxyz', // 改行を含む（ヘッダーに入れられない）
      'lin_api_SECRETtab\tx',
      'lin_api_SECRETbel\u0007x',
      'lin_api_SECRETjpあい', // 全角
      'キーSECRETonly',
    ];
    for (const key of keys) {
      const marker = key.match(/SECRET[A-Za-z]+/)[0];
      for (const args of [['push', '--team', 'TOY', '--dir', dir], ['pull', '--team', 'NOTE', '--out', join(dir, 'o.map.json')]]) {
        const label = `${JSON.stringify(key)} linear ${args[0]}`;
        const r = await linear(args, linEnv(mock.url, key), dir);
        assert.equal(r.code, 2, `${label}: ${r.all}`);
        assert.match(r.all, /E_LINEAR_AUTH/, `${label}: ${r.all}`);
        assert.ok(!r.all.includes(marker), `${label}: キーが出力に出ている: ${r.all}`);
      }
    }
    assert.equal(mock.st.ops.length, 0, '印字できないキーでは Linear に通信しない');
    assert.deepEqual(filesContaining(dir, 'SECRET'), [], 'キーがファイルに残らない');
    assert.equal(existsSync(join(dir, 'o.map.json')), false);
  } finally {
    await mock.close();
  }
});

test('28.1 Jira: 印字できない API トークンは E_JIRA_AUTH/2。トークンはどこにも出ず、通信もしない', async () => {
  const dir = newToy();
  const mock = await miniJira();
  try {
    const tokens = ['tok_SECRETnl\nxyz', 'tok_SECRETtab\tx', 'tok_SECRETjpあい', 'トークンSECRETonly'];
    for (const token of tokens) {
      const marker = token.match(/SECRET[A-Za-z]+/)[0];
      for (const args of [['push', '--project', 'TOY', '--dir', dir], ['pull', '--project', 'NOTE', '--out', join(dir, 'o.map.json')]]) {
        const label = `${JSON.stringify(token)} jira ${args[0]}`;
        const r = await jira(args, jirEnv(mock.url, { JIRA_API_TOKEN: token }), dir);
        assert.equal(r.code, 2, `${label}: ${r.all}`);
        assert.match(r.all, /E_JIRA_AUTH/, `${label}: ${r.all}`);
        assert.ok(!r.all.includes(marker), `${label}: トークンが出力に出ている: ${r.all}`);
      }
    }
    assert.equal(mock.st.reqs.length, 0, '印字できないトークンでは Jira に通信しない');
    assert.deepEqual(filesContaining(dir, 'SECRET'), [], 'トークンがファイルに残らない');
  } finally {
    await mock.close();
  }
});

test('28.1 URL に userinfo（user:password@）があれば E_USAGE/2。パスワードは出ず、通信もしない', async () => {
  const dir = newToy();
  const jmock = await miniJira();
  const lmock = await miniLinear();
  try {
    const withInfo = (url, info) => url.replace('http://', `http://${info}@`);
    const jiraCases = [
      { MASUME_JIRA_URL: withInfo(jmock.url, 'me%40x.com:SECRETTOKEN') },
      { MASUME_JIRA_URL: '', JIRA_BASE_URL: withInfo(jmock.url, 'me%40x.com:SECRETTOKEN') },
      { MASUME_JIRA_URL: withInfo(jmock.url, 'onlyuser') }, // ユーザー名だけでも userinfo
    ];
    for (const over of jiraCases) {
      for (const args of [['push', '--project', 'TOY', '--dir', dir], ['pull', '--project', 'NOTE', '--out', join(dir, 'o.map.json')]]) {
        const label = `jira ${args[0]} ${JSON.stringify(over)}`;
        const r = await jira(args, jirEnv(jmock.url, over), dir);
        assert.equal(r.code, 2, `${label}: ${r.all}`);
        assert.match(r.all, /E_USAGE/, `${label}: ${r.all}`);
        for (const bad of ['SECRETTOKEN', 'me%40x.com', 'me@x.com']) assert.ok(!r.all.includes(bad), `${label}: userinfo「${bad}」が出ている: ${r.all}`);
      }
    }
    assert.equal(jmock.st.reqs.length, 0, 'userinfo つきの URL には通信しない');

    for (const args of [['push', '--team', 'TOY', '--dir', dir], ['pull', '--team', 'NOTE', '--out', join(dir, 'o.map.json')]]) {
      const label = `linear ${args[0]}`;
      const r = await linear(args, linEnv(withInfo(lmock.url, 'lin:SECRETPASS')), dir);
      assert.equal(r.code, 2, `${label}: ${r.all}`);
      assert.match(r.all, /E_USAGE/, `${label}: ${r.all}`);
      assert.ok(!r.all.includes('SECRETPASS'), `${label}: パスワードが出ている: ${r.all}`);
    }
    assert.equal(lmock.st.ops.length, 0, 'userinfo つきの URL には通信しない');
    assert.deepEqual(filesContaining(dir, 'SECRET'), [], 'どのファイルにも残らない');
  } finally {
    await jmock.close();
    await lmock.close();
  }
});

test('28.1（対照）正しいキー・トークンでつながらないときも、秘密は出ず E_*_NETWORK/1', async () => {
  const dir = newToy();
  const url = await deadUrl();
  const lin = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(url, 'lin_api_SECRETvalid'), dir);
  assert.equal(lin.code, 1, lin.all);
  assert.match(lin.all, /E_LINEAR_NETWORK/);
  assert.ok(!lin.all.includes('SECRETvalid'), lin.all);
  const jr = await jira(['push', '--project', 'TOY', '--dir', dir], jirEnv(url, { JIRA_API_TOKEN: 'tok_SECRETvalid' }), dir);
  assert.equal(jr.code, 1, jr.all);
  assert.match(jr.all, /E_JIRA_NETWORK/);
  assert.ok(!jr.all.includes('SECRETvalid'), jr.all);
  assert.deepEqual(filesContaining(dir, 'SECRETvalid'), []);
});

// ---------- 28.2 通信の途中で切れる ----------

// 本文の途中で切れる応答（content-length: 1000 と言いながら 8 バイトだけ送って切る）
const cutResponse = (req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'content-length': '1000' });
  res.write('{"data":');
  setTimeout(() => req.socket.destroy(), 50);
};
const cutBody = (req, res) => readBody(req).then(() => cutResponse(req, res));

test('28.2 応答の本文の読み込み中に切れたら E_LINEAR_NETWORK / E_JIRA_NETWORK（終了コード1）', async () => {
  const dir = newToy();
  const cut = await rawServer(cutBody);
  const out = join(dir, 'o.map.json');
  try {
    for (const args of [['push', '--team', 'TOY', '--dir', dir], ['pull', '--team', 'NOTE', '--out', out]]) {
      const r = await linear(args, linEnv(cut.url), dir);
      assert.equal(r.code, 1, `linear ${args[0]}: ${r.all}`);
      assert.match(r.all, /E_LINEAR_NETWORK/, `linear ${args[0]}: ${r.all}`);
    }
    for (const args of [['push', '--project', 'TOY', '--dir', dir], ['pull', '--project', 'NOTE', '--out', out]]) {
      const r = await jira(args, jirEnv(cut.url), dir);
      assert.equal(r.code, 1, `jira ${args[0]}: ${r.all}`);
      assert.match(r.all, /E_JIRA_NETWORK/, `jira ${args[0]}: ${r.all}`);
    }
    assert.equal(existsSync(out), false, '途中で切れたら下書きは書かない');
  } finally {
    await cut.close();
  }
});

test('28.2 途中まで進んでから（2つ目以降の要求で）切れても、同じ契約のコードで終わる', async () => {
  const dir = newToy();
  // Linear: チームとプロジェクトまでは通り、最初の issue の作成で本文の途中で切れる
  const lin = await miniLinear({ hook: (rec, req, res) => (rec.op === 'MasumeIssueCreate' ? (cutResponse(req, res), true) : false) });
  // Jira: プロジェクトの確認は通り、最初の issue の作成で切れる
  const jir = await miniJira({ hook: (req, u, body, send, st, res) => (req.method === 'POST' && u.pathname === '/rest/api/3/issue' ? (cutResponse(req, res), true) : false) });
  try {
    const l = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(lin.url), dir);
    assert.equal(l.code, 1, l.all);
    assert.match(l.all, /E_LINEAR_NETWORK/, l.all);
    assert.ok(lin.st.ops.some((o) => o.op === 'MasumeIssueCreate'), 'Linear: 作成の要求までは届いている');
    const j = await jira(['push', '--project', 'TOY', '--dir', dir], jirEnv(jir.url), dir);
    assert.equal(j.code, 1, j.all);
    assert.match(j.all, /E_JIRA_NETWORK/, j.all);
    assert.ok(jir.st.reqs.some((q) => q.method === 'POST' && q.path === '/rest/api/3/issue'), 'Jira: 作成の要求までは届いている');
  } finally {
    await lin.close();
    await jir.close();
  }
});

// ---------- 28.3 Linear の 429 と issue:null ----------

const rateLimited = (res) => {
  res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '1' });
  res.end(JSON.stringify({ errors: [{ message: 'Rate limit exceeded' }] }));
};

test('28.3 Linear: 429 は retry-after に従って待ち、再試行して最後まで同期する', async () => {
  const dir = newToy();
  let hits = 0;
  const mock = await miniLinear({ hook: (rec, req, res) => (rec.op === 'MasumeTeams' && hits++ < 1 ? (rateLimited(res), true) : false) });
  try {
    const r = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 0, r.all);
    assert.match(r.all, /作成 10件/);
    const teams = mock.st.ops.filter((o) => o.op === 'MasumeTeams');
    assert.equal(teams.length, 2, '429 のあと同じ要求をもう一度送る');
    assert.ok(teams[1].t - teams[0].t >= 900, `retry-after: 1 に従って待つ（待った時間 ${teams[1].t - teams[0].t}ms）`);
    assert.equal(mock.st.issues.length, 10);
  } finally {
    await mock.close();
  }
});

test('28.3 Linear: 作成が 429 でも、3回まで再試行すれば重複せずに終わる', async () => {
  const dir = newToy();
  let hits = 0;
  const mock = await miniLinear({ hook: (rec, req, res) => (rec.op === 'MasumeIssueCreate' && hits++ < 3 ? (rateLimited(res), true) : false) });
  try {
    const r = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 0, `最大3回の再試行で通る: ${r.all}`);
    assert.match(r.all, /作成 10件/);
    assert.equal(mock.st.issues.length, 10, 'issue は重複せず10件');
    assert.equal(new Set(mock.st.issues.map((i) => i.title)).size, 10);
  } finally {
    await mock.close();
  }
});

test('28.3 Linear: 429 が続くときは再試行を打ち切る（1回目 + 最大3回 = 4回まで）', async () => {
  const dir = newToy();
  const mock = await miniLinear({ hook: (rec, req, res) => (rateLimited(res), true) });
  try {
    const r = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, /E_LINEAR/, r.all);
    assert.ok(mock.st.ops.length >= 2, '少なくとも1回は再試行する');
    assert.ok(mock.st.ops.length <= 4, `再試行は最大3回（受けた要求 ${mock.st.ops.length}回）`);
  } finally {
    await mock.close();
  }
});

test('28.3 Linear: 作成の結果の issue が null なら E_LINEAR_API/1（TypeError にしない）', async () => {
  const dir = newToy();
  const mock = await miniLinear({
    hook: (rec, req, res) => {
      if (rec.op !== 'MasumeIssueCreate') return false;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { issueCreate: { success: true, issue: null } } }));
      return true;
    },
  });
  try {
    const r = await linear(['push', '--team', 'TOY', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, /E_LINEAR_API/, r.all);
    assert.doesNotMatch(r.all, /Cannot read|TypeError/, 'JavaScript のエラーがそのまま出ない');
    const file = join(dir, '.masume', 'linear.json');
    if (existsSync(file)) {
      for (const [id, v] of Object.entries(readJson(file).issues)) assert.equal(typeof v.id, 'string', `${id} に壊れた対応が残らない`);
    }
  } finally {
    await mock.close();
  }
});

// ---------- 28.4 push は飛ばして最後まで ----------

/** 2回目の push の準備: 1回目で全部作り、作った順のマスIDと対応表を返す */
async function pushedOnce(runFirst) {
  const dir = newToy();
  const first = await runFirst(dir);
  assert.equal(first.code, 0, first.all);
  return dir;
}

const SKIP_LINE = (id) => new RegExp(`飛ばしたマス:[\\s\\S]*${id}（[^）]+）`);

test('28.4 Linear: 消えた issue（not found）があっても残りを最後まで同期し、飛ばしたマスをまとめて出す（終了コード1）', async () => {
  const gone = new Set();
  const mock = await miniLinear({
    hook: (rec, req, res) => {
      if (rec.op !== 'MasumeIssueUpdate' || !gone.has(rec.vars.id)) return false;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: null, errors: [{ message: 'Entity not found: Issue - Could not find referenced Issue.', extensions: { type: 'invalid input', userPresentableMessage: 'Could not find referenced Issue.' } }] }));
      return true;
    },
  });
  try {
    const dir = await pushedOnce((d) => linear(['push', '--team', 'TOY', '--dir', d], linEnv(mock.url), d));
    const saved = readJson(join(dir, '.masume', 'linear.json'));
    const order = Object.keys(saved.issues);
    assert.equal(order.length, 10);
    const [x, y] = [order[1], order[4]];
    gone.add(saved.issues[x].id);
    gone.add(saved.issues[y].id);
    const before = mock.st.ops.length;
    const r = await linear(['push', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, SKIP_LINE(x), `飛ばしたマス ${x}: ${r.all}`);
    assert.match(r.all, SKIP_LINE(y), `飛ばしたマス ${y}: ${r.all}`);
    const updated = new Set(mock.st.ops.slice(before).filter((o) => o.op === 'MasumeIssueUpdate').map((o) => o.vars.id));
    for (const id of order.filter((i) => i !== x && i !== y)) assert.ok(updated.has(saved.issues[id].id), `${id} は飛ばしたマスのあとでも更新される`);
  } finally {
    await mock.close();
  }
});

test('28.4 Linear: not found が HTTP 400 で返っても、同じように飛ばして最後まで同期する', async () => {
  const gone = new Set();
  const mock = await miniLinear({
    hook: (rec, req, res) => {
      if (rec.op !== 'MasumeIssueUpdate' || !gone.has(rec.vars.id)) return false;
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: null, errors: [{ message: 'Entity not found: Issue - Could not find referenced Issue.', extensions: { type: 'invalid input', code: 'INVALID_INPUT', statusCode: 400 } }] }));
      return true;
    },
  });
  try {
    const dir = await pushedOnce((d) => linear(['push', '--team', 'TOY', '--dir', d], linEnv(mock.url), d));
    const saved = readJson(join(dir, '.masume', 'linear.json'));
    const order = Object.keys(saved.issues);
    gone.add(saved.issues[order[2]].id);
    const before = mock.st.ops.length;
    const r = await linear(['push', '--dir', dir], linEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, SKIP_LINE(order[2]), r.all);
    const updated = new Set(mock.st.ops.slice(before).filter((o) => o.op === 'MasumeIssueUpdate').map((o) => o.vars.id));
    for (const id of order.filter((i) => i !== order[2])) assert.ok(updated.has(saved.issues[id].id), `${id} が更新される`);
  } finally {
    await mock.close();
  }
});

test('28.4 Jira: issue が消えて(404)・権限が無くて(403)も、残りを最後まで同期する。403 は「権限」と書く', async () => {
  const rules = new Map(); // issue key → 返す HTTP ステータス
  const mock = await miniJira({
    hook: (req, u, body, send) => {
      const key = u.pathname.split('/')[5];
      if (req.method === 'PUT' && rules.has(key)) {
        send(rules.get(key), { errorMessages: [rules.get(key) === 404 ? 'Issue does not exist or you do not have permission to see it.' : 'You do not have permission to edit this issue.'] });
        return true;
      }
      return false;
    },
  });
  try {
    const dir = await pushedOnce((d) => jira(['push', '--project', 'TOY', '--dir', d], jirEnv(mock.url), d));
    const saved = readJson(join(dir, '.masume', 'jira.json'));
    const order = Object.keys(saved.issues);
    assert.equal(order.length, 10);
    const [gone, denied] = [order[1], order[3]];
    rules.set(saved.issues[gone].key, 404);
    rules.set(saved.issues[denied].key, 403);
    const before = mock.st.reqs.length;
    const r = await jira(['push', '--dir', dir], jirEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, SKIP_LINE(gone), `飛ばしたマス ${gone}: ${r.all}`);
    assert.match(r.all, SKIP_LINE(denied), `飛ばしたマス ${denied}: ${r.all}`);
    assert.match(r.all, new RegExp(`${denied}（[^）]*権限`), `403 は「権限」と書く: ${r.all}`);
    assert.doesNotMatch(r.all, /認証されませんでした/, '403 を認証のせいにしない');
    assert.doesNotMatch(r.all, /E_JIRA_AUTH/, '403 を認証エラーにしない');
    const puts = new Set(mock.st.reqs.slice(before).filter((q) => q.method === 'PUT').map((q) => q.path.split('/').pop()));
    for (const id of order.filter((i) => i !== gone && i !== denied)) assert.ok(puts.has(saved.issues[id].key), `${id} は飛ばしたマスのあとでも更新される`);
  } finally {
    await mock.close();
  }
});

test('28.4 Jira: 遷移が拒まれても(400)そのマスを飛ばし、ほかのマスの作成・遷移は最後まで進む', async () => {
  const dir = newToy(); // 作業中の A1・B1・H1 は In Progress（遷移が要る）
  let target = '';
  const mock = await miniJira({
    hook: (req, u, body, send, st) => {
      const m = u.pathname.match(/^\/rest\/api\/3\/issue\/([^/]+)\/transitions$/);
      if (!m || req.method !== 'POST') return false;
      const issue = st.issues.find((x) => x.key === m[1]);
      if (!issue.fields.summary.startsWith(`[${target}]`)) return false;
      send(400, { errors: { resolution: 'Resolution is required' }, errorMessages: ['Transition is not allowed'] });
      return true;
    },
  });
  try {
    const dry = await jira(['push', '--project', 'TOY', '--dir', dir, '--dry-run', '--json'], jirEnv(mock.url), dir);
    assert.equal(dry.code, 0, dry.all);
    const plan = JSON.parse(dry.out).issues;
    const needs = plan.filter((p) => ['In Progress', 'In Review', 'Done'].includes(p.status)).map((p) => p.id);
    assert.ok(needs.length >= 2, `遷移が要るマスが2つ以上ある（${needs}）`);
    target = needs[0];
    const r = await jira(['push', '--project', 'TOY', '--dir', dir], jirEnv(mock.url), dir);
    assert.equal(r.code, 1, r.all);
    assert.match(r.all, SKIP_LINE(target), `飛ばしたマス ${target}: ${r.all}`);
    assert.equal(mock.st.issues.length, 10, '全部のマスが作られる');
    const statusOf = (id) => mock.st.issues.find((i) => i.fields.summary.startsWith(`[${id}]`)).fields.status.statusCategory.key;
    assert.equal(statusOf(target), 'new', '拒まれたマスは遷移しないまま');
    for (const id of needs.slice(1)) assert.equal(statusOf(id), 'indeterminate', `${id} は拒まれたマスのあとでも遷移する`);
    const saved = readJson(join(dir, '.masume', 'jira.json'));
    assert.equal(Object.keys(saved.issues).length, 10, '対応表は10件ぜんぶ残る');
  } finally {
    await mock.close();
  }
});

// ---------- 28.5 Linear pull は state.type も見る ----------

test('28.5 linear pull: state.type が completed / canceled の issue は、状態の名前が何でも省く', async () => {
  const mock = await fakeLinear({
    seedIssues: [
      linIssue(1),
      linIssue(2, { state: { name: 'Released', type: 'completed' } }),
      linIssue(3, { state: { name: "Won't Do", type: 'canceled' } }),
      linIssue(4, { state: { name: 'Shipped', type: 'completed' } }),
      linIssue(5, { state: { name: 'In Progress', type: 'started' } }),
    ],
  });
  const dir = tmp('masume-m6-');
  const out = join(dir, 'o.map.json');
  try {
    const r = await linear(['pull', '--team', 'NOTE', '--out', out], linEnv(mock.url), dir);
    assert.equal(r.code, 0, r.all);
    const m = readJson(out);
    assert.deepEqual(Object.keys(m.nodes).sort(), ['GOAL', 'NOTE-1', 'NOTE-5'], '進行中の issue だけが残る');
    assert.match(m.quest.pitch, /3\s*件/, `省いた件数(3)が quest.pitch に出る: ${m.quest.pitch}`);
    assert.equal(masume(['validate', out]).code, 0);
  } finally {
    await mock.close();
  }
});

// ---------- 28.6 import / pull の下書きは必ず validate に通る ----------

const csvCell = (v) => `"${String(v).replaceAll('"', '""')}"`;
const csvText = (rows) => ['ID,Title,Description,Status,Assignee,Labels,Estimate,Created,Project', ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
const row = (id, title, o = {}) => [id, title, o.detail ?? `説明${id}`, o.status ?? 'Todo', o.who ?? 'Aki', '', '', o.created ?? created(Number(id.match(/\d+$/)[0])), o.project ?? 'ノートアプリ'];
const cp = (s) => Array.from(s);
const ABC100 = Array.from({ length: 100 }, (_, i) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 26]).join('');
const EMOJI70 = '\u{1F600}'.repeat(70);
const EMOJI90 = '\u{1F600}'.repeat(90);

/** 描いた下書きを検査する: タイトルの長さ・空のタイトル・プロジェクト名 */
function checkTitles(m, ids) {
  assert.equal(cp(m.nodes[ids.long].title).join(''), cp(ABC100).slice(0, 80).join(''), '100文字のタイトルは先頭80文字');
  assert.ok(m.nodes[ids.long].detail.startsWith(ABC100), `全文は detail の先頭に: ${m.nodes[ids.long].detail.slice(0, 120)}`);
  assert.ok(m.nodes[ids.long].detail.includes(`説明`), '元の detail も残る');
  assert.equal(m.nodes[ids.emoji70].title, EMOJI70, '80文字以内(コードポイント)なら削らない（UTF-16 の長さで数えない）');
  assert.ok(!m.nodes[ids.emoji70].detail.startsWith(EMOJI70), '削っていないタイトルを detail にくり返さない');
  assert.equal(cp(m.nodes[ids.emoji90].title).length, 80, '90文字は80コードポイントに');
  assert.equal(m.nodes[ids.emoji90].title, cp(EMOJI90).slice(0, 80).join(''));
  assert.ok(m.nodes[ids.emoji90].detail.startsWith(EMOJI90), '全文は detail の先頭に');
  assert.equal(m.nodes[ids.empty].title, ids.empty, '空のタイトルはマスID');
  assert.equal(m.nodes[ids.blank].title, ids.blank, '空白だけのタイトルもマスID');
  assert.equal(m.quest.title, 'プ'.repeat(80), 'プロジェクト名(quest.title)も80文字まで');
}

test('28.6 import linear: 長い・空のタイトルとプロジェクト名でも validate に通る下書きになる', () => {
  const dir = tmp('masume-m6-');
  const csv = join(dir, 'in.csv');
  const project = 'プ'.repeat(90);
  writeFileSync(csv, csvText([
    row('NOTE-1', ABC100, { project }),
    row('NOTE-2', EMOJI70, { project }),
    row('NOTE-3', EMOJI90, { project }),
    row('NOTE-4', '', { project }),
    row('NOTE-5', '   ', { project }),
    row('NOTE-6', 'ふつうのタイトル', { project }),
  ]));
  const out = join(dir, 'out.map.json');
  const r = masume(['import', 'linear', csv, '--out', out], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  const m = readJson(out);
  checkTitles(m, { long: 'NOTE-1', emoji70: 'NOTE-2', emoji90: 'NOTE-3', empty: 'NOTE-4', blank: 'NOTE-5' });
  assert.equal(m.nodes['NOTE-6'].title, 'ふつうのタイトル');
  const v = masume(['validate', out]);
  assert.equal(v.code, 0, v.all);
  assert.equal(masume(['new', out], { cwd: dir }).code, 0, '冒険を始められる');
});

test('28.6 import linear: quest.id は英大文字と数字だけの2〜10文字になる（MY_PROJ → MYPROJ）。--quest-id / --title が優先', () => {
  const dir = tmp('masume-m6-');
  const mk = (name, rows, extra = []) => {
    const csv = join(dir, `${name}.csv`);
    const out = join(dir, `${name}.map.json`);
    writeFileSync(csv, csvText(rows));
    const r = masume(['import', 'linear', csv, '--out', out, ...extra], { cwd: dir });
    assert.equal(r.code, 0, `${name}: ${r.all}`);
    assert.equal(masume(['validate', out]).code, 0, `${name} が validate に通る`);
    return readJson(out);
  };
  assert.equal(mk('under', [row('MY_PROJ-1', 'a'), row('MY_PROJ-2', 'b')]).quest.id, 'MYPROJ');
  assert.equal(mk('digits', [row('P2P-1', 'a'), row('P2P-2', 'b')]).quest.id, 'P2P');
  assert.equal(mk('long', [row('ABCDEFGHIJKLMNOP-1', 'a'), row('ABCDEFGHIJKLMNOP-2', 'b')]).quest.id, 'ABCDEFGHIJ', '10文字までに切る');
  const o = mk('opts', [row('MY_PROJ-1', 'a')], ['--quest-id', 'MYQ', '--title', '好きな題名']);
  assert.equal(o.quest.id, 'MYQ');
  assert.equal(o.quest.title, '好きな題名');
});

test('28.6 linear pull: 長い・空のタイトルとプロジェクト名でも validate に通る。--quest-id / --title が使える', async () => {
  const project = 'プ'.repeat(90);
  const p = { name: project };
  const mock = await fakeLinear({
    seedIssues: [
      linIssue(1, { title: ABC100, project: p }),
      linIssue(2, { title: EMOJI70, project: p }),
      linIssue(3, { title: EMOJI90, project: p }),
      linIssue(4, { title: '', project: p }),
      linIssue(5, { title: '  ', project: p }),
      linIssue(6, { project: p }),
    ],
  });
  const dir = tmp('masume-m6-');
  const out = join(dir, 'o.map.json');
  try {
    const r = await linear(['pull', '--team', 'NOTE', '--out', out], linEnv(mock.url), dir);
    assert.equal(r.code, 0, r.all);
    const m = readJson(out);
    checkTitles(m, { long: 'NOTE-1', emoji70: 'NOTE-2', emoji90: 'NOTE-3', empty: 'NOTE-4', blank: 'NOTE-5' });
    assert.equal(m.quest.id, 'NOTE');
    const v = masume(['validate', out]);
    assert.equal(v.code, 0, v.all);

    const out2 = join(dir, 'o2.map.json');
    const r2 = await linear(['pull', '--team', 'NOTE', '--quest-id', 'MYQ', '--title', '好きな題名', '--out', out2], linEnv(mock.url), dir);
    assert.equal(r2.code, 0, `--quest-id / --title が使える: ${r2.all}`);
    const m2 = readJson(out2);
    assert.equal(m2.quest.id, 'MYQ');
    assert.equal(m2.quest.title, '好きな題名');
  } finally {
    await mock.close();
  }
});

test('28.6 jira pull: キー MY_PROJ・長い/空の summary・長いプロジェクト名でも validate に通る。--quest-id / --title が使える', async () => {
  const project = 'プ'.repeat(90);
  const seed = [
    jirIssue('MY_PROJ-1', 1, ABC100),
    jirIssue('MY_PROJ-2', 2, EMOJI70),
    jirIssue('MY_PROJ-3', 3, EMOJI90),
    jirIssue('MY_PROJ-4', 4, ''),
    jirIssue('MY_PROJ-5', 5, '   '),
    jirIssue('MY_PROJ-6', 6, 'ふつう', { description: null }),
  ];
  const mock = await miniJira({ seed, projects: [{ id: '1', key: 'MY_PROJ', name: project }] });
  const dir = tmp('masume-m6-');
  const out = join(dir, 'o.map.json');
  try {
    const r = await jira(['pull', '--project', 'MY_PROJ', '--out', out], jirEnv(mock.url), dir);
    assert.equal(r.code, 0, r.all);
    const m = readJson(out);
    checkTitles(m, { long: 'MY_PROJ-1', emoji70: 'MY_PROJ-2', emoji90: 'MY_PROJ-3', empty: 'MY_PROJ-4', blank: 'MY_PROJ-5' });
    assert.equal(m.quest.id, 'MYPROJ', 'MY_PROJ → MYPROJ');
    const v = masume(['validate', out]);
    assert.equal(v.code, 0, v.all);

    const out2 = join(dir, 'o2.map.json');
    const r2 = await jira(['pull', '--project', 'MY_PROJ', '--quest-id', 'MYQ', '--title', '好きな題名', '--out', out2], jirEnv(mock.url), dir);
    assert.equal(r2.code, 0, `--quest-id / --title が使える: ${r2.all}`);
    const m2 = readJson(out2);
    assert.equal(m2.quest.id, 'MYQ');
    assert.equal(m2.quest.title, '好きな題名');
  } finally {
    await mock.close();
  }
});

test('28.6 取り込める issue が1件も無ければ E_NOTHING/1「取り込める issue がありません」（下書きは書かない）', async () => {
  const dir = tmp('masume-m6-');
  const check = (r, label, out) => {
    assert.equal(r.code, 1, `${label}: ${r.all}`);
    assert.match(r.all, /E_NOTHING/, `${label}: ${r.all}`);
    assert.match(r.all, /取り込める issue がありません/, `${label}: ${r.all}`);
    assert.equal(existsSync(out), false, `${label}: 下書きを書かない`);
  };

  // CSV: 全件 Done / Canceled
  const csv = join(dir, 'done.csv');
  writeFileSync(csv, csvText([row('NOTE-1', 'a', { status: 'Done' }), row('NOTE-2', 'b', { status: 'Canceled' }), row('NOTE-3', 'c', { status: 'Duplicate' })]));
  const csvOut = join(dir, 'csv.map.json');
  check(masume(['import', 'linear', csv, '--out', csvOut], { cwd: dir }), 'import linear', csvOut);

  // Linear: 全件 completed / canceled、issue が0件
  const lin = await fakeLinear({
    seedIssues: [
      linIssue(1, { state: { name: 'Done', type: 'completed' } }),
      linIssue(2, { state: { name: 'Released', type: 'completed' } }),
      linIssue(3, { state: { name: "Won't Do", type: 'canceled' } }),
    ],
  });
  try {
    const out1 = join(dir, 'lin1.map.json');
    check(await linear(['pull', '--team', 'NOTE', '--out', out1], linEnv(lin.url), dir), 'linear pull（全件完了）', out1);
    const out2 = join(dir, 'lin2.map.json');
    check(await linear(['pull', '--team', 'EMPTY', '--out', out2], linEnv(lin.url), dir), 'linear pull（0件）', out2);
  } finally {
    await lin.close();
  }

  // Jira: 全件 statusCategory done、issue が0件
  const done = (key, i) => jirIssue(key, i, `t${i}`, { status: { name: 'Done', statusCategory: { key: 'done' } } });
  const jir = await miniJira({ seed: [done('NOTE-1', 1), done('NOTE-2', 2)], projects: [{ id: '1', key: 'NOTE', name: 'ノート' }, { id: '2', key: 'EMPTY', name: 'から' }] });
  try {
    const out1 = join(dir, 'jira1.map.json');
    check(await jira(['pull', '--project', 'NOTE', '--out', out1], jirEnv(jir.url), dir), 'jira pull（全件完了）', out1);
    const out2 = join(dir, 'jira2.map.json');
    check(await jira(['pull', '--project', 'EMPTY', '--out', out2], jirEnv(jir.url), dir), 'jira pull（0件）', out2);
  } finally {
    await jir.close();
  }
});
