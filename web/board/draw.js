// 世界地図を SVG に描く。ノートのページ・題名・景色・道（蛍光ペン）・モンスターのマス・ダンジョンの出口の札・町・城・名札。
// 線は筆記具を data-tool で描き分ける: 鉛筆 pencil（霧）/ ボールペン ballpoint / 蛍光ペン marker / 赤ペン redpen（RULEBOOK §10）。
// 座標の属性は、すべて世界の座標（ページの位置を足したもの）で書く。transform でずらさない（方眼に合っているかを属性で確かめられるように）。
import { U, PAGE, GRID, X0, X1, P1_TOP, PN_TOP, BOTTOM, pageOrigin, casesOf, titleLines, stopOf, TITLE_PX, wrapJa } from './world.js';
import { INK, hl, tint, rect, box, line, circle, hanamaru, tape, smooth, esc, rng, own, byId, wrap } from './sketch.js';

export const STATUS_JA = { fog: '霧の中', open: '見えている', current: '作業中', waiting: '待機中', ready: '全員そろった', cleared: '突破', stale: '要再検証' };
const JOB_JA = { hero: '勇者', warrior: '戦士', mage: '魔法使い', priest: '僧侶', thief: '盗賊', merchant: '商人', sage: '賢者', scribe: '書記', herald: '伝令', cartographer: '地図職人', painter: '絵師', villager: '村人' };
export const jobJa = (job) => own(JOB_JA, job) || job || '';

const f1 = (n) => Math.round(n * 10) / 10;
/** ページ p（0始まり）の目 (x, y) の世界の px */
export const wx = (p, x) => (pageOrigin(p).x + x) * U;
export const wy = (y) => y * U;

export function defs(monsters = {}) {
  return `<defs>
    ${monsterSymbols(monsters)}
    <pattern id="grid-5mm" width="${U}" height="${U}" patternUnits="userSpaceOnUse"><path d="M${U} 0V${U}M0 ${U}H${U}" fill="none" stroke="var(--grid)" stroke-width="0.6"/></pattern>
    <pattern id="grid-10mm" width="${U * 2}" height="${U * 2}" patternUnits="userSpaceOnUse"><path d="M${U * 2} 0V${U * 2}M0 ${U * 2}H${U * 2}" fill="none" stroke="var(--grid-strong)" stroke-width="0.75"/></pattern>
    <pattern id="paper-grain" width="173" height="173" patternUnits="userSpaceOnUse">${grainTile()}</pattern>
    <radialGradient id="paper-tone" cx="50%" cy="45%" r="75%"><stop offset="0.55" stop-color="#d8b464" stop-opacity="0"/><stop offset="0.9" stop-color="#d1a95a" stop-opacity="0.1"/><stop offset="1" stop-color="#b98d3f" stop-opacity="0.22"/></radialGradient>
    <linearGradient id="gutter-l" x1="1" x2="0"><stop offset="0" stop-color="#5b4a2e" stop-opacity=".34"/><stop offset=".35" stop-color="#5b4a2e" stop-opacity=".08"/><stop offset="1" stop-color="#5b4a2e" stop-opacity="0"/></linearGradient>
    <linearGradient id="gutter-r" x1="0" x2="1"><stop offset="0" stop-color="#5b4a2e" stop-opacity=".34"/><stop offset=".35" stop-color="#5b4a2e" stop-opacity=".08"/><stop offset="1" stop-color="#5b4a2e" stop-opacity="0"/></linearGradient>
    <filter id="graphite" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.2 1.8" result="grain"/>
      <feComposite in="d" in2="grain" operator="in"/>
    </filter>
    <filter id="sticker" x="-25%" y="-25%" width="150%" height="160%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="2.6" result="cut"/>
      <feMorphology in="SourceAlpha" operator="dilate" radius="2" result="fat"/>
      <feFlood flood-color="#d8cfba"/><feComposite in2="cut" operator="in" result="rim"/>
      <feFlood flood-color="#fffdf6"/><feComposite in2="fat" operator="in" result="edge"/>
      <feGaussianBlur in="cut" stdDeviation="1.5" result="blur"/><feOffset in="blur" dx="1.2" dy="2.2" result="drop"/>
      <feComponentTransfer in="drop" result="shadow"><feFuncA type="linear" slope="0.34"/></feComponentTransfer>
      <feMerge><feMergeNode in="shadow"/><feMergeNode in="rim"/><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="lift" x="-10%" y="-15%" width="125%" height="140%"><feDropShadow dx="1" dy="2" stdDeviation="1.4" flood-color="#4a3416" flood-opacity="0.26"/></filter>
    <filter id="stamp-ink" x="-15%" y="-15%" width="130%" height="130%">
      <feTurbulence type="fractalNoise" baseFrequency="1.3" numOctaves="2" seed="11" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -2.4 2.05" result="m"/>
      <feComposite in="SourceGraphic" in2="m" operator="in"/>
    </filter>
  </defs>`;
}

function grainTile() {
  const r = rng('paper-grain');
  let out = '';
  for (let i = 0; i < 80; i++) out += `<circle cx="${f1(r() * 173)}" cy="${f1(r() * 173)}" r="${(0.25 + r() * 0.6).toFixed(2)}" fill="${r() < 0.6 ? '#8a7650' : '#6c6a66'}" opacity="${(0.05 + r() * 0.1).toFixed(2)}"/>`;
  return out;
}

const textW = (s, size) => [...String(s)].reduce((w, c) => w + (/[\x20-\x7e]/.test(c) ? 0.56 : 1), 0) * size;

/** 方眼の線にそった四角（定規で引いた線。角だけ少しはみ出す）。px で */
function ruled(X, Y, W, Hh, seed, wob = 0.5) {
  const r = rng(seed);
  const o = () => (r() - 0.5) * wob * 2;
  const ov = () => 0.6 + r() * 1.6;
  return [
    `M${f1(X - ov())} ${f1(Y + o())} L${f1(X + W + ov())} ${f1(Y + o())}`,
    `M${f1(X + W + o())} ${f1(Y - ov())} L${f1(X + W + o())} ${f1(Y + Hh + ov())}`,
    `M${f1(X + W + ov())} ${f1(Y + Hh + o())} L${f1(X - ov())} ${f1(Y + Hh + o())}`,
    `M${f1(X + o())} ${f1(Y + Hh + ov())} L${f1(X + o())} ${f1(Y - ov())}`,
  ].join(' ');
}

