// B24「進軍」— 盤面の見方。CONTRACTS §80。
// 見本の冒険で: 開くと進軍、レーンと敵がビューどおり、レーンを押すと欄が開く、ノートに切り替えて覚える、ことばが切り替わる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT, openBrowser, serveStatic } from '../helpers8.mjs';
import { laneStatus, foesOf, commandOf, nextCommand, routeOf, foesToGate, arenasOf, laneOrder, travelOf, chainNameOf, toolsOf, streakOf, prEvents, prsToShow, canMerge, nextBarAction } from '../../web/board/march-status.js';
import { CREW, POSES, compose, bust, boss, mob, flies } from '../../web/board/march-art.js';

const READY = 'window.__masume && window.__masume.ready && window.__masume.march';
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

test('§80.3 レーンの様子: 出撃していないキャラクターは戦わない', () => {
  const nodes = { T: { id: 'T', type: 'task', state: 'current', check: { kind: 'cmd' }, cases: [{ name: 'a', ok: true }, { name: 'b', ok: false }] }, C: { id: 'C', type: 'camp' }, S: { id: 'S', type: 'task', check: { kind: 'stamp', by: 'me' }, cases: [] } };
  const view = (log = []) => ({ nodes, log });
  const c = (o) => ({ id: 'x', kind: 'agent', status: 'working', at: 'T', ...o });
  assert.equal(laneStatus(c({}), view()), 'ready');
  assert.equal(laneStatus(c({ sortie: { pid: 1 } }), view()), 'working');
  assert.equal(laneStatus(c({ status: 'done', at: null }), view()), 'done');
  assert.equal(laneStatus(c({ status: 'waiting' }), view()), 'waiting');
  assert.equal(laneStatus(c({ at: 'C' }), view()), 'camp');
  assert.equal(laneStatus(c({ kind: 'human', id: 'me', at: 'S' }), view()), 'turn');
  assert.equal(laneStatus(c({ kind: 'human', id: 'you', at: 'S' }), view()), 'ready', 'ほかの人のハンコは、その人の番');
  const failed = [{ character: 'x', type: 'check_failed' }, { character: 'x', type: 'restored' }];
  assert.equal(laneStatus(c({}), view(failed)), 'down', '戻しただけでは起き上がらない');
  assert.equal(laneStatus(c({ sortie: { pid: 1 } }), view(failed)), 'working', '出撃しなおすと起き上がる');
  assert.equal(laneStatus(c({}), view([...failed, { character: 'x', type: 'stepped' }])), 'ready');
  assert.equal(laneStatus(c({}), view([{ character: 'y', type: 'check_failed' }])), 'ready', 'ほかの人の失敗は関係ない');
});

test('§80.2 敵はまだ通っていないテスト。町・待機・あがりには出ない', () => {
  const nodes = { T: { id: 'T', title: 'た', state: 'current', cases: [{ name: 'a', ok: true }, { name: 'b', ok: false, strong: true }, { name: 'c', ok: null }] }, E: { id: 'E', title: 'から', state: 'current', cases: [] }, D: { id: 'D', title: 'ずみ', state: 'cleared', cases: [] } };
  const view = { nodes };
  assert.deepEqual(foesOf({ at: 'T' }, view, 'working').map((f) => [f.name, f.strong]), [['b', true], ['c', false]]);
  assert.deepEqual(foesOf({ at: 'E' }, view, 'ready').map((f) => f.name), ['から']);
  assert.deepEqual(foesOf({ at: 'D' }, view, 'ready'), []);
  for (const st of ['done', 'waiting', 'camp']) assert.deepEqual(foesOf({ at: 'T' }, view, st), []);
  assert.deepEqual(foesOf({ at: 'nope' }, view, 'ready'), []);
});

