// 進軍（CONTRACTS §80）: 担当ごとの横レーン。まだ通っていないテスト1件が、レーンを塞ぐ敵1体。
// 状態はすべてビューと記録から導く。ここは見せ方だけで、書き込まない。盤面の担当
import { compose, POSES, toCanvas, bust, BUST, mob, flies, boss, FOOT, CENTER, hasArt, mobHasArt } from './march-art.js';
import { SCENES as ART_SCENES, SCENE_OF } from './art/index.js';
import { toCanvas as surfaceCanvas, paint } from './art/sprite.js';
import barnArt from './art/env/cottage2.js';
import wellArt from './art/env/well.js';
import cottageArt from './art/env/cottage.js';
const ENV = { barn: barnArt, well: wellArt, cottage: cottageArt };
import { t } from './words.js';
import { own } from './sketch.js';
import { laneStatus, foesOf, commandOf, nextCommand, routeOf, foesToGate, arenasOf, laneOrder, travelOf, chainNameOf, toolsOf, streakOf } from './march-status.js';

const TOP = 24;
const PLATE = 136;
const LW = 1024;
const FONT = '16px "DotGothic16", "Hiragino Kaku Gothic ProN", monospace';

// レーンの舞台（奥から: 空 / 遠景 / 中景 / 地面）
const rngOf = (seed) => {
  let s = seed * 9301 + 49297;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
};
const wave = (x, parts) => parts.reduce((sum, [n, a, p]) => sum + a * Math.sin((x / LW) * Math.PI * 2 * n + p), 0);
function layer(h) {
  const c = document.createElement('canvas');
  c.width = LW;
  c.height = h;
  return [c, c.getContext('2d')];
}
function bands(x, h, colors) {
  // はっきりした横縞。境目だけ1段ぶん市松にする
  const n = colors.length;
  for (let j = 0; j < h; j++) {
    const t = (j / h) * n;
    const k = Math.min(n - 1, Math.floor(t));
    const edge = t - k > 0.86 && k < n - 1;
    x.fillStyle = colors[k];
    x.fillRect(0, j, LW, 1);
    if (edge) {
      x.fillStyle = colors[k + 1];
      for (let i = j % 2; i < LW; i += 2) x.fillRect(i, j, 1, 1);
    }
  }
}
function ridge(x, base, parts, col, top = null, h = 200) {
  for (let i = 0; i < LW; i++) {
    const y = Math.round(base - wave(i, parts));
    x.fillStyle = col;
    x.fillRect(i, y, 1, h);
    if (top) {
      x.fillStyle = top;
      x.fillRect(i, y, 1, 1);
    }
  }
}
// 周回してもつながるように、端をまたぐ物は2回描く
const wrapDraw = (px, fn) => {
  fn(px);
  if (px > LW - 64) fn(px - LW);
  if (px < 64) fn(px + LW);
};
function disc(x, cx, cy, r, col) {
  for (let j = -r; j <= r; j++) {
    const w = Math.round(Math.sqrt(r * r - j * j));
    x.fillStyle = col;
    x.fillRect(cx - w, cy + j, w * 2 + 1, 1);
  }
}
function cloud(x, cx, cy, s, a, b) {
  for (const [dx, dy, r] of [[0, 0, 5], [7, -2, 6], [15, 0, 5], [-7, 1, 3], [21, 1, 3]]) {
    disc(x, cx + dx * s, cy + dy * s, r * s, b);
  }
  for (const [dx, dy, r] of [[0, -1, 4], [7, -3, 5], [15, -1, 4]]) disc(x, cx + dx * s, cy + dy * s, r * s, a);
}
const SCENES = [
  { // 森
    sky: ['#4aa8ec', '#6cc4f4', '#94dcf4', '#c4f0ec'],
    far(x, h, r) {
      for (let k = 0; k < 7; k++) wrapDraw(Math.floor(r() * LW), (px) => cloud(x, px, 6 + Math.floor(r() * 8), 1, '#ffffff', '#d8f0fa'));
      ridge(x, h * 0.5, [[3, 6, 0], [7, 3, 1], [13, 2, 2]], '#7ab4d8', '#a4d0e8');
    },
    mid(x, h, r) {
      ridge(x, h * 0.7, [[5, 3, 1], [11, 2, 0]], '#2c8c58', '#48ac68');
      for (let k = 0; k < 34; k++) {
        const px = Math.floor(r() * LW);
        const s = 5 + Math.floor(r() * 5);
        const by = Math.round(h * 0.78);
        wrapDraw(px, (q) => {
          x.fillStyle = '#6c4428';
          x.fillRect(q - 1, by - s, 3, s + 2);
          disc(x, q, by - s - 2, s, '#1e7044');
          disc(x, q - 1, by - s - 3, s - 1, '#2e9458');
          disc(x, q - 2, by - s - 4, Math.max(1, s - 3), '#58bc6c');
        });
      }
    },
    ground: { top: '#a4e464', edge: '#6cc048', a: '#58a43c', b: '#46903a', deep: '#7a5430', dot: ['#fff27a', '#ff9ab4', '#ffffff'] },
    air: { c: ['#ffffff', '#c8f47a'], vx: -0.5, vy: 0.12, n: 5 },
  },
  { // 砂漠
    sky: ['#f4843c', '#f8a04c', '#fcc060', '#fee08a'],
    far(x, h, r) {
      disc(x, 780, Math.round(h * 0.28), 9, '#fff4b4');
      disc(x, 780, Math.round(h * 0.28), 7, '#ffffff');
      for (let k = 0; k < 7; k++) {
        const px = Math.floor(r() * LW);
        const s = 10 + Math.floor(r() * 12);
        const by = Math.round(h * 0.7);
        wrapDraw(px, (q) => {
          for (let j = 0; j < s; j++) {
            x.fillStyle = '#c87a3c';
            x.fillRect(q - j, by - s + j, j + 1, 1);
            x.fillStyle = '#e8a050';
            x.fillRect(q, by - s + j, j + 1, 1);
          }
        });
      }
      ridge(x, h * 0.66, [[2, 3, 0], [5, 2, 1]], '#d89048', '#eeb060');
    },
    mid(x, h, r) {
      ridge(x, h * 0.78, [[4, 2, 2], [9, 2, 0]], '#d8a050', '#f0c870');
      for (let k = 0; k < 16; k++) {
        const px = Math.floor(r() * LW);
        const s = 6 + Math.floor(r() * 5);
        const by = Math.round(h * 0.82);
        wrapDraw(px, (q) => {
          x.fillStyle = '#1e6c48';
          x.fillRect(q - 2, by - s - 3, 4, s + 4);
          x.fillRect(q - 5, by - s + 1, 3, 2);
          x.fillRect(q - 5, by - s - 2, 2, 3);
          x.fillRect(q + 2, by - s + 3, 3, 2);
          x.fillRect(q + 3, by - s, 2, 3);
          x.fillStyle = '#3c9c64';
          x.fillRect(q - 1, by - s - 3, 1, s + 3);
        });
      }
    },
    ground: { top: '#ffe8a0', edge: '#f4cc78', a: '#e4b460', b: '#d4a050', deep: '#a87438', dot: ['#c88c48', '#fff4c8'] },
    air: { c: ['#fff0c0', '#ffd890'], vx: -1.2, vy: 0.02, n: 7 },
  },
  { // 夜の港
    sky: ['#0e1a48', '#16265c', '#203470', '#2c4888'],
    far(x, h, r) {
      for (let k = 0; k < 150; k++) {
        x.fillStyle = r() > 0.75 ? '#ffffff' : r() > 0.5 ? '#ffe9a8' : '#8cb0e8';
        x.fillRect(Math.floor(r() * LW), Math.floor(r() * h * 0.5), 1, 1);
      }
      disc(x, 300, Math.round(h * 0.24), 8, '#fff4c8');
      disc(x, 303, Math.round(h * 0.2), 7, '#16265c');
      ridge(x, h * 0.58, [[4, 3, 2], [9, 2, 1]], '#16264c', '#22345c');
      for (let k = 0; k < 40; k++) {
        x.fillStyle = r() > 0.4 ? '#ffd86a' : '#ff9a5a';
        x.fillRect(Math.floor(r() * LW), Math.round(h * 0.6) + Math.floor(r() * 3), 1, 1);
      }
    },
    mid(x, h, r) {
      const by = Math.round(h * 0.68);
      x.fillStyle = '#1c4070';
      x.fillRect(0, by, LW, h);
      for (let k = 0; k < 110; k++) {
        x.fillStyle = r() > 0.6 ? '#5a90c8' : '#2c5c94';
        x.fillRect(Math.floor(r() * LW), by + 1 + Math.floor(r() * 12), 3 + Math.floor(r() * 7), 1);
      }
      for (let k = 0; k < 5; k++) {
        const px = Math.floor(r() * LW);
        wrapDraw(px, (q) => {
          x.fillStyle = '#10182c';
          x.fillRect(q - 9, by - 3, 18, 3);
          x.fillRect(q - 7, by, 14, 1);
          x.fillRect(q, by - 16, 1, 13);
          for (let j = 0; j < 10; j++) x.fillRect(q + 1, by - 16 + j, Math.floor(j * 0.7), 1);
          x.fillStyle = '#ffd86a';
          x.fillRect(q - 6, by - 2, 1, 1);
          x.fillRect(q + 4, by - 2, 1, 1);
        });
      }
    },
    ground: { top: '#8c9cb4', edge: '#6c7c98', a: '#566480', b: '#465470', deep: '#2c3650', brick: true, dot: ['#7c8ca8'] },
    air: { c: ['#a8d0ff'], vx: -0.15, vy: -0.05, n: 3 },
  },
  { // 雪山
    sky: ['#8cc4ec', '#a8d8f4', '#c8e8f8', '#e8f6fc'],
    far(x, h, r) {
      const by = Math.round(h * 0.68);
      for (let k = 0; k < 8; k++) {
        const px = Math.floor((k / 8) * LW + r() * 70);
        const s = 16 + Math.floor(r() * 12);
        wrapDraw(px, (q) => {
          for (let j = 0; j < s; j++) {
            const snow = j < s * 0.45 + ((q + j) % 3);
            x.fillStyle = snow ? '#ffffff' : '#8ca8c8';
            x.fillRect(q - j, by - s + j, j + 1, 1);
            x.fillStyle = snow ? '#d4e8f4' : '#6c88ac';
            x.fillRect(q, by - s + j, j + 1, 1);
          }
        });
      }
    },
    mid(x, h, r) {
      ridge(x, h * 0.74, [[3, 2, 2], [8, 1, 0]], '#e8f4fa', '#ffffff');
      for (let k = 0; k < 30; k++) {
        const px = Math.floor(r() * LW);
        const s = 8 + Math.floor(r() * 7);
        const by = Math.round(h * 0.8);
        wrapDraw(px, (q) => {
          x.fillStyle = '#5c4030';
          x.fillRect(q - 1, by - 2, 2, 3);
          for (let j = 0; j < s; j++) {
            const w = Math.floor(((j % 5) + j * 0.6) * 0.8);
            x.fillStyle = j < 3 || j % 5 === 0 ? '#ffffff' : '#2c6468';
            x.fillRect(q - w, by - s + j - 2, w * 2 + 1, 1);
            if (w > 1 && j % 5) {
              x.fillStyle = '#1c4850';
              x.fillRect(q - w, by - s + j - 2, Math.ceil(w / 2), 1);
            }
          }
        });
      }
    },
    ground: { top: '#ffffff', edge: '#e4f2fa', a: '#cce4f2', b: '#b4d4e8', deep: '#8cb0cc', dot: ['#ffffff', '#a4c8e0'] },
    air: { c: ['#ffffff'], vx: -0.45, vy: 0.4, n: 14 },
  },
  { // 魔法の森
    sky: ['#3c1c70', '#6028a0', '#9440b0', '#d868b4'],
    far(x, h, r) {
      for (let k = 0; k < 90; k++) {
        x.fillStyle = r() > 0.5 ? '#ffe0ff' : '#b8a0ff';
        x.fillRect(Math.floor(r() * LW), Math.floor(r() * h * 0.55), 1, 1);
      }
      const by = Math.round(h * 0.7);
      for (let k = 0; k < 11; k++) {
        const px = Math.floor(r() * LW);
        const s = 12 + Math.floor(r() * 16);
        wrapDraw(px, (q) => {
          for (let j = 0; j < s; j++) {
            const w = Math.ceil((j / s) * 5);
            x.fillStyle = '#7a3cc0';
            x.fillRect(q - w, by - s + j, w, 1);
            x.fillStyle = '#b070e8';
            x.fillRect(q, by - s + j, w, 1);
          }
          x.fillStyle = '#f0d4ff';
          x.fillRect(q, by - s, 1, Math.ceil(s * 0.4));
        });
      }
      ridge(x, h * 0.68, [[4, 2, 1], [11, 2, 0]], '#4c2488', '#6c38a8');
    },
    mid(x, h, r) {
      ridge(x, h * 0.78, [[6, 2, 2]], '#341868', '#4c2488');
      for (let k = 0; k < 22; k++) {
        const px = Math.floor(r() * LW);
        const s = 5 + Math.floor(r() * 6);
        const by = Math.round(h * 0.84);
        const hot = r() > 0.5;
        wrapDraw(px, (q) => {
          x.fillStyle = '#e8d4f0';
          x.fillRect(q - 1, by - s, 3, s + 2);
          disc(x, q, by - s - 1, s, hot ? '#d03090' : '#3090c0');
          disc(x, q - 1, by - s - 2, s - 2, hot ? '#ff68b8' : '#60d0f0');
          x.fillStyle = '#ffffff';
          x.fillRect(q - 3, by - s - 3, 2, 1);
          x.fillRect(q + 1, by - s - 1, 2, 1);
        });
      }
    },
    ground: { top: '#c078e8', edge: '#9050c8', a: '#6c38a8', b: '#5a2c94', deep: '#34185c', dot: ['#ffe0ff', '#70e0ff', '#ff88d0'] },
    air: { c: ['#ffe0ff', '#70e0ff', '#ffd84a'], vx: -0.1, vy: -0.3, n: 9 },
  },
  { // 火山
    sky: ['#1c0c24', '#3c1428', '#70202c', '#c0402c'],
    far(x, h, r) {
      const by = Math.round(h * 0.72);
      for (const px of [200, 720]) {
        const s = Math.round(h * 0.56);
        for (let j = 0; j < s; j++) {
          const w = 5 + j;
          x.fillStyle = '#2c1420';
          x.fillRect(px - w, by - s + j, w, 1);
          x.fillStyle = '#44202c';
          x.fillRect(px, by - s + j, w, 1);
        }
        x.fillStyle = '#ff6a2c';
        x.fillRect(px - 5, by - s - 1, 11, 2);
        x.fillStyle = '#ffd84a';
        x.fillRect(px - 3, by - s - 1, 7, 1);
        for (let j = 1; j < 16; j++) {
          x.fillStyle = j % 3 ? '#ff6a2c' : '#ffd84a';
          x.fillRect(px + Math.round(Math.sin(j * 0.8) * 2) - 1, by - s + j, 2, 1);
        }
        for (let k = 0; k < 7; k++) disc(x, px + Math.floor(k * 3 + r() * 5), by - s - 3 - k * 2, 2 + (k >> 1), k % 2 ? '#54343c' : '#3c2430');
      }
      ridge(x, h * 0.7, [[5, 3, 0], [12, 2, 1]], '#180c18', '#2c1420');
    },
    mid(x, h, r) {
      const by = Math.round(h * 0.84);
      for (let k = 0; k < 20; k++) {
        const px = Math.floor(r() * LW);
        const s = 7 + Math.floor(r() * 9);
        wrapDraw(px, (q) => {
          x.fillStyle = '#100810';
          x.fillRect(q, by - s, 2, s + 1);
          for (let j = 2; j < s - 1; j += 3) {
            const dir = j % 2 ? 1 : -1;
            for (let i = 1; i <= 4; i++) x.fillRect(q + dir * i + (dir > 0 ? 1 : 0), by - s + j - Math.floor(i / 2), 1, 1);
          }
        });
      }
    },
    ground: { top: '#6c4c44', edge: '#4c3430', a: '#3a2826', b: '#2c1e20', deep: '#180e12', crack: true, dot: ['#54403c'] },
    air: { c: ['#ffd84a', '#ff6a2c', '#ff9a3c'], vx: -0.3, vy: -0.55, n: 12 },
  },
];

