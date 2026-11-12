// G10「結合: 盤面から GitHub に送る」— 書記（gridhub remote・push）＋伝令（/api/git）＋盤面（#git-panel）の結合E2E（第12章）。
// 本物の冒険を gridhub serve で配り、手元の bare リポジトリをリモートにして、盤面の「送る」ボタンで push する。CONTRACTS §56。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { startServeEnv } from '../helpers2.mjs';
import {
  waitUntil, tmp, masume, setupDungeon, dungeonMap, passAll, gitc, bareRemote, remoteHead, commitFile, openBrowser, NO_GH, GIT_ENV,
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

    // 5. 進軍のボタンがそのまま開発の操作になる（§80.8）: テスト実行 → git push → 判定
    const h3 = commitFile(dir, 'notes2.txt', 'メモ2\n');
    const seq = () => page.eval('window.__masume.view.head.seq');
    const before = await seq();
    await page.waitFor(`document.querySelector('.march-cmd[data-kind=step][data-char=a]')`, { timeout: 10000, message: 'テスト実行のボタン' });
    await page.eval(`document.querySelector('.march-cmd[data-kind=step][data-char=a]').click()`);
    await page.waitFor(`window.__masume.view.head.seq > ${before}`, { timeout: 30000, message: 'テスト実行が記録に残る' });
    await page.waitFor(`!document.querySelector('#march-push').hidden`, { timeout: 15000, message: '送っていないセーブがあれば git push が出る' });
    assert.match(await page.eval(`document.querySelector('#march-push').innerText`), /（1）/);
    await page.eval(`document.querySelector('#march-push').click()`);
    await page.waitFor(`document.querySelector('#march-push').hidden`, { timeout: 20000, message: '送り終えたら消える' });
    assert.equal(remoteHead(bare), h3, 'bare リポジトリに届いた');
    const pos = await page.eval(`window.__masume.view.characters.find((c) => c.id === 'a').pos`);
    await page.eval(`document.querySelector('.march-cmd[data-kind=check][data-char=a]').click()`);
    await page.waitFor(`window.__masume.view.characters.find((c) => c.id === 'a').pos > ${pos}`, { timeout: 60000, message: '判定に通ると進む' });

    const errors = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    if (errors.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(errors, [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.16 PR の札: gh の PR が並び、CI・レビューが見え、2回押すとマージする', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-pr-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  // 偽の gh: pr list は一覧、pr merge はマージ済みの印を置く
  const gh = join(tmp('gridhub-g10-gh-'), 'gh');
  const merged = `${gh}.merged`;
  const open = JSON.stringify([{ number: 7, title: '盤面を直す', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'fix/board', author: { login: 'a' } }, { number: 6, title: '失敗中', state: 'OPEN', isDraft: false, reviewDecision: '', statusCheckRollup: [{ name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' }], headRefName: 'b', author: { login: 'b' } }]);
  assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/x').code, 0);
  const commented = JSON.stringify(JSON.parse(open).map((p) => (p.number === 6 ? { ...p, comments: [{ author: { login: 'rev' }, body: '境界値を足してください', createdAt: '2026-11-01T00:00:00Z' }] } : p)));
  writeFileSync(gh, `#!/bin/sh\nif [ "$2" = "list" ] && [ -f '${gh}.created' ] && [ ! -f '${merged}' ]; then echo '${commented}'; exit 0; fi\nif [ "$2" = "create" ]; then echo created > '${gh}.created'; echo https://example.test/pull/8; exit 0; fi\nif [ "$2" = "merge" ]; then echo "$3" > '${merged}'; exit 0; fi\nif [ -f '${merged}' ]; then echo '${open.replace('"OPEN"', '"MERGED"')}'; else echo '${open}'; fi\n`);
  chmodSync(gh, 0o755);
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    const chip = (n) => `document.querySelector('.pr-chip[data-number="${n}"]')`;
    await page.waitFor(chip(7), { timeout: 10000, message: 'PR の札が出る' });
    await page.waitFor(`!document.querySelector('#march-open-pr').hidden`, { timeout: 5000, message: 'いまのブランチから PR を作れる' });
    await page.eval(`document.querySelector('#march-open-pr').click()`);
    await waitUntil(() => existsSync(`${gh}.created`), { timeout: 10000, message: 'gh pr create が走る' });
    // 読み直すと新しいコメントが見つかり、レーンの会話になる
    await page.waitFor(`window.__masume.marchTalk?.text === '境界値を足してください'`, { timeout: 15000, message: 'レビューのコメントがレーンで話される' });
    assert.equal(await page.eval(`window.__masume.marchTalk.who`), 'rev');
    assert.match(await page.eval(`${chip(7)}.innerText`), /CI/);
    assert.match(await page.eval(`${chip(6)}.innerText`), /lint/, '落ちたジョブの名前が出る');
    assert.equal(await page.eval(`!!${chip(6)}.querySelector('.pr-merge')`), false, 'CI が落ちている PR はマージできない');
    await page.eval(`${chip(7)}.querySelector('.pr-merge').click()`);
    assert.equal(existsSync(merged), false, '1回目では何も起きない');
    await page.eval(`${chip(7)}.querySelector('.pr-merge').click()`);
    await page.waitFor(`${chip(7)}.dataset.state === 'MERGED'`, { timeout: 20000, message: 'マージ済みになる' });
    assert.equal(readFileSync(merged, 'utf8').trim(), '7');
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.8 人が判定に落ちても、押せるボタンが残り、やり直して先へ進める', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-human-');
  const map = dungeonMap({});
  const me = map.characters.find((c) => c.id === 'a');
  me.kind = 'human';
  me.agent = 'human';
  setupDungeon(dir, { map });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const srv = await startServeEnv(dir, ENV);
  const page = await openBrowser({ width: 1440, height: 900 });
  const lane = `window.__masume.march.lanes.find((l) => l.id === 'a')`;
  const pos = `window.__masume.view.characters.find((c) => c.id === 'a').pos`;
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.waitFor(`document.querySelector('.march-cmd[data-kind=check][data-char=a]')`, { timeout: 10000, message: '判定のボタン' });
    assert.match(await page.eval(`document.querySelector('.march-cmd[data-kind=check][data-char=a]').innerText`), /0\/\d/, '通ったテストの数が見える');
    assert.equal(await page.eval(`document.querySelector('.march-cmd[data-kind=check][data-char=a]').dataset.ready`), 'false');
    // テストが落ちたまま判定する
    await page.eval(`document.querySelector('.march-cmd[data-kind=check][data-char=a]').click()`);
    await page.waitFor(`${lane}.status === 'down'`, { timeout: 60000, message: '判定に落ちる' });
    assert.equal(await page.eval(`${lane}.cmd`), 'hand', '押せるものが残る');
    await page.waitFor(`document.querySelector('.march-cmd[data-kind=check][data-char=a]')`, { timeout: 5000, message: '落ちたあとも判定を押せる' });
    // 直してもう一度
    passAll(dir, 'A1');
    const before = await page.eval(pos);
    await page.eval(`document.querySelector('.march-cmd[data-kind=check][data-char=a]').click()`);
    await page.waitFor(`${pos} > ${before}`, { timeout: 60000, message: 'やり直して通ると進む' });
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.8 レーンの承認: 欄は1枚だけ開き、承認に通ると閉じて先へ進む', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-stamp-');
  setupDungeon(dir, {});
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const srv = await startServeEnv(dir, ENV);
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    const button = `document.querySelector('.march-cmd[data-kind=stamp][data-char=h]')`;
    await page.waitFor(button, { timeout: 10000, message: '承認のボタン' });
    await page.eval(`${button}.click()`);
    await page.waitFor(`!document.querySelector('#hand').hidden && document.querySelector('#hand-stamp')`, { timeout: 10000, message: '手で進める欄が開く' });
    assert.equal(await page.eval(`document.body.classList.contains('drawer-open')`), false, '右の欄は重ねない');
    await page.waitFor(`document.querySelector('#hand-stamp').offsetParent && !document.querySelector('#hand-stamp').disabled && document.querySelector('#hand').innerText.includes('H1')`, { timeout: 10000, message: '読み込みが終わる' });
    await new Promise((r) => setTimeout(r, 500));
    // キーだけで: Esc で閉じて Space で開き、Enter で承認する
    const key = (k) => page.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
    await key('Escape');
    assert.equal(await page.eval(`document.querySelector('#hand').hidden`), true, 'Esc で閉じる');
    await page.eval(`document.activeElement?.blur?.()`);
    await page.eval(`document.querySelector('.march-cmd[data-kind=stamp][data-char=h]').click()`);
    await page.waitFor(`!document.querySelector('#hand').hidden && document.querySelector('#hand-stamp').offsetParent && !document.querySelector('#hand-stamp').disabled`, { timeout: 10000, message: 'もう一度開く' });
    await new Promise((r) => setTimeout(r, 500));
    await key('Enter');
    await page.waitFor(`document.querySelector('#hand').hidden`, { timeout: 10000, message: '承認に通ると閉じる' });
    await page.waitFor(`window.__masume.view.characters.find((c) => c.id === 'h').pos === 1`, { timeout: 10000, message: '先へ進む' });
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});