// ---------- ページ ----------
export function paperLayer(view, lay) {
  let date = view.log?.length ? new Date(view.log[view.log.length - 1].ts) : new Date();
  if (Number.isNaN(date.getTime())) date = new Date();
  const ds = `${date.getMonth() + 1} . ${date.getDate()}`;
  let out = '<g id="paper">';
  for (let p = 0; p < lay.pages.length; p++) {
    const X = wx(p, 0);
    const W = PAGE.w * U;
    const Hh = PAGE.h * U;
    const left = p % 2 === 0;
    const under = left
      ? `<rect class="page-under" x="${X - 4}" y="4" width="${W}" height="${Hh}" rx="3"/><rect class="page-under" x="${X - 2}" y="2" width="${W}" height="${Hh}" rx="3"/>`
      : `<rect class="page-under" x="${X + 4}" y="4" width="${W}" height="${Hh}" rx="3"/><rect class="page-under" x="${X + 2}" y="2" width="${W}" height="${Hh}" rx="3"/>`;
    out += `<g class="page" data-page="${p + 1}">
      ${under}
      <rect class="page-sheet" x="${X}" y="0" width="${W}" height="${Hh}" rx="2"/>
      <rect class="page-grain" x="${X}" y="0" width="${W}" height="${Hh}" fill="url(#paper-grain)"/>
      <rect class="page-grain tone" x="${X}" y="0" width="${W}" height="${Hh}" fill="url(#paper-tone)"/>
      <rect x="${wx(p, GRID.x)}" y="${wy(GRID.y)}" width="${GRID.w * U}" height="${GRID.h * U}" fill="url(#grid-5mm)"/>
      <rect x="${wx(p, GRID.x)}" y="${wy(GRID.y)}" width="${GRID.w * U}" height="${GRID.h * U}" fill="url(#grid-10mm)"/>
      <path class="page-margin" d="M${wx(p, GRID.x)} ${wy(GRID.y)} H${wx(p, GRID.x + GRID.w)}"/>
      <text class="printed" x="${wx(p, 21.3)}" y="${wy(2.25)}">No.</text><path class="printed-line" d="M${wx(p, 22.6)} ${wy(2.4)} H${wx(p, 27.6)}"/>
      <text class="printed" x="${wx(p, 28.3)}" y="${wy(2.25)}">Date</text><path class="printed-line" d="M${wx(p, 30.2)} ${wy(2.4)} H${wx(p, 34.8)}"/>
      <text class="hand note-no" x="${wx(p, 23)}" y="${wy(2.1)}">${esc(view.quest?.id || '')}-${p + 1}</text>
      <text class="hand note-no" x="${wx(p, 30.8)}" y="${wy(2.1)}">${esc(ds)}</text>
      <text class="printed page-num" x="${wx(p, PAGE.w / 2)}" y="${wy(50.6)}" text-anchor="middle">— ${p + 1} —</text>
      <rect class="page-gutter" x="${left ? X + W - 1.6 * U : X}" y="0" width="${1.6 * U}" height="${Hh}" fill="url(#gutter-${left ? 'l' : 'r'})"/>
    </g>`;
  }
  return out + '</g>';
}

// ---------- 見出し（題名・ふりだし・名札）と、2ページ目からの道の名札、最後のページの凡例 ----------
let monstersRef = {};
/** 1ページ目の右上: 章のあがり（魔王の城）がここから見える（GAME_DESIGN §1・§6） */
function goalPreview(view, pl, monsters) {
  const n = own(view.nodes, view.quest.goal);
  const x = wx(0, 25.6);
  const y = wy(2.7);
  const w = 9.2 * U;
  const h = 6.6 * U;
  const cleared = n?.state === 'cleared';
  const tests = n?.tests?.total ? `テスト ${n.tests.pass}/${n.tests.total}` : '';
  const title = (n?.title || '').replace(/^(結合|あがり)[:：]\s*/, '');
  // 遠くに見える魔王の城（塔3つと門。手前に山の稜線）
  const bx = x + 0.6 * U;
  const by = y + h - 0.5 * U;
  const castle = `M${f1(bx + 0.6 * U)} ${f1(by)} V${f1(by - 2.1 * U)} h${f1(0.9 * U)} v${f1(-0.9 * U)} l${f1(0.45 * U)} ${f1(-0.7 * U)} l${f1(0.45 * U)} ${f1(0.7 * U)} v${f1(0.9 * U)} h${f1(0.8 * U)} V${f1(by - 3.3 * U)} l${f1(0.6 * U)} ${f1(-0.9 * U)} l${f1(0.6 * U)} ${f1(0.9 * U)} V${f1(by - 2.1 * U)} h${f1(0.8 * U)} v${f1(-0.9 * U)} l${f1(0.45 * U)} ${f1(-0.7 * U)} l${f1(0.45 * U)} ${f1(0.7 * U)} v${f1(0.9 * U)} h${f1(0.9 * U)} V${f1(by)} Z`;
  const gate = `M${f1(bx + 3)} ${f1(by)} v${f1(-0.9 * U)} q${f1(0.55 * U)} ${f1(-0.8 * U)} ${f1(1.1 * U)} 0 v${f1(0.9 * U)}`;
  const ridge = `M${f1(x + 2)} ${f1(by)} l${f1(1.1 * U)} ${f1(-0.9 * U)} l${f1(0.8 * U)} ${f1(0.5 * U)} M${f1(x + w - 2.2 * U)} ${f1(by)} l${f1(0.9 * U)} ${f1(-1.1 * U)} l${f1(1.1 * U)} ${f1(1.1 * U)}`;
  return `<g class="goal-preview" aria-label="章のあがり ${esc(view.quest.goal)}（p.${pl.page + 1}）">
    <path class="pencil-line preview-frame" d="${box(x, y, w, h, 'preview', 0.8)}"/>
    <text class="marker-text preview-head" x="${f1(x + 0.5 * U)}" y="${f1(y + 1.15 * U)}">あがり</text>
    <text class="hand preview-sub" x="${f1(x + 3.4 * U)}" y="${f1(y + 1.1 * U)}">魔王の城 ↓p.${pl.page + 1}</text>
    <text class="hand preview-title" x="${f1(x + 0.5 * U)}" y="${f1(y + 2.05 * U)}">${esc(wrap(title, 13, 1)[0] || '')}</text>
    <path class="preview-ridge" d="${ridge}"/>
    <path class="pen castle-mini" d="${castle}"/><path class="pen" d="${gate}"/>
    ${monsterMarkup(monsters, 'maou', x + w - 3.6 * U, y + 2.2 * U, 3.1 * U, cleared ? '#ffffff' : '#e6dcff', cleared ? 'is-slain' : '')}
    <text class="hand preview-sub" x="${f1(x + w - 2.05 * U)}" y="${f1(y + h - 0.3 * U)}" text-anchor="middle">${esc(tests)}</text>
  </g>`;
}