// 中ボス・魔王の戦場（合流したレーンがまとまる。奥行きのある床に、全員が立つ）
function buildArena(goal, h) {
  const [c, x] = layer(h);
  const wall = goal ? ['#1c0c24', '#2c1030', '#3c1430'] : ['#1a1830', '#24223c', '#2e2c4a'];
  const horizon = Math.round(h * 0.2);
  bands(x, horizon, wall);
  // 柱と窓
  for (let k = 0; k < 14; k++) {
    const px = 30 + k * 74;
    x.fillStyle = goal ? '#140818' : '#12101f';
    x.fillRect(px, 0, 16, horizon);
    x.fillStyle = goal ? '#54203c' : '#3c3a5c';
    x.fillRect(px + 2, 0, 3, horizon);
    x.fillStyle = goal ? '#ff6a2c' : '#5a78d8';
    x.fillRect(px + 38, Math.round(horizon * 0.3), 8, Math.round(horizon * 0.42));
    x.fillStyle = goal ? '#ffd84a' : '#9ec4ff';
    x.fillRect(px + 40, Math.round(horizon * 0.34), 4, Math.round(horizon * 0.2));
  }
  x.fillStyle = goal ? '#0c0410' : '#0c0a18';
  x.fillRect(0, horizon - 2, LW, 2);
  // 市松の床（奥ほど細かい）
  const floorA = goal ? '#3c2230' : '#3a3852';
  const floorB = goal ? '#2c1824' : '#2c2a42';
  for (let j = horizon; j < h; j++) {
    const d = (j - horizon + 4) / (h - horizon + 4);
    const size = Math.max(8, Math.round(44 * d));
    const row = Math.floor(Math.sqrt(d) * 9);
    for (let i = -size; i < LW; i += size) {
      x.fillStyle = (Math.floor(i / size) + row) % 2 ? floorA : floorB;
      x.fillRect(i, j, size, 1);
    }
  }
  return c;
}

// 村（休む場面）。道の先から流れてくる
function drawHouse(ctx, x, gy, w, h, wall, roof, lit) {
  ctx.fillStyle = '#10101c';
  ctx.fillRect(x - 1, gy - h - 1, w + 2, h + 2);
  ctx.fillStyle = wall;
  ctx.fillRect(x, gy - h, w, h);
  ctx.fillStyle = 'rgba(16,12,32,.22)';
  ctx.fillRect(x, gy - h, 3, h);
  const rh = Math.ceil(w * 0.5);
  for (let j = 0; j < rh; j++) {
    const half = Math.round((j / rh) * (w / 2 + 3));
    ctx.fillStyle = j === 0 ? '#10101c' : roof;
    ctx.fillRect(x + Math.floor(w / 2) - half, gy - h - rh + j, half * 2, 1);
  }
  ctx.fillStyle = '#5c3820';
  ctx.fillRect(x + Math.floor(w / 2) - 2, gy - 7, 5, 7);
  ctx.fillStyle = lit ? '#ffe27a' : '#3c3858';
  ctx.fillRect(x + 3, gy - h + 3, 4, 4);
  ctx.fillRect(x + w - 7, gy - h + 3, 4, 4);
}

function buildScene(i, LH) {
  const sc = SCENES[i];
  const r = rngOf(31 + i * 17);
  const h = LH;
  const [sky, sx] = layer(h);
  bands(sx, h, sc.sky);
  const [far, fx] = layer(h);
  sc.far(fx, h - 9, r);
  const [mid, mx] = layer(h);
  sc.mid(mx, h - 9, r);
  const [ground, gx] = layer(h);
  const g = sc.ground;
  const gy = h - 11;
  gx.fillStyle = g.a;
  gx.fillRect(0, gy, LW, 11);
  gx.fillStyle = g.top;
  gx.fillRect(0, gy, LW, 1);
  gx.fillStyle = g.edge;
  gx.fillRect(0, gy + 1, LW, 1);
  gx.fillStyle = g.deep;
  gx.fillRect(0, h - 2, LW, 2);
  gx.fillStyle = g.b;
  gx.fillRect(0, h - 4, LW, 2);
  if (g.brick) {
    gx.fillStyle = g.deep;
    for (let k = 0; k < LW; k += 16) {
      gx.fillRect(k, gy + 2, 1, 4);
      gx.fillRect(k + 8, gy + 6, 1, 3);
    }
    gx.fillRect(0, gy + 6, LW, 1);
  }
  for (let k = 0; k < 90; k++) {
    gx.fillStyle = g.dot[Math.floor(r() * g.dot.length)];
    gx.fillRect(Math.floor(r() * LW), gy + 2 + Math.floor(r() * 6), 1 + Math.floor(r() * 2), 1);
  }
  for (let k = 0; k < 44; k++) {
    gx.fillStyle = g.edge;
    gx.fillRect(Math.floor(r() * LW), gy + 2 + Math.floor(r() * 5), 2, 1);
    gx.fillStyle = g.top;
    gx.fillRect(Math.floor(r() * LW), gy - 1, 1, 1);
  }
  if (g.crack) {
    for (let k = 0; k < 18; k++) {
      let q = Math.floor(r() * LW);
      let yy = gy + 2 + Math.floor(r() * 3);
      for (let j = 0; j < 9; j++) {
        gx.fillStyle = j % 3 ? '#ff6a2c' : '#ffd84a';
        gx.fillRect(q, yy, 2, 1);
        q += 2;
        yy += r() > 0.6 ? 1 : r() > 0.7 ? -1 : 0;
        yy = Math.max(gy + 2, Math.min(h - 3, yy));
      }
    }
  }
  return { sky, far, mid, ground };
}

