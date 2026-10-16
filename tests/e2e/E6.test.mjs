// E6「判定の誠実さ」— CONTRACTS §23（第4章: 総点検の修理）。
//  1. 封印は判定コマンドの直前（マスごと）と、記録の直前（ロックの中）にも確かめる
//  2. ゲートの MASUME_BLAME は、切り詰める前の出力全体から拾う
//  3. 判定の成否はシェルの終了コードで決める（背景の子がパイプを握っていても時間切れにしない）
//  4. 判定に NODE_TEST_CONTEXT を渡さない
//  5. check / stamp（ボス戦を含む）が SIGINT・SIGTERM・SIGHUP を受けたら判定の子孫を SIGKILL して 130・143・129 で終わる
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmp, masume, masumeAsync, spawnMasume, view, char, readLog, waitUntil } from '../helpers3.mjs';

// ---- この判定だけで使う小道具 ----

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const cmd = (run, seal) => ({ kind: 'cmd', run, ...(seal ? { seal } : {}) });

/** ひとりの冒険: a が T1 → T2 → GOAL（あがりのゲートはメンバー1人でよい） */
function soloMap({ t1, t2 = cmd('true'), goal = cmd('true') }) {
  return {
    masume: 1,
    quest: { id: 'SOLO', title: 'ひとりの冒険', goal: 'GOAL' },
    characters: [{ id: 'a', name: 'ア', kind: 'agent', job: 'warrior', color: 'yellow', path: ['T1', 'T2', 'GOAL'] }],
    nodes: {
      T1: { type: 'task', title: 'ひとつめ', check: t1 },
      T2: { type: 'task', title: 'ふたつめ', check: t2 },
      GOAL: { type: 'gate', title: 'あがり', check: goal },
    },
  };
}

/** ふたりの冒険: a と b が G で合流し、GOAL であがる */
function duoMap({ gate, a1 = cmd('true'), b1 = cmd('true'), goal = cmd('true') }) {
  return {
    masume: 1,
    quest: { id: 'DUO', title: 'ふたりの冒険', goal: 'GOAL' },
    characters: [
      { id: 'a', name: 'ア', kind: 'agent', job: 'warrior', color: 'yellow', path: ['A1', 'G', 'GOAL'] },
      { id: 'b', name: 'ビ', kind: 'agent', job: 'mage', color: 'blue', path: ['B1', 'G', 'GOAL'] },
    ],
    nodes: {
      A1: { type: 'task', title: 'a1', check: a1 },
      B1: { type: 'task', title: 'b1', check: b1 },
      G: { type: 'gate', title: '合流', check: gate },
      GOAL: { type: 'gate', title: 'あがり', check: goal },
    },
  };
}

/** a（エージェント）と h（人間）が G で合流する。h は H1 のハンコで進む */
function stampMap({ gate }) {
  return {
    masume: 1,
    quest: { id: 'STP', title: 'ハンコの冒険', goal: 'GOAL' },
    characters: [
      { id: 'a', name: 'ア', kind: 'agent', job: 'warrior', color: 'yellow', path: ['A1', 'G', 'GOAL'] },
      { id: 'h', name: 'ヒ', kind: 'human', job: 'hero', color: 'pink', path: ['H1', 'G', 'GOAL'] },
    ],
    nodes: {
      A1: { type: 'task', title: 'a1', check: cmd('true') },
      H1: { type: 'task', title: 'ハンコ', check: { kind: 'stamp', by: 'h' } },
      G: { type: 'gate', title: '合流', check: gate },
      GOAL: { type: 'gate', title: 'あがり', check: cmd('true') },
    },
  };
}

/** files を置いて冒険を始める */
function startGame(map, files = {}) {
  const dir = tmp('masume-e6-');
  mkdirSync(join(dir, 'flags'), { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), body);
  }
  writeFileSync(join(dir, 'game.map.json'), JSON.stringify(map, null, 2));
  const r = masume(['new', 'game.map.json'], { cwd: dir });
  assert.equal(r.code, 0, `new に失敗: ${r.all}`);
  return dir;
}

const check = (dir, who, extra = [], env = {}) => masume(['check', who, '--dir', dir, '--as', who, ...extra], { env });
const eventsOf = (dir, ...types) => readLog(dir).filter((e) => types.includes(e.type));

/**
 * 封印ファイル target を書き換え、delayMs 後に元へ戻す（戻す係は独自のプロセスグループで生き残る）。
 * 判定コマンドの中から呼ぶ。条件は呼び出し側の if で決める。
 */
