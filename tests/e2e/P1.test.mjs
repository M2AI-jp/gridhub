// P1「パーティを出撃させる」— CONTRACTS §13 の巡回（cmd: アダプタ）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { masume, masumeEnv, newToy, flag, view, char, readLog, fakeAgent } from '../helpers2.mjs';

const party = (dir, args = [], env = {}) => masumeEnv(['party', '--dir', dir, ...args], { cwd: dir, env });

function pairs(dir) {
  const log = readLog(dir);
  return log
    .filter((e) => e.type === 'sortie')
    .map((s) => ({ s, r: log.find((e) => e.type === 'returned' && e.data.sortie === s.seq) }));
}

test('パーティは自分で進み、ボス戦をして、ハンコ待ちで止まる', async () => {
  const dir = newToy({ withB3: true });
  flag(dir, 'G1');
  flag(dir, 'FIN');
  const r = await party(dir, ['--agent', fakeAgent('good'), '--parallel', '2']);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /ハンコ待ち/);
  assert.match(r.all, /H1/);
  const v = view(dir);
  assert.deepEqual([char(v, 'a').at, char(v, 'a').status], ['FIN', 'waiting']);
  assert.deepEqual([char(v, 'b').at, char(v, 'b').status], ['FIN', 'waiting']);
  assert.equal(char(v, 'h').at, 'H1', '人間には出撃しない');
  assert.equal(v.nodes.G1.state, 'cleared');
  const g1 = readLog(dir).find((e) => e.type === 'gate_cleared' && e.data.gate === 'G1');
  assert.ok(g1, 'パーティが G1 のボス戦をした');
  assert.equal(g1.actor, 'party');

  const ps = pairs(dir);
  assert.equal(ps.length, 7, `a は A1・A2・A3・A4、b は B1・B2・B3 の7回出撃（${ps.length}）`);
  for (const { s, r: ret } of ps) {
    assert.equal(s.actor, 'party');
    assert.equal(s.data.agent, 'cmd');
    assert.ok(ret, `seq ${s.seq} の出撃は帰還している`);
    assert.equal(ret.data.advanced, true);
    assert.equal(ret.data.code, 0);
    assert.equal(ret.data.output, `outputs/sortie-${String(s.seq).padStart(6, '0')}.log`);
    assert.match(readFileSync(join(dir, '.masume', ret.data.output), 'utf8'), /偽のエージェント/);
  }
  assert.ok(ps.every(({ s }) => s.data.character !== 'h'));
  assert.equal(masume(['verify', '--dir', dir]).code, 0);

  // ハンコのあと、もう一度出撃するとパーティがあがりのボス戦をする
  assert.equal(masume(['stamp', 'H1', '--dir', dir, '--as', 'h', '--no-boss']).code, 0);
  assert.equal(view(dir).nodes.FIN.state, 'ready');
  const r2 = await party(dir, ['--agent', fakeAgent('good')]);
  assert.equal(r2.code, 0, r2.all);
  assert.match(r2.all, /あがり！/);
  assert.equal(view(dir).finished, true);
});

test('進めないキャラクターは2回で迷子になり、パーティは止まる', async () => {
  const dir = newToy();
  const r = await party(dir, ['--agent', fakeAgent('lazy')]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /迷子/);
  const ps = pairs(dir);
  const count = (id) => ps.filter(({ s }) => s.data.character === id).length;
  assert.equal(count('a'), 2);
  assert.equal(count('b'), 2);
  assert.ok(ps.every(({ r: ret }) => ret && ret.data.advanced === false));
  assert.equal(char(view(dir), 'a').at, 'A1');
});

test('--only と --rounds', async () => {
  const dir = newToy();
  const r = await party(dir, ['--agent', fakeAgent('good'), '--only', 'a', '--rounds', '2']);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /巡回の上限/);
  const ps = pairs(dir);
  assert.equal(ps.length, 2);
  assert.ok(ps.every(({ s }) => s.data.character === 'a'));
  assert.equal(char(view(dir), 'a').at, 'A3', 'A1 と A2（と宿屋）を越えた');
  assert.equal(char(view(dir), 'b').at, 'B1');
});

test('--parallel: 同時に出撃する人数を守る', async () => {
  const overlap = (dir) => {
    const ps = pairs(dir).map(({ s, r }) => [Date.parse(s.ts), Date.parse(r.ts)]);
    let max = 0;
    for (const [s] of ps) max = Math.max(max, ps.filter(([a, b]) => a <= s && s < b).length);
    return max;
  };
  const one = newToy();
  const r1 = await party(one, ['--agent', fakeAgent('slow', 400), '--parallel', '1', '--rounds', '4']);
  assert.equal(r1.code, 2, r1.all);
  assert.equal(overlap(one), 1, '1人ずつ');
  const two = newToy();
  const r2 = await party(two, ['--agent', fakeAgent('slow', 400), '--parallel', '2', '--rounds', '4']);
  assert.equal(r2.code, 2, r2.all);
  assert.equal(overlap(two), 2, 'a と b が同時に');
});

test('エージェントに渡す環境変数とプロンプトのファイル、タイムアウト', async () => {
  const dir = newToy();
  const r = await party(dir, ['--agent', fakeAgent('record'), '--only', 'a', '--rounds', '1']);
  assert.equal(r.code, 2, r.all);
  const rec = JSON.parse(readFileSync(join(dir, 'record-a-1.json'), 'utf8'));
  assert.equal(rec.MASUME_DIR, dir);
  assert.match(rec.MASUME_BIN, /bin\/masume\.js$/);
  assert.ok(existsSync(rec.MASUME_BIN));
  assert.equal(rec.MASUME_CHARACTER, 'a');
  assert.equal(rec.MASUME_NODE, 'A1');
  assert.ok(rec.MASUME_PROMPT_FILE, 'プロンプトのファイル');
  assert.equal(rec.promptFile, rec.prompt, 'ファイルと stdin のプロンプトは同じ');
  assert.ok(rec.prompt.length > 100);

  const slow = newToy();
  const t = await party(slow, ['--agent', fakeAgent('slow', 5000), '--only', 'a', '--rounds', '1'], { MASUME_SORTIE_TIMEOUT: '1' });
  assert.equal(t.code, 2, t.all);
  const ret = readLog(slow).filter((e) => e.type === 'returned').pop();
  assert.equal(ret.data.code, 124);
  assert.equal(ret.data.advanced, false);
});
