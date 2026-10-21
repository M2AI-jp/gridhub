// 盤面（SVG）を描く。ノートの1ページ（紙・綴じ・方眼）・道・マス・ゲート・宿屋・名札。駒は pawns.js。
// 線は筆記具を data-tool で描き分ける: 鉛筆 pencil（霧）/ ボールペン ballpoint / 蛍光ペン marker / 赤ペン redpen（RULEBOOK §10）。
import { U, CELL, HEAD_W, TOP, LEFT, GATE_W, CAMP, LANE_H, pageBox } from './layout.js';
import { INK, hl, tint, rect, box, scribble, line, circle, road, hanamaru, boss, inn, tape, crenel, goalFlag, arrow, star, wrap, esc, rng, own, byId } from './sketch.js';

export const STATUS_JA = {
  fog: '霧の中',
  open: '見えている',
  current: '作業中',
  waiting: '待機中',
  ready: 'ボス戦の準備OK',
  cleared: '突破',
  stale: '要再検証',
};

export function defs() {
  return `
  <defs>
    <pattern id="grid-5mm" width="${U}" height="${U}" patternUnits="userSpaceOnUse">
      <path d="M${U} 0 V${U} M0 ${U} H${U}" fill="none" stroke="var(--grid)" stroke-width="0.7" stroke-dasharray="1.2 2.2"/>
    </pattern>
    <pattern id="grid-10mm" width="${U * 2}" height="${U * 2}" patternUnits="userSpaceOnUse">
      <path d="M${U * 2} 0 V${U * 2} M0 ${U * 2} H${U * 2}" fill="none" stroke="var(--grid-strong)" stroke-width="0.8"/>
    </pattern>
    <pattern id="paper-grain" width="173" height="173" patternUnits="userSpaceOnUse">${grainTile()}</pattern>
    <radialGradient id="paper-tone" cx="46%" cy="40%" r="80%">
      <stop offset="0.5" stop-color="#d8b464" stop-opacity="0"/>
      <stop offset="0.86" stop-color="#d1a95a" stop-opacity="0.12"/>
      <stop offset="1" stop-color="#b98d3f" stop-opacity="0.26"/>
    </radialGradient>
    <radialGradient id="smear">
      <stop offset="0" stop-color="#555a63" stop-opacity="0.13"/>
      <stop offset="0.6" stop-color="#555a63" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#555a63" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="ring-metal" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0" stop-color="#fbfbf8"/>
      <stop offset="0.45" stop-color="#b4b8be"/>
      <stop offset="1" stop-color="#686d74"/>
    </linearGradient>
    <filter id="smudge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="graphite" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.4" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.75" result="grain"/>
      <feComposite in="d" in2="grain" operator="in"/>
    </filter>
    <filter id="sticker" x="-25%" y="-25%" width="150%" height="160%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="3.1" result="cut"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="2.4" result="fat"/>
      <feFlood flood-color="#cfc6b2"/>
      <feComposite in2="cut" operator="in" result="rim"/>
      <feFlood flood-color="#fffdf6"/>
      <feComposite in2="fat" operator="in" result="edge"/>
      <feGaussianBlur in="cut" stdDeviation="1.8" result="blur"/>
      <feOffset in="blur" dx="1.4" dy="2.6" result="drop"/>
      <feComponentTransfer in="drop" result="shadow"><feFuncA type="linear" slope="0.32"/></feComponentTransfer>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="lift" x="-10%" y="-15%" width="125%" height="140%">
      <feDropShadow dx="1.2" dy="2.4" stdDeviation="1.6" flood-color="#4a3416" flood-opacity="0.28"/>
    </filter>
    <filter id="stamp-ink" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.05" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/>
    </filter>
  </defs>`;
}

