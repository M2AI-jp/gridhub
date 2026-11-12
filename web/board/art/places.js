// 進軍のレーンの舞台（CONTRACTS §80.13）。ドカポン4の戦闘画面の物の大きさで、手で描いた部品（env/）を置く。
// 場所は 4 種（村・森の入口・畑・野原）。レーンの高さ h に合わせて下にそろえ、上は切れる。横 1024 で周回する。
import { Surface, rng, LW } from './sprite.js';
import * as A from './env/art2.js';
import cottage from './env/cottage.js';
import barn from './env/cottage2.js';
import oak from './env/oak.js';
import elm from './env/tree2.js';
import birch from './env/birch.js';
import chestnut from './env/chestnut.js';
import youngoak from './env/youngoak.js';
import pine from './env/pine.js';
import bush from './env/bush.js';
import groundA from './env/groundA.js';
import groundB from './env/groundB.js';
import fence from './env/fence.js';
import well from './env/well.js';
import manor from './env/manor.js';

const P = A.PAL;
const SKY = ['a', 'b', 'c', 'd', 'e'];
const TREES = [oak, elm, birch, chestnut, youngoak];
const NEAR = { cottage, barn, pine, bush, well };

// 64 ドットのレーンで描いた配置。x は 0〜1023（周回）。dy は足もとの線 44 からのずれ
const PLACES = {
  village1: { hz: 40, mountains: [[80, 0], [300, 2], [600, 1], [820, 2]], clouds: [[200, 2], [700, 4]], far: [['manor', 150], ['manor', 690]], hedges: [[70, 110], [560, 620]], near: [['cottage', -4, 0], ['tree', 228, 1], ['fence', 290, 70], ['pine', 360, -1], ['tree', 400, 2], ['bush', 470, 3], ['tree', 540, 1], ['barn', 630, 1], ['well', 720, 4], ['tree', 780, 2], ['fence', 840, 90], ['pine', 950, -1]] },
  village2: { hz: 41, mountains: [[200, 1], [420, 0], [700, 2], [900, 0]], clouds: [[30, 3], [560, 1]], hedges: [[160, 230], [760, 820]], near: [['tree', 50, 1], ['barn', 240, 1], ['well', 330, 4], ['tree', 380, 1], ['pine', 450, -1], ['fence', 90, 70], ['cottage', 560, 0], ['tree', 640, 2], ['fence', 700, 100], ['tree', 860, 1], ['pine', 940, -2]] },
  village3: { hz: 40, mountains: [[60, 2], [360, 1], [640, 0], [880, 2]], clouds: [[260, 1], [800, 2]], hedges: [[560, 620]], near: [['tree', 150, 2], ['cottage', 230, 0], ['bush', 330, 3], ['barn', 380, 1], ['pine', 470, -1], ['tree', 540, 1], ['fence', 620, 110], ['well', 760, 4], ['tree', 820, 2], ['pine', 930, -1]] },
  forest1: { hz: 30, forestRows: 3, near: [['tree', 50, 1], ['pine', 210, -2], ['tree', 250, 2], ['tree', 330, 2], ['bush', 470, 3], ['pine', 560, -1], ['tree', 610, 1], ['tree', 720, 2], ['pine', 820, 0], ['tree', 880, 1], ['bush', 980, 3]] },
  forest2: { hz: 32, forestRows: 2, near: [['tree', 60, 1], ['bush', 236, 3], ['tree', 280, 2], ['tree', 380, 2], ['pine', 440, 0], ['tree', 540, 1], ['pine', 640, -1], ['tree', 700, 2], ['bush', 800, 3], ['tree', 860, 1], ['pine', 960, -2]] },
  fields1: { hz: 42, farHedge: true, mountains: [[40, 2], [240, 0], [400, 1], [640, 2], [860, 0]], clouds: [[60, 1], [330, 4], [720, 2]], hedges: [[20, 120], [180, 250], [300, 400], [440, 504], [620, 700], [820, 900]], near: [['tree', 96, 1], ['fence', 150, 100], ['tree', 240, 2], ['tree', 300, 1], ['bush', 360, 3], ['pine', 400, -1], ['fence', 420, 84], ['tree', 560, 1], ['fence', 640, 120], ['bush', 790, 3], ['tree', 850, 2]] },
  fields2: { hz: 43, farHedge: true, mountains: [[120, 0], [330, 2], [600, 1], [820, 0]], clouds: [[200, 2], [640, 0]], far: [['manor', 330]], hedges: [[40, 140], [190, 300], [420, 504], [600, 700], [860, 960]], near: [['tree', 86, 2], ['fence', 150, 110], ['pine', 270, -1], ['bush', 300, 3], ['tree', 410, 1], ['bush', 470, 3], ['tree', 600, 2], ['fence', 680, 100], ['tree', 880, 1]] },
  meadow1: { hz: 38, mountains: [[0, 2], [110, 0], [190, 1], [300, 2], [420, 0], [560, 1], [700, 2], [860, 0]], clouds: [[120, 0], [380, 3], [760, 2]], hedges: [[0, 100], [220, 300], [600, 680]], near: [['tree', 90, 1], ['pine', 172, 0], ['tree', 280, 1], ['tree', 360, 2], ['bush', 460, 3], ['pine', 560, -1], ['tree', 640, 1], ['tree', 760, 2], ['pine', 900, -2]] },
  meadow2: { hz: 39, mountains: [[20, 1], [140, 2], [260, 0], [380, 2], [560, 1], [760, 0], [900, 2]], clouds: [[70, 2], [300, 0], [680, 3]], hedges: [[160, 250], [340, 420], [700, 780]], near: [['tree', 70, 1], ['tree', 190, 2], ['pine', 246, -1], ['well', 330, 4], ['tree', 400, 2], ['tree', 560, 1], ['pine', 650, 0], ['tree', 760, 2], ['bush', 880, 3]] },
};

