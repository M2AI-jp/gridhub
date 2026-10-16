// GOAL3「あがり（第3章）: どの LLM からでも」— 全員の結合E2E。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, masume } from '../helpers3.mjs';

// 第1章・第2章・第3章の判定（あがりの GOAL・GOAL2・GOAL3 を除く）
const FILES = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'E1', 'E2', 'E3', 'E4', 'E5', 'G1', 'G2', 'G3', 'G4', 'G5', 'M1', 'M2', 'M3', 'M4', 'M5', 'P1', 'P2', 'Q1', 'Q2', 'S1', 'S2', 'S3', 'S4', 'S5', 'SOLO']
  .map((id) => join('tests', 'e2e', `${id}.test.mjs`));

test('第1章〜第3章のすべての判定が、まとめて本当に通る', () => {
  for (const f of FILES) assert.ok(existsSync(join(ROOT, f)), f);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  for (const k of Object.keys(env)) if (k.startsWith('MASUME_')) delete env[k];
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=spec', '--test-concurrency=3', ...FILES], { cwd: ROOT, env, encoding: 'utf8', timeout: 30 * 60 * 1000 });
  const out = r.stdout + r.stderr;
  const tail = out.split('\n').slice(-80).join('\n');
  assert.equal(r.status, 0, tail);
  const pass = Number((out.match(/ℹ pass (\d+)/) || [])[1]);
  const fail = Number((out.match(/ℹ fail (\d+)/) || [])[1]);
  assert.ok(pass >= FILES.length * 2, `判定が本当に走った（pass ${pass}）\n${tail}`);
  assert.equal(fail, 0, tail);
});

test('マスメ自身とおみくじの冒険の書が正常で、遊び方に第3章が書いてある', () => {
  assert.equal(masume(['verify', '--dir', ROOT]).code, 0);
  assert.equal(masume(['verify', '--dir', join(ROOT, 'examples', 'omikuji')]).code, 0);
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  for (const w of ['masume mcp', 'masume jira', 'masume init', 'MCP', 'Jira', 'ノートに書き出す']) assert.match(readme, new RegExp(w), `README に「${w}」`);
});
