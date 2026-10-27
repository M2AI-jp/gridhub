// E15「町でセーブしたら、自動で GitHub に送る」— CONTRACTS §59（第13章）。初めはオフ。force push はしない。送れなくても止まらない。
// リモートは手元の bare リポジトリ、gh は偽のコマンド（MASUME_GH）。本物の GitHub には触らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  tmp, masume, masumeJson, view, char, setupDungeon, passAll, gitc, bareRemote, remoteHead, commitFile, readLog,
  NO_GH, GIT_ENV,
} from '../helpers6.mjs';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const run = (dir, args) => masume([...args, '--dir', dir], { env: ENV });
const check = (dir, who) => run(dir, ['check', who, '--as', who]);
const events = (dir, type) => readLog(dir).filter((e) => e.type === type);
const write = (dir, file, text) => {
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), text);
};

/** Git の作業ツリーの中の、Git でセーブする冒険。remote: bare リポジトリをつなぐか */
function gitDungeon({ remote = true } = {}) {
  const dir = tmp('gridhub-e15-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const bare = remote ? bareRemote() : null;
  if (bare) assert.equal(gitc(dir, 'remote', 'add', 'origin', bare).code, 0);
  return { dir, bare };
}

/** a を町（AC）まで進める。縄張りに変更を書いてから A2 を抜ける */
function toTown(dir) {
  passAll(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  write(dir, 'a/x.js', 'export const x = 1;\n');
  passAll(dir, 'A2');
  const r = check(dir, 'a');
  assert.equal(r.code, 0, `送れても送れなくても、判定の結果は変わらない: ${r.all}`);
  assert.equal(char(view(dir), 'a').at, 'A3', '町を抜けて A3 へ');
  return events(dir, 'saved').find((e) => e.data.node === 'AC');
}

test('§59.1 設定は冒険ごと。初めはオフで、gridhub remote --auto-push on|off で切り替える', () => {
  const { dir } = gitDungeon();
  assert.equal(masumeJson(['remote', '--dir', dir], { env: ENV }).data.auto_push, false, '初めはオフ');
  let r = run(dir, ['remote', '--auto-push', 'on']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /町でセーブしたら GitHub に送る: オン/);
  assert.deepEqual(JSON.parse(readFileSync(join(dir, '.masume', 'git.json'), 'utf8')).auto_push, true);
  assert.equal(masumeJson(['remote', '--dir', dir], { env: ENV }).data.auto_push, true);
  r = run(dir, ['remote', '--auto-push', 'off']);
  assert.match(r.out, /町でセーブしたら GitHub に送る: オフ/);
  assert.equal(masumeJson(['remote', '--dir', dir], { env: ENV }).data.auto_push, false);
  const bad = run(dir, ['remote', '--auto-push', 'maybe']);
  assert.equal(bad.code, 2, bad.all);
  assert.match(bad.all, /E_USAGE/);
  const none = masume(['remote', '--auto-push', 'on', '--dir', tmp('gridhub-e15-none-')], { env: ENV });
  assert.equal(none.code, 2, none.all);
  assert.match(none.all, /E_NO_GAME/);
  // 壊れた設定はオフ
  writeFileSync(join(dir, '.masume', 'git.json'), '{こわれた');
  assert.equal(masumeJson(['remote', '--dir', dir], { env: ENV }).data.auto_push, false);
});

test('§59.2 オフなら送らない（pushed も記録しない）', () => {
  const { dir, bare } = gitDungeon();
  const town = toTown(dir);
  assert.ok(town?.data.commit, '町でセーブした');
  assert.deepEqual(events(dir, 'pushed'), []);
  assert.equal(remoteHead(bare), null, 'bare リポジトリには何も届いていない');
  assert.equal(view(dir).push, null);
});

test('§59.2〜§59.4 オンなら、町と結合ゲートのセーブのあとに送り、pushed を記録する。status に出る', () => {
  const { dir, bare } = gitDungeon();
  assert.equal(run(dir, ['remote', '--auto-push', 'on']).code, 0);
  const town = toTown(dir);
  const log = readLog(dir);
  const at = log.findIndex((e) => e.seq === town.seq);
  assert.equal(log[at + 1]?.type, 'pushed', 'saved のすぐ後に pushed');
  assert.deepEqual(log[at + 1].data, { node: 'AC', commit: town.data.commit, remote: 'origin', branch: 'main', ok: true });
  assert.equal(remoteHead(bare), town.data.commit, '町のセーブが bare リポジトリに届いた');
  let v = view(dir);
  assert.deepEqual(v.push, { seq: log[at + 1].seq, node: 'AC', ok: true, commit: town.data.commit, remote: 'origin', branch: 'main', error: null });
  assert.equal(v.log.find((e) => e.seq === log[at + 1].seq).text, `GitHub に送った: origin main（commit ${town.data.commit.slice(0, 7)}）`);
  const lines = run(dir, ['status']).out.trim().split('\n');
  assert.equal(lines.at(-2), `GitHub: 送った（origin main・commit ${town.data.commit.slice(0, 7)}）`, '記録の目印のすぐ前');
  assert.match(lines.at(-1), /^記録: seq \d+/);
  assert.equal(events(dir, 'saved').filter((e) => e.data.node === null).length, 1);
  assert.ok(!readLog(dir).some((e, i, all) => e.type === 'saved' && e.data.node === null && all[i + 1]?.type === 'pushed'), 'ふりだしでは送らない');

  // 結合ゲート（G1）を突破したセーブも送る
  passAll(dir, 'B1');
  assert.equal(check(dir, 'b').code, 0);
  write(dir, 'b/ui.js', 'export const ui = 1;\n');
  passAll(dir, 'B2');
  assert.equal(check(dir, 'b').code, 0);
  passAll(dir, 'G1');
  passAll(dir, 'A3');
  const r = check(dir, 'a');
  assert.equal(r.code, 0, r.all);
  const gate = events(dir, 'saved').find((e) => e.data.node === 'G1');
  assert.ok(gate?.data.commit, 'ゲートでセーブした');
  const pushed = events(dir, 'pushed').at(-1);
  assert.equal(pushed.data.node, 'G1');
  assert.equal(pushed.data.ok, true);
  assert.equal(remoteHead(bare), gate.data.commit);
  v = view(dir);
  assert.equal(v.push.node, 'G1');
});

test('§59.2〜§59.4 送れなくても冒険は止めない（先に進んだリモート・リモートなし）。force push しない', () => {
  const { dir, bare } = gitDungeon();
  assert.equal(run(dir, ['remote', '--auto-push', 'on']).code, 0);
  // ほかの人が先に送っておく
  const other = tmp('gridhub-e15-other-');
  assert.equal(gitc(other, 'clone', '-q', bare, '.').code, 0);
  assert.equal(gitc(other, 'checkout', '-q', '-b', 'main').code, 0);
  const theirs = commitFile(other, 'theirs.txt', 'ほかの人\n');
  assert.equal(gitc(other, 'push', '-q', 'origin', 'main').code, 0);
  const town = toTown(dir);
  const pushed = events(dir, 'pushed').at(-1);
  assert.equal(pushed.data.ok, false);
  assert.equal(pushed.data.node, 'AC');
  assert.equal(pushed.data.commit, town.data.commit);
  assert.ok(typeof pushed.data.error === 'string' && pushed.data.error.length > 0 && !pushed.data.error.includes('\n'), 'error は理由の1行');
  assert.equal(remoteHead(bare), theirs, 'リモートは上書きされない（force push しない）');
  const v = view(dir);
  assert.equal(v.push.ok, false);
  assert.equal(v.log.find((e) => e.seq === pushed.seq).text, `GitHub に送れなかった: ${pushed.data.error}`);
  const lines = run(dir, ['status']).out.trim().split('\n');
  assert.equal(lines.at(-2), `GitHub: 送れなかった（${pushed.data.error}）。gridhub push でもう一度送れる`);

  // リモートが無ければ code E_NO_REMOTE
  const lone = gitDungeon({ remote: false });
  assert.equal(run(lone.dir, ['remote', '--auto-push', 'on']).code, 0);
  toTown(lone.dir);
  const p = events(lone.dir, 'pushed').at(-1);
  assert.equal(p.data.ok, false);
  assert.equal(p.data.code, 'E_NO_REMOTE');
  assert.ok(existsSync(join(lone.dir, '.masume', 'git.json')));
});
