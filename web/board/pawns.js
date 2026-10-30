// 駒。ビューの (マス, square) が前に進んだら、間のマスを1つずつ踏んで進む（§50.9）。戻されるときは引きずられて戻る。
import { U, stopIndex, PAWN_H, SAY_AGENT_PX } from './world.js';
import { wx, wy, spriteMarkup } from './draw.js';
import { esc, hl, box, own } from './sketch.js';

const SIZE = PAWN_H * U; // 駒の大きさ
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function badge(c) {
  const st = c.status === 'waiting' ? ' 待' : c.status === 'done' ? ' ♛' : '';
  const text = `Lv${c.level}${st}`;
  const w = Math.max(1.9 * U, text.length * 6 + 8);
  const x = -SIZE / 2 - w + 0.5 * U;
  const y = -0.95 * U;
  return `<g class="pawn-badge"><path d="${box(x, y, w, 0.78 * U, `badge:${c.id}`, 0.4)}" class="badge-bg" stroke="${hl(c.color)}"/><text class="hand badge-text" x="${(x + w / 2).toFixed(1)}" y="${(y + 0.58 * U).toFixed(1)}" text-anchor="middle">${esc(text)}</text></g>`;
}

/**
 * 作業中の駒のふきだし: いま戦うテスト（技術の言葉。2行まで折り返す）と、出撃中ならエージェント。
 * 置き場所は world.js の sayBoxes（札・吹き出し・カードと重ならない所）。上に置けばしっぽは下、下に置けばしっぽは上
 */
function bubble(say, spot) {
  if (!say || !spot) return '';
  const x = (say.x - spot.x) * U;
  const y = (say.y - spot.y) * U;
  const w = say.w * U;
  const h = say.h * U;
  const side = say.side;
  const up = side === 't';
  const r = 4;
  const f = (n) => n.toFixed(1);
  // しっぽ: 上に置けば下へ、下に置けば上へ、横に置けば駒のほうへ。四隅は丸く、時計回りに1本の線で描く
  const tx = Math.max(x + 9, Math.min(x + w - 9, 0.2 * U));
  const ty = Math.max(y + 7, Math.min(y + h - 7, -SIZE * 0.6));
  const top = side === 'b' ? `L${f(tx - 4)} ${y} L${f(tx)} ${f(y - 7 - (say.lift || 0) * U)} L${f(tx + 4)} ${y}` : '';
  const right = side === 'l' ? `L${x + w} ${f(ty - 4)} L${f(x + w + 7)} ${f(ty)} L${x + w} ${f(ty + 4)}` : '';
  const bottom = up ? `L${f(tx + 4)} ${y + h} L${f(tx)} ${f(y + h + 7 + (say.lift || 0) * U)} L${f(tx - 4)} ${y + h}` : '';
  const left = side === 'r' ? `L${x} ${f(ty + 4)} L${f(x - 7)} ${f(ty)} L${x} ${f(ty - 4)}` : '';
  const d = `M${x + r} ${y} ${top} H${x + w - r} Q${x + w} ${y} ${x + w} ${y + r} ${right} V${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} ${bottom} H${x + r} Q${x} ${y + h} ${x} ${y + h - r} ${left} V${y + r} Q${x} ${y} ${x + r} ${y} Z`;
  let inner = `<path class="bubble-bg" d="${d}"/>`;
  say.lines.forEach((l, i) => (inner += `<text class="hand fight-text" x="${(x + 7).toFixed(1)}" y="${(y + (0.9 + i * 1.1) * U).toFixed(1)}">${esc(l)}</text>`));
  if (say.agent) inner += `<g class="sortie-bubble" aria-label="出撃中 ${esc(say.agent)}"><text class="hand bubble-text" x="${(x + 7).toFixed(1)}" y="${(y + (say.lines.length ? 0.82 + say.lines.length * 1.1 : 0.82) * U).toFixed(1)}" font-size="${SAY_AGENT_PX}">${esc(say.agent)}</text></g>`;
  return `<g class="pawn-say" data-side="${{ t: 'top', b: 'bottom', l: 'left', r: 'right' }[side]}">${inner}</g>`;
}

