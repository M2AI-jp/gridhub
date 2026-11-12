// E20「勇者の手帳」— 書記（遊び込み）。CONTRACTS §79.1〜§79.6。
// 手帳は冒険の書から導く: テストを倒すとシール袋、ランク・称号・スタンプカード・今日のお題。gridhub me は読むだけ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, masumeJson, view } from '../helpers.mjs';

const RARITIES = ['normal', 'kira', 'holo', 'gold'];

function tutorial() {
  const dir = tmp('gridhub-e20-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  assert.equal(masume(['new', 'tutorial.map.json'], { cwd: dir }).code, 0);
  return dir;
}
const me = (dir, home) => {
  const r = masumeJson(['me', '--dir', dir, '--home', home]);
  assert.equal(r.code, 0, r.all);
  return r.data;
};
function passA1(dir) {
  mkdirSync(join(dir, 'ai'), { recursive: true });
  writeFileSync(join(dir, 'ai', 'hello.txt'), 'こんにちは、GridHub！\n');
}

test('§79 はじめたばかり: ランク1「見習い勇者」、冒険の地図のシール袋が1つ。gridhub me は手帳のファイルを書かない', () => {
  const dir = tutorial();
  const home = tmp('gridhub-e20-home-');
  const j = me(dir, home);
  assert.equal(j.ok, true);
  assert.equal(j.hero, 1);
  assert.equal(j.rank.level, 1);
  assert.equal(j.rank.title, '見習い勇者');
  assert.equal(j.totals.quests, 1);
  assert.equal(j.bags.count, 1);
  assert.equal(j.bags.next[0].item, 'map');
  assert.equal(j.album.total, 39);
  assert.ok(j.album.slots.every((x) => typeof x.lore === 'string' && x.lore.length > 10), '§79.28 どのシールにも、いわれ');
  assert.equal(j.album.owned, 0, 'シール帳には開けたものだけが貼られる');
  assert.equal(j.achievements.length, 44);
  assert.equal(j.achievements.filter((a) => a.done).length, 0);
  assert.equal(j.streak.current, 0);
  assert.equal(j.daily.missions.length, 3);
  assert.equal(j.current.since.first, true);
  assert.ok(!existsSync(join(home, 'hero.json')), '読むだけ');
  const text = masume(['me', '--dir', dir, '--home', home]);
  assert.equal(text.code, 0, text.all);
  for (const w of ['勇者の手帳', 'ランク 1「見習い勇者」', '今日のお題', 'シール帳 0/39', '未開封のシール袋 1']) assert.ok(text.out.includes(w), `${w}\n${text.out}`);
});

test('§79.2 テストを倒すたびにシール袋。レア度はイベントのハッシュで決まり、同じ冒険の書なら何度読んでも・どこに写しても同じ', () => {
  const dir = tutorial();
  const home = tmp('gridhub-e20-home-');
  assert.equal(masume(['step', 'apprentice', '--dir', dir]).code, 1, '最初は落ちる');
  passA1(dir);
  assert.equal(masume(['step', 'apprentice', '--dir', dir]).code, 0);
  const j = me(dir, home);
  assert.equal(j.totals.defeats, 3);
  assert.equal(j.bags.count, 4, '地図 + 倒したテスト3件');
  const monsters = j.bags.next.filter((f) => f.kind === 'monster');
  assert.equal(monsters.length, 3);
  for (const f of monsters) {
    assert.ok(RARITIES.includes(f.rarity), f.rarity);
    assert.equal(f.slot, `${f.species}:${f.rarity}`);
    assert.ok(['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem'].includes(f.species));
    assert.equal(f.node, 'A1');
    assert.match(f.what, /を倒した/);
    assert.equal(f.who, '見習いAI');
    assert.equal(typeof f.seq, 'number');
  }
  assert.deepEqual(me(dir, home).bags.next, j.bags.next, '何度読んでも同じ');
  const copy = tmp('gridhub-e20-copy-');
  cpSync(dir, copy, { recursive: true });
  assert.deepEqual(me(copy, home).bags.next.map((f) => [f.slot, f.rarity]), j.bags.next.map((f) => [f.slot, f.rarity]), '写しても同じ（乱数ではなくハッシュ）');
  assert.ok(j.achievements.find((a) => a.id === 'first-blood').done, 'はじめの一歩');
  assert.equal(j.streak.current, 1);
  assert.equal(j.streak.today, true, 'テストを倒した日はスタンプカードにハンコ');
  assert.equal(j.calendar.at(-1).played, true);
  const step = j.daily.missions.find((m) => m.id === 'step5');
  if (step) assert.equal(step.now, 2, '歩いた回数');
});

test('§79.3 宣言に通るとダンジョン・一発合格のメダル・経験値。ランクが上がる', () => {
  const dir = tutorial();
  const home = tmp('gridhub-e20-home-');
  passA1(dir);
  assert.equal(masume(['check', 'apprentice', '--dir', dir]).code, 0);
  const j = me(dir, home);
  assert.equal(j.totals.clears, 1);
  assert.equal(j.totals.medals, 1);
  assert.ok(j.bags.next.some((f) => f.item === 'medal'), 'ちいさなメダルのシール');
  // 冒険 20 + 倒したテスト 3×10 + 宣言 30 + メダル 20 = 100 → ランク2
  assert.equal(j.rank.xp, 100);
  assert.equal(j.rank.level, 2);
  for (const id of ['first-blood', 'clear-1', 'medal-1']) assert.ok(j.achievements.find((a) => a.id === id).done, id);
  // §79.19〜§79.21 シール帳の列・次の称号・今週のMVP
  assert.deepEqual(j.album.sets.map((x) => x.id), ['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem', 'boss', 'items']);
  assert.equal(j.album.sets.find((x) => x.id === 'items').total, 12);
  assert.ok(j.album.sets.every((x) => x.owned === 0 && !x.done), 'まだ開けていない');
  assert.ok(j.next_achievement && j.next_achievement.now < j.next_achievement.goal, '次の称号');
  assert.deepEqual(j.current.mvp, [{ id: 'apprentice', name: '見習いAI', n: 3 }]);
  assert.equal(j.current.sortie, null, '出撃していない');
});

test('§79.1 古い冒険の書（判定の結果を data.cases に持たない第10章まで）でも、倒したテストを数えられる', () => {
  const home = tmp('gridhub-e20-home-');
  const j = me(ROOT, home);
  const v = view(ROOT);
  assert.ok(j.totals.defeats >= v.bestiary.defeated, `${j.totals.defeats} >= ${v.bestiary.defeated}`);
  assert.ok(j.totals.goals >= 1);
  assert.ok(j.bags.count > j.totals.defeats, 'テストのほかに、出来事のシールも');
  assert.ok(!existsSync(join(home, 'hero.json')));
});

test('§79.1 手帳のファイル（hero.json）が壊れていても、空の手帳から読める', () => {
  const dir = tutorial();
  const home = tmp('gridhub-e20-home-');
  writeFileSync(join(home, 'hero.json'), '{ こわれた');
  const j = me(dir, home);
  assert.equal(j.bags.count, 1);
  assert.equal(readFileSync(join(home, 'hero.json'), 'utf8'), '{ こわれた', 'gridhub me は直さない（書かない）');
});

test('§79.16〜§79.18 交換所（6枚あれば5枚を1つ上のレア度1枚に。1枚はシール帳に残る）・自己ベスト・名乗る称号', async () => {
  const hero = await import('../../src/engine/hero.js');
  const home = tmp('gridhub-e20-home-');
  const j = hero.openBags(home, { current: ROOT, count: 300 }).journal;
  assert.ok(j.records.day.best.n >= 1);
  assert.ok(j.records.combo.best >= 5, 'この冒険には、まとめて倒した判定がある');
  assert.equal(j.records.streak, j.totals.streak);
  const from = j.album.slots.find((s) => s.trade?.can);
  assert.ok(from, '換えられるシールがある');
  assert.equal(from.trade.n, 5);
  assert.equal(from.trade.to, hero.upgradeOf(from.slot));
  const toBefore = j.album.slots.find((s) => s.slot === from.trade.to).count;
  const { got, journal } = hero.tradeSticker(home, { current: ROOT, slot: from.slot });
  assert.equal(got.slot, from.trade.to);
  assert.match(got.what, /交換所で/);
  assert.equal(journal.album.slots.find((s) => s.slot === from.slot).count, from.count - 5);
  assert.equal(journal.album.slots.find((s) => s.slot === from.trade.to).count, toBefore + 1);
  assert.equal(hero.upgradeOf('slime:gold'), null, '金の上は無い');
  assert.equal(hero.upgradeOf('map'), null, '出来事のシールは換えられない');
  assert.equal(hero.upgradeOf('dragon:holo'), 'dragon:gold');
  assert.throws(() => hero.tradeSticker(home, { current: ROOT, slot: 'map' }), (e) => e.code === 'E_HERO');
  const few = journal.album.slots.find((s) => s.trade && s.count > 0 && !s.trade.can);
  if (few) assert.throws(() => hero.tradeSticker(home, { current: ROOT, slot: few.slot }), (e) => e.code === 'E_HERO', '6枚に足りない');
  const ach = (jj, id) => jj.achievements.find((a) => a.id === id).done;
  assert.equal(ach(j, 'bags-100'), true, '開封の達人（300 開けた）');
  assert.equal(ach(j, 'trade-1'), false);
  assert.equal(ach(journal, 'trade-1'), true, '交換所デビュー');
  const done = journal.achievements.find((a) => a.done);
  const titled = hero.setTitle(home, { id: done.id });
  assert.deepEqual(titled.epithet, { id: done.id, name: done.name });
  assert.equal(ach(titled, 'title-1'), true, '名乗りを上げる');
  assert.throws(() => hero.setTitle(home, { id: 'album-full' }), (e) => e.code === 'E_HERO', 'まだの称号は名乗れない');
  assert.equal(hero.setTitle(home, { id: null }).epithet, null);
  const book = JSON.parse(readFileSync(join(home, 'hero.json'), 'utf8'));
  assert.equal(book.trades.length, 1);
});

test('§79.4・§79.11・§79.16 レビューで見つかったこと: 交換でキラを手放しても称号は消えない・見えない冒険の貼りは数えない・はがすのは見えている並び・NEW は開ける前に空だった枠', async () => {
  const hero = await import('../../src/engine/hero.js');
  const home = tmp('gridhub-e20-home-');
  const first = hero.openBags(home, { current: ROOT, count: 1 });
  assert.equal(first.opened[0].new, true, 'はじめての枠');
  const j = hero.openBags(home, { current: ROOT, count: 300 }).journal;
  const again = hero.openBags(home, { current: ROOT, count: 1 });
  if (again.opened.length && j.album.slots.find((s) => s.slot === again.opened[0].slot)?.count) assert.equal(again.opened[0].new, false, 'もう持っている枠は NEW でない');

  // キラ → ホロに換えても、キラ以上を手に入れた数は減らない
  const cur = again.journal;
  const kira = cur.album.slots.find((s) => s.rarity === 'kira' && s.trade?.can);
  assert.ok(kira, 'キラの交換ができる');
  const after = hero.tradeSticker(home, { current: ROOT, slot: kira.slot }).journal;
  assert.equal(after.totals.kira, cur.totals.kira + 1, '換えたホロの分だけ増える（手放したキラの分は減らない）');
  assert.equal(after.achievements.find((a) => a.id === 'kira-10').done, cur.achievements.find((a) => a.id === 'kira-10').done);

  // 貼る: 見えない冒険（いまは無いフォルダ）の貼りは、貼れる数を減らさない。はがすのは current.pasted の並び
  const pasted = hero.pasteSticker(home, { current: ROOT, slot: 'map', page: 0, x: 10, y: 10 });
  assert.equal(pasted.album.slots.find((s) => s.slot === 'map').free, 0);
  const file = join(home, 'hero.json');
  const book = JSON.parse(readFileSync(file, 'utf8'));
  const key = pasted.current.key;
  book.pasted[key].unshift({ slot: 'unknown:future', page: 0, x: 1, y: 1, r: 0, at: '2026-01-01T00:00:00.000Z' });
  book.pasted['0'.repeat(64)] = [{ slot: 'map', page: 0, x: 1, y: 1, r: 0, at: '2026-01-01T00:00:00.000Z' }];
  writeFileSync(file, JSON.stringify(book));
  const seen = hero.heroJournal(home, { current: ROOT });
  assert.equal(seen.current.pasted.length, 1, '知らない枠は出さない');
  assert.equal(seen.album.slots.find((s) => s.slot === 'map').free, 0, '見えない冒険の貼りは数えない（この冒険の1枚だけ）');
  const peeled = hero.peelSticker(home, { current: ROOT, index: 0 });
  assert.deepEqual(peeled.current.pasted, [], '見えていた地図がはがれる');
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).pasted[key][0].slot, 'unknown:future', '知らない枠は残る');

  // 見たところ: seq を渡せば、そこまで（head を超えない）
  const marked = hero.markSeen(home, { current: ROOT, seq: 100 });
  assert.equal(marked.current.seen, 100);
  assert.ok(marked.current.since.defeats > 0, '100 より後の手柄は、まだ見ていない');
  assert.equal(hero.markSeen(home, { current: ROOT, seq: 10 ** 9 }).current.seen, marked.current.head);
});
