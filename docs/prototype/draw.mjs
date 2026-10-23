// 試作2: ノートの1ページを SVG に描く。
import { hl, tint, rng, circle, hanamaru, boss, esc, own, byId, smooth } from '/web/board/sketch.js';
import { PAGE, GRID, X0, X1, SQ, P1_ROAD, PN_ROAD, BOTTOM } from './world.mjs';

export const U = 16;
const px = (n) => +(n * U).toFixed(1);
const f1 = (n) => n.toFixed(1);

export const EVENTS = {
  plus2: { glyph: '＋2', name: '一発合格', cls: 'ev-plus' },
  rest: { glyph: '休', name: '判定に落ちた', cls: 'ev-rest' },
  back3: { glyph: '−3', name: '封印破り', cls: 'ev-back' },
  omikuji: { glyph: '？', name: 'おみくじ', cls: 'ev-omikuji' },
  treasure: { glyph: '宝', name: '判定のバグ発見', cls: 'ev-treasure' },
};
const FORTUNES = ['大吉', '中吉', '小吉', '吉', '末吉', '凶', 'なし'];

/** 方眼の線にそった四角（定規で引いた線。角だけ少しはみ出す） */
export function ruled(x, y, w, h, seed, wob = 0.3) {
  const r = rng(seed);
  const o = () => (r() - 0.5) * wob * 2;
  const ov = () => 0.5 + r() * 1.3;
  const X = px(x), Y = px(y), W = px(w), Hh = px(h);
  return [
    `M${f1(X - ov())} ${f1(Y + o())} L${f1(X + W + ov())} ${f1(Y + o())}`,
    `M${f1(X + W + o())} ${f1(Y - ov())} L${f1(X + W + o())} ${f1(Y + Hh + ov())}`,
    `M${f1(X + W + ov())} ${f1(Y + Hh + o())} L${f1(X - ov())} ${f1(Y + Hh + o())}`,
    `M${f1(X + o())} ${f1(Y + Hh + ov())} L${f1(X + o())} ${f1(Y - ov())}`,
  ].join(' ');
}

const textW = (s, size) => [...String(s)].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.56 : 1), 0) * size;

/** 日本語の題を、なるべく文節で折り返す */
export function wrapJa(text, max, maxLines = 2) {
  const chars = [...String(text || '')];
  const isA = (c) => /[\x21-\x7e]/.test(c);
  const parts = [];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const n = chars[i + 1];
    cur += c;
    const brk =
      (/[をにがはでとのへも、。・）」]/.test(c) && n && !/[をにがはでとのへもる、。）」ー]/.test(n)) ||
      c === ' ' ||
      (isA(c) && n && !isA(n) && n !== ' ' && !/[）」、。・ー]/.test(n)) ||
      (!isA(c) && n && isA(n) && !/[（「]/.test(c));
    if (brk) (parts.push(cur), (cur = ''));
  }
  if (cur) parts.push(cur);
  const w = (t) => [...t].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? 0.56 : 1), 0);
  const lines = [];
  let line = '';
  for (let p of parts) {
    while (w(p) > max) {
      if (line) (lines.push(line), (line = ''));
      let head = '';
      for (const c of [...p]) {
        if (w(head + c) > max) break;
        head += c;
      }
      lines.push(head);
      p = p.slice(head.length);
    }
    if (w(line + p) > max && line) (lines.push(line.trimEnd()), (line = p.trimStart()));
    else line += p;
  }
  if (line) lines.push(line);
  for (let k = 1; k < lines.length; k++) {
    const m = lines[k].match(/^[）」、。]+/);
    if (m) (lines[k - 1] += m[0]), (lines[k] = lines[k].slice(m[0].length));
  }
  const out = lines.filter(Boolean);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    kept[maxLines - 1] = [...kept[maxLines - 1]].slice(0, -1).join('') + '…';
    return kept;
  }
  return out;
}

const STATE_JA = { cleared: '✓ 完了', current: '作業中', open: 'つぎ', fog: '未着手', stale: '要再検証', waiting: '待機', ready: '実行待ち' };