/**
 * 装備（§79.22）: レベル（信頼）が上がると、駒の見た目にも出る。Lv3 剣・Lv5 マント・Lv7 足もとの光・Lv9 王冠。
 * back は駒の後ろ、front は前に描く
 */
function gear(c) {
  const L = Number(c.level) || 1;
  const s = SIZE;
  const f = (n) => n.toFixed(1);
  let back = '';
  let front = '';
  if (L >= 7) back += `<ellipse class="gear-aura" cx="0" cy="0" rx="${f(1.3 * U)}" ry="${f(0.45 * U)}"/>`;
  if (L >= 5) back += `<path class="gear-cape" d="M${f(-s * 0.24)} ${f(-s * 0.6)} Q0 ${f(-s * 0.5)} ${f(s * 0.24)} ${f(-s * 0.6)} L${f(s * 0.44)} ${f(-s * 0.04)} Q0 ${f(s * 0.06)} ${f(-s * 0.44)} ${f(-s * 0.04)} Z" fill="${hl(c.color)}"/>`;
  if (L >= 3) front += `<g class="gear-sword" transform="translate(${f(s * 0.44)} ${f(-s * 0.3)}) rotate(28)"><path class="gear-blade" d="M0 ${f(-s * 0.34)}V${f(s * 0.02)}"/><path class="gear-hilt" d="M-4.5 0H4.5M0 0V6"/></g>`;
  if (L >= 9) front += `<path class="gear-crown" d="M-8 ${f(-s + 1)}l1.5 -8 4 4.5 2.5 -7 2.5 7 4 -4.5 1.5 8z"/>`;
  return { back, front };
}

export function pawnMarkup(c, sprites, lay) {
  const working = c.status === 'working';
  const g = gear(c);
  return `${working ? `<ellipse class="pawn-glow" cx="0" cy="-2" rx="${1.55 * U}" ry="${0.62 * U}" fill="${hl(c.color)}"/>` : ''}<ellipse class="pawn-foot" cx="0" cy="0" rx="${0.95 * U}" ry="${0.32 * U}" fill="${hl(c.color)}"/>${g.back ? `<g class="pawn-gear back">${g.back}</g>` : ''}<g class="pawn-body">${spriteMarkup(sprites, c, -SIZE / 2, -SIZE + 0.25 * U, SIZE, 'pawn')}</g>${g.front ? `<g class="pawn-gear front">${g.front}</g>` : ''}${badge(c)}${bubble(lay?.say?.[c.id], lay?.spots?.[c.id])}`;
}

/** 駒の世界座標（world.js の pawnSpots。同じ場所に何人もいれば、少しずらしてある） */
function targets(view, lay) {
  const pts = Object.create(null);
  for (const [id, sp] of Object.entries(lay.spots || {})) pts[id] = { x: wx(sp.page, sp.x), y: wy(sp.y), page: sp.page, stop: sp.stop };
  return pts;
}

export class Pawns {
  constructor(layer, { walks, onFloat } = {}) {
    this.layer = layer;
    this.els = new Map();
    this.pos = new Map();
    this.anims = new Map();
    this.walks = walks || [];
    this.onFloat = onFloat;
  }

