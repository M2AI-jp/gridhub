// D3「アイコン」— 大工（第16章）。CONTRACTS §72.4。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers.mjs';

test('§72.4 mac/AppIcon.png は 1024×1024 の透明つき PNG で、今の絵（web/assets の勇者と方眼の紙）から mac/icon.mjs で作る', () => {
  const png = readFileSync(join(ROOT, 'mac', 'AppIcon.png'));
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'PNG');
  assert.equal(png.toString('ascii', 12, 16), 'IHDR');
  assert.equal(png.readUInt32BE(16), 1024, '幅');
  assert.equal(png.readUInt32BE(20), 1024, '高さ');
  assert.equal(png[25], 6, '色の型は RGBA（角を透明にする）');
  const script = readFileSync(join(ROOT, 'mac', 'icon.mjs'), 'utf8');
  const assets = [...script.matchAll(/web\/assets\/[\w/.-]+\.svg/g)].map((m) => m[0]);
  assert.ok(assets.includes('web/assets/sprites/hero.svg'), `勇者の絵を使う（${assets.join(', ')}）`);
  for (const a of assets) assert.ok(existsSync(join(ROOT, a)), `${a} がある`);
  assert.match(script, /AppIcon\.png/);
});

test('§72.2・§72.4 アイコンの名前が Info.plist（CFBundleIconFile）と組み立て（AppIcon.icns）でそろう', () => {
  assert.match(readFileSync(join(ROOT, 'mac', 'Info.plist'), 'utf8'), /<key>CFBundleIconFile<\/key>\s*<string>AppIcon<\/string>/);
  const sh = readFileSync(join(ROOT, 'mac', 'build.sh'), 'utf8');
  assert.match(sh, /mac\/AppIcon\.png/);
  assert.match(sh, /Resources\/AppIcon\.icns/);
});