export function headLayer(view, lay, sprites, monsters = {}) {
  monstersRef = monsters;
  const chars = byId(view.characters);
  let out = '<g id="heads">';
  // 題名は1字1マス（16字までは 2×2 目、それより長ければ 1×1 目で折り返す）
  const title = [...(view.quest?.title || '')];
  const big = title.length <= 16;
  const cell = big ? 2 : 1;
  const perRow = Math.floor((X1 - X0 - 1) / cell);
  out += `<g class="quest-title" aria-label="${esc(view.quest?.title || '')}">`;
  title.forEach((ch, k) => {
    const bx = X0 + 1 + (k % perRow) * cell;
    const by = 3 + Math.floor(k / perRow) * cell;
    out += `<g class="title-cell" data-box="${bx} ${by} ${cell} ${cell}"><path class="pen title-box" data-tool="ballpoint" d="${ruled(wx(0, bx), wy(by), cell * U, cell * U, `tb${k}`, 0.3)}"/><text x="${wx(0, bx + cell / 2)}" y="${wy(by + cell * 0.76)}" text-anchor="middle" font-size="${big ? 22 : 12}">${esc(ch)}</text></g>`;
  });
  out += '</g>';
  const rowsUsed = Math.ceil(title.length / perRow) * cell;
  const titleW = big ? title.length * 2 : Math.min(title.length, perRow);
  if (big && titleW > 0) out += `<path class="title-swipe" data-tool="marker" d="M${wx(0, X0 + 1)} ${wy(3 + 1.55)} L${wx(0, X0 + 1 + titleW)} ${wy(3 + 1.5)}"/>`;
  const pitchY = 3 + rowsUsed + 0.95;
  const goalPl = lay.place[view.quest?.goal];
  const preview = goalPl && title.length * cell <= 22 && rowsUsed <= 2;
  out += `<text class="hand quest-pitch" x="${wx(0, X0 + 1)}" y="${wy(pitchY)}">${esc(wrap(view.quest?.pitch || '', preview ? 28 : 54, 1)[0] || '')}</text>`;
  if (preview) out += goalPreview(view, goalPl, monstersRef);
  // ふりだし（マジックの赤い字。2×2 目の枠に1字ずつ）
  const fy = 7;
  out += `<g class="start-label">`;
  for (let k = 0; k < 4; k++) out += `<path class="pen title-box" data-tool="ballpoint" d="${ruled(wx(0, X0 + 1 + k * 2), wy(fy), 2 * U, 2 * U, `fd${k}`, 0.3)}"/>`;
  out += `<text class="furidashi" x="${wx(0, X0 + 1) + (2 * U - 22) / 2}" y="${wy(fy + 1.52)}" letter-spacing="${2 * U - 22}">ふりだし</text>`;
  out += `<text class="pencil-text start-hint" x="${wx(0, X0 + 10)}" y="${wy(fy + 0.85)}">上から下へ。モンスター1体 ＝ テスト1件</text>`;
  out += `<text class="pencil-text start-hint" x="${wx(0, X0 + 10)}" y="${wy(fy + 1.85)}">倒すと斜線、出口で gridhub check</text>`;
  out += '</g>';
  // 名札（ふりだしの付箋。1ページ目の道の上）
  const g0 = lay.pages[0].lanes;
  for (const id of lay.lanes) {
    const c = chars[id];
    const g = g0[id];
    if (!c || !g) continue;
    const x = wx(0, g.x) + 2;
    const y = wy(9.8);
    const w = g.w * U - 4;
    const h = 3.1 * U;
    const r = rng(`tilt:${id}`);
    const tilt = f1((r() - 0.5) * 3);
    const color = hl(c.color);
    const name = g.w < 4 ? [...(c.name || '?')][0] : wrap(c.name, Math.max(1.5, (w - 4) / 10.5), 1)[0];
    out += `<g class="lane-head" data-char="${esc(id)}" tabindex="0" role="button" aria-label="${esc(c.name)}のキャラクターシート">
      <g transform="rotate(${tilt} ${f1(x + w / 2)} ${f1(y + h / 2)})">
      <path class="sticky-paper" d="${box(x, y, w, h, `head:${id}`, 0.6)}" fill="${tint(color, 0.35)}"/>
      ${spriteMarkup(sprites, c, x + 1, y + 0.1 * U, 2.1 * U, 'head')}
      <text class="hand head-sub" x="${f1(x + 2.3 * U)}" y="${f1(y + 0.95 * U)}">Lv${esc(c.level)}</text>
      <text class="hand head-sub" x="${f1(x + 2.3 * U)}" y="${f1(y + 1.85 * U)}">${esc(c.generation ?? 1)}代目</text>
      <text class="hand head-name" x="${f1(x + 3)}" y="${f1(y + 2.8 * U)}">${esc(name)}</text>
      <path class="tape" d="${tape(x + w * (0.3 + r() * 0.4), y + 1, Math.min(2.6 * U, w * 0.6), 0.8 * U, `tape:${id}`, (r() - 0.5) * 14)}"/>
      </g>
    </g>`;
  }
  // 2ページ目からの名札（そのキャラの駒が別のページにいれば ↓p.N / ↑p.N）
  const pawnPage = Object.create(null);
  for (const c of view.characters) pawnPage[c.id] = stopOf(view, lay, c)?.page ?? 0;
  for (let p = 1; p < lay.pages.length; p++) {
    const page = lay.pages[p];
    if (!page.units.length && p === lay.pages.length - 1) continue;
    for (const id of lay.lanes) {
      const c = chars[id];
      const g = page.lanes[id];
      if (!c || !g) continue;
      const where = pawnPage[id];
      const mark = where === p ? '' : where > p ? `↓p.${where + 1}` : `↑p.${where + 1}`;
      const label = g.w >= 4 ? `${c.name}${mark ? ' ' + mark : ''}` : mark ? mark.replace('p.', '') : [...c.name][0];
      const fit = wrap(label, Math.max(1.5, (g.w * U - 6) / 9.5), 1)[0] || '';
      const tw = Math.min(g.w * U - 2, textW(fit, 9.5) + 8);
      const tx = Math.max(wx(p, g.x) + 1, Math.min(wx(p, g.x + g.w) - tw - 1, wx(p, g.mid) - tw / 2));
      out += `<g class="lane-tag" data-char="${esc(id)}"><path class="tag-bg" d="${box(tx, wy(PN_TOP - 2) + 1, tw, U - 2, `tag:${id}:${p}`, 0.4)}" fill="${tint(hl(c.color), 0.15)}"/><text class="hand tag-text" x="${f1(tx + 4)}" y="${wy(PN_TOP - 1.3)}">${esc(fit)}</text></g>`;
    }
  }
  // 最後のページ: 凡例（字だけで読めるように）
  const lp = lay.pages.length - 1;
  const ly0 = lay.pages[lp].units.length ? BOTTOM - 1 : 8;
  const items = [
    ['monster', 'モンスター1体 ＝ テスト1件'],
    ['slain', '倒した（テストが通った）'],
    ['revived', '復活（前に通ったテストが落ちた）'],
    ['card', 'ダンジョンの出口 ＝ 宣言判定'],
    ['town', '町 ＝ セーブ（git commit）'],
    ['gate', '中ボスの砦 ＝ 結合テスト'],
    ['goal', '魔王の城 ＝ 章のあがり'],
    ['king', '王様の城 ＝ 人間のハンコ'],
  ];
  if (!lay.pages[lp].units.length) {
    out += `<g class="legend-page"><text class="marker-text legend-head" x="${wx(lp, X0 + 1)}" y="${wy(ly0 - 1.2)}">このノートの読み方</text>`;
    items.forEach(([k, t], i) => (out += `<text class="hand legend-item" x="${wx(lp, X0 + 3)}" y="${wy(ly0 + 0.75 + i * 1.6)}">${esc(t)}</text>${legendGlyph(k, wx(lp, X0 + 1.5), wy(ly0 + 0.45 + i * 1.6))}`));
    out += '</g>';
    // あがったら、エンディングを赤ペンで日記のように書きこむ
    if (view.ending && typeof view.ending.text === 'string') {
      const ey = ly0 + 15;
      const lines = view.ending.text.split('\n').filter(Boolean).flatMap((l) => wrap(l, 30, 2));
      out += `<g class="ending-note"><text class="marker-text ending-note-head" x="${wx(lp, X0 + 1)}" y="${wy(ey)}">エンディング</text>`;
      lines.slice(0, 12).forEach((l, i) => (out += `<text class="hand ending-note-line" x="${wx(lp, X0 + 1)}" y="${wy(ey + 1.6 + i * 1.25)}">${esc(l)}</text>`));
      out += '</g>';
    }
  }
  return out + '</g>';
}

function legendGlyph(kind, cx, cy) {
  switch (kind) {
    case 'monster':
      return `<path class="pen" d="${circle(cx, cy, 6, 'lg-m', 0.4)}"/><circle cx="${cx - 2}" cy="${cy - 1}" r="1.1" fill="${INK}"/><circle cx="${cx + 2}" cy="${cy - 1}" r="1.1" fill="${INK}"/>`;
    case 'slain':
      return `<path class="pen" d="${circle(cx, cy, 6, 'lg-s', 0.4)}"/><path class="slain" d="M${cx - 7} ${cy + 7} L${cx + 7} ${cy - 7}"/>`;
    case 'revived':
      return `<path class="revived" d="${circle(cx, cy, 7.5, 'lg-r', 0.6)}"/>`;
    case 'card':
      return `<rect x="${cx - 7}" y="${cy - 6}" width="14" height="12" class="lg-card"/>`;
    case 'town':
      return `<path class="pen" d="M${cx - 7} ${cy} L${cx} ${cy - 7} L${cx + 7} ${cy} M${cx - 5} ${cy} V${cy + 6} H${cx + 5} V${cy}"/>`;
    case 'gate':
      return `<path class="pen" d="M${cx - 8} ${cy + 6} V${cy - 4} h3 v-3 h3 v3 h4 v-3 h3 v3 h3 V${cy + 6} Z"/>`;
    case 'goal':
      return `<path class="pen" d="M${cx - 8} ${cy + 6} V${cy - 2} l3 -5 l3 5 v-1 h4 v1 l3 -5 l3 5 V${cy + 6} Z"/>`;
    default:
      return `<path class="pen" d="M${cx - 7} ${cy + 2} L${cx - 5} ${cy - 5} L${cx - 2} ${cy - 1} L${cx} ${cy - 6} L${cx + 2} ${cy - 1} L${cx + 5} ${cy - 5} L${cx + 7} ${cy + 2} Z"/>`;
  }
}

