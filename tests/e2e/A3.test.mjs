// A3「第2章のしるしを描く」— CONTRACTS §17。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, inspectSvg, SPRITE_COLORS } from '../helpers2.mjs';

const MARKS = [['crystal', '水晶玉'], ['hourglass', '砂時計'], ['bubble', 'ふきだし'], ['horn', '角笛']];
const DIR = join(ROOT, 'web', 'assets', 'marks');

test('4枚のしるしがそろっている', () => {
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  assert.deepEqual(index.marks.map((m) => [m.id, m.name]), MARKS);
  const bodies = new Set();
  for (const [id, name] of MARKS) {
    const file = join(DIR, `${id}.svg`);
    assert.ok(existsSync(file), `${id}.svg`);
    bodies.add(inspectSvg(file, { colors: new Set([...SPRITE_COLORS, '#ffe45c']), requirePawn: false, name }).replace(/<title>[^<]*<\/title>/, ''));
  }
  assert.equal(bodies.size, MARKS.length);
});
