// 駒。ビューの (マス, square) が前に進んだら、間のマスを1つずつ踏んで進む（§50.9）。戻されるときは引きずられて戻る。
import { U, stopOf, stopIndex } from './world.js';
import { wx, wy, spriteMarkup } from './draw.js';
import { esc, hl, box, own } from './sketch.js';

const SIZE = 3.3 * U; // 駒の大きさ（2.7目）
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function badge(c) {
  const st = c.status === 'waiting' ? ' 待' : c.status === 'done' ? ' ♛' : '';
  const text = `Lv${c.level}${st}`;
  const w = Math.max(1.9 * U, text.length * 6 + 8);
  const x = -SIZE / 2 - w + 0.5 * U;
  const y = -0.95 * U;
  return `<g class="pawn-badge"><path d="${box(x, y, w, 0.78 * U, `badge:${c.id}`, 0.4)}" class="badge-bg" stroke="${hl(c.color)}"/><text class="hand badge-text" x="${(x + w / 2).toFixed(1)}" y="${(y + 0.58 * U).toFixed(1)}" text-anchor="middle">${esc(text)}</text></g>`;
}

const tw = (t, px) => [...t].reduce((a, ch) => a + (/[\x20-\x7e]/.test(ch) ? 0.56 : 1), 0) * px;

/** 作業中の駒のふきだし: いま戦うテスト（技術の言葉）と、出撃中ならエージェント */
function bubble(view, c) {
  const n = c.at && view?.nodes ? own(view.nodes, c.at) : null;
  let fight = '';
  if (c.status === 'working' && n?.type === 'task' && n.check?.kind === 'cmd') {
    const cases = Array.isArray(n.cases) ? n.cases : [];
    if (!cases.length) fight = '？ まだ走らせていない';
    else if (c.square != null && c.square < cases.length) fight = `${cases[c.square].ok === false ? '✖' : '⚔'} ${cases[c.square].name}`;
    else fight = '✔ 全部倒した → check';
  } else if (c.status === 'working' && n?.check?.kind === 'stamp') fight = '㊞ ハンコ待ち';
  const agent = c.sortie ? `⏳ ${c.sortie.agent}${c.sortie.model ? ' ' + c.sortie.model : ''}` : '';
  if (!fight && !agent) return '';
  let line = fight;
  while (line && tw(line, 13) > 12 * U) line = [...line].slice(0, -2).join('') + '…';
  const w = Math.max(tw(line, 13), tw(agent, 10.5)) + 16;
  const h = (line ? 1.1 * U : 0) + (agent ? 0.95 * U : 0) + 6;
  const x = -0.6 * U;
  const y = -SIZE - h - 0.25 * U;
  let inner = `<path class="bubble-bg" d="M${x} ${y + 4} q0 -4 4 -4 h${(w - 8).toFixed(1)} q4 0 4 4 v${(h - 8).toFixed(1)} q0 4 -4 4 h${(-(w - 8) + 0.9 * U).toFixed(1)} l-6 7 l1 -7 h-${(0.9 * U - 5).toFixed(1)} q-4 0 -4 -4 Z"/>`;
  if (line) inner += `<text class="hand fight-text" x="${x + 7}" y="${(y + 0.9 * U).toFixed(1)}">${esc(line)}</text>`;
  if (agent) inner += `<g class="sortie-bubble" aria-label="出撃中 ${esc(agent)}"><text class="hand bubble-text" x="${x + 7}" y="${(y + (line ? 1.92 : 0.82) * U).toFixed(1)}">${esc(agent)}</text></g>`;
  return `<g class="pawn-say">${inner}</g>`;
}

export function pawnMarkup(c, sprites, view) {
  const working = c.status === 'working';
  return `${working ? `<ellipse class="pawn-glow" cx="0" cy="-2" rx="${1.55 * U}" ry="${0.62 * U}" fill="${hl(c.color)}"/>` : ''}<ellipse class="pawn-foot" cx="0" cy="0" rx="${0.95 * U}" ry="${0.32 * U}" fill="${hl(c.color)}"/><g class="pawn-body">${spriteMarkup(sprites, c, -SIZE / 2, -SIZE + 0.25 * U, SIZE, 'pawn')}</g>${badge(c)}${bubble(view, c)}`;
}

/** 駒の世界座標（同じ場所に何人もいれば、少しずらす） */
function targets(view, lay) {
  const pts = Object.create(null);
  const seen = new Map();
  for (const c of view.characters) {
    const s = stopOf(view, lay, c);
    if (!s) continue;
    const key = `${s.node}:${s.square}:${s.page}:${s.x}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const shift = s.square == null ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.6 * U : 0;
    pts[c.id] = { x: wx(s.page, s.x) + shift, y: wy(s.y), page: s.page, stop: s };
  }
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
      g.innerHTML = pawnMarkup(c, sprites, view);
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
