// 世界地図の割り付け。ビュー（CONTRACTS §5・§40〜§43）から、縦の B5 の5mm方眼ノートの何ページかに、
// キャラクターごとの道・モンスターのマス（テスト1件 = 1マス）・ダンジョンの出口の札・町・城を置く。
// 座標はすべて「目」（1目 = 5mm = U）の整数。ページの左上からの目で考え、世界の座標はページの位置を足す。
import { rng, own } from './sketch.js';

export const U = 16;
export const PAGE = { w: 36, h: 51 };
export const GRID = { x: 1, y: 3, w: 34, h: 47 }; // 方眼が刷ってあるところ
export const X0 = 1; // 道を置ける左の端
export const X1 = 35; // 道を置ける右の端（この目は含まない）
export const P1_TOP = 14; // 1ページ目: 題名・ふりだし・名札の下から道が始まる
export const PN_TOP = 6; // 2ページ目から: 道の上の名札の下から
export const BOTTOM = 49; // マスや札の下の端の限り
export const SPREAD_GAP = 6; // 見開きと見開きのあいだの机
const SQ = 2;
const H = { camp: 4, gate: 4, goal: 10, stamp: 5 };

/** ページ（0始まり）の左上の世界座標（目） */
export function pageOrigin(p) {
  const spread = Math.floor(p / 2);
  return { x: spread * (2 * PAGE.w + SPREAD_GAP) + (p % 2) * PAGE.w, y: 0 };
}

/** 道の並べ方: ゲートのメンバーがなるべく隣り合う順 */
const laneCache = new Map();
export function orderLanes(characters, nodes) {
  const ids = characters.map((c) => c.id);
  const gates = Object.values(nodes)
    .filter((n) => n && n.type === 'gate' && Array.isArray(n.members) && n.members.length < ids.length)
    .map((n) => n.members.filter((m) => ids.includes(m)))
    .filter((m) => m.length > 1);
  // 同じキャラクターとゲートなら、前に決めた並びを使う（8人で 40320 通りを毎回数え直さない）
  const key = JSON.stringify([ids, gates]);
  if (laneCache.has(key)) return laneCache.get(key);
  const best = searchLanes(ids, gates);
  if (laneCache.size > 20) laneCache.clear();
  laneCache.set(key, best);
  return best;
}

function searchLanes(ids, gates) {
  if (ids.length > 8 || gates.length === 0) return ids;
  const score = (order) => {
    const pos = new Map(order.map((id, i) => [id, i]));
    let s = 0;
    for (const m of gates) {
      const idx = m.map((id) => pos.get(id));
      const lo = Math.min(...idx);
      const hi = Math.max(...idx);
      s += (hi - lo + 1 - m.length) * 100 + (hi - lo);
    }
    order.forEach((id, i) => (s += Math.abs(i - ids.indexOf(id)) * 0.01));
    return s;
  };
  let best = ids;
  let bestScore = score(ids);
  const permute = (arr, k) => {
    if (k === arr.length) {
      const sc = score(arr);
      if (sc < bestScore) (bestScore = sc), (best = arr.slice());
      return;
    }
    for (let i = k; i < arr.length; i++) {
      [arr[k], arr[i]] = [arr[i], arr[k]];
      permute(arr, k + 1);
      [arr[k], arr[i]] = [arr[i], arr[k]];
    }
  };
  permute(ids.slice(), 0);
  return best;
}

/** マスの種類 */
export function kindOf(view, id) {
  const n = own(view.nodes, id);
  if (!n) return 'none';
  if (n.type === 'gate') return view.quest?.goal === id ? 'goal' : 'gate';
  if (n.type === 'camp') return 'camp';
  return n.check?.kind === 'cmd' ? 'cmd' : 'stamp';
}

/** cmd の task のテスト（ビューの cases。無い・空なら「？」のマス1つ） */
export function casesOf(n) {
  return Array.isArray(n?.cases) ? n.cases : [];
}

const topOf = (p) => (p === 0 ? P1_TOP : PN_TOP);

