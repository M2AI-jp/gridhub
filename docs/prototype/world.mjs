// 試作2: キャラクターごとの道を、縦の5mm方眼ノートの何ページかに割り付ける。座標はすべて「目」の整数。
import { rng } from '/web/board/sketch.js';

export const PAGE = { w: 36, h: 51 };
export const GRID = { x: 2, y: 3, w: 33, h: 47 };
export const X0 = 2;
export const X1 = 35; // 道を置ける幅 33目（方眼の幅いっぱい。余りは地形のすきまに回す）
export const P1_ROAD = 11; // 1ページ目: 題名・ふりだし・名札の下から道が始まる
export const PN_ROAD = 5; // 2ページ目から: 名札の下から道が続く
export const BOTTOM = 46; // 駅の下端の限り（道は 48 まで続いて、次のページへ）
export const SQ = 2;
const H = { task: 4, camp: 4, gate: 4 };

/** 道の並べ方: ゲートのメンバーがなるべく隣り合う順（今の盤面と同じ考え方） */
export function orderLanes(characters, nodes) {
  const ids = characters.map((c) => c.id);
  const gates = Object.values(nodes).filter((n) => n.type === 'gate' && n.members && n.members.length < ids.length).map((n) => n.members);
  if (ids.length > 8 || gates.length === 0) return ids;
  const score = (order) => {
    const pos = new Map(order.map((id, i) => [id, i]));
    let s = 0;
    for (const m of gates) {
      const idx = m.map((id) => pos.get(id));
      s += (Math.max(...idx) - Math.min(...idx) + 1 - m.length) * 100 + (Math.max(...idx) - Math.min(...idx));
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

const hash01 = (s) => rng(s)();

/** 駅と駅のあいだの縦の長さ（小さいマス2〜3段） */
const gapOf = (seed) => (hash01(seed) < 0.45 ? 6 : 4);

export function layoutWorld(view) {
  const chars = view.characters;
  const nodes = view.nodes;
  const quest = view.quest?.id || '';
  const lanes = orderLanes(chars, nodes);
  const laneOf = new Map(lanes.map((id, i) => [id, i]));
  const membersOf = (id) => {
    const n = nodes[id];
    return (n.members?.length ? n.members : [n.owner]).filter((m) => laneOf.has(m));
  };
  // 1. 早く置ける順（ASAP の y）で並べる
  const preds = new Map(Object.keys(nodes).map((id) => [id, []]));
  for (const c of chars) for (let i = 1; i < c.path.length; i++) preds.get(c.path[i])?.push(c.path[i - 1]);
  const vy = new Map();
  const vyOf = (id, seen = new Set()) => {
    if (vy.has(id)) return vy.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    let y = 0;
    for (const p of preds.get(id)) y = Math.max(y, vyOf(p, seen) + H[nodes[p].type] + 4);
    vy.set(id, y);
    return y;
  };
  const order = Object.keys(nodes).sort((a, b) => vyOf(a) - vyOf(b) || Math.min(...membersOf(a).map((m) => laneOf.get(m))) - Math.min(...membersOf(b).map((m) => laneOf.get(m))));

  // 2. ページに割り付ける（駅は2ページにまたがらない）
  const pages = [{ top: P1_ROAD, nodes: [] }];
  const cursor = new Map(lanes.map((id) => [id, P1_ROAD]));
  const place = Object.create(null);
  for (const id of order) {
    const n = nodes[id];
    const ms = membersOf(id);
    const h = H[n.type];
    const gap = gapOf(`${quest}:gap:${id}`);
    let y = Math.max(...ms.map((m) => cursor.get(m) + gap));
    if (y + h > BOTTOM) {
      pages.push({ top: PN_ROAD, nodes: [] });
      for (const l of lanes) cursor.set(l, PN_ROAD);
      y = Math.max(...ms.map((m) => cursor.get(m) + gap));
    }
    const p = pages.length - 1;
    place[id] = { id, page: p, y, h, type: n.type, members: ms };
    pages[p].nodes.push(id);
    for (const m of ms) cursor.set(m, y + h);
  }

  // 3. ページごとに、道の幅を決める（そのページで駅を持つキャラは広く、通るだけのキャラは細く）
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    const active = new Set();
    for (const id of page.nodes) {
      if (place[id].type !== 'gate') active.add(place[id].members[0]);
      else if (view.quest?.goal !== id) for (const m of place[id].members) active.add(m); // 結合テストの帯に字が入る幅
    }
    const thinW = 2;
    const nThin = lanes.length - active.size;
    let room = X1 - X0 - nThin * thinW;
    const wide = active.size ? Math.max(4, Math.floor(room / active.size)) : 0;
    if (active.size && wide * active.size > room) room = wide * active.size; // はみ出すときは、すきまを0に
    let extra = room - wide * active.size;
    const geo = Object.create(null);
    let x = X0;
    // 余りは、細い道のあいだのすきま（地形の場所）に回す
    const spare = Math.max(0, extra);
    const slackAt = new Map();
    if (lanes.length > 1 && spare > 0) {
      const r = rng(`${quest}:slack:${p}`);
      for (let k = 0; k < spare; k++) {
        const i = Math.floor(r() * (lanes.length + 1));
        slackAt.set(i, (slackAt.get(i) || 0) + 1);
      }
    }
    lanes.forEach((id, i) => {
      x += slackAt.get(i) || 0;
      const w = active.has(id) ? wide : thinW;
      // 道のマスの列（2目ごと）の偶奇はレーンの左端にそろえる
      geo[id] = { x, w, active: active.has(id), road: x + Math.max(0, Math.floor((w - SQ) / 2)) };
      x += w;
    });
    page.lanes = geo;
    page.stationW = Math.max(4, Math.min(6, wide - (wide >= 7 ? 1 : 0)));
    if (page.stationW % 2) page.stationW--;
  }

  // 4. 駅の x（レーンの中で少し左右にずらす。道が曲がる）
  for (const id of Object.keys(place)) {
    const pl = place[id];
    const page = pages[pl.page];
    if (pl.type === 'gate') {
      const xs = pl.members.map((m) => page.lanes[m]);
      pl.x = Math.min(...xs.map((g) => g.x));
      pl.w = Math.max(...xs.map((g) => g.x + g.w)) - pl.x;
      pl.doors = Object.fromEntries(pl.members.map((m) => [m, page.lanes[m].road]));
      if (view.quest?.goal === id) {
        pl.x = X0;
        pl.w = X1 - X0;
      }
      continue;
    }
    const g = page.lanes[pl.members[0]];
    const sw = pl.type === 'camp' ? 4 : page.stationW;
    const slots = [];
    for (let sx = g.x; sx + sw <= g.x + g.w; sx++) if ((sx + sw / 2 - 1 - g.road) % 2 === 0) slots.push(sx);
    if (!slots.length) slots.push(g.x);
    pl.x = slots[Math.floor(hash01(`${quest}:sx:${id}`) * slots.length)];
    pl.w = sw;
    pl.col = pl.x + sw / 2 - 1; // 駅の真下・真上のマスの x
  }

  // 5. 道（キャラごと・ページごと）: 駅の出口から次の駅の入口まで、小さいマスで蛇行する
  const roads = []; // {char, page, squares:[{x,y,ev,no}], from, to}
  for (const c of chars) {
    if (!laneOf.has(c.id)) continue;
    const pts = [{ kind: 'start', page: 0, y: P1_ROAD, col: null }];
    for (const id of c.path) if (place[id]) pts.push({ kind: 'node', id, ...place[id] });
    let sqNo = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      for (let p = a.page; p <= b.page; p++) {
        const page = pages[p];
        const g = page.lanes[c.id];
        const lo = g.x;
        const hi = g.x + g.w - SQ;
        const colOf = (pt) => {
          if (pt.kind === 'start') return g.road;
          if (pt.type === 'gate') return pt.doors[c.id];
          return pt.col;
        };
        const y0 = p === a.page ? (a.kind === 'start' ? a.y : a.y + a.h) : page.top;
        const y1 = p === b.page ? b.y : BOTTOM + 2;
        const c0 = p === a.page ? colOf(a) : g.road;
        const c1 = p === b.page ? colOf(b) : g.road;
        const rows = Math.max(1, Math.floor((y1 - y0) / SQ));
        const r = rng(`${quest}:road:${c.id}:${a.id || 'start'}:${p}`);
        const squares = [];
        let cur = c0;
        for (let i = 0; i < rows; i++) {
          const yy = y0 + i * SQ;
          let target;
          if (i === rows - 1) target = c1;
          else if (hi - lo >= 2 && r() < 0.55) {
            const opts = [];
            for (let xx = lo + ((cur - lo) % 2); xx <= hi; xx += 2) opts.push(xx);
            target = opts[Math.floor(r() * opts.length)];
          } else target = cur;
          const step = target >= cur ? 2 : -2;
          for (let xx = cur; ; xx += step) {
            squares.push({ x: xx, y: yy, no: sqNo, ev: evKind(`${quest}:${c.id}:sq:${sqNo}`) });
            sqNo++;
            if (xx === target || (step > 0 ? xx + step > target : xx + step < target)) break;
          }
          cur = target;
        }
        roads.push({ char: c.id, page: p, squares, from: a.id || 'start', to: b.id, cont: { top: p !== a.page, bottom: p !== b.page } });
      }
    }
  }
  const lay = { pages, place, roads, lanes, order };
  for (const p of pages.keys()) pages[p].terrain = terrain(view, lay, p);
  return lay;
}

function evKind(seed) {
  const r = hash01(seed);
  if (r < 0.1) return 'plus2';
  if (r < 0.19) return 'omikuji';
  if (r < 0.25) return 'rest';
  if (r < 0.28) return 'back3';
  if (r < 0.32) return 'treasure';
  return null;
}

/** 空いている方眼に、意味のない地形（山・森・湖・村・草）を置く */
function terrain(view, lay, p) {
  const page = lay.pages[p];
  const quest = view.quest?.id || '';
  const W = PAGE.w;
  const Hh = PAGE.h;
  const used = Array.from({ length: Hh }, () => new Uint8Array(W));
  const mark = (x, y, w, h, pad = 0) => {
    for (let yy = Math.max(0, y - pad); yy < Math.min(Hh, y + h + pad); yy++) for (let xx = Math.max(0, x - pad); xx < Math.min(W, x + w + pad); xx++) used[yy][xx] = 1;
  };
  // 使えるのは方眼の中、中身の範囲だけ
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (x < X0 || x >= X1 + 1 || y < page.top - 1 || y >= BOTTOM + 1) used[y][x] = 1;
  for (const id of page.nodes) {
    const pl = lay.place[id];
    mark(pl.x, pl.y, pl.w, pl.h, 1);
  }
  for (const rd of lay.roads) if (rd.page === p) for (const s of rd.squares) mark(s.x, s.y, SQ, SQ, 0);
  const free = (x, y, w, h) => {
    if (x < 0 || y < 0 || x + w > W || y + h > Hh) return false;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (used[yy][xx]) return false;
    return true;
  };
  const r = rng(`${quest}:terrain:${p}`);
  const out = [];
  const kinds = [
    ['sea', 12, 5, 1],
    ['lake', 6, 4, 2],
    ['mountains', 5, 3, 4],
    ['town', 4, 3, 3],
    ['mountain', 3, 3, 6],
    ['forest', 3, 2, 8],
    ['house', 2, 2, 6],
    ['tree', 1, 1, 40],
    ['grass', 1, 1, 30],
  ];
  for (const [kind, w, h, tries] of kinds) {
    let placed = 0;
    for (let t = 0; t < 400 && placed < tries; t++) {
      const x = X0 + Math.floor(r() * (X1 - X0));
      const y = page.top + Math.floor(r() * (BOTTOM - page.top));
      if (!free(x, y, w, h)) continue;
      if ((kind === 'tree' || kind === 'grass') && r() < 0.35) continue;
      out.push({ kind, x, y, w, h, seed: `${quest}:${p}:${kind}:${x}:${y}` });
      mark(x, y, w, h, kind === 'tree' || kind === 'grass' ? 0 : 1);
      placed++;
    }
  }
  return out;
}