const TAMPER_LIB = `import { readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
export function tamper(target, delayMs = 5000) {
  const original = readFileSync(target, 'utf8');
  writeFileSync(target, original + '// こっそり書き換えた\\n');
  const restore = 'setTimeout(() => require("node:fs").writeFileSync(' + JSON.stringify(target) + ', ' + JSON.stringify(original) + '), ' + delayMs + ')';
  spawn(process.execPath, ['-e', restore], { detached: true, stdio: 'ignore', cwd: process.cwd() }).unref();
}
`;

// ---------------------------------------------------------------------------
// §23.1 封印は判定の直前（マスごと）と、記録の直前（ロックの中）にも確かめる
// ---------------------------------------------------------------------------

test('§23.1 前のマスの判定が後ろのマスの封印ファイルを書き換えたら、後ろのマスを走らせる前に見つかる', () => {
  const dir = startGame(
    soloMap({
      t1: cmd('node checks/t1.mjs', ['checks/t1.mjs']),
      t2: cmd('node checks/t2.mjs', ['checks/t2.mjs']),
      goal: cmd('node checks/goal.mjs', ['checks/goal.mjs']),
    }),
    {
      'checks/tamper.mjs': TAMPER_LIB,
      // flags/tamper があるときだけ、T2 の封印ファイルを書き換えて（5秒後に戻す）自分は成功する
      'checks/t1.mjs': `import { existsSync } from 'node:fs';
import { tamper } from './tamper.mjs';
if (existsSync('flags/tamper')) tamper('checks/t2.mjs');
console.log('t1 ok');
`,
      'checks/t2.mjs': "console.log('t2 ok');\n",
      'checks/goal.mjs': "console.log('goal ok');\n",
    },
  );
  const first = check(dir, 'a');
  assert.equal(first.code, 0, first.all);
  assert.equal(char(view(dir), 'a').at, 'T2');
  const events = readLog(dir).length;

  writeFileSync(join(dir, 'flags', 'tamper'), '1');
  const r = check(dir, 'a'); // 累積判定: T1 → T2。T1 が T2 の封印ファイルを書き換える
  assert.equal(r.code, 2, `T2 を走らせる直前に封印破りが見つかる（終了コード2）:\n${r.all}`);
  assert.match(r.all, /E_SEAL_BROKEN/);
  assert.match(r.all, /封印が破れています/);
  const after = readLog(dir);
  assert.equal(after.length, events + 1, '記録は seal_broken の1件だけ');
  const broken = after.at(-1);
  assert.equal(broken.type, 'seal_broken');
  assert.equal(broken.data.node, 'T2');
  assert.equal(broken.data.files[0].path, 'checks/t2.mjs');
  assert.equal(eventsOf(dir, 'check_passed').length, 1, '2回目の判定は成功として記録されない');
  const a = char(view(dir), 'a');
  assert.deepEqual([a.at, a.clears, a.fails], ['T2', 1, 0], '盤面は動かない');
  assert.equal(view(dir).nodes.T2.seal_broken, true);
});

test('§23.1 判定コマンドが自分の封印ファイルを書き換えて遅れて戻しても、記録の直前に見つかる', () => {
  const dir = startGame(
    soloMap({
      t1: cmd('node checks/t1.mjs', ['checks/t1.mjs']),
      t2: cmd('node checks/t2.mjs', ['checks/t2.mjs']),
      goal: cmd('node checks/goal.mjs', ['checks/goal.mjs']),
    }),
    {
      'checks/tamper.mjs': TAMPER_LIB,
      'checks/t1.mjs': "console.log('t1 ok');\n",
      // flags/tamper があるときだけ、実行中の自分自身（T2 の封印ファイル）を書き換え、5秒後に戻す
      'checks/t2.mjs': `import { existsSync } from 'node:fs';
import { tamper } from './tamper.mjs';
if (existsSync('flags/tamper')) tamper('checks/t2.mjs');
console.log('t2 ok');
`,
      'checks/goal.mjs': "console.log('goal ok');\n",
    },
  );
  assert.equal(check(dir, 'a').code, 0); // T1 を通る
  const events = readLog(dir).length;
  writeFileSync(join(dir, 'flags', 'tamper'), '1');
  const r = check(dir, 'a');
  assert.equal(r.code, 2, `記録の直前（ロックの中）で封印破りが見つかる（終了コード2）:\n${r.all}`);
  assert.match(r.all, /E_SEAL_BROKEN/);
  const after = readLog(dir);
  assert.equal(after.length, events + 1);
  assert.equal(after.at(-1).type, 'seal_broken');
  assert.equal(after.at(-1).data.node, 'T2');
  assert.equal(eventsOf(dir, 'check_passed').length, 1, '書き換えながら通った判定は記録されない');
  assert.equal(char(view(dir), 'a').at, 'T2');
});

