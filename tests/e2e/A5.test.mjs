// A5「絵帳を GridHub の名前に」— 絵師（第15章）。CONTRACTS §64.1・§64.5。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, oldNameHits, showHits } from '../helpers7.mjs';

test('§64.5 絵帳（web/assets/sheet.html）の題・見出し・結びは GridHub で、旧名が無い', () => {
  const file = join('web', 'assets', 'sheet.html');
  const html = readFileSync(join(ROOT, file), 'utf8');
  const hits = oldNameHits(html);
  assert.deepEqual(hits, [], `旧名が残っている:\n${showHits(file, hits)}`);
  assert.match(html, /<title>GridHub の絵帳/);
  assert.ok(html.includes('GridHub / 絵師のノート'), '見出し');
  assert.match(html, /<footer>GridHub の絵帳/);
});
