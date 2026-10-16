// M3「Linearと文通する」— masume export linear（json/csv）と masume import linear（Linear CSV → 地図の下書き）。CONTRACTS §9。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, masumeJson, newToy, flag, unflag } from '../helpers.mjs';

const HEADER = 'ID,Title,Description,Status,Assignee,Project,Milestone,Labels,Estimate';

/** RFC 4180 の CSV を読む（判定用の小さな実装） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) row.push(cell), rows.push(row);
  return rows;
}

function toyInProgress() {
  const dir = newToy();
  flag(dir, 'A1');
  assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
  flag(dir, 'B1');
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 0);
  unflag(dir, 'B1');
  flag(dir, 'B2');
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 1); // B1 が消しゴムで消される
  return dir;
}

test('export linear --format json: マスが Linear の issue になる', () => {
  const dir = toyInProgress();
  const r = masumeJson(['export', 'linear', '--dir', dir, '--format', 'json']);
  assert.equal(r.code, 0, r.all);
  const rows = Object.fromEntries(r.data.map((x) => [x.ID, x]));
  assert.deepEqual(Object.keys(rows).sort(), ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'FIN', 'G1', 'H1'], '宿屋以外のマス');
  assert.equal(rows.A1.Status, 'Done');
  assert.equal(rows.A2.Status, 'In Progress');
  assert.equal(rows.A3.Status, 'Backlog');
  assert.equal(rows.H1.Status, 'In Progress');
  assert.equal(rows.B1.Status, 'Todo');
  assert.ok(rows.B1.Labels.includes('要再検証'));
  assert.equal(rows.A1.Title, '剣をとぐ');
  assert.equal(rows.A1.Assignee, '戦士アリス');
  assert.equal(rows.G1.Assignee, '戦士アリス & 魔法使いボブ');
  assert.equal(rows.A1.Project, 'おもちゃの冒険');
  assert.equal(rows.A1.Milestone, '洞窟の番人');
  assert.equal(rows.G1.Milestone, '洞窟の番人');
  assert.equal(rows.H1.Milestone, 'あがり');
  assert.deepEqual(rows.A1.Labels, ['a']);
  assert.deepEqual(rows.G1.Labels, ['gate']);
  assert.match(rows.A1.Description, /判定: `node checks\/flag\.mjs A1`/);
  assert.match(rows.H1.Description, /判定: 勇者ひとみのハンコ/);
  assert.equal(rows.A1.Estimate ?? '', '');
});

test('export linear --format csv --out: Linear に取り込める CSV', () => {
  const dir = toyInProgress();
  const out = join(dir, 'linear.csv');
  const r = masume(['export', 'linear', '--dir', dir, '--format', 'csv', '--out', out]);
  assert.equal(r.code, 0, r.all);
  const text = readFileSync(out, 'utf8');
  assert.equal(text.split(/\r?\n/)[0], HEADER);
  const rows = parseCsv(text.trim());
  assert.deepEqual(rows[0], HEADER.split(','));
  assert.equal(rows.length, 11, '見出し + 10件');
  const b1 = rows.find((x) => x[0] === 'B1');
  assert.equal(b1[3], 'Todo');
  assert.equal(b1[7], 'b,要再検証', 'ラベルはカンマ区切りの1セル');
  const json = masumeJson(['export', 'linear', '--dir', dir]);
  assert.equal(json.code, 0, '既定は json');
  assert.ok(Array.isArray(json.data));
});

test('import linear: Linear の CSV から地図の下書きを作る', () => {
  const dir = tmp('masume-import-');
  const out = join(dir, 'notes.map.json');
  const r = masume(['import', 'linear', join(ROOT, 'tests', 'fixtures', 'linear-sample.csv'), '--out', out], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  const m = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(m.masume, 1);
  assert.equal(m.quest.id, 'NOTE');
  assert.equal(m.quest.title, 'ノートアプリ');
  assert.equal(m.quest.goal, 'GOAL');
  assert.match(m.quest.pitch, /1/, '省いた完了済みの件数');
  assert.deepEqual(m.characters.map((c) => c.id), ['aki', 'ben', 'nanashi']);
  assert.deepEqual(m.characters.map((c) => c.name), ['Aki', 'Ben', '名無し']);
  const path = Object.fromEntries(m.characters.map((c) => [c.id, c.path]));
  assert.deepEqual(path.aki, ['NOTE-1', 'NOTE-4', 'NOTE-5', 'GOAL']);
  assert.deepEqual(path.ben, ['NOTE-2', 'NOTE-3', 'NOTE-5', 'NOTE-8', 'GOAL']);
  assert.deepEqual(path.nanashi, ['NOTE-7', 'GOAL']);
  assert.equal(m.nodes['NOTE-6'], undefined, '完了済みは省く');
  assert.equal(m.nodes['NOTE-5'].type, 'gate', 'E2E ラベルはゲート');
  assert.equal(m.nodes.GOAL.type, 'gate');
  assert.equal(m.nodes['NOTE-1'].estimate, 3);
  assert.match(m.nodes['NOTE-2'].detail, /重複はエラー/);
  assert.match(m.nodes['NOTE-4'].detail, /プレビューつき/);
  for (const n of Object.values(m.nodes)) {
    assert.equal(n.check.kind, 'cmd');
    assert.match(n.check.run, /TODO\(GM\)/, '判定は GM が書くまで仮置き');
  }
  const v = masume(['validate', out]);
  assert.equal(v.code, 0, `書記の検査に通る: ${v.all}`);
  // そのまま冒険を始められる（ただし仮の判定は通らない）
  assert.equal(masume(['new', out], { cwd: dir }).code, 0);
  const c = masume(['check', 'aki', '--dir', dir, '--as', 'aki']);
  assert.equal(c.code, 1, '仮置きの判定は通らない');
  assert.match(c.all, /TODO\(GM\)/);
});
