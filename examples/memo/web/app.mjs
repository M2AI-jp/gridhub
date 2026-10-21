// DOM とのつなぎ: api-client・controller・memo-view と index.html の id
import { createClient } from './api-client.mjs';
import { createController } from './controller.mjs';
import { renderMemoList } from './memo-view.mjs';

const form = document.getElementById('memo-form');
const titleInput = document.getElementById('memo-title');
const bodyInput = document.getElementById('memo-body');
const searchInput = document.getElementById('memo-search');
const list = document.getElementById('memo-list');
const empty = document.getElementById('memo-empty');
const errorBox = document.getElementById('memo-error');

let shownEditingId = null;

function render(state) {
  list.innerHTML = renderMemoList(state.memos);
  empty.hidden = state.memos.length > 0;
  errorBox.textContent = state.error ?? '';
  errorBox.hidden = !state.error;

  if (state.editingId !== shownEditingId) {
    shownEditingId = state.editingId;
    const memo = state.memos.find((m) => m.id === state.editingId);
    titleInput.value = memo ? memo.title : '';
    bodyInput.value = memo ? memo.body : '';
    if (memo) titleInput.focus();
  }
  if (!state.editingId && !state.error && form.dataset.submitted === '1') {
    titleInput.value = '';
    bodyInput.value = '';
  }
  form.dataset.submitted = '';
}

const controller = createController({ client: createClient(''), onChange: render });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  form.dataset.submitted = '1';
  await controller.save({ title: titleInput.value, body: bodyInput.value });
});

searchInput.addEventListener('input', () => controller.search(searchInput.value));

list.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || !list.contains(btn)) return;
  const li = btn.closest('[data-id]');
  if (!li) return;
  if (btn.dataset.action === 'edit') controller.startEdit(li.dataset.id);
  else if (btn.dataset.action === 'delete') controller.remove(li.dataset.id);
});

controller.init();