  /** 駒を置く。prev（前のビュー）があれば差分を歩かせる。戻り値: 動いた駒 [{char, page, ms}] */
  update(view, lay, sprites, prev) {
    const pts = targets(view, lay);
    const live = new Set();
    const moved = [];
    for (const c of view.characters) {
      const target = pts[c.id];
      if (!target) continue;
      live.add(c.id);
      let g = this.els.get(c.id);
      if (!g) {
        g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'pawn');
        g.setAttribute('tabindex', '0');
        g.setAttribute('role', 'button');
        this.layer.appendChild(g);
        this.els.set(c.id, g);
      }
      g.dataset.char = c.id;
      g.dataset.at = c.at ?? '';
      g.dataset.status = c.status;
      g.dataset.level = String(c.level);
      g.dataset.square = c.square === null || c.square === undefined ? '' : String(c.square);
      g.dataset.page = String(target.page + 1);
      g.dataset.sortie = c.sortie ? c.sortie.agent : '';
      g.setAttribute('aria-label', `${c.name} Lv${c.level} ${c.at ?? 'あがり'}`);
      const markup = pawnMarkup(c, sprites, lay);
      if (g.__markup !== markup) (g.innerHTML = markup), (g.__markup = markup);
      const before = prev?.characters?.find((p) => p.id === c.id);
      const from = this.pos.get(c.id);
      const changed = before && (before.at !== c.at || (before.square ?? null) !== (c.square ?? null) || before.pos !== c.pos);
      if (changed && from) {
        const list = lay.stops[c.id] || [];
        const i0 = stopIndex(view, lay, before);
        const i1 = list.indexOf(target.stop);
        const back = i0 >= 0 && i1 >= 0 && i1 < i0;
        let route = [];
        if (i0 >= 0 && i1 >= 0) {
          const step = back ? -1 : 1;
          for (let i = i0; back ? i >= i1 : i <= i1; i += step) route.push({ x: wx(list[i].page, list[i].x), y: wy(list[i].y), page: list[i].page });
        }
        const steps = Math.max(0, route.length - 1);
        route[0] = { ...from };
        if (route.length < 2) route.push({ x: target.x, y: target.y, page: target.page });
        route[route.length - 1] = { x: target.x, y: target.y, page: target.page };
        const fromLabel = `${before.at ?? '♛'}${before.square != null ? '#' + before.square : ''}`;
        const toLabel = `${c.at ?? '♛'}${c.square != null ? '#' + c.square : ''}`;
        this.walks.push({ char: c.id, from: fromLabel, to: toLabel, steps, back });
        const ms = this.animate(c.id, g, route, back);
        moved.push({ char: c.id, page: target.page, ms, back });
        if (before.level !== c.level) this.float(target, c.level > before.level ? `レベルアップ！ Lv${c.level}` : `Lv ダウン… Lv${c.level}`, c.level > before.level ? 'up' : 'down', ms);
      } else {
        this.place(g, target);
      }
      this.pos.set(c.id, { x: target.x, y: target.y, page: target.page });
    }
    for (const [id, g] of this.els) if (!live.has(id)) (g.remove(), this.els.delete(id), this.pos.delete(id));
    return moved;
  }

  place(g, p) {
    g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  }

  /** 1マスずつ跳ねて進む。かかる時間（ms）を返す */
  animate(id, g, route, back) {
    if (this.anims.has(id)) cancelAnimationFrame(this.anims.get(id));
    if (reduced() || route.length < 2) {
      this.place(g, route[route.length - 1]);
      return 0;
    }
    const seg = back ? 110 : 330;
    const total = seg * (route.length - 1);
    const t0 = performance.now();
    g.classList.toggle('dragged', back);
    g.classList.add('walking');
    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - t0) / total));
      const f = t * (route.length - 1);
      const i = Math.min(route.length - 2, Math.floor(f));
      const k = f - i;
      const a = route[i];
      const b = route[i + 1];
      // 別のページへは、めくった先にぽんと出る（机の上は歩かない）
      const jump = a.page !== b.page;
      const kk = jump ? (k < 0.5 ? 0 : 1) : k;
      const hop = back || jump ? 0 : Math.sin(Math.PI * k) * 0.9 * U;
      g.setAttribute('transform', `translate(${(a.x + (b.x - a.x) * kk).toFixed(1)} ${(a.y + (b.y - a.y) * kk - hop).toFixed(1)})`);
      if (t < 1) this.anims.set(id, requestAnimationFrame(tick));
      else {
        this.anims.delete(id);
        g.classList.remove('dragged', 'walking');
        this.place(g, route[route.length - 1]);
      }
    };
    this.anims.set(id, requestAnimationFrame(tick));
    return total;
  }

  float(p, text, kind, delay = 0) {
    const show = () => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', `float-text ${kind}`);
      t.setAttribute('x', p.x);
      t.setAttribute('y', p.y - SIZE - 1.2 * U);
      t.setAttribute('text-anchor', 'middle');
      t.textContent = text;
      this.layer.appendChild(t);
      setTimeout(() => t.remove(), reduced() ? 1800 : 2400);
      this.onFloat?.(text, kind);
    };
    if (delay > 0) setTimeout(show, delay);
    else show();
  }
}
