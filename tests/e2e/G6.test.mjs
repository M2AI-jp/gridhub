// G6「結合: 総点検・判定の誠実さ」— 書記（判定の実行）＋伝令（窓口のボス戦）＋軍師（パーティのボス戦）。
// CONTRACTS §23.4・§23.5・§25.3・§26.4 を、外から流れで確かめる。
//  (a) NODE_TEST_CONTEXT つきで起動した serve でも、落ちる node --test の判定は gate_failed になる（通ってはいけない）。
//  (b) パーティがボス戦の判定中に SIGINT を受けたら、判定も止まる（あとで勝手に終わって何かを書かない）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  tmp, masume, setupToy, toyMap, flag, view, readLog, getJson, waitUntil, startServeEnv, spawnMasume,
  fakeAgent, playToyToFinale,
} from '../helpers3.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function within(promise, ms, onTimeout) {
  let timer;
  return Promise.race([promise, new Promise((res) => { timer = setTimeout(() => res(onTimeout()), ms); })]).finally(() => clearTimeout(timer));
}
const post = (url, body) =>
  getJson(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });

// ---- 小道具（このファイルの中だけ） ----

// 常に落ちる node --test の判定ファイル
const FAILING_TEST = `import test from 'node:test';
test('いつも落ちる', () => {
  throw new Error('この判定は、走らされたら必ず落ちる');
});
`;
// 長く走り（release ファイルができるまで）、終わったらマーカーに end を残す判定。殺されたら end は残らない。
const LONG_JUDGE = `import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
mkdirSync('marks', { recursive: true });
appendFileSync('marks/judge.log', 'start pid=' + process.pid + '\\n');
const deadline = Date.now() + 40000;
while (!existsSync('release') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
appendFileSync('marks/judge.log', 'end\\n');
process.exit(0);
`;

const marks = (dir) => {
  try {
    return readFileSync(join(dir, 'marks', 'judge.log'), 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};
const release = (dir) => writeFileSync(join(dir, 'release'), 'go');
const types = (dir, gate) => readLog(dir)
  .filter((e) => gate === undefined || e.data?.gate === gate)
  .map((e) => e.type);

/** gate の判定を script に差し替えた、新しく始めたおもちゃの冒険 */
function toyWithGate(gate, run, files) {
  const dir = tmp('masume-g6-');
  const map = toyMap();
  map.nodes[gate].check = { kind: 'cmd', run, seal: Object.keys(files).map((f) => `checks/${f}`) };
  setupToy(dir, { withB3: true, map });
  mkdirSync(join(dir, 'checks'), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'checks', name), text);
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return dir;
}

/** G1 の仲間（a と b）をそろえる（ボス戦はしない） */
function gateReady(dir) {
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2']) flag(dir, id);
  for (const who of ['a', 'a', 'a', 'b', 'b']) {
    const r = masume(['check', who, '--dir', dir, '--as', who, '--no-boss']);
    assert.equal(r.code, 0, r.all);
  }
  assert.equal(view(dir).nodes.G1.state, 'ready');
}

const blameIf = (bad, ids) => {
  if (bad) console.log(`MASUME_BLAME: ${ids}`);
};

// ---- (a) ----

test('(a) NODE_TEST_CONTEXT つきの serve に /api/battle を送っても、落ちる node --test の判定は gate_failed（gate_cleared にならない）', { timeout: 120000 }, async () => {
  const dir = toyWithGate('G1', 'node --test checks/always-fails.test.mjs', { 'always-fails.test.mjs': FAILING_TEST });
  gateReady(dir);
  const srv = await startServeEnv(dir, { NODE_TEST_CONTEXT: 'child-v8' });
  try {
    const r = await post(`${srv.url}/api/battle`, { gate: 'G1' });
    assert.equal(r.status, 200, r.text);
    await waitUntil(() => types(dir).some((t) => t === 'gate_failed' || t === 'gate_cleared'), { timeout: 60000, message: 'ボス戦の結果が記録される' });
    const t = types(dir);
    blameIf(t.includes('gate_cleared'), 'engine,server');
    assert.ok(!t.includes('gate_cleared'), '常に落ちる判定が通った（NODE_TEST_CONTEXT が判定に漏れて、入れ子の node --test が何も走らせなかった）');
    assert.ok(t.includes('gate_failed'), '落ちる判定は gate_failed として記録される');
    assert.notEqual(view(dir).nodes.G1.state, 'cleared');
    assert.equal(masume(['verify', '--dir', dir]).code, 0);
  } finally {
    await srv.stop();
  }
});

test('(a) ハンコから始まるボス戦も同じ: 落ちる node --test の判定は gate_failed', { timeout: 120000 }, async () => {
  const dir = toyWithGate('FIN', 'node --test checks/always-fails.test.mjs', { 'always-fails.test.mjs': FAILING_TEST });
  playToyToFinale(dir); // a と b は FIN で待機、h が H1 に残る
  const srv = await startServeEnv(dir, { NODE_TEST_CONTEXT: 'child-v8' });
  try {
    const r = await post(`${srv.url}/api/stamp`, { node: 'H1', as: 'h' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.ready, 'FIN');
    await waitUntil(() => types(dir, 'FIN').some((t) => t === 'gate_failed' || t === 'gate_cleared'), { timeout: 60000, message: 'FIN のボス戦の結果が記録される' });
    const t = types(dir, 'FIN');
    blameIf(t.includes('gate_cleared'), 'engine,server');
    assert.ok(!t.includes('gate_cleared'), '常に落ちる判定が通った');
    assert.ok(t.includes('gate_failed'));
    assert.equal(view(dir).finished, false);
  } finally {
    await srv.stop();
  }
});

// ---- (b) ----

test('(b) パーティがボス戦の判定中に SIGINT を受けると、party が終わったあと、判定は動かない（マーカーが作られない）', { timeout: 120000 }, async () => {
  const dir = toyWithGate('G1', 'node checks/long-judge.mjs', { 'long-judge.mjs': LONG_JUDGE });
  const run = spawnMasume(['party', '--dir', dir, '--agent', fakeAgent('good'), '--parallel', '2'], { cwd: dir });
  try {
    await waitUntil(() => marks(dir).some((l) => l.startsWith('start')), { timeout: 60000, message: 'パーティがボス戦を始める（判定が走り出す）' });
    await sleep(300);
    run.proc.kill('SIGINT');
    const res = await within(run.done, 20000, () => ({ code: 'timeout', all: run.output() }));
    blameIf(res.code !== 130, 'party');
    assert.equal(res.code, 130, `SIGINT で party が終わる\n${res.all}`);
    await sleep(500);
    release(dir); // 判定が生きていれば、これで終わってマーカーを作る
    await sleep(2000);
    const m = marks(dir);
    blameIf(m.includes('end'), 'party,engine');
    assert.ok(!m.includes('end'), `party が終わったあとも、ボス戦の判定が生きていて終わった（${m.join(' / ')}）`);
    const t = types(dir);
    blameIf(t.includes('gate_cleared') || t.includes('gate_failed'), 'party,engine');
    assert.ok(!t.includes('gate_cleared'), '止めた判定でゲートを突破してはいけない');
    assert.ok(!t.includes('gate_failed'), '止めた判定を「落ちた」と記録して仲間を戻してはいけない');
    assert.equal(masume(['verify', '--dir', dir]).code, 0);
  } finally {
    release(dir);
    run.proc.kill('SIGKILL');
  }
});
