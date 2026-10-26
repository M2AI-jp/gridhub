// E13「余白のマス」— CONTRACTS §53（第11章・ユーザーの指示）。開発に関係する、良い余白。
// 余白は進みを止めない。駒が通ると、別の担当との会話（talk）・町の住人との雑談（npc）・瓦版（news）が起きる。
// 出来事は冒険の書と地図に本当にあることからだけ作る。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  tmp, masume, view, char, setupDungeon, passAll, dungeonMap, git, gitInit, GIT_ENV, events, readLog,
} from '../helpers5.mjs';

const NEWS = ['メモアプリでは、全文検索より先にタグで絞り込む作りがよく使われる', 'オフラインでも書けて、つながったら同期する、という考え方がある'];
const run = (dir, args) => masume([...args, '--dir', dir], { env: GIT_ENV });
const check = (dir, who) => run(dir, ['check', who, '--as', who]);
const note = (dir, who, text) => assert.equal(run(dir, ['note', who, text, '--as', who]).code, 0);
const margin = (v, id) => v.margins.find((m) => m.id === id);
const ok = (cases) => (cases ?? []).filter((c) => c.ok === true).length;

function gitDungeon({ news = NEWS, save = true } = {}) {
  const dir = tmp('gridhub-e13-');
  if (save) gitInit(dir);
  const map = dungeonMap({ save });
  if (news) map.quest.news = news;
  setupDungeon(dir, { save, map });
  const r = masume(['new', 'dungeon.map.json'], { cwd: dir, env: GIT_ENV });
  assert.equal(r.code, 0, r.all);
  return dir;
}

test('§53.1 地図の quest.news: 文字列の配列（0〜20件・各1〜200字）でなければ E_FORMAT', () => {
  const dir = tmp('gridhub-e13-');
  const bad = ['話題', [''], ['あ'.repeat(201)], Array.from({ length: 21 }, (_, i) => `話題 ${i}`), [1]];
  for (const news of bad) {
    const map = dungeonMap();
    map.quest.news = news;
    writeFileSync(join(dir, 'm.json'), JSON.stringify(map));
    const r = masume(['validate', 'm.json'], { cwd: dir });
    assert.equal(r.code, 1, `${JSON.stringify(news).slice(0, 40)}: ${r.all}`);
    assert.match(r.all, /E_FORMAT/);
  }
  for (const news of [[], NEWS, Array.from({ length: 20 }, (_, i) => `話題 ${i}`)]) {
    const map = dungeonMap();
    map.quest.news = news;
    writeFileSync(join(dir, 'm.json'), JSON.stringify(map));
    assert.equal(masume(['validate', 'm.json'], { cwd: dir }).code, 0, JSON.stringify(news).slice(0, 40));
  }
});

test('§53.2・§53.4 余白のマスは task と camp のすぐ後に1つ。町の後は npc、合流の前は talk、ほかは news。まだ起きていなければ lines は空', () => {
  const dir = gitDungeon();
  const v = view(dir);
  // a: A1 A2 AC A3 G1 FIN / b: B1 B2 G1 FIN / h: H1 FIN（G1 のメンバーは a b、FIN は a b h）
  assert.deepEqual(v.margins.map((m) => [m.id, m.road, m.after, m.kind]), [
    ['m-A1', 'a', 'A1', 'news'], ['m-A2', 'a', 'A2', 'news'], ['m-AC', 'a', 'AC', 'npc'], ['m-A3', 'a', 'A3', 'talk'],
    ['m-B1', 'b', 'B1', 'news'], ['m-B2', 'b', 'B2', 'talk'],
    ['m-H1', 'h', 'H1', 'talk'],
  ]);
  assert.deepEqual(v.margins.map((m) => m.title), [
    '瓦版', '瓦版', '村の宿屋 の住人', '戦士アリス と 魔法使いボブ', '瓦版', '魔法使いボブ と 戦士アリス', '勇者ひとみ と 戦士アリス',
  ]);
  for (const m of v.margins) {
    assert.deepEqual(m.lines, [], `${m.id} はまだ起きていない`);
    assert.equal(m.seq, null);
    assert.equal(m.commit, null);
  }
  assert.deepEqual(v.news, NEWS.map((text) => ({ text, kind: 'domain', seq: null })), '瓦版は地図の話題から');
  // 余白はマスの数・位置・レベルに関わらない
  assert.ok(!Object.keys(v.nodes).some((id) => id.startsWith('m-')), '余白は nodes に入らない');
  assert.equal(char(v, 'a').at, 'A1');
});

