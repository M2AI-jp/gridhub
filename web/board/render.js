// 盤面（SVG）を描く。紙・方眼・道・マス・ゲート・宿屋・名札。駒は pawns.js。
import { U, CELL, HEAD_W, TOP, LEFT, GATE_W, CAMP, LANE_H } from './layout.js';
import { INK, hl, rect, box, scribble, line, circle, road, hanamaru, boss, inn, wrap, esc, rng } from './sketch.js';

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
    <filter id="smudge" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="pencil" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="1" seed="3" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.1"/>
    </filter>
  </defs>`;
}

export function paper(view, lay) {
  const w = lay.width;
  const h = lay.height;
  const pad = 40 * U;
  const date = view.log?.length ? new Date(view.log[view.log.length - 1].ts) : new Date();
  const ds = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  const title = view.quest?.title || '';
  return `
  <g id="paper">
    <rect x="${-pad}" y="${-pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="var(--paper)"/>
    <rect x="${-pad}" y="${-pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="url(#grid-5mm)"/>
    <rect x="${-pad}" y="${-pad}" width="${w + pad * 2}" height="${h + pad * 2}" fill="url(#grid-10mm)"/>
    <g class="page-head">
      <text class="hand quest-title" x="${LEFT}" y="${TOP - 3.4 * U}">${esc(title)}</text>
      <text class="hand quest-pitch" x="${LEFT}" y="${TOP - 2 * U}">${esc(wrap(view.quest?.pitch || '', 90, 1)[0] || '')}</text>
      <text class="hand note-no" x="${w - 14 * U}" y="${TOP - 3.4 * U}">No. ${esc(view.quest?.id || '')}</text>
      <path d="${line(w - 12 * U, TOP - 3.2 * U, w - 8.5 * U, TOP - 3.2 * U, 'no')}" class="pen thin"/>
      <text class="hand note-no" x="${w - 8 * U}" y="${TOP - 3.4 * U}">Date ${ds}</text>
      <path d="${line(w - 5.6 * U, TOP - 3.2 * U, w - 1 * U, TOP - 3.2 * U, 'date')}" class="pen thin"/>
    </g>
  </g>`;
}

export function roads(view, lay) {
  let out = '<g id="roads">';
  for (const c of view.characters) {
    const lane = lay.lanes[c.id];
    const pts = [[LEFT + HEAD_W - U, lane.y]];
    for (const id of c.path) {
      const p = lay.nodes[id];
      if (!p) continue;
      pts.push([p.x, view.nodes[id].type === 'gate' ? lane.y : p.y]);
    }
    const d = road(pts, `road:${c.id}`, 1.6);
    out += `<path class="road" data-char="${esc(c.id)}" d="${d}" stroke="${hl(c.color)}"/>`;
    // 一方通行の印（マスとマスのあいだ）
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      if (x2 - x1 < 2.5 * U) continue;
      const mx = (x1 + x2) / 2 + (i === 0 ? 0.6 * U : 0);
      const my = (y1 + y2) / 2;
      const s = 0.45 * U;
      out += `<path class="chevron" d="M${mx - s * 0.5} ${my - s} L${mx + s * 0.5} ${my} L${mx - s * 0.5} ${my + s}"/>`;
    }
  }
  return out + '</g>';
}

export function laneHeads(view, lay, sprites) {
  let out = '<g id="lane-heads">';
  for (const c of view.characters) {
    const lane = lay.lanes[c.id];
    const x = LEFT;
    const y = lane.y - CELL / 2 - 0.6 * U;
    const w = HEAD_W - 2 * U;
    const h = CELL + 1.2 * U;
    const agent = c.kind === 'human' ? '人間' : c.agent ? c.agent[0].toUpperCase() + c.agent.slice(1) : 'エージェント';
    const xpPct = Math.max(0, Math.min(1, (c.xp || 0) / (c.xp_next || 1)));
    out += `<g class="lane-head" data-char="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(c.name)}のキャラクターシート">
      <path d="${box(x, y, w, h, `head:${c.id}`, 1)}" class="tag-fill" fill="${hl(c.color)}"/>
      <path d="${rect(x, y, w, h, `head2:${c.id}`, 1.2)}" class="pen"/>
      ${spriteMarkup(sprites, c, x + 0.3 * U, y + 0.6 * U, 3.4 * U, 'head')}
      <text class="hand head-name" x="${x + 4 * U}" y="${y + 1.5 * U}">${esc(c.name)}</text>
      <text class="hand head-sub" x="${x + 4 * U}" y="${y + 2.6 * U}">${esc(agent)}・${esc(jobJa(c.job))}</text>
      <text class="hand head-lv" x="${x + 4 * U}" y="${y + 3.9 * U}">Lv${c.level}</text>
      <path d="${line(x + 5.9 * U, y + 3.65 * U, x + 9.4 * U, y + 3.65 * U, `xpbg:${c.id}`, 0.4)}" class="xp-bg"/>
      ${xpPct > 0 ? `<path d="${line(x + 5.9 * U, y + 3.65 * U, x + 5.9 * U + 3.5 * U * xpPct, y + 3.65 * U, `xp:${c.id}`, 0.3)}" class="xp-bar"/>` : ''}
      <text class="hand head-module" x="${x + 0.4 * U}" y="${y + h - 0.35 * U}">${esc(wrap(c.module || '', 13, 1)[0] || '')}</text>
    </g>
    <text class="hand furidashi" x="${LEFT + HEAD_W - 1.2 * U}" y="${lane.y - CELL / 2 - 0.2 * U}">ふりだし</text>`;
  }
  return out + '</g>';
}

const JOB_JA = {
  hero: '勇者', warrior: '戦士', mage: '魔法使い', priest: '僧侶', thief: '盗賊', merchant: '商人',
  sage: '賢者', scribe: '書記', herald: '伝令', cartographer: '地図職人', painter: '絵師', villager: '村人',
};
export function jobJa(job) {
  return JOB_JA[job] || job || '';
}

/** 駒の絵（sprites[job] があれば色を差し替えて埋め込む。無ければ手描きの丸い駒） */
export function spriteMarkup(sprites, c, x, y, size, seedTag = 'pawn') {
  const color = hl(c.color);
  const src = sprites && sprites[c.job];
  if (src) {
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
  if (n.seal_broken)
    return `<g class="seal broken" transform="translate(${x} ${y}) rotate(-8)"><rect x="-7" y="-7" width="14" height="14" rx="2" class="seal-box"/><text class="seal-text" y="4" text-anchor="middle">封</text><path d="M-8 -6 L-1 1 L-4 3 L6 9" class="seal-crack"/></g>`;
  if (n.sealed) return `<g class="seal" transform="translate(${x} ${y}) rotate(-8)"><rect x="-7" y="-7" width="14" height="14" rx="2" class="seal-box"/><text class="seal-text" y="4" text-anchor="middle">封</text></g>`;
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

function eraser(x, y, w, h, seed) {
  const r = rng(seed);
  let streaks = '';
  for (let i = 0; i < 5; i++) {
    const yy = y + 6 + r() * (h - 12);
    streaks += `<path d="${line(x + 4, yy, x + w - 4, yy + (r() - 0.5) * 6, `${seed}:s${i}`, 2)}" class="eraser-streak"/>`;
  }
  return `<g class="eraser">
    <rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="6" class="eraser-smudge" filter="url(#smudge)"/>
    ${streaks}
    <path d="${line(x + w - 14, y + 4, x + w - 2, y + 4, `${seed}:crumb`, 2)}" class="eraser-crumb"/>
  </g>`;
}

export function nodesLayer(view, lay, { fresh = {}, selected = null } = {}) {
  let out = '<g id="nodes">';
  const charById = Object.fromEntries(view.characters.map((c) => [c.id, c]));
  for (const [id, n] of Object.entries(view.nodes)) {
    const p = lay.nodes[id];
    if (!p) continue;
    const isSel = selected === id ? ' selected' : '';
    const fr = fresh[id] ? ` fresh-${fresh[id]}` : '';
    if (n.type === 'gate') out += gateMarkup(view, lay, id, n, p, charById, isSel + fr);
    else if (n.type === 'camp') out += campMarkup(id, n, p, charById, isSel + fr);
    else out += taskMarkup(id, n, p, charById, isSel + fr);
  }
  return out + '</g>';
}

function titleLines(n, x, y, cls, width = 7) {
  const lines = wrap(n.title, width, 2);
  return `<text class="hand ${cls}" x="${x}" y="${y}" text-anchor="middle">${lines.map((l, i) => `<tspan x="${x}" dy="${i ? '1.15em' : 0}">${esc(l)}</tspan>`).join('')}</text>`;
}

function taskMarkup(id, n, p, chars, extra) {
  const x = p.x - CELL / 2;
  const y = p.y - CELL / 2;
  const owner = chars[n.owner];
  const color = owner ? hl(owner.color) : '#ddd';
  const st = n.state;
  const pencil = st === 'fog';
  let inner = '';
  inner += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" class="cell-hit"/>`;
  if (st === 'current') inner += `<path d="${scribble(x + 1, y + 1, CELL - 2, CELL - 2, `fill:${id}`, 9)}" class="cell-hl" stroke="${color}"/>`;
  inner += `<path d="${rect(x, y, CELL, CELL, `cell:${id}`)}" class="${pencil ? 'pencil-line' : 'pen'} cell-line"/>`;
  inner += `<text class="hand cell-id${pencil ? ' pencil-text' : ''}" x="${x + 0.35 * U}" y="${y + 0.95 * U}">${esc(id)}</text>`;
  if (n.check?.kind === 'stamp' && st !== 'cleared')
    inner += `<path d="${circle(p.x, p.y + 0.3 * U, 1.1 * U, `stampslot:${id}`, 0.6)}" class="stamp-slot"/><text class="hand stamp-slot-text" x="${p.x}" y="${p.y + 0.62 * U}" text-anchor="middle">印</text>`;
  if (st === 'stale') {
    inner += `<path d="${hanamaru(p.x, p.y + 2, CELL * 0.36, `hm:${id}`)}" class="hanamaru ghost"/>`;
    inner += eraser(x, y, CELL, CELL, `er:${id}`);
    inner += `<text class="hand stale-note" x="${x + CELL + 2}" y="${y + 0.9 * U}">要再検証</text>`;
  }
  if (st === 'cleared') {
    if (n.check?.kind === 'stamp') inner += hanko(p.x, p.y + 2, 1.35 * U, owner ? [...owner.name][0] : '印', `hk:${id}`);
    else inner += `<path d="${hanamaru(p.x, p.y + 2, CELL * 0.36, `hm:${id}`)}" class="hanamaru stamp-in"/>`;
  }
  if (n.fails > 0 && st !== 'cleared') inner += `<text class="hand fail-tally" x="${x + CELL - 3}" y="${y + CELL - 4}" text-anchor="end">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  inner += sealMark(n, x + CELL - 0.2 * U, y + 0.25 * U);
  inner += titleLines(n, p.x, y + CELL + 0.95 * U, pencil ? 'cell-title pencil-text' : 'cell-title');
  return `<g class="node task${extra}" data-node="${esc(id)}" data-state="${st}" data-owner="${esc(n.owner || '')}" tabindex="0" role="button" aria-label="${esc(id)} ${esc(n.title)}（${STATUS_JA[st] || st}）">${inner}</g>`;
}

function campMarkup(id, n, p, chars, extra) {
  const x = p.x - CAMP / 2;
  const y = p.y - CAMP / 2;
  const st = n.state;
  const pencil = st === 'fog';
  let inner = `<rect x="${x}" y="${y}" width="${CAMP}" height="${CAMP}" class="cell-hit"/>`;
  inner += `<path d="${rect(x, y, CAMP, CAMP, `camp:${id}`, 1)}" class="${pencil ? 'pencil-line' : 'pen'} cell-line"/>`;
  inner += `<path d="${inn(p.x, p.y, CAMP * 0.8, `inn:${id}`)}" class="${pencil ? 'pencil-line' : 'pen'} inn"/>`;
  if (st === 'cleared') inner += `<text class="hand camp-done stamp-in" x="${p.x + CAMP / 2 + 2}" y="${y + 6}">休</text>`;
  inner += `<text class="hand camp-label" x="${p.x}" y="${y - 4}" text-anchor="middle">セーブ</text>`;
  inner += titleLines(n, p.x, y + CAMP + 0.95 * U, pencil ? 'cell-title pencil-text' : 'cell-title', 6);
  return `<g class="node camp${extra}" data-node="${esc(id)}" data-state="${st}" data-owner="${esc(n.owner || '')}" tabindex="0" role="button" aria-label="宿屋 ${esc(n.title)}">${inner}</g>`;
}

function gateMarkup(view, lay, id, n, p, chars, extra) {
  const x = p.x - GATE_W / 2;
  const y = p.top;
  const h = p.bottom - p.top;
  const st = n.state;
  const isGoal = view.quest?.goal === id;
  const pencil = st === 'fog';
  const members = n.members || [];
  const waiting = members.filter((m) => {
    const c = chars[m];
    return c && c.at === id && c.status === 'waiting';
  });
  let inner = `<rect x="${x}" y="${y}" width="${GATE_W}" height="${h}" class="gate-paper"/>`;
  if (st === 'ready') inner += `<path d="${rect(x - 5, y - 5, GATE_W + 10, h + 10, `ready:${id}`, 2)}" class="gate-ready"/>`;
  inner += `<path d="${rect(x, y, GATE_W, h, `gate:${id}`, 1.6)}" class="${pencil ? 'pencil-line' : 'pen'} gate-line"/>`;
  inner += `<path d="${rect(x + 4, y + 4, GATE_W - 8, h - 8, `gate2:${id}`, 1.2)}" class="${pencil ? 'pencil-line' : 'pen'} gate-line thin"/>`;
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
  const maxChars = Math.max(4, Math.floor((h - 3 * U) / 13));
  const vt = [...label].slice(0, maxChars).join('') + ([...label].length > maxChars ? '…' : '');
  inner += `<text class="hand gate-title${pencil ? ' pencil-text' : ''}" x="${x + GATE_W - 0.75 * U}" y="${y + 2.2 * U}" writing-mode="vertical-rl">${esc(vt)}</text>`;
  // ボス（結合E2Eの番人）
  const mood = st === 'cleared' ? 'beaten' : st === 'ready' ? 'angry' : 'calm';
  const b = boss(p.x + 1.1 * U, y, 2.1 * U, `boss:${id}`, mood);
  inner += `<g class="boss ${mood}">
    <path d="${b.horns}" class="boss-horn"/>
    <path d="${b.head}" class="boss-head"/>
    ${b.brow ? `<path d="${b.brow}" class="boss-brow"/>` : ''}
    ${b.eyes.map(([ex, ey]) => `<circle cx="${ex}" cy="${ey}" r="${b.eyeR}" class="boss-eye"/>`).join('')}
    <path d="${b.teeth}" class="boss-teeth"/>
  </g>`;
  if (isGoal) inner += `<text class="hand goal-flag" x="${p.x - 0.6 * U}" y="${y - 0.5 * U}" text-anchor="middle">🏁</text>`;
  if (st === 'cleared') {
    inner += `<path d="${line(p.x + 1.1 * U - 18, y - 16, p.x + 1.1 * U + 18, y + 16, `x1:${id}`, 1)} ${line(p.x + 1.1 * U + 18, y - 16, p.x + 1.1 * U - 18, y + 16, `x2:${id}`, 1)}" class="boss-x stamp-in"/>`;
    inner += `<path d="${hanamaru(p.x - 0.4 * U, p.y, GATE_W * 0.42, `hm:${id}`)}" class="hanamaru big stamp-in"/>`;
    inner += `<text class="hand gate-done stamp-in" x="${p.x}" y="${p.bottom + 1.1 * U}" text-anchor="middle">${isGoal ? 'あがり！' : '撃破！'}</text>`;
  } else {
    const label2 = st === 'ready' ? 'ボス戦！' : `待機 ${waiting.length}/${members.length}`;
    inner += `<text class="hand gate-count${pencil ? ' pencil-text' : ''}" x="${p.x}" y="${p.bottom + 1.1 * U}" text-anchor="middle">${label2}</text>`;
  }
  if (n.fails > 0 && st !== 'cleared') inner += `<text class="hand fail-tally" x="${x + 4}" y="${p.bottom - 6}">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  inner += sealMark(n, x + 0.6 * U, p.bottom - 0.7 * U);
  return `<g class="node gate${isGoal ? ' goal' : ''}${extra}" data-node="${esc(id)}" data-state="${st}" tabindex="0" role="button" aria-label="結合ゲート ${esc(id)} ${esc(n.title)}（${STATUS_JA[st] || st}）">${inner}</g>`;
}

export { LANE_H };