/** 紙のざらつき（ちいさな繊維とほこり）。同じ種から毎回同じ模様 */
function grainTile() {
  const r = rng('paper-grain');
  let out = '';
  for (let i = 0; i < 90; i++) {
    const c = r() < 0.6 ? '#8a7650' : '#6c6a66';
    out += `<circle cx="${(r() * 173).toFixed(1)}" cy="${(r() * 173).toFixed(1)}" r="${(0.25 + r() * 0.7).toFixed(2)}" fill="${c}" opacity="${(0.05 + r() * 0.12).toFixed(2)}"/>`;
  }
  for (let i = 0; i < 26; i++) {
    const x = r() * 173;
    const y = r() * 173;
    const a = r() * Math.PI * 2;
    const l = 3 + r() * 7;
    out += `<path d="M${x.toFixed(1)} ${y.toFixed(1)} q${(Math.cos(a) * l * 0.5 + 1).toFixed(1)} ${(Math.sin(a) * l * 0.5 - 1).toFixed(1)} ${(Math.cos(a) * l).toFixed(1)} ${(Math.sin(a) * l).toFixed(1)}" fill="none" stroke="#7d6d55" stroke-width="0.45" opacity="${(0.06 + r() * 0.08).toFixed(2)}"/>`;
  }
  return out;
}

/** 日本語の字の幅のめやす（全角 1・半角 0.55） */
function textWidth(s, size) {
  return [...String(s)].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.55 : 1), 0) * size;
}

export function paper(view, lay) {
  const { sheet: s, grid: g } = pageBox(lay);
  let date = view.log?.length ? new Date(view.log[view.log.length - 1].ts) : new Date();
  if (Number.isNaN(date.getTime())) date = new Date();
  const ds = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const title = view.quest?.title || '';
  const seed = `page:${view.quest?.id || ''}`;
  const r = rng(seed);
  // ノートの厚み（下に重なったページ）と、机に落ちる影
  let under = '';
  for (const [dx, dy, o] of [[9, 15, 0.05], [5, 9, 0.07], [2.5, 4.5, 0.09]]) under += `<rect x="${s.x + dx}" y="${s.y + dy}" width="${s.w}" height="${s.h}" rx="4" fill="#3b2a12" opacity="${o}"/>`;
  under += `<rect x="${s.x + 2}" y="${s.y + 3}" width="${s.w}" height="${s.h}" rx="3" class="page-under"/>`;
  // 左の綴じ: とじ穴とリング
  let binding = '<g class="page-binding" aria-hidden="true">';
  const hx = s.x + 0.8 * U;
  for (let y = s.y + 1.3 * U; y < s.y + s.h - 0.8 * U; y += 1.6 * U) {
    const wire = `M${hx} ${y + 0.05 * U} C${hx - 0.25 * U} ${y - 0.8 * U} ${s.x - 1.55 * U} ${y - 0.75 * U} ${s.x - 1.25 * U} ${y + 0.38 * U}`;
    binding += `<ellipse class="hole" cx="${hx}" cy="${y}" rx="${0.3 * U}" ry="${0.26 * U}"/>
      <g class="ring"><path class="ring-shadow" d="${wire}" transform="translate(1.6 2.6)"/><path class="ring-wire" d="${wire}"/></g>`;
  }
  binding += '</g>';
  // 手の跡（右下の鉛筆のこすれ）と、消しゴムのかす
  const smearX = s.x + s.w - (8 + r() * 6) * U;
  const smearY = s.y + s.h - (2.5 + r() * 2) * U;
  let crumbs = '';
  for (let i = 0; i < 5; i++) {
    const cx = s.x + (5 + r() * 5) * U;
    const cy = s.y + s.h - (0.6 + r() * 0.5) * U;
    crumbs += `<path class="crumb" d="M${cx.toFixed(1)} ${cy.toFixed(1)} q${(1.5 + r() * 2).toFixed(1)} ${(-1 - r()).toFixed(1)} ${(3 + r() * 3).toFixed(1)} ${(r() - 0.5).toFixed(1)}"/>`;
  }
  // 題名（マジック）と、蛍光ペンの下線
  const tw = Math.min(textWidth(title, 27), s.x + s.w - 20 * U - LEFT);
  const ty = TOP - 3.4 * U;
  const noX = s.x + s.w - 15.5 * U;
  const dateX = s.x + s.w - 9.2 * U;
  return `
  <g id="paper">
    ${under}
    <rect class="page-sheet" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3"/>
    <rect class="page-grain" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" fill="url(#paper-grain)"/>
    <rect class="page-grain tone" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="3" fill="url(#paper-tone)"/>
    <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="url(#grid-5mm)"/>
    <rect x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" fill="url(#grid-10mm)"/>
    <path class="page-rule" d="M${g.x} ${g.y} H${g.x + g.w}"/>
    <path class="page-margin" d="M${2 * U} ${g.y} V${g.y + g.h}"/>
    <path class="page-margin thin" d="M${2 * U + 3} ${g.y} V${g.y + g.h}"/>
    <ellipse class="smear" cx="${smearX.toFixed(1)}" cy="${smearY.toFixed(1)}" rx="${9 * U}" ry="${3 * U}" fill="url(#smear)" transform="rotate(-9 ${smearX.toFixed(1)} ${smearY.toFixed(1)})"/>
    <g class="crumbs" aria-hidden="true">${crumbs}</g>
    ${binding}
    <g class="page-head">
      ${tw > 0 ? `<path class="title-swipe" data-tool="marker" d="${line(LEFT - 0.3 * U, ty - 0.22 * U, LEFT + tw + 0.3 * U, ty - 0.28 * U, `swipe:${seed}`, 1.4)}"/>` : ''}
      <text class="hand quest-title" x="${LEFT}" y="${ty}">${esc(title)}</text>
      ${tw > 0 ? `<path class="doodle" data-tool="pencil" d="${star(LEFT + tw + 1.4 * U, ty - 0.55 * U, 0.55 * U, `star:${seed}`)}"/>` : ''}
      <text class="hand quest-pitch" x="${LEFT}" y="${TOP - 2 * U}">${esc(wrap(view.quest?.pitch || '', 90, 1)[0] || '')}</text>
      <text class="printed" x="${noX}" y="${ty}">No.</text>
      <path class="printed-line" d="M${noX + 1.5 * U} ${ty + 3} H${noX + 5.6 * U}"/>
      <text class="hand note-no" x="${noX + 1.8 * U}" y="${ty - 1}">${esc(view.quest?.id || '')}</text>
      <text class="printed" x="${dateX}" y="${ty}">Date</text>
      <path class="printed-line" d="M${dateX + 2 * U} ${ty + 3} H${dateX + 8.4 * U}"/>
      <text class="hand note-no" x="${dateX + 2.3 * U}" y="${ty - 1}">${esc(ds)}</text>
    </g>
  </g>`;
}

