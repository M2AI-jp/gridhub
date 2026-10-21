// 手描きの線をつくる道具。同じ seed からは同じゆらぎが出る（再描画しても線が震えない）。

export const INK = '#1d2b5c';
export const RED = '#d94a3a';
export const PENCIL = '#8d939c';

export const HIGHLIGHT = {
  yellow: '#ffe45c',
  pink: '#ff8fc7',
  green: '#8ee28a',
  blue: '#7cc7ff',
  orange: '#ffb35c',
  purple: '#c9a2ff',
  mint: '#7fe3d0',
  gray: '#c8c8c8',
};

export function hl(color) {
  return own(HIGHLIGHT, color) || HIGHLIGHT.gray;
}

/** obj が自分で持っている key の値だけ返す（constructor・__proto__ などの名前でも Object の中身を拾わない） */
export function own(obj, key) {
  return obj != null && typeof obj === 'object' && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** id で引ける表（プロトタイプなし。どんな id でも自分の値だけが返る） */
export function byId(list) {
  const map = Object.create(null);
  for (const x of list || []) map[x.id] = x;
  return map;
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** seed 文字列から 0..1 の乱数列を作る（mulberry32） */
export function rng(seed) {
  let a = hashString(String(seed));
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const f = (n) => Math.round(n * 10) / 10;

/** 手描きの直線（少したわむ） */
export function line(x1, y1, x2, y2, seed, wob = 1.2) {
  const r = rng(seed);
  const mx = (x1 + x2) / 2 + (r() - 0.5) * wob * 2;
  const my = (y1 + y2) / 2 + (r() - 0.5) * wob * 2;
  return `M${f(x1 + (r() - 0.5) * wob)} ${f(y1 + (r() - 0.5) * wob)} Q${f(mx)} ${f(my)} ${f(x2 + (r() - 0.5) * wob)} ${f(y2 + (r() - 0.5) * wob)}`;
}

/** 手描きの四角（角で少しはみ出す） */
export function rect(x, y, w, h, seed, wob = 1.4) {
  const r = rng(seed);
  const o = () => (r() - 0.5) * wob * 2;
  const over = () => 1 + r() * 2.2;
  const sides = [
    [x - over(), y + o(), x + w + over(), y + o()],
    [x + w + o(), y - over(), x + w + o(), y + h + over()],
    [x + w + over(), y + h + o(), x - over(), y + h + o()],
    [x + o(), y + h + over(), x + o(), y - over()],
  ];
  return sides.map(([a, b, c, d], i) => line(a, b, c, d, `${seed}:${i}`, wob)).join(' ');
}

/** 塗りつぶし用の閉じた手描きの四角 */
export function box(x, y, w, h, seed, wob = 1.4) {
  const r = rng(seed);
  const o = () => (r() - 0.5) * wob * 2;
  const c = [[x + o(), y + o()], [x + w + o(), y + o()], [x + w + o(), y + h + o()], [x + o(), y + h + o()]];
  let d = `M${f(c[0][0])} ${f(c[0][1])}`;
  for (let i = 1; i <= 4; i++) {
    const a = c[i - 1];
    const b = c[i % 4];
    d += ` Q${f((a[0] + b[0]) / 2 + o())} ${f((a[1] + b[1]) / 2 + o())} ${f(b[0])} ${f(b[1])}`;
  }
  return d + ' Z';
}

/** 蛍光ペンでぐりぐり塗る（ジグザグ） */
export function scribble(x, y, w, h, seed, step = 8) {
  const r = rng(seed);
  let d = `M${f(x + 2)} ${f(y + 3)}`;
  let left = true;
  for (let yy = y + 3; yy <= y + h - 2; yy += step) {
    left = !left;
    d += ` L${f(left ? x + 2 + r() * 3 : x + w - 2 - r() * 3)} ${f(yy + step * 0.6 + (r() - 0.5) * 2)}`;
  }
  return d;
}

/** 手描きの丸（閉じ目が少しずれる） */
export function circle(cx, cy, rad, seed, wob = 1) {
  const r = rng(seed);
  const start = r() * Math.PI * 2;
  const pts = [];
  const n = 18;
  for (let i = 0; i <= n + 1; i++) {
    const t = start + (i / n) * Math.PI * 2 * 1.04;
    const rr = rad + (r() - 0.5) * wob * 2;
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr]);
  }
  return smooth(pts);
}

/** 点列を Catmull-Rom 風になめらかにつなぐ */
export function smooth(pts) {
  if (pts.length < 2) return '';
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/** 道（点列）を少しゆらしてなめらかにする */
export function road(points, seed, wob = 1.5) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < points.length; i++) {
    const [x, y] = points[i];
    pts.push([x + (i && i < points.length - 1 ? (r() - 0.5) * wob : 0), y + (r() - 0.5) * wob]);
    if (i < points.length - 1) {
      const [nx, ny] = points[i + 1];
      pts.push([(x + nx) / 2 + (r() - 0.5) * wob, (y + ny) / 2 + (r() - 0.5) * wob]);
    }
  }
  return smooth(pts);
}

