// 試作3の下ごしらえ: ビューに「戦い（テスト＝モンスター）」と「クラス」を足す（本番では書記がビューに入れる）
// node prep.mjs <view.json> <gameRoot> <out.json>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const [viewFile, root, out] = process.argv.slice(2);
const view = JSON.parse(readFileSync(viewFile, 'utf8'));
const log = readFileSync(join(root, '.masume', 'log.jsonl'), 'utf8').trim().split('\n').map(JSON.parse).filter((e) => e.seq <= view.head.seq);

/** 判定の出力から、マスごとのテスト（モンスター）を数える */
export function parseBattles(text) {
  const out = {};
  let cur = null;
  let failingSummary = false;
  for (const line of text.split('\n')) {
    const h = line.match(/^=== ([A-Za-z][A-Za-z0-9_-]*): /);
    if (h) {
      cur = out[h[1]] = { tests: [] };
      failingSummary = false;
      continue;
    }
    if (!cur) continue;
    if (/^✖ failing tests:/.test(line)) failingSummary = true;
    if (failingSummary) continue;
    let m;
    if ((m = line.match(/^\s*✔ (.+?)(?: \([\d.]+m?s\))?$/))) cur.tests.push({ name: m[1], ok: true });
    else if ((m = line.match(/^\s*✖ (.+?)(?: \([\d.]+m?s\))?$/))) cur.tests.push({ name: m[1], ok: false });
    else if ((m = line.match(/^(not )?ok \d+ - (.+)$/))) cur.tests.push({ name: m[2], ok: !m[1] });
    else if ((m = line.match(/^(ok|PASS|✓)\s+(.+)$/))) cur.tests.push({ name: m[2], ok: true });
    else if ((m = line.match(/^(ng|NG|FAIL|✗|not ok)\s+(.+)$/))) cur.tests.push({ name: m[2], ok: false });
    else if ((m = line.match(/^\(exit (\d+)/))) cur.exit = +m[1];
  }
  for (const b of Object.values(out)) if (!b.tests.length) b.tests.push({ name: '判定', ok: b.exit === 0 });
  return out;
}

const battles = {};
for (const e of log) {
  if (!['check_passed', 'check_failed', 'gate_cleared', 'gate_failed'].includes(e.type) || !e.data.output) continue;
  const f = join(root, '.masume', e.data.output);
  if (!existsSync(f)) continue;
  for (const [node, b] of Object.entries(parseBattles(readFileSync(f, 'utf8')))) battles[node] = { seq: e.seq, ...b };
}
const bestiary = new Set();
for (const [id, n] of Object.entries(view.nodes)) {
  const b = battles[id];
  n.battle = b ? { seq: b.seq, pass: b.tests.filter((t) => t.ok).length, fail: b.tests.filter((t) => !t.ok).length, tests: b.tests.slice(0, 40) } : null;
  if (b) for (const t of b.tests) if (t.ok) bestiary.add(t.name);
}
view.bestiary = { defeated: bestiary.size };
writeFileSync(out, JSON.stringify(view));
console.log('battles', Object.keys(battles).length, 'bestiary', bestiary.size);
