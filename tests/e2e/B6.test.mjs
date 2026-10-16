// B6「ノートに書き出す」— CONTRACTS §22（盤面を1枚の SVG のノートにして保存する）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, serveStatic, openBrowser } from '../helpers3.mjs';

const fixture = JSON.parse(readFileSync(join(ROOT, 'web', 'fixtures', 'demo-state.json'), 'utf8'));

test('盤面全体が1枚の方眼ノートの SVG になり、保存できる', async () => {
  const srv = await serveStatic();
  const page = await openBrowser({ width: 1280, height: 800 });
  try {
    await page.goto(`${srv.url}/?fixture=demo`);
    await page.waitFor('window.__masume && window.__masume.ready');
    const svg = await page.eval(`window.__masume.exportSvg()`);
    assert.match(svg.trim(), /^(<\?xml[^>]*\?>\s*)?<svg\b/);
    assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /id="grid-5mm"/, '5mm方眼');
    assert.match(svg, /viewBox="[-\d.]+ [-\d.]+ [\d.]+ [\d.]+"/);
    for (const id of Object.keys(fixture.nodes)) assert.ok(svg.includes(`data-node="${id}"`), `マス ${id}`);
    for (const c of fixture.characters) assert.ok(svg.includes(`data-char="${c.id}"`), `駒 ${c.id}`);
    assert.ok(svg.includes(fixture.quest.title), '題名');
    assert.doesNotMatch(svg, /<script/i);
    // 書き出した SVG は単独で開ける（読み込みに失敗しない）
    const ok = await page.eval(`(() => { const doc = new DOMParser().parseFromString(window.__masume.exportSvg(), 'image/svg+xml'); return !doc.querySelector('parsererror') && doc.documentElement.nodeName === 'svg'; })()`);
    assert.equal(ok, true, 'SVG として正しい');

    assert.equal(await page.eval(`!!document.querySelector('#export-notebook')`), true, '書き出しのボタン');
    await page.eval(`document.querySelector('#export-notebook').click()`);
    await page.waitFor(`!!window.__masume.lastExport`, { message: '保存した' });
    const last = await page.eval(`window.__masume.lastExport`);
    assert.match(last.filename, new RegExp(`^${fixture.quest.id}-\\d{8}\\.svg$`));
    assert.ok(last.size > 2000);
    const exceptions = page.console.filter((l) => l.startsWith('[exception]'));
    assert.deepEqual(exceptions, []);
  } finally {
    await page.close();
    await srv.close();
  }
});
