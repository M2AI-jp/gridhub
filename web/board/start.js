// はじめの画面（CONTRACTS §70）。盤面の担当。フォルダを選ぶ・最近のフォルダ・チュートリアルで遊ぶ。
// アプリ（GridHub.app）の中では、フォルダのダイアログを Mac の標準のものにまかせる（window.webkit.messageHandlers.gridhub）。
import { t, initWords, onWords } from './words.js';

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
    location.href = j.url;
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

/** 勇者の手帳（§79.7）: ランク・続いた日数・今日のお題・未開封のシール袋。冒険をまたいだまとめ（読むだけ） */
function renderHero(j) {
  const box = $('#start-hero');
  if (!j || j.ok !== true || j.hero !== 1) return;
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  };
  const { rank, streak, daily, bags, album, achievements } = j;
  const badge = el('div', 'sh-rank');
  badge.append(el('small', '', 'ランク'), el('b', '', rank.level));
  const who = el('div', 'sh-who');
  const bar = el('div', 'hc-xp');
  const fill = el('i');
  fill.style.width = `${Math.round((rank.into / rank.need) * 100)}%`;
  bar.append(fill);
  who.append(el('b', '', rank.title), el('small', '', `経験値 ${rank.xp}・次のランクまで ${rank.next - rank.xp}`), bar);
  const fire = el('div', `sh-streak${streak.today ? ' lit' : ''}`);
  fire.append(el('b', '', streak.current), el('small', '', '日連続'));
  const top = el('div', 'sh-top');
  top.append(badge, who, fire);

  const missions = el('ul', 'sh-missions');
  for (const m of daily.missions) {
    const li = el('li', m.done ? 'done' : '');
    li.append(el('span', 'sh-check', m.done ? '✔' : ''), el('span', '', m.text), el('em', '', `${m.now}/${m.goal}`));
    missions.append(li);
  }
  // いちばん効く次の一歩を1行で
  const nudge = !streak.today && streak.current > 0 ? `今日テストを1件倒せば、${streak.current + 1}日連続！`
    : bags.count > 0 ? `未開封のシール袋が ${bags.count} 個。冒険を開いて「手帳」で開けよう`
      : (j.quests ?? []).length > 0 && j.quests.every((q) => q.finished) ? 'あがり！ 次は本当の冒険を。「フォルダを選ぶ」で、作りたいものの願いを書こう'
      : !daily.done ? `今日のお題 ${daily.missions.filter((m) => m.done).length}/3。3つで「${daily.reward}」`
        : '今日のお題はぜんぶこなした。また明日！';
  const foot = el('p', 'sh-foot');
  foot.append(el('span', 'sh-nudge', nudge), el('small', '', `シール帳 ${album.owned}/${album.total}・称号 ${achievements.filter((a) => a.done).length}/${achievements.length}`));
  const head = el('h2', 'sh-h', '勇者の手帳');
  head.append(el('small', '', `今日のお題（${daily.date}）`));
  box.replaceChildren(top, head, missions, foot);
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
