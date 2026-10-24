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
export const SPREAD_GAP = 40; // 見開きと見開きのあいだの机
const SQ = 2;
const H = { camp: 4, gate: 5, goal: 10, stamp: 4 };
const MARGIN_ROOM = 5; // 余白のマスの下に空けておく目（吹き出し 4 目まで + すき間 1 目。その道だけ）

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

/**
 * 余白のマス（§53）: 道の上の、マスとマスのあいだの出来事（talk 別の担当との会話 / npc 町の住人との雑談 / news 瓦版）。
 * 進みは止めない（判定も罰もない）。道（キャラクター）と after（その道の上のマス）がビューにあるものだけ。あがりの城のあとには置かない
 */
export function marginsOf(view) {
  const list = Array.isArray(view?.margins) ? view.margins : [];
  const chars = byIdLocal(view?.characters);
  const goal = view?.quest?.goal;
  const out = [];
  const seen = new Set();
  for (const m of list) {
    if (!m || typeof m !== 'object') continue;
    const c = own(chars, m.road);
    if (!c || !Array.isArray(c.path) || !c.path.includes(m.after) || m.after === goal) continue;
    const id = String(m.id ?? `${m.road}:${m.after}:${out.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...m, id, kind: ['talk', 'npc', 'news'].includes(m.kind) ? m.kind : 'talk', lines: Array.isArray(m.lines) ? m.lines.filter((l) => l && typeof l === 'object') : [] });
  }
  return out;
}

function byIdLocal(list) {
  const map = Object.create(null);
  for (const x of Array.isArray(list) ? list : []) if (x && typeof x === 'object') map[x.id] = x;
  return map;
}

/** 瓦版（§53）のニュース: 字のあるものだけ。domain は製品の分野のニュース、extra は冒険の号外 */
export function newsOf(view) {
  return (Array.isArray(view?.news) ? view.news : [])
    .filter((n) => n && typeof n === 'object' && typeof n.text === 'string' && n.text.trim())
    .map((n) => ({ text: n.text.trim(), kind: n.kind === 'extra' ? 'extra' : 'domain', seq: Number.isInteger(n.seq) ? n.seq : null }));
}

/** 余白で出来事が起きたか（§53.3: 駒が after より先へ進んでいれば、エンジンが lines を入れる） */
export const marginHappened = (m) => Array.isArray(m?.lines) && m.lines.some((l) => l && typeof l.text === 'string' && l.text);

export const TITLE_PX = 12.5; // 札の題の字の大きさ（見開き全体でも読める大きさ）
/** 札の題が何行になるか（幅 w 目の札に TITLE_PX の字で書く） */
export function titleLines(title, w, max = 3) {
  return wrapJa(title, Math.max(3, (w * U - 8) / TITLE_PX), max);
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
  const margins = marginsOf(view).filter((m) => laneOf.has(m.road));
  const marginKey = (road, after) => `${road}\u0000${after}`;
  const marginsAfter = new Map();
  for (const m of margins) {
    const k = marginKey(m.road, m.after);
    if (!marginsAfter.has(k)) marginsAfter.set(k, []);
    marginsAfter.get(k).push(m);
  }
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
      // 札: 1行目に ID と テスト p/t、その下に題（2行まで。入らなければ3行）
      const lines = titleLines(n.title, cardEstW).length;
      const cardH = 1 + Math.max(2, Math.min(3, lines));
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
    // 余白のマス: after の次に、その道だけ1マス（2×2 目）と、その下に吹き出しの場所を空けて置く
    for (const road of ms)
      for (const mg of marginsAfter.get(marginKey(road, id)) || []) {
        // 吹き出しの場所は、起きた余白（駒が通ったあと）だけに空ける。これから先の地図は今までどおり詰まっている
        // 余白のマスは after と同じページに置く（§53.6）。吹き出しの場所はページの下の端までに縮める。マスも入らないときだけ次のページへ
        let { page: mp, y: my } = cursor.get(road);
        if (my + 1 + SQ > BOTTOM) (mp += 1), (my = topOf(mp));
        const room = marginHappened(mg) ? Math.max(0, Math.min(MARGIN_ROOM, BOTTOM - (my + 1 + SQ))) : 0;
        ensure(mp);
        Object.assign(mg, { page: mp, y: my + 1, w: SQ, h: SQ, room, placed: true });
        cursor.set(road, { page: mp, y: Math.min(BOTTOM, my + 1 + SQ + room) });
      }
  }
  const placedMargins = margins.filter((m) => m.placed);
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
    for (const mg of placedMargins) if (mg.page === p) active.add(mg.road); // 余白のマスの吹き出しが入るように
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
    // 余りは、通るだけの道の幅（蛇行できる場所）と、道と道のあいだ（景色の場所）に分ける
    const thinExtra = new Map();
    if (!all && nT > 0 && spare > 0) {
      const give = Math.floor((spare * 0.6) / nT);
      for (const id of lanes) if (!active.has(id)) thinExtra.set(id, give);
      spare -= give * nT;
      slack.clear();
      for (let k = 0; k < Math.max(0, spare); k++) {
        const i = Math.floor(r() * (lanes.length + 1));
        slack.set(i, (slack.get(i) || 0) + 1);
      }
    }
    const geo = Object.create(null);
    let x = X0;
    lanes.forEach((id, i) => {
      x += slack.get(i) || 0;
      const w = all ? eq : active.has(id) ? wide : thin + (thinExtra.get(id) || 0);
      geo[id] = { x, w, active: active.has(id), mid: x + Math.floor(w / 2) };
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

  // 余白のマスの x: 直前のマス（札・町・城の門・前の余白）の出口の真下に寄せる（道の帯の中）
  const lastX = new Map();
  for (const mg of placedMargins) {
    const g = pages[mg.page].lanes[mg.road];
    const k = marginKey(mg.road, mg.after);
    const prev = place[mg.after];
    let px = g.mid;
    if (lastX.has(k)) px = lastX.get(k);
    else if (prev && prev.page === mg.page) px = prev.kind === 'gate' || prev.kind === 'goal' ? prev.doors[mg.road] ?? g.mid : prev.x + prev.w / 2;
    mg.x = Math.max(g.x, Math.min(Math.max(g.x, g.x + g.w - SQ), Math.round(px) - 1));
    lastX.set(k, mg.x + 1);
  }

  // ---- C2. 札を広げる: 左右が空いていれば、真ん中を変えずに広げる（字を大きく、行を少なく） ----
  const solidsOn = (p, except) => {
    const out = [];
    for (const id of pages[p].units) {
      const q = place[id];
      if (q === except) continue;
      if (q.page === p) out.push({ x: q.x, y: q.y - (q.kind === 'gate' || q.kind === 'goal' ? 2 : 0), w: q.w, h: q.h + (q.kind === 'gate' || q.kind === 'goal' ? 2 : 0) });
      if (q.squares) for (const sq of q.squares) if (sq.page === p) out.push({ x: sq.x, y: sq.y, w: SQ, h: SQ });
    }
    for (const mg of placedMargins) if (mg.page === p && except !== mg) out.push({ x: mg.x, y: mg.y, w: SQ, h: SQ });
    // ほかのキャラの道の帯（札のある道は帯ごと、通るだけの道は真ん中の2目）
    return out;
  };
  const hits = (a, list) => list.some((b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h);
  for (const id of order) {
    const pl = place[id];
    if (pl.kind === 'gate' || pl.kind === 'goal') continue;
    const target = pl.kind === 'camp' ? 7 : 8;
    const owner = pl.members[0];
    const geo = pages[pl.page].lanes;
    const others = solidsOn(pl.page, pl);
    for (const m of lanes) {
      if (m === owner) continue;
      const g = geo[m];
      if (g.active) others.push({ x: g.x, y: 0, w: g.w, h: PAGE.h });
      else others.push({ x: g.mid - 1, y: 0, w: 2, h: PAGE.h });
    }
    while (pl.w + 2 <= target) {
      const wider = { x: pl.x - 1, y: pl.y - 1, w: pl.w + 2, h: pl.h + 2 };
      if (wider.x < X0 || wider.x + wider.w > X1 || hits(wider, others)) break;
      pl.x -= 1;
      pl.w += 2;
    }
    if (pl.kind === 'cmd') pl.lines = titleLines(own(nodes, id).title, pl.w).length;
  }

  // ---- D. 道（キャラごと・ページごとの点の列）と、駒の立つ場所（stops） ----
  const roads = Object.create(null);
  const stops = Object.create(null);
  const solidCache = new Map();
  const solidsAll = (p) => {
    if (!solidCache.has(p)) solidCache.set(p, solidsOn(p, null));
    return solidCache.get(p);
  };
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
      // 余白のマスは道の上にある（駒は止まらない。歩くのはテストのマスだけ）
      for (const mg of marginsAfter.get(marginKey(c.id, id)) || []) {
        if (!mg.placed) continue;
        goTo(mg.page, mg.x + 1, mg.y + 1);
        pts(mg.page).push([mg.x + 1, mg.y + SQ]);
        cur = { page: mg.page, x: mg.x + 1, y: mg.y + SQ };
      }
    }
    roads[c.id] = { pieces: [...segs].flatMap(([page, arr]) => arr.filter((a) => a.length > 1).map((a) => ({ page, pts: dedupe(a) }))), cont };
    for (const piece of roads[c.id].pieces) piece.pts = meander(piece.pts, pages[piece.page].lanes[c.id], solidsAll(piece.page), `${quest}:${c.id}:${piece.page}`);
    stops[c.id] = list;
  }

  const lay = { pages, place, roads, stops, lanes, order, quest, margins: placedMargins };
  // 駒の立つ所と、作業中の駒のふきだし。余白の吹き出しはそれを避けて置く（札・吹き出し・カードが重ならない）
  lay.spots = pawnSpots(view, lay);
  lay.say = sayBoxes(view, lay);
  for (let p = 0; p < pages.length; p++) pages[p].bubbles = bubbles(view, lay, p);
  for (let p = 0; p < pages.length; p++) pages[p].scenery = scenery(view, lay, p);
  return lay;
}

/**
 * 長くまっすぐ下りる所を、自分の道の帯の中で大きく蛇行させる（目の単位。端の点は動かさない）。
 * 札・マス・城（solids）にはぶつからない。帯の外（ほかのキャラの道）にも出ない
 */
function meander(pts, g, solids, seed) {
  if (!g) return pts;
  const r = rng(`meander:${seed}`);
  const out = [pts[0]];
  const lo = g.x + 0.9;
  const hi = g.x + g.w - 0.9;
  const free = (x, y) => x >= lo && x <= hi && !solids.some((b) => x > b.x - 0.9 && x < b.x + b.w + 0.9 && y > b.y - 0.4 && y < b.y + b.h + 0.4);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const len = by - ay;
    if (Math.abs(bx - ax) < 0.01 && len > 4) {
      const amp = Math.min(3.2, Math.max(0.35, (g.w - 2) / 2));
      const period = 7 + r() * 5;
      const phase = r() < 0.5 ? 1 : -1;
      const n = Math.ceil(len / 0.5);
      let prev = ax;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const y = ay + len * t;
        const env = Math.min(1, Math.sin(Math.PI * t) * 2.2);
        let want = ax + phase * amp * env * Math.sin((2 * Math.PI * (y - ay)) / period);
        // ぶつかるなら、元の線のほうへ寄せる
        for (let tries = 0; tries < 8 && !free(want, y); tries++) want = ax + (want - ax) * 0.6;
        if (!free(want, y)) want = ax;
        // 急に跳ばない
        want = prev + Math.max(-0.45, Math.min(0.45, want - prev));
        out.push([want, y]);
        prev = want;
      }
      // 終わりは元の x にもどる
      if (Math.abs(prev - bx) > 0.45) out.push([bx + (prev - bx) * 0.5, by - 0.25]);
    }
    out.push(pts[i]);
  }
  return out;
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

// ---- 駒と、作業中の駒のふきだし ----
export const PAWN_H = 3.3; // 駒の高さ（目）
export const SAY_PX = 13; // ふきだしの字（いま戦うテスト）
export const SAY_AGENT_PX = 10.5; // ふきだしの字（出撃中のエージェント）
const SAY_MAX_W = 12; // ふきだしの幅の限り（目）

/** 作業中の駒のふきだしの中身: いま戦うテスト（技術の言葉）と、出撃中ならエージェント */
export function sayOf(view, c) {
  const n = c.at && view?.nodes ? own(view.nodes, c.at) : null;
  let fight = '';
  if (c.status === 'working' && n?.type === 'task' && n.check?.kind === 'cmd') {
    const cases = Array.isArray(n.cases) ? n.cases : [];
    if (!cases.length) fight = '？ まだ走らせていない';
    else if (c.square != null && c.square < cases.length) fight = `${cases[c.square].ok === false ? '✖' : '⚔'} ${cases[c.square].name}`;
    else fight = '✔ 全部倒した → check';
  } else if (c.status === 'working' && n?.check?.kind === 'stamp') fight = '㊞ ハンコ待ち';
  const agent = c.sortie ? `⏳ ${c.sortie.agent}${c.sortie.model ? ' ' + c.sortie.model : ''}` : '';
  return { fight, agent };
}

/** 駒の立つ所（ページの目）。同じ所に何人もいれば、横に少しずらす */
export function pawnSpots(view, lay) {
  const out = Object.create(null);
  const seen = new Map();
  for (const c of view.characters || []) {
    const s = stopOf(view, lay, c);
    if (!s) continue;
    const key = `${s.node}:${s.square}:${s.page}:${s.x}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    const shift = s.square == null ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.6 : 0;
    out[c.id] = { page: s.page, x: s.x + shift, y: s.y, stop: s };
  }
  return out;
}

const hitArea = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * 作業中の駒のふきだしの置き場所（目）。字は2行まで折り返す（切らない）。駒の右上・左上・右下・左下と、上へずらした所から、
 * 札・城・名札・余白のマス・ほかの駒・ほかのふきだしに重ならない所を選ぶ（モンスターのマスと道は、なるべく避ける）
 */
function sayBoxes(view, lay) {
  const out = Object.create(null);
  const placed = [];
  const chars = (view.characters || []).filter((c) => lay.spots[c.id]);
  // ページごとの、重ねてはいけないもの・なるべく避けるもの
  const hardOf = new Map();
  const softOf = new Map();
  const solids = (p) => {
    if (hardOf.has(p)) return [hardOf.get(p), softOf.get(p)];
    const hard = [];
    const soft = [];
    for (const id of lay.pages[p].units) {
      const pl = lay.place[id];
      const castle = pl.kind === 'gate' || pl.kind === 'goal';
      if (pl.page === p) hard.push({ x: pl.x, y: pl.y - (castle ? 2 : 0), w: pl.w, h: pl.h + (castle ? 2 : 0) });
      if (pl.squares) for (const sq of pl.squares) if (sq.page === p) soft.push({ x: sq.x, y: sq.y, w: SQ, h: SQ });
    }
    for (const mg of lay.margins) {
      if (mg.page !== p) continue;
      hard.push({ x: mg.x, y: mg.y, w: SQ, h: SQ });
      // 起きた余白の吹き出しのために空けた場所（その道の帯の、マスの下）
      if (mg.room) {
        const g = lay.pages[p].lanes[mg.road];
        hard.push({ x: g.x, y: mg.y + SQ, w: g.w, h: mg.room });
      }
    }
    if (p === 0) hard.push({ x: 0, y: 0, w: PAGE.w, h: P1_TOP - 1 }); // 題名・ふりだし・名札
    else hard.push({ x: 0, y: 0, w: PAGE.w, h: PN_TOP - 1 }); // 道の上の名札
    for (const c of chars) {
      const sp = lay.spots[c.id];
      if (sp.page === p) hard.push({ x: sp.x - 1.65, y: sp.y - PAWN_H + 0.25, w: 3.3, h: PAWN_H - 0.1, pawn: c.id });
    }
    hardOf.set(p, hard);
    softOf.set(p, soft);
    return [hard, soft];
  };
  for (const c of chars) {
    const { fight, agent } = sayOf(view, c);
    if (!fight && !agent) continue;
    const sp = lay.spots[c.id];
    const lines = fight ? wrapJa(fight, (SAY_MAX_W * U - 16) / SAY_PX, 2) : [];
    const wpx = Math.max(...lines.map((l) => cw(l) * SAY_PX), agent ? cw(agent) * SAY_AGENT_PX : 0) + 16;
    const hpx = lines.length * 1.1 * U + (agent ? 0.95 * U : 0) + 6;
    const w = wpx / U;
    const h = hpx / U;
    const [hard, soft] = solids(sp.page);
    const others = placed.filter((b) => b.page === sp.page);
    let best = null;
    const cands = [];
    for (const lift of [0, 1, 2]) {
      const above = sp.y - PAWN_H - 0.25 - h - lift;
      cands.push({ side: 't', x: sp.x - 0.6, y: above, lift, pref: lift * 0.6 });
      cands.push({ side: 't', x: sp.x + 0.6 - w, y: above, lift, pref: 0.3 + lift * 0.6 });
    }
    for (const drop of [0, 1]) {
      cands.push({ side: 'b', x: sp.x - 0.6, y: sp.y + 0.6 + drop, lift: drop, pref: 1 + drop * 0.6 });
      cands.push({ side: 'b', x: sp.x + 0.6 - w, y: sp.y + 0.6 + drop, lift: drop, pref: 1.3 + drop * 0.6 });
    }
    // 駒の横（しっぽは横向き）
    for (const dy of [0, -1, 1]) {
      const y = sp.y - PAWN_H + 0.4 + dy;
      cands.push({ side: 'r', x: sp.x + 2, y, lift: 0, pref: 0.8 + Math.abs(dy) * 0.4 });
      cands.push({ side: 'l', x: sp.x - 2 - w, y, lift: 0, pref: 1.1 + Math.abs(dy) * 0.4 });
    }
    for (const cd of cands) {
      // 当たりは、しっぽ（駒のほうへ 7px + 持ち上げたぶん）も含めた四角で見る
      const tail = 7 / U + cd.lift;
      const r =
        cd.side === 't' ? { x: cd.x, y: cd.y, w, h: h + tail }
        : cd.side === 'b' ? { x: cd.x, y: cd.y - tail, w, h: h + tail }
        : cd.side === 'l' ? { x: cd.x, y: cd.y, w: w + 7 / U, h }
        : { x: cd.x - 7 / U, y: cd.y, w: w + 7 / U, h };
      let score = cd.pref;
      if (r.x < 0.3 || r.x + r.w > PAGE.w - 0.3 || r.y < 0.2 || r.y + r.h > PAGE.h - 0.4) score += 1000;
      for (const b of [...hard.filter((b) => b.pawn !== c.id), ...others.map((o) => o.hit)]) {
        const a = hitArea(r, b);
        if (a > 0.0001) score += 1000 + a * 10; // 札・名札・余白・ほかの駒とふきだしには重ねない
      }
      for (const b of soft) score += hitArea(r, b) * 0.35;
      if (!best || score < best.score) best = { ...cd, score, hit: r };
    }
    const box = { page: sp.page, x: best.x, y: best.y, w, h, side: best.side, lift: best.lift, lines, agent, hit: best.hit };
    placed.push(box);
    out[c.id] = box;
  }
  return out;
}

// ---- 余白の吹き出し（会話・町の人の話・ニュースの切り抜き）。札・マス・道を避けて、空いた方眼に置く ----
export const BUBBLE_PX = 9.5; // 吹き出しの字の大きさ
export const BUBBLE_LINE = 11.5; // 吹き出しの行の高さ（px）

/** 話している人の名前（キャラクターID ならその名前、NPC ならその名前のまま、null なら無し） */
export function whoName(view, who) {
  if (who == null || who === '') return '';
  const c = (view?.characters || []).find((x) => x.id === who);
  return c ? String(c.name ?? who) : String(who);
}

/** 吹き出しの幅（目）に入る出典の字。両方入らなければ seq だけ（無ければ commit だけ）。字が吹き出しからはみ出さない */
export function fitSource(m, w) {
  const full = marginSource(m);
  if (!full || cw(full) * 7.5 + 14 <= w * U - 4) return full;
  const one = Number.isInteger(m.seq) ? `seq ${m.seq}` : full.split(' · ').pop();
  return cw(one) * 7.5 + 14 <= w * U - 4 ? one : '';
}

/** 号外の見出しを短く（「号外: <名前> が <マス>「<題>」を抜けた（テスト p/t）」→「号外: <マス> を抜けた（テスト p/t）」）。名前と題は道の色とそばの札でわかる */
function shortExtra(text) {
  const m = String(text).match(/^号外: .+? が (\S+?)「.*」を(抜けた|突破した)(（テスト \d+\/\d+）)?$/);
  return m ? `号外: ${m[1]} を${m[2]}${m[3] ?? ''}` : text;
}

/** 出典の目印（seq と commit）。無ければ空文字 */
export function marginSource(m) {
  const parts = [];
  if (Number.isInteger(m.seq)) parts.push(`seq ${m.seq}`);
  if (typeof m.commit === 'string' && /^[0-9a-f]{7,40}$/i.test(m.commit)) parts.push(`commit ${m.commit.slice(0, 7)}`);
  return parts.join(' · ');
}

/**
 * 吹き出しの行（幅 w 目）。盤面は込み合うので短く: 会話は1人1行（「名前「せりふ」」）、町の人は2行、ニュースは見出しと本文1行ずつ。
 * 入りきらない所は … で終える（全文は余白のマスを押すと、詳細に出る）
 */
export function bubbleRows(view, m, w, perSpeaker = 1) {
  const max = Math.max(4, (w * U - 12) / BUBBLE_PX);
  const rows = [];
  if (m.kind === 'news') {
    // 瓦版の切り抜き: 題（いつも「瓦版」）は絵でわかるので書かず、中身（号外の見出しと、分野の話題）を。細ければ見出しだけを2行で
    const said = m.lines.filter((l) => l.text).map((l) => l.text);
    const lines = w <= 8 || said.length < 2 ? 2 : 1;
    let head = said[0] ?? m.title ?? '';
    // 入りきらない号外の見出しは、字を切らずに短い形にする（それでも入らなければ、テストの数はそばの札にあるので外す）
    if (wrapJa(head, max, lines).at(-1)?.endsWith('…')) head = shortExtra(head);
    if (wrapJa(head, max, lines).at(-1)?.endsWith('…')) head = head.replace(/（テスト \d+\/\d+）$/, '');
    for (const t of wrapJa(head, max, lines)) rows.push({ text: t, head: true });
    if (said[1] && w > 8) for (const t of wrapJa(said[1], max, Math.max(1, perSpeaker))) rows.push({ text: t });
    return rows;
  }
  const said = m.lines.filter((l) => l.text).slice(0, 2);
  // 細い吹き出しの会話は、せりふを切って並べるより「だれとだれが・何の話か」（名前と題）のほうが読める
  if (m.kind === 'talk' && w <= 8 && said.length > 1) {
    const names = [...new Set(said.map((l) => l.who ?? null))].map((who) => ({ name: whoName(view, who), speaker: who })).filter((n) => n.name);
    rows.push({ text: names.map((n) => n.name).join('・'), names });
    for (const t of wrapJa(m.title || said[0].text, max, 1)) rows.push({ text: t });
    return rows;
  }
  for (const ln of said) {
    const name = whoName(view, ln.who);
    wrapJa(`${name}「${ln.text}」`, max, said.length > 1 ? perSpeaker : Math.max(2, perSpeaker)).forEach((t, k) => rows.push({ text: t, who: k === 0 ? name : '', speaker: ln.who ?? null }));
  }
  return rows;
}

function bubbles(view, lay, p) {
  const list = lay.margins.filter((m) => m.page === p && marginHappened(m));
  if (!list.length) return [];
  const W = PAGE.w;
  const Hh = PAGE.h;
  const mk = () => Array.from({ length: Hh }, () => new Uint8Array(W));
  const hard = mk(); // 札・マス・余白・駒の頭・題名（重ねない）
  const soft = mk(); // ほかの道の線（空きが無いときだけ、またいでよい）
  const mark = (g, x, y, w, h, pad = 0) => {
    for (let yy = Math.max(0, Math.floor(y - pad)); yy < Math.min(Hh, Math.ceil(y + h + pad)); yy++)
      for (let xx = Math.max(0, Math.floor(x - pad)); xx < Math.min(W, Math.ceil(x + w + pad)); xx++) g[yy][xx] = 1;
  };
  const top = p === 0 ? P1_TOP - 1 : PN_TOP - 1;
  if (p === 0) mark(hard, 0, 0, W, P1_TOP);
  for (const id of lay.pages[p].units) {
    const pl = lay.place[id];
    const castle = pl.kind === 'gate' || pl.kind === 'goal';
    if (pl.page === p) mark(hard, pl.x, pl.y - (castle ? 2 : 0), pl.w, pl.h + (castle ? 2 : 0));
    if (pl.squares) for (const sq of pl.squares) if (sq.page === p) mark(hard, sq.x, sq.y, SQ, SQ);
  }
  for (const mg of lay.margins) if (mg.page === p) mark(hard, mg.x, mg.y, SQ, SQ);
  // 駒が立つ所（どのマスでも）と、いま立っている駒の体とふきだし（札・吹き出し・カードが重ならない）
  for (const list of Object.values(lay.stops)) for (const st of list) if (st.page === p) mark(hard, st.x - 1, st.y - 3, 2, 3);
  for (const sp of Object.values(lay.spots || {})) if (sp.page === p) mark(hard, sp.x - 1.65, sp.y - PAWN_H, 3.3, PAWN_H + 0.4);
  for (const b of Object.values(lay.say || {})) if (b.page === p) mark(hard, b.hit.x, b.hit.y, b.hit.w, b.hit.h);
  for (const rd of Object.values(lay.roads))
    for (const piece of rd.pieces) {
      if (piece.page !== p) continue;
      for (let i = 0; i + 1 < piece.pts.length; i++) {
        const [ax, ay] = piece.pts[i];
        const [bx, by] = piece.pts[i + 1];
        mark(soft, Math.min(ax, bx) - 0.6, Math.min(ay, by) - 0.4, Math.abs(bx - ax) + 1.2, Math.abs(by - ay) + 0.8, 0);
      }
    }
  const free = (g, x, y, w, h) => {
    if (x < X0 || y < top || x + w > X1 || y + h > BOTTOM + 1) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (g[yy][xx]) return false;
    return true;
  };
  // 吹き出しと余白のマスを結ぶ線が、札・マス・駒をまたがない（まっすぐ結んで、通る方眼を調べる）
  const clearPath = (m, x, y, w, h) => {
    const ax = m.x + 1;
    const ay = m.y + 1;
    const bx = Math.max(x, Math.min(x + w, ax));
    const by = Math.max(y, Math.min(y + h, ay));
    const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
    for (let k = 1; k < n; k++) {
      const px = Math.floor(ax + ((bx - ax) * k) / n);
      const py = Math.floor(ay + ((by - ay) * k) / n);
      if (px >= m.x && px < m.x + SQ && py >= m.y && py < m.y + SQ) continue;
      if (px >= x && px < x + w && py >= y && py < y + h) continue;
      if (hard[py]?.[px]) return false;
    }
    return true;
  };
  // ほかの余白のマスのために空けた場所（その道の帯の、マスの下 MARGIN_ROOM 目）。自分の場所は使い、人の場所はなるべく避ける
  const roomOf = (m) => {
    const g = lay.pages[p].lanes[m.road];
    return { x: g.x, y: m.y + SQ, w: g.w, h: m.room };
  };
  const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  const rooms = lay.margins.filter((mg) => mg.page === p).map((mg) => ({ id: mg.id, ...roomOf(mg) }));
  const out = [];
  for (const m of list) {
    let found = null;
    // 大きいほうから試す（字を切らずに済む大きさ）。余白のマスから 4 目以内に入らなければ、吹き出しは出さない
    // 大きいほうから。同じ大きさなら、道の線をまたがない所 → またぐ所。どの大きさも入らなければ、ほかの余白の場所に重なってもよい
    // 字を切らずに済む大きさを先に（入る空きがあれば全文を見せる）。どれも切れるなら、大きいほうから
    const sizes = [[14, 3], [12, 3], [14, 2], [12, 2], [10, 2], [12, 1], [10, 1], [8, 1], [7, 1], [6, 1], [5, 1]];
    const cut = ([w, per]) => bubbleRows(view, m, w, per).some((r) => r.text.endsWith('…'));
    const ordered = [...sizes.filter((z) => !cut(z)), ...sizes.filter((z) => cut(z))];
    const tries = [...ordered.flatMap(([w, per]) => [[w, per, true, false], [w, per, false, false]]), ...ordered.map(([w, per]) => [w, per, false, true])];
    for (const [w, per, strict, share] of tries) {
      const rows = bubbleRows(view, m, w, per);
      const src = fitSource(m, w);
      const h = Math.max(2, Math.ceil((7 + rows.length * BUBBLE_LINE + (src ? 10 : 0) + 4) / U));
      let best = null;
      for (let y = m.y - h - 6; y <= m.y + SQ + 6; y++)
        for (let x = m.x - w - 6; x <= m.x + SQ + 6; x++) {
          const dx = Math.max(0, x - (m.x + SQ), m.x - (x + w));
          const dy = Math.max(0, y - (m.y + SQ), m.y - (y + h));
          if (dx + dy > 6 || (x < m.x + SQ && x + w > m.x && y < m.y + SQ && y + h > m.y)) continue; // マスに重ねない（接するのはよい）
          if (!free(hard, x, y, w, h) || (strict && !free(soft, x, y, w, h)) || !clearPath(m, x, y, w, h)) continue;
          const r = { x, y, w, h };
          if (!share && rooms.some((room) => room.id !== m.id && overlap(r, room) > 0)) continue;
          let score = dx + dy * 1.15 + (x + w <= m.x ? 0.3 : 0) + Math.abs(x + w / 2 - (m.x + 1)) * 0.06;
          for (const room of rooms) score += overlap(r, room) * (room.id === m.id ? -0.08 : 0.5);
          if (!best || score < best.score) best = { x, y, w, h, rows, src, score };
        }
      if (best) {
        found = best;
        break;
      }
    }
    if (!found) {
      // どこにも入らなければ、自分の道に空けた場所に（起きた余白には、かならず吹き出しがある）
      const g = lay.pages[p].lanes[m.road];
      const w = Math.max(SQ, g.w);
      const rows = bubbleRows(view, m, w, 1).slice(0, 2);
      found = { x: g.x, y: m.y + SQ, w, h: Math.max(2, m.room - 1), rows, src: '' };
    }
    mark(hard, found.x, found.y, found.w, found.h, 0);
    mark(soft, found.x, found.y, found.w, found.h, 0);
    out.push({ margin: m.id, kind: m.kind, x: found.x, y: found.y, w: found.w, h: found.h, rows: found.rows, src: found.src, ax: m.x + 1, ay: m.y + 1 });
  }
  return out;
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
  // 余白のマスと吹き出し
  for (const mg of lay.margins || []) if (mg.page === p) mark(mg.x, mg.y, SQ, SQ, 0.5);
  for (const b of page.bubbles || []) mark(b.x, b.y, b.w, b.h, 0.5);
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
