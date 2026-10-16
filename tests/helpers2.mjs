// 第2章の判定の共通道具（偽の GM・偽のエージェント・偽の Linear）。GM の縄張り・封印対象。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, listen, BIN } from './helpers.mjs';

export * from './helpers.mjs';

const FAKE_DIR = tmp('masume-fakes-');

// ---- 偽の GM（masume quest 用） ----
// node fake-gm.mjs <mode>   mode: good | bad-then-good | bad | fail | nothing
// プロンプト（stdin）を <root>/gm-prompt-<n>.txt に、環境変数を <root>/gm-env-<n>.json に残す。
const FAKE_GM = `import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const mode = process.argv[2] || 'good';
const root = process.cwd();
const prompt = readFileSync(0, 'utf8');
const n = readdirSync(root).filter((f) => f.startsWith('gm-prompt-')).length + 1;
writeFileSync('gm-prompt-' + n + '.txt', prompt);
writeFileSync('gm-env-' + n + '.json', JSON.stringify({ MASUME_DIR: process.env.MASUME_DIR, MASUME_BIN: process.env.MASUME_BIN, MASUME_WISH: process.env.MASUME_WISH, MASUME_PROMPT_FILE: process.env.MASUME_PROMPT_FILE }));
console.log('偽のGM: ' + n + '回目の呼び出し（' + mode + '）');
if (mode === 'fail') { console.error('GM がこけた'); process.exit(3); }
if (mode === 'nothing') process.exit(0);
const cmd = (id) => ({ kind: 'cmd', run: 'node checks/done.mjs ' + id, seal: ['checks/done.mjs'] });
const map = {
  masume: 1,
  quest: { id: 'MEMO', title: 'メモアプリ', pitch: 'メモを書いて残せるアプリ', goal: 'FIN' },
  characters: [
    { id: 'store', name: '倉庫番', kind: 'agent', agent: 'claude', job: 'merchant', color: 'orange', module: '保存', territory: ['store/**'], path: ['T1', 'T2', 'G1', 'FIN'] },
    { id: 'ui', name: '絵描き', kind: 'agent', agent: 'claude', job: 'painter', color: 'pink', module: '画面', territory: ['ui/**'], path: ['U1', 'G1', 'FIN'] },
    { id: 'you', name: 'あなた', kind: 'human', job: 'hero', color: 'purple', module: '確認', path: ['H1', 'FIN'] },
  ],
  nodes: {
    T1: { type: 'task', title: 'メモを保存する', detail: 'メモを1件保存できること。', check: cmd('T1') },
    T2: { type: 'task', title: 'メモを一覧する', detail: '保存したメモを一覧できること。', check: cmd('T2') },
    U1: { type: 'task', title: 'メモの画面を作る', detail: 'メモを書く画面があること。', check: cmd('U1') },
    G1: { type: 'gate', title: '書いたメモが一覧に出る', detail: '画面で書いたメモが一覧に出ること。', check: cmd('G1') },
    H1: { type: 'task', title: '使ってみて承認する', check: { kind: 'stamp', by: 'you' } },
    FIN: { type: 'gate', title: 'あがり', detail: 'メモアプリとして使えること。', check: cmd('FIN') },
  },
};
const bad = mode === 'bad' || (mode === 'bad-then-good' && n === 1);
if (bad) delete map.quest.goal;
mkdirSync('checks', { recursive: true });
writeFileSync('checks/done.mjs', "import { existsSync } from 'node:fs';\\nconst id = process.argv[2];\\nif (existsSync('work/' + id + '.txt')) { console.log('PASS ' + id); process.exit(0); }\\nconsole.log('FAIL ' + id + ': work/' + id + '.txt がありません'); process.exit(1);\\n");
writeFileSync('quest.map.json', JSON.stringify(map, null, 2));
console.log('偽のGM: quest.map.json を書いた');
`;

export function fakeGm(mode = 'good') {
  const file = join(FAKE_DIR, 'fake-gm.mjs');
  writeFileSync(file, FAKE_GM);
  return `cmd:node ${JSON.stringify(file)} ${mode}`;
}

