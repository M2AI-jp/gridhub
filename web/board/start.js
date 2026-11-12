// はじめの画面（CONTRACTS §70）。盤面の担当。フォルダを選ぶ・最近のフォルダ・チュートリアルで遊ぶ。
// アプリ（GridHub.app）の中では、フォルダのダイアログを Mac の標準のものにまかせる（window.webkit.messageHandlers.gridhub）。
import { t, initWords, isDev, onWords, pair, said } from './words.js';
import { startMarch } from './start-march.js';

const $ = (sel) => document.querySelector(sel);
const bridge = window.webkit?.messageHandlers?.gridhub ?? null;
let busy = false;

function showError(text) {
  const box = $('#start-error');
  box.textContent = text || '';
  box.hidden = !text;
}

function setBusy(on, label) {
  busy = on;
  document.body.dataset.busy = on ? 'true' : 'false';
  for (const b of document.querySelectorAll('#start button')) b.disabled = on;
  if (on && label) showError('');
  $('#start').setAttribute('aria-busy', String(on));
  if (label) $('#start').dataset.doing = on ? label : '';
}

async function post(path, body) {
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: t('start.unreachable') };
  }
  const got = await r.json().catch(() => null);
  if (!r.ok || !got || got.ok === false) return { ok: false, error: got?.error || `HTTP ${r.status}` };
  return got;
}

/** 開いたら、その盤面（か入口）に移る */
async function go(path, body, label) {
  if (busy) return;
  setBusy(true, label);
  const j = await post(path, body);
  if (j.ok && typeof j.url === 'string') {
    // はじめの画面と盤面は窓口（origin）が別なので、選んだことばを URL で渡す（§79.33）
    const next = new URL(j.url, location.href);
    next.searchParams.set('words', isDev() ? 'dev' : 'game');
    location.href = next.href;
    return;
  }
  setBusy(false, label);
  showError(j.error || t('start.openfail'));
}

const openFolder = (dir) => go('api/app/open', { dir }, 'open');

let recentList = [];
function renderRecent(list) {
  recentList = list;
  const ul = $('#recent');
  ul.replaceChildren();
  for (const item of list) {
    const li = document.createElement('li');
    li.dataset.dir = item.dir;
    li.dataset.missing = String(item.missing === true);
    li.dataset.game = String(item.has_game === true);
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'open-recent';
    open.disabled = item.missing === true;
    const name = document.createElement('span');
    name.className = 'recent-name';
    name.textContent = item.title ? `${item.title}` : item.name;
    const sub = document.createElement('span');
    sub.className = 'recent-sub';
    sub.textContent = `${item.has_game ? t('start.hasgame') : t('start.nogame')}${item.missing ? t('start.missing') : ''}`;
    const dir = document.createElement('code');
    dir.className = 'recent-dir';
    dir.textContent = item.dir;
    open.append(name, sub, dir);
    const forget = document.createElement('button');
    forget.type = 'button';
    forget.className = 'forget';
    forget.textContent = t('start.forget');
    forget.title = t('start.forget.title');
    li.append(open, forget);
    ul.append(li);
  }
  $('#recent-empty').hidden = list.length > 0;
}

let envInfo = null;
function renderEnv(info) {
  envInfo = info;
  $('#env-node').textContent = `Node.js ${info.node}・GridHub ${info.version ?? ''}`.trim();
  const claude = $('#env-claude');
  claude.dataset.found = String(info.claude?.found === true);
  claude.replaceChildren();
  if (info.claude?.found) {
    claude.textContent = t('start.claude.found');
    return;
  }
  const link = document.createElement('a');
  link.href = 'https://claude.com/claude-code';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = 'https://claude.com/claude-code';
  claude.append(t('start.claude.none1'), link, t('start.claude.none2'));
}

// アプリ（Swift）が、選ばれたフォルダで呼ぶ（§70.2）
window.gridhubApp = {
  folderChosen(path) {
    if (typeof path === 'string' && path) openFolder(path);
  },
};

$('#choose-folder').addEventListener('click', () => {
  showError('');
  if (bridge) {
    bridge.postMessage({ type: 'chooseFolder' });
    return;
  }
  const form = $('#folder-form');
  form.hidden = false;
  $('#folder-path').focus();
});

$('#folder-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const dir = $('#folder-path').value.trim();
  if (!dir) {
    showError(t('start.nopath'));
    return;
  }
  openFolder(dir);
});

$('#tutorial').addEventListener('click', () => go('api/app/tutorial', {}, 'tutorial'));

$('#recent').addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-dir]');
  if (!li || busy) return;
  if (e.target.closest('button.forget')) {
    const j = await post('api/app/forget', { dir: li.dataset.dir });
    if (j.ok) renderRecent(j.recent ?? []);
    else showError(j.error);
    return;
  }
  if (e.target.closest('button.open-recent')) openFolder(li.dataset.dir);
});

/**
 * 次に押すボタン（§79.35）: はじめの画面でいちばん先に押すものを1つ。
 * つづきのフォルダがあれば開く。ぜんぶ終えていれば新しいフォルダ、何もなければチュートリアル。
 */
