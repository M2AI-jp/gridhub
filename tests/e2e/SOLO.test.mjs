// SOLO「ひとりでもあがれる」— キャラクターが1人だけの地図。CONTRACTS §2（E_GATE_MEMBERS の例外）と §9（import）。
// quests/masume.map.json のマスではない。地図を変えずに GM が足した判定（GOAL がまとめて走らせる）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeJson, setupToy, toyMap, flag, view, char } from '../helpers.mjs';

const cmd = (id) => ({ kind: 'cmd', run: `node checks/flag.mjs ${id}`, seal: ['checks/flag.mjs'] });

function soloMap() {
  return {
    masume: 1,
    quest: { id: 'SOLO', title: 'ひとり旅', pitch: '1人だけの地図', goal: 'FIN' },
    characters: [
      { id: 'a', name: '戦士アリス', kind: 'agent', job: 'warrior', color: 'yellow', path: ['A1', 'AC', 'A2', 'FIN'] },
    ],
    nodes: {
      A1: { type: 'task', title: '剣をとぐ', check: cmd('A1') },
      AC: { type: 'camp', title: '村の宿屋' },
      A2: { type: 'task', title: '洞窟をしらべる', check: cmd('A2') },
      FIN: { type: 'gate', title: 'あがり', check: cmd('FIN') },
    },
  };
}

function validate(dir, map) {
  writeFileSync(join(dir, 'm.map.json'), JSON.stringify(map, null, 2));
  return masumeJson(['validate', 'm.map.json'], { cwd: dir });
}

const codesAt = (data, path) => data.errors.filter((e) => e.path === path).map((e) => e.code);

test('validate: 1人だけの地図なら、あがりのゲートはメンバー1人でよい', () => {
  const dir = tmp();
  const r = validate(dir, soloMap());
  assert.equal(r.code, 0, r.all);
  assert.equal(r.data.ok, true);
  assert.deepEqual(r.data.errors, []);
});

test('validate: あがり以外のゲート、2人以上の地図のあがりは、従来どおり2人以上', () => {
  const dir = tmp();
  const solo = soloMap();
  solo.nodes.G9 = { type: 'gate', title: 'ひとりの中ボス', check: cmd('G9') };
  solo.characters[0].path.splice(1, 0, 'G9');
  const a = validate(dir, solo);
  assert.equal(a.code, 1, a.all);
  assert.deepEqual(codesAt(a.data, 'nodes.G9'), ['E_GATE_MEMBERS'], '1人の地図でも goal 以外のゲートは2人以上');
  assert.deepEqual(codesAt(a.data, 'nodes.FIN'), [], 'あがりはエラーにならない');

  const party = toyMap(); // 3人の地図で、あがりを1人の道にしか置かない
  for (const c of party.characters.slice(1)) c.path = c.path.filter((id) => id !== 'FIN');
  const b = validate(dir, party);
  assert.equal(b.code, 1, b.all);
  assert.ok(codesAt(b.data, 'nodes.FIN').includes('E_GATE_MEMBERS'), `2人以上の地図ではあがりも2人以上: ${b.all}`);
});