// 字: 半角は手で描いた 6×12 の細い字、ほかは DotGothic16 を細く 1px の点に落とす（ドカポン4の窓の字）
const HALF = {
  0: ['.####.', '#....#', '#...##', '#..#.#', '#.#..#', '##...#', '#....#', '#....#', '.####.'], 1: ['..#...', '.##...', '#.#...', '..#...', '..#...', '..#...', '..#...', '..#...', '#####.'],
  2: ['.####.', '#....#', '.....#', '....#.', '...#..', '..#...', '.#....', '#.....', '######'], 3: ['.####.', '#....#', '.....#', '..###.', '.....#', '.....#', '.....#', '#....#', '.####.'],
  4: ['....#.', '...##.', '..#.#.', '.#..#.', '#...#.', '######', '....#.', '....#.', '....#.'], 5: ['######', '#.....', '#.....', '#####.', '.....#', '.....#', '.....#', '#....#', '.####.'],
  6: ['.####.', '#.....', '#.....', '#####.', '#....#', '#....#', '#....#', '#....#', '.####.'], 7: ['######', '.....#', '....#.', '....#.', '...#..', '...#..', '..#...', '..#...', '..#...'],
  8: ['.####.', '#....#', '#....#', '.####.', '#....#', '#....#', '#....#', '#....#', '.####.'], 9: ['.####.', '#....#', '#....#', '#....#', '.#####', '.....#', '.....#', '.....#', '.####.'],
  '/': ['.....#', '....#.', '....#.', '...#..', '...#..', '..#...', '..#...', '.#....', '#.....'], '-': ['......', '......', '......', '......', '######', '......', '......', '......', '......'],
  ':': ['......', '......', '..#...', '......', '......', '......', '..#...', '......', '......'], '.': ['......', '......', '......', '......', '......', '......', '......', '..#...', '......'],
  ' ': ['......', '......', '......', '......', '......', '......', '......', '......', '......'], '!': ['..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '......', '..#...', '......'],
  L: ['#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '#.....', '######'], v: ['......', '......', '......', '#....#', '#....#', '.#..#.', '.#..#.', '..##..', '..##..'],
  G: ['.####.', '#....#', '#.....', '#.....', '#..###', '#....#', '#....#', '#....#', '.####.'], H: ['#....#', '#....#', '#....#', '#....#', '######', '#....#', '#....#', '#....#', '#....#'],
  P: ['#####.', '#....#', '#....#', '#....#', '#####.', '#.....', '#.....', '#.....', '#.....'], A: ['..##..', '.#..#.', '#....#', '#....#', '######', '#....#', '#....#', '#....#', '#....#'],
  S: ['.####.', '#....#', '#.....', '.####.', '.....#', '.....#', '.....#', '#....#', '.####.'], F: ['######', '#.....', '#.....', '#####.', '#.....', '#.....', '#.....', '#.....', '#.....'],
  I: ['.###..', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '.###..'], E: ['######', '#.....', '#.....', '#####.', '#.....', '#.....', '#.....', '#.....', '######'],
  M: ['#....#', '##..##', '#.##.#', '#.##.#', '#....#', '#....#', '#....#', '#....#', '#....#'], N: ['#....#', '##...#', '#.#..#', '#.#..#', '#..#.#', '#..#.#', '#...##', '#...##', '#....#'],
  O: ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'], T: ['######', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...'],
  U: ['#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'], R: ['#####.', '#....#', '#....#', '#####.', '#..#..', '#...#.', '#...#.', '#....#', '#....#'],
  K: ['#....#', '#...#.', '#..#..', '#.#...', '##....', '#.#...', '#..#..', '#...#.', '#....#'], B: ['#####.', '#....#', '#....#', '#####.', '#....#', '#....#', '#....#', '#....#', '#####.'],
  C: ['.####.', '#....#', '#.....', '#.....', '#.....', '#.....', '#.....', '#....#', '.####.'], D: ['####..', '#...#.', '#....#', '#....#', '#....#', '#....#', '#....#', '#...#.', '####..'],
  X: ['#....#', '#....#', '.#..#.', '..##..', '..##..', '.#..#.', '#....#', '#....#', '#....#'], Y: ['#....#', '#....#', '.#..#.', '..##..', '..#...', '..#...', '..#...', '..#...', '..#...'],
  a: ['......', '......', '......', '.####.', '.....#', '.#####', '#....#', '#...##', '.###.#'],
  b: ['#.....', '#.....', '#.....', '#.###.', '##...#', '#....#', '#....#', '##...#', '#.###.'],
  c: ['......', '......', '......', '.####.', '#....#', '#.....', '#.....', '#....#', '.####.'],
  d: ['.....#', '.....#', '.....#', '.###.#', '#...##', '#....#', '#....#', '#...##', '.###.#'],
  e: ['......', '......', '......', '.####.', '#....#', '######', '#.....', '#....#', '.####.'],
  f: ['..###.', '.#....', '.#....', '####..', '.#....', '.#....', '.#....', '.#....', '.#....'],
  g: ['......', '......', '.####.', '#....#', '#....#', '.#####', '.....#', '#....#', '.####.'],
  h: ['#.....', '#.....', '#.....', '#.###.', '##...#', '#....#', '#....#', '#....#', '#....#'],
  i: ['..#...', '......', '......', '.##...', '..#...', '..#...', '..#...', '..#...', '.###..'],
  j: ['....#.', '......', '......', '...##.', '....#.', '....#.', '....#.', '#...#.', '.###..'],
  k: ['#.....', '#.....', '#.....', '#...#.', '#..#..', '###...', '#..#..', '#...#.', '#....#'],
  l: ['.##...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '..#...', '.###..'],
  m: ['......', '......', '......', '##.##.', '#.#..#', '#.#..#', '#.#..#', '#.#..#', '#.#..#'],
  n: ['......', '......', '......', '#.###.', '##...#', '#....#', '#....#', '#....#', '#....#'],
  o: ['......', '......', '......', '.####.', '#....#', '#....#', '#....#', '#....#', '.####.'],
  p: ['......', '......', '#.###.', '##...#', '#....#', '#....#', '#####.', '#.....', '#.....'],
  q: ['......', '......', '.###.#', '#...##', '#....#', '#....#', '.#####', '.....#', '.....#'],
  r: ['......', '......', '......', '#.###.', '##...#', '#.....', '#.....', '#.....', '#.....'],
  s: ['......', '......', '......', '.#####', '#.....', '.####.', '.....#', '.....#', '#####.'],
  t: ['.#....', '.#....', '####..', '.#....', '.#....', '.#....', '.#....', '.#..#.', '..##..'],
  u: ['......', '......', '......', '#....#', '#....#', '#....#', '#....#', '#...##', '.###.#'],
  v: ['......', '......', '......', '#....#', '#....#', '.#..#.', '.#..#.', '..##..', '..##..'],
  w: ['......', '......', '......', '#....#', '#....#', '#.##.#', '#.##.#', '#.##.#', '.#..#.'],
  x: ['......', '......', '......', '#....#', '.#..#.', '..##..', '..##..', '.#..#.', '#....#'],
  y: ['......', '......', '#....#', '#....#', '#....#', '.#####', '.....#', '#....#', '.####.'],
  z: ['......', '......', '......', '######', '....#.', '...#..', '..#...', '.#....', '######'],
  '_': ['......', '......', '......', '......', '......', '......', '......', '......', '######'],
  '(': ['...#..', '..#...', '.#....', '.#....', '.#....', '.#....', '.#....', '..#...', '...#..'],
  ')': ['..#...', '...#..', '....#.', '....#.', '....#.', '....#.', '....#.', '...#..', '..#...'],
  W: ['#....#', '#....#', '#....#', '#....#', '#.##.#', '#.##.#', '#.##.#', '##..##', '#....#'], V: ['#....#', '#....#', '#....#', '#....#', '#....#', '.#..#.', '.#..#.', '..##..', '..##..'],
};
const TEXT = new Map();
const glyphCanvas = document.createElement('canvas');
glyphCanvas.width = 24;
glyphCanvas.height = 20;
const gx = glyphCanvas.getContext('2d', { willReadFrequently: true });
function textCanvas(str, color, shadow) {
  const key = `${str}|${color}|${shadow}`;
  const hit = TEXT.get(key);
  if (hit) return hit;
  if (TEXT.size > 900) TEXT.clear();
  gx.font = FONT;
  // 1 文字ずつ点に落とす
  const cols = [];
  for (const ch of Array.from(String(str))) {
    const g = HALF[ch];
    if (g) {
      const tall = [g[0], g[1], g[1], g[2], g[3], g[4], g[4], g[5], g[6], g[6], g[7], g[8]];
      const m = Array.from({ length: 7 }, (_, i) => Array.from({ length: 20 }, (_, j) => (j >= 3 && j < 15 && i < 6 && tall[j - 3][i] === '#' ? 1 : 0)));
      cols.push(...m);
      continue;
    }
    gx.clearRect(0, 0, 24, 20);
    gx.textBaseline = 'alphabetic';
    gx.fillStyle = '#ffffff';
    gx.fillText(ch, 0, 15);
    const adv = Math.max(4, Math.round(gx.measureText(ch).width));
    const d = gx.getImageData(0, 0, 24, 20).data;
    for (let i = 0; i < adv; i++) cols.push(Array.from({ length: 20 }, (_, j) => (d[(j * 24 + i) * 4 + 3] > 200 ? 1 : 0)));
  }
  const w = cols.length + 3;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = 20;
  const x = c.getContext('2d');
  const img = x.createImageData(w, 20);
  const n = (hex) => [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const col = n(color);
  const sh = shadow ? n(shadow) : null;
  const on = (i, j) => i >= 0 && i < cols.length && j >= 0 && cols[i][j] === 1;
  for (let j = 0; j < 20; j++) for (let i = 0; i < w; i++) {
    const o = (j * w + i) * 4;
    if (on(i, j)) img.data.set([col[0], col[1], col[2], 255], o);
    else if (sh && (on(i - 1, j) || on(i, j - 1) || on(i - 1, j - 1))) img.data.set([sh[0], sh[1], sh[2], 255], o);
  }
  x.putImageData(img, 0, 0);
  TEXT.set(key, c);
  return c;
}

const ENEMIES = { sage: ['slime', 'mushroom'], scribe: ['slime', 'skeleton'], herald: ['ghost', 'bat'], cartographer: ['slime', 'imp'], painter: ['mushroom', 'ghost'], hero: ['imp', 'bat', 'skeleton'] };
const TINTS = ['green', 'orange', 'blue', 'ice', 'purple', 'red'];
const LANE_COLOR = { blue: '#4a8cff', yellow: '#ffd84a', green: '#46c868', orange: '#ff9040', pink: '#ff72b4', purple: '#7a5ae6', mint: '#5ae0c0', gray: '#a8acb8' };
const STATUS_COLOR = { working: '#f0b080', ready: '#f0f0f0', turn: '#f0d878', camp: '#b8e090', waiting: '#a8d8f0', down: '#f08a7a', done: '#f0d878' };

const seqRoll = (e) => {
  // 判定の出目は演出。成功なら 11〜20、失敗なら 1〜10（結果はテストが決める）
  let h = 2166136261;
  for (const ch of `${e.seq}:${e.node}:${e.type}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (e.ok ? 11 : 1) + (h >>> 0) % 10;
};
const fit1 = (s, n) => (Array.from(s).length > n ? `${Array.from(s).slice(0, n).join('')}…` : s);

export function createMarch({ host, onPick, onCommand, sound, reserve = 0 }) {
  const canvas = document.createElement('canvas');
  canvas.id = 'march-canvas';
  canvas.setAttribute('role', 'img');
  host.append(canvas);
  // レーンの一手は本物のボタン（キーボードでも読み上げでも押せる）。絵の上に重ねる
  const cmdLayer = document.createElement('div');
  cmdLayer.id = 'march-cmds';
  host.append(cmdLayer);
  const ctx = canvas.getContext('2d');
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 640;
  let H = 360;
  let LH = 56;
  let view = null;
  let on = false;
  let raf = 0;
  let lanes = [];
  let parts = [];
  let banner = null;
  let shake = 0;
  let hitStop = 0;
  let confetti = 0;
  let tick = 0;
  let spare = 0;
  let bossNote = '';
  const notices = [];
  let noticeAt = 0;
  let noticeNow = null;
  let streak = null;
  let scale = 1;
  let arenas = [];
  let lastArenas = [];
  const arenaScenes = new Map();
  const arenaScene = (goal, h) => {
    const key = `${goal}/${h}`;
    if (!arenaScenes.has(key)) {
      // 描き直した舞台を戦場の高さで作る（門は村、魔王は暗い森）。無ければ前の戦場
      const sc = ART_SCENES[goal ? 'forest2' : 'village1'];
      if (sc) {
        const b = sc.build(h);
        const c = document.createElement('canvas');
        c.width = LW;
        c.height = h;
        const x = c.getContext('2d');
        for (const L of b.layers) x.drawImage(surfaceCanvas(L.s), 0, 0);
        if (goal) { x.fillStyle = 'rgba(40,0,20,.35)'; x.fillRect(0, 0, LW, h); }
        arenaScenes.set(key, c);
      } else arenaScenes.set(key, buildArena(goal, h));
    }
    return arenaScenes.get(key);
  };
  const REST_LEN = 250;
  const R = Math.random;
  const heroX = () => PLATE + 36;
  const contact = () => heroX() + 34;
  const mobs = {};
  // 敵の絵: [歩き0〜3, のけぞり]。描き直した敵が無ければ前の 2 枚を繰り返す
  const mobOf = (kind, tint, strong = false) => (mobs[`${kind}/${tint}/${strong}`] ??= mobHasArt(kind)
    ? [0, 1, 2, 3, 'hit'].map((f) => toCanvas(mob(kind, tint, f, strong)))
    : [0, 1, 0, 1, 0].map((f) => toCanvas(mob(kind, tint, f))));
  let golem = null;
  let demon = null;
  const scenes = new Map();
  const sceneFor = (i) => {
    const key = `${i % SCENES.length}/${LH}`;
    if (!scenes.has(key)) scenes.set(key, buildScene(i % SCENES.length, LH));
    return scenes.get(key);
  };
  // 描き直した舞台（art/places.js）。職業ごとに決まった場所を行く
  const artScenes = new Map();
  const artSceneFor = (l) => {
    const id = Object.hasOwn(SCENE_OF, l.c.job ?? '') ? SCENE_OF[l.c.job] : null;
    const sc = id && Object.hasOwn(ART_SCENES, id) ? ART_SCENES[id] : null;
    if (!sc) return null;
    const key = `${sc.id}/${LH}`;
    if (!artScenes.has(key)) {
      const b = sc.build(LH);
      const conv = (L) => ({ k: L.k ?? 1, every: L.every ?? 12, imgs: (L.frames ?? [L.s]).map((x) => surfaceCanvas(x)) });
      artScenes.set(key, { layers: (b.layers ?? []).map(conv), front: (b.front ?? []).map(conv), ground: b.ground ?? LH - 9 });
    }
    return artScenes.get(key);
  };
  const drawLayer = (L, y, scroll) => {
    const img = L.imgs.length > 1 && !calm ? L.imgs[Math.floor(tick / L.every) % L.imgs.length] : L.imgs[0];
    const sx = ((Math.round(scroll * L.k) % LW) + LW) % LW;
    ctx.drawImage(img, -sx, y);
    if (LW - sx < W) ctx.drawImage(img, LW - sx, y);
  };

  function makeLanes(chars) {
    const ids = chars.map((c) => c.id).join('\n');
    if (lanes.ids === ids) return;
    lanes = chars.map((c, i) => {
      const set = {};
      for (const p of Object.keys(POSES)) set[p] = toCanvas(compose(c.job, POSES[p], c.color));
      const busts = {};
      for (const e of ['normal', 'blink', 'happy', 'fierce', 'hurt']) busts[e] = toCanvas(bust(c.job, e, c.color));
      return { id: c.id, c, i, y: 0, set, busts, art: hasArt(c.job), scroll: i * 137, speed: 0, foes: [], air: [], atk: 0, atkAt: 0, hurt: 0, cheer: 0, shake: 0, flash: 0, flashC: '#ffffff', judge: null, boss: 0, bossDead: 0, bossKind: 'golem', travel: 0, at: null, status: 'ready', pending: null };
    });
    lanes.ids = ids;
    fit();
  }

  function fit() {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const dpr = devicePixelRatio || 1;
    const n = Math.max(1, lanes.length);
    // 1ドットが画面の整数ピクセルになる範囲で、いちばん大きく描く（レーンが少なければ人物も大きい）
    const k = Math.max(1, Math.min(3, Math.floor(Math.min(r.width / 480, r.height / (TOP + n * 60)) * dpr) / dpr));
    W = Math.min(LW, Math.floor(r.width / k));
    LH = Math.max(52, Math.min(84, Math.floor((r.height / k - TOP) / n)));
    H = TOP + n * LH;
    spare = Math.ceil(reserve / k);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = `${W * k}px`;
    canvas.style.height = `${H * k}px`;
    ctx.imageSmoothingEnabled = false;
    scale = k;
    layoutLanes(true);
    placeCommands();
  }

  // 同じ戦場の仲間を隣どうしに。列の入れ替えは少しずつ動く
  function layoutLanes(snap = false) {
    const order = laneOrder(lanes.map((l) => l.id), arenas);
    order.forEach((id, row) => {
      const l = lanes.find((x) => x.id === id);
      if (!l) return;
      l.row = row;
      l.toY = TOP + row * LH;
      if (snap || calm) l.y = l.toY;
    });
  }

  function placeCommands() {
    const k = scale;
    const hr = host.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    cmdLayer.style.left = `${cr.left - hr.left + host.scrollLeft}px`;
    cmdLayer.style.top = `${cr.top - hr.top + host.scrollTop}px`;
    cmdLayer.style.width = `${cr.width}px`;
    cmdLayer.style.height = `${cr.height}px`;
    for (const l of lanes) {
      if (!l.button) continue;
      l.button.style.top = `${(l.y + LH - 8) * k - 34}px`;
      let right = l.button.offsetWidth + 14;
      for (const b of l.subs ?? []) {
        b.style.top = l.button.style.top;
        b.style.right = `${right}px`;
        right += b.offsetWidth + 4;
      }
    }
  }

  const CMD_KEY = { sortie: 'march.cmd.sortie', resortie: 'march.cmd.resortie', hand: 'march.cmd.hand', step: 'march.cmd.step', check: 'march.cmd.check', stamp: 'march.cmd.stamp', battle: 'march.cmd.battle', watch: 'march.cmd.watch' };
  function syncCommands() {
    const next = nextCommand(lanes);
    window.__masume.marchNext = next;
    for (const l of lanes) {
      const cmd = l.cmd;
      if (!cmd) {
        l.button?.remove();
        l.button = null;
        for (const x of l.subs ?? []) x.remove();
        l.subs = [];
        continue;
      }
      if (!l.button) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'march-cmd';
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          if (l.cmd) onCommand(l.id, l.cmd, l.button);
        });
        cmdLayer.append(b);
        l.button = b;
      }
      // 起動のかわりに、自分の手で進めることもできる
      const tools = toolsOf(l.c, view, l.status, cmd);
      if ((l.subs ?? []).map((x) => x.dataset.kind).join() !== tools.join()) {
        for (const x of l.subs ?? []) x.remove();
        l.subs = tools.map((kind) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'march-cmd sub';
          b.dataset.kind = kind;
          b.addEventListener('click', (e) => {
            e.stopPropagation();
            onCommand(l.id, { kind, node: l.cmd?.node }, b);
          });
          cmdLayer.append(b);
          return b;
        });
      }
      for (const b of l.subs ?? []) {
        b.textContent = t(CMD_KEY[b.dataset.kind]);
        b.dataset.char = l.id;
        // 判定はいちかばちか: 通った数を見せ、全部通っていれば光らせ、残っていれば危ない色にする
        if (b.dataset.kind === 'check') {
          const cases = own(view.nodes, l.c.at)?.cases;
          if (Array.isArray(cases) && cases.length) {
            const pass = cases.filter((k) => k?.ok === true).length;
            b.textContent = `${t(CMD_KEY.check)} ${pass}/${cases.length}`;
            b.dataset.ready = String(pass === cases.length);
          }
        }
        b.setAttribute('aria-label', `${l.c.name}: ${t(CMD_KEY[b.dataset.kind])}`);
      }
      l.button.textContent = t(CMD_KEY[cmd.kind]);
      l.button.dataset.kind = cmd.kind;
      l.button.dataset.char = l.id;
      l.button.dataset.next = String(l.id === next);
      l.button.setAttribute('aria-label', `${l.c.name}: ${t(CMD_KEY[cmd.kind])}`);
    }
    placeCommands();
  }

  const text = (str, x, y, color = '#ffffff', shadow = '#10101c', scale = 1) => {
    const c = textCanvas(str, color, shadow);
    ctx.drawImage(c, Math.round(x), Math.round(y), c.width * scale, c.height * scale);
    return c.width * scale;
  };
  const textW = (str) => textCanvas(str, '#ffffff', null).width;
  // 窓: 濃紺、縁は 3 段（白 → 薄い青灰 → 灰青）、角は丸い（ドカポン4の窓の作り）
  const WIN_EDGE = ['#e8ecf4', '#a8b4cc', '#6a7898'];
  function win(px, py, w, h) {
    px = Math.round(px); py = Math.round(py); w = Math.round(w); h = Math.round(h);
    const k = h >= 22 ? 3 : 2;
    ctx.fillStyle = '#0c1050';
    ctx.fillRect(px + 2, py + 2, w - 4, h - 4);
    for (let q = 0; q < k; q++) {
      ctx.fillStyle = WIN_EDGE[q + (3 - k)];
      ctx.fillRect(px + 2 + q, py + q, w - 4 - 2 * q, 1);
      ctx.fillRect(px + 2 + q, py + h - 1 - q, w - 4 - 2 * q, 1);
      ctx.fillRect(px + q, py + 2 + q, 1, h - 4 - 2 * q);
      ctx.fillRect(px + w - 1 - q, py + 2 + q, 1, h - 4 - 2 * q);
      ctx.fillRect(px + 1 + q, py + 1 + q, 1, 1);
      ctx.fillRect(px + w - 2 - q, py + 1 + q, 1, 1);
      ctx.fillRect(px + 1 + q, py + h - 2 - q, 1, 1);
      ctx.fillRect(px + w - 2 - q, py + h - 2 - q, 1, 1);
    }
  }

  function burst(x, y, cols, n = 12, sp = 2) {
    if (calm) return;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2;
      parts.push({ x, y, vx: Math.cos(a) * sp * (0.4 + R()), vy: Math.sin(a) * sp * (0.4 + R()) - 0.5, g: 0.07, life: 16 + R() * 14, s: R() > 0.6 ? 2 : 1, c: cols[Math.floor(R() * cols.length)] });
    }
  }
  // 倒すとシール袋が落ちて、上の帯へ飛んでいく（本物のシール袋は手帳に入る）
  function dropBag(x, y) {
    if (calm) return;
    parts.push({ bag: true, x, y, tx: W - spare - 18, ty: 10, t: 0, dur: 46 });
  }
  const float = (x, y, str, color, life = 46) => parts.push({ x, y, vx: 0, vy: calm ? 0 : -0.45, g: calm ? 0 : 0.008, life, text: str, c: color });

  // 職業ごとの攻撃。戻り値は当たるまでのコマ数
  const ATTACK = {
    hero(ex, gy) {
      parts.push({ arc: true, x: heroX() + 8, y: gy - 16, r: 24, life: 9, life0: 9, c: '#ffffff', c2: '#ffd84a' });
      return 0;
    },
    sage(ex, gy) {
      parts.push({ shot: 'star', x: heroX() + 22, y: gy - 22, tx: ex, ty: gy - 10, t: 0, dur: 14, c: '#9ee8ff' });
      return 14;
    },
    scribe(ex, gy) {
      for (let k = 0; k < 4; k++) parts.push({ shot: 'ink', x: heroX() + 22, y: gy - 16, tx: ex + R() * 10 - 5, ty: gy - 8 - R() * 10, t: -k * 2, dur: 11, c: '#30304c' });
      return 13;
    },
    herald(ex, gy) {
      parts.push({ shot: 'letter', x: heroX() + 22, y: gy - 16, tx: ex, ty: gy - 10, t: 0, dur: 16, c: '#fff8e8' });
      return 16;
    },
    cartographer(ex, gy) {
      parts.push({ cross: true, x: ex, y: gy - 12, life: 26, life0: 26 });
      return 4;
    },
    painter(ex, gy) {
      for (const c of ['#ff4a7c', '#ffd84a', '#3ac8ff']) parts.push({ shot: 'paint', x: heroX() + 22, y: gy - 18, tx: ex + R() * 12 - 6, ty: gy - 6 - R() * 14, t: -R() * 5, dur: 12, c });
      return 13;
    },
  };
  ATTACK.mage = ATTACK.sage;
  ATTACK.priest = ATTACK.painter;
  ATTACK.warrior = ATTACK.hero;
  ATTACK.merchant = ATTACK.cartographer;
  ATTACK.villager = ATTACK.herald;

  // ビューに敵を合わせる。通ったテストの敵は倒れ、戻ったテストの敵は右から来る
  function syncFoes(l, c, status, animate) {
    const want = foesOf(c, view, status);
    const keep = [];
    const gy = l.y + LH - 8;
    for (const foe of l.foes) {
      if (want.some((w) => w.key === foe.key)) keep.push(foe);
      else if (animate && foe.key.startsWith(`${c.at}:`)) {
        burst(foe.x + 8, gy - 12, ['#ffffff', '#ffd84a', '#ff9a3c'], 16, 2.4);
        if (!calm) parts.push({ corpse: mobOf(foe.kind, foe.tint, foe.strong)[4], x: foe.x, y: gy - 18, vx: 2.4, vy: -3.2, g: 0.2, rot: 0, life: 34 });
        float(foe.x, gy - 22, t('march.slain'), '#ffd84a', 30);
        l.atk = l.atk > 0 ? l.atk : 16;
        hitStop = Math.max(hitStop, calm ? 0 : 3);
      }
    }
    const kinds = own(ENEMIES, c.job) ?? ENEMIES.sage;
    want.forEach((w, i) => {
      const old = keep.find((f) => f.key === w.key);
      if (old) {
        old.name = w.name;
        old.order = i;
        return;
      }
      const n = i + l.i;
      keep.push({ key: w.key, name: w.name, order: i, x: animate ? W + 30 + i * 34 : contact() + i * 34, kind: w.strong && !mobHasArt(kinds[n % kinds.length]) ? 'imp' : kinds[n % kinds.length], tint: w.strong && !mobHasArt(kinds[n % kinds.length]) ? 'red' : TINTS[l.i % TINTS.length], strong: !!w.strong, hit: 0, ph: R() * 6 });
    });
    keep.sort((a, b) => a.order - b.order);
    l.foes = keep;
  }

  function drawActor(l, st, gy) {
    const hx = l.hx ?? heroX();
    let pose = 'idle0';
    let dx = 0;
    let dy = 0;
    const down = st === 'down';
    if (l.hurt > 0) {
      pose = 'hurt';
      dx = -Math.min(10, l.hurt * 0.4) + (l.hurt % 4 < 2 ? 1 : -1);
      l.hurt--;
    } else if (down) {
      pose = 'hurt';
    } else if (l.atk > 0) {
      pose = l.atk > 16 ? 'wind' : l.atk > 8 ? 'strike' : 'follow';
      dx = l.atk > 16 ? -2 : l.atk > 8 ? 6 : 3;
    } else if (l.cheer > 0 || st === 'done') {
      const j = calm ? 0 : Math.floor(tick / 12 + l.i) % 2;
      pose = j ? 'cheer1' : 'cheer0';
      dy = j ? -Math.round(Math.abs(Math.sin((tick / 12) * Math.PI)) * 7) : 0;
    } else if (st === 'waiting' || st === 'camp') {
      pose = Math.floor(tick / 40) % 5 === 4 ? 'sit1' : 'sit0';
    } else if (l.speed > 0.3) {
      pose = l.art ? `run${Math.floor(tick / 5 + l.i) % 6}` : `run${Math.floor(tick / 5 + l.i) % 4}`;
    } else {
      pose = Math.floor(tick / 150 + l.i) % 7 === 3 && tick % 150 < 8 ? 'blink' : Math.floor(tick / 26 + l.i) % 2 ? 'idle1' : 'idle0';
    }
    ctx.fillStyle = 'rgba(20,18,8,.55)';
    ctx.fillRect(hx - 5 + dx, gy, 11, 1);
    ctx.fillRect(hx - 8 + dx, gy + 1, 17, 1);
    ctx.fillRect(hx - 6 + dx, gy + 2, 13, 1);
    const sp = l.set[pose];
    if (down && l.hurt <= 0 && l.art) {
      ctx.drawImage(l.set.down, hx - CENTER, gy - FOOT);
      return;
    }
    if (down && l.hurt <= 0) {
      ctx.save();
      ctx.translate(hx + 20, gy - 10);
      ctx.rotate(-Math.PI / 2);
      ctx.drawImage(sp, -CENTER, -FOOT);
      ctx.restore();
      for (let k = 0; k < 3; k++) {
        const a = tick * 0.08 + (k * Math.PI * 2) / 3;
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(Math.round(hx - 22 + Math.cos(a) * 9), Math.round(gy - 13 + Math.sin(a) * 3), 2, 2);
      }
      return;
    }
    if (l.leap > 0) {
      // 放物線で1回跳ぶ
      dy -= Math.round(Math.sin(((36 - l.leap) / 36) * Math.PI) * Math.min(10, Math.max(0, LH - 40)));
      l.leap--;
    }
    ctx.drawImage(sp, hx - CENTER + dx, gy - FOOT + dy);
  }

  const VILLAGER = { job: 'villager', color: 'gray' };
  let village = null;
  const idles = new Map();
  const idleOf = (c) => {
    const key = `${c.job}/${c.color}`;
    if (!idles.has(key)) idles.set(key, toCanvas(compose(c.job, POSES.idle0, c.color)));
    return idles.get(key);
  };
  function drawChest(x, gy, open) {
    const y0 = gy - 12;
    ctx.fillStyle = '#10101c';
    ctx.fillRect(x - 1, y0 - 1, 20, 15);
    ctx.fillStyle = '#a8602c';
    ctx.fillRect(x, y0 + 5, 18, 8);
    ctx.fillStyle = '#d88c3c';
    ctx.fillRect(x + 1, y0 + 5, 16, 2);
    if (open) {
      ctx.fillStyle = '#10101c';
      ctx.fillRect(x - 1, y0 - 7, 20, 7);
      ctx.fillStyle = '#7c4420';
      ctx.fillRect(x, y0 - 6, 18, 5);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(x + 2, y0 + 2, 14, 3);
    } else {
      ctx.fillStyle = '#d88c3c';
      ctx.fillRect(x, y0, 18, 5);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(x + 8, y0 + 3, 3, 5);
    }
  }

  function d20(x, y, spin, ok) {
    const rows = [[8, 8], [5, 14], [3, 18], [1, 22], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [0, 24], [1, 22], [3, 18], [5, 14], [8, 8]];
    const wob = spin && !calm ? Math.round(Math.sin(tick * 0.8) * 2) : 0;
    rows.forEach(([l0, w], j) => {
      ctx.fillStyle = '#10101c';
      ctx.fillRect(x + l0 + wob - 1, y + j + 1, w + 2, 1);
      ctx.fillStyle = spin ? '#f4f4f4' : ok ? '#ffe27a' : '#ff9a8a';
      ctx.fillRect(x + l0 + wob, y + j + 1, w, 1);
    });
    ctx.fillStyle = spin ? '#c8c8d8' : ok ? '#d8a020' : '#c84a3a';
    ctx.fillRect(x + wob + 2, y + 12, 20, 1);
  }

  function drawLane(l) {
    const c = l.c;
    const y = Math.round(l.y);
    const st = l.rest && l.rest.t >= 50 ? 'camp' : l.status;
    const node = own(view.nodes, c.at);
    const art = artSceneFor(l);
    const scene = art ? null : sceneFor(l.i);
    const band = arenaOf(l);
    const hx = band ? heroX() + 14 + band.members.indexOf(l.id) * 16 : heroX();
    l.hx = hx;
    // 合流した戦場では、全員が戦場の下の地面に立つ（奥ほど少し上、手前ほど下）
    let gy = y + (art ? art.ground : LH - 8);
    let clipY = y;
    let clipH = LH;
    if (band) {
      const rows = band.members.map((id) => lanes.find((x) => x.id === id)).filter(Boolean);
      const y0 = Math.min(...rows.map((r) => Math.round(r.y)));
      const idx = band.members.indexOf(l.id);
      gy = y0 + rows.length * LH - 10 - (rows.length - 1 - idx) * 5;
      clipY = y0;
      clipH = rows.length * LH;
    }
    const resting = !!l.rest || !!l.talk || !!l.inherit;
    const front = resting || band ? null : l.foes[0];
    const line = contact();
    const running = !calm && !band && (l.travel > 0 || (l.rest && l.rest.t < 50) || (!resting && st !== 'down' && front && front.x > line + 2));
    if (l.travel > 0) l.travel--;
    l.speed += ((hitStop > 0 ? 0 : running ? 1.5 : 0) - l.speed) * 0.1;
    l.scroll = (l.scroll + l.speed) % LW;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipY, W, clipH);
    ctx.clip();
    if (l.shake > 0) ctx.translate(l.shake-- % 2 ? 2 : -2, 0);
    if (!band && art) {
      for (const L of art.layers) drawLayer(L, y, l.scroll);
    } else if (!band) {
      ctx.drawImage(scene.sky, 0, y);
      const layerAt = (img, k) => {
        const sx = Math.round(l.scroll * k) % LW;
        ctx.drawImage(img, -sx, y);
        ctx.drawImage(img, LW - sx, y);
      };
      layerAt(scene.far, 0.12);
      layerAt(scene.mid, 0.4);
      layerAt(scene.ground, 1);
    }
    if (!calm && !band) {
      const air = art ? null : SCENES[l.i % SCENES.length].air;
      if (air) while (l.air.length < air.n) l.air.push({ x: R() * W, y: R() * LH, s: R() > 0.7 ? 2 : 1, c: air.c[Math.floor(R() * air.c.length)], p: R() * 6 });
      if (air) for (const a of l.air) {
        a.x += air.vx - l.speed * 0.6 + Math.sin(tick * 0.03 + a.p) * 0.2;
        a.y += air.vy;
        if (a.x < PLATE) a.x = W;
        if (a.x > W) a.x = PLATE;
        if (a.y > LH - 8) a.y = 0;
        if (a.y < 0) a.y = LH - 8;
        ctx.fillStyle = a.c;
        ctx.fillRect(Math.round(a.x), y + Math.round(a.y), a.s, a.s);
      }
    }
    // 村（通り過ぎるときに立ち寄る。町のマスにいるあいだは、そこにある）
    if (!band && (resting || l.status === 'camp')) {
      const t0 = l.rest ? l.rest.t : 999;
      const vx = Math.max(hx + 44, W + 40 - t0 * 4);
      // 村: 描き直した家と井戸（足もとの線にそろえる）
      village ??= { barn: toCanvas(paint(ENV.barn, 'base')), well: toCanvas(paint(ENV.well, 'base')), cottage: toCanvas(paint(ENV.cottage, 'base')) };
      ctx.drawImage(village.barn, vx, gy + 5 - village.barn.height);
      ctx.drawImage(village.well, vx + 64, gy + 6 - village.well.height);
      ctx.drawImage(village.cottage, vx + 92, gy + 4 - village.cottage.height);
      if (!calm && tick % 14 === 0) parts.push({ x: vx + 90, y: gy - 26, vx: -0.15, vy: -0.25, g: 0, life: 40, s: 2, c: '#c8c4dc' });
      if (l.rest) {
        l.rest.t++;
        if (l.rest.t >= 50) {
          // 休む: 癒やしの粒と、セーブの知らせ
          if (!calm && tick % 7 === 0) parts.push({ x: hx - 12 + R() * 24, y: gy - 4, vx: 0, vy: -0.5, g: 0, life: 34, s: 1, c: l.rest.kind === 'inn' ? '#a4e464' : '#9ee8ff' });
          if (!calm && tick % 50 === 0 && l.rest.kind === 'inn') float(hx + 18, gy - 16, 'Zzz', '#ffffff', 22);
        }
        if (l.rest.t >= (calm ? 90 : REST_LEN)) {
          l.rest = null;
          l.foes.forEach((f, n) => { f.x = W + 30 + n * 34; });
        }
      }
    }
    // 門番（まだ1人のとき。2人そろうと戦場にまとまる）
    if (band) {
      l.boss = 0;
    } else if (st === 'waiting' && node?.type === 'gate') {
      l.boss = Math.min(1, l.boss + 0.03);
      l.bossKind = node.id === view.quest?.goal ? 'demon' : 'golem';
    } else if (l.bossDead <= 0) l.boss = Math.max(0, l.boss - 0.08);
    if (l.boss > 0 || l.bossDead > 0) {
      golem ??= toCanvas(boss('golem'));
      demon ??= toCanvas(boss('demon'));
      const img = l.bossKind === 'demon' ? demon : golem;
      const bx = W - 86 + Math.round((1 - l.boss) * 60);
      const sway = l.bossKind === 'demon' && !calm ? Math.round(Math.sin(tick * 0.04) * 2) : 0;
      if (l.bossDead > 0) {
        l.bossDead--;
        if (l.bossDead % 3 === 0) burst(bx + R() * img.width, gy - R() * img.height, ['#ffffff', '#ffd84a', '#ff6a2c'], 5, 2.4);
        if (l.bossDead % 6 !== 0) ctx.drawImage(img, bx, gy - img.height + 2);
        if (l.bossDead === 0) l.boss = 0;
      } else {
        ctx.drawImage(img, bx, gy - img.height + 2 + sway);
        // 門番の体力 = その門のテスト
        const cases = Array.isArray(node?.cases) ? node.cases : [];
        cases.forEach((k, i) => {
          ctx.fillStyle = '#10101c';
          ctx.fillRect(bx + i * 7 - 1, gy - img.height - 4, 7, 6);
          ctx.fillStyle = k?.ok === true ? '#3c3858' : '#ff5a5a';
          ctx.fillRect(bx + i * 7, gy - img.height - 3, 5, 4);
        });
      }
    }
    // 門の前: だれを待っているか
    if (!band && !l.rest && !l.talk && st === 'waiting' && node?.type === 'gate' && node.state !== 'ready') {
      const missing = (node.members ?? []).filter((id) => id !== c.id && view.characters.find((x) => x.id === id)?.at !== node.id).length;
      if (missing) {
        const waitWord = t('march.wait', missing);
        win(contact() + 2, y + 20, textW(waitWord) + 10, 20);
        text(waitWord, contact() + 7, y + 22, '#9ee8ff', null);
      }
    }
    // 焚き火（門の前と町）
    if ((st === 'waiting' && !(band && band.ready)) || st === 'camp') {
      const fx = hx + 24;
      ctx.fillStyle = '#6c4428';
      ctx.fillRect(fx - 4, gy, 9, 2);
      const f = calm ? 1 : Math.floor(tick / 5) % 3;
      ctx.fillStyle = '#ff6a2c';
      ctx.fillRect(fx - 2, gy - 5, 5, 5);
      ctx.fillRect(fx - 1 + (f - 1), gy - 8, 3, 3);
      ctx.fillStyle = '#ffd84a';
      ctx.fillRect(fx - 1, gy - 4, 3, 4);
      ctx.fillRect(fx + (f - 1), gy - 6, 1, 2);
      if (!calm && tick % 20 === 0) parts.push({ x: fx, y: gy - 9, vx: (R() - 0.5) * 0.3, vy: -0.4, g: 0, life: 22, s: 1, c: '#ffa040' });
    }
    // 敵（テスト）。休んでいるあいだは出てこない
    if (!resting && !band) l.foes.forEach((e, i) => {
      const want = line + i * 34;
      e.x += (want - e.x) * 0.04 - (l.speed > 0.2 ? 1 : 0);
      if (e.x < want || calm) e.x = want;
      const fly = flies(e.kind);
      const f = calm ? 0 : Math.floor((tick + e.ph * 9) / 14) % 4;
      const set = mobOf(e.kind, e.tint, e.strong);
      const img = e.hit > 0 ? set[4] : set[f];
      const hop = fly ? Math.round(calm ? -12 : Math.sin(tick * 0.07 + e.ph) * 3 - 12) : 0;
      const jit = e.hit > 0 ? (e.hit-- % 2 ? 2 : -2) : 0;
      if (!fly) {
        ctx.fillStyle = 'rgba(16,12,32,.3)';
        ctx.fillRect(Math.round(e.x) + 2, gy + 1, img.width - 4, 2);
      }
      if (e.hit > 0 && e.hit % 2) ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(img, Math.round(e.x + jit), gy - img.height + 2 + hop);
      ctx.globalCompositeOperation = 'source-over';
    });
    // 攻撃（出撃中だけ。動いていないのに戦っているようには見せない）
    if (!calm && st === 'working' && front && front.x <= line + 3 && l.atk <= 0 && l.hurt <= 0 && hitStop <= 0 && tick >= l.atkAt) {
      l.atk = 24;
      l.atkAt = tick + 62 + Math.floor(R() * 20);
    }
    if (l.atk > 0 && hitStop <= 0) {
      l.atk--;
      if (l.atk === 16 && front) l.pending = { t: (own(ATTACK, c.job) ?? ATTACK.hero)(front.x + 8, gy) };
    }
    if (l.pending && hitStop <= 0 && l.pending.t-- <= 0) {
      l.pending = null;
      if (front) {
        front.hit = 8;
        front.x += calm ? 0 : 6;
        burst(front.x + 8, gy - 10, ['#ffffff', '#ffd84a'], 6, 1.6);
        if (!l.judge) {
          const big = R() < 0.18;
          float(front.x + 2, gy - 24, String((big ? 40 : 8) + Math.floor(R() * 20)), big ? '#ffd84a' : '#ffffff', 34);
          if (big) hitStop = Math.max(hitStop, calm ? 0 : 4);
        }
        sound?.play('hit');
      }
    }
    if (l.talk && !l.rest && !band) {
      // 話し相手が向かい合う
      const other = l.talk.partner ?? VILLAGER;
      const img = idleOf(other);
      ctx.save();
      ctx.translate(hx + 40 + CENTER, gy - FOOT);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0);
      ctx.restore();
    }
    if (l.inherit) {
      // 先代の姿が薄れて、光が移る
      const q = Math.min(1, l.inherit.t / 90);
      ctx.globalAlpha = (1 - q) * 0.6;
      ctx.drawImage(l.set.idle0, hx - CENTER - 16 - q * 8, gy - FOOT - q * 8);
      ctx.globalAlpha = 1;
    }
    if (l.chest) {
      l.chest.t++;
      if (l.chest.t === 31) burst(hx + 44, gy - 12, ['#ffd84a', '#ffffff', '#ff9a3c'], 22, 2.4);
      drawChest(hx + 34, gy, l.chest.t > 30);
      if (l.chest.t > 170) l.chest = null;
    }
    if (!calm && l.speed > 0.8 && tick % 7 === 0) parts.push({ x: hx - 10, y: gy - 1, vx: -0.7 - R() * 0.5, vy: -0.25, g: 0, life: 14, s: 2, c: 'rgba(240,232,216,.7)' });
    drawActor(l, st, gy);
    if (!calm && l.rest?.kind === 'inn' && l.rest.t >= 50) {
      // 宿: 日が暮れて星が出て、朝の光で目を覚ます
      const n = l.rest.t;
      const dusk = n < 110 ? (n - 50) / 60 : n < 190 ? 1 : Math.max(0, 1 - (n - 190) / 20);
      ctx.fillStyle = `rgba(12,12,48,${0.68 * dusk})`;
      ctx.fillRect(PLATE, y, W - PLATE, LH);
      if (dusk > 0.5) {
        for (let k = 0; k < 14; k++) {
          const sx = PLATE + 20 + ((k * 73 + l.i * 31) % (W - PLATE - 40));
          const sy = y + 4 + ((k * 37) % Math.max(8, LH - 26));
          if ((tick + k * 9) % 40 < 30) {
            ctx.fillStyle = '#fff8d8';
            ctx.fillRect(sx, sy, 1, 1);
          }
        }
        ctx.fillStyle = '#ffe27a';
        ctx.fillRect(hx - 26, y + 6, 7, 7);
        ctx.fillStyle = `rgb(12,12,48)`;
        ctx.fillRect(hx - 23, y + 5, 5, 6);
      }
      if (n === 205) {
        l.flash = 14;
        l.flashC = '#fff4c0';
        l.cheer = 60;
        sound?.play('achieve');
      }
    }
    if (l.idea) {
      // 頭の上の電球
      l.idea.t++;
      const bx = Math.round(hx - 5);
      const by = gy - 54 + (calm ? 0 : Math.round(Math.sin(tick * 0.14)));
      ctx.fillStyle = '#10101c';
      ctx.fillRect(bx - 1, by - 2, 11, 10);
      ctx.fillRect(bx + 1, by + 8, 7, 4);
      ctx.fillStyle = '#ffe27a';
      ctx.fillRect(bx, by - 1, 9, 8);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(bx + 1, by, 3, 2);
      ctx.fillStyle = '#c8c4dc';
      ctx.fillRect(bx + 2, by + 8, 5, 3);
      if (!calm && tick % 6 === 0) parts.push({ x: bx + 4, y: by + 2, vx: (R() - 0.5) * 2, vy: (R() - 0.5) * 2, g: 0, life: 18, s: 1, c: '#ffe27a' });
    }
    if (l.cheer > 0) l.cheer--;
    ctx.restore();
    if (l.flash > 0) {
      ctx.fillStyle = l.flashC;
      ctx.globalAlpha = l.flash / 16;
      ctx.fillRect(PLATE, y, W - PLATE, LH);
      ctx.globalAlpha = 1;
      l.flash--;
    }
    // 判定: ダイス → 出目 → 結果（開発のことばでは結果だけ）。戦場に入ったら門番を隠さない
    if (l.judge && band) l.judge = null;
    if (l.judge) {
      const j = l.judge;
      j.t++;
      const spin = !calm && j.t < 26;
      const roll = String(spin ? 1 + Math.floor(R() * 20) : j.n);
      d20(hx + 26, y + 4, spin, j.ok);
      text(roll, hx + 38 - textW(roll) / 2, y + 7, '#10101c', null);
      if (!spin) {
        const slide = calm ? 1 : Math.min(1, (j.t - 26) / 8);
        const col = j.ok ? '#ffd84a' : '#ff7a5a';
        const word = t(j.ok ? (j.medal ? 'march.medal' : 'march.ok') : 'march.ng');
        const bw = textW(word) * 2 + 48;
        const bx = W - bw * slide;
        win(bx, y + 6, bw, Math.min(40, LH - 12));
        ctx.drawImage(l.busts[j.ok ? 'happy' : 'hurt'], bx + 4, y + 8);
        text(word, bx + 40, y + 14, col, null);
      }
      if (j.t > 90) l.judge = null;
    }
    // 出来事の字（記録に起きたことだけ）
    let event = null;
    const note = (str, color) => { event = { str, color }; };
    if (l.rest?.kind === 'inn' && l.rest.t >= 205) {
      note(t('march.inn.morning'), '#ffe27a');
    } else if (l.rest && l.rest.t >= 50) {
      note(t(l.rest.kind === 'inn' ? 'march.inn' : 'march.back', l.rest.name), l.rest.kind === 'inn' ? '#a4e464' : '#ff9a8a');
    } else if (l.talk && !l.rest) {
      const k = l.talk;
      k.t++;
      const line = k.lines[k.i];
      if (line) note(`${line.who ? `${line.who}: ` : ''}${line.text}`, '#ffffff');
      if (!line || k.t > (calm ? 90 : 170)) {
        k.t = 0;
        k.i++;
        if (k.i >= k.lines.length) {
          l.talk = null;
          l.travel = 30;
        }
      }
    } else if (l.inherit) {
      l.inherit.t++;
      note(t('march.inherit', l.inherit.gen), '#ffd84a');
      if (l.inherit.t > 150) l.inherit = null;
    } else if (l.idea) {
      note(`${t('march.idea')} ${l.idea.text}`, '#ffe27a');
      if (l.idea.t > 240) l.idea = null;
    } else if (l.chest && l.chest.t > 34) {
      note(t('march.chest'), '#ffd84a');
    } else if (l.trap) {
      l.trap.t++;
      note(t('march.trap'), '#ff9a8a');
      if (l.trap.t > 170) l.trap = null;
    } else if (l.say) {
      l.say.t++;
      note(l.say.text, '#ffffff');
      if (l.say.t > 170) l.say = null;
    }
    // 札（顔・名前・様子）
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, y, PLATE, LH);
    win(1, y + 1, PLATE - 2, LH - 2);
    const bh = Math.min(BUST.h, LH - 12);
    let expr = 'normal';
    if (st === 'down' || l.hurt > 0) expr = 'hurt';
    else if (st === 'done' || l.cheer > 0) expr = 'happy';
    else if (l.atk > 0) expr = 'fierce';
    else if ((tick + l.i * 37) % 170 < 7) expr = 'blink';
    ctx.save();
    ctx.beginPath();
    ctx.rect(6, y + 5, BUST.w, bh);
    ctx.clip();
    ctx.drawImage(l.busts[expr], 6, y + 5 + bh - BUST.h);
    ctx.restore();
    text(fit1(String(c.name ?? c.id).replace('（あなた）', ''), 6), 40, y + 5, '#f0f0f0', null);
    text(t(`march.${st}`), 40, y + 22, STATUS_COLOR[st], null);
    if (LH >= 54) {
      // レベルと次のレベルまで（本物の level / xp）
      const lv = `Lv${c.level ?? 1}`;
      const lw2 = text(lv, 40, y + 37, '#f0d878', null);
      const gx = 40 + lw2 + 4;
      const gw = PLATE - gx - 8;
      const rate = c.xp_next ? Math.min(1, (c.xp ?? 0) / c.xp_next) : 0;
      ctx.fillStyle = '#2a2f6a';
      ctx.fillRect(gx, y + 46, gw, 3);
      ctx.fillStyle = l.xpFlash > 0 ? '#ffffff' : '#f0d878';
      ctx.fillRect(gx, y + 46, Math.round(gw * rate), 3);
      if (l.xpFlash > 0) l.xpFlash--;
    }
    // 道のり: ふりだしからあがりまでの点（門は大きく、いまの場所は光る）
    const route = routeOf(c, view);
    if (route.length && !band) {
      const rx0 = PLATE + 8;
      const rw = Math.min(W - PLATE - 96, route.length * 18);
      const ry = y + LH - 5;
      const xOf = (i) => rx0 + (route.length > 1 ? Math.round((i * rw) / (route.length - 1)) : 0);
      // すごろくの道（窓と同じ色で、控えめに）
      ctx.fillStyle = '#0c1050';
      ctx.fillRect(rx0, ry, rw, 1);
      const here = route.findIndex((p) => p.here);
      if (here > 0) {
        ctx.fillStyle = '#c8a850';
        ctx.fillRect(rx0, ry, xOf(here) - rx0, 1);
      }
      route.forEach((p, i) => {
        const px = xOf(i);
        const lit = p.here && (tick % 30 < 15 || calm);
        ctx.fillStyle = '#0c1050';
        if (p.camp) {
          // 町: 小さな家
          ctx.fillRect(px - 3, ry - 3, 7, 5);
          ctx.fillRect(px - 1, ry - 4, 3, 1);
          ctx.fillStyle = p.done ? '#c8a850' : '#a8a08a';
          ctx.fillRect(px - 2, ry - 2, 5, 3);
          ctx.fillStyle = '#7a3a24';
          ctx.fillRect(px - 2, ry - 3, 5, 1);
        } else if (p.gate) {
          // 門
          ctx.fillRect(px - 3, ry - 5, 7, 7);
          ctx.fillStyle = lit ? '#f0f0f0' : p.done ? '#c8a850' : '#8a2c24';
          ctx.fillRect(px - 2, ry - 4, 5, 5);
          ctx.fillStyle = '#0c1050';
          ctx.fillRect(px, ry - 4, 1, 5);
        } else {
          ctx.fillRect(px - 2, ry - 2, 5, 5);
          ctx.fillStyle = lit ? '#f0f0f0' : p.here || p.done ? '#c8a850' : '#6a7898';
          ctx.fillRect(px - 1, ry - 1, 3, 3);
        }
      });
    }
    // マスの名前とテストの数
    const pass = Array.isArray(node?.cases) ? node.cases.filter((k) => k?.ok === true).length : 0;
    const total = Array.isArray(node?.cases) ? node.cases.length : 0;
    const title = node && !band ? `${node.id} ${node.title ?? ''}` : '';
    const shown = event ? '' : fit1(title, Math.floor((W - PLATE - 120) / 26));
    const tw = shown ? textW(shown) : 0;
    const pw = Math.min(total, 10) * 6;
    if (shown) {
      win(W - tw - pw - 16, y, tw + pw + 16, 20);
      text(shown, W - tw - pw - 9, y + 2, '#f0f0f0', null);
      for (let k = 0; k < Math.min(total, 10); k++) {
        ctx.fillStyle = k < pass ? '#f0d878' : '#3a3f7a';
        ctx.fillRect(W - pw - 5 + k * 6, y + 7, 4, 6);
      }
    }
    // いま戦っているテストの名前（敵の絵に重ねない。上の段の、マスの名前の左）
    if (event && !band) {
      // 出来事の字は上の段に1行だけ（テストの名前もマスの名前も、そのあいだは出さない）
      const line2 = fit1(event.str, Math.floor((W - contact() - pw - 12) / 15));
      win(contact() - 6, y, textW(line2) + 12, 20);
      text(line2, contact(), y + 2, event.color, null);
    } else if (front && !l.judge) {
      const room2 = W - tw - pw - 14 - line - 8;
      const n = Math.floor(room2 / 14);
      if (n >= 4) {
        const name = fit1(front.name, n);
        win(line - 6, y, textW(name) + 12, 20);
        text(name, line, y + 2, '#f0f0f0', null);
      }
    }
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, y + LH - 1, band ? PLATE : W, 1);
  }

  const arenaOf = (l) => arenas.find((a) => a.members.includes(l.id)) ?? null;

  // 戦場: レーンの境目が消え、全員で1体の中ボスに向かう（§80.11）
  function drawArena(a) {
    const rows = a.members.map((id) => lanes.find((x) => x.id === id)).filter(Boolean);
    if (!rows.length) return;
    if (a.cine && a.dying === undefined) stepBattle(a);
    const y0 = Math.min(...rows.map((l) => Math.round(l.y)));
    const h = rows.length * LH;
    const node = own(view.nodes, a.gate);
    const goal = a.gate === view.quest?.goal;
    ctx.save();
    ctx.beginPath();
    ctx.rect(PLATE, y0, W - PLATE, h);
    ctx.clip();
    ctx.drawImage(arenaScene(goal, h), 0, y0);
    golem ??= toCanvas(boss('golem'));
    demon ??= toCanvas(boss('demon'));
    const img = goal ? demon : golem;
    const s = 1; // 描き直した門番・魔王は等倍の大きさで描いてある（拡大しない）
    const bw = img.width * s;
    const bh = img.height * s;
    const bx = W - bw - 30;
    const by = y0 + h - bh - 10 + (calm || a.dying ? 0 : Math.round(Math.sin(tick * 0.05) * 2));
    a.bossBox = { x: bx, y: by, w: bw, h: bh };
    // 床の影
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(bx + 6, y0 + h - 12, bw - 12, 4);
    const struck = a.cine?.flash > 0 || a.poke > 0;
    if (a.cine?.flash > 0) a.cine.flash--;
    if (a.poke > 0) a.poke--;
    if (a.dying) {
      a.dying--;
      if (a.dying % 2 === 0) burst(bx + R() * bw, by + R() * bh, ['#ffffff', '#ffd84a', '#ff6a2c', '#ff5a7c'], 7, 3);
      if (a.dying % 6 !== 0) {
        ctx.globalAlpha = Math.min(1, a.dying / 40 + 0.2);
        ctx.drawImage(img, bx + (a.dying % 4 < 2 ? 2 : -2), by, bw, bh);
        ctx.globalAlpha = 1;
      }
    } else if (a.dying === 0) {
      // 片づくところ
    } else {
      ctx.drawImage(img, bx + (struck ? 3 : 0), by, bw, bh);
      if (struck) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(img, bx + 3, by, bw, bh);
        ctx.globalCompositeOperation = 'source-over';
        burst(bx + 10, by + bh / 2, ['#ffffff', '#ffd84a'], 8, 2);
      }
    }
    // 体力（門のテスト）
    const cases = Array.isArray(node?.cases) ? node.cases : [];
    const cw = Math.max(5, Math.min(14, Math.floor((bw - 4) / Math.max(1, cases.length))));
    cases.forEach((k, i) => {
      ctx.fillStyle = '#10101c';
      ctx.fillRect(bx + i * cw - 1, by - 8, cw, 7);
      const gone = a.cine ? i < a.cine.hits && i < Math.max(cases.length - (a.cine.ok ? 0 : 1), 0) : k?.ok === true;
      ctx.fillStyle = gone || a.dying ? '#3c3858' : '#ff5a5a';
      ctx.fillRect(bx + i * cw, by - 7, cw - 2, 5);
    });
    // 名前と、次にどうなるか
    const name = t(goal ? 'march.bossname.goal' : 'march.bossname.gate', a.gate, String(node?.title ?? '').replace(/^(結合|あがり): /, ''));
    const shown = fit1(name, Math.floor((W - PLATE - 20) / 14));
    const tw = textW(shown);
    win(W - tw - 16, y0, tw + 16, 20);
    text(shown, W - tw - 9, y0 + 2, goal ? '#ff9a8a' : '#f0f0f0', null);
    if (!a.cine) {
      const missing = a.all.length - a.members.length;
      const msg = a.ready ? t('march.allset') : t('march.wait', missing);
      const blink = a.ready && !calm && tick % 40 < 10;
      if (!banner) text(msg, heroX() + 44 + a.members.length * 16, y0 + 20, blink ? '#ffffff' : a.ready ? '#ffd84a' : '#9ee8ff');
    }
    ctx.restore();
  }

  function drawParts() {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (p.arrow) {
        // push: 大きな矢印が、緑の尾を引いて上へ飛ぶ
        p.y += p.vy;
        p.life--;
        const ax = Math.round(p.x);
        const ay = Math.round(p.y);
        ctx.fillStyle = '#10101c';
        ctx.fillRect(ax - 7, ay + 5, 15, 4);
        ctx.fillRect(ax - 5, ay + 2, 11, 3);
        ctx.fillRect(ax - 3, ay - 1, 7, 3);
        ctx.fillRect(ax - 3, ay + 9, 7, 9);
        ctx.fillStyle = '#7ee8a8';
        ctx.fillRect(ax - 6, ay + 6, 13, 2);
        ctx.fillRect(ax - 4, ay + 4, 9, 2);
        ctx.fillRect(ax - 2, ay + 2, 5, 2);
        ctx.fillRect(ax - 2, ay + 8, 5, 9);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ax, ay + 2, 1, 14);
        if (p.life % 2 === 0) parts.push({ x: ax - 1 + R() * 3, y: ay + 18, vx: 0, vy: 0.4, g: 0, life: 12, s: 2, c: '#7ee8a8' });
        if (p.life <= 0) parts.splice(i, 1);
        continue;
      }
      if (p.corpse) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.g;
        p.rot += 0.35;
        p.life--;
        ctx.save();
        ctx.translate(Math.round(p.x) + p.corpse.width / 2, Math.round(p.y) + p.corpse.height / 2);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.min(1, p.life / 12);
        ctx.drawImage(p.corpse, -p.corpse.width / 2, -p.corpse.height / 2);
        ctx.restore();
        if (p.life <= 0) parts.splice(i, 1);
        continue;
      }
      if (p.shot) {
        p.t++;
        if (p.t < 0) continue;
        const f = p.t / p.dur;
        const qx = p.x + (p.tx - p.x) * f;
        const qy = p.y + (p.ty - p.y) * f - Math.sin(f * Math.PI) * (p.shot === 'star' ? 2 : 6);
        ctx.fillStyle = p.c;
        if (p.shot === 'star') {
          const a = Math.floor(p.t / 2) % 2;
          ctx.fillRect(qx - 3, qy, 7, 1);
          ctx.fillRect(qx, qy - 3, 1, 7);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(qx - 1 - a, qy - 1 + a, 3, 1);
          ctx.fillRect(qx, qy - 1, 1, 3);
          if (p.t % 2 === 0) parts.push({ x: qx, y: qy, vx: -0.3, vy: R() - 0.5, g: 0, life: 10, s: 1, c: '#9ee8ff' });
        } else if (p.shot === 'letter') {
          const flip = Math.floor(p.t / 3) % 2;
          ctx.fillRect(qx - 4, qy - 3 + flip, 9, 6 - flip * 2);
          ctx.fillStyle = '#c8342c';
          ctx.fillRect(qx - 1, qy, 2, 2 - flip);
        } else ctx.fillRect(qx - 1, qy - 1, 3, 3);
        if (p.t >= p.dur) {
          if (p.shot === 'paint') burst(p.tx, p.ty, [p.c, p.c, '#ffffff'], 8, 1.6);
          else if (p.shot === 'ink') burst(p.tx, p.ty, ['#30304c', '#5a5a8c'], 5, 1.3);
          else if (p.shot === 'letter') burst(p.tx, p.ty, ['#fff8e8', '#c8342c'], 8, 1.8);
          else burst(p.tx, p.ty, ['#9ee8ff', '#ffffff'], 10, 2);
          parts.splice(i, 1);
        }
        continue;
      }
      if (p.arc) {
        p.life--;
        const f = 1 - p.life / p.life0;
        for (let a = -1.3 + f * 1.3; a < -0.1 + f * 1.6; a += 0.05) {
          const qx = p.x + Math.cos(a) * p.r;
          const qy = p.y + Math.sin(a) * p.r;
          ctx.fillStyle = p.c2;
          ctx.fillRect(Math.round(qx) + 1, Math.round(qy), 2, 2);
          ctx.fillStyle = p.c;
          ctx.fillRect(Math.round(qx), Math.round(qy), 2, 2);
        }
        if (p.life <= 0) parts.splice(i, 1);
        continue;
      }
      if (p.bag) {
        p.t++;
        const f = p.t / p.dur;
        const e = f * f;
        const qx = p.x + (p.tx - p.x) * e;
        const qy = p.y + (p.ty - p.y) * e - Math.sin(f * Math.PI) * 18;
        ctx.fillStyle = '#10101c';
        ctx.fillRect(qx - 1, qy - 1, 9, 10);
        ctx.fillStyle = '#ff72b4';
        ctx.fillRect(qx, qy + 1, 7, 7);
        ctx.fillStyle = '#ffd84a';
        ctx.fillRect(qx + 1, qy, 5, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(qx + 2, qy + 3, 2, 2);
        if (p.t >= p.dur) {
          sound?.play('drop');
          parts.splice(i, 1);
        }
        continue;
      }
      if (p.cross) {
        p.life--;
        const s = Math.min(6, (p.life0 - p.life) * 2);
        for (let k = -s; k <= s; k++) {
          ctx.fillStyle = '#10101c';
          ctx.fillRect(p.x + k - 1, p.y + k - 1, 4, 4);
          ctx.fillRect(p.x + k - 1, p.y - k - 1, 4, 4);
        }
        for (let k = -s; k <= s; k++) {
          ctx.fillStyle = '#ff3c3c';
          ctx.fillRect(p.x + k, p.y + k, 2, 2);
          ctx.fillRect(p.x + k, p.y - k, 2, 2);
        }
        if (p.life <= 0) parts.splice(i, 1);
        continue;
      }
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.g ?? 0.08;
      p.life--;
      if (p.text) text(p.text, p.x, p.y, p.c);
      else {
        ctx.fillStyle = p.c;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
      }
      if (p.life <= 0) parts.splice(i, 1);
    }
  }

  function frame() {
    raf = on ? requestAnimationFrame(frame) : 0;
    if (!on || !view || !host.offsetParent) return;
    tick++;
    if (hitStop > 0) hitStop--;
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    if (shake > 0) {
      ctx.translate(shake % 2 ? 3 : -3, shake % 3 ? 1 : -1);
      shake--;
    }
    let moving = false;
    for (const l of lanes) {
      if (l.toY !== undefined && Math.abs(l.toY - l.y) > 0.5) {
        l.y += (l.toY - l.y) * 0.14;
        moving = true;
      } else if (l.toY !== undefined) l.y = l.toY;
    }
    if (moving) placeCommands();
    document.body.classList.toggle('march-battle', arenas.some((a) => a.cine));
    sound?.music?.(view.finished ? null : arenas.some((a) => a.cine || a.ready) ? 'boss' : 'march');
    // ボス戦の再生中は、戦場の上にボタンを出さない
    for (const l of lanes) {
      const off = !!arenaOf(l)?.cine;
      if (l.button) l.button.hidden = off;
      for (const b of l.subs ?? []) b.hidden = off;
    }
    arenas.forEach(drawArena);
    for (const l of lanes) drawLane(l);
    for (let i = arenas.length - 1; i >= 0; i--) {
      if (arenas[i].dying === 0) {
        arenas.splice(i, 1);
        arenas.push(...pendingArenas());
        layoutLanes();
        break;
      }
    }
    // 知らせは重ねず、順番に
    if (notices.length && tick >= noticeAt) {
      noticeNow = notices.shift();
      noticeAt = tick + 90;
    }
    if (noticeNow && tick >= noticeAt) noticeNow = null;
    drawParts();
    ctx.restore();
    // 上の帯: 冒険の名前と、テスト全体の進み
    const nodes = Object.values(view.nodes ?? {});
    let pass = 0;
    let total = 0;
    for (const n of nodes) if (Array.isArray(n?.cases)) {
      total += n.cases.length;
      pass += n.cases.filter((k) => k?.ok === true).length;
    }
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, W, TOP);
    win(0, 0, W, TOP);
    const tw = text(fit1(String(view.quest?.title ?? ''), 14), 9, 3, '#f0f0f0', null);
    const bx = 8 + tw + 12;
    // バーを短くしすぎないよう、入らなければ門までの字を省く
    const streakWord = streak >= 2 ? `　${t('march.streak', streak)}` : '';
    const wide = t('march.tests', pass, total) + (bossNote ? `　${bossNote}` : '') + streakWord;
    const label = W - spare - bx - textW(wide) - 16 >= 120 ? wide : t('march.tests', pass, total) + streakWord;
    const lw = textW(label);
    const bw = Math.max(0, W - spare - bx - lw - 16);
    ctx.fillStyle = '#10101c';
    ctx.fillRect(bx - 1, 7, bw + 2, 10);
    ctx.fillStyle = '#3c3858';
    ctx.fillRect(bx, 8, bw, 8);
    const fill = total ? Math.round((bw * pass) / total) : 0;
    ctx.fillStyle = '#ffb83c';
    ctx.fillRect(bx, 8, fill, 8);
    ctx.fillStyle = '#ffe27a';
    ctx.fillRect(bx, 8, fill, 3);
    text(label, W - spare - lw - 6, 3, '#ffe27a');
    if (noticeNow) {
      const nw = textW(noticeNow.str);
      // 上の帯の中に出す（レーンの字に重ねない）
      win(Math.round(W / 2 - nw / 2) - 10, 0, nw + 20, TOP);
      text(noticeNow.str, W / 2 - nw / 2, 3, noticeNow.c, null);
    }
    if (banner) {
      banner.t++;
      const a = calm ? 1 : Math.min(1, banner.t / 8);
      const by = banner.by ?? Math.round(H / 2 - 22);
      const x0 = banner.x0 ?? 0;
      const bw2 = (banner.x1 ?? W) - x0;
      const mid = x0 + bw2 / 2;
      // 知らせの窓（拡大した字は使わない。窓が中から開く）
      const tw2 = textW(banner.text);
      const ww = Math.round(Math.min(bw2, tw2 + 40) * a);
      if (ww > 12) win(Math.round(mid - ww / 2), by + 8, ww, 28);
      if (a >= 1) text(banner.text, mid - tw2 / 2, by + 13, '#f0d878', null);
      if (banner.sub) { const sw = textW(banner.sub); win(Math.round(W / 2 - sw / 2) - 10, by + 38, sw + 20, 22); text(banner.sub, W / 2 - sw / 2, by + 41, '#f0f0f0', null); }
      if (banner.t >= banner.life) banner = null;
    }
    if (confetti > 0) {
      confetti--;
      if (!calm && tick % 2 === 0) for (let k = 0; k < 3; k++) parts.push({ x: PLATE + R() * (W - PLATE), y: TOP - 4, vx: (R() - 0.5) * 0.7, vy: 0.5 + R() * 0.7, g: 0.008, life: 150, s: 2, c: ['#ffd84a', '#ff5a7c', '#5ac8ff', '#a4e464', '#ffffff'][Math.floor(R() * 5)] });
    }
  }

  function pendingArenas() {
    return view ? arenasOf(view).filter((a) => !arenas.some((x) => x.gate === a.gate)) : [];
  }

  /** 合流の組をビューに合わせる。新しく来た仲間には「合流！」を出す（倒れていく門番は最後まで見せる） */
  function syncArenas(animate) {
    const fresh = arenasOf(view);
    const keep = [];
    for (const a of fresh) {
      const old = arenas.find((x) => x.gate === a.gate);
      if (animate) {
        const joined = a.members.filter((id) => !old?.members.includes(id));
        // 組ができた瞬間は全員、あとから来た人はその人だけ
        const names = (old ? joined : a.members).map((id) => lanes.find((x) => x.id === id)?.c.name).filter(Boolean);
        if (names.length && !a.ready) {
          notices.push({ str: t('march.join', names.join('・').replace(/（あなた）/g, '')), c: '#ffd84a' });
          sound?.play('fanfare');
        }
        // 全員そろった瞬間に、門番が現れる
        if (a.ready && !old?.ready) {
          const top = Math.min(...a.members.map((id) => lanes.find((x) => x.id === id)?.toY ?? TOP));
          banner = { text: t(a.gate === view.quest?.goal ? 'march.bossin.goal' : 'march.bossin.gate'), t: 0, life: 110, x0: heroX() + 90, x1: W - 110, by: top + Math.round((a.members.length * LH) / 2) - 22 };
          shake = calm ? 0 : 12;
          sound?.play('down');
        }
      }
      keep.push(a);
    }
    for (const old of arenas) if ((old.cine || old.dying) && !keep.some((x) => x.gate === old.gate)) keep.push(old);
    arenas = keep;
    layoutLanes(!animate);
  }

  function showPush(who, ok, branch) {
    if (!who) return;
    who.say = { t: 0, text: ok ? t('march.push.ok', branch ?? '') : t('march.push.ng') };
    if (ok && !calm) for (let k = 0; k < 3; k++) parts.push({ arrow: true, x: heroX() + 40 + k * 90, y: who.y + LH - 14 + k * 8, vy: -1.6, life: 30 });
    sound?.play(ok ? 'kira' : 'down');
  }

  function play(e) {
    const l = lanes.find((x) => x.id === e.character);
    if (e.type === 'check_passed' && l) {
      l.judge = { t: 0, n: seqRoll(e), ok: true, medal: !!l.medal };
      l.medal = false;
      l.flash = calm ? 0 : 8;
      l.flashC = '#ffffff';
      l.cheer = 70;
    }
    if (e.type === 'check_failed' && l) {
      l.judge = { t: 0, n: seqRoll(e), ok: false };
      l.flash = calm ? 0 : 16;
      l.flashC = '#ff3c3c';
      l.hurt = 44;
      if (!calm) {
        l.shake = 12;
        shake = 10;
      }
      sound?.play('down');
    }
    if (e.type === 'gate_cleared' || e.type === 'gate_failed' || (e.type === 'check_failed' && !l && e.node)) {
      startBattle(e.node, e.type === 'gate_cleared');
    }
    if (e.type === 'seal_broken' && l) l.trap = { t: 0 };
    // 実況: エージェントの今を、記録された本当のことだけで吹き出しにする
    if (l && e.type === 'stepped') {
      const ratio = String(e.text ?? '').match(/\d+\/\d+/)?.[0];
      if (ratio) l.say = { t: 0, text: t('march.say.step', ratio) };
    }
    if (l && e.type === 'note' && e.text) l.say = { t: 0, text: fit1(String(e.text), 28) };
    // push: 本当に送れたときだけ、上向きの矢印が飛ぶ
    if (e.type === 'pushed') {
      showPush(l ?? lanes.find((x) => x.at === e.node) ?? lanes[0], e.ok !== false, e.branch);
    }
  }

  /**
   * 門のボス戦を順に見せる（§80.11）。本物は最後の仲間が着いた更新の中で終わっているので、
   * 記録に残った結果を、合流 → 全員の攻撃 → 撃破（または全滅）の順に再生する。結果は記録のまま。
   */
  function startBattle(gate, ok) {
    const node = own(view.nodes, gate);
    const all = (Array.isArray(node?.members) ? node.members : []).filter((id) => lanes.some((x) => x.id === id));
    if (!all.length) return;
    const goal = gate === view.quest?.goal;
    const stood = lastArenas.find((x) => x.gate === gate);
    arenas = arenas.filter((x) => x.gate !== gate);
    // すでに別の戦場にいる仲間は、そちらを優先する
    const members = all.filter((id) => !arenas.some((x) => x.members.includes(id)));
    if (!members.length) return;
    arenas.push({ gate, members, ready: true, all, cine: { t: stood ? 40 : 0, ok, goal, hits: 0, joined: !!stood } });
    // 見えていない（ノートや一覧を開いている）ときは、札を待たせない
    if (on && host.offsetParent) document.body.classList.add('march-battle');
    layoutLanes();
  }

  // 戦場の場面を1コマ進める
  function stepBattle(a) {
    const c = a.cine;
    c.t++;
    const rows = a.members.map((id) => lanes.find((x) => x.id === id)).filter(Boolean);
    const node = own(view.nodes, a.gate);
    if (c.t === 8 && !c.joined) {
      const names = rows.map((l) => String(l.c.name).replace('（あなた）', '')).join('・');
      float(PLATE + 20, Math.round(rows[0].y) + 40, t('march.join', names), '#ffd84a', 60);
      sound?.play('up');
    }
    // 仲間が順に攻撃する（テストの数だけ。負ける戦いは、最後の1つが残る）
    const total = Math.max(1, Array.isArray(node?.cases) ? node.cases.length : 1);
    const blows = c.ok ? total : Math.max(0, total - 1);
    const gap = 26;
    const start = 56;
    if (c.t >= start && (c.t - start) % gap === 0 && c.hits < Math.max(blows, rows.length)) {
      const m = rows[c.hits % rows.length];
      m.atk = 24;
      const box = a.bossBox;
      if (box) (own(ATTACK, m.c.job) ?? ATTACK.hero)(box.x + box.w * 0.3, Math.round(m.y) + LH - 8);
      if (c.hits < blows) {
        c.flash = 6;
        sound?.play('hit');
        const label = node?.cases?.[c.hits]?.name;
        if (box && label) float(box.x - 20, box.y + box.h * 0.35, fit1(String(label), 12), '#ffffff', 44);
      }
      c.hits++;
      shake = Math.max(shake, calm ? 0 : 3);
      return;
    }
    const end = start + gap * Math.max(blows, rows.length) + 20;
    if (c.t === end) {
      if (c.ok) {
        a.dying = c.goal ? 150 : 110;
        const goal = c.goal;
        banner = { text: t(goal ? 'march.goal' : 'march.gate', String(node?.title ?? a.gate).replace(/^(結合|あがり): /, '')), sub: rows.length >= 2 ? chainNameOf(rows.map((l) => l.c.job)) : '', t: 0, life: goal ? 300 : 130 };
        shake = calm ? 0 : 18;
        confetti = goal ? 400 : 90;
        sound?.play('fanfare');
        for (const m of rows) {
          m.flash = calm ? 0 : 14;
          m.flashC = '#ffffff';
          m.cheer = 120;
        }
      } else {
        // 全滅。ここから戻される
        for (const m of rows) {
          m.hurt = 44;
          m.flash = calm ? 0 : 16;
          m.flashC = '#ff3c3c';
        }
        shake = calm ? 0 : 14;
        sound?.play('down');
        float(PLATE + 40, Math.round(rows[0].y) + 40, t('march.wipe'), '#ff7a5a', 90);
        c.loseAt = c.t + 90;
      }
    }
    if (c.loseAt && c.t >= c.loseAt) a.dying = 0;
  }

  // 敵をクリックすると殴れる（§80.18）。手ごたえだけで、記録もテストの結果も変えない
  let combo = 0;
  let comboAt = -999;
  const foeBoxes = () => {
    const out = [];
    for (const a of arenas) if (a.bossBox && a.dying === undefined) out.push({ ...a.bossBox, hit: () => { if (a.cine) a.cine.flash = 4; else a.poke = 4; } });
    for (const l of lanes) {
      if (l.rest || l.talk || arenaOf(l)) continue;
      const gy = l.y + LH - 8;
      for (const f of l.foes) out.push({ x: f.x - 2, y: gy - 30, w: 24, h: 34, hit: () => { f.hit = 8; f.x += calm ? 0 : 3; } });
    }
    return out;
  };
  function punch(x, y) {
    const box = foeBoxes().find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h);
    if (!box) return false;
    box.hit();
    combo = tick - comboAt <= 60 ? combo + 1 : 1;
    comboAt = tick;
    burst(x, y, ['#ffffff', '#ffd84a', '#ff9a3c'], 8, 2);
    float(x - 6, y - 12, String(4 + Math.floor(R() * 12) + Math.min(combo, 40)), '#ffffff', 26);
    sound?.play('hit');
    if (combo >= 3) {
      // 連打の数は待たせず、いまの知らせに上書きする
      noticeNow = { str: t('march.hit', combo), c: '#ffd84a' };
      noticeAt = tick + 50;
    }
    if (combo % 10 === 0) {
      shake = Math.max(shake, calm ? 0 : 6);
      confetti = Math.max(confetti, calm ? 0 : 30);
      sound?.play('kira');
    }
    let best = 0;
    try {
      best = Number(localStorage.getItem('gridhub.bestCombo')) || 0;
      if (combo > best) localStorage.setItem('gridhub.bestCombo', String(combo));
    } catch {
      best = combo;
    }
    window.__masume.marchCombo = { combo, best: Math.max(best, combo) };
    return true;
  }
  window.__masume = window.__masume ?? {};
  window.__masume.marchFoeAt = () => {
    const b = foeBoxes()[0];
    if (!b) return null;
    const r = canvas.getBoundingClientRect();
    return { x: r.left + ((b.x + b.w / 2) / W) * r.width, y: r.top + ((b.y + b.h / 2) / H) * r.height };
  };

  canvas.addEventListener('click', (e) => {
    if (!view) return;
    document.querySelector('[data-hero="welcome-close"]')?.click();
    const r = canvas.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    if (punch(((e.clientX - r.left) / r.width) * W, y)) return;
    const l = lanes.find((x) => y >= x.toY && y < x.toY + LH);
    if (l) onPick(l.id);
  });
  // 小さな手は、マウスを乗せたレーンにだけ出す（戦場を隠さない）
  const showTools = (id) => {
    for (const l of lanes) for (const b of l.subs ?? []) b.classList.toggle('show', l.id === id);
  };
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * H;
    showTools(lanes.find((x) => y >= x.toY && y < x.toY + LH)?.id ?? null);
  });
  host.addEventListener('mouseleave', () => showTools(null));
  new ResizeObserver(() => fit()).observe(host);
  document.fonts?.addEventListener?.('loadingdone', () => TEXT.clear());
  // ドットの字は盤面を止めないよう、描いたあとで読む（§37）。届かなければ手元の書体のまま
  setTimeout(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
    link.addEventListener('load', () => document.fonts?.load?.(FONT).then(() => TEXT.clear()).catch(() => {}));
    document.head.append(link);
  }, 1200);

  return {
    /** 盤面が新しいビューを受け取るたびに呼ぶ */
    update(next, prev) {
      const sameQuest = !!prev && prev.quest?.id === next.quest?.id;
      view = next;
      if (!sameQuest) {
        lanes = [];
        parts = [];
        banner = null;
        arenas = [];
      }
      makeLanes(next.characters);
      const fresh = lanes.map((l) => l.foes.length === 0 && l.at === null);
      lanes.forEach((l, i) => {
        const c = next.characters.find((x) => x.id === l.id);
        if (!c) return;
        l.c = c;
        l.status = laneStatus(c, next);
        const moved = l.at !== null && l.at !== c.at;
        if (moved) {
          l.travel = 70;
          l.judge = null;
        }
        // 町に立ち寄る・町まで戻される
        const was = sameQuest ? prev.characters?.find((x) => x.id === l.id) : null;
        const trip = travelOf(was, c, next);
        if (trip) {
          const stop = own(next.nodes, trip.node);
          l.rest = { kind: trip.kind, t: trip.kind === 'back' ? 50 : 0, name: stop?.title ?? t('march.start') };
          if (trip.kind === 'inn') sound?.play('drop');
        }
        const gy = l.y + LH - 8;
        const killedBefore = l.foes.length;
        const sameNode = l.at === (c.at ?? '');
        syncFoes(l, c, l.status, sameQuest && !fresh[i]);
        if (sameQuest && !fresh[i]) {
          // まとめて倒した（1回の更新で2体以上）
          const killed = sameNode ? Math.max(0, killedBefore - l.foes.length) : 0;
          if (killed > 0) {
            sound?.play('hit');
            for (let k = 0; k < killed; k++) dropBag(heroX() + 50 + k * 14, gy - 14);
          }
          if (killed >= 2) float(heroX() + 30, gy - 22, t('march.combo', killed), '#ff9a3c', 50);
          // レベルアップ（本物の level が上がったとき）
          if ((c.level ?? 1) > (l.level ?? c.level ?? 1)) {
            notices.push({ str: `${c.name}: ${t('march.levelup', c.level)}`, c: '#ffe27a' });
            // キャラクターから金の粒が広がり、大きく跳ぶ
            l.leap = calm ? 0 : 36;
            if (!calm) for (let k = 0; k < 28; k++) {
              const a = (k / 28) * Math.PI * 2;
              parts.push({ x: l.hx ?? heroX(), y: gy - 16, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, g: 0.02, life: 30, s: 2, c: k % 2 ? '#ffd84a' : '#ffffff' });
            }
            l.flash = calm ? 0 : 12;
            l.flashC = '#ffe27a';
            l.cheer = Math.max(l.cheer, 60);
            sound?.play('up');
          }
          if ((c.level ?? 1) < (l.level ?? 1)) notices.push({ str: `${c.name}: ${t('march.leveldown', c.level)}`, c: '#ff9a8a' });
          if ((c.xp ?? 0) !== l.xp || (c.level ?? 1) !== l.level) l.xpFlash = 20;
          // 通ったはずのテストが戻ってきた
          const node = own(next.nodes, c.at);
          const revived = Array.isArray(node?.cases) ? node.cases.reduce((a, k) => a + (k?.revived ?? 0), 0) : 0;
          if (sameNode && revived > (l.revived ?? 0)) {
            float(heroX() + 40, gy - 22, t('march.revived'), '#ff7a5a', 50);
            sound?.play('down');
          }
          l.revived = revived;
          // 一発合格のメダル
          const was = own(prev.nodes, l.at);
          if (was && was.first_try !== true && own(next.nodes, l.at)?.first_try === true) l.medal = true;
          const before = prev.characters?.find((x) => x.id === l.id);
          if (before) {
            // 閃き: 強敵のあとの日誌が技になった
            const skills = Array.isArray(c.skills) ? c.skills : [];
            if (skills.length > (Array.isArray(before.skills) ? before.skills.length : 0)) {
              l.idea = { t: 0, text: skills[0]?.text ?? '' };
              l.flash = calm ? 0 : 10;
              l.flashC = '#ffe27a';
              sound?.play('kira');
            }
            // 伝承: 新しい代が受け継いだ
            if ((c.generation ?? 1) > (before.generation ?? 1)) {
              l.inherit = { t: 0, gen: c.generation };
              sound?.play('achieve');
            }
            // 宝箱: 判定のほころびを見つけて直された
            if ((c.treasures ?? 0) > (before.treasures ?? 0)) {
              l.chest = { t: 0 };
              sound?.play('gold');
            }
          }
        }
        l.level = c.level ?? 1;
        l.xp = c.xp ?? 0;
        l.at = c.at ?? '';
        l.cmd = commandOf(c, next, l.status);
      });
      // 余白: 村の人のひとこと・仲間との会話・号外（本当に起きた行だけ）
      if (sameQuest && prev.head && next.head && Array.isArray(next.margins)) {
        for (const m of next.margins) {
          if (!Number.isInteger(m?.seq) || m.seq <= prev.head.seq || !Array.isArray(m.lines) || !m.lines.length) continue;
          const l = lanes.find((x) => x.id === m.road);
          if (!l || l.talk) continue;
          const nameOf = (who) => next.characters.find((c) => c.id === who)?.name ?? who;
          const partner = m.kind === 'talk' ? next.characters.find((c) => m.lines.some((q) => q.who === c.id) && c.id !== m.road) : m.kind === 'npc' ? VILLAGER : null;
          l.talk = { t: 0, i: 0, partner, lines: m.lines.map((q) => ({ who: q.who ? nameOf(q.who) : null, text: q.text })) };
        }
      }
      syncArenas(sameQuest && !!prev);
      syncCommands();
      // いちばん近い門まで（全員の分を足す）
      const gates = {};
      for (const c of next.characters) {
        const g = foesToGate(c, next);
        if (g) gates[g.gate] = (gates[g.gate] ?? 0) + g.left;
      }
      const near = Object.entries(gates).sort((a, b) => a[1] - b[1])[0];
      bossNote = near ? t('march.toboss', near[0], near[1]) : '';
      if (sameQuest && prev.head && next.head) for (const e of next.log) if (e?.seq > prev.head.seq) play(e);
      // 連続 PASS: 節目で盛り上げ、途切れたら知らせる
      const nowStreak = streakOf(next.log);
      if (sameQuest && streak !== null) {
        const toast = (str, c) => notices.push({ str, c });
        if (nowStreak > streak && (nowStreak === 3 || nowStreak === 5 || nowStreak % 10 === 0)) {
          toast(t('march.streak.up', nowStreak), '#ffd84a');
          confetti = Math.max(confetti, calm ? 0 : 40);
          sound?.play('kira');
        } else if (nowStreak === 0 && streak >= 3) toast(t('march.streak.lost', streak), '#ff9a8a');
      }
      streak = nowStreak;
      lastArenas = arenas.filter((a) => !a.cine).map((a) => ({ ...a, members: [...a.members] }));
      const pass = lanes.map((l) => `${l.c.name}: ${t(`march.${l.status}`)}`).join(' / ');
      canvas.setAttribute('aria-label', pass);
      window.__masume.march = { lanes: lanes.map((l) => ({ id: l.id, status: l.status, label: t(`march.${l.status}`), foes: l.foes.map((f) => f.name), cmd: l.cmd?.kind ?? null, level: l.c.level ?? 1, rest: l.rest?.kind ?? null, talk: !!l.talk, idea: !!l.idea, inherit: !!l.inherit, chest: !!l.chest })), arenas: arenas.map((a) => ({ gate: a.gate, members: [...a.members], cine: !!a.cine, ready: !!a.ready })) };
    },
    show(flag) {
      on = flag;
      if (!on) sound?.music?.(null);
      if (on && !raf) raf = requestAnimationFrame(frame);
      if (on) fit();
    },
    /** PR に付いた本物のレビュー・コメントを、そのブランチの担当のレーンで話す（§80.16）。合うレーンが無ければ知らせる */
    talk(branch, who, str) {
      const hit = lanes.find((l) => String(branch ?? '').toLowerCase().includes(String(l.id).toLowerCase()) && !l.talk && !arenaOf(l));
      const l = hit ?? lanes.find((x) => !x.talk && !x.rest && !arenaOf(x));
      if (!l) return notices.push({ str: `${who}: ${fit1(str, 30)}`, c: '#ffffff' });
      l.talk = { t: 0, i: 0, partner: VILLAGER, lines: [{ who, text: str }] };
      window.__masume.marchTalk = { lane: l.id, who, text: str };
      sound?.play('normal');
      return null;
    },
    /** 大きな知らせ（§80.16）。ok なら紙吹雪、だめなら揺れる */
    announce(text, ok) {
      banner = { text, t: 0, life: 120 };
      if (ok) {
        confetti = calm ? 0 : 70;
        sound?.play('fanfare');
      } else {
        shake = calm ? 0 : 14;
        sound?.play('down');
      }
    },
    /** 小さな知らせ（§80.16） */
    notice(text) {
      notices.push({ str: text, c: '#ffe27a' });
      sound?.play('normal');
    },
    /** 盤面から git push したとき（§80.8）。全員のレーンに矢印が飛ぶ */
    pushed(ok, branch) {
      if (ok && !calm) for (const l of lanes) for (let k = 0; k < 3; k++) parts.push({ arrow: true, x: heroX() + 40 + k * 90 + l.i * 13, y: l.y + LH - 14 + k * 8, vy: -1.6, life: 30 });
      notices.push({ str: ok ? t('march.push.ok', branch ?? '') : t('march.push.ng'), c: ok ? '#7ee8a8' : '#ff9a8a' });
      sound?.play(ok ? 'kira' : 'down');
    },
    /** 仲間のひとこと（§79.12） */
    say(id, str) {
      const l = lanes.find((x) => x.id === id);
      if (l) l.say = { t: 0, text: fit1(String(str), 22) };
    },
    rewords() {
      TEXT.clear();
      syncCommands();
      if (window.__masume.march) for (const m of window.__masume.march.lanes) m.label = t(`march.${m.status}`);
    },
  };
}
