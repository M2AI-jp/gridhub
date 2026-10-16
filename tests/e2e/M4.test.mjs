// M4「Linear と同期する」— CONTRACTS §16（偽の Linear GraphQL で判定する）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, newToy, flag, unflag, fakeLinear, LINEAR_KEY, NOTE_ISSUES } from '../helpers2.mjs';

function toyInProgress() {
  const dir = newToy();
  flag(dir, 'A1');
  assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
  flag(dir, 'B1');
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 0);
  unflag(dir, 'B1');
  flag(dir, 'B2');
  assert.equal(masume(['check', 'b', '--dir', dir, '--as', 'b']).code, 1);
  return dir;
}

const linear = (args, env, cwd) => masumeEnv(['linear', ...args], { cwd, env });

test('push: マスが Linear の issue になり、状態がそろう。2回目は更新だけ', async () => {
  const dir = toyInProgress();
  const mock = await fakeLinear();
  const env = { MASUME_LINEAR_URL: mock.url, LINEAR_API_KEY: LINEAR_KEY };
  try {
    const noKey = await linear(['push', '--team', 'TOY', '--dir', dir], { MASUME_LINEAR_URL: mock.url, LINEAR_API_KEY: '' }, dir);
    assert.equal(noKey.code, 2, noKey.all);
    assert.match(noKey.all, /E_LINEAR_AUTH/);

    const r = await linear(['push', '--team', 'TOY', '--dir', dir], env, dir);
    assert.equal(r.code, 0, r.all);
    assert.match(r.all, /作成 10件/);
    assert.equal(mock.db.projects.length, 1);
    assert.equal(mock.db.projects[0].name, 'おもちゃの冒険');
    const byTitle = Object.fromEntries(mock.db.issues.map((i) => [i.title, i]));
    assert.equal(mock.db.issues.length, 10, '宿屋以外の10マス');
    assert.ok(byTitle['[A1] 剣をとぐ']);
    assert.equal(byTitle['[A1] 剣をとぐ'].stateId, 's-done');
    assert.equal(byTitle['[A2] 盾をみがく'].stateId, 's-progress');
    assert.equal(byTitle['[A3] 洞窟をしらべる'].stateId, 's-backlog');
    assert.equal(byTitle['[B1] 呪文をおぼえる'].stateId, 's-todo', '消された（要再検証）は Todo');
    assert.equal(byTitle['[G1] 洞窟の番人'].stateId, 's-backlog');
    assert.equal(byTitle['[H1] 王様にあいさつ'].stateId, 's-progress');
    assert.ok(mock.db.issues.every((i) => i.teamId === 'team-msm' && i.projectId === mock.db.projects[0].id));
    assert.match(byTitle['[A1] 剣をとぐ'].description, /判定: `node checks\/flag\.mjs A1`/);
    assert.ok(mock.db.requests.every((q) => q.headers.authorization === LINEAR_KEY && typeof q.body.operationName === 'string'));
    const saved = JSON.parse(readFileSync(join(dir, '.masume', 'linear.json'), 'utf8'));
    assert.equal(saved.team, 'TOY');
    assert.equal(saved.project.name, 'おもちゃの冒険');
    assert.equal(Object.keys(saved.issues).length, 10);
    assert.match(saved.issues.A1.identifier, /^TOY-\d+$/);

    // 進めてからもう一度（チームは linear.json から）
    flag(dir, 'A2');
    assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
    const before = mock.db.requests.length;
    const r2 = await linear(['push', '--dir', dir], env, dir);
    assert.equal(r2.code, 0, r2.all);
    assert.match(r2.all, /作成 0件・更新 10件/);
    assert.equal(mock.db.issues.length, 10);
    assert.equal(mock.db.projects.length, 1, 'プロジェクトは作り直さない');
    assert.equal(byTitle['[A2] 盾をみがく'].stateId, 's-done');
    assert.ok(mock.db.requests.slice(before).some((q) => q.body.operationName === 'MasumeIssueUpdate'));

    // --dry-run は通信しない
    const n = mock.db.requests.length;
    const d = await linear(['push', '--dir', dir, '--dry-run'], env, dir);
    assert.equal(d.code, 0, d.all);
    assert.match(d.all, /A1.*Done/);
    assert.equal(mock.db.requests.length, n);
  } finally {
    await mock.close();
  }
});

test('pull: Linear の issue から地図の下書きを作る', async () => {
  const mock = await fakeLinear({ seedIssues: NOTE_ISSUES });
  const dir = tmp('masume-pull-');
  const out = join(dir, 'notes.map.json');
  try {
    const r = await linear(['pull', '--team', 'NOTE', '--project', 'ノートアプリ', '--out', out], { MASUME_LINEAR_URL: mock.url, LINEAR_API_KEY: LINEAR_KEY }, dir);
    assert.equal(r.code, 0, r.all);
    assert.ok(existsSync(out));
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(m.characters.map((c) => c.id), ['aki', 'ben', 'nanashi']);
    assert.equal(m.nodes['NOTE-5'].type, 'gate');
    assert.equal(m.nodes['NOTE-6'], undefined, '完了済みは省く');
    assert.deepEqual(m.characters.find((c) => c.id === 'ben').path, ['NOTE-2', 'NOTE-3', 'NOTE-5', 'NOTE-8', 'GOAL']);
    assert.equal(masume(['validate', out]).code, 0);
    assert.ok(mock.db.requests.some((q) => q.body.operationName === 'MasumeIssues' && q.body.variables.key === 'NOTE'));
  } finally {
    await mock.close();
  }
});
