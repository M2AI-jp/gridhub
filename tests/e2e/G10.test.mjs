// G10「結合: 盤面から GitHub に送る」— 書記（gridhub remote・push）＋伝令（/api/git）＋盤面（#git-panel）の結合E2E（第12章）。
// 本物の冒険を gridhub serve で配り、手元の bare リポジトリをリモートにして、盤面の「送る」ボタンで push する。CONTRACTS §56。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { startServeEnv } from '../helpers2.mjs';
import {
  waitUntil, tmp, masume, setupDungeon, dungeonMap, passAll, gitc, bareRemote, remoteHead, commitFile, openBrowser, openBrowserWith, NO_GH, GIT_ENV,
} from '../helpers6.mjs';

const ENV = { ...GIT_ENV, MASUME_GH: NO_GH };
const READY = 'window.__masume && window.__masume.ready';
const state = `document.querySelector('#git-panel')?.dataset.state`;

async function dispatchKey(page, key) {
  const code = key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key;
  const windowsVirtualKeyCode = key === ' ' ? 32 : key === 'Enter' ? 13 : key.toUpperCase().charCodeAt(0);
  const text = key === ' ' ? ' ' : key === 'Enter' ? '\r' : key;
  const base = { key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode };
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', text, unmodifiedText: text, ...base });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
}

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
  commitFile(dir, 'feature.txt', 'feature\n');
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

test('§80.23 PR の構えは別操作・キー操作・5秒経過で解け、札の字も戻る', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-pr-arm-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const gh = join(tmp('gridhub-g10-gh-arm-'), 'gh');
  const open = JSON.stringify([{ number: 7, title: '構えを試す', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'fix/board', author: { login: 'a' } }]);
  writeFileSync(gh, `#!/bin/sh
if [ "$2" = "list" ]; then echo '${open}'; exit 0; fi
if [ "$2" = "merge" ]; then exit 0; fi
echo done
`);
  chmodSync(gh, 0o755);
  assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/arm').code, 0);
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    const button = () => `document.querySelector('.pr-chip[data-number="7"] .pr-merge')`;
    await page.waitFor(button(), { timeout: 10000, message: 'PR のマージボタンが出る' });
    const normal = await page.eval(`${button()}.textContent`);
    await page.eval(`${button()}.click()`);
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'true', '1回目は構えるだけ');
    const laneButton = `document.querySelector('.march-cmd[data-kind="step"]')`;
    await page.waitFor(laneButton, { timeout: 10000, message: 'レーンの手で進めるボタンが出る' });
    await page.eval(`${laneButton}.click()`);
    await page.waitFor(`${button()}.dataset.armed === 'false'`, { timeout: 2000, message: 'レーンのボタンで構えが解ける' });
    await page.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true }))`);
    await page.waitFor(`${button()}.dataset.armed === 'false'`, { timeout: 2000, message: 'キー操作で構えが解ける' });
    assert.equal(await page.eval(`${button()}.textContent`), normal, 'キー操作後に札の字が戻る');
    await page.eval(`${button()}.click()`);
    await page.eval(`document.querySelector('#sound').click()`);
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'false', 'ほかのボタンで構えが解ける');
    assert.equal(await page.eval(`${button()}.textContent`), normal, 'ほかのボタンのあとに札の字が戻る');
    await page.eval(`${button()}.click()`);
    await new Promise((resolve) => setTimeout(resolve, 5200));
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'false', '5秒で構えが解ける');
    assert.equal(await page.eval(`${button()}.textContent`), normal, '時間切れで札の字が戻る');
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.24 PR 番号が変わると同じ内容でも札を描き直す', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-pr-number-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const gh = join(tmp('gridhub-g10-gh-number-'), 'gh');
  const pr = (number) => JSON.stringify([{ number, title: '同じ内容', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'fix/board', author: { login: 'a' } }]);
  const first = pr(13);
  const next = pr(14);
  const changed = `${gh}.changed`;
  writeFileSync(gh, `#!/bin/sh
if [ "$2" = "create" ]; then echo changed > '${changed}'; echo https://example.test/pull/14; exit 0; fi
if [ "$2" = "list" ] && [ -f '${changed}' ]; then echo '${next}'; exit 0; fi
echo '${first}'
`);
  chmodSync(gh, 0o755);
  assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/number').code, 0);
  commitFile(dir, 'feature.txt', 'feature\n');
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    const chip = (number) => `document.querySelector('.pr-chip[data-number="${number}"]')`;
    await page.waitFor(chip(13), { timeout: 10000, message: '#13 の札が出る' });
    await page.waitFor(`!document.querySelector('#march-open-pr').hidden`, { timeout: 10000, message: 'PR 作成ボタンが出る' });
    await page.eval(`document.querySelector('#march-open-pr').click()`);
    await waitUntil(() => existsSync(changed), { timeout: 10000, message: '次の PR の状態に切り替わる' });
    await page.waitFor(chip(14), { timeout: 15000, message: '#14 の札が出る' });
    assert.equal(await page.eval(`!!${chip(13)}`), false, '古い番号の札が残らない');
    assert.equal(await page.eval(`${chip(14)}.dataset.number`), '14');
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.23 本物の Space 2回とフォーカス中の Enter 2回でマージを送り、間にほかのキーを押すと構えが解ける', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-pr-space-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  setupDungeon(dir, { save: true });
  assert.equal(masume(['new', 'dungeon.map.json'], { cwd: dir, env: ENV }).code, 0);
  const gh = join(tmp('gridhub-g10-gh-space-'), 'gh');
  const merged = `${gh}.merged`;
  const open = JSON.stringify([{ number: 7, title: 'Spaceでマージ', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'feature/space', author: { login: 'a' } }]);
  const refreshed = open.replace('Spaceでマージ', 'Spaceでマージ（更新）');
  writeFileSync(gh, `#!/bin/sh
