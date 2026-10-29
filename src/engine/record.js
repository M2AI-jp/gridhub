// 人に見せる「いまの記録」の目印（CONTRACTS §52.4）: 冒険の書の seq と、その記録が見ていた Git のコミット。
// 改ざんを見つけるのはハッシュの鎖（verify）、過去に戻るのは load <seq|commit>。
// commit は冒険の書だけから決まる head.commit（§52.3）。ここでは Git を呼ばない。

/** 冒険の書の時刻（ISO 8601 UTC）を、この機械のローカル時刻 `2026-10-30 12:34:56` にする（読めなければそのまま） */
export function localTime(ts) {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return String(ts ?? '');
  const two = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** `記録: seq 42 / Git: commit a1b2c3d`（head.commit が無ければ seq だけ） */
export function recordLine(head) {
  const commit = typeof head?.commit === 'string' ? head.commit.slice(0, 7) : null;
  return `記録: seq ${head?.seq ?? '-'}${commit ? ` / Git: commit ${commit}` : ''}`;
}
