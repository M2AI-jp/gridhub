// 進軍のレーンの様子（CONTRACTS §80.2・§80.3）。ビューと記録から導くだけ。盤面の担当
const own = (o, k) => (o && Object.hasOwn(o, k) ? o[k] : undefined);

/** ビューと記録から、レーンの様子を1つに決める（§80.3） */
export function laneStatus(c, view) {
  if (c.status === 'done') return 'done';
  if (c.status === 'waiting') return 'waiting';
  if (!c.sortie) {
    const log = Array.isArray(view.log) ? view.log : [];
    for (let i = log.length - 1; i >= 0; i--) {
      const e = log[i];
      if (e?.character !== c.id) continue;
      if (e.type === 'check_failed') return 'down';
      if (e.type === 'sortie' || e.type === 'stepped' || e.type === 'check_passed') break;
    }
  }
  const node = own(view.nodes, c.at);
  if (node?.type === 'camp') return 'camp';
  if (c.sortie) return 'working';
  if (c.kind === 'human' && node?.type === 'task' && (node.check?.kind !== 'stamp' || node.check.by === c.id)) return 'turn';
  return 'ready';
}

/** そのマスの、まだ通っていないテスト。敵1体がテスト1件（§80.2） */
export function foesOf(c, view, status) {
  if (status === 'done' || status === 'waiting' || status === 'camp') return [];
  const node = own(view.nodes, c.at);
  if (!node || node.state === 'cleared') return [];
  const cases = Array.isArray(node.cases) ? node.cases : [];
  if (!cases.length) return [{ key: `${node.id}:0`, name: node.title ?? node.id, strong: false }];
  return cases.map((k, i) => ({ key: `${node.id}:${i}`, name: k?.name ?? '', strong: !!k?.strong, ok: k?.ok === true })).filter((k) => !k.ok);
}

/**
 * レーンで押せる一手（§80.8）。本物の窓口を呼ぶものだけを出す。
 * sortie 出撃 / resortie 再出撃 / hand 手で進める / stamp ハンコ / battle ボス戦 / watch 戦況（出撃中）
 */
export function commandOf(c, view, status) {
  const node = own(view.nodes, c.at);
  if (status === 'waiting') {
    if (node?.type === 'gate' && node.state === 'ready' && node.members?.[0] === c.id) return { kind: 'battle', node: node.id };
    return null;
  }
  if (status === 'working') return { kind: 'watch', node: c.at };
  if (status === 'turn') {
    if (node?.check?.kind === 'stamp') return { kind: 'stamp', node: node.id, as: node.check.by };
    return { kind: 'hand', node: node?.id };
  }
  if (c.kind === 'human') {
    // 人が失敗したら、もう一度自分で。押せるものを無くさない
    if (status !== 'down') return null;
    if (node?.check?.kind === 'stamp' && node.check.by === c.id) return { kind: 'stamp', node: node.id, as: c.id };
    return { kind: 'hand', node: node?.id };
  }
  if (status === 'down') return { kind: 'resortie', node: c.at };
  if (status === 'ready' || status === 'camp') return { kind: 'sortie', node: c.at };
  return null;
}

/**
 * レーンの一手の横に並ぶ小さな手（§80.8）。どれも本物の窓口を呼ぶ。
 * hand 手で作業 / step テストを実行（POST /api/step。何度でも・罰なし）/ check 判定（POST /api/check。落ちると戻される）
 */
export function toolsOf(c, view, status, cmd) {
  const node = own(view.nodes, c.at);
  const runnable = node?.type === 'task' && node.check?.kind === 'cmd';
  if (cmd?.kind === 'sortie' || cmd?.kind === 'resortie') return runnable ? ['hand', 'step', 'check'] : ['hand'];
  if (cmd?.kind === 'hand' && runnable) return ['step', 'check'];
  return [];
}

/**
 * 下の帯で次に押すもの（§80.9）: レーンに押すものが無いときだけ1つ光らせる。
 * 送っていないセーブがあれば push、次に PR、最後に承認済みの PR のマージ
 */
export function nextBarAction({ laneNext, ahead, canOpen, prs }) {
  if (laneNext) return null;
  if (ahead) return 'push';
  if (canOpen) return 'open-pr';
  const ready = (Array.isArray(prs) ? prs : []).find((p) => canMerge(p) && p.review === 'APPROVED' && p.checks === 'pass');
  return ready ? `merge:${ready.number}` : null;
}

const NEXT_ORDER = ['battle', 'stamp', 'hand', 'resortie', 'sortie'];
/** いま一番先に押すレーン（なければ null）。迷わないよう、光らせるのは1つだけ（§80.9） */
export function nextCommand(lanes) {
  for (const kind of NEXT_ORDER) {
    const hit = lanes.find((l) => l.cmd?.kind === kind);
    if (hit) return hit.id;
  }
  return null;
}

/** 道のり: そのキャラクターの path の何番目にいて、門がどこか（§80.10） */
export function routeOf(c, view) {
  const path = Array.isArray(c.path) ? c.path : [];
  const pos = c.status === 'done' ? path.length : Math.max(0, c.pos ?? 0);
  return path.map((id, i) => {
    const n = own(view.nodes, id);
    return { id, gate: n?.type === 'gate', camp: n?.type === 'camp', done: i < pos, here: i === pos };
  });
}