// ---- 地形 ----
function terrainMarkup(t) {
  const r = rng(t.seed);
  const X = px(t.x), Y = px(t.y), W = px(t.w), Hh = px(t.h);
  switch (t.kind) {
    case 'mountain':
    case 'mountains': {
      const peaks = t.kind === 'mountain' ? 1 : 2 + (r() < 0.5 ? 1 : 0);
      let s = '';
      for (let k = 0; k < peaks; k++) {
        const pw = W / (peaks === 1 ? 1 : peaks * 0.75);
        const x0 = X + (k * (W - pw)) / Math.max(1, peaks - 1);
        const top = Y + Hh * (0.05 + r() * 0.25);
        const cx = x0 + pw * (0.4 + r() * 0.2);
        const base = Y + Hh;
        s += `<path class="mt" d="M${f1(x0)} ${f1(base)} L${f1(cx)} ${f1(top)} L${f1(x0 + pw)} ${f1(base)}"/>`;
        const sy = top + (base - top) * 0.3;
        s += `<path class="mt-snow" d="M${f1(cx - (cx - x0) * 0.3)} ${f1(sy)} l${f1(pw * 0.08)} ${f1(-3)} l${f1(pw * 0.08)} 4 l${f1(pw * 0.08)} -3 L${f1(cx + (x0 + pw - cx) * 0.3)} ${f1(sy)}"/>`;
        s += `<path class="mt-shade" d="M${f1(cx + 2)} ${f1(top + 6)} l${f1(pw * 0.12)} ${f1((base - top) * 0.5)} M${f1(cx + 6)} ${f1(top + 10)} l${f1(pw * 0.1)} ${f1((base - top) * 0.4)}"/>`;
      }
      return `<g class="terrain mountain">${s}</g>`;
    }
    case 'forest': {
      let s = '';
      const n = 3 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const cx = X + (W * (k + 0.5)) / n + (r() - 0.5) * 4;
        const cy = Y + Hh * (0.35 + r() * 0.2);
        s += `<path class="crown" d="${circle(cx, cy, U * 0.42, `${t.seed}:${k}`, 0.8)}"/><path class="trunk" d="M${f1(cx)} ${f1(cy + U * 0.4)} V${f1(cy + U * 0.85)}"/>`;
      }
      return `<g class="terrain forest">${s}</g>`;
    }
    case 'tree': {
      const cx = X + W / 2;
      if (r() < 0.5) return `<g class="terrain tree"><path class="crown" d="M${f1(cx)} ${f1(Y + 2)} L${f1(cx + 5.5)} ${f1(Y + Hh - 4)} L${f1(cx - 5.5)} ${f1(Y + Hh - 4)} Z"/><path class="trunk" d="M${f1(cx)} ${f1(Y + Hh - 4)} V${f1(Y + Hh - 1)}"/></g>`;
      return `<g class="terrain tree"><path class="crown" d="${circle(cx, Y + Hh * 0.42, U * 0.3, t.seed, 0.5)}"/><path class="trunk" d="M${f1(cx)} ${f1(Y + Hh * 0.7)} V${f1(Y + Hh - 1)}"/></g>`;
    }
    case 'grass': {
      const cx = X + W / 2;
      const by = Y + Hh - 4;
      return `<g class="terrain grass"><path d="M${f1(cx - 4)} ${f1(by)} q1 -4 0 -6 M${f1(cx)} ${f1(by)} q0 -5 1 -8 M${f1(cx + 4)} ${f1(by)} q-1 -4 1 -6"/></g>`;
    }
    case 'house':
      return `<g class="terrain house">${house(X + 4, Y + 6, W - 8, Hh - 8, t.seed)}</g>`;
    case 'town': {
      let s = house(X + 2, Y + 14, U * 1.3, U * 1.4, `${t.seed}:a`) + house(X + U * 1.7, Y + 8, U * 1.2, U * 1.9, `${t.seed}:b`) + house(X + U * 2.9, Y + 16, U * 0.95, U * 1.3, `${t.seed}:c`);
      s += `<path class="flag" d="M${f1(X + U * 2.3)} ${f1(Y + 8)} V${f1(Y)} l7 2.5 l-7 2.5"/>`;
      return `<g class="terrain town">${s}</g>`;
    }
    case 'sea': {
      let waves = '';
      for (let yy = 1; yy < t.h; yy++) for (let xx = 0; xx + 2 <= t.w; xx += 3) if (r() < 0.7) waves += `M${f1(X + (xx + (yy % 2) * 1.5) * U + 2)} ${f1(Y + yy * U)} q${U * 0.35} -4 ${U * 0.7} 0 t${U * 0.7} 0 `;
      const bx = X + W * (0.25 + r() * 0.5);
      const by = Y + Hh * 0.55;
      const boat = `<path class="boat" d="M${f1(bx - 10)} ${f1(by)} h20 l-4 6 h-12 Z M${f1(bx)} ${f1(by)} V${f1(by - 16)} l9 12 h-9"/>`;
      return `<g class="terrain sea"><rect class="sea-water" x="${X}" y="${Y}" width="${W}" height="${Hh}" rx="10"/><path class="waves" d="${waves}"/>${boat}</g>`;
    }
    case 'lake': {
      const pts = [];
      const n = 10;
      for (let k = 0; k <= n + 1; k++) {
        const a = (k / n) * Math.PI * 2;
        const rr = 0.78 + r() * 0.22;
        pts.push([X + W / 2 + Math.cos(a) * (W / 2 - 3) * rr, Y + Hh / 2 + Math.sin(a) * (Hh / 2 - 3) * rr]);
      }
      let waves = '';
      for (let k = 0; k < 3; k++) {
        const wx = X + W * (0.22 + r() * 0.35);
        const wy = Y + Hh * (0.3 + k * 0.2);
        waves += `M${f1(wx)} ${f1(wy)} q4 -3 8 0 t8 0 `;
      }
      return `<g class="terrain lake"><path class="water" d="${smooth(pts)} Z"/><path class="waves" d="${waves}"/></g>`;
    }
  }
  return '';
}