/** 札の題が何行になるか（幅 w 目の札に 10.5px の字で書く） */
export function titleLines(title, w, max = 3) {
  return wrapJa(title, Math.max(3, (w * U - 7) / 10.5), max);
}

const isA = (c) => /[\x21-\x7e]/.test(c);
const cw = (t) => [...t].reduce((a, c) => a + (/[\x20-\x7e]/.test(c) ? 0.56 : 1), 0);
/**
 * 日本語の題を、なるべく言葉の切れ目で折り返す（英数字の語 GET /api/memos は割らない。助詞のあと・空白で切る）。
 * 幅は全角1字 = 1。入りきらなければ最後の行を … で終える
 */
export function wrapJa(text, max, maxLines = 2) {
  const chars = [...String(text || '')];
  const parts = [];
  let cur = '';
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const n = chars[i + 1];
    cur += c;
    const brk =
      c === ' ' ||
      (/[をにがはでとのへも、。・）」]/.test(c) && n && !/[をにがはでとのへもる、。）」ー]/.test(n) && !isA(n)) ||
      (isA(c) && n && !isA(n) && n !== ' ' && !/[）」、。・ー]/.test(n)) ||
      (!isA(c) && n && isA(n) && !/[（「]/.test(c));
    if (brk) (parts.push(cur), (cur = ''));
  }
  if (cur) parts.push(cur);
  const lines = [];
  let line = '';
  for (let p of parts) {
    while (cw(p) > max) {
      if (line) (lines.push(line.trimEnd()), (line = ''));
      let head = '';
      for (const c of [...p]) {
        if (cw(head + c) > max) break;
        head += c;
      }
      if (!head) head = [...p][0];
      lines.push(head);
      p = p.slice(head.length);
    }
    if (line && cw(line + p.trimEnd()) > max) (lines.push(line.trimEnd()), (line = p.trimStart()));
    else line += p;
  }
  if (line.trim()) lines.push(line.trimEnd());
  for (let k = 1; k < lines.length; k++) {
    const m = lines[k].match(/^[）」、。]+/);
    if (m) (lines[k - 1] += m[0]), (lines[k] = lines[k].slice(m[0].length));
  }
  const out = lines.filter(Boolean);
  if (out.length > maxLines) {
    const kept = out.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last && cw(last + '…') > max) last = [...last].slice(0, -1).join('');
    kept[maxLines - 1] = last + '…';
    return kept;
  }
  return out;
}