function draw(s, m, x, baseY) {
  if (!m) return;
  const g = m.frames.base ?? m.frames.idle0;
  s.grid(g, x, baseY - m.h, m.pal);
}

/** その場所の舞台を、高さ h で作る。足もとの線は h - 9 */
export function buildPlace(id, h) {
  const spec = PLACES[id] ?? PLACES.village1;
  const off = h - 64; // 64 で描いた配置を下にそろえる
  const r = rng(id.length * 97 + h);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const sky = new Surface(LW, h);
  const far = new Surface(LW, h);
  const near = new Surface(LW, h);
  const HZ = spec.hz + off;
  // 空（帯と刷毛の筋）・山・雲
  for (let y = 0; y < HZ; y++) sky.rect(0, y, LW, 1, P[SKY[Math.min(3, Math.floor((Math.max(0, y - off) * 4) / spec.hz))]]);
  for (let y = 0; y < HZ; y++) for (let k = 0; k < 28; k++) sky.rect(Math.floor(r() * LW), y, pick([3, 6, 9, 13]), 1, P[SKY[Math.min(4, Math.floor((Math.max(0, y - off) * 4) / spec.hz) + 1)]]);
  if (spec.mountains) {
    const mb = HZ - 6;
    for (let x = 0; x < LW; x += 14) sky.grid(A.PEAKS[3], x, mb - 7 + Math.floor(r() * 2), P);
    for (const [x, k] of spec.mountains) { const g = A.PEAKS[k]; sky.grid(g, x, mb - g.length, P); }
  }
  for (const [x, y] of spec.clouds ?? []) sky.grid(A.CLOUD_BIG, x, y + Math.max(0, off >> 1), P);
  // 遠景（針葉樹の帯 / 生け垣）と森の床
  if (spec.farHedge) {
    for (let x = 0; x < LW; x += 10 + Math.floor(r() * 8)) { if (Math.floor(x / 70) % 3 === 1) { x += 30; continue; } draw(far, bush, x, HZ + 1 + Math.floor(r() * 2)); }
    for (let x = 0; x < LW; x += 40 + Math.floor(r() * 60)) far.grid(A.PINE_C, x, HZ - 9, P);
  } else {
    for (let row = 0; row < (spec.forestRows ?? 1); row++) for (let x = 0; x < LW; x += 4 + Math.floor(r() * 8)) far.grid(pick(row === 0 ? [A.PINE_A, A.PINE_B, A.PINE_C] : [A.PINE_A, A.PINE_B]), x, HZ - 13 + Math.floor(r() * 5) - row * 9, P);
  }
  if (spec.hz < 41) {
    for (let y = HZ - 2; y < 42 + off; y++) for (let x = 0; x < LW; x++) far.set(x, y, P[pick(['1', '2', 'C', 'B', '2', 'q', 'r'])]);
    for (let k = 0; k < 36; k++) { const tx = Math.floor(r() * LW); for (let y = HZ - 6; y < 42 + off; y++) { far.set(tx, y, P.n); far.set(tx + 1, y, P.m); } }
  }
  for (const [k, x] of spec.far ?? []) draw(far, manor, x, HZ + 2);
  for (const [x0, x1] of spec.hedges ?? []) for (let x = x0; x < x1; x += 12) draw(far, bush, x, HZ + 3);
  // 地面（手で描いた帯）と近い物
  for (let x = 0, k = 0; x < LW; x += 128, k++) draw(near, k % 2 ? groundB : groundA, x, h);
  if (spec.hz < 41) for (let y = 40 + off; y < 44 + off; y++) for (let x = 0; x < LW; x++) if (r() < 0.45 - (y - 40 - off) * 0.11) near.set(x, y, P[pick(['2', 'C', 'r', '1'])]);
  // 人物の帯の草のまだら（暗めの房）
  const DARKQ = { ...P, v: P.t, u: P.s, t: P.s };
  for (let k = 0; k < 420; k++) { const x = Math.floor(r() * LW), y = 45 + off + Math.floor(r() * 14); const g = pick([...A.TUFT.far, ...A.TUFT.mid, ...A.TUFT_FLOW]); near.grid(g, x, y - g.length + 1, DARKQ); }
  let t = Math.floor(r() * TREES.length);
  for (const [k, x, dy] of spec.near) {
    if (k === 'fence') { for (let fx = x; fx < x + dy; fx += fence.w - 2) draw(near, fence, fx, 47 + off); continue; }
    draw(near, k === 'tree' ? TREES[t++ % TREES.length] : NEAR[k], x, 44 + off + dy);
  }
  return { ground: h - 9, layers: [{ s: sky, k: 0.04 }, { s: far, k: 0.3 }, { s: near, k: 1 }], front: [] };
}

export const PLACE_IDS = Object.keys(PLACES);
