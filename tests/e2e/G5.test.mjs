// G5「結合: どの LLM からでも遊べる」— 伝令（MCP）＋語り部（quest・init）＋書記（冒険の書）。
// LLM のクライアントになったつもりで、MCP の道具だけで願いから冒険を始め、1マス進める。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, view, char, readLog, mcpClient, fakeGm } from '../helpers3.mjs';

test('MCP の道具だけで、願い → 支度 → 指令書 → 実装 → 宣言判定 → 日誌', async () => {
  const root = tmp('masume-g5-');
  const c = mcpClient(['--dir', root], { cwd: root, env: { MASUME_GM_OVERRIDE: fakeGm('good') } });
  try {
    const init = await c.start();
    assert.equal(init.result.serverInfo.name, 'masume');
    const rules = await c.request('resources/read', { uri: 'masume://docs/GM_GUIDE.md' });
    assert.match(rules.result.contents[0].text, /GM ガイド/);

    const q = await c.call('masume_quest', { wish: 'メモアプリのようなアプリを作りたい', gm: 'codex' }, { timeout: 60000 });
    if (q.isError) console.log('MASUME_BLAME: teller');
    assert.equal(q.isError, false, q.text);
    assert.ok(existsSync(join(root, 'AGENTS.md')), '語り部の支度: AGENTS.md');
    assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /brief/);

    const b = await c.call('masume_brief', { character: 'store' });
    assert.equal(b.isError, false, b.text);
    assert.match(b.text, /メモを保存する/);
    // エージェントとして、現在のマス T1 を実装する（偽の GM の判定は work/T1.txt を見る）
    mkdirSync(join(root, 'work'), { recursive: true });
    writeFileSync(join(root, 'work', 'T1.txt'), 'done');
    const ck = await c.call('masume_check', { target: 'store' });
    if (ck.isError) console.log('MASUME_BLAME: server');
    assert.equal(ck.isError, false, ck.text);
    assert.equal(char(view(root), 'store').at, 'T2');
    const nt = await c.call('masume_note', { character: 'store', text: 'MCP だけで1マス進めた' });
    assert.equal(nt.isError, false);
    const log = readLog(root);
    assert.ok(log.some((e) => e.type === 'wish'));
    assert.ok(log.some((e) => e.type === 'check_passed' && e.actor === 'store'));
    assert.equal(masume(['verify', '--dir', root]).code, 0);
  } finally {
    await c.close();
  }
});
