// Q3「GM の後始末と支度の安全」— CONTRACTS §27（第4章・総点検の修理）。
// 古い地図を受け入れない・背景に残る GM・シグナル・出力の扱い・タイムアウト・--force・init の symlink・引用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync, readFileSync, existsSync, mkdirSync, symlinkSync, lstatSync, statSync, cpSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, tmp, masume, masumeEnv, spawnMasume, setupToy, flag, view, char, readLog, fakeGm, waitUntil,
} from '../helpers3.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 時間切れつきで待つ（タイマーを残さない）
function within(promise, ms, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((res) => { timer = setTimeout(() => res(onTimeout()), ms); })]).finally(() => clearTimeout(timer));
}

const WISH = 'メモアプリのようなアプリを作りたい';
const quest = (args, env = {}, cwd = tmp('masume-q3-cwd-')) => masumeEnv(['quest', ...args], { cwd, env });

// ---- 小道具（このファイルの中だけ） ----

// release ファイルができるまで待ち、できたら end を残す。殺されたら end は残らない。
const WAITER = `import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
try { readFileSync(0); } catch {}
const name = (process.argv[2] || 'proc').replace('%C', process.env.MASUME_CHARACTER || '');
mkdirSync('marks', { recursive: true });
const mark = (t) => appendFileSync('marks/' + name + '.log', t + '\\n');
mark('start pid=' + process.pid);
const deadline = Date.now() + 40000;
while (!existsSync('release') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
mark('end');
process.exit(Number(process.argv[3] || 0));
`;
const FAKES = tmp('masume-q3-fakes-');
const file = (name, text) => {
  const f = join(FAKES, name);
  writeFileSync(f, text);
  return f;
};
const WAITER_FILE = file('waiter.mjs', WAITER);
const GOOD = fakeGm('good').slice(4); // `node "<fake-gm.mjs>" good`（sh -c に渡せる）
const BAD = fakeGm('bad').slice(4);
const gm = (script) => `cmd:node ${JSON.stringify(script)}`;
const runFake = (command, input, extra = {}) => spawnSync('/bin/sh', ['-c', command], { input, stdio: ['pipe', 'ignore', 'ignore'], ...extra });

// 1回目は不正な地図を書き、2回目以降は何もしない GM
const GM_BAD_THEN_NOTHING = file('gm-bad-then-nothing.mjs', `import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const prompt = readFileSync(0);
appendFileSync('calls', 'x');
if (readFileSync('calls', 'utf8').length === 1) spawnSync('/bin/sh', ['-c', ${JSON.stringify(BAD)}], { input: prompt, stdio: ['pipe', 'ignore', 'ignore'] });
process.exit(0);
`);
// 地図は書くが、パイプを握ったままの背景プロセス（release を待つ）を残して終わる
const GM_BG = file('gm-bg.mjs', `import { readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
const prompt = readFileSync(0);
if (process.argv[2] !== 'nomap') spawnSync('/bin/sh', ['-c', ${JSON.stringify(GOOD)}], { input: prompt, stdio: ['pipe', 'ignore', 'ignore'] });
spawn(process.execPath, [${JSON.stringify(WAITER_FILE)}, 'bg'], { stdio: ['ignore', 'inherit', 'inherit'] }).unref();
process.exit(Number(process.argv[3] || 0));
`);
// SIGTERM・SIGINT・SIGHUP を無視する孫を起こして、自分は長く待つ GM
const GC_FILE = file('stubborn-gc.mjs', `process.on('SIGTERM', () => {});\nprocess.on('SIGINT', () => {});\nprocess.on('SIGHUP', () => {});\n${WAITER}`);
const GM_STUBBORN = file('gm-stubborn.mjs', `import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
readFileSync(0);
spawn(process.execPath, [${JSON.stringify(GC_FILE)}, 'gc'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 60000));
`);
// マルチバイトを1バイトずつ途中で切って出力する GM
const GM_SPLIT = file('gm-split.mjs', `import { readFileSync } from 'node:fs';
readFileSync(0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) {
  process.stdout.write(Buffer.from([0xe3, 0x81]));
  await sleep(15);
  process.stdout.write(Buffer.from([0x82]));
  await sleep(5);
}
process.stdout.write('\\n');
await sleep(100);
process.exit(3);
`);
// とても長く出力して失敗する GM
const GM_LOUD = file('gm-loud.mjs', `import { readFileSync } from 'node:fs';
readFileSync(0);
const line = 'x'.repeat(1023) + '\\n';
for (let i = 0; i < 6000; i++) if (!process.stdout.write(line)) await new Promise((r) => process.stdout.once('drain', r));
process.stdout.write('おわり\\n', () => process.exit(3));
`);
// 少し待ってから、ふつうに地図を書く GM
const GM_LATE = file('gm-late.mjs', `import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const prompt = readFileSync(0);
await new Promise((r) => setTimeout(r, 700));
spawnSync('/bin/sh', ['-c', ${JSON.stringify(GOOD)}], { input: prompt, stdio: ['pipe', 'ignore', 'ignore'] });
`);

