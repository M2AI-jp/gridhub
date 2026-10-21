// メモ一覧の描画（純粋関数。document には触らない）

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// ISO 8601 を「2026-01-02 03:04」の形にする（読めなければそのまま）
function formatTime(iso) {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(iso ?? ''));
  return m ? `${m[1]} ${m[2]}` : String(iso ?? '');
}

function renderMemo(memo) {
  const title = memo.title ? memo.title : '(無題)';
  return (
    `<li class="memo" data-id="${escapeHtml(memo.id)}">` +
    `<h3 class="memo-title">${escapeHtml(title)}</h3>` +
    `<p class="memo-body">${escapeHtml(memo.body)}</p>` +
    `<time class="memo-time" datetime="${escapeHtml(memo.updatedAt)}">${escapeHtml(formatTime(memo.updatedAt))}</time>` +
    `<button type="button" class="memo-edit" data-action="edit">編集</button>` +
    `<button type="button" class="memo-delete" data-action="delete">削除</button>` +
    `</li>`
  );
}

export function renderMemoList(memos) {
  return (memos ?? []).map(renderMemo).join('');
}
