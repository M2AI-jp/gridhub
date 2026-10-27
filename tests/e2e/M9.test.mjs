// M9「チュートリアルの前提を Node.js 22 以上に」— 地図職人（第14章）。CONTRACTS §62.3・§62.6。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers.mjs';

test('§62.6 チュートリアルの README の「Node.js <n> 以上」は 22 で、package.json の engines.node の下限と同じ', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const min = String(pkg.engines?.node ?? '').match(/^>=\s*(\d+)$/)?.[1];
  assert.equal(min, '22', `package.json の engines.node（§62.3）: ${pkg.engines?.node}`);
  const readme = readFileSync(join(ROOT, 'quests', 'tutorial', 'README.md'), 'utf8');
  const found = [...readme.matchAll(/Node\.js\s*(\d+)\s*以上/g)].map((m) => m[1]);
  assert.ok(found.length >= 1, 'チュートリアルの README に「Node.js <n> 以上」の行');
  assert.deepEqual([...new Set(found)], [min], `チュートリアルの README: ${found.join(', ')}`);
});