test('§53.3・§53.4 駒が通ると起きる: 号外と製品の話題・町の住人がテストの数とセーブの commit を・2人の最新の日誌で会話', () => {
  const dir = gitDungeon();
  // A1 を抜ける → m-A1（瓦版）が起きる
  passAll(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  let v = view(dir);
  const s1 = events(dir, 'check_passed').at(-1);
  const head1 = git(dir, ['rev-parse', 'HEAD']).out;
  assert.deepEqual(margin(v, 'm-A1'), {
    id: 'm-A1', road: 'a', after: 'A1', kind: 'news', title: '瓦版',
    lines: [
      { who: null, text: '号外: 戦士アリス が A1「POST /api/x で x を保存する」を抜けた（テスト 2/2）' },
      { who: null, text: NEWS[0] },
    ],
    seq: s1.seq, commit: head1,
  });
  assert.deepEqual(margin(v, 'm-A2').lines, [], 'まだ A2 の前');
  // 第12章 §54.3（GM）: 瓦版は号外と製品の話題を交互に（号外が先）。§53.4 の「話題が先」から直した
  assert.deepEqual(v.news[0], { text: '号外: 戦士アリス が A1「POST /api/x で x を保存する」を抜けた（テスト 2/2）', kind: 'extra', seq: s1.seq });

  // 日誌（申し送り）を書いてから、A2 を抜けて町（AC）でセーブし、A3 へ
  note(dir, 'a', 'GET /api/x は配列で返す\n（中身は id と title）');
  note(dir, 'b', '一覧はそれで描く');
  mkdirSync(join(dir, 'a'), { recursive: true });
  writeFileSync(join(dir, 'a', 'x.js'), 'export const x = [];\n');
  passAll(dir, 'A2');
  assert.equal(check(dir, 'a').code, 0);
  v = view(dir);
  const s2 = events(dir, 'check_passed').at(-1);
  const town = events(dir, 'saved').find((e) => e.data.node === 'AC');
  assert.ok(town && town.data.commit && town.seq > s2.seq, '町でセーブした');
  assert.deepEqual(margin(v, 'm-A2').lines, [
    { who: null, text: '号外: 戦士アリス が A2「GET /api/x で一覧を返す」を抜けた（テスト 3/3）' },
    { who: null, text: NEWS[1] },
  ]);
  assert.equal(margin(v, 'm-A2').seq, s2.seq);
  const n = Object.values(s2.data.cases).reduce((sum, list) => sum + ok(list), 0);
  assert.equal(n, 5, '町までの累積判定で通ったテスト（A1 2件 + A2 3件）');
  assert.deepEqual(margin(v, 'm-AC'), {
    id: 'm-AC', road: 'a', after: 'AC', kind: 'npc', title: '村の宿屋 の住人',
    lines: [
      { who: '宿屋の主人', text: `戦士アリスさん、おつかれさま。テスト ${n} 件、通ってきたね` },
      { who: '宿屋の主人', text: `セーブは commit ${town.data.commit.slice(0, 7)}。変えたファイルは ${town.data.files.length} 件` },
    ],
    seq: s2.seq, commit: town.data.commit,
  });

  // A3 を抜けて砦（G1）の前へ → m-A3（会話）: 自分と、G1 の相手（b）の最新の日誌の1行目
  passAll(dir, 'A3');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'G1');
  v = view(dir);
  const s3 = events(dir, 'check_passed').at(-1);
  assert.deepEqual(margin(v, 'm-A3'), {
    id: 'm-A3', road: 'a', after: 'A3', kind: 'talk', title: '戦士アリス と 魔法使いボブ',
    lines: [{ who: 'a', text: 'GET /api/x は配列で返す' }, { who: 'b', text: '一覧はそれで描く' }],
    seq: s3.seq, commit: margin(v, 'm-A3').commit,
  });
  assert.match(margin(v, 'm-A3').commit, /^[0-9a-f]{40}$/);
  // 起きたあとで書いた日誌は、その会話に入らない（出典は S まで）
  note(dir, 'b', 'あとで書いた日誌');
  assert.deepEqual(margin(view(dir), 'm-A3').lines[1], { who: 'b', text: '一覧はそれで描く' });
  // 瓦版: 号外（新しい順）と地図の話題を交互に（第12章 §54.3）
  assert.deepEqual(view(dir).news.map((x) => [x.kind, x.seq]), [['extra', s3.seq], ['domain', null], ['extra', s2.seq], ['domain', null], ['extra', s1.seq]]);
  // b はまだ動いていない
  assert.deepEqual(margin(v, 'm-B1').lines, []);

  // ロードで戻れば、まだ起きていない
  assert.equal(run(dir, ['load', String(s1.seq - 1), '--as', 'gm']).code, 0);
  v = view(dir);
  for (const id of ['m-A1', 'm-A2', 'm-AC', 'm-A3']) {
    assert.deepEqual(margin(v, id).lines, [], `${id} はロードで起きていないに戻る`);
    assert.equal(margin(v, id).seq, null);
  }
  assert.equal(readLog(dir).at(-1).type, 'loaded');
});

test('§53.4 会話: 日誌が無ければ「顔を合わせた」、長い日誌は80字まで。ハンコで通っても起きる。話題が無ければ号外だけ', () => {
  const dir = gitDungeon({ news: null, save: false });
  // b が B1 B2 を抜けて G1 の前へ（a にも b にも日誌が無い）
  passAll(dir, 'B1');
  assert.equal(check(dir, 'b').code, 0);
  passAll(dir, 'B2');
  assert.equal(check(dir, 'b').code, 0);
  let v = view(dir);
  assert.deepEqual(margin(v, 'm-B1').lines, [{ who: null, text: '号外: 魔法使いボブ が B1「画面の骨組み」を抜けた（テスト 1/1）' }], '地図に話題が無ければ号外だけ');
  assert.equal(margin(v, 'm-B1').commit, null, 'Git の外ならコミットは無い');
  assert.deepEqual(margin(v, 'm-B2').lines, [{ who: null, text: '魔法使いボブ と 戦士アリス が 結合: 画面から x を保存できる の前で顔を合わせた' }]);
  assert.deepEqual(v.news.map((x) => x.kind), ['extra', 'extra']);

  // 人間（h）がハンコで H1 を抜けて FIN の前へ。相手は FIN のメンバーのうち h でない最初の1人（a）
  note(dir, 'a', 'あ'.repeat(90));
  assert.equal(run(dir, ['stamp', 'H1', '--as', 'h']).code, 0);
  v = view(dir);
  assert.deepEqual(margin(v, 'm-H1').lines, [{ who: 'a', text: `${'あ'.repeat(79)}…` }], '日誌のある人だけ。80字を超えたら79字と …');
  assert.equal(margin(v, 'm-H1').seq, events(dir, 'stamped').at(-1).seq);
});
