// G11「結合: 配るものから遊ぶ」— 書記・伝令・盤面・語り部・地図職人の結合E2E（第14章。§77 で改めた）。CONTRACTS §62.4・§77.2。
// 配るもの（sh mac/build.sh が GridHub.app に詰める中身）を、リポジトリの外のフォルダに写し、そこに入ったものだけで動かす。
// 入れ忘れたものがあれば、ここで落ちる（リポジトリの中のファイルには頼らない）。パッケージの道具は使わない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, tmp, openBrowser, fakeGm, GIT_ENV, distPaths, distEnv } from '../helpers7.mjs';

const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const READY = 'window.__masume && window.__masume.ready';

/** 配るものを写した所。bin(name) は、その中の bin/<name>.js */
function installed() {
  const { root } = distPaths();
  return { pkgDir: root, bin: (name) => join(root, 'bin', `${name}.js`) };
}

/** 配るものの中の gridhub を、リポジトリの外で動かす */
function run(name, args, { cwd, env = {} } = {}) {
  const { bin } = installed();
  const r = spawnSync(process.execPath, [bin(name), ...args], { cwd: cwd ?? tmp('gridhub-g11-cwd-'), env: distEnv(env), encoding: 'utf8', timeout: 120000 });
  return { code: r.status, out: r.stdout || '', all: (r.stdout || '') + (r.stderr || '') + (r.error ? String(r.error) : '') };
}
const gridhub = (args, opts) => run('gridhub', args, opts);
const viewOf = (dir) => {
  const r = gridhub(['status', '--json', '--dir', dir]);
  assert.equal(r.code, 0, r.all);
  return JSON.parse(r.out);
};

function tutorialCopy(prefix) {
  const dir = tmp(prefix);
  cpSync(join(installed().pkgDir, 'quests', 'tutorial'), dir, { recursive: true });
  return dir;
}

