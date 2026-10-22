// G9「結合: 1マスずつ歩く盤面」— 書記（エンジン）＋盤面（賢者クロード）＋絵師（モンスター）の結合E2E（第11章）。
// cases のある本物の冒険を gridhub serve で配り、gridhub step を打つたびに、盤面のモンスター（テスト1件 = 1マス）と
// 駒（data-square）が1マスずつ映ることを確かめる。CONTRACTS §40・§41・§49・§50.5・§50.7・§50.9。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, gridhub, newDungeon, setCases, passAll, CASES, view, char, startServe, openBrowser,
} from '../helpers5.mjs';

const READY = 'window.__masume && window.__masume.ready';
const MONSTERS = JSON.parse(readFileSync(join(ROOT, 'web', 'assets', 'monsters', 'index.json'), 'utf8')).monsters.map((m) => m.id);

/** 盤面に描かれた、あるダンジョンのモンスターと駒 */
const snapshot = (node, charId) => `(() => {
  const sqs = [...document.querySelectorAll('#monster-layer .sq[data-node="${node}"]')].map((q) => ({
    i: q.dataset.case, ok: q.dataset.ok, slain: !!q.querySelector('.slain'),
    title: q.querySelector('title')?.textContent || '',
    href: q.querySelector('use.monster')?.getAttribute('href') || '',
  }));
  const p = document.querySelector('.pawn[data-char="${charId}"]');
  return JSON.stringify({ sqs, at: p?.dataset.at, square: p?.dataset.square, walks: window.__masume.walks.filter((w) => w.char === '${charId}') });
})()`;

async function board(page, node, charId) {
  return JSON.parse(await page.eval(snapshot(node, charId)));
}

/** ビュー（書記）と盤面（賢者クロード）が、そのダンジョンについて同じことを言っている */
function sameAsView(b, dir, node, charId) {
  const v = view(dir);
  const cases = v.nodes[node].cases;
  assert.deepEqual(b.sqs.map((s) => s.i), cases.map((_, i) => String(i)), `${node} のモンスターはテストの数だけ`);
  cases.forEach((c, i) => {
    assert.equal(b.sqs[i].ok, String(c.ok), `${node}[${i}] の data-ok はビューの ok`);
    assert.ok(b.sqs[i].title.includes(c.name), `${node}[${i}] の title にテストの名前「${c.name}」`);
    assert.equal(b.sqs[i].slain, c.ok === true, `${node}[${i}] 倒したテストだけに赤い斜線`);
  });
  const ch = char(v, charId);
  assert.equal(b.at, ch.at, `駒 ${charId} の data-at`);
  assert.equal(b.square, ch.square === null ? '' : String(ch.square), `駒 ${charId} の data-square はビューの square`);
  return v;
}