if [ "$2" = "list" ] && [ -f '${merged}' ]; then echo '${refreshed}'; exit 0; fi
if [ "$2" = "list" ]; then echo '${open}'; exit 0; fi
if [ "$2" = "merge" ]; then echo "$3" >> '${merged}'; exit 0; fi
`);
  chmodSync(gh, 0o755);
  assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/space').code, 0);
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const page = await openBrowserWith({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      v.characters = v.characters.map((c) => ({ ...c, status: 'done', at: null, pos: c.path.length, sortie: null }));
      window.__masume.render(v);
    })()`);
    const button = () => `document.querySelector('.pr-chip[data-number="7"] .pr-merge')`;
    await page.waitFor(`${button()}?.dataset.next === 'true'`, { timeout: 10000, message: 'マージが次の一手として光る' });
    await dispatchKey(page, ' ');
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'true', 'Space 1回目は構える');
    assert.equal(existsSync(merged), false, 'Space 1回目では送らない');
    await dispatchKey(page, 'x');
    await page.waitFor(`${button()}.dataset.armed === 'false'`, { timeout: 2000, message: 'ほかのキーで構えが解ける' });
    assert.equal(existsSync(merged), false, '別キーでは送らない');
    await dispatchKey(page, ' ');
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'true', 'もう一度Spaceで構える');
    await dispatchKey(page, ' ');
    await waitUntil(() => existsSync(merged), { timeout: 10000, message: 'Space 2回目でマージを送る' });
    assert.equal(readFileSync(merged, 'utf8').trim(), '7', 'マージされた番号');
    const mergedCalls = () => readFileSync(merged, 'utf8').trim().split(/\s+/).filter(Boolean).length;
    await page.waitFor(`${button()}?.dataset.armed === 'false' && !${button()}.disabled`, { timeout: 5000, message: 'Space のマージ後にボタンが戻る' });
    await page.eval(`${button()}.focus()`);
    await dispatchKey(page, 'Enter');
    assert.equal(await page.eval(`${button()}.dataset.armed`), 'true', 'フォーカス中の Enter 1回目は構える');
    await page.eval(`${button()}.focus()`);
    await dispatchKey(page, 'Enter');
    await waitUntil(() => mergedCalls() >= 2, { timeout: 10000, message: 'フォーカス中の Enter 2回目でマージを送る' });
    assert.deepEqual(page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]')), []);
  } finally {
    await page.close();
    await srv.stop();
  }
});

test('§80.25 PR 作成は先行コミットが無いと不可で、マージ済み HEAD と同じなら不可', { timeout: 120000 }, async () => {
  const readPrs = async ({ ahead, merged }) => {
    const dir = tmp('gridhub-g10-pr-open-');
    assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
    const mainHead = commitFile(dir, 'README.md', '# main\n');
    assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/check').code, 0);
    const head = ahead ? commitFile(dir, 'feature.txt', 'feature\n') : mainHead;
    const gh = join(tmp('gridhub-g10-gh-open-'), 'gh');
    const list = merged
      ? [{ number: 21, title: 'すでにマージ済み', state: 'MERGED', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [], headRefName: 'feature/check', headRefOid: head, baseRefName: 'main', url: 'https://example.test/pull/21' }]
      : [];
    writeFileSync(gh, `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then echo '${JSON.stringify(list)}'; exit 0; fi
exit 1
`);
    chmodSync(gh, 0o755);
    const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
    try {
      return await (await fetch(`${srv.url}/api/prs`)).json();
    } finally {
      await srv.stop();
    }
  };

  assert.equal((await readPrs({ ahead: false, merged: false })).canOpen, false, 'main と同じ HEAD からは作れない');
  assert.equal((await readPrs({ ahead: true, merged: false })).canOpen, true, '先行コミットがあれば作れる');
  assert.equal((await readPrs({ ahead: true, merged: true })).canOpen, false, 'マージ済み PR と同じ HEAD からは作れない');
});