test('§80.8・§80.9 レーンの一手と、光らせる1つ', () => {
  const nodes = { T: { id: 'T', type: 'task', check: { kind: 'cmd' } }, S: { id: 'S', type: 'task', check: { kind: 'stamp', by: 'me' } }, G: { id: 'G', type: 'gate', state: 'ready', members: ['a', 'b'] }, W: { id: 'W', type: 'gate', state: 'waiting', members: ['a', 'b'] }, C: { id: 'C', type: 'camp' } };
  const view = { nodes };
  const c = (o) => ({ id: 'a', kind: 'agent', at: 'T', ...o });
  assert.equal(commandOf(c({}), view, 'ready').kind, 'sortie');
  assert.equal(commandOf(c({}), view, 'down').kind, 'resortie');
  assert.equal(commandOf(c({}), view, 'working').kind, 'watch');
  assert.deepEqual(commandOf(c({ id: 'me', kind: 'human', at: 'S' }), view, 'turn'), { kind: 'stamp', node: 'S', as: 'me' });
  assert.equal(commandOf(c({ kind: 'human' }), view, 'turn').kind, 'hand');
  assert.equal(commandOf(c({ kind: 'human' }), view, 'ready'), null, '人は出撃しない');
  assert.deepEqual(commandOf(c({ id: 'me', kind: 'human', at: 'S' }), view, 'down'), { kind: 'stamp', node: 'S', as: 'me' }, '人が失敗しても押せるものが残る');
  assert.equal(commandOf(c({ kind: 'human' }), view, 'down').kind, 'hand');
  assert.deepEqual(commandOf(c({ at: 'G' }), view, 'waiting'), { kind: 'battle', node: 'G' });
  assert.equal(commandOf(c({ id: 'b', at: 'G' }), view, 'waiting'), null, 'ボス戦のボタンは先頭のレーンに1つ');
  assert.equal(commandOf(c({ at: 'W' }), view, 'waiting'), null, 'そろうまでは押せない');
  assert.equal(commandOf(c({ status: 'done', at: null }), view, 'done'), null);
  const lane = (id, kind) => ({ id, cmd: kind ? { kind } : null });
  assert.equal(nextCommand([lane('a', 'sortie'), lane('b', 'resortie')]), 'b');
  assert.equal(nextCommand([lane('a', 'sortie'), lane('b', 'hand'), lane('c', 'stamp')]), 'c');
  assert.equal(nextCommand([lane('a', 'hand'), lane('b', 'battle')]), 'b');
  assert.equal(nextCommand([lane('a', 'watch'), lane('b', null)]), null, '見ているだけのときは光らせない');
});

test('§80.10 道のりと、門まであと何体か', () => {
  const nodes = { A: { type: 'task', cases: [{ ok: true }, { ok: null }] }, C: { type: 'camp' }, B: { type: 'task', cases: [{ ok: false }, { ok: false }] }, G: { id: 'G', type: 'gate' }, Z: { type: 'task', cases: [{ ok: null }] } };
  const c = { path: ['A', 'C', 'B', 'G', 'Z'], pos: 0, status: 'working' };
  assert.deepEqual(foesToGate(c, { nodes }), { gate: 'G', left: 3 });
  assert.deepEqual(foesToGate({ ...c, pos: 3 }, { nodes }), { gate: 'G', left: 0 });
  assert.equal(foesToGate({ ...c, pos: 4 }, { nodes }), null, 'もう門が無い');
  const route = routeOf({ ...c, pos: 2 }, { nodes });
  assert.deepEqual(route.map((p) => [p.done, p.here]), [[true, false], [true, false], [false, true], [false, false], [false, false]]);
  assert.equal(route[1].camp, true);
  assert.equal(route[3].gate, true);
  assert.ok(routeOf({ ...c, status: 'done', pos: 5 }, { nodes }).every((p) => p.done));
});