test('step するたびに、盤面のモンスターと駒が1マスずつ映る（書記 × 盤面 × 絵師）', { timeout: 240000 }, async () => {
  const dir = newDungeon();
  let srv;
  try {
    srv = await startServe(dir);
  } catch (e) {
    console.log('MASUME_BLAME: board');
    throw e;
  }
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000, message: '盤面が描かれる' });
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { timeout: 10000, message: 'ライブ接続' });

    // 1. まだ歩いていない: 地図の cases の数だけモンスターがいて、駒は最初のマス（square 0）
    let b = await board(page, 'A1', 'a');
    sameAsView(b, dir, 'A1', 'a');
    assert.equal(b.sqs.length, CASES.A1.length);
    assert.equal(b.square, '0', '駒はいちばん手前のモンスターの上');

    // 絵師のモンスター: どのマスも、絵師の8体のどれかを <use> で指し、その <symbol> は絵師の絵で埋まっている
    const art = JSON.parse(await page.eval(`JSON.stringify(Object.fromEntries(${JSON.stringify(MONSTERS)}.map((id) => [id, document.querySelector('#mon-' + id)?.innerHTML || ''])))`));
    for (const id of MONSTERS) assert.ok(art[id].length > 0, `#mon-${id} がある`);
    assert.equal(new Set(Object.values(art)).size, MONSTERS.length, '8体がすべて違う絵（絵師の絵が届いている）');
    const hrefs = JSON.parse(await page.eval(`JSON.stringify([...document.querySelectorAll('#monster-layer .sq use.monster')].map((u) => u.getAttribute('href')))`));
    assert.ok(hrefs.length >= Object.values(CASES).flat().length - CASES.G1.length, 'モンスターのマスに絵がある');
    for (const h of hrefs) assert.ok(MONSTERS.includes(h.replace(/^#mon-/, '')), `${h} は絵師のモンスター`);

    // 2. 1件だけ倒して歩く → 駒は1マス進む（square 0 → 1）
    setCases(dir, 'A1', { [CASES.A1[0]]: 'ok', [CASES.A1[1]]: 'fail' });
    let r = gridhub(['step', 'a', '--as', 'a', '--dir', dir]);
    assert.equal(r.code, 1, r.all);
    assert.match(r.out, new RegExp(`テスト 1/${CASES.A1.length}`));
    await page.waitFor(`document.querySelector('.pawn[data-char="a"]').dataset.square === '1'`, { timeout: 10000, message: '駒 a が A1 の2マス目へ' });
    await page.waitFor(`document.querySelector('#monster-layer .sq[data-node="A1"][data-case="0"]').dataset.ok === 'true'`, { timeout: 10000, message: '1体目に赤い斜線' });
    b = await board(page, 'A1', 'a');
    sameAsView(b, dir, 'A1', 'a');
    assert.deepEqual(b.walks.at(-1), { char: 'a', from: 'A1#0', to: 'A1#1', steps: 1, back: false }, '1マスだけ踏んで進んだ');

    // 3. 同じテストのまま、もう一度歩く → 駒は動かない（罰もない）
    r = gridhub(['step', 'a', '--as', 'a', '--dir', dir]);
    assert.equal(r.code, 1, r.all);
    await new Promise((res) => setTimeout(res, 800));
    b = await board(page, 'A1', 'a');
    assert.equal(b.square, '1', '落ちたままなら同じマス');
    assert.equal(char(view(dir), 'a').level, 1, 'レベルは変わらない');

    // 4. 残りも倒して歩く → 出口の札の前（square = cases.length）
    passAll(dir, 'A1');
    r = gridhub(['step', 'a', '--as', 'a', '--dir', dir]);
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /全部倒した/);
    await page.waitFor(`document.querySelector('.pawn[data-char="a"]').dataset.square === '${CASES.A1.length}'`, { timeout: 10000, message: '駒 a が出口の前へ' });
    b = await board(page, 'A1', 'a');
    sameAsView(b, dir, 'A1', 'a');
    assert.equal(b.walks.at(-1).steps, 1, 'ここでも1マス');

    // 5. 宣言して抜ける → 次のダンジョン A2 の最初のマス。A1 のモンスターは全部倒したまま
    r = gridhub(['check', 'a', '--as', 'a', '--dir', dir]);
    assert.equal(r.code, 0, r.all);
    await page.waitFor(`document.querySelector('.pawn[data-char="a"]').dataset.at === 'A2'`, { timeout: 10000, message: '駒 a が A2 へ' });
    await page.waitFor(`document.querySelector('#node-layer [data-node="A1"]').dataset.state === 'cleared'`, { timeout: 10000, message: 'A1 にはなまる' });
    b = await board(page, 'A2', 'a');
    sameAsView(b, dir, 'A2', 'a');
    assert.equal(b.square, '0');
    const a1 = await board(page, 'A1', 'a');
    assert.ok(a1.sqs.every((s) => s.slain), 'A1 のモンスターは倒したまま');

    // 6. 別のキャラクターも同じ盤面で歩ける（b の駒だけが動く）
    passAll(dir, 'B1');
    r = gridhub(['step', 'b', '--as', 'b', '--dir', dir]);
    assert.equal(r.code, 0, r.all);
    await page.waitFor(`document.querySelector('.pawn[data-char="b"]').dataset.square === '${CASES.B1.length}'`, { timeout: 10000, message: '駒 b が B1 の出口の前へ' });
    sameAsView(await board(page, 'B1', 'b'), dir, 'B1', 'b');
    assert.equal((await board(page, 'A2', 'a')).square, '0', 'a の駒はそのまま');

    const errors = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    if (errors.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(errors, [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.stop();
  }
});
