// S15「勇者の手帳の窓口」— 伝令（遊び込み）。CONTRACTS §76.7。
// GET /api/hero は読むだけ。POST /api/hero/open でシール袋を開け、POST /api/hero/seen で「見た」と覚える。起動役も手帳を出す。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, getJson, startGridhub, startApp, postJson, pathWith } from '../helpers8.mjs';

function played() {
  const dir = tmp('gridhub-s15-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  assert.equal(masume(['new', 'tutorial.map.json'], { cwd: dir }).code, 0);
  mkdirSync(join(dir, 'ai'), { recursive: true });
  writeFileSync(join(dir, 'ai', 'hello.txt'), 'こんにちは、GridHub！\n');
  assert.equal(masume(['step', 'apprentice', '--dir', dir]).code, 0);
  return dir;
}

test('§76.7 GET /api/hero は読むだけ。POST /api/hero/open は古い順に開けてシール帳に貼り、POST /api/hero/seen は「留守のあいだ」を空にする', { timeout: 60000 }, async () => {
  const dir = played();
  const home = tmp('gridhub-s15-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  try {
    const url = srv.url;
    const first = await getJson(`${url}/api/hero`);
    assert.equal(first.status, 200);
    assert.equal(first.body.bags.count, 4);
    assert.equal(first.body.current.since.first, true);
    assert.equal(first.body.current.since.defeats, 3);
    assert.ok(!existsSync(join(home, 'hero.json')), 'GET では手帳のファイルを書かない');

    assert.equal((await postJson(`${url}/api/hero/open`, { count: 1 }, { masume: false })).status, 403, 'X-Masume が要る');
    assert.equal((await postJson(`${url}/api/hero/open`, { count: 0 })).status, 400);
    assert.equal((await postJson(`${url}/api/hero/open`, { count: 'all' })).status, 400);
    const opened = await postJson(`${url}/api/hero/open`, { count: 2 });
    assert.equal(opened.status, 200, opened.text);
    assert.equal(opened.body.opened.length, 2);
    assert.deepEqual(opened.body.opened.map((f) => f.id), first.body.bags.next.slice(0, 2).map((f) => f.id), '古い順');
    assert.equal(opened.body.opened[0].item, 'map');
    assert.equal(opened.body.opened[0].new, true, 'その枠ではじめてなら new');
    assert.equal(opened.body.journal.bags.count, 2);
    assert.ok(opened.body.journal.album.owned >= 1);
    const book = JSON.parse(readFileSync(join(home, 'hero.json'), 'utf8'));
    assert.equal(book.quests[0].dir, dir, '開けた冒険を覚える');
    assert.equal(Object.values(book.opened)[0], 2);

    assert.equal((await postJson(`${url}/api/hero/open`, { count: 5001 })).status, 400, '1回に 5000 まで');
    const rest = await postJson(`${url}/api/hero/open`, { count: 5000 });
    assert.equal(rest.body.opened.length, 2, '残りだけ');
    assert.equal(rest.body.journal.bags.count, 0);

    assert.equal((await postJson(`${url}/api/hero/seen`, { seq: -1 })).status, 400);
    const partial = await postJson(`${url}/api/hero/seen`, { seq: 0 });
    assert.equal(partial.body.journal.current.seen, 0, '見せたところまで');
    assert.equal(partial.body.journal.current.since.defeats, 3, 'その後の手柄は、まだ見ていない');
    const seen = await postJson(`${url}/api/hero/seen`, {});
    assert.equal(seen.status, 200);
    assert.equal(seen.body.journal.current.seen, seen.body.journal.current.head);
    assert.equal(seen.body.journal.current.since.defeats, 0);
    assert.ok(seen.body.journal.achievements.filter((a) => a.done).every((a) => a.fresh === false), '見た称号は fresh でない');
    assert.equal(JSON.parse(readFileSync(join(home, 'hero.json'), 'utf8')).rank, seen.body.journal.rank.level);

    const css = await fetch(`${url}/board/hero.css`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get('cache-control'), 'no-cache', '版を上げたあと古い盤面を使わない');
  } finally {
    await srv.stop();
  }
});

test('§76.7 起動役（gridhub app）の GET /api/hero: 最近のフォルダの冒険をまとめる', { timeout: 60000 }, async () => {
  const dir = played();
  const app = await startApp();
  try {
    const empty = await getJson(`${app.url}/api/hero`);
    assert.equal(empty.status, 200);
    assert.equal(empty.body.totals.defeats, 0);
    assert.equal(empty.body.current, null);
    assert.equal((await postJson(`${app.url}/api/app/open`, { dir })).status, 200);
    const j = await getJson(`${app.url}/api/hero`);
    assert.equal(j.body.totals.defeats, 3, '最近のフォルダから');
    assert.equal(j.body.quests.length, 1);
    assert.equal(j.body.bags.count, 4);
    assert.equal(j.body.quests[0].bags, 4, 'はじめの画面の最近のフォルダに出す数');
    // §76.29 同じフォルダは、開き直しても同じポート（盤面がブラウザに覚えたことが残る）
    const { stablePort } = await import('../../src/server/app.js');
    const first = new URL((await postJson(`${app.url}/api/app/open`, { dir })).body.url);
    const again = new URL((await postJson(`${app.url}/api/app/open`, { dir })).body.url);
    assert.equal(again.port, first.port, '開き直しても同じ住所');
    assert.equal(Number(first.port), stablePort(dir));
    assert.ok(stablePort(dir) >= 41000 && stablePort(dir) < 49000);
    assert.notEqual(stablePort(dir), stablePort(`${dir}-other`));
  } finally {
    await app.stop();
  }
});

test('§76.11 シールをノートに貼る・はがす: 持っている数まで。ページの外・持っていないシールは貼れない', { timeout: 60000 }, async () => {
  const dir = played();
  const home = tmp('gridhub-s15-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  try {
    const url = srv.url;
    const none = await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 0, x: 10, y: 10 });
    assert.equal(none.status, 409, 'まだ開けていない');
    assert.equal(none.body.code, 'E_HERO');
    assert.equal((await postJson(`${url}/api/hero/open`, { count: 1 })).body.opened[0].slot, 'map');
    assert.equal((await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 0, x: 99, y: 10 })).status, 400, 'ページの外');
    assert.equal((await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 0, x: 10, y: 10, r: 90 })).status, 400, '傾きすぎ');
    assert.equal((await postJson(`${url}/api/hero/paste`, { slot: '<b>', page: 0, x: 10, y: 10 })).status, 400);
    assert.equal((await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 0, x: 10, y: 10 }, { masume: false })).status, 403);
    const pasted = await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 1, x: 12.5, y: 20, r: -8 });
    assert.equal(pasted.status, 200, pasted.text);
    assert.deepEqual(pasted.body.journal.current.pasted.map(({ slot, page, x, y, r, kind, item }) => ({ slot, page, x, y, r, kind, item })), [{ slot: 'map', page: 1, x: 12.5, y: 20, r: -8, kind: 'item', item: 'map' }]);
    const mapSlot = pasted.body.journal.album.slots.find((s) => s.slot === 'map');
    assert.deepEqual([mapSlot.count, mapSlot.pasted, mapSlot.free], [1, 1, 0]);
    assert.equal((await postJson(`${url}/api/hero/paste`, { slot: 'map', page: 0, x: 10, y: 10 })).status, 409, '持っている数まで');
    assert.equal(JSON.parse(readFileSync(join(home, 'hero.json'), 'utf8')).pasted[pasted.body.journal.current.key].length, 1);
    assert.equal((await postJson(`${url}/api/hero/peel`, { index: 3 })).status, 400);
    const peeled = await postJson(`${url}/api/hero/peel`, { index: 0 });
    assert.equal(peeled.status, 200);
    assert.deepEqual(peeled.body.journal.current.pasted, []);
    assert.equal(peeled.body.journal.album.slots.find((s) => s.slot === 'map').free, 1, 'はがせば、また貼れる');
  } finally {
    await srv.stop();
  }
});