test('§77.2 配るものは、動くのに要るもの（bin・src・web・docs の md・チュートリアル・README・LICENSE・CHANGELOG・package.json）だけ', { timeout: 240000 }, () => {
  const p = distPaths();
  const allowed = [/^bin\/[^/]+\.js$/, /^src\//, /^web\//, /^docs\/[^/]+\.md$/, /^quests\/tutorial\//, /^(package\.json|README\.md|LICENSE|CHANGELOG\.md)$/];
  const extra = p.paths.filter((f) => !allowed.some((re) => re.test(f)));
  assert.deepEqual(extra, [], '配るものに入れないもの');
  for (const re of [/^\.masume\//, /^tests\//, /^examples\//, /^demos\//, /^docs\/.*\.png$/, /^docs\/(shots|prototype)\//, /^quests\/masume\.map\.json$/, /^quests\/kotozuke/, /^AGENTS\.md$/, /^mac\//, /node_modules/, /\.DS_Store$/]) {
    assert.ok(!p.paths.some((f) => re.test(f)), `入れない: ${re}`);
  }
  for (const f of ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'bin/gridhub.js', 'bin/masume.js', 'docs/RULEBOOK.md', 'docs/GM_GUIDE.md', 'docs/CONTRACTS.md', 'quests/tutorial/tutorial.map.json', 'quests/tutorial/SOLUTIONS.json', 'web/index.html', 'web/start.html']) {
    assert.ok(p.paths.includes(f), `入れる: ${f}`);
  }
  // Git にある「動くのに要るもの」は、1つ残らず配るものに入る
  const tracked = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' }).stdout.split('\0').filter(Boolean);
  const missing = tracked.filter((f) => allowed.some((re) => re.test(f)) && !p.paths.includes(f));
  assert.deepEqual(missing, [], '配るものに入れ忘れたもの');
  // 逆に、Git に無いもの（手元で作った一時ファイルなど）は配らない
  const untracked = p.paths.filter((f) => !tracked.includes(f));
  assert.deepEqual(untracked, [], 'Git に無いものを配っている');
  assert.ok(p.bytes < 4 * 1024 * 1024, `配るものの大きさ ${p.bytes}`);
});

test('§62.2・§77.2 配るものを別のフォルダに写すと gridhub と masume が動き、--version はそこの package.json の版', () => {
  const { pkgDir, bin } = installed();
  for (const name of ['gridhub', 'masume']) {
    assert.ok(existsSync(bin(name)), `bin/${name}.js`);
    const v = run(name, ['--version']);
    assert.equal(v.code, 0, v.all);
    assert.equal(v.out.trim(), `gridhub ${PKG.version} (rules 1)`);
    const h = run(name, ['--help']);
    assert.equal(h.code, 0, h.all);
    assert.match(h.out.split('\n')[0], /GridHub/);
  }
  // 版は決め打ちせず、配るものの package.json から読む
  const file = join(pkgDir, 'package.json');
  const original = readFileSync(file, 'utf8');
  try {
    writeFileSync(file, JSON.stringify({ ...JSON.parse(original), version: '9.9.9-g11' }, null, 2));
    assert.equal(gridhub(['--version']).out.trim(), 'gridhub 9.9.9-g11 (rules 1)');
  } finally {
    writeFileSync(file, original);
  }
});

test('配るもののチュートリアルで冒険を作り、SOLUTIONS を当てると判定が通ってあがる（書記 × 地図職人）', () => {
  const dir = tutorialCopy('gridhub-g11-tut-');
  const sol = JSON.parse(readFileSync(join(dir, 'SOLUTIONS.json'), 'utf8'));
  const apply = (id) => {
    for (const f of sol[id] || []) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.content);
    }
  };
  const n = gridhub(['new', 'tutorial.map.json', '--dir', dir], { cwd: dir });
  if (n.code !== 0) console.log('MASUME_BLAME: gmkit');
  assert.equal(n.code, 0, n.all);
  let v = viewOf(dir);
  for (const [id, node] of Object.entries(v.nodes)) if (node.type === 'gate') apply(id);
  for (let step = 0; step < 80 && !v.finished; step++) {
    let moved = false;
    for (const c of v.characters) {
      if (c.status !== 'working') continue;
      const node = v.nodes[c.at];
      const b = gridhub(['brief', c.id, '--dir', dir], { cwd: dir });
      assert.equal(b.code, 0, b.all);
      apply(c.at);
      const r = node.check?.kind === 'stamp'
        ? gridhub(['stamp', c.at, '--dir', dir, '--as', node.check.by], { cwd: dir })
        : gridhub(['check', c.id, '--dir', dir, '--as', c.id], { cwd: dir });
      assert.equal(r.code, 0, `${c.id} @ ${c.at}: ${r.all}`);
      moved = true;
      v = viewOf(dir);
    }
    if (!moved) {
      const ready = Object.entries(v.nodes).find(([, x]) => x.state === 'ready');
      assert.ok(ready, `誰も動けないのにボス戦の準備もない: ${JSON.stringify(v.characters.map((c) => [c.id, c.at, c.status]))}`);
      const r = gridhub(['check', ready[0], '--dir', dir, '--as', 'gm'], { cwd: dir });
      assert.equal(r.code, 0, r.all);
    }
    v = viewOf(dir);
  }
  assert.equal(v.finished, true, 'あがり');
  assert.ok(v.characters.every((c) => c.status === 'done'));
  const verify = gridhub(['verify', '--dir', dir], { cwd: dir });
  assert.equal(verify.code, 0, verify.all);
});

test('配るものの gridhub serve で、盤面（配るものの web）が開く（伝令 × 盤面）', { timeout: 120000 }, async () => {
  const dir = tutorialCopy('gridhub-g11-serve-');
  const n = gridhub(['new', 'tutorial.map.json', '--dir', dir], { cwd: dir });
  assert.equal(n.code, 0, n.all);
  const { bin } = installed();
  const proc = spawn(process.execPath, [bin('gridhub'), 'serve', '--port', '0', '--dir', dir], { cwd: dir, env: distEnv() });
  let out = '';
  proc.stdout.on('data', (d) => (out += d));
  proc.stderr.on('data', (d) => (out += d));
  const stop = () => new Promise((done) => {
    if (proc.exitCode !== null) return done();
    proc.once('exit', () => done());
    proc.kill('SIGTERM');
    setTimeout(() => proc.kill('SIGKILL'), 3000);
  });
  let page;
  try {
    const url = await new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error(`serve が起動しない:\n${out}`)), 15000);
      const look = () => {
        const m = out.match(/http:\/\/[^\s]+/);
        if (m) {
          clearTimeout(t);
          res(m[0].replace(/\/$/, ''));
        }
      };
      proc.stdout.on('data', look);
      proc.on('exit', (code) => rej(new Error(`serve が終了した (code ${code}):\n${out}`)));
    });
    const state = await fetch(`${url}/api/state`);
    assert.equal(state.status, 200);
    assert.equal((await state.json()).quest.id, 'TUT');
    page = await openBrowser({ width: 1440, height: 900 });
    await page.goto(`${url}/`);
    await page.waitFor(READY, { timeout: 20000, message: '盤面が描かれる' });
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { timeout: 10000, message: 'ライブ接続' });
    const nodes = await page.eval(`document.querySelectorAll('#node-layer [data-node]').length`);
    assert.ok(nodes >= 5, `マスが描かれる（${nodes}）`);
    const pawns = await page.eval(`document.querySelectorAll('.pawn[data-char]').length`);
    assert.ok(pawns >= 2, `駒が描かれる（${pawns}）`);
  } finally {
    await page?.close();
    await stop();
  }
});