function house(x, y, w, h, seed) {
  const r = rng(seed);
  const roofH = h * 0.45;
  return `<path class="wall" d="M${f1(x)} ${f1(y + roofH)} h${f1(w)} v${f1(h - roofH)} h${f1(-w)} Z"/><path class="roof" d="M${f1(x - 2)} ${f1(y + roofH)} L${f1(x + w / 2)} ${f1(y)} L${f1(x + w + 2)} ${f1(y + roofH)} Z"/><path class="door" d="M${f1(x + w * (0.35 + r() * 0.2))} ${f1(y + h)} v${f1(-h * 0.3)} h${f1(w * 0.18)} v${f1(h * 0.3)}"/>`;
}

// ---- モンスター（テスト1件 = 1体）と、道の上の施設 ----
const SPECIES = ['slime', 'bat', 'mushroom', 'ghost', 'snake'];
function monster(cx, cy, seed, alive) {
  const r = rng(seed);
  const kind = SPECIES[Math.floor(r() * SPECIES.length)];
  const k = 0.82;
  let body = '';
  let eyes = `<circle cx="${f1(cx - 3 * k)}" cy="${f1(cy - 1)}" r="1.1"/><circle cx="${f1(cx + 3 * k)}" cy="${f1(cy - 1)}" r="1.1"/>`;
  switch (kind) {
    case 'slime':
      body = `M${f1(cx - 9 * k)} ${f1(cy + 6)} Q${f1(cx - 9 * k)} ${f1(cy - 2)} ${f1(cx)} ${f1(cy - 9)} Q${f1(cx + 9 * k)} ${f1(cy - 2)} ${f1(cx + 9 * k)} ${f1(cy + 6)} Z`;
      break;
    case 'bat':
      body = `M${f1(cx - 4)} ${f1(cy)} a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0 M${f1(cx - 4)} ${f1(cy - 1)} L${f1(cx - 11)} ${f1(cy - 6)} L${f1(cx - 9)} ${f1(cy + 1)} L${f1(cx - 6)} ${f1(cy - 1)} M${f1(cx + 4)} ${f1(cy - 1)} L${f1(cx + 11)} ${f1(cy - 6)} L${f1(cx + 9)} ${f1(cy + 1)} L${f1(cx + 6)} ${f1(cy - 1)}`;
      eyes = `<circle cx="${f1(cx - 1.6)}" cy="${f1(cy - 1)}" r="0.9"/><circle cx="${f1(cx + 1.6)}" cy="${f1(cy - 1)}" r="0.9"/>`;
      break;
    case 'mushroom':
      body = `M${f1(cx - 9)} ${f1(cy - 1)} Q${f1(cx)} ${f1(cy - 13)} ${f1(cx + 9)} ${f1(cy - 1)} Z M${f1(cx - 4)} ${f1(cy - 1)} V${f1(cy + 7)} H${f1(cx + 4)} V${f1(cy - 1)}`;
      eyes = `<circle cx="${f1(cx - 1.8)}" cy="${f1(cy + 2.5)}" r="0.9"/><circle cx="${f1(cx + 1.8)}" cy="${f1(cy + 2.5)}" r="0.9"/>`;
      break;
    case 'ghost':
      body = `M${f1(cx - 7)} ${f1(cy + 7)} V${f1(cy - 2)} Q${f1(cx - 7)} ${f1(cy - 10)} ${f1(cx)} ${f1(cy - 10)} Q${f1(cx + 7)} ${f1(cy - 10)} ${f1(cx + 7)} ${f1(cy - 2)} V${f1(cy + 7)} l-3.5 -3 l-3.5 3 l-3.5 -3 Z`;
      break;
    default:
      body = `M${f1(cx - 9)} ${f1(cy + 5)} q4 -8 8 0 t8 0 M${f1(cx + 7)} ${f1(cy + 5)} q2 -10 -2 -12 q-5 -1 -5 3`;
      eyes = `<circle cx="${f1(cx + 1.5)}" cy="${f1(cy - 5)}" r="0.9"/>`;
  }
  const x = alive ? '' : `<path class="slain" d="M${f1(cx - 8)} ${f1(cy + 7)} L${f1(cx + 8)} ${f1(cy - 8)}"/>`;
  return `<g class="monster ${kind} ${alive ? 'alive' : 'slain-m'}"><path class="m-body" d="${body}"/><g class="m-eyes">${eyes}</g>${x}</g>`;
}
function chest(cx, cy) {
  return `<g class="chest"><path class="c-body" d="M${f1(cx - 8)} ${f1(cy - 2)} h16 v9 h-16 Z"/><path class="c-lid" d="M${f1(cx - 8)} ${f1(cy - 2)} q8 -9 16 0"/><path class="c-lock" d="M${f1(cx - 1.5)} ${f1(cy - 2)} h3 v4 h-3 Z"/></g>`;
}
function fortune(cx, cy) {
  return `<g class="fortune-teller"><circle class="ball" cx="${f1(cx)}" cy="${f1(cy - 2)}" r="6"/><path class="stand" d="M${f1(cx - 6)} ${f1(cy + 7)} h12 l-2 -4 h-8 Z"/><path class="shine" d="M${f1(cx - 3)} ${f1(cy - 5)} q1 -2 3 -2"/></g>`;
}
function fountain(cx, cy) {
  return `<g class="fountain"><path class="basin" d="M${f1(cx - 9)} ${f1(cy + 3)} q9 7 18 0 Z"/><path class="spray" d="M${f1(cx)} ${f1(cy + 2)} V${f1(cy - 8)} M${f1(cx)} ${f1(cy - 7)} q-5 0 -6 6 M${f1(cx)} ${f1(cy - 7)} q5 0 6 6"/></g>`;
}
export function temple(cx, cy, label) {
  return `<g class="temple"><path class="t-roof" d="M${f1(cx - 15)} ${f1(cy - 8)} L${f1(cx)} ${f1(cy - 18)} L${f1(cx + 15)} ${f1(cy - 8)} Z"/><path class="t-cols" d="M${f1(cx - 12)} ${f1(cy - 8)} V${f1(cy + 6)} M${f1(cx - 4)} ${f1(cy - 8)} V${f1(cy + 6)} M${f1(cx + 4)} ${f1(cy - 8)} V${f1(cy + 6)} M${f1(cx + 12)} ${f1(cy - 8)} V${f1(cy + 6)} M${f1(cx - 15)} ${f1(cy + 6)} H${f1(cx + 15)}"/><text class="t-label" x="${f1(cx)}" y="${f1(cy + 15)}" text-anchor="middle">${esc(label)}</text></g>`;
}