function nextAction(j) {
  const resume = recentList.find((item) => item.missing !== true && item.has_game === true);
  const quest = resume ? (j.quests ?? []).find((q) => q.dir === resume.dir) : null;
  if (!resume) {
    return { label: pair('チュートリアルで遊ぶ', 'チュートリアルを試す'), sub: pair('まずは5分。ボタンだけで、ひととおり遊べます', 'まずは5分。ボタンだけで、ひととおり試せます'), go: () => $('#tutorial').click() };
  }
  if (quest?.finished && !quest.bags) {
    return { label: pair('次の冒険をはじめる', '次のプロジェクトをはじめる'), sub: pair('フォルダを選んで、作りたいものを書く', 'フォルダを選んで、作りたいものを書く'), go: () => $('#choose-folder').click() };
  }
  const name = resume.title || resume.name;
  const { streak } = j;
  const why = quest?.bags ? `開くとシール袋 ${quest.bags} 個が待っています`
    : !streak.today && streak.current > 0 ? pair(`今日テストを1件倒せば、${streak.current + 1}日連続`, `今日テストを1件通せば、${streak.current + 1}日連続`)
      : pair('テストを倒すほど、駒が進みます', 'テストが通るほど、進みます');
  return { label: pair('つづきから', '続きを開く'), name, sub: why, go: () => openFolder(resume.dir) };
}

/** 勇者の手帳（§79.7）: 次に押すボタン・ランク・続いた日数・今日のお題。冒険をまたいだまとめ */
let heroJournal = null;
function renderHero(j) {
  const box = $('#start-hero');
  if (!j || j.ok !== true || j.hero !== 1) return;
  heroJournal = j;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const { rank, streak, daily, bags, album, achievements } = j;
  const action = nextAction(j);
  const cta = el('button', 'start-btn primary sh-cta');
  cta.type = 'button';
  cta.id = 'start-next';
  cta.append(el('b', '', action.label));
  if (action.name) cta.append(el('span', 'sh-cta-name', action.name));
  cta.append(el('small', '', action.sub));
  cta.addEventListener('click', action.go);
  const badge = el('div', 'sh-rank');
  badge.append(el('small', '', 'ランク'), el('b', '', rank.level));
  const who = el('div', 'sh-who');
  const bar = el('div', 'hc-xp');
  const fill = el('i');
  fill.style.width = `${Math.round((rank.into / rank.need) * 100)}%`;
  bar.append(fill);
  who.append(el('b', '', said(rank, 'title')), el('small', '', `${pair('経験値', 'XP')} ${rank.xp}・次のランクまで ${rank.next - rank.xp}`), bar);
  const fire = el('div', `sh-streak${streak.today ? ' lit' : ''}`);
  fire.append(el('b', '', streak.current), el('small', '', '日連続'));
  const top = el('div', 'sh-top');
  top.append(badge, who, fire);

  const missions = el('ul', 'sh-missions');
  for (const m of daily.missions) {
    const li = el('li', m.done ? 'done' : '');
    li.append(el('span', 'sh-check', m.done ? '✔' : ''), el('span', '', said(m, 'text')), el('em', '', `${m.now}/${m.goal}`));
    missions.append(li);
  }
  const foot = el('p', 'sh-foot');
  foot.append(el('small', '', `シール帳 ${album.owned}/${album.total}・${pair('称号', '実績')} ${achievements.filter((a) => a.done).length}/${achievements.length}${bags.count ? `・未開封のシール袋 ${bags.count}` : ''}`));
  const head = el('h2', 'sh-h', pair('今日のお題', '今日の目標'));
  head.append(el('small', '', daily.date));
  box.setAttribute('aria-label', pair('勇者の手帳', '手帳'));
  box.replaceChildren(cta, top, head, missions, foot);
  box.hidden = false;
  document.documentElement.dataset.notebook = j.theme ?? 'note';
  // 最近のフォルダに、その冒険の未開封のシール袋の数
  for (const q of j.quests ?? []) {
    if (!q.bags) continue;
    const li = [...document.querySelectorAll('#recent li[data-dir]')].find((x) => x.dataset.dir === q.dir);
    const open = li?.querySelector('button.open-recent');
    if (!open || open.querySelector('.recent-bags')) continue;
    open.append(el('span', 'recent-bags', `シール袋 ${q.bags}`));
  }
  // アプリの中なら、Dock のアイコンに未開封のシール袋の数（§79.14）
  try {
    bridge?.postMessage({ type: 'badge', count: bags.count });
  } catch {
    // 橋が無い
  }
}

function askHandFonts() {
  const link = $('#hand-fonts');
  if (!link) return;
  setTimeout(() => {
    link.addEventListener('load', () => (link.media = 'all'), { once: true });
    link.disabled = false;
  }, 800);
}

// ことばの切り替え（§75）: 静的な字は initWords が、動的な字はここで描き直す
initWords();
onWords(() => {
  renderRecent(recentList);
  if (envInfo) renderEnv(envInfo);
  if (heroJournal) renderHero(heroJournal);
});

(async () => {
  try {
    const r = await fetch('api/app', { cache: 'no-store' });
    const info = await r.json();
    renderRecent(Array.isArray(info.recent) ? info.recent : []);
    renderEnv(info);
    fetch('api/hero', { cache: 'no-store' }).then((h) => (h.ok ? h.json() : null)).then(renderHero).catch(() => {});
  } catch {
    renderRecent([]);
    showError(t('start.unreachable'));
  }
  window.__gridhubStart = { ready: true };
  askHandFonts();
})();

startMarch(document.querySelector('#start-march'));
