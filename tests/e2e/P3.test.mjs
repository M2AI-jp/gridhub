// P3「出撃の後始末」— CONTRACTS §26（第4章・総点検の修理）。
// EPIPE・二重起動の E_BUSY・未封印のマス・止めたあとに残る孫・プロンプトを書く順番・コマンドの引用。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, rmSync, cpSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, BIN, tmp, masume, masumeEnv, spawnMasume, newToy, setupToy, toyMap, flag, view, char, readLog,
  fakeAgent, waitUntil,
} from '../helpers3.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 時間切れつきで待つ（タイマーを残さない）
function within(promise, ms, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((res) => { timer = setTimeout(() => res(onTimeout()), ms); })]).finally(() => clearTimeout(timer));
}

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
const FAKES = tmp('masume-p3-fakes-');
const file = (name, text) => {
  const f = join(FAKES, name);
  writeFileSync(f, text);
  return f;
};
const WAITER_FILE = file('waiter.mjs', WAITER);
// SIGTERM・SIGINT・SIGHUP を無視する孫
const GC_FILE = file('stubborn-gc.mjs', `process.on('SIGTERM', () => {});\nprocess.on('SIGINT', () => {});\nprocess.on('SIGHUP', () => {});\n${WAITER}`);
// 孫を1人起こして（同じプロセスグループ・パイプは持たせない）、自分は長く待つ。SIGTERM では普通に死ぬ。
const STUBBORN_AGENT = file('stubborn-agent.mjs', `import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
try { readFileSync(0); } catch {}
spawn(process.execPath, [${JSON.stringify(GC_FILE)}, 'gc'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 60000));
`);
const stubbornAgent = `cmd:node ${JSON.stringify(STUBBORN_AGENT)}`;

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

function pairs(dir) {
  const log = readLog(dir);
  return log
    .filter((e) => e.type === 'sortie')
    .map((s) => ({ s, r: log.find((e) => e.type === 'returned' && e.data.sortie === s.seq) }));
}

/** G1 の判定が script になっている、新しく始めたおもちゃの冒険 */
function bossToy(run, seal) {
  const dir = tmp('masume-p3-boss-');
  const map = toyMap();
  map.nodes.G1.check = { kind: 'cmd', run, seal };
  setupToy(dir, { withB3: true, map });
  mkdirSync(join(dir, 'checks'), { recursive: true });
  writeFileSync(join(dir, 'checks', 'waiter.mjs'), WAITER);
  writeFileSync(join(dir, 'checks', 'boss.mjs'),
    `import { spawn } from 'node:child_process';\nspawn(process.execPath, ['checks/waiter.mjs', 'desc'], { stdio: 'ignore' });\nawait import('./waiter.mjs');\n`);
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return dir;
}

// ---- §26.1 ----

