// GOAL2「あがり（第2章）: 願いからあがりまで」— 全員の結合E2E と、本物の願いで遊んだ冒険の記録。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume, masumeJson } from '../helpers2.mjs';

test('ほかのすべての判定が、まとめて本当に通る', () => {
  // 第1章の17 + 地図の外で足した SOLO + 第2章の11（GOAL と GOAL2 は除く）。章が増えても、第2章のあがりはこの一覧で確かめる
  const files = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'B5', 'E1', 'E2', 'E3', 'E4', 'E5', 'G1', 'G2', 'G3', 'G4', 'M1', 'M2', 'M3', 'M4', 'P1', 'P2', 'Q1', 'S1', 'S2', 'S3', 'S4', 'SOLO']
    .map((id) => join('tests', 'e2e', `${id}.test.mjs`))
    .sort();
  for (const f of files) assert.ok(existsSync(join(ROOT, f)), f);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...files], { cwd: ROOT, env, encoding: 'utf8', timeout: 30 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= files.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('examples/ に、本物の願いから本物のエージェントであがった冒険がある', () => {
  const base = join(ROOT, 'examples');
  assert.ok(existsSync(base), 'examples/');
  const games = readdirSync(base).map((d) => join(base, d)).filter((d) => statSync(d).isDirectory() && existsSync(join(d, '.masume', 'log.jsonl')));
  assert.ok(games.length >= 1, 'examples/ に冒険の書がある');
  for (const dir of games) {
    assert.equal(masume(['verify', '--dir', dir]).code, 0, `${dir} の冒険の書は正常`);
    const v = masumeJson(['status', '--dir', dir]).data;
    assert.equal(v.finished, true, `${dir} はあがっている`);
    const log = readFileSync(join(dir, '.masume', 'log.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const wish = log.find((e) => e.type === 'wish');
    assert.ok(wish && ['claude', 'codex'].includes(wish.data.gm), `${dir} は本物の GM が地図を書いた`);
    assert.ok(existsSync(join(dir, 'WISH.md')));
    const real = log.filter((e) => e.type === 'sortie' && ['claude', 'codex'].includes(e.data.agent));
    assert.ok(real.length >= 2, `${dir} は本物のエージェントが出撃した（${real.length}回）`);
    assert.ok(log.some((e) => e.type === 'gate_cleared'), `${dir} でボス戦があった`);
    // 作ったアプリは、いまも自分の判定に通る。エンジンが判定に渡すのと同じ環境（MASUME_ROOT = その冒険のルート）で走らせる。
    // ボス戦の中ではマスメ自身の MASUME_* が入っているので、受け継がないように外す
    const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('MASUME_')));
    for (const [id, n] of Object.entries(v.nodes)) {
      if (n.check?.kind !== 'cmd') continue;
      const r = spawnSync('/bin/sh', ['-c', n.check.run], { cwd: dir, env: { ...env, MASUME_ROOT: dir, MASUME_NODE: id }, encoding: 'utf8', timeout: 5 * 60 * 1000 });
      assert.equal(r.status, 0, `${dir} の ${id}: ${r.stdout}${r.stderr}`);
    }
  }
});

test('マスメ自身の冒険の書が正常で、遊び方に第2章が書いてある', () => {
  assert.equal(masume(['verify', '--dir', ROOT]).code, 0);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  // 第11章（GM）: 名前は GridHub になり、README・GM_GUIDE は `gridhub …` で書く（`masume` は別名）。どちらの名前でも受ける。
  for (const w of ['(gridhub|masume) quest', '(gridhub|masume) party', '(gridhub|masume) linear', '出撃', '願い']) assert.match(readme, new RegExp(w), `README に「${w}」`);
});
