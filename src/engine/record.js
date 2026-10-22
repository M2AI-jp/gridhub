// 人に見せる「いまの記録」の目印（CONTRACTS §52.4）: 冒険の書の seq と、その記録が見ていた Git のコミット。
// 改ざんを見つけるのはハッシュの鎖（verify）、過去に戻るのは load <seq|commit>。
// commit は冒険の書だけから決まる head.commit（§52.3）。ここでは Git を呼ばない。

/** `記録: seq 42 / Git: commit a1b2c3d`（head.commit が無ければ seq だけ） */
export function recordLine(head) {
  const commit = typeof head?.commit === 'string' ? head.commit.slice(0, 7) : null;
  return `記録: seq ${head?.seq ?? '-'}${commit ? ` / Git: commit ${commit}` : ''}`;
}
