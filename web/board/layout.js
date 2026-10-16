// 地図（ビュー）から、5mm方眼の上のどこに何を描くかを決める。単位 U = 5mm = 1目。

export const U = 16;
export const CELL = 4 * U; // マスは 4×4 目（2cm角）
export const COL_W = 7 * U; // 1列 = マス + 道 3目
export const LANE_H = 9 * U; // 1本の道の帯
export const HEAD_W = 12 * U; // ふりだし（キャラクターの名札）
export const TOP = 7 * U; // ページ上の余白（題名を書く）
export const LEFT = 3 * U;
export const GATE_W = 5 * U;
export const CAMP = 3 * U;

/** 道の並べ方: ゲートのメンバーがなるべく隣り合い、ゲートの背が低くなる順 */
export function orderLanes(characters, nodes) {
  const ids = characters.map((c) => c.id);
  const gates = Object.values(nodes)
    .filter((n) => n.type === 'gate' && n.members && n.members.length < ids.length)
    .map((n) => n.members);
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
    order.forEach((id, i) => (s += Math.abs(i - ids.indexOf(id)) * 0.01)); // 地図の順もなるべく保つ
    return s;
  };
  let best = ids;
  let bestScore = score(ids);
  const permute = (arr, k) => {
    if (k === arr.length) {
      const sc = score(arr);
      if (sc < bestScore) {
        bestScore = sc;
        best = arr.slice();
      }
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

/** 位置を決める。戻り値: { lanes: {charId: {index, y}}, nodes: {id: {x, y, top, bottom, col}}, width, height } */
export function layout(view) {
  const chars = view.characters;
  const nodes = view.nodes;
  const order = orderLanes(chars, nodes);
  const laneIndex = new Map(order.map((id, i) => [id, i]));
  const laneY = (i) => TOP + i * LANE_H + 2 * U + CELL / 2;

  // 前→次 のグラフ
  const preds = new Map(Object.keys(nodes).map((id) => [id, new Set()]));
  for (const c of chars) for (let i = 1; i < c.path.length; i++) preds.get(c.path[i])?.add(c.path[i - 1]);

  // トポロジカル順
  const indeg = new Map([...preds].map(([id, p]) => [id, p.size]));
  const succ = new Map(Object.keys(nodes).map((id) => [id, []]));
  for (const [id, p] of preds) for (const q of p) succ.get(q)?.push(id);
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  const topo = [];
  while (queue.length) {
    const id = queue.shift();
    topo.push(id);
    for (const s of succ.get(id)) {
      indeg.set(s, indeg.get(s) - 1);
      if (indeg.get(s) === 0) queue.push(s);
    }
  }
  for (const id of Object.keys(nodes)) if (!topo.includes(id)) topo.push(id); // 閉路があっても描けるように

  // 縦の占有範囲（行の番号）
  const rows = (id) => {
    const n = nodes[id];
    const members = (n.members && n.members.length ? n.members : [n.owner]).filter((m) => laneIndex.has(m));
    const idx = members.map((m) => laneIndex.get(m));
    return idx.length ? [Math.min(...idx), Math.max(...idx)] : [0, 0];
  };

  const occupied = new Map(); // col -> [[lo, hi], …]
  const collides = (col, [lo, hi]) => (occupied.get(col) || []).some(([a, b]) => !(hi < a || lo > b));
  const pos = {};
  for (const id of topo) {
    let col = 0;
    for (const p of preds.get(id)) if (pos[p]) col = Math.max(col, pos[p].col + 1);
    const span = rows(id);
    while (collides(col, span)) col++;
    if (!occupied.has(col)) occupied.set(col, []);
    occupied.get(col).push(span);
    const n = nodes[id];
    const x = LEFT + HEAD_W + 2 * U + col * COL_W + CELL / 2;
    if (n.type === 'gate') {
      const top = laneY(span[0]) - CELL / 2 - U;
      const bottom = laneY(span[1]) + CELL / 2 + U;
      pos[id] = { col, x, y: (top + bottom) / 2, top, bottom, rows: span };
    } else {
      const y = laneY(span[0]);
      pos[id] = { col, x, y, top: y - CELL / 2, bottom: y + CELL / 2, rows: span };
    }
  }

  const cols = Math.max(0, ...Object.values(pos).map((p) => p.col)) + 1;
  const lanes = {};
  for (const c of chars) lanes[c.id] = { index: laneIndex.get(c.id), y: laneY(laneIndex.get(c.id)) };
  const width = LEFT + HEAD_W + 2 * U + cols * COL_W + 4 * U;
  const height = TOP + order.length * LANE_H + 3 * U;
  return { order, lanes, nodes: pos, width, height, cols };
}

/** キャラクターがいる場所の座標（task はマスの上、gate は自分の道の高さ、あがりは goal の中） */
export function pawnPoint(view, lay, c) {
  const lane = lay.lanes[c.id];
  const at = c.at ?? view.quest.goal;
  const p = lay.nodes[at];
  if (!p) return { x: LEFT + HEAD_W - U, y: lane.y };
  const n = view.nodes[at];
  if (n.type === 'gate' || c.status === 'done') return { x: p.x, y: lane.y };
  return { x: p.x, y: p.y };
}

/** 道に沿って from → to まで進むときの経由点（マスごとに跳ねるため） */
export function walkPoints(view, lay, c, fromPos, toPos) {
  const pts = [];
  const step = fromPos <= toPos ? 1 : -1;
  for (let i = fromPos; step > 0 ? i <= toPos : i >= toPos; i += step) {
    const id = c.path[Math.min(i, c.path.length - 1)];
    const p = lay.nodes[id];
    if (!p) continue;
    const n = view.nodes[id];
    pts.push(n.type === 'gate' ? { x: p.x, y: lay.lanes[c.id].y } : { x: p.x, y: p.y });
  }
  return pts;
}
