// G10「結合: 盤面から GitHub に送る」— 書記（gridhub remote・push）＋伝令（/api/git）＋盤面（#git-panel）の結合E2E（第12章）。
// 本物の冒険を gridhub serve で配り、手元の bare リポジトリをリモートにして、盤面の「送る」ボタンで push する。CONTRACTS §56。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServeEnv } from '../helpers2.mjs';
import {
  tmp, masume, setupDungeon, passAll, gitc, bareRemote, remoteHead, commitFile, openBrowser, NO_GH, GIT_ENV,
} from '../helpers6.mjs';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const READY = 'window.__masume && window.__masume.ready';
const state = `document.querySelector('#git-panel')?.dataset.state`;

test('盤面のセーブの欄から、手元の bare リポジトリに送れる（書記 × 伝令 × 盤面）', { timeout: 240000 }, async () => {
  const dir = tmp('gridhub-g10-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  commitFile(dir, 'README.md', '# ダンジョン\n');
  let srv;
  try {
    srv = await startServeEnv(dir, ENV);
  } catch (e) {
    console.log('MASUME_BLAME: server');
    throw e;
  }
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000, message: '盤面が描かれる' });
    await page.waitFor(`document.querySelector('#live').dataset.mode === 'live'`, { timeout: 10000, message: 'ライブ接続' });

    // 1. リモートが無い → 手引き
    try {
      await page.waitFor(`${state} === 'no-remote'`, { timeout: 10000, message: 'リモートが無いので手引き' });
    } catch (e) {
      console.log('MASUME_BLAME: board');
      throw e;
    }
    const guide = await page.eval(`[...document.querySelectorAll('#git-guide li[data-step]')].map((li) => li.dataset.step).join(' ')`);
    assert.equal(guide, 'git gh login repo push');

    // 2. bare リポジトリをつなぐ → 盤面を開き直すと「まだ一度も送っていない」と送るボタン
    const bare = bareRemote();
    assert.equal(gitc(dir, 'remote', 'add', 'origin', bare).code, 0);
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.waitFor(`${state} === 'unpushed'`, { timeout: 10000, message: 'リモートがあって、まだ送っていない' });
    assert.match(await page.eval(`document.querySelector('#git-ahead').innerText`), /まだ一度も送っていない/);
    assert.ok(!(await page.eval(`document.querySelector('#git-push').disabled`)), '送るボタンが押せる');

    // 3. 押す → bare リポジトリに届き、synced
    const head = gitc(dir, 'rev-parse', 'HEAD').out;
    await page.eval(`document.querySelector('#git-push').click()`);
    await page.waitFor(`${state} === 'synced'`, { timeout: 20000, message: '送り終えた' });
    assert.equal(remoteHead(bare), head, 'bare リポジトリに届いた');
    assert.match(await page.eval(`document.querySelector('#git-ahead').innerText`), /GitHub に送っていないセーブ: 0/);

    // 4. 手でコミットしてから歩く（冒険の書が変わる）→ 盤面は送っていないセーブ 1 を出す → 押すと届く
    const h2 = commitFile(dir, 'notes.txt', 'メモ\n');
    passAll(dir, 'A1');
    assert.equal(masume(['step', 'a', '--dir', dir, '--as', 'a'], { env: ENV }).code, 0);
    await page.waitFor(`${state} === 'unpushed'`, { timeout: 15000, message: '冒険の書が変わったら読み直す' });
    assert.match(await page.eval(`document.querySelector('#git-ahead').innerText`), /GitHub に送っていないセーブ: 1/);
    await page.eval(`document.querySelector('#git-push').click()`);
    await page.waitFor(`${state} === 'synced'`, { timeout: 20000, message: 'もう一度送り終えた' });
    assert.equal(remoteHead(bare), h2);

    const errors = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    if (errors.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(errors, [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.stop();
  }
});