test('§76.16・§76.18 POST /api/hero/trade と /api/hero/title', { timeout: 60000 }, async () => {
  const dir = played();
  const home = tmp('gridhub-s15-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  try {
    const url = srv.url;
    await postJson(`${url}/api/hero/open`, { count: 10 });
    const few = await postJson(`${url}/api/hero/trade`, { slot: 'slime:normal' });
    assert.equal(few.status, 409, '6枚に足りない');
    assert.equal(few.body.code, 'E_HERO');
    assert.equal((await postJson(`${url}/api/hero/trade`, { slot: 'x y' })).status, 400);
    assert.equal((await postJson(`${url}/api/hero/trade`, { slot: 'map' })).status, 409, '出来事のシールは換えられない');
    const title = await postJson(`${url}/api/hero/title`, { id: 'first-blood' });
    assert.equal(title.status, 200, title.text);
    assert.deepEqual(title.body.journal.epithet, { id: 'first-blood', name: 'はじめの一歩' });
    assert.equal((await postJson(`${url}/api/hero/title`, { id: 'album-full' })).status, 409);
    assert.equal((await postJson(`${url}/api/hero/title`, { id: '<x>' })).status, 400);
    assert.equal((await postJson(`${url}/api/hero/title`, { id: null })).body.journal.epithet, null);
    // §76.30 ノートの模様: ランクが届いていなければ 409、知らない模様は 400
    const locked = await postJson(`${url}/api/hero/theme`, { id: 'kraft' });
    assert.equal(locked.status, 409, locked.text);
    assert.equal((await postJson(`${url}/api/hero/theme`, { id: 'nothing' })).status, 400);
    assert.equal((await postJson(`${url}/api/hero/theme`, { id: '<b>' })).status, 400);
    const note = await postJson(`${url}/api/hero/theme`, { id: 'note' });
    assert.equal(note.body.journal.theme, 'note');
    assert.deepEqual(note.body.journal.themes.map((t) => [t.id, t.unlocked]), [['note', true], ['kraft', false], ['sakura', false], ['night', false], ['blueprint', false], ['gold', false]]);
  } finally {
    await srv.stop();
  }
});

