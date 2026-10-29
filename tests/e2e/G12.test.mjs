// G12「結合: アプリの中だけでチュートリアルをあがる」— 書記・伝令・盤面・地図職人の結合E2E（第16章）。CONTRACTS §73。
// gridhub app を起こし、はじめの画面の「チュートリアルで遊ぶ」から、盤面の「手で進める」だけで（見本を写す → 保存 →
// ハンコ・宣言判定・ボス戦）あがる。claude は PATH に置かない。最後に標準入力を閉じると、起動役も盤面のサーバーも止まる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { openBrowser, waitUntil, startApp, listening, getJson } from '../helpers8.mjs';

const LOADED = `document.querySelector('#hand')?.dataset.loaded === 'true' && document.querySelector('#hand').dataset.busy !== 'true'`;
const visible = (sel) => `(() => { const e = document.querySelector('${sel}'); return !!e && !e.hidden && e.offsetParent !== null; })()`;

test('はじめの画面の「チュートリアルで遊ぶ」から、盤面の「手で進める」だけであがり、標準入力を閉じると全部止まる（書記 × 伝令 × 盤面 × 地図職人）', { timeout: 300000 }, async () => {
  let app;
  try {
    app = await startApp({ claude: false, lifeline: true });
  } catch (e) {
    console.log('MASUME_BLAME: server');
    throw e;
  }
  let page;
  let boardUrl = null;
  let ended = false;
  try {
    page = await openBrowser({ width: 1440, height: 900 });
    await page.goto(`${app.url}/`);
    await page.waitFor('window.__gridhubStart && window.__gridhubStart.ready === true', { timeout: 20000, message: 'はじめの画面' });
    assert.equal(await page.eval(`document.querySelector('#env-claude').dataset.found`), 'false', 'claude が無いことを知らせる');
    assert.match(await page.eval(`document.querySelector('#env-claude').innerText`), /チュートリアルは claude なしで遊べます/);
    await page.eval(`document.querySelector('#tutorial').click()`);
    await page.waitFor(`location.pathname === '/' && new URLSearchParams(location.search).has('home') && window.__masume && window.__masume.ready && !!window.__masume.view`, { timeout: 30000, message: 'チュートリアルの盤面に移る' });
    boardUrl = await page.eval('location.origin');
    assert.notEqual(boardUrl, app.url, '盤面のサーバーは起動役とは別のポート');
    assert.equal(await page.eval(visible('a#home-link')), true, '「はじめの画面」に戻れる');
    assert.equal(await page.eval('window.__masume.view.quest.id'), 'TUT');

    const view = async () => (await getJson(`${boardUrl}/api/state`)).body;
    let moves = 0;
    for (let round = 0; round < 30; round++) {
      const v = await view();
      if (v.finished) break;
      const working = v.characters.filter((c) => c.status === 'working');
      const ready = Object.entries(v.nodes).find(([, n]) => n.type === 'gate' && n.state === 'ready');
      const fighting = Object.values(v.nodes).some((n) => n.type === 'gate' && n.state === 'battle');
      if (working.length === 0) {
        if (ready) {
          // ボス戦がまだ始まっていなければ、待っている仲間の「手で進める」から始める
          const member = v.characters.find((c) => c.at === ready[0]);
          await page.eval(`window.__masume.select('char', ${JSON.stringify(member.id)})`);
          await page.waitFor(`!!document.querySelector('#drawer button[data-hand="${member.id}"]')`);
          await page.eval(`document.querySelector('#drawer button[data-hand="${member.id}"]').click()`);
          await page.waitFor(`document.querySelector('#hand').dataset.char === ${JSON.stringify(member.id)} && ${LOADED}`, { timeout: 15000 });
          if (await page.eval(visible('#hand-battle'))) await page.eval(`document.querySelector('#hand-battle').click()`);
        }
        await waitUntil(async () => {
          const now = await view();
          return now.finished || now.characters.some((c) => c.status === 'working') || now.head.seq !== v.head.seq;
        }, { timeout: 60000, message: `ボス戦の結果を待つ${fighting ? '（戦闘中）' : ''}` });
        continue;
      }
      const c = working[0];
      await page.eval(`window.__masume.select('char', ${JSON.stringify(c.id)})`);
      await page.waitFor(`!!document.querySelector('#drawer button[data-hand="${c.id}"]')`, { timeout: 15000, message: `${c.id} の「手で進める」` });
      await page.eval(`document.querySelector('#drawer button[data-hand="${c.id}"]').click()`);
      await page.waitFor(`document.querySelector('#hand').dataset.char === ${JSON.stringify(c.id)} && ${LOADED}`, { timeout: 15000, message: `${c.id} の指令書` });
      const samples = await page.eval(`[...document.querySelectorAll('#hand button[data-sample]')].map((b) => b.dataset.sample)`);
      for (const path of samples) {
        await page.eval(`document.querySelector('#hand button[data-sample="${path}"]').click()`);
        await page.waitFor(`document.querySelector('#hand-path').value === ${JSON.stringify(path)}`);
        await page.eval(`document.querySelector('#hand-save').click()`);
        await page.waitFor(`${LOADED} && /保存しました/.test(document.querySelector('#hand-msg').innerText)`, { timeout: 15000, message: `${path} を保存` });
      }
      const seq = v.head.seq;
      if (await page.eval(visible('#hand-stamp'))) {
        await page.eval(`document.querySelector('#hand-stamp').click()`);
      } else {
        assert.equal(await page.eval(visible('#hand-check')), true, `${c.id} @ ${c.at}: 宣言判定のボタン`);
        await page.eval(`document.querySelector('#hand-check').click()`);
        await page.waitFor(`${LOADED} && document.querySelector('#hand-msg').dataset.ok !== undefined && /判定/.test(document.querySelector('#hand-msg').innerText)`, { timeout: 60000, message: `${c.id} の宣言判定` });
        assert.equal(await page.eval(`document.querySelector('#hand-msg').dataset.ok`), 'true', `${c.id} @ ${c.at}: ${await page.eval(`document.querySelector('#hand-msg').innerText`)}`);
      }
      await waitUntil(async () => (await view()).head.seq > seq, { timeout: 30000, message: `${c.id} が進む` });
      moves++;
    }
    const last = await view();
    assert.equal(last.finished, true, `あがり（${JSON.stringify(last.characters.map((c) => [c.id, c.at, c.status]))}）`);
    assert.equal(moves, 5, '手で進めたのは H1・A1・A2・A3・H2 の5回（ゲートのボス戦は仲間がそろうと始まる）');
    await page.waitFor(`window.__masume.view && window.__masume.view.finished === true`, { timeout: 20000, message: '盤面にもあがりが映る' });
    await page.close();
    page = null;

    // 命綱: 標準入力を閉じると、起動役も盤面のサーバーも止まる
    app.proc.stdin.end();
    const code = await Promise.race([app.exited, new Promise((r) => setTimeout(() => r('timeout'), 20000))]);
    assert.notEqual(code, 'timeout', `標準入力を閉じたら止まる\n${app.output()}`);
    ended = true;
    assert.equal(await listening(app.url), false, '起動役が止まる');
    assert.equal(await listening(boardUrl), false, '盤面のサーバーも止まる');
  } finally {
    // 途中で落ちても、起動役を残さない（残ると判定のプロセスが終われない）
    await page?.close();
    if (!ended) await app.stop();
  }
});