// ---- 駅・ゲート ----
function station(view, pl, chars) {
  const id = pl.id;
  const n = view.nodes[id];
  const owner = chars[n.owner];
  const x = px(pl.x), y = px(pl.y), w = px(pl.w), h = px(pl.h);
  const pencil = n.state === 'fog';
  const t = pencil ? 'pencil' : 'pen';
  const color = owner ? hl(owner.color) : '#ddd';
  const narrow = pl.w < 6;
  let s = `<g class="station ${n.type} st-${n.state}" data-node="${esc(id)}">`;
  s += `<rect class="st-paper" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
  s += `<rect class="owner-band${pencil ? ' faint' : ''}" x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${U - 1}" fill="${color}"/>`;
  if (n.state === 'current') s += `<rect class="wash" x="${x + 1}" y="${y + U}" width="${w - 2}" height="${h - U - 1}" fill="${tint(color, 0.3)}"/>`;
  s += `<text class="st-id ${t}" x="${x + 3.5}" y="${y + U - 4}">${esc(id)}${n.type === 'camp' || narrow ? '' : `<tspan class="st-owner" dx="4">${esc(owner?.name || '')}</tspan>`}</text>`;
  const lines = wrapJa(n.title, (pl.w * U - 7) / 10.2, 3);
  lines.forEach((l, k) => (s += `<text class="st-title ${t}" x="${x + 3.5}" y="${y + U * (2 + k) - 4}">${esc(l)}</text>`));
  let status = own(STATE_JA, n.state) || n.state;
  if (n.state === 'cleared' && n.battle && n.check?.kind === 'cmd') status = `✓ ${n.battle.pass}/${n.battle.pass + n.battle.fail}`;
  if (n.type === 'camp') status = n.state === 'cleared' ? '✓ セーブ' : 'セーブ';
  else if (n.check?.kind === 'stamp' && n.state !== 'cleared' && n.state !== 'fog') status = 'ハンコ待ち';
  else if (n.state === 'cleared' && n.fails) status = `✓ 完了 ✗${n.fails}`;
  if (narrow && status.length > 3) status = status.replace('✓ ', '✓');
  s += `<text class="st-status ${t} s-${n.state}" x="${x + w - 3}" y="${y + U - 4}" text-anchor="end">${esc(status)}</text>`;
  s += `<path class="${pencil ? 'pencil' : 'pen'} st-line" d="${ruled(pl.x, pl.y, pl.w, pl.h, `st:${id}`, 0.28)}"/>`;
  if (n.type === 'camp') s += `<g class="town-mark" transform="translate(${x + w - 26} ${y + h - 20})">${house(0, 2, 11, 12, 'tm1:' + id)}${house(10, 0, 12, 14, 'tm2:' + id)}</g><text class="town-label" x="${x + 3.5}" y="${y + h - 4}">町・宿屋</text>`;
  if (false) s += `<g class="cup" transform="translate(${x + w - 14} ${y + h - 9})"><path d="M-6 -4 h10 v5 q0 4 -5 4 q-5 0 -5 -4 z M4 -2 q3 0 3 2 q0 2 -3 2 M-3 -7 q1 -2 0 -3 M0 -7 q1 -2 0 -3"/></g>`;
  if (n.state === 'cleared') {
    if (n.check?.kind === 'stamp') s += `<g class="hanko" transform="translate(${x + w - 9} ${y + h - 9}) rotate(-12)"><circle r="10"/><circle r="7.6" class="thin"/><text y="4.2" text-anchor="middle">${esc([...(owner?.name || '印')][0])}</text></g>`;
    else if (n.type !== 'camp') s += `<path class="hanamaru" d="${hanamaru(x + w - 5, y + h - 5, 14, `hm:${id}`)}"/>`;
  }
  if (n.state === 'stale') s += `<rect class="erased" x="${x + 3}" y="${y + U}" width="${w - 6}" height="${h - U - 3}"/>`;
  return s + '</g>';
}

