// G8「結合: 盤面だけで箱のソケットを開ける」— 伝令（窓口 §33）＋賢者クロード（盤面 §34）。
// 本物の masume serve と本物の盤面で、入口のチェック → 生まれた冒険の party.json → 出撃の窓の既定 → パーティの「箱のソケット:」まで、流れで確かめる。
// GM とエージェントは偽物（MASUME_GM_OVERRIDE / MASUME_AGENT_OVERRIDE。cmd: なので「codex にだけ効きます」の知らせになる）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, getJson, waitUntil, startServeEnv, fakeGm, fakeAgent } from '../helpers2.mjs';
import { openBrowser } from '../helpers3.mjs';

const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]'));

test('盤面だけで: 入口でソケットを開けて願いを出し、生まれた冒険では出撃の窓が Codex・開けた状態で始まり、パーティに届く', { timeout: 180000 }, async () => {
  const root = tmp('masume-board-only-');
  const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('good'), MASUME_AGENT_OVERRIDE: fakeAgent('good') });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.lobby === true', { timeout: 15000, message: 'ロビーが出る' });

    // 入口: 願い・GM は Codex・ソケットを開ける
    await page.eval(`(() => {
      const w = document.querySelector('#wish');
      w.value = 'メモアプリのようなアプリを作りたい';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      const gm = document.querySelector('#gm');
      gm.value = 'codex';
      gm.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
    await page.eval(`document.querySelector('#gm-allow-listen').click()`);
    await page.eval(`document.querySelector('#start-quest').click()`);

    // 冒険が生まれて盤面になる
    await page.waitFor('window.__masume.lobby === false && document.querySelectorAll(".pawn[data-char]").length > 0', { timeout: 60000, message: '冒険が生まれて盤面になる' });
    const pj = JSON.parse(readFileSync(join(root, '.masume', 'party.json'), 'utf8'));
    assert.equal(pj.allow_listen, true, '入口のチェックが party.json に持ち越された');
    assert.equal(pj.agent, 'codex', 'GM と同じエージェント');
    const q = await getJson(`${srv.url}/api/quest`);
    assert.match(q.body.log, /^箱のソケット: /m, `GM の起動に --allow-listen が届いた\n${q.body.log}`);

    // 出撃の窓: 既定は Codex・開けた状態
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true && document.querySelector('#sortie-agent').value === 'codex' && document.querySelector('#sortie-allow-listen').checked === true`,
      { timeout: 8000, message: '出撃の窓は Codex・ソケットを開けた状態で始まる' });
    await page.eval(`document.querySelector('#sortie-go').click()`);

    // パーティに届き、最後まで巡回する
    const p = await waitUntil(async () => {
      const x = await getJson(`${srv.url}/api/party`);
      return x.body.running === false && x.body.code !== null ? x.body : null;
    }, { timeout: 90000, message: 'パーティが止まる' });
    assert.match(p.log, /^箱のソケット: /m, `出撃に --allow-listen が届いた\n${p.log}`);
    assert.equal(p.allow_listen, true, 'GET /api/party も開けた状態');
    assert.equal(p.agent, 'codex');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('盤面だけで: 出撃の窓でチェックを外せば、party.json が開けていてもその出撃だけ閉じる', { timeout: 180000 }, async () => {
  const root = tmp('masume-board-only-');
  const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('good'), MASUME_AGENT_OVERRIDE: fakeAgent('good') });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.lobby === true', { timeout: 15000, message: 'ロビーが出る' });
    await page.eval(`(() => {
      const w = document.querySelector('#wish');
      w.value = '家計簿のようなアプリを作りたい';
      w.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#gm').value = 'codex';
      document.querySelector('#gm-allow-listen').click();
      document.querySelector('#start-quest').click();
    })()`);
    await page.waitFor('window.__masume.lobby === false && document.querySelectorAll(".pawn[data-char]").length > 0', { timeout: 60000, message: '冒険が生まれて盤面になる' });
    await page.eval(`document.querySelector('#sortie-open').click()`);
    await page.waitFor(`document.querySelector('#sortie-modal').open === true && document.querySelector('#sortie-allow-listen').checked === true`, { timeout: 8000, message: '既定は開けた状態' });
    await page.eval(`document.querySelector('#sortie-allow-listen').click()`);
    await page.eval(`document.querySelector('#sortie-go').click()`);
    const p = await waitUntil(async () => {
      const x = await getJson(`${srv.url}/api/party`);
      return x.body.running === false && x.body.code !== null ? x.body : null;
    }, { timeout: 90000, message: 'パーティが止まる' });
    assert.doesNotMatch(p.log, /^箱のソケット: /m, `外したら閉じる（--no-allow-listen）\n${p.log}`);
    assert.equal(JSON.parse(readFileSync(join(root, '.masume', 'party.json'), 'utf8')).allow_listen, true, 'party.json はそのまま');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});
