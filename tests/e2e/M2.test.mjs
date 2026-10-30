// M2「はじめての冒険を用意する」— 5分で遊べるチュートリアル quests/tutorial/。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, cpSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, normalize, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp } from '../helpers.mjs';

const DIR = join(ROOT, 'quests', 'tutorial');
const JOBS = ['hero', 'warrior', 'mage', 'priest', 'thief', 'merchant', 'sage', 'scribe', 'herald', 'cartographer', 'painter', 'villager'];
const COLORS = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple', 'mint', 'gray'];

const run = (cmd, cwd) => spawnSync('/bin/sh', ['-c', cmd], { cwd, encoding: 'utf8', timeout: 15000 });

test('チュートリアルの一式がある', () => {
  for (const f of ['tutorial.map.json', 'SOLUTIONS.json', 'README.md']) assert.ok(existsSync(join(DIR, f)), `quests/tutorial/${f}`);
  const readme = readFileSync(join(DIR, 'README.md'), 'utf8');
  // 第15章（§64.2）: 手順のコマンドは gridhub にそろえた（masume は別名）
  for (const w of ['gridhub new', 'gridhub serve', 'gridhub check', 'gridhub stamp', 'gridhub brief']) assert.match(readme, new RegExp(w), `README に ${w}`);
});

test('地図の形: 小さく、全部の要素がそろっている', () => {
  const m = JSON.parse(readFileSync(join(DIR, 'tutorial.map.json'), 'utf8'));
  assert.equal(m.masume, 1);
  assert.match(m.quest.id, /^[A-Z][A-Z0-9]{1,9}$/);
  const ids = Object.keys(m.nodes);
  assert.ok(ids.length <= 14, `マスは14以下（${ids.length}）`);
  assert.ok(m.characters.length >= 2 && m.characters.length <= 4);
  assert.ok(m.characters.some((c) => c.kind === 'human'), '人間の道');
  assert.ok(m.characters.some((c) => c.kind === 'agent'), 'エージェントの道');
  for (const c of m.characters) {
    assert.ok(JOBS.includes(c.job), c.job);
    assert.ok(COLORS.includes(c.color), c.color);
    assert.equal(c.path[c.path.length - 1], m.quest.goal, `${c.id} は goal で終わる`);
  }
  const owners = {};
  for (const c of m.characters) for (const id of c.path) (owners[id] ||= []).push(c);
  const types = ids.map((id) => m.nodes[id].type);
  assert.ok(types.filter((t) => t === 'gate').length >= 2, 'あがり以外にもゲートがある');
  assert.ok(types.includes('camp'), '宿屋がある');
  for (const id of ids) {
    const n = m.nodes[id];
    assert.ok(owners[id], `${id} はどこかの道にある`);
    assert.ok(n.title.length <= 24, `${id}.title は24文字以内`);
    if (n.type === 'gate') assert.ok(owners[id].length >= 2, `${id} は合流点`);
    if (n.type === 'task') {
      assert.equal(owners[id].length, 1);
      assert.ok(n.detail && n.detail.length >= 10, `${id}.detail にやることを書く`);
      if (owners[id][0].kind === 'human') assert.equal(n.check.kind, 'stamp');
    }
    if (n.check?.kind === 'cmd') {
      assert.ok(Array.isArray(n.check.seal) && n.check.seal.length >= 1, `${id} は封印する判定ファイルを持つ`);
      for (const s of n.check.seal) {
        assert.ok(s.startsWith('checks/'), `${id} の判定ファイルは checks/ に置く`);
        assert.ok(existsSync(join(DIR, s)), `${s} がある`);
      }
    }
  }
  assert.ok(Object.values(m.nodes).some((n) => n.check?.kind === 'stamp'), 'ハンコのマスがある');
});

test('解く前はどの判定も落ち、SOLUTIONS を当てると全部通る', () => {
  const m = JSON.parse(readFileSync(join(DIR, 'tutorial.map.json'), 'utf8'));
  const sol = JSON.parse(readFileSync(join(DIR, 'SOLUTIONS.json'), 'utf8'));
  const play = tmp('masume-tutorial-');
  cpSync(DIR, play, { recursive: true });
  const cmds = Object.entries(m.nodes).filter(([, n]) => n.check?.kind === 'cmd');
  assert.ok(cmds.length >= 4, '判定コマンドのマスが4つ以上');
  for (const [id, n] of cmds) {
    const r = run(n.check.run, play);
    assert.notEqual(r.status, 0, `解く前の ${id} は落ちる: ${r.stdout}${r.stderr}`);
  }
  for (const [id, files] of Object.entries(sol)) {
    assert.ok(m.nodes[id], `SOLUTIONS の ${id} は地図にある`);
    for (const f of files) {
      assert.ok(!isAbsolute(f.path) && !normalize(f.path).startsWith('..') && !f.path.startsWith('checks/'), `${f.path} は冒険の中で、checks/ の外`);
      mkdirSync(dirname(join(play, f.path)), { recursive: true });
      writeFileSync(join(play, f.path), f.content);
    }
  }
  for (const [id, n] of cmds) {
    const r = run(n.check.run, play);
    assert.equal(r.status, 0, `解いた後の ${id} は通る: ${r.stdout}${r.stderr}`);
  }
});

// 配る前の点検（§75.1）: 見習いAIのダンジョンは「テスト1件 = 1マス」。地図の cases の名前が判定の出力のテストの名前と
// 同じでなければ、テストは通っても盤面の図鑑ではそのモンスターが「結果なし」のまま残る（GM_GUIDE の注意）
test('cases の名前は、判定の出力のテストの名前と同じ（テスト1件 = 1マスが盤面で結びつく）', async () => {
  const { readResults } = await import(pathToFileURL(join(ROOT, 'src', 'engine', 'cases.js')).href);
  const m = JSON.parse(readFileSync(join(DIR, 'tutorial.map.json'), 'utf8'));
  const sol = JSON.parse(readFileSync(join(DIR, 'SOLUTIONS.json'), 'utf8'));
  const play = tmp('masume-tutorial-');
  cpSync(DIR, play, { recursive: true });
  for (const files of Object.values(sol)) {
    for (const f of files) {
      mkdirSync(dirname(join(play, f.path)), { recursive: true });
      writeFileSync(join(play, f.path), f.content);
    }
  }
  // 書記の runner と同じく NODE_TEST_CONTEXT を外す（残すと、中の node:test は結果を字で出さない）
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const tasks = Object.entries(m.nodes).filter(([, n]) => n.type === 'task' && n.check?.kind === 'cmd');
  assert.ok(tasks.length >= 3, 'ダンジョン（判定コマンドの task）が3つ以上');
  for (const [id, n] of tasks) {
    assert.ok(Array.isArray(n.check.cases) && n.check.cases.length >= 2, `${id} に cases（テスト1件 = 1マス）`);
    const r = spawnSync('/bin/sh', ['-c', n.check.run], { cwd: play, env, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, `解いた後の ${id} は通る: ${r.stdout}${r.stderr}`);
    const found = new Map(readResults(`${r.stdout}\n${r.stderr}`).map(({ name, ok }) => [name, ok]));
    for (const name of n.check.cases) {
      assert.equal(found.get(name), true, `${id} の cases「${name}」が判定の出力にある（出力のテスト: ${[...found.keys()].join(' / ')}）`);
    }
  }
});