function band(view, pl, chars, lay) {
  const n = view.nodes[pl.id];
  const isGoal = view.quest?.goal === pl.id;
  const members = pl.members;
  const here = (m) => (chars[m].at === pl.id && chars[m].status === 'waiting') || chars[m].status === 'done';
  const waiting = members.filter(here);
  const pencil = n.state === 'fog';
  const ink = pencil ? 'pencil' : 'pen';
  const { x, y, w, h } = pl;
  let s = `<g class="band${isGoal ? ' goal' : ''} b-${n.state}" data-node="${esc(pl.id)}">`;
  s += `<rect class="band-paper" x="${px(x)}" y="${px(y + 1)}" width="${px(w)}" height="${px(h - 1)}"/>`;
  // 城壁の上の凸凹。道が入るところ（門）はあける
  const doorCols = new Set(Object.values(pl.doors).flatMap((c) => [c, c + 1]));
  let cren = '';
  for (let k = 0; k < w; k++) {
    const cx = x + k;
    if (doorCols.has(cx)) continue;
    if (k % 2 === 0) cren += `M${px(cx)} ${px(y + 1)} V${px(y)} H${px(cx + 1)} V${px(y + 1)} `;
  }
  s += `<path class="merlons" d="${cren}"/><path class="${ink} crenel" d="${cren}"/>`;
  s += `<path class="${ink} band-line" d="${ruled(x, y + 1, w, h - 1, `band:${pl.id}`, 0.22)}"/>`;
  for (const [m, c] of Object.entries(pl.doors)) {
    s += `<path class="${ink} door-line" d="M${px(c)} ${px(y + 1.6)} Q${px(c + 1)} ${px(y + 0.4)} ${px(c + 2)} ${px(y + 1.6)}" stroke="${hl(chars[m].color)}"/>`;
    if (!here(m)) s += `<text class="door-who" x="${px(c + 1)}" y="${px(y + 0.85)}" text-anchor="middle">${esc([...chars[m].name][0])}</text>`;
  }
  // ボス（右の端）
  const bx = x + w - 1.6;
  const bs = boss(px(bx), px(y + 2.6), px(1.5), `boss:${pl.id}`, n.state === 'cleared' ? 'beaten' : n.state === 'ready' ? 'angry' : 'calm');
  s += `<g class="boss ${ink}"><path d="${bs.horns}"/><path d="${bs.head}" class="head"/>${bs.brow ? `<path d="${bs.brow}"/>` : ''}${bs.eyes.map(([ex, ey]) => `<circle cx="${f1(ex)}" cy="${f1(ey)}" r="${f1(bs.eyeR)}" class="eye"/>`).join('')}<path d="${bs.teeth}"/></g>`;
  if (n.state === 'cleared') s += `<path class="boss-x" d="M${px(bx - 0.8)} ${px(y + 1.8)} L${px(bx + 0.8)} ${px(y + 3.4)} M${px(bx + 0.8)} ${px(y + 1.8)} L${px(bx - 0.8)} ${px(y + 3.4)}"/>`;
  const title = n.title.replace(/^(結合|あがり)[:：]\s*/, '');
  let label;
  if (n.state === 'cleared') label = `✓ 通過${n.battle ? ` テスト ${n.battle.pass}/${n.battle.pass + n.battle.fail}` : ''}  撃破！`;
  else if (n.state === 'ready') label = '全員そろった → 結合テストを実行';
  else label = `待機 ${waiting.length}/${members.length}`;
  let tx = x + 0.5;
  if (isGoal) {
    [...'あがり'].forEach((ch, k) => (s += `<path class="${ink} title-box" d="${ruled(x + 1 + k * 2, y + 1.5 - 0.5, 2, 2, `goal${k}`, 0.22)}"/><text class="goal-char" x="${px(x + 2 + k * 2)}" y="${px(y + 2.6)}" text-anchor="middle">${ch}</text>`));
    tx = x + 7.5;
  }
  const room = (bx - 1.4 - tx) * U;
  const head = `${pl.id} 結合テスト（${isGoal ? '大ボス' : '中ボス'}）`;
  let t2 = '';
  for (const ch of [...title]) {
    if (textW(head, 12.5) + 10 + textW(t2 + ch + '…', 11) > room) {
      t2 += '…';
      break;
    }
    t2 += ch;
  }
  const lineY = isGoal ? [y + 2.2, y + 3.45] : [y + 2.25, y + 3.5];
  s += `<text class="band-title" x="${px(tx)}" y="${px(lineY[0])}"><tspan class="band-id">${esc(head)}</tspan> ${esc(t2)}</text>`;
  s += `<text class="band-status s-${n.state}" x="${px(tx)}" y="${px(lineY[1])}">${esc(label)}</text>`;
  if (n.state === 'cleared') s += `<path class="hanamaru" d="${hanamaru(px(bx), px(y + 2.6), 22, `hm:${pl.id}`)}"/>`;
  return s + '</g>';
}

