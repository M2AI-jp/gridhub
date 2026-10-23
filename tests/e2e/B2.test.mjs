// B2「駒が動き冒険の書が流れる」— 状態の変化の演出、マスの詳細、キャラクターシート、呪いの表示。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser } from '../helpers.mjs';

const script = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-script.json'), 'utf8'));
const last = script.frames[script.frames.length - 1];

async function withPage(path, fn, size = { width: 1440, height: 900 }) {
  const srv = await serveStatic();
  const page = await openBrowser(size);
  try {
    await page.goto(`${srv.url}${path}`);
    await page.waitFor('window.__masume && window.__masume.ready', { timeout: 15000 });
    await fn(page);
    const exceptions = page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));
    assert.deepEqual(exceptions, [], 'コンソールにエラーがない');
  } finally {
    await page.close();
    await srv.close();
  }
}

test('状態の列を再生すると、駒・マス・冒険の書が最後の場面に追いつく', async () => {
  assert.ok(script.frames.length >= 4, '見本の場面が4つ以上');
  await withPage('/?fixture=demo&script=demo&interval=300', async (page) => {
    await page.waitFor('window.__masume.done === true', { timeout: 20000 });
    await new Promise((r) => setTimeout(r, 2500)); // 駒が歩き終わるまで
    const r = await page.eval(`(() => ({
      pawns: Object.fromEntries([...document.querySelectorAll('.pawn[data-char]')].map((g) => [g.dataset.char, g.dataset.at])),
      levels: Object.fromEntries([...document.querySelectorAll('.pawn[data-char]')].map((g) => [g.dataset.char, g.dataset.level])),
      nodes: Object.fromEntries([...document.querySelectorAll('#node-layer [data-node]')].map((g) => [g.dataset.node, g.dataset.state])),
      log: document.querySelectorAll('#log .log-entry').length,
      toasts: document.querySelectorAll('#toast .toast').length,
      freshClear: [...document.querySelectorAll('#node-layer .fresh-clear')].map((g) => g.dataset.node),
      gateDone: document.querySelector('#node-layer [data-node="G1"]').textContent,
      recordSeq: document.querySelector('#record')?.dataset.seq ?? null,
    }))()`);
    assert.deepEqual(r.pawns, Object.fromEntries(last.characters.map((c) => [c.id, c.at ?? ''])));
    assert.deepEqual(r.levels, Object.fromEntries(last.characters.map((c) => [c.id, String(c.level)])));
    assert.deepEqual(r.nodes, Object.fromEntries(Object.entries(last.nodes).map(([id, n]) => [id, n.state])));
    assert.equal(r.log, Math.min(80, last.log.length));
    assert.ok(r.toasts >= 1, '新しい出来事がトーストで知らされる');
    assert.ok(r.freshClear.includes('A2'), '最後の場面で突破した A2 にはなまるの演出');
    assert.match(r.gateDone, /撃破/);
    assert.equal(r.recordSeq, String(last.head.seq), '§52: 記録の番号も最後の場面に追いつく');
  });
});

test('マスの詳細（issue）とキャラクターシート', async () => {
  await withPage('/?fixture=demo&select=E2', async (page) => {
    const d = await page.eval(`(() => { const d = document.querySelector('#drawer'); return { hidden: d.hidden, kind: d.dataset.kind, id: d.dataset.id, text: d.innerText }; })()`);
    assert.equal(d.hidden, false);
    assert.equal(d.kind, 'node');
    assert.equal(d.id, 'E2');
    for (const w of ['判定をくだす', 'node --test tests/e2e/E2.test.mjs', '封印済み', '書記', 'Done']) assert.match(d.text, new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `詳細に「${w}」`);

    // 盤面のマスをクリックすると、そのマスが開く
    await page.eval(`document.querySelector('#node-layer [data-node="S3"] .cell-hit').dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
    await page.waitFor(`document.querySelector('#drawer').dataset.id === 'S3'`);
    // Esc で閉じる
    await page.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await page.waitFor(`document.querySelector('#drawer').hidden === true`);
  });
  await withPage('/?fixture=demo&char=engine', async (page) => {
    const d = await page.eval(`(() => { const d = document.querySelector('#drawer'); return { kind: d.dataset.kind, id: d.dataset.id, text: d.innerText, steps: d.querySelectorAll('.step').length }; })()`);
    assert.equal(d.kind, 'char');
    assert.equal(d.id, 'engine');
    // 第11章（§38）で直した: CLI の名前は gridhub（masume は別名）。キャラクターシートの案内はどちらでもよい
    for (const w of ['書記', '(gridhub|masume) brief engine', 'ふたつ星亭', '縄張り']) assert.match(d.text, new RegExp(w), `キャラクターシートに「${w}」`);
    const engine = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8')).characters.find((c) => c.id === 'engine');
    assert.equal(d.steps, engine.path.length, '道のりが全部並ぶ');
  });
});

test('セーブデータが呪われたら、すぐ分かる', async () => {
  await withPage('/?fixture=demo', async (page) => {
    await page.eval(`window.__masume.render({ ...window.__masume.view, integrity: { ok: false, errors: [{ seq: 3, code: 'E_HASH', message: 'x' }] } })`);
    const r = await page.eval(`({ ok: document.querySelector('#integrity').dataset.ok, text: document.querySelector('#integrity').textContent })`);
    assert.equal(r.ok, 'false');
    assert.match(r.text, /呪/);
  });
});