test('§26.1 stdout が閉じても（| head -1）落ちず、出撃中の帰還を記録して最後まで巡回する', { timeout: 180000 }, async () => {
  const dir = newToy({ withB3: true });
  flag(dir, 'G1');
  flag(dir, 'FIN');
  const exitFile = join(tmp('masume-p3-exit-'), 'code');
  const script = '( node "$1" party --dir "$2" --agent "$3" --parallel 2; echo $? > "$4" ) | head -n 1';
  const p = spawn('/bin/sh', ['-c', script, 'sh', BIN, dir, fakeAgent('slow', 500), exitFile], {
    env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let err = '';
  p.stdout.on('data', (d) => (out += d));
  p.stderr.on('data', (d) => (err += d));
  await new Promise((res) => p.on('close', res));

  const code = Number(readFileSync(exitFile, 'utf8').trim());
  assert.equal(out.trim().split('\n').length, 1, 'head -n 1 は1行だけ受け取る');
  assert.doesNotMatch(err, /EPIPE/, `EPIPE で落ちた:\n${err.slice(0, 500)}`);
  assert.equal(code, 2, `出力先が閉じても最後まで巡回して、ハンコ待ちで止まる（終了コード ${code}）\n${err.slice(0, 500)}`);
  const ps = pairs(dir);
  assert.equal(ps.length, 7, `a は4回・b は3回の出撃（${ps.length}）`);
  for (const { s, r } of ps) {
    assert.ok(r, `seq ${s.seq} の出撃の帰還が記録される`);
    assert.equal(r.data.code, 0);
    assert.equal(r.data.advanced, true);
  }
  assert.equal(view(dir).nodes.G1.state, 'cleared', 'ボス戦もした');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

// ---- §26.2 ----

test('§26.2 sortie が E_BUSY（ほかの指揮役が先に出撃させた）なら、そのキャラを外して巡回を続ける。自分の出撃は巻き添えにしない', { timeout: 180000 }, async () => {
  const dir = newToy();
  const lock = join(dir, '.masume', 'lock');
  // 書き込みのロックを握っておく。軍師は a の出撃の記録でロックを待ち、
  // その間に別の指揮役が b を先に出撃させる。ロックを放すと、軍師の b の出撃の記録だけが E_BUSY になる
  writeFileSync(lock, JSON.stringify({ pid: 1, actor: 'test', ts: new Date().toISOString() }), { flag: 'wx' });
  let party;
  let other;
  try {
    party = spawnMasume(['party', '--dir', dir, '--agent', fakeAgent('slow', 2000), '--parallel', '2', '--rounds', '2'], { cwd: dir });
    await waitUntil(() => /出撃準備/.test(party.output()), { timeout: 15000, message: '軍師が巡回を始める' });
    await sleep(800);
    other = spawnMasume(['sortie', 'b', '--agent', 'other', '--dir', dir], { cwd: dir });
    await sleep(1000);
  } finally {
    rmSync(lock, { force: true });
  }
  const o = await other.done;
  assert.equal(o.code, 0, `テストの仕掛け: 別の指揮役の出撃の記録が先に通るはず\n${o.all}`);
  const r = await within(party.done, 90000, () => ({ code: 'timeout', all: party.output() }));
  assert.notEqual(r.code, 'timeout', r.all);
  assert.equal(r.code, 2, r.all);
  assert.doesNotMatch(r.all, /^\[E_BUSY\]/m, `E_BUSY で軍師が落ちた:\n${r.all}`);

  const ps = pairs(dir);
  const mine = ps.filter(({ s }) => s.data.character === 'a');
  assert.ok(mine.length >= 1, `a は出撃した\n${r.all}`);
  for (const { s, r: ret } of mine) {
    assert.ok(ret, `a の出撃 seq ${s.seq} の帰還が記録される`);
    assert.equal(ret.data.code, 0, `a の出撃が巻き添えで止められた（code ${ret.data.code}）\n${r.all}`);
  }
  assert.equal(mine[0].r.data.advanced, true, 'a は進んだ');
  const theirs = ps.filter(({ s }) => s.data.character === 'b');
  assert.equal(theirs.length, 1, '別の指揮役の b の出撃だけが残っている（軍師は b を出撃させない）');
  assert.equal(theirs[0].r, undefined);
  const back = masume(['return', 'b', '--sortie', String(theirs[0].s.seq), '--code', '130', '--dir', dir]);
  assert.equal(back.code, 0, back.all);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

test('§26.2 パーティを二重に起動しても、どちらも E_BUSY で落ちない', { timeout: 180000 }, async () => {
  const dir = newToy({ withB3: true });
  flag(dir, 'G1');
  flag(dir, 'FIN');
  const lock = join(dir, '.masume', 'lock');
  writeFileSync(lock, JSON.stringify({ pid: 1, actor: 'test', ts: new Date().toISOString() }), { flag: 'wx' });
  let one;
  let two;
  try {
    const args = ['party', '--dir', dir, '--agent', fakeAgent('good'), '--parallel', '2'];
    one = spawnMasume(args, { cwd: dir });
    two = spawnMasume(args, { cwd: dir });
    // 2つとも、同じ候補（a）を出撃させようとして、ロックの前で待つ
    await waitUntil(() => /出撃準備/.test(one.output()) && /出撃準備/.test(two.output()), { timeout: 15000, message: '2つの軍師が巡回を始める' });
    await sleep(1200);
  } finally {
    rmSync(lock, { force: true });
  }
  const done = await Promise.all([one, two].map((p) => within(p.done, 120000, () => ({ code: 'timeout', all: p.output() }))));
  for (const r of done) {
    assert.ok([0, 2].includes(r.code), `軍師は普通に止まる（終了コード ${r.code}）\n${r.all}`);
    assert.doesNotMatch(r.all, /^\[E_BUSY\]/m, `E_BUSY で軍師が落ちた:\n${r.all}`);
  }
  for (const { s, r } of pairs(dir)) {
    assert.ok(r, `seq ${s.seq} の出撃の帰還が記録される`);
    assert.notEqual(r.data.code, 130, `seq ${s.seq} の出撃が中断された`);
  }
  const v = view(dir);
  assert.equal(char(v, 'a').at, 'FIN');
  assert.equal(char(v, 'b').at, 'FIN');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

// ---- §26.3 ----

test('§26.3 現在のマスが未封印のキャラクターは出撃させず、止まる理由に 未封印: <マスID> と seal の案内を出す', { timeout: 180000 }, async () => {
  const dir = tmp('masume-p3-unsealed-');
  const map = toyMap();
  map.nodes.B1.check = { kind: 'cmd', run: 'node checks/b1.mjs', seal: ['checks/b1.mjs'] }; // 判定ファイルをまだ置いていない
  setupToy(dir, { withB3: true, map });
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 0);
  assert.equal(view(dir).nodes.B1.sealed, false, 'テストの仕掛け: B1 は未封印');

  const r = await masumeEnv(['party', '--dir', dir, '--agent', fakeAgent('good'), '--rounds', '10'], { cwd: dir });
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /未封印: B1/, `止まる理由に「未封印: B1」が出る\n${r.all}`);
  assert.match(r.all, /seal B1/, `封印の案内（masume seal B1）が出る\n${r.all}`);
  assert.doesNotMatch(r.all, /迷子/, '未封印のマスに出撃して迷子になってはいけない');
  const forB = readLog(dir).filter((e) => e.type === 'sortie' && e.data.character === 'b');
  assert.equal(forB.length, 0, `未封印のマスの b を出撃させてはいけない（${forB.length}回出撃した）`);
  assert.notEqual(char(view(dir), 'a').at, 'A1', '封印の済んだ a は進む');
});

// ---- §26.4 ----

test('§26.4 タイムアウトで止めるとき、SIGTERM を無視する孫も残さない', { timeout: 120000 }, async () => {
  const dir = newToy();
  const r = await masumeEnv(['party', '--dir', dir, '--agent', stubbornAgent, '--only', 'a', '--rounds', '1'], {
    cwd: dir, env: { MASUME_SORTIE_TIMEOUT: '2' },
  });
  try {
    assert.equal(r.code, 2, r.all);
    assert.equal(readLog(dir).filter((e) => e.type === 'returned').pop().data.code, 124, 'タイムアウト');
    assert.equal(starts(dir, 'gc'), 1, 'テストの仕掛け: 孫が起動していた');
    await sleep(500);
    release(dir);
    await sleep(1500);
    assert.equal(ends(dir, 'gc'), 0, `タイムアウトのあとも、SIGTERM を無視する孫が生きていた（${marks(dir, 'gc').join(' / ')}）`);
  } finally {
    release(dir);
  }
});

test('§26.4 SIGINT で止めるときも、SIGTERM を無視する孫を残さない', { timeout: 120000 }, async () => {
  const dir = newToy();
  const run = spawnMasume(['party', '--dir', dir, '--agent', stubbornAgent, '--only', 'a', '--parallel', '1'], { cwd: dir });
  try {
    await waitUntil(() => starts(dir, 'gc') >= 1, { timeout: 20000, message: '孫が起動する' });
    await sleep(300);
    run.proc.kill('SIGINT');
    const res = await within(run.done, 20000, () => ({ code: 'timeout', all: run.output() }));
    assert.equal(res.code, 130, res.all);
    await sleep(500);
    release(dir);
    await sleep(1500);
    assert.equal(ends(dir, 'gc'), 0, `SIGINT のあとも、SIGTERM を無視する孫が生きていた（${marks(dir, 'gc').join(' / ')}）`);
  } finally {
    release(dir);
    run.proc.kill('SIGKILL');
  }
});

test('§26.4 ボス戦の判定中に SIGINT を受けたら、その判定（と子孫）も止める', { timeout: 120000 }, async () => {
  const dir = bossToy('node checks/boss.mjs boss', ['checks/boss.mjs', 'checks/waiter.mjs']);
  const run = spawnMasume(['party', '--dir', dir, '--agent', fakeAgent('good'), '--parallel', '2'], { cwd: dir });
  try {
    await waitUntil(() => starts(dir, 'boss') >= 1 && starts(dir, 'desc') >= 1, { timeout: 60000, message: 'ボス戦の判定が始まる' });
    await sleep(300);
    run.proc.kill('SIGINT');
    const res = await within(run.done, 20000, () => ({ code: 'timeout', all: run.output() }));
    assert.equal(res.code, 130, res.all);
    await sleep(500);
    release(dir);
    await sleep(1500);
    assert.equal(ends(dir, 'boss'), 0, `SIGINT のあとも、ボス戦の判定が生きていた（${marks(dir, 'boss').join(' / ')}）`);
    assert.equal(ends(dir, 'desc'), 0, `SIGINT のあとも、判定の子孫が生きていた（${marks(dir, 'desc').join(' / ')}）`);
    assert.ok(!readLog(dir).some((e) => e.type === 'gate_cleared'), '止めた判定でゲートを突破してはいけない');
  } finally {
    release(dir);
    run.proc.kill('SIGKILL');
  }
});

// ---- §26.5 ----

test('§26.5 プロンプトのファイルは sortie を記録する前に書く（書けなくても、帰還のない出撃が残らない）', { timeout: 120000 }, async (t) => {
  const dir = newToy();
  const sandbox = tmp('masume-p3-tmp-');
  let hit = false;
  // 軍師がプロンプト置き場（TMPDIR の下の masume-party-*）を作った直後に、書き込めなくする
  const watcher = setInterval(() => {
    try {
      for (const name of readdirSync(sandbox)) {
        if (name.startsWith('masume-party-')) {
          chmodSync(join(sandbox, name), 0o555);
          hit = true;
        }
      }
    } catch {}
  }, 2);
  let r;
  try {
    r = await masumeEnv(['party', '--dir', dir, '--agent', fakeAgent('good'), '--only', 'a', '--rounds', '1'], { cwd: dir, env: { TMPDIR: sandbox } });
  } finally {
    clearInterval(watcher);
    try {
      for (const name of readdirSync(sandbox)) chmodSync(join(sandbox, name), 0o755);
    } catch {}
  }
  if (!hit) {
    t.diagnostic('プロンプト置き場が TMPDIR の下に作られなかったので、この判定は何も確かめていない');
    return;
  }
  const dangling = pairs(dir).filter(({ r: ret }) => !ret);
  assert.equal(dangling.length, 0, `プロンプトを書けなかったのに、帰還のない出撃が記録に残った（seq ${dangling.map(({ s }) => s.seq).join(',')}）\n${r.all}`);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

// ---- §26.6 ----

/** パスに $ " ` と空白を含む場所に、リポジトリ（bin・src）のコピーとゲームの置き場所を作る */
function weirdPlace() {
  const parent = join(tmp('masume-p3-weird-'), 'we$ird "q" `echo BAD` dir');
  const repo = join(parent, 'repo');
  mkdirSync(join(repo, 'docs'), { recursive: true });
  for (const name of ['bin', 'src', 'package.json']) cpSync(join(ROOT, name), join(repo, name), { recursive: true });
  cpSync(join(ROOT, 'docs', 'RULEBOOK.md'), join(repo, 'docs', 'RULEBOOK.md'));
  return { parent, repo, bin: join(repo, 'bin', 'masume.js'), game: join(parent, 'game $HOME "x"') };
}

test('§26.6 プロンプトに書くコマンドは、パスに $ " ` があっても、そのまま貼って動く', { timeout: 180000 }, async () => {
  const { bin, game } = weirdPlace();
  mkdirSync(game, { recursive: true });
  setupToy(game, { withB3: true });
  assert.equal(masume(['new', 'toy.map.json'], { cwd: game }).code, 0);

  const p = spawnSync(process.execPath, [bin, 'party', '--dir', game, '--agent', fakeAgent('record'), '--only', 'a', '--rounds', '1'], {
    cwd: tmp('masume-p3-cwd-'), encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' },
  });
  assert.equal(p.status, 2, p.stdout + p.stderr);
  const { prompt } = JSON.parse(readFileSync(join(game, 'record-a-1.json'), 'utf8'));
  const commands = prompt.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('node ') && l.includes('masume.js'));
  const declare = commands.find((l) => /\bcheck a --as a --no-boss\b/.test(l));
  const note = commands.find((l) => /\bnote a\b/.test(l));
  assert.ok(declare, `プロンプトに宣言判定のコマンドの行がある\n${commands.join('\n')}`);
  assert.ok(note, `プロンプトに日誌のコマンドの行がある\n${commands.join('\n')}`);

  const cwd = tmp('masume-p3-elsewhere-');
  const run = (line) => spawnSync('/bin/sh', ['-c', line], { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' } });
  for (const line of commands.filter((l) => /\b(brief|note) a\b/.test(l))) {
    const r = run(line);
    assert.equal(r.status, 0, `そのまま貼ったら動かない:\n${line}\n${r.stdout}${r.stderr}`);
  }
  flag(game, 'A2'); // A1 は出撃したエージェントが越えた。いまは A2
  const d = run(declare);
  assert.equal(d.status, 0, `そのまま貼ったら動かない:\n${declare}\n${d.stdout}${d.stderr}`);
  assert.match(d.stdout, /判定成功/);
  assert.equal(char(view(game), 'a').at, 'A3', '宣言判定のコマンドで1マス進んだ');
  assert.ok(readLog(game).some((e) => e.type === 'note' && e.actor === 'a'), '日誌のコマンドで日誌が書けた');
});