export function roads(view, lay) {
  let out = '<g id="roads">';
  for (const c of view.characters) {
    const lane = lay.lanes[c.id];
    if (!lane) continue;
    const pts = [[LEFT + HEAD_W - U, lane.y]];
    for (const id of c.path) {
      const p = lay.nodes[id];
      if (!p) continue;
      pts.push([p.x, own(view.nodes, id)?.type === 'gate' ? lane.y : p.y]);
    }
    const color = hl(c.color);
    // 蛍光ペンは2回なぞる（重なったところが濃くなる）
    const d1 = road(pts, `road:${c.id}`, 1.6);
    const d2 = road(pts.map(([x, y]) => [x, y + 2.6]), `road2:${c.id}`, 2.8);
    out += `<g class="road" data-char="${esc(c.id)}" style="--d:${(lane.index * 0.12).toFixed(2)}s">
      <path class="road-ink" data-tool="marker" d="${d1}" stroke="${color}" pathLength="1"/>
      <path class="road-ink pass2" data-tool="marker" d="${d2}" stroke="${color}" pathLength="1"/>
    </g>`;
    // 一方通行の印（マスとマスのあいだ。ボールペンで「＞」）
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (x2 - x1 < 2.5 * U) continue;
      const mx = (x1 + x2) / 2 + (i === 0 ? 0.6 * U : 0);
      const my = (y1 + y2) / 2;
      const s = 0.45 * U;
      const sd = `chev:${c.id}:${i}`;
      out += `<path class="chevron" data-tool="ballpoint" d="${line(mx - s * 0.5, my - s, mx + s * 0.5, my, `${sd}a`, 0.5)} ${line(mx + s * 0.5, my, mx - s * 0.5, my + s, `${sd}b`, 0.5)}"/>`;
    }
  }
  return out + '</g>';
}

