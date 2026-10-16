// P2「本物のエージェントを呼ぶ」— CONTRACTS §13 のアダプタ・プロンプト・既定値・上書き・SIGINT。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { masume, masumeEnv, spawnMasume, newToy, view, char, readLog, fakeAgent, waitUntil } from '../helpers2.mjs';

/** シェルの単一引用符（第4章 §26.6: パスに $ " ` があっても、そのまま貼って動く） */
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

test('--dry-run: claude と codex のコマンド、何も記録しない', async () => {
  const dir = newToy();
  const before = readLog(dir).length;
  const c = await masumeEnv(['party', '--dir', dir, '--dry-run', '--agent', 'claude'], { cwd: dir });
  assert.equal(c.code, 0, c.all);
  assert.match(c.all, /出撃予定: a claude -p --model sonnet --permission-mode bypassPermissions/);
  assert.match(c.all, /出撃予定: b claude -p --model sonnet --permission-mode bypassPermissions/);
  assert.doesNotMatch(c.all, /出撃予定: h /, '人間には出撃しない');
  const x = await masumeEnv(['party', '--dir', dir, '--dry-run', '--agent', 'codex', '--model', 'gpt-5'], { cwd: dir });
  assert.equal(x.code, 0, x.all);
  assert.ok(x.all.includes(`出撃予定: a codex exec -C ${dir} -s workspace-write --skip-git-repo-check -m gpt-5 -`), x.all);
  const o = await masumeEnv(['party', '--dir', dir, '--dry-run', '--agent', 'claude', '--model', 'opus'], { cwd: dir });
  assert.match(o.all, /claude -p --model opus --permission-mode bypassPermissions/);
  assert.equal(readLog(dir).length, before, 'dry-run は冒険の書に書かない');
});

test('プロンプトに入れること', async () => {
  const dir = newToy();
  const r = await masumeEnv(['party', '--dir', dir, '--agent', fakeAgent('record'), '--only', 'a', '--rounds', '1'], { cwd: dir });
  assert.equal(r.code, 2, r.all);
  const { prompt, MASUME_BIN } = JSON.parse(readFileSync(join(dir, 'record-a-1.json'), 'utf8'));
  const brief = masume(['brief', 'a', '--dir', dir]).out;
  for (const w of ['戦士アリス', '剣をとぐ', 'node checks/flag.mjs A1', 'a/**', '現在のマスだけ', '縄張り', '封印', 'git']) assert.ok(prompt.includes(w), `プロンプトに「${w}」`);
  assert.ok(prompt.includes(`node ${sq(MASUME_BIN)} check a --as a --no-boss --dir ${sq(dir)}`), '宣言判定のコマンドそのまま');
  assert.ok(prompt.includes(`node ${sq(MASUME_BIN)} note a`), '日誌のコマンド');
  assert.match(prompt, /1つ突破したら/);
  assert.ok(brief.split('\n').filter((l) => l.includes('剣をとぐ')).every((l) => prompt.includes(l.trim())), '指令書の行が入っている');
});

test('.masume/party.json の既定値と、MASUME_AGENT_OVERRIDE', async () => {
  const dir = newToy();
  writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify({ agent: fakeAgent('good'), parallel: 1 }));
  const r = await masumeEnv(['party', '--dir', dir, '--only', 'a', '--rounds', '1'], { cwd: dir });
  assert.equal(r.code, 2, r.all);
  assert.equal(char(view(dir), 'a').at, 'A2', 'party.json のエージェントで進んだ');

  const dir2 = newToy();
  const o = await masumeEnv(['party', '--dir', dir2, '--agent', 'claude', '--only', 'b', '--rounds', '1'], { cwd: dir2, env: { MASUME_AGENT_OVERRIDE: fakeAgent('good') } });
  assert.equal(o.code, 2, o.all);
  const s = readLog(dir2).find((e) => e.type === 'sortie');
  assert.equal(s.data.agent, 'cmd', '上書きのエージェントが使われる');
  assert.equal(char(view(dir2), 'b').at, 'B2');
});

test('SIGINT で出撃中のエージェントを止め、帰還を記録して終わる', async () => {
  const dir = newToy();
  const run = spawnMasume(['party', '--dir', dir, '--agent', fakeAgent('slow', 20000), '--parallel', '2'], { cwd: dir });
  await waitUntil(() => readLog(dir).filter((e) => e.type === 'sortie').length >= 2, { timeout: 10000, message: '2人が出撃' });
  run.proc.kill('SIGINT');
  const res = await Promise.race([run.done, new Promise((r) => setTimeout(() => r({ code: 'timeout' }), 8000))]);
  assert.equal(res.code, 130, run.output());
  const log = readLog(dir);
  const sorties = log.filter((e) => e.type === 'sortie');
  for (const s of sorties) {
    const ret = log.find((e) => e.type === 'returned' && e.data.sortie === s.seq);
    assert.ok(ret, `seq ${s.seq} の帰還が記録される`);
    assert.equal(ret.data.code, 130);
  }
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});