test('§23.1 ボス戦の判定がゲートの封印ファイルを書き換えたら、突破は記録されない', () => {
  const dir = startGame(
    duoMap({
      gate: cmd('node checks/gate.mjs', ['checks/gate.mjs']),
    }),
    {
      'checks/tamper.mjs': TAMPER_LIB,
      'checks/gate.mjs': `import { tamper } from './tamper.mjs';
tamper('checks/gate.mjs');
console.log('gate ok');
`,
    },
  );
  assert.equal(check(dir, 'a').code, 0);
  const events = readLog(dir).length;
  const r = check(dir, 'b'); // b が着いて G が ready になり、そのままボス戦
  assert.equal(r.code, 2, `ボス戦の記録の直前に封印破りが見つかる:\n${r.all}`);
  assert.match(r.all, /E_SEAL_BROKEN/);
  const added = readLog(dir).slice(events).map((e) => e.type);
  assert.equal(added.at(-1), 'seal_broken', `最後に記録されるのは封印破り（実際 ${added.join(',')}）`);
  assert.equal(eventsOf(dir, 'gate_cleared', 'gate_failed').length, 0, '突破も敗北も記録されない');
  const v = view(dir);
  assert.equal(char(v, 'a').status, 'waiting');
  assert.equal(char(v, 'b').status, 'waiting');
  assert.equal(v.nodes.G.state, 'ready');
});

// ---------------------------------------------------------------------------
// §23.2 ゲートの MASUME_BLAME は、切り詰める前の出力全体から拾う
// ---------------------------------------------------------------------------