test('§80.11 2人以上そろった門は戦場になり、仲間は隣どうしに並ぶ', () => {
  const nodes = { G: { id: 'G', type: 'gate', state: 'waiting', members: ['a', 'c', 'd'] }, H: { id: 'H', type: 'gate', state: 'ready', members: ['b', 'e'] }, D: { id: 'D', type: 'gate', state: 'cleared', members: ['f', 'g'] }, T: { id: 'T', type: 'task' } };
  const c = (id, at, status = 'waiting') => ({ id, at, status });
  const view = { nodes, characters: [c('a', 'G'), c('b', 'H'), c('c', 'G'), c('d', 'T', 'working'), c('e', 'H'), c('f', 'D'), c('g', 'D')] };
  const a = arenasOf(view);
  assert.deepEqual(a.map((x) => [x.gate, x.members, x.ready]), [['G', ['a', 'c'], false], ['H', ['b', 'e'], true]]);
  assert.deepEqual(laneOrder(['a', 'b', 'c', 'd', 'e', 'f', 'g'], a), ['a', 'c', 'b', 'e', 'd', 'f', 'g']);
  assert.deepEqual(laneOrder(['a', 'b'], []), ['a', 'b'], '戦場が無ければ地図の順');
  assert.deepEqual(arenasOf({ nodes: { G: nodes.G }, characters: [c('a', 'G')] }), [], '1人では戦場にならない');
});

test('§80.12 町を通り過ぎたら休み、後ろへ戻されたら戻された先で休む', () => {
  const nodes = { A: { type: 'task' }, C: { id: 'C', type: 'camp' }, B: { type: 'task' } };
  const path = ['A', 'C', 'B'];
  const view = { nodes };
  assert.deepEqual(travelOf({ pos: 0 }, { pos: 2, path }, view), { kind: 'inn', node: 'C' });
  assert.deepEqual(travelOf({ pos: 1 }, { pos: 2, path }, view), { kind: 'inn', node: 'C' });
  assert.deepEqual(travelOf({ pos: 2 }, { pos: 0, path }, view), { kind: 'back', node: 'A' });
  assert.equal(travelOf({ pos: 0 }, { pos: 1, path: ['A', 'B', 'C'] }, view), null, '町を通っていない');
  assert.equal(travelOf({ pos: 2 }, { pos: 2, path }, view), null);
  assert.equal(travelOf(null, { pos: 2, path }, view), null, 'はじめて見たときは立ち寄らない');
});

test('§80.7 地図で選べる職業はすべて、どのポーズでも描ける', () => {
  const jobs = ['hero', 'sage', 'scribe', 'herald', 'cartographer', 'painter', 'mage', 'priest', 'warrior', 'merchant', 'villager'];
  for (const job of jobs) {
    assert.ok(CREW[job], job);
    for (const name of Object.keys(POSES)) {
      const painted = compose(job, POSES[name], 'mint').flat().filter(Boolean).length;
      assert.ok(painted > 150, `${job} ${name}: ${painted}`);
    }
    assert.ok(bust(job, 'happy').flat().some(Boolean), job);
  }
  assert.ok(compose('unknown-job', POSES.idle0).flat().some(Boolean), '知らない職業でも描く');
  for (const kind of ['slime', 'mushroom', 'bat', 'skeleton', 'ghost', 'imp']) assert.ok(mob(kind, 'green', 1).flat().some(Boolean), kind);
  assert.equal(flies('bat'), true);
  assert.equal(flies('slime'), false);
  assert.ok(boss('demon').length > boss('golem').length, '魔王は門番より大きい');
});