/** どのマスが、だれの出来事で効いたか（試作: ビューから分かるぶん） */
function firedOf(view, rd) {
  const n = view.nodes[rd.from];
  const out = new Map();
  if (!n || n.state !== 'cleared') return out;
  for (const s of rd.squares) {
    if (!s.ev) continue;
    let hit = null;
    if (s.ev === 'plus2' && n.type === 'task' && n.check?.kind === 'cmd' && !n.fails) hit = '一発合格';
    else if (s.ev === 'rest' && n.fails) hit = `✗${n.fails}`;
    else if (s.ev === 'omikuji') hit = FORTUNES[Math.floor(rng(`${rd.char}:${rd.from}:${s.no}`)() * FORTUNES.length)];
    if (hit) out.set(s.no, hit);
  }
  return out;
}

export function renderPage(view, lay, p, sprites) {
  const page = lay.pages[p];
  const chars = byId(view.characters);
  const W = px(PAGE.w), Hh = px(PAGE.h);
  const last = p === lay.pages.length - 1;
  let out = `<g class="page" data-page="${p + 1}">
    <rect class="page-sheet" x="0" y="0" width="${W}" height="${Hh}" rx="2"/>
    <rect x="${px(GRID.x)}" y="${px(GRID.y)}" width="${px(GRID.w)}" height="${px(GRID.h)}" fill="url(#g5)"/>
    <rect x="${px(GRID.x)}" y="${px(GRID.y)}" width="${px(GRID.w)}" height="${px(GRID.h)}" fill="url(#g10)"/>
    <text class="printed" x="${px(22.6)}" y="${px(2.2)}">No.</text><path class="printed-line" d="M${px(24)} ${px(2.35)} H${px(28.4)}"/>
    <text class="printed" x="${px(29)}" y="${px(2.2)}">Date</text><path class="printed-line" d="M${px(31)} ${px(2.35)} H${px(35)}"/>
    <text class="hand date" x="${px(24.4)}" y="${px(2.05)}">${esc(view.quest?.id || '')}-${p + 1}</text>
    <text class="hand date" x="${px(31.3)}" y="${px(2.05)}">10 . 21</text>
    <text class="page-no" x="${W / 2}" y="${px(50.2)}" text-anchor="middle">— ${p + 1} —</text>
  </g>`;
  // 見出し
  if (p === 0) {
    // 題名は1字1マス（14字までは2×2目のマス、それより長ければ1目のマス）
    const title = [...(view.quest?.title || '')];
    const big = title.length <= 14;
    const cell = big ? 2 : 1;
    title.slice(0, big ? 14 : 30).forEach((ch, k) => (out += `<path class="title-box" d="${ruled(3 + k * cell, big ? 3.5 : 4.5, cell, cell, `tb${k}`, 0.22)}"/><text class="title-char${big ? '' : ' small'}" x="${px(3 + k * cell + cell / 2)}" y="${px(big ? 5.1 : 5.32)}" text-anchor="middle">${esc(ch)}</text>`));
    out += `<text class="pitch" x="${px(3)}" y="${px(6.8)}">${esc(view.quest?.pitch || '')}</text>`;
    // ふりだし（1字1マス）と、村の柵
    out += `<g class="village">${house(px(28.2), px(7.1), 15, 16, 'v1')}${house(px(29.5), px(6.6), 15, 20, 'v2')}<path class="sign" d="M${px(31.4)} ${px(8.9)} V${px(7.4)} h${px(2.6)} v${px(0.9)} h${-px(2.6)}"/><text class="sign-text" x="${px(31.55)}" y="${px(8.05)}">酒場</text></g>`;
    out += `<text class="village-label" x="${px(11.4)}" y="${px(8.9)}">始まりの村</text>`;
    [...'ふりだし'].forEach((ch, k) => (out += `<path class="title-box small" d="${ruled(3 + k * 2, 7.5, 2, 2, `fd${k}`, 0.22)}"/><text class="start-char" x="${px(4 + k * 2)}" y="${px(9.05)}" text-anchor="middle">${ch}</text>`));
    out += `<path class="fence" d="M${px(16.5)} ${px(9.5)} H${px(27.5)} ${Array.from({ length: 11 }, (_, k) => `M${px(17 + k)} ${px(8.8)} V${px(9.9)}`).join(' ')}"/>`;
    out += `<g class="doodle"><path d="${circle(px(32.4), px(4.4), px(0.8), 'sun', 0.5)} M${px(32.4)} ${px(3.1)} v-5 M${px(33.7)} ${px(4.4)} h5 M${px(31.1)} ${px(4.4)} h-5 M${px(33.4)} ${px(3.4)} l3 -3 M${px(31.4)} ${px(3.4)} l-3 -3"/></g>`;
  } else {
    out += `<text class="cont-head" x="${px(3)}" y="${px(3.85)}">（つづき）</text>`;
  }
  // 名札（レーンの上）と、駒がよそのページにいるときの印
  const tagY = p === 0 ? 10.7 : 4.75;
  for (const id of lay.lanes) {
    const g = page.lanes[id];
    const c = chars[id];
    const where = pageOfPawn(view, lay, c);
    const mark = where === p ? '' : where > p ? ` ↓p.${where + 1}` : where < p ? ` ↑p.${where + 1}` : '';
    const name = g.w >= 4 ? c.name : [...c.name][0];
    out += `<g class="lane-tag" data-char="${esc(id)}"><rect x="${px(g.x) + 1}" y="${px(tagY - 0.8)}" width="${px(g.w) - 2}" height="${px(0.95)}" fill="${hl(c.color)}" class="tag-bg"/><text x="${px(g.x) + 3}" y="${px(tagY - 0.02)}">${esc(name)}<tspan class="tag-mark">${esc(g.w >= 4 ? mark : '')}</tspan></text></g>`;
  }
  // 地形（いちばん下）
  out += `<g class="terrain-layer">${page.terrain.map(terrainMarkup).join('')}</g>`;
  // 道（キャラの色の蛍光ペン）とマス
  for (const rd of lay.roads.filter((r) => r.page === p)) {
    const c = chars[rd.char];
    const color = hl(c.color);
    const pts = rd.squares.map((s) => [px(s.x + 1), px(s.y + 1)]);
    // 駅の縁まで
    const from = lay.place[rd.from];
    const to = lay.place[rd.to];
    if (pts.length) {
      const first = rd.squares[0];
      const lastSq = rd.squares[rd.squares.length - 1];
      const head = rd.cont.top ? [[px(first.x + 1), px(first.y)]] : from ? [[px(first.x + 1), px(from.y + from.h)]] : [[px(first.x + 1), px(first.y)]];
      const tail = rd.cont.bottom ? [[px(lastSq.x + 1), px(lastSq.y + 2.6)]] : to ? [[px(lastSq.x + 1), px(to.y)]] : [];
      const all = [...head, ...pts, ...tail];
      out += `<path class="road" data-char="${esc(rd.char)}" d="M${all.map(([a, b]) => `${a} ${b}`).join(' L')}" stroke="${color}"/>`;
    }
    const fired = firedOf(view, rd);
    const dest = view.nodes[rd.to];
    const tests = dest?.battle?.tests || [];
    let mi = 0;
    for (const s of rd.squares) {
      const hit = fired.get(s.no);
      const cx = px(s.x + 1);
      const cy = px(s.y + 1);
      out += `<g class="sq${s.ev ? ' ev-' + s.ev : ' battle'}${hit ? ' fired' : ''}"><rect class="sq-paper" x="${px(s.x)}" y="${px(s.y)}" width="${px(2)}" height="${px(2)}"/><path class="pen sq-line" d="${ruled(s.x, s.y, 2, 2, `sq:${rd.char}:${s.no}`, 0.22)}"/>`;
      if (!s.ev) {
        const t = tests.length ? tests[mi % tests.length] : null;
        const slain = dest && dest.state === 'cleared';
        out += `<title>${esc(t ? `テスト「${t.name}」` : 'まだ戦っていないテスト')}</title>` + monster(cx, cy + 1, `m:${rd.char}:${s.no}`, !slain);
        mi++;
      } else if (s.ev === 'treasure') out += chest(cx, cy + 2);
      else if (s.ev === 'omikuji') out += fortune(cx, cy + 1) + (hit ? `<text class="fortune" x="${cx}" y="${cy + 14}" text-anchor="middle">${esc(hit)}</text>` : '');
      else if (s.ev === 'rest') out += fountain(cx, cy + 2);
      else if (s.ev === 'plus2') out += `<text class="ev-glyph medal" x="${cx}" y="${cy + 5}" text-anchor="middle">◎</text>`;
      else if (s.ev === 'back3') out += `<text class="ev-glyph trap" x="${cx}" y="${cy + 5}" text-anchor="middle">罠</text>`;
      if (hit) out += `<circle class="dot" cx="${px(s.x) + 5}" cy="${px(s.y) + 5}" r="2.6" fill="${color}"/>`;
      out += '</g>';
    }
    if (rd.cont.bottom && rd.squares.length) {
      const s = rd.squares[rd.squares.length - 1];
      out += `<path class="cont-arrow" d="M${px(s.x + 1)} ${px(s.y + 2.2)} v${px(0.9)} m-4 -5 l4 5 l4 -5"/>`;
    }
  }
  for (const id of page.nodes) {
    const pl = lay.place[id];
    out += pl.type === 'gate' ? band(view, pl, chars, lay) : station(view, pl, chars);
  }
  for (const c of view.characters) {
    const tc = classChangeAt(view, c);
    if (!tc) continue;
    const pl = lay.place[tc.node];
    if (!pl || pl.page !== p || pl.type === 'gate') continue;
    const g = page.lanes[c.id];
    const right = pl.x + pl.w + 1.6 <= g.x + g.w + 1.2;
    out += temple(px(right ? pl.x + pl.w + 1 : pl.x - 1), px(pl.y + 2.2), `Lv${tc.level}`);
  }
  if (last) {
    const ly = 48.2;
    let lx = 3;
    for (const [g, name] of [['', 'モンスター＝テスト1件'], ['◎', 'メダル（一発合格）'], ['宝', '宝箱（判定のバグ発見）'], ['？', '占い師'], ['泉', '泉（なにもない）'], ['罠', '罠（封印破り）']]) {
      out += `<g class="legend"><text class="lg-glyph" x="${px(lx + 0.5)}" y="${px(ly + 0.78)}" text-anchor="middle">${g}</text><text class="lg-name" x="${px(lx + 1.2)}" y="${px(ly + 0.8)}">${name}</text></g>`;
      lx = Math.ceil(lx + 1.2 + textW(name, 9.5) / U + 0.4);
    }
  }
  out += pawnsMarkup(view, lay, p, sprites);
  return out;
}