test('§23.2 150KB の出力のあとの MASUME_BLAME でも、責任者だけが差し戻される', () => {
  const dir = startGame(
    duoMap({
      gate: cmd('node checks/gate.mjs', ['checks/gate.mjs']),
    }),
    {
      'checks/gate.mjs': `process.stdout.write(('x'.repeat(99) + '\\n').repeat(1500)); // 150,000 バイト
console.log('MASUME_BLAME: b');
process.exitCode = 1;
`,
    },
  );
  assert.equal(check(dir, 'a').code, 0);
  const r = check(dir, 'b');
  assert.equal(r.code, 1, r.all);
  const ev = eventsOf(dir, 'gate_failed').pop();
  assert.ok(ev, 'gate_failed が記録される');
  assert.deepEqual(ev.data.blamed, ['b'], '長い出力のあとの MASUME_BLAME も拾う（全滅にしない）');
  assert.match(r.out, /差し戻し/);
  assert.doesNotMatch(r.out, /全滅/);
  const v = view(dir);
  assert.equal(char(v, 'a').status, 'waiting', 'a は責任なし: 待機のまま');
  assert.equal(char(v, 'b').at, 'B1', 'b は戻される');
  assert.equal(char(v, 'a').fails, 0);
  assert.equal(char(v, 'b').fails, 1);
  // 保存する出力は従来どおり100KBまで
  const size = statSync(join(dir, '.masume', ev.data.output)).size;
  assert.ok(size <= 100 * 1024, `保存する出力は100KBまで（実際 ${size} バイト）`);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

// ---------------------------------------------------------------------------
// §23.3 判定の成否はシェルの終了コードで決める
// ---------------------------------------------------------------------------

/** 4つの判定を同時に走らせる（最初に使われたときに1回だけ） */
let backgroundRuns;
function backgroundChildRuns() {
  backgroundRuns ??= (async () => {
    const solo = (run, env) => {
      const dir = startGame(soloMap({ t1: cmd(run) }));
      const started = Date.now();
      return masumeAsync(['check', 'a', '--dir', dir, '--as', 'a'], { env }).then((r) => ({ ...r, dir, ms: Date.now() - started }));
    };
    const [ok, ng, late, slow] = await Promise.all([
      solo('sleep 30 & exit 0', { MASUME_CHECK_TIMEOUT: '5' }), // 背景の sleep がパイプを握ったまま、シェルは成功で終わる
      solo('sleep 30 & exit 3', { MASUME_CHECK_TIMEOUT: '5' }), // 同じく、シェルは 3 で終わる
      solo('(sleep 3; echo late > flags/late) & exit 0', { MASUME_CHECK_TIMEOUT: '60' }), // 遅れて書く背景の子
      solo('sleep 30', { MASUME_CHECK_TIMEOUT: '2' }), // 本当に長い判定
    ]);
    return { ok, ng, late, slow };
  })();
  return backgroundRuns;
}

test('§23.3 背景の子がパイプを握っていても、シェルが成功で終われば判定成功（時間切れにしない）', async () => {
  const { ok } = await backgroundChildRuns();
  assert.equal(ok.code, 0, `シェルが成功で終わったので判定成功:\n${ok.all}`);
  assert.match(ok.out, /判定成功/);
  assert.equal(char(view(ok.dir), 'a').at, 'T2');
});

test('§23.3 背景の子がパイプを握っていても、シェルの終了コードどおりに失敗として記録する', async () => {
  const { ng } = await backgroundChildRuns();
  assert.equal(ng.code, 1, `シェルが 3 で終わったので判定失敗:\n${ng.all}`);
  assert.match(ng.out, /判定失敗/);
  const failed = eventsOf(ng.dir, 'check_failed').pop();
  assert.ok(failed, 'check_failed が記録される');
  const output = readFileSync(join(ng.dir, '.masume', failed.data.output), 'utf8');
  assert.match(output, /\(exit 3,/, '終了コードどおりに記録する');
  assert.doesNotMatch(output, /制限時間/, '時間切れとして扱わない');
});

test('§23.3 背景の子は、シェルが終わったあとプロセスグループごと SIGKILL される', async () => {
  const { late } = await backgroundChildRuns();
  assert.equal(late.code, 0, late.all);
  // 3秒後に書くはずのマーカー（少なくとも3.5秒は待つ）は現れない
  await sleep(3500);
  assert.equal(existsSync(join(late.dir, 'flags', 'late')), false, '背景の子（プロセスグループ）は止められている');
});

test('§23.3 本当に長い判定は、これまでどおり時間切れで失敗する', async () => {
  const { slow } = await backgroundChildRuns();
  assert.equal(slow.code, 1, `長すぎる判定は失敗（時間切れ）:\n${slow.all}`);
  assert.match(slow.out, /判定失敗/);
  assert.ok(slow.ms < 25000, `30秒の sleep を待たずに止める（実際 ${slow.ms}ms）`);
});

// ---------------------------------------------------------------------------
// §23.4 判定に NODE_TEST_CONTEXT を渡さない
// ---------------------------------------------------------------------------

test('§23.4 NODE_TEST_CONTEXT があっても、常に落ちる node --test の判定は落ちる', () => {
  const failing = `import test from 'node:test';
import assert from 'node:assert/strict';
test('いつも落ちる', () => { assert.equal(1, 2); });
`;
  const dir = startGame(
    soloMap({ t1: cmd('node --test checks/t1.test.mjs', ['checks/t1.test.mjs']) }),
    { 'checks/t1.test.mjs': failing },
  );
  const r = check(dir, 'a', [], { NODE_TEST_CONTEXT: 'child-v8' });
  assert.equal(r.code, 1, `入れ子の node --test が何も走らせずに通ってはいけない:\n${r.all}`);
  assert.match(r.out, /判定失敗/);
  assert.equal(char(view(dir), 'a').at, 'T1');
  // 対照: NODE_TEST_CONTEXT なしでも同じ（この判定そのものが落ちるものだと確かめる）
  assert.equal(check(dir, 'a', [], { NODE_TEST_CONTEXT: '' }).code, 1);
});

test('§23.4 判定（マスもボス戦も）の環境に NODE_TEST_CONTEXT は無い', () => {
  const absent = '[ -z "${NODE_TEST_CONTEXT+set}" ]'; // 定義されていれば（空でも）失敗
  const dir = startGame(soloMap({ t1: cmd(absent), t2: cmd(absent), goal: cmd(absent) }));
  const env = { NODE_TEST_CONTEXT: 'child-v8' };
  const first = check(dir, 'a', [], env);
  assert.equal(first.code, 0, `マスの判定に渡さない:\n${first.all}`);
  const second = check(dir, 'a', [], env); // T2 を通ると、すぐあがりのボス戦
  assert.equal(second.code, 0, `ボス戦の判定にも渡さない:\n${second.all}`);
  assert.match(second.out, /結合ゲート突破/);
  assert.equal(char(view(dir), 'a').status, 'done');
});

// ---------------------------------------------------------------------------
// §23.5 check / stamp（ボス戦を含む）がシグナルを受けたら、判定のプロセスグループを SIGKILL して 130・143・129 で終わる
// ---------------------------------------------------------------------------

/** 判定: started を書き、背景の子が 2 秒後に late を書く。本体は 30 秒眠る（止められなければ late が現れる） */
const LONG_JUDGE = 'touch flags/started; (sleep 2; touch flags/late) & sleep 30';
const EXIT_CODE = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };

async function killedDuring({ dir, args, signal }) {
  const before = readLog(dir).length;
  const run = spawnMasume(args, { cwd: dir });
  await waitUntil(() => existsSync(join(dir, 'flags', 'started')), { timeout: 15000, message: '判定の開始' });
  const sent = Date.now();
  run.proc.kill(signal);
  let timer;
  const hung = new Promise((res) => {
    timer = setTimeout(() => {
      run.proc.kill('SIGKILL');
      res({ code: 'hung', signal: null, all: run.output() });
    }, 15000);
  });
  const result = await Promise.race([run.done, hung]);
  clearTimeout(timer);
  const elapsed = Date.now() - sent;
  // 2秒後に背景の子が書くはずだったマーカーが現れないことを、余裕をもって確かめる
  await sleep(3500);
  return { ...result, before, elapsed, late: existsSync(join(dir, 'flags', 'late')) };
}

/** 3つのシグナルを同時に試す（最初に使われたときに1回だけ） */
let signalRuns;
function taskSignalRuns() {
  signalRuns ??= Promise.all(['SIGINT', 'SIGTERM', 'SIGHUP'].map(async (signal) => {
    const dir = startGame(soloMap({ t1: cmd(LONG_JUDGE) }));
    return [signal, { dir, ...(await killedDuring({ dir, args: ['check', 'a', '--dir', dir, '--as', 'a'], signal })) }];
  })).then((entries) => Object.fromEntries(entries));
  return signalRuns;
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  test(`§23.5 check が ${signal} を受けたら、判定の子孫を残さず ${EXIT_CODE[signal]} で終わる`, async () => {
    const r = (await taskSignalRuns())[signal];
    assert.equal(r.code, EXIT_CODE[signal], `終了コード ${EXIT_CODE[signal]}（実際 code=${r.code} signal=${r.signal}）\n${r.all}`);
    assert.ok(r.elapsed < 10000, `すぐ終わる（実際 ${r.elapsed}ms）`);
    assert.equal(r.late, false, '判定の子孫（背景の子）は SIGKILL されている');
    assert.equal(readLog(r.dir).length, r.before, '何も記録しない');
    assert.equal(existsSync(join(r.dir, '.masume', 'lock')), false, 'ロックを残さない');
    assert.equal(char(view(r.dir), 'a').at, 'T1');
    assert.equal(masume(['verify', '--dir', r.dir]).code, 0);
  });
}

test('§23.5 check のボス戦中に SIGTERM を受けたら、ボスの判定も止めて 143 で終わる', async () => {
  const dir = startGame(duoMap({ gate: cmd(LONG_JUDGE) }));
  assert.equal(check(dir, 'b').code, 0); // b が先に G で待つ
  const r = await killedDuring({ dir, args: ['check', 'a', '--dir', dir, '--as', 'a'], signal: 'SIGTERM' });
  assert.equal(r.code, 143, `実際 code=${r.code} signal=${r.signal}\n${r.all}`);
  assert.equal(r.late, false, 'ボスの判定の子孫は SIGKILL されている');
  const added = readLog(dir).slice(r.before).map((e) => e.type);
  assert.deepEqual(added, ['check_passed'], 'a の到着は記録済み。ボス戦の結果は記録しない');
  assert.equal(char(view(dir), 'a').status, 'waiting');
  assert.equal(char(view(dir), 'b').status, 'waiting');
  assert.equal(existsSync(join(dir, '.masume', 'lock')), false);
});

test('§23.5 stamp のボス戦中に SIGINT を受けたら、ボスの判定も止めて 130 で終わる', async () => {
  const dir = startGame(stampMap({ gate: cmd(LONG_JUDGE) }));
  assert.equal(check(dir, 'a').code, 0); // a が先に G で待つ
  const r = await killedDuring({ dir, args: ['stamp', 'H1', '--dir', dir, '--as', 'h'], signal: 'SIGINT' });
  assert.equal(r.code, 130, `実際 code=${r.code} signal=${r.signal}\n${r.all}`);
  assert.equal(r.late, false, 'ボスの判定の子孫は SIGKILL されている');
  const added = readLog(dir).slice(r.before).map((e) => e.type);
  assert.deepEqual(added, ['stamped'], 'ハンコは記録済み。ボス戦の結果は記録しない');
  assert.equal(existsSync(join(dir, '.masume', 'lock')), false);
});
