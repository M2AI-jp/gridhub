// ドット絵の形（CONTRACTS §80.13）。絵は文字の格子で1ドットずつ置く。ここは格子を色の板にするだけ。
// ブラウザでも Node でも動く（DOM に触らない）。
import { color } from './palette.js';

/**
 * スプライトの形:
 * {
 *   id, w, h,            // 1枚の大きさ（全フレーム同じ）
 *   ax, ay,              // 足もとの点（立つ場所）。ay は足の裏の行
 *   pal: { a: 'grass:3', b: '#ffffff', '1': 'team:2', ... }   // '.' と ' ' は透明
 *   frames: {
 *     idle0: ['....', ...],                        // h 行 × w 文字
 *     blink: { from: 'idle0', patch: [[x, y, ['ab', 'cd']]] },  // 別のフレームを写して一部を描き直す（'.' は触らない、'_' は透明にする）
 *     run1:  { from: 'run0', dx: 0, dy: -1, patch: [...] },      // ずらして写す
 *   }
 * }
 */
export function rows(sprite, name, seen = new Set()) {
  const f = sprite.frames[name];
  if (!f) throw new Error(`${sprite.id}: no frame ${name}`);
  if (Array.isArray(f)) return f;
  if (seen.has(name)) throw new Error(`${sprite.id}: loop at ${name}`);
  seen.add(name);
  const base = rows(sprite, f.from, seen);
  const w = sprite.w;
  const h = sprite.h;
  const grid = Array.from({ length: h }, (_, y) => {
    const sy = y - (f.dy ?? 0);
    const src = base[sy] ?? '';
    let out = '';
    for (let x = 0; x < w; x++) out += src[x - (f.dx ?? 0)] ?? '.';
    return out.split('');
  });
  for (const [px, py, g] of f.patch ?? []) {
    g.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const ch = r[i];
        if (ch === '.') continue;
        const y = py + j;
        const x = px + i;
        if (y >= 0 && y < h && x >= 0 && x < w) grid[y][x] = ch === '_' ? '.' : ch;
      }
    });
  }
  return grid.map((r) => r.join(''));
}

/** 1フレーム → 色の格子（[y][x] = '#rrggbb' | null） */
export function paint(sprite, name, team = 'gray', over = null) {
  const g = rows(sprite, name);
  const pal = over ? { ...sprite.pal, ...over } : sprite.pal;
  const memo = {};
  return Array.from({ length: sprite.h }, (_, y) => {
    const r = g[y] ?? '';
    return Array.from({ length: sprite.w }, (_, x) => {
      const ch = r[x];
      if (ch === undefined || ch === '.' || ch === ' ') return null;
      if (!(ch in memo)) memo[ch] = pal[ch] === undefined ? '#ff00ff' : color(pal[ch], team);
      return memo[ch];
    });
  });
}

/** 色の格子を左右反転 */
export const flip = (buf) => buf.map((r) => [...r].reverse());

// ---- 背景を描くための板（RGBA）。ブラウザでは toCanvas で絵にする
export class Surface {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }
  static rgb(c) {
    if (!c) return null;
    if (Array.isArray(c)) return c;
    const v = c[0] === '#' ? c.slice(1) : color(c).slice(1);
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), v.length >= 8 ? parseInt(v.slice(6, 8), 16) : 255];
  }
  /** 横は周回する（wrap=true のとき。背景の帯はつながる） */
  set(x, y, c, wrap = true) {
    if (y < 0 || y >= this.h) return;
    x = Math.round(x);
    y = Math.round(y);
    if (wrap) x = ((x % this.w) + this.w) % this.w;
    else if (x < 0 || x >= this.w) return;
    const k = Surface.rgb(c);
    if (!k) return;
    const o = (y * this.w + x) * 4;
    const a = (k[3] ?? 255) / 255;
    if (a >= 1) {
      this.data[o] = k[0]; this.data[o + 1] = k[1]; this.data[o + 2] = k[2]; this.data[o + 3] = 255;
      return;
    }
    const d = this.data;
    const da = d[o + 3] / 255;
    const oa = a + da * (1 - a);
    for (let q = 0; q < 3; q++) d[o + q] = oa ? (k[q] * a + d[o + q] * da * (1 - a)) / oa : 0;
    d[o + 3] = oa * 255;
  }
  get(x, y) {
    if (y < 0 || y >= this.h) return null;
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    const o = (Math.round(y) * this.w + x) * 4;
    return this.data[o + 3] ? [this.data[o], this.data[o + 1], this.data[o + 2], this.data[o + 3]] : null;
  }
  rect(x, y, w, h, c, wrap = true) {
    const k = Surface.rgb(c);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, k, wrap);
  }
  hline(x0, x1, y, c) { const k = Surface.rgb(c); for (let i = x0; i <= x1; i++) this.set(i, y, k); }
  vline(x, y0, y1, c) { const k = Surface.rgb(c); for (let j = y0; j <= y1; j++) this.set(x, j, k); }
  /** 文字の格子を置く。pal は sprite と同じ書き方 */
  grid(g, x, y, pal, { flipX = false, team = 'gray', wrap = true } = {}) {
    const memo = {};
    g.forEach((r, j) => {
      for (let i = 0; i < r.length; i++) {
        const ch = r[flipX ? r.length - 1 - i : i];
        if (ch === '.' || ch === ' ' || ch === undefined) continue;
        if (!(ch in memo)) memo[ch] = Surface.rgb(pal[ch] === undefined ? '#ff00ff' : color(pal[ch], team));
        this.set(x + i, y + j, memo[ch], wrap);
      }
    });
  }
  /** 色の格子（paint の結果）を置く */
  buf(b, x, y, wrap = true) {
    b.forEach((r, j) => r.forEach((c, i) => { if (c) this.set(x + i, y + j, c, wrap); }));
  }
  /** 別の板を重ねる */
  draw(s, x, y, wrap = true) {
    for (let j = 0; j < s.h; j++) for (let i = 0; i < s.w; i++) {
      const o = (j * s.w + i) * 4;
      if (!s.data[o + 3]) continue;
      this.set(x + i, y + j, [s.data[o], s.data[o + 1], s.data[o + 2], s.data[o + 3]], wrap);
    }
  }
}

/** 再現できる乱数（背景の配置用） */
export function rng(seed) {
  let s = (seed * 9301 + 49297) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** ブラウザ用: 色の格子 or Surface → canvas */
export function toCanvas(src) {
  const isSurf = src instanceof Surface;
  const w = isSurf ? src.w : src[0].length;
  const h = isSurf ? src.h : src.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (isSurf) {
    x.putImageData(new ImageData(src.data, w, h), 0, 0);
  } else {
    const img = x.createImageData(w, h);
    src.forEach((row, j) => row.forEach((col, i) => {
      if (!col) return;
      const o = (j * w + i) * 4;
      img.data[o] = parseInt(col.slice(1, 3), 16);
      img.data[o + 1] = parseInt(col.slice(3, 5), 16);
      img.data[o + 2] = parseInt(col.slice(5, 7), 16);
      img.data[o + 3] = col.length > 7 ? parseInt(col.slice(7, 9), 16) : 255;
    }));
    x.putImageData(img, 0, 0);
  }
  return c;
}

/** 背景の帯の横幅（周回する） */
export const LW = 1024;
