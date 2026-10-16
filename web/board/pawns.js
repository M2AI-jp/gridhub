// 駒。状態が変わったら、道に沿ってマスごとに跳ねて進む（戻されるときは引きずられて戻る）。
import { pawnPoint, walkPoints, U } from './layout.js';
import { spriteMarkup } from './render.js';
import { esc, hl } from './sketch.js';

const SIZE = 3.3 * U; // 駒の大きさ（約53px）

function badge(c) {
  const st = c.status === 'waiting' ? '<tspan class="pawn-wait"> 待</tspan>' : c.status === 'done' ? '<tspan class="pawn-done"> ♛</tspan>' : '';
  return `<g class="pawn-badge"><rect x="${-1.3 * U}" y="${-SIZE - 0.95 * U}" width="${2.6 * U}" height="${0.9 * U}" rx="${0.45 * U}" class="badge-bg" stroke="${hl(c.color)}"/><text class="hand badge-text" x="0" y="${-SIZE - 0.27 * U}" text-anchor="middle">Lv${c.level}${st}</text></g>`;
}

/** 出撃中のふきだし（エージェント名と砂時計） */
function bubble(c) {
  if (!c.sortie) return '';
  const label = `${c.sortie.agent}${c.sortie.model ? ' ' + c.sortie.model : ''}`;
  const w = Math.max(4.2 * U, label.length * 7 + 2.6 * U);
  const x = 0.6 * U;
  const y = -SIZE - 3.1 * U;
  return `<g class="sortie-bubble" aria-label="出撃中 ${esc(label)}">
    <rect x="${x}" y="${y}" width="${w}" height="${1.5 * U}" rx="${0.75 * U}" class="bubble-bg"/>
    <path d="M${x + 0.7 * U} ${y + 1.5 * U} L${x + 0.2 * U} ${y + 2.2 * U} L${x + 1.4 * U} ${y + 1.5 * U}" class="bubble-bg"/>
    <text class="hand bubble-text" x="${x + 0.55 * U}" y="${y + 1.05 * U}"><tspan class="bubble-hourglass">⏳</tspan> ${esc(label)}</text>
  </g>`;
}

export function pawnMarkup(c, sprites) {
  return `<g class="pawn-body">${spriteMarkup(sprites, c, -SIZE / 2, -SIZE + 0.35 * U, SIZE, 'pawn')}</g>${badge(c)}${bubble(c)}`;
}

/** 駒の座標（同じ場所に何人もいたら少しずらす） */
function targets(view, lay) {
  const pts = {};
  const seen = {};
  for (const c of view.characters) {
    let p = pawnPoint(view, lay, c);
    const n = view.nodes[c.at];
    if (n && n.type === 'gate') p = { x: p.x - 0.6 * U, y: p.y };
    const key = `${Math.round(p.x)}:${Math.round(p.y)}`;
    const k = (seen[key] = (seen[key] || 0) + 1) - 1;
    pts[c.id] = { x: p.x + k * 0.9 * U, y: p.y + 0.9 * U };
  }
  return pts;
}

export class Pawns {
  constructor(layer) {
    this.layer = layer;
    this.els = new Map();
    this.pos = new Map();
    this.anims = new Map();
  }

  /** 盤面に駒を置く。prev（前のビュー）があれば差分を動かす */
  update(view, lay, sprites, prev, prevLay) {
    const pts = targets(view, lay);
    const live = new Set();
    for (const c of view.characters) {
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
      g.dataset.sortie = c.sortie ? c.sortie.agent : '';
      g.setAttribute('aria-label', `${c.name} Lv${c.level} ${c.at ?? 'あがり'}`);
      g.innerHTML = pawnMarkup(c, sprites);
      const target = pts[c.id];
      const before = prev?.characters.find((p) => p.id === c.id);
      const from = this.pos.get(c.id);
      if (before && from && (before.pos !== c.pos || before.at !== c.at)) {
        const back = c.pos < before.pos;
        const route = walkPoints(view, lay, c, before.pos, c.pos).map((p) => {
          const n = view.nodes[c.path[Math.min(c.pos, c.path.length - 1)]];
          return { x: p.x - (n?.type === 'gate' ? 0.6 * U : 0), y: p.y + 0.9 * U };
        });
        route[0] = from;
        route[route.length - 1] = target;
        this.animate(c.id, g, route, back);
        if (before.level !== c.level) this.float(target, c.level > before.level ? 'レベルアップ！' : 'Lv ダウン…', c.level > before.level ? 'up' : 'down');
      } else {
        this.place(g, target);
      }
      this.pos.set(c.id, target);
    }
    for (const [id, g] of this.els) if (!live.has(id)) (g.remove(), this.els.delete(id));
  }

  place(g, p) {
    g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
  }

  animate(id, g, route, back) {
    if (this.anims.has(id)) cancelAnimationFrame(this.anims.get(id));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || route.length < 2) return this.place(g, route[route.length - 1]);
    const seg = back ? 140 : 380;
    const total = seg * (route.length - 1);
    const t0 = performance.now();
    g.classList.toggle('dragged', back);
    const tick = (now) => {
      const t = Math.max(0, Math.min(1, (now - t0) / total));
      const f = t * (route.length - 1);
      const i = Math.min(route.length - 2, Math.floor(f));
      const k = f - i;
      const a = route[i];
      const b = route[i + 1];
      const hop = back ? 0 : Math.sin(Math.PI * k) * 1.4 * U;
      const x = a.x + (b.x - a.x) * k;
      const y = a.y + (b.y - a.y) * k - hop;
      g.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      if (t < 1) this.anims.set(id, requestAnimationFrame(tick));
      else {
        this.anims.delete(id);
        g.classList.remove('dragged');
        this.place(g, route[route.length - 1]);
      }
    };
    this.anims.set(id, requestAnimationFrame(tick));
  }

  float(p, text, kind) {
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('class', `hand float-text ${kind}`);
    t.setAttribute('x', p.x);
    t.setAttribute('y', p.y - SIZE - 1.4 * U);
    t.setAttribute('text-anchor', 'middle');
    t.textContent = text;
    this.layer.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }
}

export { esc };