// ---------- 景色 ----------
export function sceneryLayer(lay) {
  let out = '<g id="scenery">';
  for (let p = 0; p < lay.pages.length; p++) for (const t of lay.pages[p].scenery) out += sceneryMarkup(p, t);
  return out + '</g>';
}

function house(x, y, w, h, seed) {
  const r = rng(seed);
  const roofH = h * 0.45;
  return `<path class="wall" d="M${f1(x)} ${f1(y + roofH)} h${f1(w)} v${f1(h - roofH)} h${f1(-w)} Z"/><path class="roof" d="M${f1(x - 1.5)} ${f1(y + roofH)} L${f1(x + w / 2)} ${f1(y)} L${f1(x + w + 1.5)} ${f1(y + roofH)} Z"/><path class="door" d="M${f1(x + w * (0.35 + r() * 0.2))} ${f1(y + h)} v${f1(-h * 0.3)} h${f1(w * 0.18)} v${f1(h * 0.3)}"/>`;
}

function sceneryMarkup(p, t) {
  const r = rng(t.seed);
  const X = wx(p, t.x) + 1.5;
  const Y = wy(t.y) + 1.5;
  const W = t.w * U - 3;
  const Hh = t.h * U - 3;
  let s = '';
  switch (t.kind) {
    case 'mountain':
    case 'mountains': {
      const peaks = t.kind === 'mountain' ? 1 : 2 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < peaks; k++) {
        const pw = peaks === 1 ? W : W / (peaks * 0.72);
        const x0 = X + (peaks === 1 ? 0 : (k * (W - pw)) / (peaks - 1));
        const top = Y + Hh * (0.04 + r() * 0.22);
        const cx = x0 + pw * (0.42 + r() * 0.16);
        const base = Y + Hh;
        s += `<path class="mt" d="M${f1(x0)} ${f1(base)} L${f1(cx)} ${f1(top)} L${f1(x0 + pw)} ${f1(base)}"/>`;
        const sy = top + (base - top) * 0.28;
        s += `<path class="mt-snow" d="M${f1(cx - (cx - x0) * 0.28)} ${f1(sy)} l${f1(pw * 0.07)} -3 l${f1(pw * 0.07)} 3.5 l${f1(pw * 0.07)} -2.5 L${f1(cx + (x0 + pw - cx) * 0.28)} ${f1(sy)}"/>`;
        s += `<path class="mt-shade" d="M${f1(cx + 2)} ${f1(top + 6)} l${f1(pw * 0.1)} ${f1((base - top) * 0.45)} M${f1(cx + 6)} ${f1(top + 11)} l${f1(pw * 0.08)} ${f1((base - top) * 0.35)}"/>`;
      }
      break;
    }
    case 'forest': {
      const n = 3 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const cx = X + (W * (k + 0.5)) / n + (r() - 0.5) * 3;
        const cy = Y + Hh * (0.35 + r() * 0.15);
        s += `<path class="crown" d="${circle(cx, cy, Math.min(U * 0.48, W / n / 1.7), `${t.seed}:${k}`, 0.6)}"/><path class="trunk" d="M${f1(cx)} ${f1(cy + U * 0.42)} V${f1(Math.min(Y + Hh, cy + U * 0.95))}"/>`;
      }
      break;
    }
    case 'tree': {
      const cx = X + W / 2;
      if (r() < 0.45) s += `<path class="crown pine" d="M${f1(cx)} ${f1(Y + 1)} L${f1(cx + 5)} ${f1(Y + Hh - 6)} L${f1(cx - 5)} ${f1(Y + Hh - 6)} Z"/><path class="trunk" d="M${f1(cx)} ${f1(Y + Hh - 6)} V${f1(Y + Hh)}"/>`;
      else s += `<path class="crown" d="${circle(cx, Y + Hh * 0.38, 5.5, t.seed, 0.4)}"/><path class="trunk" d="M${f1(cx)} ${f1(Y + Hh * 0.6)} V${f1(Y + Hh)}"/>`;
      break;
    }
    case 'grass': {
      const cx = X + W / 2;
      const by = Y + Hh - 1;
      s += `<path d="M${f1(cx - 4)} ${f1(by)} q1 -4 0 -6 M${f1(cx)} ${f1(by)} q0 -5 1 -8 M${f1(cx + 4)} ${f1(by)} q-1 -4 1 -6"/>`;
      break;
    }
    case 'flower': {
      const cx = X + W / 2;
      const cy = Y + Hh * 0.4;
      s += `<path class="stem" d="M${f1(cx)} ${f1(cy + 2)} V${f1(Y + Hh)}"/><circle class="petal" cx="${f1(cx)}" cy="${f1(cy)}" r="3.2"/><circle class="pistil" cx="${f1(cx)}" cy="${f1(cy)}" r="1.2"/>`;
      break;
    }
    case 'house':
      s += house(X + 3, Y + 4, W - 6, Hh - 5, t.seed);
      break;
    case 'town':
      s += house(X + 2, Y + Hh * 0.38, U * 1.3, Hh * 0.6, `${t.seed}:a`) + house(X + U * 1.75, Y + Hh * 0.12, U * 1.2, Hh * 0.86, `${t.seed}:b`) + house(X + U * 3.1, Y + Hh * 0.45, U * 1.1, Hh * 0.53, `${t.seed}:c`);
      s += `<path class="flag" d="M${f1(X + U * 2.35)} ${f1(Y + Hh * 0.13)} V${f1(Y)} l7 2.5 l-7 2.5"/>`;
      break;
    case 'sea': {
      let waves = '';
      for (let yy = 1; yy < t.h; yy++) for (let xx = 0; xx + 2 <= t.w; xx += 3) if (r() < 0.7) waves += `M${f1(X + (xx + (yy % 2) * 1.5) * U + 2)} ${f1(Y + yy * U - 2)} q${U * 0.35} -4 ${U * 0.7} 0 t${U * 0.7} 0 `;
      const bx = X + W * (0.25 + r() * 0.5);
      const by = Y + Hh * 0.55;
      s += `<rect class="sea-water" x="${f1(X)}" y="${f1(Y)}" width="${f1(W)}" height="${f1(Hh)}" rx="10"/><path class="waves" d="${waves}"/><path class="boat" d="M${f1(bx - 10)} ${f1(by)} h20 l-4 6 h-12 Z M${f1(bx)} ${f1(by)} V${f1(by - 15)} l9 11 h-9"/>`;
      break;
    }
    case 'lake': {
      const pts = [];
      for (let k = 0; k <= 11; k++) {
        const a = (k / 10) * Math.PI * 2;
        const rr = 0.8 + r() * 0.2;
        pts.push([X + W / 2 + Math.cos(a) * (W / 2 - 1) * rr, Y + Hh / 2 + Math.sin(a) * (Hh / 2 - 1) * rr]);
      }
      let waves = '';
      for (let k = 0; k < 3; k++) waves += `M${f1(X + W * (0.22 + r() * 0.35))} ${f1(Y + Hh * (0.32 + k * 0.18))} q4 -3 8 0 t8 0 `;
      s += `<path class="water" d="${smooth(pts)} Z"/><path class="waves" d="${waves}"/>`;
      break;
    }
  }
  return `<g class="scenery ${t.kind}" data-kind="${t.kind}" aria-hidden="true">${s}</g>`;
}