test('§76.31 POST /api/note: 盤面から日誌を書く（今日のお題と技のため）', { timeout: 60000 }, async () => {
  const dir = played();
  const home = tmp('gridhub-s15-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  try {
    const url = srv.url;
    assert.equal((await postJson(`${url}/api/note`, { character: 'apprentice', text: 'x' }, { masume: false })).status, 403);
    assert.equal((await postJson(`${url}/api/note`, { character: 'apprentice', text: '   ' })).status, 400, '空は書けない');
    assert.equal((await postJson(`${url}/api/note`, { character: 'apprentice', text: 'あ'.repeat(2001) })).status, 400);
    assert.equal((await postJson(`${url}/api/note`, { character: 'nobody', text: 'x' })).status, 404);
    const before = (await getJson(`${url}/api/hero`)).body.totals.notes;
    const r = await postJson(`${url}/api/note`, { character: 'apprentice', text: '名前のあとは全角の！' });
    assert.equal(r.status, 200, r.text);
    assert.equal(typeof r.body.seq, 'number');
    assert.equal((await getJson(`${url}/api/hero`)).body.totals.notes, before + 1);
    const view = await getJson(`${url}/api/state`);
    const entry = view.body.log.find((e) => e.seq === r.body.seq);
    assert.equal(entry.type, 'note');
    assert.equal(entry.actor, 'apprentice', '書いた本人の記録');
    assert.match(entry.text, /名前のあとは全角の！/);
    assert.equal(masume(['verify', '--dir', dir]).code, 0, '冒険の書は正常');
  } finally {
    await srv.stop();
  }
});
