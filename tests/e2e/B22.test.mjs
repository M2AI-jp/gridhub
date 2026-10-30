// B22「勇者の手帳」— 盤面（遊び込み）。CONTRACTS §76.8。
// 本物の伝令（gridhub serve）と、判定用の手帳の場所で: 勇者のカード・手帳のタブ・おかえりのカード・シール袋を開ける部屋。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, openBrowser, startGridhub, pathWith, serveStatic } from '../helpers8.mjs';

const READY = 'window.__masume && window.__masume.ready';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

test('§76.8 盤面: 勇者のカードと手帳のタブ、おかえりのカード、シール袋を開けるとシール帳に貼られる', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-b22-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  assert.equal(masume(['new', 'tutorial.map.json'], { cwd: dir }).code, 0);
  mkdirSync(join(dir, 'ai'), { recursive: true });
  writeFileSync(join(dir, 'ai', 'hello.txt'), 'こんにちは、GridHub！\n');
  assert.equal(masume(['check', 'apprentice', '--dir', dir]).code, 0);
  const home = tmp('gridhub-b22-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.waitFor(`!!window.__masume.hero`, { timeout: 20000, message: '手帳が読めた' });
    const hero = await page.eval('window.__masume.hero');
    assert.equal(hero.rank, 2, '冒険 20 + テスト 30 + 宣言 30 + メダル 20 = 100');
    assert.equal(hero.bags, 5, '地図・テスト3件・メダル');
    assert.equal(await page.eval(`document.querySelector('#techo-tab').hidden`), false);
    assert.equal(await page.eval(`document.querySelector('#bag-badge').textContent`), '5');
    const card = await page.eval(`document.querySelector('#hero-card').innerText`);
    for (const w of ['見習い勇者', 'お題', 'シール袋 5', '次の称号']) assert.ok(card.includes(w), `${w}: ${card}`);
    assert.equal(await page.eval('window.__masume.mvp'), 'apprentice', '今週のMVP');
    assert.match(await page.eval(`document.querySelector('#mvp-style').textContent`), /data-char="apprentice"/);

    // おかえり（はじめて見る冒険は「これまでの戦果」）
    await page.waitFor(`!document.querySelector('#welcome').hidden`, { message: 'おかえりのカード' });
    const welcome = await page.eval(`document.querySelector('#welcome').innerText`);
    for (const w of ['これまでの戦果', 'テスト撃破', '見習いAI', 'はじめの一歩', 'シール袋をあける（5）']) assert.ok(welcome.includes(w), `${w}: ${welcome}`);
    assert.ok(!welcome.includes('null') && !welcome.includes('undefined'), welcome);

    // 手帳のタブ: シール帳 39 枠（道のモンスターは 6 種 × 4）、称号 44、スタンプカードに今日のハンコ
    await page.eval(`document.querySelector('#techo-tab').click()`);
    await page.waitFor(`document.querySelector('#view-techo').classList.contains('active') && document.querySelectorAll('#techo .al-slot').length === 39`);
    assert.equal(await page.eval(`document.querySelectorAll('#techo .al-table .al-slot').length`), 24);
    assert.equal(await page.eval(`document.querySelectorAll('#techo .al-slot.empty').length`), 39, 'まだ開けていない');
    assert.equal(await page.eval(`document.querySelectorAll('#techo .tc-ach li').length`), 44);
    assert.ok(await page.eval(`document.querySelectorAll('#techo .tc-ach li.done').length`) >= 3);
    assert.equal(await page.eval(`!!document.querySelector('#techo .sc-cell.today.stamped .sc-hanko')`), true, '今日のハンコ');
    assert.equal(await page.eval(`document.querySelectorAll('#techo .tc-week .wk-day').length`), 7, '今週のふりかえり');
    assert.equal(await page.eval(`document.querySelector('#techo .tc-week .wk-day.today .wk-n').textContent`), '3', '今日倒したテスト');
    assert.equal(await page.eval(`new URL(location.href).searchParams.get('view')`), 'techo');

    // シール袋を開ける部屋: 1枚 → 残り4、シール帳に1枚貼られる
    await page.eval(`document.querySelector('#techo .tc-open').click()`);
    await page.waitFor(`!document.querySelector('#bag-room').hidden`);
    assert.equal(await page.eval(`document.querySelector('#bag-count').textContent`), '5');
    // §76.14 Mac のアプリの中: Dock の数字を橋（messageHandlers.gridhub）で知らせる
    await page.eval(`window.__sent = []; window.webkit = { messageHandlers: { gridhub: { postMessage: (m) => window.__sent.push(m) } } }; true`);
    await page.eval(`document.querySelector('#bag-one').click()`);
    await page.waitFor(`window.__sent.some((m) => m.type === 'badge' && m.count === 4)`, { message: 'Dock の数字（のこり 4）を知らせる' });
    await page.waitFor(`document.querySelectorAll('#bag-reveal .reveal-card .sticker').length === 1 && document.querySelector('#bag-count').textContent === '4'`, { message: '1枚めくれた' });
    await page.waitFor(`document.activeElement?.id === 'bag-one'`, { message: 'Enter を押し続けて開けられるよう、フォーカスが戻る' });
    const shown = await page.eval(`document.querySelector('#bag-reveal').innerText`);
    assert.ok(shown.includes('冒険の地図') && shown.includes('はじめた'), shown);
    assert.equal(await page.eval(`document.querySelector('#bag-badge').textContent`), '4');
    await page.eval(`document.querySelector('#bag-ten').click()`);
    await page.waitFor(`document.querySelector('#bag-count').textContent === '0'`, { message: 'まとめて開けた' });
    assert.equal(await page.eval(`document.querySelector('#bag-badge').hidden`), true);
    await page.eval(`document.querySelector('#bag-close').click()`);
    await page.waitFor(`document.querySelector('#bag-room').hidden && document.querySelectorAll('#techo .al-slot:not(.empty)').length >= 2`, { message: 'シール帳に貼られた' });
    // シールを押すと、どこで手に入れたか
    await page.eval(`document.querySelector('#techo .al-slot:not(.empty)').click()`);
    await page.waitFor(`!document.querySelector('#slot-pop').hidden`);
    assert.match(await page.eval(`document.querySelector('#slot-pop').innerText`), /はじめて:/);
    assert.ok((await page.eval(`document.querySelector('#slot-pop .sp-lore')?.textContent ?? ''`)).length > 10, 'シールのいわれ');

    // §76.11 ノートに貼る: 「ノートに貼る」→ 盤面にもどる → ページを押す → #sticker-layer に描かれる。押すと、はがせる
    await page.eval(`document.querySelector('#slot-pop [data-hero="paste"]').click()`);
    await page.waitFor(`document.body.classList.contains('pasting') && document.querySelector('#view-board').classList.contains('active') && !document.querySelector('#paste-hint').hidden`);
    const at = await page.eval(`(() => {
      const svg = document.querySelector('#board');
      const p = new DOMPoint(30 * 16, 46 * 16).matrixTransform(svg.getScreenCTM()); // 1ページ目の右下（ページの原点は 0）
      svg.dispatchEvent(new MouseEvent('click', { clientX: p.x, clientY: p.y, bubbles: true }));
      return [p.x, p.y];
    })()`);
    assert.ok(at[0] > 0 && at[1] > 0, String(at));
    await page.waitFor(`document.querySelectorAll('#sticker-layer .pasted').length === 1 && !document.body.classList.contains('pasting')`, { message: 'シールが貼られた' });
    assert.equal(await page.eval(`!!document.querySelector('#sticker-layer .pasted use')`), true);
    await page.eval(`(() => {
      const g = document.querySelector('#sticker-layer .pasted');
      const r = g.getBoundingClientRect();
      g.querySelector('.ps-edge').dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true }));
    })()`);
    await page.waitFor(`!document.querySelector('#peel-menu').hidden`);
    await page.eval(`document.querySelector('#peel-menu [data-hero="peel"]').click()`);
    await page.waitFor(`document.querySelectorAll('#sticker-layer .pasted').length === 0`, { message: 'はがした' });
    assert.equal(await page.eval(`document.querySelectorAll('#toast svg, #toast img').length`), 0, '知らせ（#toast）には絵を入れない');
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§76.27 出撃中の戦果: エージェントが出撃しているあいだ、勇者のカードに「出撃中 N体撃破」', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-b22-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  assert.equal(masume(['new', 'tutorial.map.json'], { cwd: dir }).code, 0);
  assert.equal(masume(['sortie', 'apprentice', '--agent', 'claude', '--dir', dir]).code, 0, masume(['status', '--dir', dir]).all);
  mkdirSync(join(dir, 'ai'), { recursive: true });
  writeFileSync(join(dir, 'ai', 'hello.txt'), 'こんにちは、GridHub！\n');
  assert.equal(masume(['step', 'apprentice', '--dir', dir]).code, 0);
  const home = tmp('gridhub-b22-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: dir });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(`window.__masume && window.__masume.hero && !!document.querySelector('#hero-card .hc-sortie')`, { timeout: 20000, message: '出撃中の戦果' });
    const text = await page.eval(`document.querySelector('#hero-card .hc-sortie').innerText`);
    assert.ok(text.includes('出撃中') && text.includes('3体撃破') && text.includes('見習いAI'), text);
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§76.23 次のボス戦まで: 見本の盤面で「ボス戦 G1 まで あと 6体・仲間 1/3 到着」、押すとそのゲート', { timeout: 60000 }, async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.waitFor(`!document.querySelector('#boss-meter').hidden`);
    assert.deepEqual(await page.eval('window.__masume.nextBoss'), { id: 'G1', title: '結合: 冒険が盤面に映る', goal: false, left: 6, stamps: 0, arrived: 1, members: 3 });
    const text = await page.eval(`document.querySelector('#boss-meter').innerText`);
    assert.ok(text.includes('ボス戦 G1 まで あと 6体') && text.includes('仲間 1/3 到着'), text);
    await page.eval(`document.querySelector('#boss-meter').click()`);
    await page.waitFor(`document.querySelector('#drawer')?.dataset.id === 'G1'`, { message: 'ゲートの札が開く' });
    // §76.32 あなたの番！: 人間がハンコのマスにいれば、ボタン。押すとそのマスの札（ハンコのボタンがある）
    const turn = await page.eval('window.__masume.yourTurn');
    assert.ok(turn, '見本では勇者がハンコ待ち');
    assert.match(await page.eval(`document.querySelector('#your-turn').innerText`), /あなたの番！ ハンコを押す/);
    await page.eval(`document.querySelector('#your-turn').click()`);
    await page.waitFor(`document.querySelector('#drawer')?.dataset.id === ${JSON.stringify(turn)} && !!document.querySelector('#drawer button[data-stamp]')`, { message: 'ハンコのボタン' });
    // ゲートを全員突破したあとの見本（あがり）では出さない
    await page.goto(`${srv.url}/?fixture=end`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(`document.querySelector('#boss-meter').hidden`), true);
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§76.8 見本（?fixture=）と、手帳の窓口が無いときは、手帳のタブもカードも出さない', { timeout: 60000 }, async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1280, height: 800 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 800));
    assert.equal(await page.eval(`document.querySelector('#techo-tab').hidden`), true);
    assert.equal(await page.eval(`document.querySelector('#hero-card').hidden`), true);
    assert.equal(await page.eval(`document.querySelector('#welcome').hidden`), true);
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§76.16〜§76.18 盤面: 交換所でめくる・自己ベストの札・称号を名乗ると勇者のカードに添えられる', { timeout: 120000 }, async () => {
  const home = tmp('gridhub-b22-home-');
  const srv = await startGridhub(['serve', '--port', '0', '--dir', ROOT, '--no-open'], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH, GRIDHUB_APP_HOME: home }, cwd: ROOT });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    const opened = await fetch(`${srv.url}/api/hero/open`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify({ count: 300 }) });
    assert.equal(opened.status, 200);
    await page.goto(`${srv.url}/?view=techo`);
    await page.waitFor(`window.__masume && window.__masume.hero && document.querySelectorAll('#techo .al-slot').length === 39`, { timeout: 30000, message: '手帳' });
    await page.eval(`document.querySelector('#welcome').hidden = true; document.querySelector('#ending').hidden = true`);
    // §76.22 駒の装備: Lv9 は王冠・足もとの光・マント・剣
    for (const g of ['gear-crown', 'gear-aura', 'gear-cape', 'gear-sword']) assert.ok(await page.eval(`!!document.querySelector('.pawn[data-level="9"] .${g}')`), g);
    assert.equal(await page.eval(`document.querySelectorAll('.pawn[data-level="1"] .pawn-gear, .pawn[data-level="2"] .pawn-gear').length`), 0, 'Lv1・Lv2 は装備なし');
    const records = await page.eval(`document.querySelector('#techo .tc-records').innerText`);
    for (const w of ['自己ベスト', '1日に倒したテスト', '1回の判定でまとめて', '続けた日数']) assert.ok(records.includes(w), `${w}: ${records}`);

    // 交換所: 「交換」の札のあるシール → 交換ボタン → 開ける部屋で「交換所」のシールがめくれる
    const slot = await page.eval(`document.querySelector('#techo .al-slot.tradable').dataset.slot`);
    const sel = `#techo .al-slot[data-slot="${slot}"]`;
    const count = () => page.eval(`Number(document.querySelector(${JSON.stringify(sel)}).querySelector('.st-count')?.textContent.slice(1) ?? 1)`);
    const before = await count();
    await page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
    await page.waitFor(`!document.querySelector('#slot-pop').hidden && !!document.querySelector('#slot-pop [data-hero="trade"]:not([disabled])')`);
    await page.eval(`document.querySelector('#slot-pop [data-hero="trade"]').click()`);
    await page.waitFor(`!document.querySelector('#bag-room').hidden && document.querySelectorAll('#bag-reveal .reveal-card').length === 1 && document.querySelector('#bag-sum').innerText.includes('交換所')`, { message: '交換所のシールがめくれた' });
    assert.match(await page.eval(`document.querySelector('#bag-reveal').innerText`), /交換所で/);
    await page.eval(`document.querySelector('#bag-close').click()`);
    assert.equal(await count(), before - 5, '5枚へった');

    // 名乗る称号
    await page.eval(`document.querySelector('#techo .ach-wear').click()`);
    await page.waitFor(`!!document.querySelector('#techo .ach-wear.on')`, { message: '名乗った' });
    const name = await page.eval(`document.querySelector('#techo .ach-wear.on').closest('li').querySelector('b').textContent`);
    assert.ok((await page.eval(`document.querySelector('#hero-card .hc-title b').textContent`)).includes(`「${name}」`), '勇者のカードに添えられる');

    // §76.30 ノートの模様: ランク 26 なら「金の方眼」まで。着がえると、紙の色がかわる
    await page.eval(`document.querySelector('#techo .th-swatch[data-id="gold"]').click()`);
    await page.waitFor(`document.documentElement.dataset.notebook === 'gold'`, { message: '着がえた' });
    assert.equal(await page.eval(`getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()`), '#fffbea');
    await page.eval(`document.querySelector('#techo .th-swatch[data-id="note"]').click()`);
    await page.waitFor(`document.documentElement.dataset.notebook === 'note'`);

    // §76.24 冒険者カードの画像: 1200×630 の SVG（ランク・名乗る称号・シールの絵の symbol を中に持つ）→ PNG
    const svg = await page.eval('window.__masume.heroSvg()');
    assert.match(svg, /^<svg[^>]+width="1200" height="630"/);
    for (const w of ['勇者の手帳', '伝説の勇者', `「${name}」`, '倒したテスト']) assert.ok(svg.includes(w), w);
    const uses = [...svg.matchAll(/href="#(hs-[a-z]+)"/g)].map((m) => m[1]);
    assert.ok(uses.length >= 1 && uses.every((id) => svg.includes(`<symbol id="${id}"`)), 'シールの絵は画像の中に');
    const png = await page.eval(`(async () => { const url = URL.createObjectURL(new Blob([window.__masume.heroSvg()], { type: 'image/svg+xml' })); const img = new Image(); await new Promise((ok, ng) => { img.onload = ok; img.onerror = ng; img.src = url; }); const c = document.createElement('canvas'); c.width = 1200; c.height = 630; c.getContext('2d').drawImage(img, 0, 0); return c.toDataURL('image/png').length; })()`);
    assert.ok(png > 10000, 'PNG にできる');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});
