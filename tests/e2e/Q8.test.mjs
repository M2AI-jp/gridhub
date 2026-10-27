// Q8「支度と願いの説明を GridHub の名前に」— 語り部（第15章）。CONTRACTS §64.1・§64.4。
import test from 'node:test';
import assert from 'node:assert/strict';
import { gridhub, oldNameHits, showHits } from '../helpers7.mjs';

test('§64.4 gridhub init --help と gridhub quest --help の説明に旧名が無い（GridHub の支度）', () => {
  for (const cmd of ['init', 'quest']) {
    const r = gridhub([cmd, '--help']);
    assert.equal(r.code, 0, r.all);
    const hits = oldNameHits(r.out);
    assert.deepEqual(hits, [], `${cmd} --help に旧名:\n${showHits(`${cmd} --help`, hits)}`);
  }
  assert.match(gridhub(['init', '--help']).out, /GridHub の支度/);
});