/** 赤ペンのはなまる（うずまき＋花びら） */
export function hanamaru(cx, cy, rad, seed) {
  const r = rng(seed);
  const pts = [];
  const turns = 2.2;
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2 * turns;
    const rr = rad * (0.08 + 0.42 * (i / steps));
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.92]);
  }
  const petals = 7;
  const n = 84;
  const start = Math.PI * 2 * turns;
  for (let i = 1; i <= n; i++) {
    const t = start + (i / n) * Math.PI * 2 * 1.02;
    const k = Math.abs(Math.sin(((i / n) * Math.PI * petals)));
    const rr = rad * (0.62 + 0.36 * k) + (r() - 0.5) * 1.2;
    pts.push([cx + Math.cos(t) * rr, cy + Math.sin(t) * rr * 0.92]);
  }
  return smooth(pts);
}

/** ボス（結合ゲートの番人）の落書き。mood: calm | angry | beaten */
export function boss(cx, cy, s, seed, mood = 'calm') {
  const r = rng(seed);
  const head = circle(cx, cy, s * 0.5, `${seed}:h`, s * 0.04);
  const hornL = `M${f(cx - s * 0.32)} ${f(cy - s * 0.36)} L${f(cx - s * 0.48 + r())} ${f(cy - s * 0.78)} L${f(cx - s * 0.12)} ${f(cy - s * 0.48)}`;
  const hornR = `M${f(cx + s * 0.32)} ${f(cy - s * 0.36)} L${f(cx + s * 0.48 + r())} ${f(cy - s * 0.78)} L${f(cx + s * 0.12)} ${f(cy - s * 0.48)}`;
  const eyeY = cy - s * 0.08;
  const brow =
    mood === 'angry'
      ? `M${f(cx - s * 0.3)} ${f(eyeY - s * 0.2)} L${f(cx - s * 0.08)} ${f(eyeY - s * 0.08)} M${f(cx + s * 0.3)} ${f(eyeY - s * 0.2)} L${f(cx + s * 0.08)} ${f(eyeY - s * 0.08)}`
      : '';
  let teeth = `M${f(cx - s * 0.26)} ${f(cy + s * 0.2)}`;
  const nT = 5;
  for (let i = 1; i <= nT * 2; i++) {
    const x = cx - s * 0.26 + (i / (nT * 2)) * s * 0.52;
    const y = cy + s * 0.2 + (i % 2 ? s * 0.11 : 0);
    teeth += ` L${f(x)} ${f(y)}`;
  }
  return { head, horns: `${hornL} ${hornR}`, brow, teeth, eyes: [[cx - s * 0.17, eyeY], [cx + s * 0.17, eyeY]], eyeR: s * 0.07 };
}

/** 宿屋の落書き（屋根と扉） */
export function inn(cx, cy, s, seed) {
  const roof = line(cx - s * 0.55, cy - s * 0.05, cx, cy - s * 0.5, `${seed}:r1`) + ' ' + line(cx, cy - s * 0.5, cx + s * 0.55, cy - s * 0.05, `${seed}:r2`);
  const body = rect(cx - s * 0.4, cy - s * 0.05, s * 0.8, s * 0.5, `${seed}:b`, 0.8);
  const door = rect(cx - s * 0.1, cy + s * 0.15, s * 0.2, s * 0.3, `${seed}:d`, 0.5);
  const chimney = line(cx + s * 0.25, cy - s * 0.25, cx + s * 0.25, cy - s * 0.45, `${seed}:c`, 0.4);
  return `${roof} ${body} ${door} ${chimney}`;
}

/** 色を紙の色に寄せる（k = 0 で元の色、1 で紙の色）。付箋やシールの淡い色に使う */
export function tint(hex, k, paper = '#fffbea') {
  const p = (h) => {
    const v = String(h).replace('#', '');
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  };
  const a = p(hex);
  const b = p(paper);
  if (a.some(Number.isNaN)) return paper;
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('');
}

