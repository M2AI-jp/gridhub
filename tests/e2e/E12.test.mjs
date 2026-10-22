// E12「記録の番号と Git のコミットで指す」— CONTRACTS §52（第11章・ユーザーの指示）。
// ふっかつのじゅもんはやめた。改ざんを見つける仕組み（ハッシュの鎖・verify）と、過去の時点に戻る機能（load）は残し、
// 人に見せる目印と戻り先の指し方を、記録の番号（seq）と Git のコミットにする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ROOT, tmp, masume, masumeJson, view, char, setupDungeon, passAll, git, gitInit, GIT_ENV, events, readLog,
} from '../helpers5.mjs';

const run = (dir, args) => masume([...args, '--dir', dir], { env: GIT_ENV });
const runJson = (dir, args) => masumeJson([...args, '--dir', dir], { env: GIT_ENV });
const check = (dir, who) => run(dir, ['check', who, '--as', who]);
const lastLine = (r) => r.out.trim().split('\n').pop().trim();
const short = (sha) => sha.slice(0, 7);
const record = (seq, commit) => `記録: seq ${seq}${commit ? ` / Git: commit ${short(commit)}` : ''}`;
// 数字だけの短いコミットは seq と読まれる（§52.5）ので、英字が入るところまで伸ばす
const prefix = (sha) => sha.slice(0, Math.max(7, sha.search(/[a-f]/) + 1));
// 人の手のコミット（名前とメールは一時的に与える）
const handCommit = (dir, file, text) => {
  writeFileSync(join(dir, file), text);
  assert.equal(git(dir, ['add', file]).code, 0);
  const r = git(dir, ['-c', 'user.name=人', '-c', 'user.email=human@localhost', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', `手で ${file}`]);
  assert.equal(r.code, 0, r.err);
  return git(dir, ['rev-parse', 'HEAD']).out;
};

function gitDungeon() {
  const dir = tmp('gridhub-e12-');
  gitInit(dir);
  setupDungeon(dir, { save: true });
  const r = masume(['new', 'dungeon.map.json'], { cwd: dir, env: GIT_ENV });
  assert.equal(r.code, 0, r.all);
  return { dir, out: r };
}

test('じゅもんのコマンド・オプション・欄は、どこにも無い', async () => {
  const { dir } = gitDungeon();
  const jumon = run(dir, ['jumon']);
  assert.equal(jumon.code, 2, jumon.all);
  assert.match(jumon.all, /E_USAGE/);
  const flag = run(dir, ['verify', '--jumon', 'あいう えおか きくけ こさし']);
  assert.equal(flag.code, 2, flag.all);
  assert.match(flag.all, /E_USAGE/);
  for (const help of [masume(['--help']), masume(['verify', '--help']), masume(['load', '--help'])]) {
    assert.doesNotMatch(help.all, /じゅもん|jumon/i, help.all);
  }
  for (const args of [['status', '--json'], ['brief', 'a', '--json'], ['verify', '--json'], ['log', '--json']]) {
    const r = run(dir, args);
    assert.equal(r.code, 0, r.all);
    assert.doesNotMatch(r.out, /jumon|じゅもん/i, `${args.join(' ')} の JSON にじゅもんが無い`);
  }
  for (const args of [['status'], ['brief', 'a'], ['verify'], ['log']]) {
    assert.doesNotMatch(run(dir, args).all, /じゅもん|jumon/i, `${args.join(' ')} の字にじゅもんが無い`);
  }
  const engine = await import(pathToFileURL(join(ROOT, 'src', 'engine', 'index.js')).href);
  assert.equal(engine.jumonOf, undefined, 'エンジンは jumonOf を出さない');
  for (const f of ['src/engine/jumon.js', 'src/commands/jumon.js']) assert.ok(!existsSync(join(ROOT, f)), `${f} は消す`);
});

test('head は {seq, hash, commit}: commit は、その記録が見ていた Git のコミット（ビューは Git を呼ばない）', () => {
  const { dir, out } = gitDungeon();
  const start = events(dir, 'saved')[0].data.commit; // ふりだしのセーブ
  assert.match(start, /^[0-9a-f]{40}$/);
  let log = readLog(dir);
  let v = view(dir);
  assert.deepEqual(v.head, { seq: log.at(-1).seq, hash: log.at(-1).hash, commit: start });
  assert.equal(lastLine(out), record(v.head.seq, start), 'new の最後の行は記録の目印');
  assert.deepEqual(runJson(dir, ['verify']).data.head, v.head, 'verify --json の head も同じ');
  const b = runJson(dir, ['brief', 'a']).data;
  assert.equal(b.seq, v.head.seq);
  assert.equal(b.commit, start);

  // 人の手でコミットしても、冒険の書に記録されるまでは head.commit は変わらない
  const hand = handCommit(dir, 'notes.txt', 'メモ\n');
  assert.equal(view(dir).head.commit, start, 'ビューは冒険の書だけから決まる');
  // 歩く（stepped）と、そのとき見ていたコミットが記録される
  passAll(dir, 'A1');
  const st = run(dir, ['step', 'a', '--as', 'a']);
  assert.equal(st.code, 0, st.all);
  log = readLog(dir);
  assert.equal(log.at(-1).type, 'stepped');
  assert.equal(log.at(-1).data.git.head, hand);
  v = view(dir);
  assert.equal(v.head.commit, hand);
  assert.deepEqual(runJson(dir, ['verify']).data.head, { seq: log.at(-1).seq, hash: log.at(-1).hash, commit: hand });
});

test('記録の目印 `記録: seq N / Git: commit abc1234` を status・brief・amend・load が出す', () => {
  const { dir } = gitDungeon();
  passAll(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  let v = view(dir);
  const s = run(dir, ['status']);
  assert.equal(lastLine(s), record(v.head.seq, v.head.commit), 'status の最後の行');
  assert.match(lastLine(s), /^記録: seq \d+ \/ Git: commit [0-9a-f]{7}$/);
  const b = run(dir, ['brief', 'a']);
  assert.ok(b.out.includes(record(v.head.seq, v.head.commit)), `brief に記録の目印: ${b.out}`);

  const map = JSON.parse(readFileSync(join(dir, 'dungeon.map.json'), 'utf8'));
  map.nodes.A2.title = 'GET /api/x で x の一覧を返す';
  writeFileSync(join(dir, 'next.map.json'), JSON.stringify(map, null, 2));
  const a = masume(['amend', 'next.map.json', '--dir', dir, '--as', 'gm'], { cwd: dir, env: GIT_ENV });
  assert.equal(a.code, 0, a.all);
  v = view(dir);
  assert.equal(lastLine(a), record(v.head.seq, v.head.commit), 'amend の最後の行');

  const l = run(dir, ['load', '0', '--as', 'gm']);
  assert.equal(l.code, 0, l.all);
  v = view(dir);
  assert.equal(lastLine(l), record(v.head.seq, v.head.commit), 'load の最後の行');
});

test('load <commit>: 町の看板の commit で、その町でセーブした時点に戻る。知らない・短すぎるコミットは E_LOAD', () => {
  const { dir } = gitDungeon();
  passAll(dir, 'A1');
  passAll(dir, 'A2');
  assert.equal(check(dir, 'a').code, 0);
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'a', 'x.js'), 'export const x = 1;\n'); // 縄張りの変更（町でコミットされる）
  assert.equal(check(dir, 'a').code, 0); // A2 を抜けて町（AC）でセーブし、A3 へ
  const town = events(dir, 'saved').find((e) => e.data.node === 'AC');
  assert.ok(town && town.data.commit && town.data.changed, '町で縄張りの変更をセーブした');
  assert.equal(view(dir).nodes.AC.save.commit, town.data.commit, '町の看板の commit');
  const at = char(view(dir), 'a');
  passAll(dir, 'A3');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'G1', 'A3 を抜けて砦で待つ');

  const r = run(dir, ['load', prefix(town.data.commit), '--as', 'gm']);
  assert.equal(r.code, 0, r.all);
  assert.deepEqual(readLog(dir).at(-1).data, { to_seq: town.seq }, 'その町でセーブした時点（saved の seq）');
  const back = char(view(dir), 'a');
  assert.equal(back.at, at.at);
  assert.equal(back.level, at.level);
  assert.equal(run(dir, ['verify']).code, 0, 'ロードしても鎖は正常');

  for (const bad of ['0123abc', 'deadbeefdeadbeef', 'abc', 'g123456', 'seq 3']) {
    const x = run(dir, ['load', bad, '--as', 'gm']);
    assert.equal(x.code, 2, `${bad}: ${x.all}`);
    assert.match(x.all, /E_LOAD/, bad);
  }
});