export function layoutWorld(view) {
  const chars = view.characters || [];
  const nodes = view.nodes || {};
  const quest = view.quest?.id || '';
  const lanes = orderLanes(chars, nodes);
  const laneOf = new Map(lanes.map((id, i) => [id, i]));
  const ids = Object.keys(nodes);
  const membersOf = (id) => {
    const n = own(nodes, id);
    const ms = n.type === 'gate' ? (n.members?.length ? n.members : chars.filter((c) => c.path.includes(id)).map((c) => c.id)) : [n.owner ?? chars.find((c) => c.path.includes(id))?.id];
    return ms.filter((m) => laneOf.has(m));
  };
  const fairW = Math.max(2, Math.floor((X1 - X0) / Math.max(1, lanes.length)));
  const cardEstW = Math.max(4, Math.min(9, fairW));
  const maxRow = lanes.length > 8 ? 1 : 2;

  // ---- A. 縦: ページと y を決める（キャラごとのカーソル。ゲートはメンバーと、そのあいだの道をそろえる） ----
  const preds = new Map(ids.map((id) => [id, []]));
  for (const c of chars) for (let i = 1; i < c.path.length; i++) preds.get(c.path[i])?.push(c.path[i - 1]);
  const vy = new Map();
  const vyOf = (id, seen = new Set()) => {
    if (vy.has(id)) return vy.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    let y = 0;
    for (const p of preds.get(id) || []) y = Math.max(y, vyOf(p, seen) + 1);
    vy.set(id, y);
    return y;
  };
  const laneMin = (id) => Math.min(...membersOf(id).map((m) => laneOf.get(m)), 99);
  const order = ids.filter((id) => membersOf(id).length).sort((a, b) => vyOf(a) - vyOf(b) || laneMin(a) - laneMin(b));

  const pages = [{ units: [] }];
  const ensure = (p) => {
    while (pages.length <= p) pages.push({ units: [] });
  };
  const cursor = new Map(lanes.map((id) => [id, { page: 0, y: P1_TOP }]));
  const place = Object.create(null);
  for (const id of order) {
    const n = own(nodes, id);
    const kind = kindOf(view, id);
    const ms = membersOf(id);
    let span = ms;
    if (kind === 'gate') {
      const idx = ms.map((m) => laneOf.get(m));
      span = lanes.slice(Math.min(...idx), Math.max(...idx) + 1);
    } else if (kind === 'goal') span = lanes;
    let page = Math.max(...span.map((m) => cursor.get(m).page));
    let y = Math.max(...span.map((m) => (cursor.get(m).page === page ? cursor.get(m).y : topOf(page))));
    const pl = { id, kind, members: ms, span };
    if (kind === 'cmd') {
      const nCases = Math.max(1, casesOf(n).length);
      const r = rng(`${quest}:rows:${id}`);
      const rows = [];
      for (let left = nCases; left > 0; ) {
        const len = left >= 2 && maxRow >= 2 && (rows.length > 0 || nCases > 3) && r() < 0.62 ? 2 : 1;
        rows.push(len);
        left -= len;
      }
      const lines = titleLines(n.title, cardEstW).length;
      const cardH = 2 + Math.max(2, lines);
      const need = 1 + rows.length * SQ + 1 + cardH;
      if (y + need > BOTTOM && topOf(page + 1) + need <= BOTTOM) (page += 1), (y = topOf(page));
      // 行ごとに置く（1ページに入らない長いダンジョンは、次のページへ続ける）
      let yy = y + 1;
      pl.rows = rows.map((len) => {
        if (yy + SQ > BOTTOM) (page += 1), (yy = topOf(page));
        const row = { len, page, y: yy };
        yy += SQ;
        return row;
      });
      yy += 1;
      if (yy + cardH > BOTTOM) (page += 1), (yy = topOf(page) + 1);
      Object.assign(pl, { page, y: yy, h: cardH, top: y, firstPage: pl.rows[0].page });
      y = yy + cardH;
    } else {
      const h = kind === 'camp' ? H.camp : kind === 'gate' ? H.gate : kind === 'goal' ? H.goal : H.stamp;
      const gap = kind === 'goal' ? 3 : 1;
      if (y + gap + h > BOTTOM) (page += 1), (y = topOf(page));
      Object.assign(pl, { page, y: y + gap, h, top: y, firstPage: page });
      y = y + gap + h;
    }
    ensure(page);
    place[id] = pl;
    for (const m of span) cursor.set(m, { page, y });
  }
  // 見開きにするので、ページは偶数枚（最後の白いページには凡例と景色）
  if (pages.length % 2) pages.push({ units: [] });
  for (const pl of Object.values(place)) {
    for (let p = pl.firstPage; p <= pl.page; p++) pages[p].units.push(pl.id);
  }

  // ---- B. 横: ページごとに道の幅を決める（そのページに札があるキャラは広く、通るだけのキャラは細く） ----
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const active = new Set();
    for (const id of page.units) {
      const pl = place[id];
      if (pl.kind === 'cmd' || pl.kind === 'camp' || pl.kind === 'stamp') active.add(pl.members[0]);
    }
    if (p === 0) for (const id of lanes) active.add(id); // 1ページ目は名札を書くので、みんな広く
    const nT = lanes.length - active.size;
    const thin = 2;
    const room = X1 - X0 - nT * thin;
    let wide = active.size ? Math.floor(room / active.size) : 0;
    wide = Math.max(2, Math.min(11, wide));
    if (!active.size) wide = 0;
    let spare = X1 - X0 - nT * thin - wide * active.size;
    const all = active.size === 0;
    const eq = all ? Math.max(2, Math.floor((X1 - X0) / Math.max(1, lanes.length))) : 0;
    if (all) spare = X1 - X0 - eq * lanes.length;
    const slack = new Map();
    const r = rng(`${quest}:slack:${p}`);
    for (let k = 0; k < Math.max(0, spare); k++) {
      const i = Math.floor(r() * (lanes.length + 1));
      slack.set(i, (slack.get(i) || 0) + 1);
    }
    const geo = Object.create(null);
    let x = X0;
    lanes.forEach((id, i) => {
      x += slack.get(i) || 0;
      const w = all ? eq : active.has(id) ? wide : thin;
      geo[id] = { x, w, active: active.has(id), mid: x + w / 2 };
      x += w;
    });
    page.lanes = geo;
  }

  // ---- C. 札・マスの x ----
  const seededInt = (seed, lo, hi) => lo + Math.floor(rng(seed)() * (hi - lo + 1));
  for (const id of order) {
    const pl = place[id];
    const n = own(nodes, id);
    if (pl.kind === 'gate' || pl.kind === 'goal') {
      const g = pages[pl.page].lanes;
      if (pl.kind === 'goal') (pl.x = X0), (pl.w = X1 - X0);
      else {
        pl.x = Math.min(...pl.span.map((m) => g[m].x));
        pl.w = Math.max(...pl.span.map((m) => g[m].x + g[m].w)) - pl.x;
      }
      pl.doors = Object.create(null);
      for (const m of pl.members) pl.doors[m] = Math.floor(g[m].mid);
      if (pl.kind === 'goal') {
        // あがりの城の門は、城の幅いっぱいに並べる
        const ms = pl.members;
        ms.forEach((m, i) => (pl.doors[m] = Math.round(pl.x + ((i + 0.5) * pl.w) / ms.length)));
      }
      continue;
    }
    const owner = pl.members[0];
    if (pl.kind === 'cmd') {
      let cur = null;
      pl.squares = [];
      let i = 0;
      const r = rng(`${quest}:sq:${id}`);
      for (const row of pl.rows) {
        const g = pages[row.page].lanes[owner];
        const lo = g.x;
        const hi = Math.max(g.x, g.x + g.w - SQ);
        if (cur === null || cur < lo || cur > hi) cur = seededInt(`${quest}:sx:${id}:${row.page}`, lo, hi);
        for (let k = 0; k < row.len; k++) {
          if (k > 0) {
            const opts = [cur + SQ, cur - SQ].filter((v) => v >= lo && v <= hi);
            cur = opts.length ? opts[Math.floor(r() * opts.length)] : cur + SQ;
          }
          pl.squares.push({ i: i++, page: row.page, x: cur, y: row.y });
        }
      }
      const g = pages[pl.page].lanes[owner];
      pl.w = Math.max(Math.min(4, g.w), Math.min(g.w, 9));
      const last = pl.squares[pl.squares.length - 1];
      const target = last.page === pl.page ? last.x + 1 - Math.floor(pl.w / 2) : g.x + Math.floor((g.w - pl.w) / 2);
      pl.x = Math.max(g.x, Math.min(g.x + g.w - pl.w, target));
      pl.lines = titleLines(n.title, pl.w).length;
    } else {
      const g = pages[pl.page].lanes[owner];
      pl.w = pl.kind === 'camp' ? Math.max(Math.min(4, g.w), Math.min(g.w, 7)) : Math.max(Math.min(4, g.w), Math.min(g.w, 8));
      pl.x = seededInt(`${quest}:cx:${id}`, g.x, Math.max(g.x, g.x + g.w - pl.w));
    }
  }

  // ---- D. 道（キャラごと・ページごとの点の列）と、駒の立つ場所（stops） ----
  const roads = Object.create(null);
  const stops = Object.create(null);
  for (const c of chars) {
    if (!laneOf.has(c.id)) continue;
    const segs = new Map(); // page -> [[x, y], ...]（ページの左上からの目）
    const pts = (p) => {
      if (!segs.has(p)) segs.set(p, [[]]);
      const list = segs.get(p);
      return list[list.length - 1];
    };
    const newPiece = (p) => {
      if (!segs.has(p)) segs.set(p, []);
      segs.get(p).push([]);
    };
    const g0 = pages[0].lanes[c.id];
    let cur = { page: 0, x: g0.mid, y: P1_TOP - 1 };
    pts(0).push([cur.x, cur.y]);
    const cont = []; // ページの下で次のページへ続く印 {page, x}
    const goTo = (page, x, y) => {
      if (page > cur.page) {
        pts(cur.page).push([cur.x, BOTTOM + 0.6]);
        cont.push({ page: cur.page, x: cur.x });
        for (let p = cur.page + 1; p < page; p++) {
          const mid = pages[p].lanes[c.id].mid;
          newPiece(p);
          pts(p).push([mid, PN_TOP - 1], [mid, BOTTOM + 0.6]);
          cont.push({ page: p, x: mid });
        }
        const mid = pages[page].lanes[c.id].mid;
        newPiece(page);
        cur = { page, x: mid, y: PN_TOP - 1 };
        pts(page).push([cur.x, cur.y]);
      }
      if (Math.abs(x - cur.x) > 0.01) {
        const jy = Math.min(y, cur.y + 1);
        pts(page).push([cur.x, jy], [x, jy]);
      }
      pts(page).push([x, y]);
      cur = { page, x, y };
    };
    const list = [];
    for (const id of c.path) {
      const pl = place[id];
      if (!pl) continue;
      if (pl.kind === 'cmd') {
        const n = own(nodes, id);
        const nCases = casesOf(n).length;
        for (const s of pl.squares) {
          goTo(s.page, s.x + 1, s.y + 1);
          list.push({ node: id, square: nCases === 0 ? 0 : s.i, page: s.page, x: s.x + 1, y: s.y + 1.75 });
        }
        const last = pl.squares[pl.squares.length - 1];
        const fx = last.page === pl.page ? last.x + 1 : pl.x + pl.w / 2;
        goTo(pl.page, fx, pl.y);
        if (nCases > 0) list.push({ node: id, square: nCases, page: pl.page, x: fx, y: pl.y - 0.15, exit: true });
        const ex = pl.x + pl.w / 2;
        pts(pl.page).push([fx, pl.y + pl.h / 2], [ex, pl.y + pl.h / 2], [ex, pl.y + pl.h]);
        cur = { page: pl.page, x: ex, y: pl.y + pl.h };
      } else if (pl.kind === 'gate' || pl.kind === 'goal') {
        const dx = pl.doors[c.id] ?? pl.x + 1;
        goTo(pl.page, dx, pl.y);
        list.push({ node: id, square: null, page: pl.page, x: dx, y: pl.y + (pl.kind === 'goal' ? pl.h - 0.8 : pl.h - 0.6) });
        if (pl.kind === 'goal') break;
        pts(pl.page).push([dx, pl.y + pl.h]);
        cur = { page: pl.page, x: dx, y: pl.y + pl.h };
      } else {
        const cx = pl.x + pl.w / 2;
        goTo(pl.page, cx, pl.y);
        list.push({ node: id, square: null, page: pl.page, x: pl.x + Math.min(1.4, pl.w / 2), y: pl.y + pl.h - 0.3 });
        pts(pl.page).push([cx, pl.y + pl.h]);
        cur = { page: pl.page, x: cx, y: pl.y + pl.h };
      }
    }
    roads[c.id] = { pieces: [...segs].flatMap(([page, arr]) => arr.filter((a) => a.length > 1).map((a) => ({ page, pts: dedupe(a) }))), cont };
    stops[c.id] = list;
  }

  const lay = { pages, place, roads, stops, lanes, order, quest };
  for (let p = 0; p < pages.length; p++) pages[p].scenery = scenery(view, lay, p);
  return lay;
}

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 0.01 && Math.abs(q[1] - p[1]) < 0.01) continue;
    out.push(p);
  }
  return out;
}

