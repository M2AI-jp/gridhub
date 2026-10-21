// A4「モンスターを描く」— CONTRACTS §49（第11章の絵師）。テスト1件 = 1体のモンスターと、中ボス・魔王の絵。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, inspectSvg } from '../helpers.mjs';

const MONSTERS = [
  ['slime', 'スライム'], ['bat', 'こうもり'], ['mushroom', 'おばけきのこ'], ['ghost', 'ゴースト'],
  ['snake', 'へび'], ['golem', 'ゴーレム'], ['dragon', 'ドラゴン'], ['maou', '魔王'],
];
// §49: 色は §10 の駒と違い、この6つだけ（盤面が var(--monster) を生きている・倒した・復活したで塗り替える）
const COLORS = new Set(['none', '#1d2b5c', '#ffffff', '#d94a3a', '#ffe45c', 'var(--monster, #ffffff)']);
const DIR = join(ROOT, 'web', 'assets', 'monsters');

test('§49 モンスター8枚がそろい、駒と同じ制約で描かれ、体を var(--monster) で塗れる', () => {
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  assert.deepEqual(index.monsters.map((m) => [m.id, m.name]), MONSTERS, 'index.json の並びと名前');
  const bodies = new Set();
  for (const [id, name] of MONSTERS) {
    const file = join(DIR, `${id}.svg`);
    assert.ok(existsSync(file), `${id}.svg がある`);
    const svg = inspectSvg(file, { colors: COLORS, requirePawn: false, name });
    assert.match(svg, /fill="var\(--monster, #ffffff\)"/, `${id}.svg の体は var(--monster, #ffffff) で塗る`);
    bodies.add(svg.replace(/<title>[^<]*<\/title>/, '').replace(/<desc>[^<]*<\/desc>/, ''));
  }
  assert.equal(bodies.size, MONSTERS.length, '8枚はすべて違う絵');
});
