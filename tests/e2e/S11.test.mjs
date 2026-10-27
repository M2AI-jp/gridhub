// S11「MCP の資料を GridHub の名前に」— 伝令（第15章）。CONTRACTS §64.1・§64.3。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mcpClient, oldNameHits, showHits } from '../helpers7.mjs';

test('§64.3 MCP の資料の名前と説明・initialize の案内に旧名が無い（GridHub ルールブック・GridHub GM ガイド・GridHub 契約書）', { timeout: 60000 }, async () => {
  const mcp = mcpClient([]);
  try {
    const init = await mcp.start();
    const instructions = init.result?.instructions ?? '';
    assert.ok(instructions.includes('GridHub'), `案内に GridHub\n${instructions}`);
    assert.deepEqual(oldNameHits(instructions), [], `案内に旧名:\n${showHits('instructions', oldNameHits(instructions))}`);
    const list = await mcp.request('resources/list');
    const resources = list.result?.resources ?? [];
    const names = resources.map((r) => r.name);
    for (const n of ['GridHub ルールブック', 'GridHub GM ガイド', 'GridHub 契約書']) assert.ok(names.includes(n), `資料の名前 ${n}（いま: ${names.join(' / ')}）`);
    for (const r of resources) {
      const hits = oldNameHits(`${r.name}\n${r.description ?? ''}`);
      assert.deepEqual(hits, [], `${r.uri} に旧名:\n${showHits(r.uri, hits)}`);
    }
  } finally {
    await mcp.close();
  }
});