/** 駒が立つ場所（ビューの at・square から）。見つからなければ null */
export function stopOf(view, lay, c) {
  const list = lay.stops[c.id] || [];
  const at = c.at ?? view.quest?.goal;
  const here = list.filter((s) => s.node === at);
  if (!here.length) return list[0] || null;
  if (here.length === 1 || c.square == null) return here[0];
  return here.find((s) => s.square === c.square) || here[0];
}

/** 道のりの中での駒の位置（何番目の stop か） */
export function stopIndex(view, lay, c) {
  const list = lay.stops[c.id] || [];
  const s = stopOf(view, lay, c);
  return s ? list.indexOf(s) : -1;
}

// ---- 景色（マスではない。ページの空きを埋める） ----
const KINDS = [
  ['sea', 11, 5, 1],
  ['lake', 6, 4, 2],
  ['mountains', 6, 4, 2],
  ['town', 5, 3, 2],
  ['mountain', 3, 3, 5],
  ['forest', 4, 3, 5],
  ['house', 2, 2, 5],
  ['tree', 1, 2, 12],
  ['flower', 1, 1, 5],
  ['grass', 1, 1, 8],
];

function scenery(view, lay, p) {
  const page = lay.pages[p];
  const W = PAGE.w;
  const Hh = PAGE.h;
  const used = Array.from({ length: Hh }, () => new Uint8Array(W));
  const mark = (x, y, w, h, pad = 0) => {
    for (let yy = Math.max(0, Math.floor(y - pad)); yy < Math.min(Hh, Math.ceil(y + h + pad)); yy++)
      for (let xx = Math.max(0, Math.floor(x - pad)); xx < Math.min(W, Math.ceil(x + w + pad)); xx++) used[yy][xx] = 1;
  };
  const top = p === 0 ? P1_TOP - 1 : PN_TOP - 1;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (x < X0 || x >= X1 || y < top || y > BOTTOM) used[y][x] = 1;
  if (p === 0) mark(X0, 0, X1 - X0, P1_TOP); // 見出し
  if (p === lay.pages.length - 1 && !page.units.length) mark(X0, 5, 24, view.ending ? 33 : 16); // 最後の白いページの「読み方」（とエンディング）
  for (const id of page.units) {
    const pl = lay.place[id];
    if (pl.page === p) mark(pl.x, pl.y, pl.w, pl.h, 1);
    if (pl.squares) for (const s of pl.squares) if (s.page === p) mark(s.x, s.y, SQ, SQ, 0.5);
  }
  for (const rd of Object.values(lay.roads))
    for (const piece of rd.pieces) {
      if (piece.page !== p) continue;
      for (let i = 0; i + 1 < piece.pts.length; i++) {
        const [ax, ay] = piece.pts[i];
        const [bx, by] = piece.pts[i + 1];
        mark(Math.min(ax, bx) - 0.9, Math.min(ay, by) - 0.6, Math.abs(bx - ax) + 1.8, Math.abs(by - ay) + 1.2, 0);
      }
    }
  // 駒の頭の上（立っている場所の上2目）
  for (const list of Object.values(lay.stops)) for (const s of list) if (s.page === p) mark(s.x - 1, s.y - 3, 2, 3, 0);
  const free = (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > W || y + h > Hh) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (used[yy][xx]) return false;
    return true;
  };
  const r = rng(`${lay.quest}:scenery:${p}`);
  const out = [];
  for (const [kind, w, h, tries] of KINDS) {
    let placed = 0;
    for (let t = 0; t < 500 && placed < tries; t++) {
      const x = X0 + Math.floor(r() * (X1 - X0 - w + 1));
      const y = top + Math.floor(r() * (BOTTOM - top - h + 2));
      if (!free(x, y, w, h)) continue;
      if ((kind === 'tree' || kind === 'grass' || kind === 'flower') && r() < 0.3) continue;
      out.push({ kind, x, y, w, h, seed: `${lay.quest}:${p}:${kind}:${x}:${y}` });
      mark(x, y, w, h, kind === 'tree' || kind === 'grass' || kind === 'flower' ? 0 : 1);
      placed++;
    }
  }
  return out;
}
