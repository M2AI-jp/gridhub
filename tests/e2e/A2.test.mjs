// A2「道具と標識を描く」— CONTRACTS §10 の道具の絵と一覧ページ。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, inspectSvg, SPRITE_COLORS, serveStatic, openBrowser } from '../helpers.mjs';

const ICONS = [
  ['sword', '剣'], ['shield', '盾'], ['key', '鍵'], ['scroll', '巻物'], ['chest', '宝箱'], ['flag', '旗'],
  ['inn', '宿屋'], ['crown', '王冠'], ['potion', '薬'], ['map', '地図'], ['bell', '鐘'], ['lantern', 'ランタン'],
];
const DIR = join(ROOT, 'web', 'assets', 'icons');
const ICON_COLORS = new Set([...SPRITE_COLORS, '#ffe45c']);

test('12個の道具の絵がそろっている', () => {
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  assert.deepEqual(index.icons.map((i) => [i.id, i.name]), ICONS, 'index.json の並びと名前');
  const bodies = new Set();
  for (const [id, name] of ICONS) {
    const file = join(DIR, `${id}.svg`);
    assert.ok(existsSync(file), `${id}.svg がある`);
    bodies.add(inspectSvg(file, { colors: ICON_COLORS, requirePawn: false, name }).replace(/<title>[^<]*<\/title>/, ''));
  }
  assert.equal(bodies.size, ICONS.length, '12個はすべて違う絵');
});

test('一覧ページで24枚が見られる', async () => {
  const sheet = join(ROOT, 'web', 'assets', 'sheet.html');
  assert.ok(existsSync(sheet), 'web/assets/sheet.html');
  const html = readFileSync(sheet, 'utf8');
  assert.doesNotMatch(html, /https?:\/\/(?!www\.w3\.org)/, '外部のものを読み込まない');
  const srv = await serveStatic();
  const page = await openBrowser({ width: 1200, height: 900 });
  try {
    await page.goto(`${srv.url}/assets/sheet.html`);
    await page.waitFor(`(() => { const imgs = [...document.querySelectorAll('img')]; const svgs = document.querySelectorAll('svg'); return (imgs.length >= 24 && imgs.every((i) => i.complete && i.naturalWidth > 0)) || svgs.length >= 24; })()`, { timeout: 10000, message: '24枚が表示される' });
    const names = await page.eval(`document.body.innerText`);
    for (const [, name] of ICONS) assert.match(names, new RegExp(name), `一覧に「${name}」`);
    for (const n of ['勇者', '戦士', '村人']) assert.match(names, new RegExp(n), `一覧に「${n}」`);
  } finally {
    await page.close();
    await srv.close();
  }
});
