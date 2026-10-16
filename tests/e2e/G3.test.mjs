// G3「結合: 願いから冒険が生まれる」— 盤面（入口）＋伝令（窓口）＋語り部（quest）＋書記（冒険の書）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tmp, masume, readLog, view, openBrowser, startServeEnv, fakeGm } from '../helpers2.mjs';

test('盤面の入口に願いを書くと、冒険の書が生まれて盤面に映る', async () => {
  const root = tmp('masume-g3-');
  const srv = await startServeEnv(root, { MASUME_GM_OVERRIDE: fakeGm('bad-then-good') });
  const page = await openBrowser({ width: 1440, height: 900 });
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor(`(() => { const l = document.querySelector('#lobby'); return l && !l.hidden; })()`, { timeout: 15000, message: 'ロビー' });
    await page.eval(`(() => {
      const t = document.querySelector('#wish'); t.value = 'メモアプリのようなアプリを作りたい'; t.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#start-quest').click();
    })()`);
    await page.waitFor(`document.querySelectorAll('.pawn[data-char]').length === 3`, { timeout: 30000, message: '冒険の駒が映る' });
    const r = await page.eval(`(() => ({
      title: document.querySelector('.quest-title')?.textContent,
      nodes: [...document.querySelectorAll('#node-layer [data-node]')].map((g) => g.dataset.node).sort(),
      log: [...document.querySelectorAll('#log .log-entry')].map((li) => li.dataset.type),
      wishText: document.querySelector('#log .log-entry[data-type="wish"]')?.innerText || '',
    }))()`);
    assert.equal(r.title, 'メモアプリ');
    assert.deepEqual(r.nodes, ['FIN', 'G1', 'H1', 'T1', 'T2', 'U1']);
    assert.ok(r.log.includes('wish'), '冒険の書に願いが流れる');
    assert.match(r.wishText, /願い: メモアプリのようなアプリを作りたい/);
    const v = view(root);
    assert.equal(v.quest.id, 'MEMO');
    assert.ok(readLog(root).some((e) => e.type === 'wish'));
    assert.equal(masume(['verify', '--dir', root]).code, 0);
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    if (exceptions.length) console.log('MASUME_BLAME: board');
    assert.deepEqual(exceptions, []);
  } finally {
    await page.close();
    await srv.stop();
  }
});
