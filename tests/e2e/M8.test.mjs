// M8「テストのチェックリスト」— CONTRACTS §48（第11章）の地図職人の分。
// export linear の Description（Linear・Jira の push も同じ文）に、地図に cases があるマスだけ「テスト:」のチェックリストを足す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { masumeEnv, fakeLinear, LINEAR_KEY } from '../helpers2.mjs';
import { fakeJira, JIRA_ENV } from '../helpers3.mjs';
import { masumeJson, gridhub, newDungeon, setCases, CASES } from '../helpers5.mjs';
import { adfToText } from '../../src/jira/sync.js';

const describe = (dir) => Object.fromEntries(masumeJson(['export', 'linear', '--dir', dir]).data.map((i) => [i.ID, i.Description]));

test('§48 export linear: cases のあるマスは、判定の行のあとに空行と「テスト:」、1件ずつ - [x] / - [ ]', () => {
  const dir = newDungeon();
  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  const d = describe(dir);
  const run = `node checks/cases.mjs A1 '${JSON.stringify(CASES.A1)}'`;
  assert.equal(d.A1, `\n\n判定: \`${run}\`\n\nテスト:\n- [x] x が 1\n- [ ] y が 2`);
  assert.match(d.A2, /\n\nテスト:\n- \[ \] z が 3\n- \[ \] w が 4\n- \[ \] v が 5$/, 'まだ戦っていないテストは [ ]');
  assert.match(d.G1, /\n\nテスト:\n- \[ \] 結合 1\n- \[ \] 結合 2$/, 'ゲートにも');
  assert.doesNotMatch(d.FIN, /テスト:/, 'cases の無いマスの文は第10章どおり');
  assert.match(d.FIN, /判定: `node checks\/flag\.mjs FIN`$/);
  assert.doesNotMatch(d.H1, /テスト:/, 'ハンコのマスにはない');
});

test('§48 Linear と Jira の push も同じ文を使う', async () => {
  const dir = newDungeon();
  setCases(dir, 'A1', { 'x が 1': 'ok', 'y が 2': 'fail' });
  gridhub(['step', 'a', '--dir', dir]);
  const expected = describe(dir);

  const linear = await fakeLinear();
  try {
    const r = await masumeEnv(['linear', 'push', '--team', 'TOY', '--dir', dir], { cwd: dir, env: { MASUME_LINEAR_URL: linear.url, LINEAR_API_KEY: LINEAR_KEY } });
    assert.equal(r.code, 0, r.all);
    const a1 = linear.db.issues.find((i) => i.title === '[A1] POST /api/x で x を保存する');
    assert.equal(a1.description, expected.A1);
  } finally {
    await linear.close();
  }

  const jira = await fakeJira();
  try {
    const r = await masumeEnv(['jira', 'push', '--project', 'TOY', '--dir', dir], { cwd: dir, env: JIRA_ENV(jira.url) });
    assert.equal(r.code, 0, r.all);
    const a1 = jira.db.issues.find((i) => /POST \/api\/x で x を保存する/.test(i.fields.summary));
    assert.equal(adfToText(a1.fields.description).trim(), expected.A1.trim());
  } finally {
    await jira.close();
  }
});
