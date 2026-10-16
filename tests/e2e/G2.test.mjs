// G2「結合: 地図職人の地図で旅ができる」— 書記（エンジン）＋地図職人（地図）の結合E2E。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, cpSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, tmp, masume, view, readLog } from '../helpers.mjs';

test('地図職人の地図は、書記の検査に通る', () => {
  for (const f of ['quests/kotozuke.map.json', 'quests/tutorial/tutorial.map.json', 'quests/masume.map.json']) {
    const r = masume(['validate', f]);
    if (r.code !== 0 && f !== 'quests/masume.map.json') console.log('MASUME_BLAME: gmkit');
    assert.equal(r.code, 0, `${f}: ${r.all}`);
  }
});

test('チュートリアルを CLI だけで最後まで遊びきれる', () => {
  const dir = tmp('masume-g2-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  const sol = JSON.parse(readFileSync(join(dir, 'SOLUTIONS.json'), 'utf8'));
  const apply = (id) => {
    for (const f of sol[id] || []) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true });
      writeFileSync(join(dir, f.path), f.content);
    }
  };
  const n = masume(['new', 'tutorial.map.json'], { cwd: dir });
  assert.equal(n.code, 0, n.all);
  let v = view(dir);
  for (const [id, node] of Object.entries(v.nodes)) if (node.type === 'gate') apply(id);
  for (let step = 0; step < 80 && !v.finished; step++) {
    let moved = false;
    for (const c of v.characters) {
      if (c.status !== 'working') continue;
      const node = v.nodes[c.at];
      // 指令書が読める
      const b = masume(['brief', c.id, '--dir', dir]);
      assert.equal(b.code, 0, b.all);
      assert.match(b.out, /ふっかつのじゅもん/);
      let r;
      if (node.check?.kind === 'stamp') {
        apply(c.at); // 人間のマスも、作業をしてからハンコを押す
        r = masume(['stamp', c.at, '--dir', dir, '--as', node.check.by]);
      } else {
        apply(c.at);
        r = masume(['check', c.id, '--dir', dir, '--as', c.id]);
      }
      if (r.code !== 0) console.log('MASUME_BLAME: gmkit');
      assert.equal(r.code, 0, `${c.id} @ ${c.at}: ${r.all}`);
      moved = true;
      v = view(dir);
    }
    if (!moved) {
      const ready = Object.entries(v.nodes).find(([, x]) => x.state === 'ready');
      assert.ok(ready, `誰も動けないのにボス戦の準備もない: ${JSON.stringify(v.characters.map((c) => [c.id, c.at, c.status]))}`);
      const r = masume(['check', ready[0], '--dir', dir, '--as', 'gm']);
      assert.equal(r.code, 0, r.all);
    }
    v = view(dir);
  }
  assert.equal(v.finished, true, 'あがり');
  assert.ok(v.characters.every((c) => c.status === 'done'));
  assert.ok(readLog(dir).some((e) => e.type === 'gate_cleared'));
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

test('ことづけの地図で冒険を始め、全員が指令書を読める', () => {
  const dir = tmp('masume-ktz-');
  copyFileSync(join(ROOT, 'quests', 'kotozuke.map.json'), join(dir, 'kotozuke.map.json'));
  const n = masume(['new', 'kotozuke.map.json'], { cwd: dir });
  assert.equal(n.code, 0, n.all);
  const v = view(dir);
  assert.equal(v.quest.id, 'KTZ');
  for (const c of v.characters) {
    const b = masume(['brief', c.id, '--dir', dir]);
    assert.equal(b.code, 0, b.all);
    assert.match(b.out, new RegExp(v.nodes[c.at].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  // ことづけの判定ファイルはここには無いので、未封印として扱われる
  const agent = v.characters.find((c) => c.kind === 'agent');
  const r = masume(['check', agent.id, '--dir', dir, '--as', agent.id]);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /E_UNSEALED/);
});