// ---------- 道（キャラクターごとの蛍光ペン） ----------
/** 折れ線の角を丸くする（蛍光ペンで道を引いたように） */
function roundedPath(pts, r) {
  if (pts.length < 2) return '';
  let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [px, py] = pts[i];
    const [bx, by] = pts[i + 1];
    const la = Math.hypot(px - ax, py - ay);
    const lb = Math.hypot(bx - px, by - py);
    const cross = (px - ax) * (by - py) - (py - ay) * (bx - px);
    if (!la || !lb || Math.abs(cross) < 0.01) {
      d += ` L${f1(px)} ${f1(py)}`;
      continue;
    }
    const k = Math.min(r, la / 2, lb / 2);
    d += ` L${f1(px - ((px - ax) / la) * k)} ${f1(py - ((py - ay) / la) * k)} Q${f1(px)} ${f1(py)} ${f1(px + ((bx - px) / lb) * k)} ${f1(py + ((by - py) / lb) * k)}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${f1(lx)} ${f1(ly)}`;
}
export function roadLayer(view, lay) {
  let out = '<g id="roads">';
  view.characters.forEach((c, i) => {
    const rd = lay.roads[c.id];
    if (!rd) return;
    const color = hl(c.color);
    let paths = '';
    for (const piece of rd.pieces) {
      const d = roundedPath(piece.pts.map(([x, y]) => [wx(piece.page, x), wy(y)]), 0.55 * U);
      paths += `<path class="road-ink" data-tool="marker" d="${d}" stroke="${color}" pathLength="1"/>`;
    }
    let arrows = '';
    for (const a of rd.cont) {
      const x = wx(a.page, a.x);
      const y = wy(BOTTOM + 0.7);
      arrows += `<path class="cont-arrow" d="M${f1(x)} ${f1(y - 6)} V${f1(y + 5)} M${f1(x - 4)} ${f1(y)} L${f1(x)} ${f1(y + 5)} L${f1(x + 4)} ${f1(y)}"/>`;
    }
    out += `<g class="road" data-char="${esc(c.id)}" style="--d:${(i * 0.12).toFixed(2)}s">${paths}${arrows}</g>`;
  });
  return out + '</g>';
}