export function laneHeads(view, lay, sprites) {
  let out = '<g id="lane-heads">';
  const ys = view.characters.map((c) => lay.lanes[c.id]?.y).filter((y) => y != null);
  if (ys.length) {
    // ふりだし（大きく1つ。道のはじまりへ矢印）
    const top = Math.min(...ys) - CELL / 2 - 0.6 * U;
    const ty = top - 0.5 * U;
    out += `<g class="start-label" aria-hidden="true">
      <text class="hand marker-text furidashi" x="${LEFT}" y="${ty}">ふりだし</text>
      <path class="pen thin start-arrow" data-tool="ballpoint" d="${arrow(LEFT + 5.4 * U, ty - 0.45 * U, LEFT + HEAD_W - 0.7 * U, top + 0.4 * U, 'start-arrow', -0.28)}"/>
    </g>`;
  }
  for (const c of view.characters) {
    const lane = lay.lanes[c.id];
    const x = LEFT;
    const y = lane.y - CELL / 2 - 0.6 * U;
    const w = HEAD_W - 2 * U;
    const h = CELL + 1.2 * U;
    const agent = c.kind === 'human' ? '人間' : c.agent ? c.agent[0].toUpperCase() + c.agent.slice(1) : 'エージェント';
    const xpPct = Math.max(0, Math.min(1, (c.xp || 0) / (c.xp_next || 1)));
    const r = rng(`tilt:${c.id}`);
    const tilt = ((r() - 0.5) * 3).toFixed(2);
    const color = hl(c.color);
    out += `<g class="lane-head" data-char="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)}のキャラクターシート">
      <g class="sticky" transform="rotate(${tilt} ${x + w / 2} ${y + h / 2})">
      <path d="${box(x, y, w, h, `head:${c.id}`, 0.5)}" class="sticky-paper" fill="${tint(color, 0.42)}"/>
      <path d="M${x + w - 1.3 * U} ${y + h + 0.2} L${x + w + 0.3} ${y + h - 1.3 * U} L${x + w - 1.1 * U} ${y + h - 1.1 * U} Z" class="sticky-fold" fill="${tint(color, 0.15)}"/>
      ${spriteMarkup(sprites, c, x + 0.3 * U, y + 0.6 * U, 3.4 * U, 'head')}
      <text class="hand head-name" x="${x + 4 * U}" y="${y + 1.55 * U}">${esc(c.name)}</text>
      <text class="hand head-sub" x="${x + 4 * U}" y="${y + 2.6 * U}">${esc(agent)}・${esc(jobJa(c.job))}</text>
      <text class="hand head-lv" x="${x + 4 * U}" y="${y + 3.9 * U}">Lv${c.level}</text>
      <path d="${rect(x + 5.9 * U, y + 3.45 * U, 3.5 * U, 0.42 * U, `xpbg:${c.id}`, 0.3)}" class="xp-bg" data-tool="pencil"/>
      ${xpPct > 0 ? `<path d="${line(x + 6 * U, y + 3.66 * U, x + 6 * U + 3.3 * U * xpPct, y + 3.66 * U, `xp:${c.id}`, 0.3)}" class="xp-bar" data-tool="marker"/>` : ''}
      <text class="hand head-module" x="${x + 0.4 * U}" y="${y + h - 0.35 * U}">${esc(wrap(c.module || '', 13, 1)[0] || '')}</text>
      <path class="tape" d="${tape(x + w * (0.3 + r() * 0.4), y + 0.05 * U, 3.4 * U, 0.95 * U, `tape:${c.id}`, (r() - 0.5) * 14)}"/>
      </g>
    </g>`;
  }
  return out + '</g>';
}

const JOB_JA = {
  hero: '勇者', warrior: '戦士', mage: '魔法使い', priest: '僧侶', thief: '盗賊', merchant: '商人',
  sage: '賢者', scribe: '書記', herald: '伝令', cartographer: '地図職人', painter: '絵師', villager: '村人',
};
export function jobJa(job) {
  return own(JOB_JA, job) || job || '';
}

