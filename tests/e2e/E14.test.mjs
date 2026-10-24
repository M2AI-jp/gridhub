// E14「GitHub につなぐ」— CONTRACTS §54.2（瓦版の順）と §56.1・§56.2（gridhub remote・gridhub push）。第12章。
// リモートは手元の bare リポジトリ、gh は偽のコマンド（MASUME_GH）。本物の GitHub には触らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  tmp, masume, masumeJson, view, setupDungeon, passAll, dungeonMap, gitc, gitRepo, bareRemote, remoteHead, commitFile,
  fakeGh, NO_GH, GIT_ENV,
} from '../helpers6.mjs';

const remote = (dir, gh = NO_GH) => masumeJson(['remote', '--dir', dir], { env: { ...GIT_ENV, MASUME_GH: gh } });
const steps = (data) => Object.fromEntries(data.steps.map((s) => [s.id, s]));

test('§54.2 瓦版は、号外と製品の話題を交互に（両方が上のほうに見える）', () => {
  const dir = tmp('gridhub-e14-news-');
  const map = dungeonMap();
  map.quest.news = ['メモアプリでは、タグで絞り込む作りがよく使われる', 'メモの同期では、あとから書いたほうを残す考え方がある', 'メモの検索では、本文の全文検索が使われる'];
  setupDungeon(dir, { map });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir }).code, 0);
  assert.deepEqual(view(dir).news.map((n) => n.kind), ['domain', 'domain', 'domain'], '号外が無ければ製品の話題だけ');
  passAll(dir, 'A1');
  assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
  passAll(dir, 'A2');
  assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
  const news = view(dir).news;
  assert.deepEqual(news.map((n) => n.kind), ['extra', 'domain', 'extra', 'domain', 'domain']);
  assert.match(news[0].text, /A2/, '号外は新しい順');
  assert.match(news[2].text, /A1/);
  assert.deepEqual(news.filter((n) => n.kind === 'domain').map((n) => n.text), map.quest.news, '製品の話題は地図の順');
});

test('§56.1 Git の外: inside は false、手引きの最初は git init', () => {
  const dir = tmp('gridhub-e14-out-');
  const r = remote(dir);
  assert.equal(r.code, 0, r.all);
  const d = r.data;
  assert.equal(d.inside, false);
  for (const k of ['branch', 'head', 'remote', 'upstream', 'ahead', 'behind']) assert.equal(d[k], null, k);
  assert.deepEqual(d.steps.map((s) => s.id), ['git', 'gh', 'login', 'repo', 'push']);
  assert.deepEqual(steps(d).git, { ...steps(d).git, done: false, command: 'git init' });
  assert.equal(masume(['remote', '--dir', dir], { env: { MASUME_GH: NO_GH } }).code, 0, 'テキスト版も 0');
  const p = masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(p.code, 2, p.all);
  assert.match(p.all, /E_NO_GIT/);
});