test('配るものの MCP の資料・gridhub init の AGENTS.md・gridhub quest のプロンプトは、配るものの中の docs を読む（伝令 × 語り部）', { timeout: 120000 }, async () => {
  const { pkgDir, bin } = installed();
  const dir = tutorialCopy('gridhub-g11-mcp-');
  assert.equal(gridhub(['new', 'tutorial.map.json', '--dir', dir], { cwd: dir }).code, 0);

  // MCP: masume://docs/RULEBOOK.md が、配るものの docs/RULEBOOK.md と同じ
  const proc = spawn(process.execPath, [bin('gridhub'), 'mcp', '--dir', dir], { cwd: dir, env: distEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  let stderr = '';
  const replies = new Map();
  proc.stdout.setEncoding('utf8');
  proc.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) replies.set(msg.id, msg);
      } catch {}
    }
  });
  proc.stderr.on('data', (d) => (stderr += d));
  const request = async (id, method, params = {}) => {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    const start = Date.now();
    while (!replies.has(id)) {
      if (Date.now() - start > 30000) throw new Error(`MCP ${method} が返らない\n${stderr}`);
      await new Promise((r) => setTimeout(r, 50));
    }
    return replies.get(id);
  };
  try {
    const init = await request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'g11', version: '0' } });
    assert.ok(init.result, JSON.stringify(init));
    assert.equal(init.result.serverInfo?.version, PKG.version, 'MCP の版も package.json');
    proc.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    const list = await request(2, 'resources/list');
    const uris = (list.result?.resources || []).map((r) => r.uri);
    for (const f of ['RULEBOOK.md', 'GM_GUIDE.md', 'CONTRACTS.md']) {
      assert.ok(uris.includes(`masume://docs/${f}`), `資料 ${f}`);
      const read = await request(10 + uris.indexOf(`masume://docs/${f}`), 'resources/read', { uri: `masume://docs/${f}` });
      assert.equal(read.result?.contents?.[0]?.text, readFileSync(join(pkgDir, 'docs', f), 'utf8'), `masume://docs/${f} が読める\n${JSON.stringify(read.error ?? '')}`);
    }
  } finally {
    proc.stdin.end();
    await new Promise((res) => {
      if (proc.exitCode !== null) return res();
      proc.once('exit', res);
      setTimeout(() => proc.kill('SIGTERM'), 1000);
    });
  }

  // init: AGENTS.md のルールブックは、配るものの中にある
  const project = tmp('gridhub-g11-init-');
  const r = gridhub(['init', '--dir', project], { cwd: project });
  assert.equal(r.code, 0, r.all);
  const agents = readFileSync(join(project, 'AGENTS.md'), 'utf8');
  const rulebook = agents.match(/^ルールブック: (.+?)（/m)?.[1];
  assert.ok(rulebook, `AGENTS.md にルールブックの場所\n${agents.slice(0, 600)}`);
  assert.ok(existsSync(rulebook), `ルールブックがある: ${rulebook}`);
  assert.equal(rulebook, join(pkgDir, 'docs', 'RULEBOOK.md'));

  // quest: GM に渡すプロンプトの付録は、配るものの docs から
  const root = tmp('gridhub-g11-quest-');
  const q = gridhub(['quest', 'メモ帳のようなアプリを作りたい', '--dir', root, '--gm', fakeGm('good')], { cwd: tmp('gridhub-g11-cwd-'), env: GIT_ENV });
  assert.equal(q.code, 0, q.all);
  const prompt = readFileSync(join(root, 'gm-prompt-1.txt'), 'utf8');
  const guide = readFileSync(join(pkgDir, 'docs', 'GM_GUIDE.md'), 'utf8').replace(/\s+$/u, '');
  assert.ok(prompt.includes(guide), 'GM ガイドの全文が付録に入る');
});