/** 駒の絵（sprites[job] があれば色を差し替えて埋め込む。無ければ手描きの丸い駒） */
export function spriteMarkup(sprites, c, x, y, size, seedTag = 'pawn') {
  const color = hl(c.color);
  const src = sprites instanceof Map ? sprites.get(c.job) : own(sprites, c.job);
  if (typeof src === 'string') {
    const inner = src.replace(/var\(--pawn,\s*#ffe45c\)/g, color);
    return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 64 64" class="sprite">${inner}</svg>`;
  }
  const s = size / 64;
  const cx = x + 32 * s;
  const seed = `${seedTag}:${c.id}`;
  const body = `M${x + 14 * s} ${y + 58 * s} Q${x + 16 * s} ${y + 30 * s} ${cx} ${y + 30 * s} Q${x + 48 * s} ${y + 30 * s} ${x + 50 * s} ${y + 58 * s} Z`;
  return `<g class="sprite fallback">
    <ellipse cx="${cx}" cy="${y + 59 * s}" rx="${20 * s}" ry="${4 * s}" fill="none" stroke="${INK}" stroke-width="1.2" opacity=".5"/>
    <path d="${body}" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${circle(cx, y + 20 * s, 13 * s, seed, 0.6)}" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
    <circle cx="${cx - 4.5 * s}" cy="${y + 20 * s}" r="${1.6 * s}" fill="${INK}"/>
    <circle cx="${cx + 4.5 * s}" cy="${y + 20 * s}" r="${1.6 * s}" fill="${INK}"/>
    <path d="M${cx - 3 * s} ${y + 25 * s} Q${cx} ${y + 27.5 * s} ${cx + 3 * s} ${y + 25 * s}" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
    <text x="${cx}" y="${y + 50 * s}" text-anchor="middle" class="hand fallback-initial" font-size="${13 * s}">${esc([...(c.name || '?')][0])}</text>
  </g>`;
}

function sealMark(n, x, y) {
  if (n.type === 'camp') return '';
  if (n.check?.kind === 'stamp') return '';
  const rot = ((rng(`seal:${n.id ?? x}:${y}`)() - 0.5) * 16 - 6).toFixed(1);
  if (n.seal_broken)
    return `<g class="seal broken" transform="translate(${x} ${y}) rotate(${rot})"><rect x="-7" y="-7" width="14" height="14" rx="2" class="seal-box"/><text class="seal-text" y="4" text-anchor="middle">封</text><path d="M-8 -6 L-1 1 L-4 3 L6 9" class="seal-crack"/></g>`;
  if (n.sealed) return `<g class="seal" transform="translate(${x} ${y}) rotate(${rot})"><rect x="-7" y="-7" width="14" height="14" rx="2" class="seal-box"/><text class="seal-text" y="4" text-anchor="middle">封</text></g>`;
  return `<g class="seal unsealed" transform="translate(${x} ${y})"><rect x="-7" y="-7" width="14" height="14" rx="2" class="seal-box"/><text class="seal-text" y="4" text-anchor="middle">未</text></g>`;
}

function hanko(cx, cy, r, ch, seed) {
  const rot = (rng(seed)() - 0.5) * 24;
  return `<g class="stamp-in"><g class="hanko" transform="translate(${cx} ${cy}) rotate(${rot.toFixed(1)})">
    <path d="${circle(0, 0, r, `${seed}:o`, 0.5)}" class="hanko-ring"/>
    <path d="${circle(0, 0, r - 2.5, `${seed}:i`, 0.4)}" class="hanko-ring thin"/>
    <text class="hanko-text" y="${r * 0.36}" text-anchor="middle" font-size="${r * 1.05}">${esc(ch)}</text>
  </g></g>`;
}

/** 消しゴムでこすった跡と、まるまった消しかす */
function eraser(x, y, w, h, seed) {
  const r = rng(seed);
  let streaks = '';
  for (let i = 0; i < 5; i++) {
    const yy = y + 6 + r() * (h - 12);
    streaks += `<path d="${line(x + 4, yy, x + w - 4, yy + (r() - 0.5) * 6, `${seed}:s${i}`, 2)}" class="eraser-streak"/>`;
  }
  let crumbs = '';
  for (let i = 0; i < 5; i++) {
    const cx = x - 8 + r() * 14;
    const cy = y + h - 2 + r() * 10;
    crumbs += `<path d="M${cx.toFixed(1)} ${cy.toFixed(1)} q${(1 + r() * 1.5).toFixed(1)} ${(-1 - r()).toFixed(1)} ${(2.5 + r() * 2.5).toFixed(1)} ${(r() - 0.5).toFixed(1)}" class="eraser-crumb"/>`;
  }
  return `<g class="eraser">
    <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="6" class="eraser-smudge" filter="url(#smudge)"/>
    ${streaks}
    <g class="eraser-crumbs">${crumbs}</g>
  </g>`;
}

export function nodesLayer(view, lay, { fresh = null, selected = null } = {}) {
  let out = '<g id="nodes">';
  const charById = byId(view.characters);
  for (const [id, n] of Object.entries(view.nodes)) {
    const p = lay.nodes[id];
    if (!p) continue;
    const isSel = selected === id ? ' selected' : '';
    const f = own(fresh, id);
    const fr = typeof f === 'string' ? ` fresh-${f}` : '';
    // 最初に描くときの順番（左の列から、ペンで描いていく。どんな大きさの盤面でも 1.4 秒のうちに描きはじめる）
    const style = ` style="--d:${(0.15 + (lay.cols > 1 ? p.col / (lay.cols - 1) : 0) * 1.25).toFixed(2)}s"`;
    if (n.type === 'gate') out += gateMarkup(view, lay, id, n, p, charById, isSel + fr, style);
    else if (n.type === 'camp') out += campMarkup(id, n, p, charById, isSel + fr, style);
    else out += taskMarkup(id, n, p, charById, isSel + fr, style);
  }
  return out + '</g>';
}

function titleLines(n, x, y, cls, width = 7) {
  const lines = wrap(n.title, width, 2);
  return `<text class="hand ${cls}" x="${x}" y="${y}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? '1.15em' : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}

/** マスの中にも方眼が見えるように（紙のマスに、ペンで四角を描いたように） */
function cellGrid(x, y, w, h) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grid-5mm)" class="cell-grid"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grid-10mm)" class="cell-grid"/>`;
}

/** マスの枠（ボールペンか鉛筆で、2回なぞる） */
function outline(x, y, w, h, seed, pencil, cls, wob = 1.4) {
  const tool = pencil ? 'pencil' : 'ballpoint';
  const ink = pencil ? 'pencil-line' : 'pen';
  return `<path d="${rect(x, y, w, h, seed, wob)}" class="${ink} ${cls}" data-tool="${tool}" pathLength="1"/>` +
    `<path d="${rect(x + 0.6, y - 0.5, w, h, `${seed}:2`, wob + 0.5)}" class="${ink} ${cls} pass2" data-tool="${tool}" pathLength="1"/>`;
}

function taskMarkup(id, n, p, chars, extra, style) {
  const x = p.x - CELL / 2;
  const y = p.y - CELL / 2;
  const owner = chars[n.owner];
  const color = owner ? hl(owner.color) : '#ddd';
  const st = n.state;
  const pencil = st === 'fog';
  let inner = '';
  inner += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" class="cell-hit"/>`;
  inner += cellGrid(x, y, CELL, CELL);
  if (st === 'current') inner += `<path d="${scribble(x + 1, y + 1, CELL - 2, CELL - 2, `fill:${id}`, 9)}" class="cell-hl" data-tool="marker" stroke="${color}"/>`;
  inner += outline(x, y, CELL, CELL, `cell:${id}`, pencil, 'cell-line');
  inner += `<text class="hand cell-id${pencil ? ' pencil-text' : ''}" x="${x + 0.35 * U}" y="${y + 0.95 * U}">${esc(id)}</text>`;
  if (n.check?.kind === 'stamp' && st !== 'cleared')
    inner += `<path d="${circle(p.x, p.y + 0.3 * U, 1.1 * U, `stampslot:${id}`, 0.6)}" class="stamp-slot" data-tool="pencil"/><text class="hand stamp-slot-text" x="${p.x}" y="${p.y + 0.62 * U}" text-anchor="middle">印</text>`;
  if (st === 'stale') {
    inner += `<path d="${hanamaru(p.x, p.y + 2, CELL * 0.36, `hm:${id}`)}" class="hanamaru ghost" data-tool="redpen" pathLength="1"/>`;
    inner += eraser(x, y, CELL, CELL, `er:${id}`);
    inner += `<text class="hand stale-note" x="${x + CELL + 3}" y="${y + CELL - 3}">要再検証</text>`;
  }
  if (st === 'cleared') {
    if (n.check?.kind === 'stamp') inner += hanko(p.x, p.y + 2, 1.35 * U, owner ? [...owner.name][0] : '印', `hk:${id}`);
    else inner += `<path d="${hanamaru(p.x, p.y + 2, CELL * 0.36, `hm:${id}`)}" class="hanamaru" data-tool="redpen" pathLength="1"/>`;
  }
  if (n.fails > 0 && st !== 'cleared') inner += `<text class="hand fail-tally" x="${x + CELL - 3}" y="${y + CELL - 4}" text-anchor="end">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  inner += sealMark(n, x + CELL - 0.2 * U, y + 0.25 * U);
  inner += titleLines(n, p.x, y + CELL + 0.95 * U, pencil ? 'cell-title pencil-text' : 'cell-title');
  return `<g class="node task${extra}" data-node="${esc(id)}" data-state="${esc(st)}" data-owner="${esc(n.owner || '')}"${style} tabindex="0" role="button" aria-label="${esc(id)} ${esc(n.title)}（${esc(own(STATUS_JA, st) || st)}）">${inner}</g>`;
}

function campMarkup(id, n, p, chars, extra, style) {
  const x = p.x - CAMP / 2;
  const y = p.y - CAMP / 2;
  const st = n.state;
  const pencil = st === 'fog';
  let inner = `<rect x="${x}" y="${y}" width="${CAMP}" height="${CAMP}" class="cell-hit"/>`;
  inner += cellGrid(x, y, CAMP, CAMP);
  inner += outline(x, y, CAMP, CAMP, `camp:${id}`, pencil, 'cell-line', 1);
  inner += `<path d="${inn(p.x, p.y, CAMP * 0.8, `inn:${id}`)}" class="${pencil ? 'pencil-line' : 'pen'} inn" data-tool="${pencil ? 'pencil' : 'ballpoint'}" pathLength="1"/>`;
  if (st === 'cleared') inner += `<text class="hand camp-done stamp-in" x="${p.x + CAMP / 2 + 2}" y="${y + 6}">休</text>`;
  inner += `<text class="hand camp-label" x="${p.x}" y="${y - 4}" text-anchor="middle">セーブ</text>`;
  inner += titleLines(n, p.x, y + CAMP + 0.95 * U, pencil ? 'cell-title pencil-text' : 'cell-title', 6);
  return `<g class="node camp${extra}" data-node="${esc(id)}" data-state="${esc(st)}" data-owner="${esc(n.owner || '')}"${style} tabindex="0" role="button" aria-label="宿屋 ${esc(n.title)}">${inner}</g>`;
}

function gateMarkup(view, lay, id, n, p, chars, extra, style) {
  const x = p.x - GATE_W / 2;
  const y = p.top;
  const h = p.bottom - p.top;
  const st = n.state;
  const isGoal = view.quest?.goal === id;
  const pencil = st === 'fog';
  const tool = pencil ? 'pencil' : 'ballpoint';
  const ink = pencil ? 'pencil-line' : 'pen';
  const members = n.members || [];
  const waiting = members.filter((m) => {
    const c = chars[m];
    return c && c.at === id && c.status === 'waiting';
  });
  let inner = `<rect x="${x}" y="${y}" width="${GATE_W}" height="${h}" class="gate-paper"/>`;
  inner += cellGrid(x, y, GATE_W, h);
  if (st === 'ready') inner += `<path d="${rect(x - 5, y - 5, GATE_W + 10, h + 10, `ready:${id}`, 2)}" class="gate-ready"/>`;
  // お城の壁（左の凸凹）と、二重の枠
  inner += `<path d="${crenel(x, y, GATE_W * 0.5, 0.75 * U, 2, `crenel:${id}`)}" class="${ink} gate-line crenel" data-tool="${tool}" pathLength="1"/>`;
  inner += outline(x, y, GATE_W, h, `gate:${id}`, pencil, 'gate-line', 1.6);
  inner += `<path d="${rect(x + 4, y + 4, GATE_W - 8, h - 8, `gate2:${id}`, 1.2)}" class="${ink} gate-line thin" data-tool="${tool}" pathLength="1"/>`;
  // 空いている席（まだ来ていない仲間）
  for (const m of members) {
    const c = chars[m];
    const lane = lay.lanes[m];
    if (!c || !lane) continue;
    if (waiting.includes(m) || c.status === 'done') continue;
    inner += `<path d="${circle(p.x - 0.6 * U, lane.y, 0.9 * U, `slot:${id}:${m}`, 0.5)}" class="slot" stroke="${hl(c.color)}"/>`;
    inner += `<text class="hand slot-text" x="${p.x - 0.6 * U}" y="${lane.y + 4}" text-anchor="middle">${esc([...c.name][0])}</text>`;
  }
  // 縦書きの旗
  const label = isGoal ? `あがり ${n.title.replace(/^あがり[:：]\s*/, '')}` : n.title;
  const maxChars = Math.max(4, Math.floor((h - 3 * U) / 14));
  const vt = [...label].slice(0, maxChars).join('') + ([...label].length > maxChars ? '…' : '');
  inner += `<text class="hand gate-title${pencil ? ' pencil-text' : ''}" x="${x + GATE_W - 0.75 * U}" y="${y + 2.2 * U}" writing-mode="vertical-rl">${esc(vt)}</text>`;
  // ボス（結合E2Eの番人）
  const mood = st === 'cleared' ? 'beaten' : st === 'ready' ? 'angry' : 'calm';
  const b = boss(p.x + 1.1 * U, y, 2.1 * U, `boss:${id}`, mood);
  inner += `<g class="boss ${mood}" data-tool="${tool}">
    <path d="${b.horns}" class="boss-horn"/>
    <path d="${b.head}" class="boss-head"/>
    ${b.brow ? `<path d="${b.brow}" class="boss-brow"/>` : ''}
    ${b.eyes.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="${b.eyeR}" class="boss-eye"/>`).join('')}
    <path d="${b.teeth}" class="boss-teeth"/>
  </g>`;
  if (st === 'ready') {
    // ボスの吹き出し（ボールペンの落書き）
    const bx = p.x + 2.5 * U;
    const by = y - 2.7 * U;
    inner += `<g class="boss-say" aria-hidden="true"><path d="${box(bx, by, 5.4 * U, 1.35 * U, `say:${id}`, 0.8)} M${bx + 0.6 * U} ${by + 1.3 * U} L${p.x + 1.9 * U} ${y - 0.9 * U} L${bx + 1.5 * U} ${by + 1.3 * U}" class="say-bubble" data-tool="ballpoint"/><text class="hand marker-text say-text" x="${bx + 2.7 * U}" y="${by + 0.95 * U}" text-anchor="middle">かかってこい！</text></g>`;
  }
  if (isGoal) {
    const fl = goalFlag(x + 0.5 * U, y - 0.75 * U, 2.6 * U, `flag:${id}`);
    inner += `<g class="goal-flag" data-tool="${tool}"><path d="${fl.pole}" class="flag-pole"/><path d="${fl.cloth}" class="flag-cloth"/><path d="${fl.checks}" class="flag-checks"/></g>`;
  }
  if (st === 'cleared') {
    inner += `<path d="${line(p.x + 1.1 * U - 18, y - 16, p.x + 1.1 * U + 18, y + 16, `x1:${id}`, 1)} ${line(p.x + 1.1 * U + 18, y - 16, p.x + 1.1 * U - 18, y + 16, `x2:${id}`, 1)}" class="boss-x stamp-in" data-tool="redpen"/>`;
    inner += `<path d="${hanamaru(p.x - 0.4 * U, p.y, GATE_W * 0.42, `hm:${id}`)}" class="hanamaru big" data-tool="redpen" pathLength="1"/>`;
    inner += `<text class="hand gate-done stamp-in" x="${p.x}" y="${p.bottom + 1.2 * U}" text-anchor="middle">${isGoal ? 'あがり！' : '撃破！'}</text>`;
  } else {
    const label2 = st === 'ready' ? 'ボス戦！' : `待機 ${waiting.length}/${members.length}`;
    inner += `<text class="hand gate-count${pencil ? ' pencil-text' : ''}" x="${p.x}" y="${p.bottom + 1.1 * U}" text-anchor="middle">${label2}</text>`;
  }
  if (n.fails > 0 && st !== 'cleared') inner += `<text class="hand fail-tally" x="${x + 4}" y="${p.bottom - 6}">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  inner += sealMark(n, x + 0.6 * U, p.bottom - 0.7 * U);
  return `<g class="node gate${isGoal ? ' goal' : ''}${extra}" data-node="${esc(id)}" data-state="${esc(st)}"${style} tabindex="0" role="button" aria-label="結合ゲート ${esc(id)} ${esc(n.title)}（${esc(own(STATUS_JA, st) || st)}）">${inner}</g>`;
}

export { LANE_H };