// ---- 偽のエージェント（masume party 用） ----
// node fake-agent.mjs <mode> [ms]   mode: good | lazy | slow | record
//  good   … flags/<MASUME_NODE> に ok を書き、宣言判定（--no-boss）して終わる
//  lazy   … 何もしない
//  slow   … ms ミリ秒待ってから good
//  record … 環境変数とプロンプトを record-<キャラ>-<n>.json に残してから good
const FAKE_AGENT = `import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const [mode = 'good', ms = '0'] = process.argv.slice(2);
const prompt = readFileSync(0, 'utf8');
const env = process.env;
console.log('偽のエージェント ' + env.MASUME_CHARACTER + ' @ ' + env.MASUME_NODE + '（' + mode + '）');
if (mode === 'lazy') process.exit(0);
if (mode === 'record') {
  const n = readdirSync(env.MASUME_DIR).filter((f) => f.startsWith('record-' + env.MASUME_CHARACTER + '-')).length + 1;
  writeFileSync(env.MASUME_DIR + '/record-' + env.MASUME_CHARACTER + '-' + n + '.json', JSON.stringify({ prompt, cwd: process.cwd(), MASUME_DIR: env.MASUME_DIR, MASUME_BIN: env.MASUME_BIN, MASUME_CHARACTER: env.MASUME_CHARACTER, MASUME_NODE: env.MASUME_NODE, MASUME_PROMPT_FILE: env.MASUME_PROMPT_FILE, promptFile: env.MASUME_PROMPT_FILE ? readFileSync(env.MASUME_PROMPT_FILE, 'utf8') : null }));
}
if (mode === 'slow') await new Promise((r) => setTimeout(r, Number(ms)));
mkdirSync(env.MASUME_DIR + '/flags', { recursive: true });
writeFileSync(env.MASUME_DIR + '/flags/' + env.MASUME_NODE, 'ok');
mkdirSync(env.MASUME_DIR + '/work', { recursive: true });
writeFileSync(env.MASUME_DIR + '/work/' + env.MASUME_NODE + '.txt', 'done');
const r = spawnSync(process.execPath, [env.MASUME_BIN, 'check', env.MASUME_CHARACTER, '--as', env.MASUME_CHARACTER, '--no-boss', '--dir', env.MASUME_DIR], { encoding: 'utf8' });
console.log(r.stdout + r.stderr);
process.exit(0);
`;

export function fakeAgent(mode = 'good', ms = 0) {
  const file = join(FAKE_DIR, 'fake-agent.mjs');
  writeFileSync(file, FAKE_AGENT);
  return `cmd:node ${JSON.stringify(file)} ${mode} ${ms}`;
}

// ---- 環境変数つきで masume serve を起動する ----
export function startServeEnv(dir, env = {}) {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, [BIN, 'serve', '--port', '0', '--dir', dir], {
      cwd: dir,
      env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env },
    });
    let out = '';
    const t = setTimeout(() => rej(new Error(`serve が起動しない:\n${out}`)), 15000);
    const onData = (d) => {
      out += d;
      const m = out.match(/http:\/\/[^\s]+/);
      if (m) {
        clearTimeout(t);
        res({
          url: m[0].replace(/\/$/, ''),
          proc: p,
          output: () => out,
          stop: () =>
            new Promise((done) => {
              if (p.exitCode !== null) return done();
              p.once('exit', () => done());
              p.kill('SIGTERM');
              setTimeout(() => p.kill('SIGKILL'), 3000);
            }),
        });
      }
    };
    p.stdout.on('data', onData);
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => rej(new Error(`serve が終了した (code ${code}):\n${out}`)));
  });
}

/** 非同期で masume を実行し、環境変数を足せる */
export function masumeEnv(args, { cwd, env = {} } = {}) {
  return new Promise((res) => {
    const p = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env } });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code, signal) => res({ code, signal, out, err, all: out + err }));
  });
}

/** 起動したまま途中で止めたいとき用 */
export function spawnMasume(args, { cwd, env = {} } = {}) {
  const p = spawn(process.execPath, [BIN, ...args], { cwd, env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '', ...env } });
  let out = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (out += d));
  const done = new Promise((res) => p.on('close', (code, signal) => res({ code, signal, all: out })));
  return { proc: p, done, output: () => out };
}

// ---- 偽の Linear（GraphQL） ----
export const LINEAR_KEY = 'lin_test_key';

