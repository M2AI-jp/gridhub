// 第2章の見本（fixtures/demo2-state.json）: demo-state に出撃の記録を足したもの。
// 使い方: node web/fixtures/make-demo2.mjs（先に make-demo.mjs）
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const v = JSON.parse(readFileSync(join(here, 'demo-state.json'), 'utf8'));
let seq = v.head.seq;
const ts = (i) => new Date(Date.UTC(2026, 9, 16, 2, 0) + i * 60000).toISOString();
const add = (e) => {
  seq++;
  const entry = { seq, ts: ts(seq), actor: 'party', character: null, node: null, ok: null, ...e };
  v.log.push(entry);
  return entry;
};
add({ type: 'wish', actor: 'gm', text: '願い: Linear のようなタスク管理を、方眼ノートのすごろくで遊びたい' });
const s1 = add({ type: 'sortie', character: 'engine', node: 'E2', text: '書記 が出撃した（codex gpt-5）' });
add({ type: 'returned', character: 'engine', node: 'E2', ok: true, text: '書記 が帰還した（E2 → E3、進んだ）' });
const s2 = add({ type: 'sortie', character: 'engine', node: 'E3', text: '書記 が出撃した（codex gpt-5）' });
const s3 = add({ type: 'sortie', character: 'gmkit', node: 'M1', text: '地図職人 が出撃した（claude sonnet）' });
add({ type: 'returned', character: 'gmkit', node: 'M1', ok: false, text: '地図職人 が帰還した（M1 → M1、進めなかった）' });
for (const c of v.characters) {
  c.sortie = null;
  c.sorties = v.log.filter((e) => e.type === 'sortie' && e.character === c.id).length;
  c.generation = Math.max(1, c.sorties); // §42: 代 = sortie の数（0なら1）
}
const engine = v.characters.find((c) => c.id === 'engine');
engine.sortie = { seq: s2.seq, agent: 'codex', model: 'gpt-5', node: 'E3', since: s2.ts };

v.head = { ...v.head, seq };
void s1, s3;
writeFileSync(join(here, 'demo2-state.json'), JSON.stringify(v, null, 2) + '\n');
console.log('demo2-state.json を書いた');
