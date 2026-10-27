// M10「チュートリアルを GridHub の名前に」— 地図職人（第15章）。CONTRACTS §64.1・§64.2。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT, oldNameHits, showHits } from '../helpers7.mjs';

const DIR = join(ROOT, 'quests', 'tutorial');
const files = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const TEXTS = files(DIR).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));

test('§64.2 チュートリアルの題・例の名前・判定の文に旧名が無く、題は「はじめての GridHub」', () => {
  for (const { file, text } of TEXTS) {
    const hits = oldNameHits(text);
    assert.deepEqual(hits, [], `旧名が残っている:\n${showHits(file, hits)}`);
  }
  const map = JSON.parse(readFileSync(join(DIR, 'tutorial.map.json'), 'utf8'));
  assert.equal(map.quest.title, 'はじめての GridHub');
  assert.equal(readFileSync(join(DIR, 'README.md'), 'utf8').split('\n')[0], '# はじめての GridHub');
  const sol = JSON.parse(readFileSync(join(DIR, 'SOLUTIONS.json'), 'utf8'));
  const request = sol.H1.find((f) => f.path === 'human/request.json');
  assert.equal(JSON.parse(request.content).name, 'GridHub', '例の名前は GridHub');
  assert.ok(sol.A1.some((f) => f.content.trim() === 'こんにちは、GridHub！'), 'あいさつは「こんにちは、GridHub！」');
});

test('§64.2 チュートリアルの手順のコマンドは gridhub（bin/gridhub.js）。masume は "masume": 1・.masume/・MASUME_* のほかに使わない', () => {
  for (const { file, text } of TEXTS) {
    const rest = text.replace(/"masume":\s*1/g, '').replace(/\.masume\b/g, '').replace(/MASUME_[A-Z_]+/g, '');
    const lines = rest.split('\n').map((t, i) => [i + 1, t]).filter(([, t]) => /masume/i.test(t));
    assert.deepEqual(lines.map(([n, t]) => `${file}:${n} ${t.trim()}`), [], `${file} に masume が残っている`);
  }
  const readme = readFileSync(join(DIR, 'README.md'), 'utf8');
  for (const w of ['bin/gridhub.js', 'gridhub new', 'gridhub serve', 'gridhub brief', 'gridhub stamp', 'gridhub check', 'gridhub status']) {
    assert.ok(readme.includes(w), `README に ${w}`);
  }
  assert.match(readme, /^gridhub\(\) \(exec node "\$TUTORIAL_REPO\/bin\/gridhub\.js"/m, 'シェルの関数も gridhub');
});