test('§80.26 PR の CI は未確定・起動失敗・要対応・未知をマージ不可にする', async () => {
  const { prOf } = await import('../../src/server/index.js');
  const checks = (rollup) => prOf({ state: 'OPEN', statusCheckRollup: rollup }).checks;
  for (const conclusion of ['SUCCESS', 'NEUTRAL', 'SKIPPED']) assert.equal(checks([{ status: 'COMPLETED', conclusion }]), 'pass', conclusion);
  for (const conclusion of ['EXPECTED', 'REQUESTED']) assert.equal(checks([{ status: conclusion }]), 'running', conclusion);
  for (const conclusion of ['STARTUP_FAILURE', 'ACTION_REQUIRED']) assert.equal(checks([{ status: 'COMPLETED', conclusion }]), 'fail', conclusion);
  assert.equal(checks([{ status: 'COMPLETED', conclusion: 'UNKNOWN_RESULT' }]), 'running', '未知の結果はマージ不可');
});

test('§80.27 PR の作成とマージは同時実行を 409 と実行中の字で止める', { timeout: 120000 }, async () => {
  const dir = tmp('gridhub-g10-pr-busy-');
  const gh = join(tmp('gridhub-g10-gh-busy-'), 'gh');
  const createStarted = `${gh}.create-started`;
  const mergeStarted = `${gh}.merge-started`;
  writeFileSync(gh, `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then echo started > '${createStarted}'; sleep 1; echo https://example.test/pull/30; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then echo started > '${mergeStarted}'; sleep 1; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then echo '[]'; exit 0; fi
exit 1
`);
  chmodSync(gh, 0o755);
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const post = (path, body) => fetch(`${srv.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-masume': '1' },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  try {
    const firstCreate = post('/api/prs/create', {});
    await waitUntil(() => existsSync(createStarted), { timeout: 5000, message: 'PR 作成が始まる' });
    const secondCreate = await post('/api/prs/create', {});
    assert.equal(secondCreate.status, 409);
    assert.equal(secondCreate.body.code, 'E_BUSY');
    assert.match(secondCreate.body.error, /作成/);
    assert.equal((await firstCreate).status, 200);

    const firstMerge = post('/api/prs/merge', { number: 30 });
    await waitUntil(() => existsSync(mergeStarted), { timeout: 5000, message: 'PR マージが始まる' });
    const secondMerge = await post('/api/prs/merge', { number: 30 });
    assert.equal(secondMerge.status, 409);
    assert.equal(secondMerge.body.code, 'E_BUSY');
    assert.match(secondMerge.body.error, /マージ/);
    assert.equal((await firstMerge).status, 200);
  } finally {
    await srv.stop();
  }
});

test('§80.28 PR 作成・マージが時間切れでも一覧で成功を確認する', { timeout: 150000 }, async () => {
  const dir = tmp('gridhub-g10-pr-timeout-');
  assert.equal(gitc(dir, 'init', '-q', '-b', 'main').code, 0);
  commitFile(dir, 'README.md', '# main\n');
  assert.equal(gitc(dir, 'checkout', '-q', '-b', 'feature/timeout').code, 0);
  const head = commitFile(dir, 'feature.txt', 'feature\n');
  const gh = join(tmp('gridhub-g10-gh-timeout-'), 'gh');
  const created = `${gh}.created`;
  const merged = `${gh}.merged`;
  const open = [{ number: 31, title: '時間切れでも作成済み', state: 'OPEN', isDraft: false, reviewDecision: 'APPROVED', statusCheckRollup: [{ status: 'COMPLETED', conclusion: 'SUCCESS' }], headRefName: 'feature/timeout', headRefOid: head, baseRefName: 'main', url: 'https://example.test/pull/31' }];
  const done = open.map((pr) => ({ ...pr, state: 'MERGED' }));
  writeFileSync(gh, `#!/bin/sh
if [ "$1" = "pr" ] && [ "$2" = "create" ]; then echo created > '${created}'; sleep 31; echo https://example.test/pull/31; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "merge" ]; then echo merged > '${merged}'; sleep 31; exit 0; fi
if [ "$1" = "pr" ] && [ "$2" = "list" ]; then
  if [ -f '${merged}' ]; then echo '${JSON.stringify(done)}'; exit 0; fi
  if [ -f '${created}' ]; then echo '${JSON.stringify(open)}'; exit 0; fi
  echo '[]'; exit 0
fi
exit 1
`);
  chmodSync(gh, 0o755);
  const srv = await startServeEnv(dir, { ...GIT_ENV, MASUME_GH: gh });
  const post = (path, body) => fetch(`${srv.url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-masume': '1' },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  try {
    const createdResponse = await post('/api/prs/create', {});
    assert.equal(createdResponse.status, 200);
    assert.equal(createdResponse.body.ok, true);
    const mergedResponse = await post('/api/prs/merge', { number: 31 });
    assert.equal(mergedResponse.status, 200);
    assert.equal(mergedResponse.body.ok, true);
  } finally {
    await srv.stop();
  }
});