/** マスキングテープの切れ端（手でちぎった端はギザギザ）。中心 (cx, cy)、傾き deg */
export function tape(cx, cy, w, h, seed, deg = 0) {
  const r = rng(seed);
  const t = (deg * Math.PI) / 180;
  const at = (x, y) => [cx + x * Math.cos(t) - y * Math.sin(t), cy + x * Math.sin(t) + y * Math.cos(t)];
  const pts = [];
  const teeth = 5;
  pts.push(at(-w / 2, -h / 2), at(w / 2, -h / 2));
  for (let i = 1; i < teeth; i++) pts.push(at(w / 2 + (i % 2 ? -1.6 : 0.4) * (0.6 + r()), -h / 2 + (h * i) / teeth));
  pts.push(at(w / 2, h / 2), at(-w / 2, h / 2));
  for (let i = teeth - 1; i > 0; i--) pts.push(at(-w / 2 + (i % 2 ? 1.6 : -0.4) * (0.6 + r()), -h / 2 + (h * i) / teeth));
  return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L') + ' Z';
}

/** お城の壁の凸凹（結合ゲートの上の縁）。x..x+w の上に高さ h の歯を n 本 */
export function crenel(x, y, w, h, n, seed) {
  const r = rng(seed);
  const o = () => (r() - 0.5) * 1.2;
  const step = w / (n * 2 - 1);
  let d = `M${f(x + o())} ${f(y + o())}`;
  for (let i = 0; i < n * 2 - 1; i++) {
    const x0 = x + i * step;
    const x1 = x0 + step;
    if (i % 2 === 0) d += ` L${f(x0 + o())} ${f(y - h + o())} L${f(x1 + o())} ${f(y - h + o())} L${f(x1 + o())} ${f(y + o())}`;
    else d += ` L${f(x1 + o())} ${f(y + o())}`;
  }
  return d;
}

/** あがりの旗（竿と、市松もようの旗）。竿の根もと (x, y)、高さ s */
export function goalFlag(x, y, s, seed) {
  const r = rng(seed);
  const top = y - s;
  const fw = s * 0.62;
  const fh = s * 0.4;
  const wave = (k) => (Math.sin(k * Math.PI) * s * 0.05);
  const pole = line(x, y, x + (r() - 0.5) * 2, top, `${seed}:p`, 0.6);
  const cloth = `M${f(x)} ${f(top)} Q${f(x + fw / 2)} ${f(top - s * 0.08)} ${f(x + fw)} ${f(top + wave(1))} L${f(x + fw)} ${f(top + fh)} Q${f(x + fw / 2)} ${f(top + fh - s * 0.08)} ${f(x)} ${f(top + fh)} Z`;
  let checks = '';
  const cols = 3;
  const rows = 2;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      if ((i + j) % 2) continue;
      const cx = x + (i * fw) / cols;
      const cy = top + (j * fh) / rows - Math.sin(((i + 0.5) / cols) * Math.PI) * s * 0.05;
      checks += `M${f(cx + 0.6)} ${f(cy + 0.8)} h${f(fw / cols - 1.2)} v${f(fh / rows - 1.2)} h${f(-(fw / cols - 1.2))} Z `;
    }
  return { pole, cloth, checks };
}

/** 手描きの矢印（ゆるく曲がった線と、くの字の矢じり） */
export function arrow(x1, y1, x2, y2, seed, bend = 0.25) {
  const r = rng(seed);
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend + (r() - 0.5) * 2;
  const my = (y1 + y2) / 2 + (x2 - x1) * bend + (r() - 0.5) * 2;
  const a = Math.atan2(y2 - my, x2 - mx);
  const k = 7;
  const h1 = [x2 - Math.cos(a - 0.5) * k, y2 - Math.sin(a - 0.5) * k];
  const h2 = [x2 - Math.cos(a + 0.5) * k, y2 - Math.sin(a + 0.5) * k];
  return `M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)} M${f(h1[0])} ${f(h1[1])} L${f(x2)} ${f(y2)} L${f(h2[0])} ${f(h2[1])}`;
}

/** 落書きの星（一筆書き） */
export function star(cx, cy, rad, seed) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i <= 5; i++) {
    const t = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
    pts.push([cx + Math.cos(t) * rad + (r() - 0.5) * 1.5, cy + Math.sin(t) * rad + (r() - 0.5) * 1.5]);
  }
  return 'M' + pts.map(([x, y]) => `${f(x)} ${f(y)}`).join(' L');
}

/** 文字を n 文字ずつ折り返す（日本語向け。英数字の連なりはなるべく割らない） */
export function wrap(text, n, maxLines = 2) {
  const chars = [...String(text || '')];
  const lines = [];
  let cur = '';
  let width = 0;
  for (const c of chars) {
    const w = /[\x20-\x7e]/.test(c) ? 0.55 : 1;
    if (width + w > n) {
      lines.push(cur);
      cur = '';
      width = 0;
    }
    cur += c;
    width += w;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, -1) + '…';
    return kept;
  }
  return lines;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
