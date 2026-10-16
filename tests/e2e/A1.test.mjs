// A1「仲間の似顔絵を描く」— 絵師の最初のマス。CONTRACTS §10 の駒の絵。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, inspectSvg } from '../helpers.mjs';

const JOBS = [
  ['hero', '勇者'], ['warrior', '戦士'], ['mage', '魔法使い'], ['priest', '僧侶'], ['thief', '盗賊'], ['merchant', '商人'],
  ['sage', '賢者'], ['scribe', '書記'], ['herald', '伝令'], ['cartographer', '地図職人'], ['painter', '絵師'], ['villager', '村人'],
];
const DIR = join(ROOT, 'web', 'assets', 'sprites');
test('12職業の駒の絵がそろっている', () => {
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  assert.deepEqual(index.jobs.map((j) => [j.id, j.name]), JOBS, 'index.json の並びと名前');
  const bodies = new Set();
  for (const [id, name] of JOBS) {
    const file = join(DIR, `${id}.svg`);
    assert.ok(existsSync(file), `${id}.svg がある`);
    const svg = inspectSvg(file, { name });
    bodies.add(svg.replace(/<title>[^<]*<\/title>/, ''));
  }
  assert.equal(bodies.size, JOBS.length, '12枚はすべて違う絵');
});
