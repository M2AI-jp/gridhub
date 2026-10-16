// M1「ことづけの地図を描く」— 地図職人の最初のマス。GM_GUIDE.md に従って描かれた地図かを確かめる。
// （書記の検査器にはまだ頼らず、この判定の中で地図の形を確かめる）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers.mjs';

const JOBS = ['hero', 'warrior', 'mage', 'priest', 'thief', 'merchant', 'sage', 'scribe', 'herald', 'cartographer', 'painter', 'villager'];
const COLORS = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple', 'mint', 'gray'];

const mapFile = join(ROOT, 'quests', 'kotozuke.map.json');
const docFile = join(ROOT, 'quests', 'kotozuke.md');

test('地図と説明書がある', () => {
  assert.ok(existsSync(mapFile), 'quests/kotozuke.map.json');
  assert.ok(existsSync(docFile), 'quests/kotozuke.md');
  const doc = readFileSync(docFile, 'utf8');
  for (const h of ['ヒアリング', '前提', 'あがり', 'キャラクター', 'ゲート']) assert.match(doc, new RegExp(h), `説明書に「${h}」の節`);
});

test('地図の形が契約どおり', () => {
  const m = JSON.parse(readFileSync(mapFile, 'utf8'));
  assert.equal(m.masume, 1);
  assert.equal(m.quest.id, 'KTZ');
  assert.ok(m.quest.title && m.quest.pitch, 'quest.title / pitch');
  const ids = Object.keys(m.nodes);
  for (const id of ids) assert.match(id, /^KTZ-[A-Z0-9]+$/, `マスID ${id} は KTZ- で始まる`);

  // キャラクター
  assert.ok(m.characters.length >= 5 && m.characters.length <= 7, `キャラクターは5〜7人（${m.characters.length}）`);
  const charIds = m.characters.map((c) => c.id);
  assert.equal(new Set(charIds).size, charIds.length, 'キャラクターIDが重複しない');
  const humans = m.characters.filter((c) => c.kind === 'human');
  assert.ok(humans.length >= 1, '人間の道がある');
  for (const c of m.characters) {
    assert.match(c.id, /^[a-z][a-z0-9-]{0,23}$/);
    assert.ok(c.name, `${c.id}.name`);
    assert.ok(['agent', 'human'].includes(c.kind));
    assert.ok(JOBS.includes(c.job), `${c.id}.job=${c.job}`);
    assert.ok(COLORS.includes(c.color), `${c.id}.color=${c.color}`);
    assert.ok(c.module, `${c.id}.module`);
    assert.ok(Array.isArray(c.path) && c.path.length >= 2);
    if (c.kind === 'agent') assert.ok(Array.isArray(c.territory) && c.territory.length > 0, `${c.id}.territory`);
  }
  const colorsUsed = m.characters.map((c) => c.color);
  assert.equal(new Set(colorsUsed).size, colorsUsed.length, '担当色が重ならない');
  const globs = m.characters.flatMap((c) => c.territory || []);
  assert.equal(new Set(globs).size, globs.length, '縄張りが重ならない');

  // マスとゲート
  const owners = {};
  for (const c of m.characters) {
    assert.equal(new Set(c.path).size, c.path.length, `${c.id} の道に同じマスが2回ない`);
    for (const id of c.path) {
      assert.ok(m.nodes[id], `${c.id} の道の ${id} が存在する`);
      (owners[id] ||= []).push(c.id);
    }
  }
  for (const id of ids) {
    const n = m.nodes[id];
    assert.ok(owners[id], `${id} はどこかの道にある`);
    assert.ok(n.title && n.title.length <= 30, `${id}.title は30文字以内`);
    if (n.type === 'task') {
      assert.equal(owners[id].length, 1, `${id} の持ち主は1人`);
      assert.ok(n.detail && n.detail.length >= 20, `${id}.detail に合格条件まで書く`);
      const owner = m.characters.find((c) => c.id === owners[id][0]);
      if (owner.kind === 'human') {
        assert.equal(n.check.kind, 'stamp', `人間のマス ${id} はハンコ`);
        assert.equal(n.check.by, owner.id);
      } else {
        assert.equal(n.check.kind, 'cmd', `${id} は E2E 判定`);
        assert.ok(n.check.run.length > 5);
        assert.ok(Array.isArray(n.check.seal) && n.check.seal.length >= 1, `${id} は封印する判定ファイルを持つ`);
      }
    } else if (n.type === 'gate') {
      assert.ok(owners[id].length >= 2, `ゲート ${id} は2人以上が合流する`);
      assert.equal(n.check.kind, 'cmd', `ゲート ${id} は結合E2E`);
      assert.ok(n.detail && n.detail.length >= 20, `${id}.detail`);
    } else {
      assert.equal(n.type, 'camp', `${id}.type`);
      assert.equal(n.check, undefined);
    }
  }

  // あがり
  const goal = m.nodes[m.quest.goal];
  assert.ok(goal && goal.type === 'gate', 'quest.goal はゲート');
  for (const c of m.characters) assert.equal(c.path[c.path.length - 1], m.quest.goal, `${c.id} の道は goal で終わる`);

  // あがり以外のゲートが2つ以上、人間がどこかのゲートに合流する
  const gates = ids.filter((id) => m.nodes[id].type === 'gate' && id !== m.quest.goal);
  assert.ok(gates.length >= 2, `途中のゲートが2つ以上（${gates.length}）`);
  assert.ok(gates.some((g) => owners[g].some((o) => humans.some((h) => h.id === o))), '人間が途中のゲートに合流する');

  // 道の長さ: 各エージェントの最初のゲートまで2〜6マス
  for (const c of m.characters.filter((c) => c.kind === 'agent')) {
    const firstGate = c.path.findIndex((id) => m.nodes[id].type === 'gate');
    assert.ok(firstGate >= 2 && firstGate <= 6, `${c.id} の最初のゲートまで ${firstGate} マス`);
  }

  // 閉路がない（前→次のグラフでトポロジカルソートできる）
  const edges = new Map(ids.map((id) => [id, new Set()]));
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const c of m.characters)
    for (let i = 0; i + 1 < c.path.length; i++) {
      const [a, b] = [c.path[i], c.path[i + 1]];
      if (!edges.get(a).has(b)) {
        edges.get(a).add(b);
        indeg.set(b, indeg.get(b) + 1);
      }
    }
  const queue = ids.filter((id) => indeg.get(id) === 0);
  let seen = 0;
  while (queue.length) {
    const x = queue.shift();
    seen++;
    for (const y of edges.get(x)) {
      indeg.set(y, indeg.get(y) - 1);
      if (indeg.get(y) === 0) queue.push(y);
    }
  }
  assert.equal(seen, ids.length, 'ゲートの順番が道ごとに食い違っていない（閉路なし）');
});

test('ことづけの中身を描いている', () => {
  const text = readFileSync(mapFile, 'utf8');
  for (const word of ['電話', 'メール', 'PayPal', '番号', '削除']) assert.match(text, new RegExp(word), `地図に「${word}」が出てくる`);
  const m = JSON.parse(text);
  // 本物の外部サービスを叩く判定は人間の道に分ける: エージェントの判定コマンドに本番らしい語がない
  for (const [id, n] of Object.entries(m.nodes)) {
    if (n.check?.kind === 'cmd') assert.doesNotMatch(n.check.run, /--live|production|本番/, `${id} の判定は本番に触らない`);
  }
});