test('§80.8 レーンの小さな手: 判定のあるタスクではテスト実行と判定を押せる', () => {
  const view = { nodes: { T: { type: 'task', check: { kind: 'cmd' } }, S: { type: 'task', check: { kind: 'stamp', by: 'me' } }, C: { type: 'camp' } } };
  assert.deepEqual(toolsOf({ at: 'T' }, view, 'ready', { kind: 'sortie' }), ['hand', 'step', 'check']);
  assert.deepEqual(toolsOf({ at: 'T' }, view, 'down', { kind: 'resortie' }), ['hand', 'step', 'check']);
  assert.deepEqual(toolsOf({ at: 'C' }, view, 'camp', { kind: 'sortie' }), ['hand']);
  assert.deepEqual(toolsOf({ at: 'T' }, view, 'turn', { kind: 'hand' }), ['step', 'check']);
  assert.deepEqual(toolsOf({ at: 'S' }, view, 'turn', { kind: 'stamp' }), []);
  assert.deepEqual(toolsOf({ at: 'T' }, view, 'working', { kind: 'watch' }), [], '実行中は押さない');
});

test('§80.17 連続 PASS は記録から数える。歩いただけでは切れず、失敗で切れる', () => {
  const ev = (type) => ({ type });
  assert.equal(streakOf([]), 0);
  assert.equal(streakOf([ev('check_passed'), ev('stepped'), ev('gate_cleared')]), 2);
  assert.equal(streakOf([ev('check_passed'), ev('check_failed'), ev('check_passed')]), 1);
  assert.equal(streakOf([ev('check_passed'), ev('gate_failed')]), 0);
});

test('§80.16 PR の札: 変化を出来事にする。はじめて読んだときは何も出さない', async () => {
  const { prOf } = await import('../../src/server/index.js');
  const p = (o) => ({ number: 1, state: 'OPEN', draft: false, review: null, checks: null, note: null, ...o });
  assert.deepEqual(prEvents(null, [p({})]), []);
  const kinds = (a, b) => prEvents([a], [b]).map((e) => e.kind);
  assert.deepEqual(kinds(p({}), p({ state: 'MERGED' })), ['merged']);
  assert.deepEqual(kinds(p({ checks: 'running' }), p({ checks: 'fail' })), ['ci_failed']);
  assert.deepEqual(kinds(p({}), p({ review: 'APPROVED' })), ['approved']);
  assert.deepEqual(kinds(p({}), p({ note: { who: 'a', text: 'LGTM', at: 't1' } })), ['comment']);
  assert.deepEqual(kinds(p({ note: { who: 'a', text: 'x', at: 't1' } }), p({ note: { who: 'a', text: 'x', at: 't1' } })), [], '同じコメントは2度出さない');
  assert.equal(canMerge(p({ checks: 'fail' })), false);
  assert.equal(canMerge(p({ checks: 'pass' })), true);
  assert.equal(canMerge(p({ draft: true })), false);
  assert.deepEqual(prsToShow([p({ number: 2, state: 'MERGED' }), p({ number: 3 })]).map((x) => x.number), [3, 2], '開いているものが先');
  const pr = prOf({ number: 5, title: 't', state: 'OPEN', comments: [{ author: { login: 'old' }, body: '古い', createdAt: '2026-01-01' }], latestReviews: [{ author: { login: 'rev' }, body: '境界値を足して\n詳細', submittedAt: '2026-01-02' }], statusCheckRollup: [{ name: 'lint', conclusion: 'FAILURE' }] });
  assert.deepEqual(pr.note, { who: 'rev', text: '境界値を足して', at: '2026-01-02' });
  assert.equal(pr.job, 'lint');
  assert.equal(prOf({ number: 6, state: 'OPEN' }).note, null);
});

test('§80.9 下の帯の次の一手: レーンが先。push → PR → 承認済みのマージ', () => {
  const ok = { number: 3, state: 'OPEN', draft: false, review: 'APPROVED', checks: 'pass' };
  assert.equal(nextBarAction({ laneNext: 'a', ahead: 2, canOpen: true, prs: [ok] }), null);
  assert.equal(nextBarAction({ laneNext: null, ahead: 2, canOpen: true, prs: [ok] }), 'push');
  assert.equal(nextBarAction({ laneNext: null, ahead: null, canOpen: true, prs: [ok] }), 'open-pr');
  assert.equal(nextBarAction({ laneNext: null, ahead: 0, canOpen: false, prs: [ok] }), 'merge:3');
  assert.equal(nextBarAction({ laneNext: null, ahead: 0, canOpen: false, prs: [{ ...ok, review: null }] }), null, 'レビュー待ちは光らせない');
});