export async function fakeLinear({ seedIssues = [] } = {}) {
  const http = await import('node:http');
  const db = {
    requests: [],
    teams: [
      {
        id: 'team-msm', key: 'TOY', name: 'おもちゃチーム',
        states: { nodes: [
          { id: 's-backlog', name: 'Backlog', type: 'backlog' },
          { id: 's-todo', name: 'Todo', type: 'unstarted' },
          { id: 's-progress', name: 'In Progress', type: 'started' },
          { id: 's-review', name: 'In Review', type: 'started' },
          { id: 's-done', name: 'Done', type: 'completed' },
          { id: 's-canceled', name: 'Canceled', type: 'canceled' },
        ] },
      },
      { id: 'team-note', key: 'NOTE', name: 'ノート', states: { nodes: [{ id: 'n-done', name: 'Done', type: 'completed' }] } },
    ],
    projects: [],
    issues: [],
    seed: seedIssues,
  };
  let issueNo = 0;
  const handlers = {
    MasumeTeams: ({ key }) => ({ teams: { nodes: db.teams.filter((t) => t.key === key) } }),
    MasumeProjects: ({ name }) => ({ projects: { nodes: db.projects.filter((p) => p.name === name) } }),
    MasumeProjectCreate: ({ input }) => {
      const project = { id: `proj-${db.projects.length + 1}`, name: input.name, teamIds: input.teamIds };
      db.projects.push(project);
      return { projectCreate: { success: true, project: { id: project.id, name: project.name } } };
    },
    MasumeIssueCreate: ({ input }) => {
      issueNo++;
      const issue = { id: `issue-${issueNo}`, identifier: `TOY-${issueNo}`, url: `https://linear.example/TOY-${issueNo}`, ...input };
      db.issues.push(issue);
      return { issueCreate: { success: true, issue: { id: issue.id, identifier: issue.identifier, url: issue.url } } };
    },
    MasumeIssueUpdate: ({ id, input }) => {
      const issue = db.issues.find((i) => i.id === id);
      if (!issue) throw new Error(`issue ${id} がない`);
      Object.assign(issue, input);
      return { issueUpdate: { success: true, issue: { id: issue.id, identifier: issue.identifier } } };
    },
    MasumeIssues: ({ key, project }) => ({
      issues: { nodes: db.seed.filter((i) => i.team === key && (!project || i.project?.name === project)).map(({ team, ...rest }) => rest) },
    }),
  };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      let parsed = {};
      try {
        parsed = JSON.parse(body);
      } catch {}
      db.requests.push({ headers: req.headers, body: parsed });
      res.setHeader('content-type', 'application/json');
      if (req.headers.authorization !== LINEAR_KEY) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ errors: [{ message: 'Authentication required' }] }));
      }
      const h = handlers[parsed.operationName];
      if (!h) {
        res.statusCode = 400;
        return res.end(JSON.stringify({ errors: [{ message: `unknown operation ${parsed.operationName}` }] }));
      }
      try {
        res.end(JSON.stringify({ data: h(parsed.variables || {}) }));
      } catch (e) {
        res.end(JSON.stringify({ errors: [{ message: e.message }] }));
      }
    });
  });
  const url = await listen(server);
  return { url: `${url}/graphql`, db, close: () => new Promise((r) => (server.closeAllConnections?.(), server.close(() => r()))) };
}

/** Linear の CSV 見本と同じ中身の issue（pull 用） */
export const NOTE_ISSUES = [
  ['NOTE-1', 'ログイン画面を作る', 'メールとパスワードでログインできる', 'Todo', 3, 'Aki', ['frontend'], '2026-09-01T10:00:00.000Z'],
  ['NOTE-2', 'ユーザーAPIを作る', 'POST /users でユーザーを作れる, 重複はエラー', 'In Progress', 2, 'Ben', ['backend'], '2026-09-01T11:00:00.000Z'],
  ['NOTE-3', 'ノートを保存する', 'ノートを保存して一覧できる', 'Todo', 3, 'Ben', ['backend'], '2026-09-02T09:00:00.000Z'],
  ['NOTE-4', 'エディタ画面を作る', 'Markdown で書ける\nプレビューつき', 'Backlog', 5, 'Aki', ['frontend'], '2026-09-02T10:00:00.000Z'],
  ['NOTE-5', 'ログインしてノートを保存できる', '結合テスト', 'Todo', null, 'Aki', ['E2E', 'milestone'], '2026-09-03T09:00:00.000Z'],
  ['NOTE-6', '招待メールを送る', '招待メールを送る', 'Done', 1, 'Ben', ['backend'], '2026-08-30T09:00:00.000Z'],
  ['NOTE-7', '利用規約を書く', '規約の文面', 'Todo', 1, null, ['legal'], '2026-09-04T09:00:00.000Z'],
  ['NOTE-8', '共有リンクを作る', 'ノートを共有リンクで見せる', 'Todo', 2, 'Ben', ['backend'], '2026-09-05T09:00:00.000Z'],
].map(([identifier, title, description, state, estimate, assignee, labels, createdAt]) => ({
  team: 'NOTE',
  identifier,
  title,
  description,
  estimate,
  createdAt,
  state: { name: state, type: state === 'Done' ? 'completed' : 'unstarted' },
  assignee: assignee ? { name: assignee } : null,
  labels: { nodes: labels.map((name) => ({ name })) },
  project: { name: 'ノートアプリ' },
}));
