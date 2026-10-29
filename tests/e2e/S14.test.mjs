// S14「承認のマスの、読むだけのファイル」— 伝令（第16章）。CONTRACTS §74.2。
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tmp, masume, getJson, startGridhub, postJson, pathWith } from '../helpers8.mjs';

test('§74.2 GET /api/hand の review（人間が承認のマスにいるとき、指令書と判定に書かれたファイル）と、GET /api/file の readonly。読むだけのファイルには書けない', { timeout: 60000 }, async () => {
  const dir = tmp('gridhub-s14-');
  cpSync(join(ROOT, 'quests', 'tutorial'), dir, { recursive: true });
  assert.equal(masume(['new', 'tutorial.map.json'], { cwd: dir }).code, 0);
  const srv = await startGridhub(['serve', '--port', '0', '--dir', dir], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH }, cwd: dir });
  try {
    const url = srv.url;
    assert.equal((await postJson(`${url}/api/file`, { character: 'apprentice', path: 'ai/hello.txt', content: 'こんにちは、GridHub！\n' })).status, 200);
    const player = await getJson(`${url}/api/hand?character=player`);
    assert.deepEqual(player.body.review, [{ path: 'ai/hello.txt', size: Buffer.byteLength('こんにちは、GridHub！\n'), owner: 'apprentice' }]);
    const read = await getJson(`${url}/api/file?character=player&path=ai/hello.txt`);
    assert.deepEqual(read.body, { ok: true, path: 'ai/hello.txt', exists: true, content: 'こんにちは、GridHub！\n', readonly: true });
    const write = await postJson(`${url}/api/file`, { character: 'player', path: 'ai/hello.txt', content: 'x' });
    assert.equal(write.status, 403);
    assert.equal(write.body.code, 'E_TERRITORY');
    const apprentice = await getJson(`${url}/api/hand?character=apprentice`);
    assert.deepEqual(apprentice.body.review, []);
  } finally {
    await srv.stop();
  }
});