test('§80.11 連携の名前は、顔ぶれで決まる', () => {
  assert.match(chainNameOf(['hero', 'sage', 'scribe']), /剣星墨三連撃/);
  assert.match(chainNameOf(['constructor', 'hero']), /剣二連撃/);
});

test('§80.1 盤面を開くと進軍。レーンを押すと欄が開き、ノートに切り替えると覚える', async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/index.html?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval('window.__masume.mode'), 'march');
    assert.equal(await page.eval(`document.querySelector('#march').hidden`), false);
    assert.equal(await page.eval(`getComputedStyle(document.querySelector('.pager')).display`), 'none');
    const canvas = await page.eval(`(() => { const r = document.querySelector('#march-canvas').getBoundingClientRect(); return { w: r.width, h: r.height }; })()`);
    assert.ok(canvas.w > 800 && canvas.h > 500, JSON.stringify(canvas));
    const check = await page.eval(`(() => {
      const v = window.__masume.view;
      return window.__masume.march.lanes.map((l) => {
        const c = v.characters.find((x) => x.id === l.id);
        const n = c.at ? v.nodes[c.at] : null;
        const left = n && Array.isArray(n.cases) ? n.cases.filter((k) => k.ok !== true).map((k) => k.name) : [];
        return { id: l.id, status: l.status, foes: l.foes, left, type: n ? n.type : null };
      });
    })()`);
    assert.equal(check.length, 6);
    for (const l of check) {
      if (l.status === 'waiting' || l.status === 'done' || l.status === 'camp') assert.deepEqual(l.foes, [], l.id);
      else if (l.left.length) assert.deepEqual(l.foes, l.left, l.id);
    }
    assert.equal(check.find((l) => l.id === 'player').status, 'turn');
    assert.equal(check.find((l) => l.id === 'server').status, 'waiting');
    // レーンのボタンと、光る1つ
    const buttons = await page.eval(`[...document.querySelectorAll('.march-cmd:not(.sub)')].map((b) => [b.dataset.char, b.dataset.kind, b.dataset.next])`);
    assert.ok(buttons.length >= 4, JSON.stringify(buttons));
    assert.equal(buttons.filter((b) => b[2] === 'true').length, 1, '光るのは1つだけ');
    assert.ok(buttons.some((b) => b[0] === 'player' && b[1] === 'stamp'));
    assert.ok(await page.eval(`document.querySelectorAll('.march-cmd.sub').length > 0`), '手で戦うボタン');
    assert.match(await page.eval(`document.querySelector('#march-all').textContent`), /全員出撃/);
    assert.equal(await page.eval(`document.querySelector('#march-tactic [aria-pressed=true]').dataset.tactic`), 'balanced');
    // レーンを押すと、そのキャラクターの欄
    await page.eval(`(() => {
      const c = document.querySelector('#march-canvas');
      const r = c.getBoundingClientRect();
      const y = r.top + (24 + 0.5) * (r.height / c.height) + (c.height - 24) / 6 * 1.5 * (r.height / c.height);
      c.dispatchEvent(new MouseEvent('click', { clientX: r.left + 200, clientY: y, bubbles: true }));
    })()`);
    await page.waitFor(`document.querySelector('#drawer') && !document.querySelector('#drawer').hidden`, { timeout: 5000 });
    assert.match(await page.eval('location.search'), /char=engine/);
    // ノートへ
    await page.eval(`document.querySelector('#mode-switch [data-mode=note]').click()`);
    assert.equal(await page.eval('window.__masume.mode'), 'note');
    assert.equal(await page.eval(`document.querySelector('#march').hidden`), true);
    assert.notEqual(await page.eval(`getComputedStyle(document.querySelector('.pager')).display`), 'none');
    assert.ok(await page.eval(`document.querySelectorAll('#board #node-layer > *').length > 0`), 'ノートは描かれている');
    await page.goto(`${srv.url}/index.html?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval('window.__masume.mode'), 'note', '選んだ見方を覚える');
    await page.goto(`${srv.url}/index.html?fixture=demo&mode=march`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval('window.__masume.mode'), 'march', 'URL が優先');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close?.();
  }
});

test('§80.20 エンディングの次: アプリの中だけ、はじめの画面への導線が出る', async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/index.html?fixture=demo`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(`document.querySelector('#ending-next').hidden`), true, '外では出さない');
    const home = encodeURIComponent(`${srv.url}/start.html`);
    await page.goto(`${srv.url}/index.html?fixture=demo&home=${home}`);
    await page.waitFor(READY, { timeout: 20000 });
    assert.equal(await page.eval(`document.querySelector('#ending-next').hidden`), false, 'アプリの中では出す');
    assert.match(await page.eval(`document.querySelector('#ending-next').href`), /start\.html/);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§80.21 キー操作: Space で次の一手、欄を開いているあいだや入力中は何もしない', async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/index.html?fixture=demo&mode=march`);
    await page.waitFor(READY, { timeout: 20000 });
    // 押されたボタンを数える（見本の盤面でも click は届く）
    await page.eval(`window.__clicks = []; document.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) window.__clicks.push(b.id || b.dataset.kind); }, true);`);
    const key = (k) => page.eval(`document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
    await page.waitFor(`document.querySelector('.march-cmd[data-next="true"]')`, { timeout: 5000 });
    const next = await page.eval(`document.querySelector('.march-cmd[data-next="true"]').dataset.kind`);
    await key(' ');
    assert.deepEqual(await page.eval('window.__clicks'), [next], 'Space で光っているボタンを押す');
    // 光っているのが起動なら Space では押さない
    await page.eval(`window.__clicks = []; for (const b of document.querySelectorAll('.march-cmd[data-next="true"]')) { b.dataset.next = 'false'; } const s = document.querySelector('.march-cmd[data-kind=sortie]'); s.dataset.next = 'true';`);
    await key(' ');
    assert.deepEqual(await page.eval('window.__clicks'), [], '起動は Space で押さない');
    await page.eval(`document.querySelector('.march-cmd[data-kind=sortie]').dataset.next = 'false'`);
    // 詳細の欄を開いているあいだは反応しない
    await page.eval(`document.querySelector('.march-cmd[data-kind=stamp], .march-cmd[data-next]').dataset.next = 'true'; document.body.classList.add('drawer-open')`);
    await key(' ');
    assert.deepEqual(await page.eval('window.__clicks'), [], '欄を開いているあいだは押さない');
    await page.eval(`document.body.classList.remove('drawer-open')`);
    // 入力中は反応しない
    await page.eval(`window.__clicks = []; const i = document.createElement('input'); i.id = 'tmp-input'; document.body.append(i);`);
    await page.eval(`document.querySelector('#tmp-input').dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))`);
    assert.deepEqual(await page.eval('window.__clicks'), [], '入力中は押さない');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§80.18 敵をクリックすると殴れて、記録は変わらない。敵のいない所では欄が開く', async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/index.html?fixture=demo&mode=march`);
    await page.waitFor(READY, { timeout: 20000 });
    await page.waitFor('window.__masume.marchFoeAt()', { timeout: 5000 });
    const seq = await page.eval('window.__masume.view.head.seq');
    const click = `(() => { const p = window.__masume.marchFoeAt(); const c = document.querySelector('#march-canvas'); c.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: p.x, clientY: p.y })); })()`;
    for (let k = 0; k < 4; k++) await page.eval(click);
    assert.equal(await page.eval('window.__masume.marchCombo.combo'), 4, '続けて押すとコンボが伸びる');
    assert.equal(await page.eval('window.__masume.view.head.seq'), seq, '記録は変わらない');
    // 知らせは上の帯の上に見える（帯の下に隠れない）。帯の色でない字の点が、真ん中あたりにある
    await new Promise((r) => setTimeout(r, 150));
    const lit = await page.eval(`(() => { const c = document.querySelector('#march-canvas'); const d = c.getContext('2d').getImageData(Math.floor(c.width / 2) - 60, 2, 120, 18).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 220 && d[i + 1] > 180 && d[i + 2] < 120) n++; return n; })()`);
    assert.ok(lit > 20, `HIT の字が上の帯に見える（${lit}）`);
    assert.equal(await page.eval(`document.body.classList.contains('drawer-open')`), false, '敵を押しても欄は開かない');
    assert.ok(await page.eval(`Number(localStorage.getItem('gridhub.bestCombo')) >= 4`), '最高を覚える');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close();
  }
});

