// 画面の状態と動き（CONTRACTS.md §4）。DOM には触らない。

const MESSAGES = {
  E_EMPTY: 'タイトルか本文を入力してください',
  E_TOO_LONG: '長すぎます。短くしてください',
  E_INVALID: '入力が正しくありません',
  E_NOT_FOUND: 'メモが見つかりません（すでに消されたかもしれません）',
};

function errorText(err) {
  if (err && MESSAGES[err.code]) return MESSAGES[err.code];
  return (err && err.message) || '失敗しました';
}

export function createController({ client, onChange }) {
  const state = { memos: [], query: '', editingId: null, error: null };
  let loadSeq = 0;

  const emit = () => {
    if (typeof onChange === 'function') onChange({ ...state, memos: state.memos });
  };

  // 現在の query で読み直す。後から始めた読み込みだけが state に反映される
  async function reload() {
    const mine = ++loadSeq;
    try {
      const memos = await client.list(state.query);
      if (mine !== loadSeq) return;
      state.memos = memos;
    } catch (err) {
      if (mine !== loadSeq) return;
      state.error = errorText(err);
    }
    emit();
  }

  return {
    get state() {
      return { ...state };
    },
    init: () => reload(),
    async save({ title = '', body = '' } = {}) {
      if (!String(title).trim() && !String(body).trim()) {
        state.error = MESSAGES.E_EMPTY;
        emit();
        return;
      }
      try {
        if (state.editingId) await client.update(state.editingId, { title, body });
        else await client.create({ title, body });
      } catch (err) {
        state.error = errorText(err);
        emit();
        return;
      }
      state.editingId = null;
      state.error = null;
      await reload();
    },
    async startEdit(id) {
      if (!state.memos.some((m) => m.id === id)) return;
      state.editingId = id;
      emit();
    },
    async cancelEdit() {
      state.editingId = null;
      emit();
    },
    async remove(id) {
      try {
        await client.remove(id);
      } catch (err) {
        state.error = errorText(err);
        emit();
        return;
      }
      if (state.editingId === id) state.editingId = null;
      state.error = null;
      await reload();
    },
    async search(q) {
      state.query = String(q ?? '');
      await reload();
    },
  };
}
