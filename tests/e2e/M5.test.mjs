// M5「Jira と同期する」— CONTRACTS §20（偽の Jira REST v3 で判定する）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, newToy, flag, unflag, fakeJira, JIRA_ENV, NOTE_JIRA } from '../helpers3.mjs';

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
const jira = (args, env, cwd) => masumeEnv(['jira', ...args], { cwd, env });

test('push: マスが Jira の issue になり、状態は遷移でそろう。2回目は更新', async () => {
  const dir = toyInProgress();
  const mock = await fakeJira();
  const env = JIRA_ENV(mock.url);
  try {
    const noAuth = await jira(['push', '--project', 'TOY', '--dir', dir], { MASUME_JIRA_URL: mock.url, JIRA_EMAIL: '', JIRA_API_TOKEN: '', JIRA_BASE_URL: '' }, dir);
    assert.equal(noAuth.code, 2, noAuth.all);
    assert.match(noAuth.all, /E_JIRA_AUTH/);
    const noProject = await jira(['push', '--project', 'ZZZ', '--dir', dir], env, dir);
    assert.equal(noProject.code, 2, noProject.all);
    assert.match(noProject.all, /E_JIRA/);

    const r = await jira(['push', '--project', 'TOY', '--dir', dir], env, dir);
    assert.equal(r.code, 0, r.all);
    assert.match(r.all, /作成 10件/);
    assert.equal(mock.db.issues.length, 10);
    const by = Object.fromEntries(mock.db.issues.map((i) => [i.fields.summary, i]));
    const a1 = by['[A1] 剣をとぐ'];
    assert.ok(a1);
    assert.equal(a1.fields.issuetype.name, 'Task');
    assert.equal(a1.fields.project.key, 'TOY');
    assert.equal(a1.fields.description.type, 'doc');
    assert.match(JSON.stringify(a1.fields.description), /判定: `node checks\/flag\.mjs A1`/);
    assert.ok(a1.fields.labels.includes('masume') && a1.fields.labels.includes('a'));
    assert.ok(by['[B1] 呪文をおぼえる'].fields.labels.includes('masume-stale'));
    assert.ok(by['[G1] 洞窟の番人'].fields.labels.includes('gate'));
    assert.equal(a1.fields.status.statusCategory.key, 'done', 'Done へ遷移');
    assert.equal(by['[A2] 盾をみがく'].fields.status.statusCategory.key, 'indeterminate', 'In Progress へ遷移');
    assert.equal(by['[A3] 洞窟をしらべる'].fields.status.statusCategory.key, 'new');
    assert.ok(mock.db.requests.every((q) => q.headers.authorization.startsWith('Basic ')));
    const saved = JSON.parse(readFileSync(join(dir, '.masume', 'jira.json'), 'utf8'));
    assert.equal(saved.project, 'TOY');
    assert.equal(Object.keys(saved.issues).length, 10);
    assert.match(saved.issues.A1.key, /^TOY-\d+$/);
    assert.match(r.all, /遷移 \d+件/);

    flag(dir, 'A2');
    assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
    const r2 = await jira(['push', '--dir', dir], env, dir);
    assert.equal(r2.code, 0, r2.all);
    assert.match(r2.all, /作成 0件・更新 10件/);
    assert.equal(mock.db.issues.length, 10);
    assert.equal(by['[A2] 盾をみがく'].fields.status.statusCategory.key, 'done');

    const n = mock.db.requests.length;
    const d = await jira(['push', '--dir', dir, '--dry-run'], env, dir);
    assert.equal(d.code, 0, d.all);
    assert.match(d.all, /A1.*Done/);
    assert.equal(mock.db.requests.length, n, 'dry-run は通信しない');
  } finally {
    await mock.close();
  }
});

test('pull: Jira の issue から地図の下書きを作る', async () => {
  const mock = await fakeJira({ seedIssues: NOTE_JIRA });
  const dir = tmp('masume-jira-');
  const out = join(dir, 'notes.map.json');
  try {
    const r = await jira(['pull', '--project', 'NOTE', '--out', out], JIRA_ENV(mock.url), dir);
    assert.equal(r.code, 0, r.all);
    assert.ok(existsSync(out));
    const m = JSON.parse(readFileSync(out, 'utf8'));
    assert.deepEqual(m.characters.map((c) => c.id), ['aki', 'ben', 'nanashi']);
    assert.equal(m.nodes['NOTE-5'].type, 'gate');
    assert.equal(m.nodes['NOTE-6'], undefined, '完了済みは省く');
    assert.match(m.nodes['NOTE-2'].detail, /重複はエラー/);
    assert.equal(masume(['validate', out]).code, 0);
    const search = mock.db.requests.find((q) => q.path === '/rest/api/3/search/jql');
    assert.match(search.body.jql, /project\s*=\s*"?NOTE"?/);
  } finally {
    await mock.close();
  }
});
