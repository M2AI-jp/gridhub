// GOAL8「あがり（第8章）: 最終確認」— 第1章〜第8章のすべての判定と、すべての冒険の書と、遊び方。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers3.mjs';

// あがりの GOAL〜GOAL8 を除く、第1章〜第8章の判定
const FILES = [
  'A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8',
  'E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7',
  'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8',
  'M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7',
  'P1', 'P2', 'P3', 'P4', 'P5', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5',
  'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'SOLO',
].map((id) => join('tests', 'e2e', `${id}.test.mjs`));

test('第1章〜第8章のすべての判定が、まとめて本当に通る', () => {
  for (const f of FILES) assert.ok(existsSync(join(ROOT, f)), f);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('MASUME_')) delete env[k];
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...FILES], { cwd: ROOT, env, encoding: 'utf8', timeout: 40 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= FILES.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('マスメ自身と、残っているすべての冒険の書が正常', () => {
  for (const d of ['.', 'examples/omikuji', 'examples/kakeibo', 'demos/mcp-tutorial']) assert.equal(masume(['verify', '--dir', join(ROOT, d)]).code, 0, d);
});

test('遊び方に第8章（最終確認: チュートリアルは書いてあるとおりに動く）が書いてある', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /第8章/);
  assert.match(readme, /最終確認/);
  assert.match(readme, /チュートリアル/);
  // 遊び方の表から、盤面のサーバーを別のターミナルで動かすことが分かる
  // 第11章（GM）: 名前は GridHub になり、README・GM_GUIDE は `gridhub …` で書く（`masume` は別名）。どちらの名前でも受ける。
  assert.match(readme, /(gridhub|masume) serve[^\n]*(別の|もう1つの)ターミナル|(別の|もう1つの)ターミナル[^\n]*(gridhub|masume) serve/, 'README の5分のチュートリアルに、serve は別のターミナルで');
});