test('§56.1 リモートが無い: gh が入っているか・ログインしているかを手引きにする。push は E_NO_REMOTE', () => {
  const dir = gitRepo();
  const head = gitc(dir, 'rev-parse', 'HEAD').out;
  let d = remote(dir, NO_GH).data;
  assert.equal(d.inside, true);
  assert.equal(d.branch, 'main');
  assert.equal(d.head, head);
  assert.equal(d.remote, null);
  assert.equal(d.upstream, null);
  assert.deepEqual(d.gh, { installed: false, authenticated: null }, 'gh が無い');
  let s = steps(d);
  assert.equal(s.git.done, true);
  assert.equal(s.gh.done, false);
  assert.equal(s.gh.command, null);
  assert.match(s.gh.text, /https:\/\/cli\.github\.com\//);
  assert.deepEqual([s.login.done, s.login.command], [false, 'gh auth login']);
  assert.deepEqual([s.repo.done, s.repo.command], [false, `gh repo create ${basename(dir)} --private --source . --remote origin`]);
  assert.deepEqual([s.push.done, s.push.command], [false, 'gridhub push']);
  for (const x of d.steps) assert.ok(typeof x.text === 'string' && /[ぁ-んァ-ン一-龥]/.test(x.text), `${x.id} の text は日本語`);

  d = remote(dir, fakeGh('anon')).data;
  assert.deepEqual(d.gh, { installed: true, authenticated: false }, 'gh はあるがログインしていない');
  assert.equal(steps(d).gh.done, true);
  assert.equal(steps(d).login.done, false);
  d = remote(dir, fakeGh('authed')).data;
  assert.deepEqual(d.gh, { installed: true, authenticated: true });
  assert.equal(steps(d).login.done, true);

  const t = masume(['remote', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(t.code, 0, t.all);
  assert.ok(t.out.includes(`gh repo create ${basename(dir)} --private --source . --remote origin`), `テキスト版にまだの手引き: ${t.out}`);
  const p = masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(p.code, 2, p.all);
  assert.match(p.all, /E_NO_REMOTE/);
  assert.match(p.all, /gh repo create/, 'リモートの作り方を出す');
});

test('§56.2 手元の bare リポジトリに送る: 上流が無ければ -u で。送ったあと ahead は 0。フックは走らない', () => {
  const dir = gitRepo();
  const bare = bareRemote();
  assert.equal(gitc(dir, 'remote', 'add', 'origin', bare).code, 0);
  // 送る前に落ちるフック（GridHub は走らせない）
  mkdirSync(join(dir, '.git', 'hooks'), { recursive: true });
  writeFileSync(join(dir, '.git', 'hooks', 'pre-push'), '#!/bin/sh\necho "フックが走った" 1>&2\nexit 1\n');
  chmodSync(join(dir, '.git', 'hooks', 'pre-push'), 0o755);
  let d = remote(dir).data;
  assert.deepEqual(d.remote, { name: 'origin', url: bare, github: false });
  assert.equal(d.upstream, null);
  assert.equal(d.ahead, null);
  assert.equal(steps(d).repo.done, true);
  assert.equal(steps(d).push.done, false);
  assert.match(masume(['remote', '--dir', dir], { env: { MASUME_GH: NO_GH } }).out, /まだ一度も送っていない/);

  let p = masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(p.code, 0, p.all);
  const head = gitc(dir, 'rev-parse', 'HEAD').out;
  assert.ok(p.out.includes(`GitHub に送った: origin main（commit ${head.slice(0, 7)}）`), p.out);
  assert.equal(remoteHead(bare), head, 'bare リポジトリに届いた');
  d = remote(dir).data;
  assert.equal(d.upstream, 'origin/main');
  assert.equal(d.ahead, 0);
  assert.equal(d.behind, 0);
  assert.equal(steps(d).push.done, true);
  assert.match(masume(['remote', '--dir', dir], { env: { MASUME_GH: NO_GH } }).out, /GitHub に送っていないセーブ: 0/);

  // 2つコミットすると ahead 2、送ると 0
  commitFile(dir, 'a.txt', '1\n');
  const h2 = commitFile(dir, 'b.txt', '2\n');
  assert.equal(remote(dir).data.ahead, 2);
  assert.match(masume(['remote', '--dir', dir], { env: { MASUME_GH: NO_GH } }).out, /GitHub に送っていないセーブ: 2/);
  const j = masumeJson(['push', '--dir', dir], { env: { ...GIT_ENV, MASUME_GH: NO_GH } });
  assert.equal(j.code, 0, j.all);
  assert.deepEqual({ ...j.data, output: undefined }, { ok: true, remote: 'origin', branch: 'main', commit: h2, ahead: 0, output: undefined });
  assert.equal(typeof j.data.output, 'string');
  assert.equal(remoteHead(bare), h2);

  // github.com のリモートは github: true（送らない）
  assert.equal(gitc(dir, 'remote', 'set-url', 'origin', 'https://github.com/someone/memo.git').code, 0);
  assert.equal(remote(dir).data.remote.github, true);
});

test('§56.2 先に進んだリモートには force push しない。HEAD が切り離されていれば E_USAGE', () => {
  const dir = gitRepo();
  const bare = bareRemote();
  gitc(dir, 'remote', 'add', 'origin', bare);
  assert.equal(masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } }).code, 0);
  // ほかの人が先に送る
  const other = tmp('gridhub-e14-other-');
  assert.equal(gitc(other, 'clone', '-q', bare, '.').code, 0);
  const theirs = commitFile(other, 'theirs.txt', 'ほかの人\n');
  assert.equal(gitc(other, 'push', '-q', 'origin', 'main').code, 0);
  // 手元は別のコミット
  commitFile(dir, 'mine.txt', 'わたし\n');
  const p = masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(p.code, 1, `送れなければ 1: ${p.all}`);
  assert.equal(remoteHead(bare), theirs, 'リモートは上書きされない（force push しない）');
  // HEAD を切り離す
  gitc(dir, 'checkout', '-q', '--detach');
  const d = masume(['push', '--dir', dir], { env: { MASUME_GH: NO_GH } });
  assert.equal(d.code, 2, d.all);
  assert.match(d.all, /E_USAGE/);
  assert.equal(remote(dir).data.branch, null);
});