/** つぎにクラスチェンジする駅（全部一発で通ったとして、Lv3・Lv6 に届くところ） */
export function classChangeAt(view, c) {
  if (c.status === 'done' || c.level >= 6) return null;
  const goalLv = c.level < 3 ? 3 : 6;
  let lv = c.level;
  let xp = c.xp;
  for (let i = c.pos; i < c.path.length; i++) {
    const n = view.nodes[c.path[i]];
    xp += n.type === 'gate' ? 3 : n.type === 'camp' ? 0 : 1;
    while (xp >= lv + 1 && lv < 9) (xp -= lv + 1), lv++;
    if (lv >= goalLv) return { node: c.path[i], level: goalLv };
  }
  return null;
}

function pageOfPawn(view, lay, c) {
  const id = c.at ?? view.quest?.goal;
  const pl = lay.place[id];
  const rd = pl && pl.type !== 'gate' && lay.roads.find((r) => r.char === c.id && r.to === id && !r.cont.top && r.squares.length);
  return rd ? rd.page : pl?.page ?? 0;
}

function pawnsMarkup(view, lay, p, sprites) {
  let out = '';
  for (const c of view.characters) {
    const id = c.at ?? view.quest?.goal;
    const pl = lay.place[id];
    if (!pl) continue;
    const rd0 = pl.type !== 'gate' && lay.roads.find((r) => r.char === c.id && r.to === id && !r.cont.top && r.squares.length);
    if ((rd0 ? rd0.page : pl.page) !== p) continue;
    let x, y;
    if (pl.type === 'gate') {
      x = px((pl.doors[c.id] ?? pl.x) + 1);
      y = px(pl.y) + 14;
    } else {
      const rd = lay.roads.find((r) => r.char === c.id && r.to === id && !r.cont.top && r.squares.length);
      if (rd && view.nodes[id].state !== 'cleared') {
        if (rd.page !== p) continue;
        x = px(rd.squares[0].x + 1);
        y = px(rd.squares[0].y + 2) - 2;
      } else {
        x = px(pl.x + pl.w) - 10;
        y = px(pl.y) + 4;
      }
    }
    const size = 2.5 * U;
    const src = own(sprites, c.job);
    const inner = typeof src === 'string' ? src.replace(/var\(--pawn,\s*#ffe45c\)/g, hl(c.color)) : '';
    out += `<g class="pawn" data-char="${esc(c.id)}" transform="translate(${x} ${y})"><svg x="${-size / 2}" y="${-size}" width="${size}" height="${size}" viewBox="0 0 64 64" filter="url(#sticker)">${inner}</svg></g>`;
  }
  return out;
}

export { px };