// ---------- モンスター（テスト1件 = 1体） ----------
const SPECIES = ['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem'];
const ALIVE = { slime: '#bfe3ff', bat: '#e3d4ff', mushroom: '#ffd0dc', ghost: '#f4f6ff', snake: '#cdeec2', golem: '#eadfc6', dragon: '#c9f0dc', maou: '#e6dcff' };
export function speciesOf(name, i) {
  let h = 0;
  for (const ch of String(name ?? i)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPECIES[h % SPECIES.length];
}

/** モンスターの絵（monsters[id] があれば色を差し替えて埋め込む。無ければ手描きのスライム） */
export function monsterMarkup(monsters, species, x, y, size, fill, cls = '') {
  void monsters;
  return `<use class="monster ${species}${cls ? ' ' + cls : ''}" href="#mon-${species}" x="${f1(x)}" y="${f1(y)}" width="${f1(size)}" height="${f1(size)}" style="--monster:${fill}" aria-hidden="true"/>`;
}

/** モンスターの絵を1枚ずつ <symbol> にしておく（マスは <use> で指す。数百体でも DOM が増えない） */
export function monsterSymbols(monsters) {
  const fallback = `<path d="M32 12Q52 30 52 46Q50 56 32 56Q14 56 12 46Q12 30 32 12Z" fill="var(--monster, #ffffff)" stroke="${INK}" stroke-width="2.4"/><circle cx="25" cy="38" r="3" fill="${INK}"/><circle cx="39" cy="38" r="3" fill="${INK}"/>`;
  return ['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem', 'dragon', 'maou']
    .map((id) => `<symbol id="mon-${id}" viewBox="0 0 64 64" overflow="visible">${typeof own(monsters, id) === 'string' ? own(monsters, id) : fallback}</symbol>`)
    .join('');
}

/** モンスターのマス（1件ずつの文字列の配列。盤面は変わったものだけを書きかえる） */
export function monsterItems(view, lay, monsters, { fresh = null } = {}) {
  const out = [];
  for (const id of lay.order) {
    const pl = lay.place[id];
    if (pl.kind !== 'cmd') continue;
    const n = own(view.nodes, id);
    const cases = casesOf(n);
    const fog = n.state === 'fog';
    const freshCases = own(fresh, id);
    for (const s of pl.squares) {
      const c = cases[s.i];
      const unknown = cases.length === 0;
      const X = wx(s.page, s.x);
      const Y = wy(s.y);
      const ok = unknown ? null : c.ok;
      const slain = ok === true;
      const revived = !unknown && c.revived > 0 && ok !== true;
      const species = speciesOf(c?.name, s.i);
      const fill = slain ? '#ffffff' : revived ? '#ffc2b8' : fog ? '#ffffff' : ALIVE[species];
      const name = unknown ? 'まだ一度も走らせていないテスト（中の分からないダンジョン）' : `テスト ${s.i + 1}/${cases.length}: ${c.name}`;
      const state = unknown ? 'unknown' : slain ? 'slain' : revived ? 'revived' : ok === false ? 'alive failing' : 'alive';
      const fr = freshCases && freshCases.includes(s.i) ? ' fresh-slain' : '';
      let inner = `<title>${esc(name)}${!unknown ? `（${ok === true ? '✔ 通った' : ok === false ? '✖ 落ちている' : '・ まだ'}${c.strong ? '・強敵' : ''}${c.revived ? `・復活 ${c.revived}` : ''}）` : ''}</title>`;
      inner += `<rect class="sq-paper" x="${X}" y="${Y}" width="${2 * U}" height="${2 * U}"/>`;
      inner += `<path class="${fog ? 'pencil-sq' : 'pen'} sq-line" data-tool="${fog ? 'pencil' : 'ballpoint'}" d="${ruled(X, Y, 2 * U, 2 * U, `sq:${id}:${s.i}`, 0.35)}"/>`;
      if (unknown) {
        inner += `<text class="sq-q${n.state === 'cleared' ? ' done' : ''}" x="${X + U}" y="${Y + U * 1.42}" text-anchor="middle">？</text>`;
        // テストの中身は分からないが、出口は抜けた（第10章までの冒険の書）
        if (n.state === 'cleared') inner += `<path class="slain" data-tool="redpen" d="${line(X + 5, Y + 2 * U - 5, X + 2 * U - 5, Y + 5, `sl:${id}:?`, 0.6)}"/>`;
      }
      else inner += monsterMarkup(monsters, species, X + 3, Y + 2, 2 * U - 6, fill, slain ? 'is-slain' : fog ? 'is-fog' : '');
      if (slain) inner += `<path class="slain" data-tool="redpen" d="${line(X + 5, Y + 2 * U - 5, X + 2 * U - 5, Y + 5, `sl:${id}:${s.i}`, 0.6)}"/>`;
      if (revived) inner += `<path class="revived" data-tool="redpen" d="${circle(X + U, Y + U, U * 0.98, `rv:${id}:${s.i}`, 0.7)}"/>`;
      if (c?.strong) inner += `<text class="sq-strong" x="${X + 2 * U - 2}" y="${Y + 8}" text-anchor="end">強</text>`;
      out.push(`<g class="sq ${state}${fr}" data-node="${esc(id)}" data-case="${unknown ? '?' : s.i}" data-ok="${String(ok)}" data-page="${s.page + 1}" data-box="${s.x} ${s.y} 2 2">${inner}</g>`);
    }
  }
  return out;
}

// ---------- 札・町・城 ----------
function sealMark(n, x, y) {
  if (n.type === 'camp' || n.check?.kind === 'stamp') return '';
  const rot = f1((rng(`seal:${n.id ?? x}:${y}`)() - 0.5) * 16 - 6);
  const cls = n.seal_broken ? 'seal broken' : n.sealed ? 'seal' : 'seal unsealed';
  const ch = n.sealed || n.seal_broken ? '封' : '未';
  return `<g class="${cls}" transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})"><title>${n.seal_broken ? '封印が破れている' : n.sealed ? '判定は封印済み' : '未封印（GMの封印待ち）'}</title><rect x="-6" y="-6" width="12" height="12" rx="2" class="seal-box"/><text class="seal-text" y="3.5" text-anchor="middle">${ch}</text>${n.seal_broken ? '<path d="M-7 -5 L-1 1 L-3 3 L6 8" class="seal-crack"/>' : ''}</g>`;
}

function hanko(cx, cy, r, ch, seed) {
  const rot = (rng(seed)() - 0.5) * 24;
  return `<g class="stamp-in"><g class="hanko" transform="translate(${f1(cx)} ${f1(cy)}) rotate(${rot.toFixed(1)})"><path d="${circle(0, 0, r, `${seed}:o`, 0.5)}" class="hanko-ring"/><path d="${circle(0, 0, r - 2.5, `${seed}:i`, 0.4)}" class="hanko-ring thin"/><text class="hanko-text" y="${f1(r * 0.36)}" text-anchor="middle" font-size="${f1(r * 1.05)}">${esc(ch)}</text></g></g>`;
}

function eraser(x, y, w, h, seed) {
  const r = rng(seed);
  let streaks = '';
  for (let i = 0; i < 4; i++) {
    const yy = y + 6 + r() * (h - 12);
    streaks += `<path d="${line(x + 4, yy, x + w - 4, yy + (r() - 0.5) * 6, `${seed}:s${i}`, 2)}" class="eraser-streak"/>`;
  }
  return `<g class="eraser"><rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="6" class="eraser-smudge"/>${streaks}</g>`;
}

/** 枠（ボールペンか鉛筆で、2回なぞる） */
function outline(X, Y, W, Hh, seed, pencil, cls) {
  const tool = pencil ? 'pencil' : 'ballpoint';
  const ink = pencil ? 'pencil-line' : 'pen';
  return `<path d="${ruled(X, Y, W, Hh, seed, 0.6)}" class="${ink} ${cls}" data-tool="${tool}" pathLength="1"/><path d="${ruled(X + 0.5, Y - 0.4, W, Hh, `${seed}:2`, 0.9)}" class="${ink} ${cls} pass2" data-tool="${tool}" pathLength="1"/>`;
}

/** 札・町・城（1つずつの文字列の配列） */
export function nodeItems(view, lay, monsters, { fresh = null, selected = null } = {}) {
  const out = [];
  const chars = byId(view.characters);
  for (const id of lay.order) {
    const pl = lay.place[id];
    const n = own(view.nodes, id);
    const sel = selected === id ? ' selected' : '';
    const f = own(fresh, id);
    const fr = typeof f === 'string' ? ` fresh-${f}` : '';
    const style = ` style="--d:${(0.15 + Math.min(1.3, (pl.page * 47 + pl.y) / 160)).toFixed(2)}s"`;
    const attrs = `data-node="${esc(id)}" data-state="${esc(n.state)}" data-page="${pl.page + 1}" data-box="${pl.x} ${pl.y} ${pl.w} ${pl.h}"${style} tabindex="0" role="button"`;
    if (pl.kind === 'gate' || pl.kind === 'goal') out.push(gateMarkup(view, pl, n, chars, monsters, attrs, sel + fr));
    else if (pl.kind === 'camp') out.push(campMarkup(pl, n, chars, attrs, sel + fr));
    else out.push(taskMarkup(pl, n, chars, attrs, sel + fr));
  }
  return out;
}


function taskMarkup(pl, n, chars, attrs, extra) {
  const id = pl.id;
  const X = wx(pl.page, pl.x);
  const Y = wy(pl.y);
  const W = pl.w * U;
  const Hh = pl.h * U;
  const owner = chars[n.owner];
  const color = owner ? hl(owner.color) : '#ddd';
  const st = n.state;
  const pencil = st === 'fog';
  const stamp = pl.kind === 'stamp';
  const t = pencil ? ' pencil-text' : '';
  let s = `<rect class="cell-paper" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  s += `<rect class="cell-grid" x="${X}" y="${Y}" width="${W}" height="${Hh}" fill="url(#grid-5mm)"/>`;
  s += `<rect class="owner-band${pencil ? ' faint' : ''}" data-tool="marker" x="${X + 1}" y="${Y + 1}" width="${W - 2}" height="${U - 1}" fill="${color}"/>`;
  if (st === 'current') s += `<rect class="cell-wash" data-tool="marker" x="${X + 1}" y="${Y + U}" width="${W - 2}" height="${Hh - U - 1}" fill="${tint(color, 0.45)}"/>`;
  s += `<rect class="cell-hit" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  s += outline(X, Y, W, Hh, `cell:${id}`, pencil, 'cell-line');
  const narrow = pl.w < 6;
  // 1行目: ID と、テスト p/t（ダンジョンの出口）か「人間のハンコ」（王様の城）
  s += `<text class="hand cell-id${t}${narrow ? ' narrow' : ''}" x="${X + 3}" y="${Y + U - 3.5}">${esc(id)}</text>`;
  const tests = n.tests && Number.isInteger(n.tests.total) ? n.tests : { pass: casesOf(n).filter((c) => c.ok === true).length, total: casesOf(n).length };
  const label = stamp ? 'ハンコ' : tests.total > 0 ? `テスト ${tests.pass}/${tests.total}` : 'テスト ？';
  s += `<text class="hand cell-tests${t}${narrow ? ' narrow' : ''}${!stamp && tests.total && tests.pass === tests.total ? ' all' : ''}" x="${X + W - 3}" y="${Y + U - 3.5}" text-anchor="end">${esc(label)}</text>`;
  if (n.first_try === true && st === 'cleared' && !narrow) s += `<text class="medal-mark" x="${X + 3 + textW(id, 11.5) + 3}" y="${Y + U - 3.5}"><title>一発で出口を抜けた（ちいさなメダル）</title>◎</text>`;
  // 題（技術の言葉。大きく、2行まで）
  const lines = titleLines(n.title, stamp ? pl.w - 2 : pl.w, Math.max(1, pl.h - 1));
  lines.forEach((l, k) => (s += `<text class="hand cell-title${t}" x="${X + 4}" y="${Y + U * (2 + k) - 3.5}">${esc(l)}</text>`));
  if (stamp) {
    s += king(X + W - 1.2 * U, Y + Hh - 1.05 * U, pencil);
    if (st === 'cleared') s += hanko(X + W - 1.2 * U, Y + Hh - 1.2 * U, 0.95 * U, owner ? [...owner.name][0] : '印', `hk:${id}`);
  } else {
    if (!n.sealed || n.seal_broken) s += sealMark(n, X + W - 0.6 * U, Y + Hh - 0.6 * U);
    if (st === 'cleared') s += `<path d="${hanamaru(X + W - 0.35 * U, Y + Hh - 0.3 * U, 0.72 * U, `hm:${id}`)}" class="hanamaru" data-tool="redpen" pathLength="1"/>`;
  }
  if (st === 'stale') s += eraser(X, Y + U, W, Hh - U, `er:${id}`);
  if (n.fails > 0 && st !== 'cleared') s += `<text class="hand fail-tally" x="${X + 3 + textW(id, 11.5) + 3}" y="${Y + U - 3.5}">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  return `<g class="node task${stamp ? ' king' : ''}${extra}" ${attrs} data-owner="${esc(n.owner || '')}" aria-label="${esc(id)} ${esc(n.title)}（${esc(own(STATUS_JA, st) || st)}${tests.total ? ` テスト ${tests.pass}/${tests.total}` : ''}）">${s}</g>`;
}

/** 砦の塔（px）。x は塔の左、y は帯の上、h は帯の高さ */
function tower(x, y, h, seed, pencil) {
  const w = 1.6 * U;
  const top = y - 1.15 * U;
  const k = pencil ? 'pencil-line' : 'pen';
  const m = w / 5;
  let d = `M${f1(x)} ${f1(y + h)} V${f1(top)}`;
  for (let i = 0; i < 5; i++) d += i % 2 === 0 ? ` h${f1(m)} v${f1(0.32 * U)}` : ` h${f1(m)} v${f1(-0.32 * U)}`;
  d += ` V${f1(y + h)} Z`;
  const cx = x + w / 2;
  const win = `M${f1(cx - 3.5)} ${f1(y + 1.1 * U)} v-5 q3.5 -5 7 0 v5 Z`;
  const flag = `M${f1(cx)} ${f1(top)} V${f1(top - 0.95 * U)} l${f1(0.75 * U)} ${f1(0.22 * U)} l${f1(-0.75 * U)} ${f1(0.22 * U)}`;
  const bricks = `M${f1(x + 2)} ${f1(y + 2 * U)} h${f1(w * 0.4)} M${f1(x + w * 0.55)} ${f1(y + 2.7 * U)} h${f1(w * 0.35)} M${f1(x + 3)} ${f1(y + 3.4 * U)} h${f1(w * 0.3)}`;
  return `<g class="tower" aria-hidden="true"><path class="tower-wall ${k}" d="${d}"/><path class="${k} tower-win" d="${win}"/><path class="tower-brick" d="${bricks}"/><path class="tower-flag" d="${flag}"/></g>`;
}

/** 王様の城（人間のハンコ） */
function king(cx, cy, pencil) {
  const k = pencil ? 'pencil-line' : 'pen';
  return `<g class="king-castle"><path class="${k} castle-wall" d="M${cx - 11} ${cy + 9} V${cy - 3} h4 v-3 h3 v3 h8 v-3 h3 v3 h4 V${cy + 9} Z M${cx - 3} ${cy + 9} v-6 q3 -4 6 0 v6"/><path class="crown-mark" d="M${cx - 6} ${cy - 9} l2 -6 l4 4 l4 -4 l2 6 Z"/></g>`;
}

function campMarkup(pl, n, chars, attrs, extra) {
  const id = pl.id;
  const X = wx(pl.page, pl.x);
  const Y = wy(pl.y);
  const W = pl.w * U;
  const Hh = pl.h * U;
  const st = n.state;
  const pencil = st === 'fog';
  const t = pencil ? ' pencil-text' : '';
  let s = `<rect class="cell-paper camp-paper" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  s += `<rect class="camp-band" x="${X + 1}" y="${Y + 1}" width="${W - 2}" height="${U - 1}"/>`;
  s += `<rect class="cell-hit" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  s += outline(X, Y, W, Hh, `camp:${id}`, pencil, 'cell-line');
  // 1行目: ID と「町」、右に commit（セーブ = Git のコミット）
  s += `<text class="hand cell-id${t}" x="${X + 3}" y="${Y + U - 3.5}">${esc(id)} <tspan class="camp-kind">町</tspan></text>`;
  const commit = n.save?.commit ? `commit ${String(n.save.commit).slice(0, 7)}` : st === 'cleared' ? 'セーブ済み' : 'セーブ前';
  s += `<text class="hand save-commit${n.save?.commit ? '' : ' none'}${t}" x="${X + W - 3}" y="${Y + U - 3.5}" text-anchor="end">${esc(commit)}</text>`;
  const lines = wrap(n.title, Math.max(3, (W - 2.4 * U) / TITLE_PX), Math.max(1, pl.h - 2));
  lines.forEach((l, k) => (s += `<text class="hand cell-title${t}" x="${X + 4}" y="${Y + U * (2 + k) - 3.5}">${esc(l)}</text>`));
  s += `<g class="inn-house">${house(X + W - 2.1 * U, Y + Hh - 2.05 * U, 1.7 * U, 1.75 * U, `inn:${id}`)}</g>`;
  if (st === 'cleared') s += `<text class="camp-done stamp-in" x="${X + 4}" y="${Y + Hh - 5}">泊まった</text>`;
  return `<g class="node camp${extra}" ${attrs} data-owner="${esc(n.owner || '')}" aria-label="町 ${esc(id)} ${esc(n.title)}">${s}</g>`;
}

function gateMarkup(view, pl, n, chars, monsters, attrs, extra) {
  const id = pl.id;
  const goal = pl.kind === 'goal';
  const X = wx(pl.page, pl.x);
  const Y = wy(pl.y);
  const W = pl.w * U;
  const Hh = pl.h * U;
  const st = n.state;
  const pencil = st === 'fog';
  const tool = pencil ? 'pencil' : 'ballpoint';
  const ink = pencil ? 'pencil-line' : 'pen';
  const t = pencil ? ' pencil-text' : '';
  const members = n.members || [];
  const here = (m) => {
    const c = chars[m];
    return c && ((c.at === id && c.status === 'waiting') || c.status === 'done');
  };
  const waiting = members.filter(here);
  let s = `<rect class="gate-paper" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  s += `<rect class="cell-grid" x="${X}" y="${Y}" width="${W}" height="${Hh}" fill="url(#grid-5mm)"/>`;
  // 城壁の上の凸凹（門のところはあける）
  const doorCols = new Set(Object.values(pl.doors).flatMap((c) => [c - 1, c]));
  let cren = '';
  for (let k = 0; k < pl.w; k += 2) {
    const cx = pl.x + k;
    if (doorCols.has(cx) || doorCols.has(cx + 1)) continue;
    cren += `M${wx(pl.page, cx)} ${Y} V${Y - 0.55 * U} H${wx(pl.page, cx + 1)} V${Y} `;
  }
  if (goal) {
    // 魔王の城の塔（左右と真ん中）
    for (const tx of [pl.x + 0.5, pl.x + pl.w / 2 - 1.5, pl.x + pl.w - 3.5]) {
      const tX = wx(pl.page, tx);
      cren += `M${f1(tX)} ${Y} V${f1(Y - 1.6 * U)} h${f1(0.6 * U)} v${f1(0.4 * U)} h${f1(0.6 * U)} v${f1(-0.4 * U)} h${f1(0.6 * U)} v${f1(0.4 * U)} h${f1(0.6 * U)} v${f1(-0.4 * U)} h${f1(0.6 * U)} V${Y} `;
    }
  }
  if (cren) s += `<path class="merlons" d="${cren}"/><path class="${ink} gate-line crenel" data-tool="${tool}" d="${cren}" pathLength="1"/>`;
  // 中ボスの砦: 両はしに塔（ぎざぎざの屋上・アーチの窓・三角の旗）
  if (!goal && pl.w >= 10) for (const left of [true, false]) s += tower(left ? X + 0.15 * U : X + W - 1.75 * U, Y, Hh, `${id}:${left}`, pencil);
  if (st === 'ready') s += `<path d="${rect(X - 4, Y - 4, W + 8, Hh + 8, `ready:${id}`, 1.5)}" class="gate-ready"/>`;
  s += outline(X, Y, W, Hh, `gate:${id}`, pencil, 'gate-line');
  s += `<rect class="cell-hit" x="${X}" y="${Y}" width="${W}" height="${Hh}"/>`;
  // 門（メンバーの道が入るところ）
  for (const m of members) {
    const c = chars[m];
    const col = pl.doors[m];
    if (!c || col == null) continue;
    const cx = wx(pl.page, col);
    s += `<path class="door" d="M${f1(cx - 0.75 * U)} ${Y + 1} V${f1(Y + 0.9 * U)} Q${f1(cx)} ${f1(Y + 0.1 * U)} ${f1(cx + 0.75 * U)} ${f1(Y + 0.9 * U)} V${Y + 1}" stroke="${hl(c.color)}"/>`;
    if (!here(m)) s += `<text class="hand door-who${t}" x="${f1(cx)}" y="${f1(Y + 1.75 * U)}" text-anchor="middle">${esc([...c.name][0])}</text>`;
  }
  // ボス（中ボスはドラゴン、あがりは魔王）
  // 魔王は城のまん中の塔の前に大きく。中ボス（ドラゴン）は帯の右の端
  const bs = goal ? 5.2 * U : 2.7 * U;
  const towers = !goal && pl.w >= 10 ? 1.75 * U : 0;
  const bx = goal ? X + W / 2 - bs / 2 : X + W - bs - 0.3 * U - towers;
  const by = goal ? Y + 0.2 * U : Y + Hh - bs - 0.2 * U;
  const beaten = st === 'cleared';
  const bossFill = beaten ? '#ffffff' : pencil ? '#ffffff' : goal ? '#e6dcff' : '#c9f0dc';
  s += `<g class="boss${beaten ? ' beaten' : st === 'ready' ? ' angry' : ''}${pencil ? ' is-fog' : ''}">${monsterMarkup(monsters, goal ? 'maou' : 'dragon', bx, by, bs, bossFill, beaten ? 'is-slain' : pencil ? 'is-fog' : '')}</g>`;
  if (beaten) s += `<path class="boss-x stamp-in" data-tool="redpen" d="${line(bx + 4, by + 4, bx + bs - 4, by + bs - 4, `x1:${id}`, 1)} ${line(bx + bs - 4, by + 4, bx + 4, by + bs - 4, `x2:${id}`, 1)}"/>`;
  // 字: ID・中ボス・題、HP（テストの数）
  const tests = n.tests && Number.isInteger(n.tests.total) ? n.tests : { pass: 0, total: casesOf(n).length };
  let tx = X + 0.5 * U + towers;
  let ty = Y + 1.75 * U;
  if (goal) {
    [...'あがり'].forEach((ch, k) => {
      const cx = wx(pl.page, pl.x + 1 + k * 2);
      s += `<path class="${ink} title-box" data-tool="${tool}" d="${ruled(cx, Y + 1.2 * U, 2 * U, 2 * U, `goal${k}`, 0.3)}"/>`;
    });
    s += `<text class="goal-char" x="${wx(pl.page, pl.x + 1) + (2 * U - 22) / 2}" y="${f1(Y + 2.73 * U)}" letter-spacing="${2 * U - 22}">あがり</text>`;
    tx = wx(pl.page, pl.x + 1);
    ty = Y + 4.3 * U;
  }
  const kind = goal ? '魔王の城・章のあがり' : '中ボス・結合テスト';
  const title = n.title.replace(/^(結合|あがり)[:：]\s*/, '');
  const room = (goal ? X + W / 2 - bs / 2 : bx) - tx - 6;
  const head = `${id} `;
  const fit = (str, size, w) => {
    let o = '';
    for (const ch of [...str]) {
      if (textW(o + ch + '…', size) > w) return o + '…';
      o += ch;
    }
    return o;
  };
  // 題（技術の言葉。砦は2行まで、魔王の城は1行）
  const tLines = wrapJa(`${head}${title}`, Math.max(4, room / 14), goal ? 1 : 2);
  tLines.forEach((l, k) => (s += `<text class="gate-title${t}" x="${f1(tx)}" y="${f1(ty + k * 1.05 * U)}">${esc(l)}</text>`));
  void fit;
  const hpY = goal ? ty + 1.15 * U : Y + 3.75 * U;
  const hp = tests.total > 0 ? `テスト ${tests.pass}/${tests.total}` : 'テスト ？';
  s += `<text class="hand gate-hp${t}" x="${f1(tx)}" y="${f1(hpY)}">${esc(hp)}</text>`;
  // HP の目盛り（テスト1件 = 1目）
  if (tests.total > 0) {
    const hx = tx + textW(hp, 11.5) + 8;
    const cnt = Math.min(tests.total, Math.max(1, Math.floor((room - textW(hp, 11.5) - 10) / 9)));
    for (let k = 0; k < cnt; k++) s += `<rect class="hp-pip${k < tests.pass ? ' done' : ''}" x="${f1(hx + k * 9)}" y="${f1(hpY - 8)}" width="7" height="8"/>`;
  }
  const commit = n.save?.commit ? `・commit ${String(n.save.commit).slice(0, 7)}` : '';
  s += `<text class="hand gate-kind${t}" x="${f1(tx)}" y="${f1(hpY + 0.85 * U)}">${esc(kind)}${esc(commit)}</text>`;
  let label;
  if (beaten) label = goal ? 'あがり！' : '撃破！';
  else if (st === 'ready') label = 'そろった！ 結合テスト';
  else label = `待機 ${waiting.length}/${members.length}`;
  if (goal) s += `<text class="hand gate-count big${t}${beaten ? ' done' : ''}" x="${f1(X + W - 0.8 * U)}" y="${f1(Y + 2 * U)}" text-anchor="end">${esc(label)}</text>`;
  else s += `<text class="hand gate-count${t}${beaten ? ' done' : ''}" x="${f1(bx + bs / 2)}" y="${f1(by - 1)}" text-anchor="middle">${esc(label)}</text>`;
  if (beaten) s += `<path d="${hanamaru(bx + bs / 2, by + bs / 2, bs * 0.62, `hm:${id}`)}" class="hanamaru big" data-tool="redpen" pathLength="1"/>`;
  if (n.fails > 0 && !beaten) s += `<text class="hand fail-tally" x="${X + 4}" y="${Y + Hh - 5}">${'✗'.repeat(Math.min(n.fails, 3))}</text>`;
  s += sealMark(n, X + 0.55 * U, Y + Hh - 0.6 * U);
  return `<g class="node gate${goal ? ' goal' : ''}${extra}" ${attrs} aria-label="${goal ? '魔王の城' : '中ボス'} ${esc(id)} ${esc(n.title)}（${esc(own(STATUS_JA, st) || st)}・${esc(hp)}）">${s}</g>`;
}

// ---------- 駒の絵 ----------
export function spriteMarkup(sprites, c, x, y, size, seedTag = 'pawn') {
  const color = hl(c.color);
  const src = sprites instanceof Map ? sprites.get(c.job) : own(sprites, c.job);
  if (typeof src === 'string') {
    const inner = src.replace(/var\(--pawn,\s*#ffe45c\)/g, color);
    return `<svg x="${f1(x)}" y="${f1(y)}" width="${f1(size)}" height="${f1(size)}" viewBox="0 0 64 64" class="sprite">${inner}</svg>`;
  }
  const s = size / 64;
  const cx = x + 32 * s;
  const seed = `${seedTag}:${c.id}`;
  const body = `M${f1(x + 14 * s)} ${f1(y + 58 * s)} Q${f1(x + 16 * s)} ${f1(y + 30 * s)} ${f1(cx)} ${f1(y + 30 * s)} Q${f1(x + 48 * s)} ${f1(y + 30 * s)} ${f1(x + 50 * s)} ${f1(y + 58 * s)} Z`;
  return `<g class="sprite fallback">
    <path d="${body}" fill="${color}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="${circle(cx, y + 20 * s, 13 * s, seed, 0.6)}" fill="#fff" stroke="${INK}" stroke-width="1.8"/>
    <circle cx="${f1(cx - 4.5 * s)}" cy="${f1(y + 20 * s)}" r="${f1(1.6 * s)}" fill="${INK}"/>
    <circle cx="${f1(cx + 4.5 * s)}" cy="${f1(y + 20 * s)}" r="${f1(1.6 * s)}" fill="${INK}"/>
    <text x="${f1(cx)}" y="${f1(y + 50 * s)}" text-anchor="middle" class="hand fallback-initial" font-size="${f1(13 * s)}">${esc([...(c.name || '?')][0])}</text>
  </g>`;
}

export { P1_TOP };