test('1人だけの冒険: あがりのボス戦をその1人で戦い、負ければ戻され、勝てばあがる', () => {
  const dir = tmp('masume-solo-');
  setupToy(dir, { map: soloMap() });
  const n = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(n.code, 0, n.all);
  assert.deepEqual(view(dir).nodes.FIN.members, ['a']);

  flag(dir, 'A1');
  const c1 = masume(['check', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(c1.code, 0, c1.all);
  assert.equal(char(view(dir), 'a').at, 'A2', '宿屋は自動で通過');

  // A2 は通るがあがりの判定が落ちる → 1人で全滅、宿屋の次まで戻される
  flag(dir, 'A2');
  const c2 = masume(['check', 'a', '--dir', dir, '--as', 'a']);
  assert.equal(c2.code, 1, c2.all);
  assert.match(c2.all, /判定成功/);
  assert.match(c2.all, /全滅/);
  let v = view(dir);
  assert.equal(char(v, 'a').at, 'A2');
  assert.equal(v.nodes.A2.state, 'stale');
  assert.equal(v.finished, false);

  // --no-boss で待機すれば、1人そろった時点で ready
  flag(dir, 'FIN');
  const c3 = masume(['check', 'a', '--dir', dir, '--as', 'a', '--no-boss']);
  assert.equal(c3.code, 0, c3.all);
  v = view(dir);
  assert.equal(char(v, 'a').status, 'waiting');
  assert.equal(v.nodes.FIN.state, 'ready');
  const brief = masumeJson(['brief', 'a', '--dir', dir]);
  assert.equal(brief.code, 0, brief.all);
  assert.deepEqual(brief.data.waiting_for, []);

  const boss = masume(['check', 'FIN', '--dir', dir, '--as', 'gm']);
  assert.equal(boss.code, 0, boss.all);
  assert.match(boss.all, /結合ゲート突破/);
  v = view(dir);
  assert.equal(v.finished, true);
  assert.equal(char(v, 'a').status, 'done');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

const HEADER = 'ID,Title,Description,Status,Assignee,Labels,Created,Project';

function importCsv(rows) {
  const dir = tmp('masume-import-solo-');
  writeFileSync(join(dir, 'one.csv'), `${[HEADER, ...rows].join('\n')}\n`);
  const r = masume(['import', 'linear', 'one.csv', '--out', 'one.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return { dir, map: JSON.parse(readFileSync(join(dir, 'one.map.json'), 'utf8')) };
}

function startsAdventure(dir, map) {
  const v = masume(['validate', 'one.map.json'], { cwd: dir });
  assert.equal(v.code, 0, `書記の検査に通る: ${v.all}`);
  const n = masume(['new', 'one.map.json'], { cwd: dir });
  assert.equal(n.code, 0, `冒険を始められる: ${n.all}`);
  const id = map.characters[0].id;
  assert.deepEqual(view(dir).nodes[map.quest.goal].members, [id]);
  const c = masume(['check', id, '--dir', dir, '--as', id]);
  assert.equal(c.code, 1, '仮置きの判定は通らない');
  assert.match(c.all, /TODO\(GM\)/);
}

test('import linear: 担当者1人の CSV から、1人で始められる地図を作る', () => {
  const { dir, map } = importCsv([
    'SOLO-1,メモを書く,メモを1件書ける,Todo,Aki,frontend,2026-09-01T10:00:00.000Z,ひとりメモ',
    'SOLO-2,メモを保存する,保存できる,In Progress,Aki,backend,2026-09-02T10:00:00.000Z,ひとりメモ',
    'SOLO-3,書いて保存できる,結合テスト,Todo,Aki,E2E,2026-09-03T10:00:00.000Z,ひとりメモ',
    'SOLO-4,昔のメモ,もう済んだ,Done,Aki,,2026-08-01T10:00:00.000Z,ひとりメモ',
  ]);
  assert.equal(map.quest.id, 'SOLO');
  assert.equal(map.quest.goal, 'GOAL');
  assert.deepEqual(map.characters.map((c) => c.id), ['aki']);
  assert.deepEqual(map.characters[0].path, ['SOLO-1', 'SOLO-2', 'SOLO-3', 'GOAL']);
  assert.equal(map.nodes['SOLO-3'].type, 'task', '仲間がいないので E2E ラベルでも task');
  assert.equal(map.nodes.GOAL.type, 'gate');
  assert.equal(map.nodes['SOLO-4'], undefined, '完了済みは省く');
  startsAdventure(dir, map);
});

test('import linear: 担当者が空だけの CSV でも、名無し1人で始められる', () => {
  const { dir, map } = importCsv([
    'SOLO-1,メモを書く,,Todo,,,2026-09-01T10:00:00.000Z,ひとりメモ',
    'SOLO-2,メモを保存する,,Todo,,gate,2026-09-02T10:00:00.000Z,ひとりメモ',
  ]);
  assert.deepEqual(map.characters.map((c) => [c.id, c.name]), [['nanashi', '名無し']]);
  assert.deepEqual(map.characters[0].path, ['SOLO-1', 'SOLO-2', 'GOAL']);
  assert.equal(map.nodes['SOLO-2'].type, 'task');
  startsAdventure(dir, map);
});