/** いちばん近い門まで、あと何体か（そのキャラクターの道の上で。§80.10） */
export function foesToGate(c, view) {
  const path = Array.isArray(c.path) ? c.path : [];
  let left = 0;
  for (let i = Math.max(0, c.pos ?? 0); i < path.length; i++) {
    const n = own(view.nodes, path[i]);
    if (n?.type === 'gate') return { gate: n.id, left };
    const cases = Array.isArray(n?.cases) ? n.cases : [];
    left += cases.filter((k) => k?.ok !== true).length;
  }
  return null;
}

/** 門ごとに、到着しているメンバー。2人以上そろった門は1つの戦場にまとまる（§80.11） */
export function arenasOf(view) {
  const out = [];
  for (const n of Object.values(view.nodes ?? {})) {
    if (n?.type !== 'gate' || n.state === 'cleared') continue;
    const here = (view.characters ?? []).filter((c) => c.at === n.id && c.status === 'waiting').map((c) => c.id);
    if (here.length >= 2) out.push({ gate: n.id, members: here, ready: n.state === 'ready', all: n.members ?? [] });
  }
  return out;
}

/** レーンの並び: 同じ戦場の仲間を隣どうしにする。ほかは地図の順のまま（§80.11） */
export function laneOrder(ids, arenas) {
  const order = [];
  for (const id of ids) {
    if (order.includes(id)) continue;
    const a = arenas.find((x) => x.members.includes(id));
    if (a) {
      for (const m of ids) if (a.members.includes(m)) order.push(m);
    } else order.push(id);
  }
  return order;
}

/**
 * 前のビューから今のビューで、道の上をどう動いたか（§80.12）。
 * inn: 町を通り過ぎた（通ったマスの最後の町）/ back: 後ろへ戻された（戻った先のマス）/ null: どちらでもない
 */
export function travelOf(was, now, view) {
  if (!was || !Array.isArray(now.path)) return null;
  const a = was.pos ?? 0;
  const b = now.pos ?? 0;
  if (b < a) return { kind: 'back', node: now.path[b] ?? null };
  for (let i = b - 1; i >= a; i--) {
    const n = own(view.nodes, now.path[i]);
    if (n?.type === 'camp') return { kind: 'inn', node: n.id };
  }
  return null;
}

/** 連続 PASS（§80.17）: 判定と結合テストが、新しいほうから何回続けて通っているか */
export function streakOf(log) {
  const list = Array.isArray(log) ? log : [];
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    const type = list[i]?.type;
    if (type === 'check_passed' || type === 'gate_cleared') n++;
    else if (type === 'check_failed' || type === 'gate_failed') break;
  }
  return n;
}

// ---- PR の札（§80.16）----
const SHOW = 5;

/** 見せる順: 開いている PR が先、残りの枠に最近マージされたもの */
export function prsToShow(prs) {
  const list = Array.isArray(prs) ? prs : [];
  const open = list.filter((p) => p.state === 'OPEN');
  const done = list.filter((p) => p.state === 'MERGED');
  return [...open, ...done].slice(0, SHOW);
}

/** いまマージしてよい PR か。止める理由があるときはボタンを出さない */
export const canMerge = (p) => p.state === 'OPEN' && !p.draft && p.checks !== 'fail' && p.checks !== 'running' && p.review !== 'CHANGES_REQUESTED';

/** 前の一覧と比べて、盤面で見せる出来事にする（はじめて読んだときは何も出さない） */
export function prEvents(before, after) {
  if (!before) return [];
  const was = new Map(before.map((p) => [p.number, p]));
  const out = [];
  for (const p of after) {
    const old = was.get(p.number);
    if (!old) {
      if (p.state === 'OPEN') out.push({ kind: 'opened', pr: p });
      continue;
    }
    if (old.state !== 'MERGED' && p.state === 'MERGED') out.push({ kind: 'merged', pr: p });
    if (old.checks !== 'fail' && p.checks === 'fail') out.push({ kind: 'ci_failed', pr: p });
    if (old.checks !== 'pass' && p.checks === 'pass' && p.state === 'OPEN') out.push({ kind: 'ci_passed', pr: p });
    if (old.review !== 'APPROVED' && p.review === 'APPROVED') out.push({ kind: 'approved', pr: p });
    if (old.review !== 'CHANGES_REQUESTED' && p.review === 'CHANGES_REQUESTED') out.push({ kind: 'changes', pr: p });
    if (p.note && p.note.at !== old.note?.at && p.state === 'OPEN') out.push({ kind: 'comment', pr: p });
  }
  return out;
}

const CHAIN_WORD = { hero: '剣', warrior: '鉄', sage: '星', mage: '雷', priest: '光', scribe: '墨', herald: '風', villager: '土', cartographer: '標', merchant: '金', painter: '彩' };
const COUNT_WORD = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 連携の名前（メンバーの職業の字を順に並べる）。同じ顔ぶれなら同じ名前 */
export function chainNameOf(jobs) {
  const words = [...new Set(jobs.map((j) => (Object.hasOwn(CHAIN_WORD, j ?? '') ? CHAIN_WORD[j] : '')).filter(Boolean))].join('');
  return `連携「${words}${COUNT_WORD[Math.min(9, jobs.length)] ?? ''}連撃」`;
}