const marks = (dir, name) => {
  try {
    return readFileSync(join(dir, 'marks', `${name}.log`), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const starts = (dir, name) => marks(dir, name).filter((l) => l.startsWith('start')).length;
const ends = (dir, name) => marks(dir, name).filter((l) => l === 'end').length;
const release = (dir) => writeFileSync(join(dir, 'release'), 'go');

// ---- §27.1 ----

test('§27.1 GM を呼ぶたびに地図が書き換わったことを確かめる: 置いてあった古い地図は、やり直しでも受け入れない', { timeout: 120000 }, async () => {
  const root = tmp('masume-q3-stale-');
  runFake(GOOD, '', { cwd: root }); // 有効な地図と判定ファイルが置いてあるフォルダ
  assert.equal(masume(['validate', join(root, 'quest.map.json')]).code, 0, 'テストの仕掛け: 置いてある地図は有効');
  const r = await quest([WISH, '--dir', root, '--gm', 'cmd:true']); // 何もしない GM。既定のやり直し（2回）つき
  assert.equal(r.code, 2, `何も書かない GM の冒険は始まらない\n${r.all}`);
  assert.match(r.all, /E_GM/);
  assert.ok(!existsSync(join(root, '.masume', 'log.jsonl')), '古い地図で冒険の書をつくってはいけない');

  // 1回目は不正な地図を書き、やり直しの2回目は何もしない: 古い（不正な）地図のまま続けず E_GM
  const root2 = tmp('masume-q3-stale-');
  const r2 = await quest([WISH, '--dir', root2, '--gm', gm(GM_BAD_THEN_NOTHING)]);
  assert.equal(r2.code, 2, `やり直しの GM が何も書かなかったら E_GM\n${r2.all}`);
  assert.match(r2.all, /E_GM/);
  assert.doesNotMatch(r2.all, /E_INVALID_MAP/);
  assert.ok(!existsSync(join(root2, '.masume', 'log.jsonl')));
});

// ---- §27.2 ----

test('§27.2 GM のシェルが終わって1秒たってもパイプが閉じないなら、プロセスグループを SIGKILL して終了コードどおりに扱う', { timeout: 120000 }, async () => {
  const env = { MASUME_GM_TIMEOUT: '8' };
  // 地図を書いて 0 で終わった GM が、背景にプロセスを残した: 成功。背景は片づけられる
  const ok = tmp('masume-q3-bg-');
  const t0 = Date.now();
  const r = await quest([WISH, '--dir', ok, '--gm', gm(GM_BG)], env);
  assert.equal(r.code, 0, `背景プロセスが残っていても、GM の終了コード 0 どおりに扱う（時間切れにしない）\n${r.all}`);
  assert.ok(Date.now() - t0 < 7000, '時間切れ（8秒）まで待ってはいけない');
  assert.equal(view(ok).quest.id, 'MEMO');
  assert.equal(starts(ok, 'bg'), 1, 'テストの仕掛け: 背景プロセスが起動していた');
  release(ok);
  await sleep(1500);
  assert.equal(ends(ok, 'bg'), 0, '背景に残っていたプロセスが生き残っている');

  // 失敗で終わった GM も、終了コードどおり（時間切れとは言わない）
  const bad = tmp('masume-q3-bg-');
  const r3 = await quest([WISH, '--dir', bad, '--gm', `${gm(GM_BG)} nomap 3`], env);
  release(bad);
  assert.equal(r3.code, 2, r3.all);
  assert.match(r3.all, /E_GM/);
  assert.match(r3.all, /終了コード 3/, `GM の終了コード 3 がそのまま出る\n${r3.all}`);
  assert.doesNotMatch(r3.all, /時間切れ/);
});

// ---- §27.3 ----

test('§27.3 SIGINT・SIGTERM・SIGHUP では、GM のプロセスグループに SIGTERM、2秒後に SIGKILL（止まらない孫も残さない）', { timeout: 120000 }, async () => {
  const one = async (signal) => {
    const root = tmp(`masume-q3-${signal}-`);
    const run = spawnMasume(['quest', WISH, '--dir', root, '--gm', gm(GM_STUBBORN)], { cwd: root });
    try {
      await waitUntil(() => starts(root, 'gc') >= 1, { timeout: 30000, message: `GM の孫が起動する（${signal}）` });
      await sleep(300);
      run.proc.kill(signal);
      const res = await within(run.done, 20000, () => ({ code: 'timeout', all: run.output() }));
      await sleep(3000); // SIGKILL までの猶予（2秒）を見込む
      release(root);
      await sleep(1500);
      return { signal, res, alive: ends(root, 'gc') };
    } finally {
      release(root);
      run.proc.kill('SIGKILL');
    }
  };
  const results = await Promise.all(['SIGINT', 'SIGTERM', 'SIGHUP'].map(one));
  for (const { signal, res, alive } of results) {
    assert.notEqual(res.code, 'timeout', `${signal} で語り部が終わる\n${res.all}`);
    assert.equal(alive, 0, `${signal} のあとも、GM の孫（SIGTERM を無視する）が生き残っていた`);
  }
});

// ---- §27.4 ----

test('§27.4 GM の出力は UTF-8 として正しく読む（途中で切れたマルチバイトを壊さない）', { timeout: 120000 }, async () => {
  const root = tmp('masume-q3-utf8-');
  const r = await quest([WISH, '--dir', root, '--gm', gm(GM_SPLIT)]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /E_GM/);
  const log = readFileSync(join(root, 'quest.log'), 'utf8');
  assert.ok(log.includes('あ'.repeat(40)), 'quest.log に GM が出した「あ」×40 がそのまま残る');
  assert.ok(!log.includes('�'), 'quest.log のマルチバイトが壊れている（U+FFFD）');
  assert.ok(!r.all.includes('�'), '画面に出す GM の出力のマルチバイトが壊れている（U+FFFD）');
});

test('§27.4 quest.log と手元に残す GM の出力は最大 2MB', { timeout: 120000 }, async () => {
  const root = tmp('masume-q3-loud-');
  const r = await quest([WISH, '--dir', root, '--gm', gm(GM_LOUD)]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /E_GM/);
  const size = statSync(join(root, 'quest.log')).size;
  assert.ok(size > 0, 'quest.log は空ではない');
  assert.ok(size <= 2 * 1024 * 1024 + 16 * 1024, `quest.log が大きすぎる: ${size} バイト（GM の出力は約 6MB）`);
  assert.ok(r.all.length < 200 * 1024, `画面に出す量が多すぎる: ${r.all.length} 文字`);
});

// ---- §27.5 ----

test('§27.5 MASUME_GM_TIMEOUT は 1〜86400 秒に丸める（巨大な値で即時間切れにならない）', { timeout: 120000 }, async () => {
  for (const value of ['99999999999', 'Infinity']) {
    const root = tmp('masume-q3-timeout-');
    const r = await quest([WISH, '--dir', root, '--gm', gm(GM_LATE)], { MASUME_GM_TIMEOUT: value });
    assert.equal(r.code, 0, `MASUME_GM_TIMEOUT=${value} でも、700ms で終わる GM は時間切れにならない\n${r.all}`);
    assert.equal(view(root).quest.id, 'MEMO');
  }
});

// ---- §27.6 ----

test('§27.6 --force で GM が失敗したら WISH.md を元のままにする。新しい願いは冒険が生まれたときに書く', { timeout: 120000 }, async () => {
  const root = tmp('masume-q3-force-');
  const first = await quest(['最初の願い', '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(first.code, 0, first.all);
  const original = readFileSync(join(root, 'WISH.md'), 'utf8');
  assert.match(original, /最初の願い/);

  const fail = await quest(['新しい願い（GM が失敗する）', '--dir', root, '--force', '--gm', fakeGm('fail')]);
  assert.equal(fail.code, 2, fail.all);
  assert.equal(readFileSync(join(root, 'WISH.md'), 'utf8'), original, 'GM が失敗したのに WISH.md が書き換わった');

  const invalid = await quest(['新しい願い（地図が不正）', '--dir', root, '--force', '--gm', fakeGm('bad'), '--retries', '0']);
  assert.equal(invalid.code, 1, invalid.all);
  assert.equal(readFileSync(join(root, 'WISH.md'), 'utf8'), original, '地図が直らなかったのに WISH.md が書き換わった');

  const ok = await quest(['新しい願い（うまくいく）', '--dir', root, '--force', '--gm', fakeGm('good')]);
  assert.equal(ok.code, 0, ok.all);
  assert.match(readFileSync(join(root, 'WISH.md'), 'utf8'), /新しい願い（うまくいく）/, '冒険が生まれたら新しい願いが書かれる');
  assert.equal(readLog(root).filter((e) => e.type === 'wish').pop().data.text, '新しい願い（うまくいく）');
});

// ---- §27.7 ----

/** root と outside を用意し、setup でリンクなどを置いてから init する */
function initWith(setup, args = []) {
  const outside = tmp('masume-q3-outside-');
  const root = tmp('masume-q3-init-');
  setup({ root, outside });
  const r = masume(['init', '--dir', root, ...args]);
  return { r, root, outside };
}

test('§27.7 init: 外を指す・ぶら下がった symlink には書かない（書きません: <ファイル>（<理由>））', { timeout: 120000 }, () => {
  const SECRET = '外のファイル。書き換えられてはいけない\n';
  const cases = [
    {
      label: 'ぶら下がった .gitignore（外を指す）',
      file: '.gitignore',
      setup: ({ root, outside }) => symlinkSync(join(outside, 'created-by-init'), join(root, '.gitignore')),
      untouched: ({ outside }) => !existsSync(join(outside, 'created-by-init')),
    },
    {
      label: 'ぶら下がった AGENTS.md（外を指す）',
      file: 'AGENTS.md',
      setup: ({ root, outside }) => symlinkSync(join(outside, 'created-by-init'), join(root, 'AGENTS.md')),
      untouched: ({ outside }) => !existsSync(join(outside, 'created-by-init')),
    },
    {
      label: 'ぶら下がった CLAUDE.md（外を指す）',
      file: 'CLAUDE.md',
      setup: ({ root, outside }) => symlinkSync(join(outside, 'created-by-init'), join(root, 'CLAUDE.md')),
      untouched: ({ outside }) => !existsSync(join(outside, 'created-by-init')),
    },
    {
      label: 'ぶら下がった AGENTS.md（ルートの中を指すが、実体が無い）',
      file: 'AGENTS.md',
      setup: ({ root }) => symlinkSync('no-such-file.md', join(root, 'AGENTS.md')),
      untouched: ({ root }) => !existsSync(join(root, 'no-such-file.md')),
    },
    {
      label: '外にある実在の AGENTS.md を指す（--force）',
      file: 'AGENTS.md',
      args: ['--force'],
      setup: ({ root, outside }) => {
        writeFileSync(join(outside, 'agents.md'), SECRET);
        symlinkSync(join(outside, 'agents.md'), join(root, 'AGENTS.md'));
      },
      untouched: ({ outside }) => readFileSync(join(outside, 'agents.md'), 'utf8') === SECRET,
    },
    {
      label: '外にある実在の CLAUDE.md を指す（--force）',
      file: 'CLAUDE.md',
      args: ['--force'],
      setup: ({ root, outside }) => {
        writeFileSync(join(outside, 'claude.md'), SECRET);
        symlinkSync(join(outside, 'claude.md'), join(root, 'CLAUDE.md'));
      },
      untouched: ({ outside }) => readFileSync(join(outside, 'claude.md'), 'utf8') === SECRET,
    },
    {
      label: '外にある実在の .gitignore を指す',
      file: '.gitignore',
      setup: ({ root, outside }) => {
        writeFileSync(join(outside, 'gitignore'), SECRET);
        symlinkSync(join(outside, 'gitignore'), join(root, '.gitignore'));
      },
      untouched: ({ outside }) => readFileSync(join(outside, 'gitignore'), 'utf8') === SECRET,
    },
  ];
  const bad = [];
  for (const c of cases) {
    const ctx = initWith(c.setup, c.args);
    const problems = [];
    if (ctx.r.code !== 0) problems.push(`終了コード ${ctx.r.code}`);
    if (!c.untouched(ctx)) problems.push('symlink の先に書いてしまった');
    if (!new RegExp(`書きません: ${c.file.replace('.', '\\.')}（.+）`).test(ctx.r.out)) problems.push('「書きません: <ファイル>（<理由>）」の行が無い');
    if (problems.length) bad.push(`${c.label}: ${problems.join('、')}\n    ${ctx.r.all.trim().split('\n').join('\n    ')}`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
});

test('§27.7 init: 実体がルートの中にある symlink には書く（symlink はそのまま）', { timeout: 120000 }, () => {
  const { r, root } = initWith(({ root }) => {
    mkdirSync(join(root, 'real'));
    writeFileSync(join(root, 'real', 'agents.real.md'), '古い AGENTS.md\n');
    writeFileSync(join(root, 'real', 'gitignore.real'), 'node_modules/\n');
    symlinkSync(join('real', 'agents.real.md'), join(root, 'AGENTS.md'));
    symlinkSync(join('real', 'gitignore.real'), join(root, '.gitignore'));
  }, ['--force']);
  assert.equal(r.code, 0, r.all);
  assert.match(readFileSync(join(root, 'real', 'agents.real.md'), 'utf8'), /マスメ/, 'ルートの中の実体には書く（--force）');
  const ignore = readFileSync(join(root, 'real', 'gitignore.real'), 'utf8');
  assert.ok(ignore.includes('node_modules/') && ignore.includes('.masume/lock'), `ルートの中の .gitignore の実体には足す:\n${ignore}`);
  assert.ok(lstatSync(join(root, 'AGENTS.md')).isSymbolicLink(), 'AGENTS.md は symlink のまま');
  assert.ok(lstatSync(join(root, '.gitignore')).isSymbolicLink(), '.gitignore は symlink のまま');
  assert.ok(existsSync(join(root, 'CLAUDE.md')), 'CLAUDE.md は普通に書く');
});

test('§27.7 init: CLAUDE.md が AGENTS.md と同じ実体なら CLAUDE.md は書かない（規則を消さない）', { timeout: 120000 }, () => {
  const { r, root } = initWith(({ root }) => symlinkSync('AGENTS.md', join(root, 'CLAUDE.md')), ['--force']);
  assert.equal(r.code, 0, r.all);
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes('--no-boss') && agents.includes('縄張り'), `AGENTS.md の規則が CLAUDE.md の中身で消された:\n${agents.slice(0, 200)}`);
  assert.doesNotMatch(agents, /^@AGENTS\.md\s*$/m);
  assert.ok(lstatSync(join(root, 'CLAUDE.md')).isSymbolicLink(), 'CLAUDE.md は symlink のまま');
  const line = r.out.split('\n').find((l) => l.includes('CLAUDE.md')) ?? '';
  assert.match(line, /書きません|そのまま/, `CLAUDE.md を書かなかったと知らせる行が要る:\n${r.out}`);
});

// ---- §27.8 ----

test('§27.8 AGENTS.md に書くコマンドは、パスに $ " ` があっても、そのまま貼って動く', { timeout: 120000 }, () => {
  const parent = join(tmp('masume-q3-weird-'), 'we$ird "q" `echo BAD` dir');
  const repo = join(parent, 'repo');
  mkdirSync(join(repo, 'docs'), { recursive: true });
  for (const name of ['bin', 'src', 'package.json']) cpSync(join(ROOT, name), join(repo, name), { recursive: true });
  cpSync(join(ROOT, 'docs', 'RULEBOOK.md'), join(repo, 'docs', 'RULEBOOK.md'));
  const game = join(parent, 'game $HOME "x"');
  mkdirSync(game, { recursive: true });
  setupToy(game, { withB3: true });
  assert.equal(masume(['new', 'toy.map.json'], { cwd: game }).code, 0);

  const init = spawnSync(process.execPath, [join(repo, 'bin', 'masume.js'), 'init', '--dir', game], {
    cwd: tmp('masume-q3-cwd-'), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' },
  });
  assert.equal(init.status, 0, init.stdout + init.stderr);
  const lines = readFileSync(join(game, 'AGENTS.md'), 'utf8').split('\n').map((l) => l.trim())
    .filter((l) => l.startsWith('node ') && l.includes('masume.js'))
    .map((l) => l.replaceAll('<ID>', 'a'));
  const find = (re) => lines.find((l) => re.test(l));
  const brief = find(/\bbrief a\b/);
  const check = find(/\bcheck a --as a$/);
  const checkNoBoss = find(/\bcheck a --as a --no-boss$/);
  const note = find(/\bnote a\b/);
  for (const [name, line] of Object.entries({ brief, check, checkNoBoss, note })) assert.ok(line, `AGENTS.md に ${name} のコマンドの行がある\n${lines.join('\n')}`);

  flag(game, 'A1');
  flag(game, 'A2');
  const run = (line) => spawnSync('/bin/sh', ['-c', line], { cwd: game, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' } });
  const b = run(brief);
  assert.equal(b.status, 0, `そのまま貼ったら動かない:\n${brief}\n${b.stdout}${b.stderr}`);
  assert.match(b.stdout, /剣をとぐ/);
  const c1 = run(check);
  assert.equal(c1.status, 0, `そのまま貼ったら動かない:\n${check}\n${c1.stdout}${c1.stderr}`);
  assert.match(c1.stdout, /判定成功/);
  const c2 = run(checkNoBoss);
  assert.equal(c2.status, 0, `そのまま貼ったら動かない:\n${checkNoBoss}\n${c2.stdout}${c2.stderr}`);
  assert.equal(char(view(game), 'a').at, 'A3');
  const n = run(note);
  assert.equal(n.status, 0, `そのまま貼ったら動かない:\n${note}\n${n.stdout}${n.stderr}`);
  assert.ok(readLog(game).some((e) => e.type === 'note' && e.actor === 'a'));
});