test('§80.4・§80.5 ビューが進むと敵が減り、失敗すると倒れる。ことばが切り替わる', async () => {
  const srv = await serveStatic(join(ROOT, 'web'));
  const page = await openBrowser({ width: 1200, height: 800 });
  try {
    await page.goto(`${srv.url}/index.html?fixture=demo&mode=march&words=dev`);
    await page.waitFor(READY, { timeout: 20000 });
    const label = (id) => `window.__masume.march.lanes.find((l) => l.id === '${id}').label`;
    assert.equal(await page.eval(label('board')), '未実行');
    assert.equal(await page.eval(label('server')), '結合待ち');
    const foes = (id) => page.eval(`window.__masume.march.lanes.find((l) => l.id === '${id}').foes.length`);
    const before = await foes('board');
    assert.ok(before > 1);
    // 同じ冒険で記録が進む: テストが1件通り、次の seq で判定に失敗する
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      const c = v.characters.find((x) => x.id === 'board');
      const n = v.nodes[c.at];
      n.cases.find((k) => k.ok !== true).ok = true;
      const seq = v.head.seq + 1;
      v.head = { ...v.head, seq };
      v.log.push({ seq, type: 'check_failed', character: 'board', node: c.at, ok: false, text: 'x' });
      window.__masume.render(v);
    })()`);
    assert.equal(await foes('board'), before - 1);
    assert.equal(await page.eval(label('board')), '失敗');
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      v.characters.find((x) => x.id === 'board').sortie = { pid: 1 };
      window.__masume.render(v);
    })()`);
    assert.equal(await page.eval(label('board')), '実行中');
    // 合流: 同じ門に2人そろうと並びが変わる。gate_cleared で戦場を再生しても落ちない
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      for (const id of ['board', 'engine']) {
        const c = v.characters.find((x) => x.id === id);
        c.pos = c.path.indexOf('G1');
        c.at = 'G1';
        c.status = 'waiting';
        c.sortie = null;
      }
      v.nodes.G1.state = 'ready';
      window.__masume.render(v);
    })()`);
    assert.equal(await page.eval(`document.querySelector('.march-cmd[data-kind=battle]').dataset.char`), 'board');
    await page.eval(`(() => {
      const v = structuredClone(window.__masume.view);
      const seq = v.head.seq + 1;
      v.head = { ...v.head, seq };
      v.log.push({ seq, type: 'gate_cleared', character: null, node: 'G1', ok: true, text: 'x' });
      v.nodes.G1.state = 'cleared';
      window.__masume.render(v);
    })()`);
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(await page.eval(`!!document.querySelector('#boss-cut:not([hidden])')`), false, '進軍では札を出さない');
    assert.deepEqual(exceptions(page), []);
  } finally {
    await page.close();
    await srv.close?.();
  }
});
