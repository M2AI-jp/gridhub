// GridHub の盤面。ビュー（CONTRACTS §5・§40〜§43）を受け取り、縦の5mm方眼ノートの世界地図として描く（§50）。
import { layoutWorld, stopOf, U, PAGE, pageOrigin } from './world.js';
import { defs, paperLayer, headLayer, sceneryLayer, roadLayer, monsterItems, nodeItems, wx, wy } from './draw.js';
import { Pawns } from './pawns.js';
import { Book } from './book.js';
import { renderParty, renderBestiary, renderLog, renderNodeDrawer, renderCharDrawer, renderLedger } from './panels.js';
import { Sound } from './sound.js';
import { initCommand, showLobby, hideLobby, pollParty, noteSorties } from './command.js';
import { own } from './sketch.js';

// 外の字（Google Fonts）を待たずに描く（§37）。手元の書体で先に描き、盤面が落ち着いてから読みはじめ、届いたら全部の画面に効かせて差し替える
// （字が届くたび・届かないと分かるたびに、ノート全体の字を組み直すので、最初の描画とは重ねない）
let fontsAsked = false;
function askHandFonts() {
  if (fontsAsked) return;
  fontsAsked = true;
  const link = document.querySelector('#hand-fonts');
  if (!link) return;
  const start = () => {
    link.addEventListener('load', () => (link.media = 'all'), { once: true });
    link.disabled = false;
  };
  setTimeout(() => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 2500 }) : start()), 1500);
}

const params = new URLSearchParams(location.search);
// 見本と台本の名前は、この形のときだけ使う（URL の文字列をそのまま取りに行かない・描かない。§29.1）
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;
const safeName = (s) => (s != null && SAFE_NAME.test(s) ? s : null);
const FIXTURE = safeName(params.get('fixture'));
const SCRIPT = safeName(params.get('script'));
const LIVE = !params.has('fixture');

const $ = (sel) => document.querySelector(sel);
const svg = $('#board');
const state = {
  view: null,
  prev: null,
  lay: null,
  sprites: {},
  monsters: {},
  selected: params.get('select') ? { kind: 'node', id: params.get('select') } : params.get('char') ? { kind: 'char', id: params.get('char') } : null,
  frame: 0,
  endingSeq: null,
  turnTimer: null,
};
const sound = new Sound();

// ---- 絵（駒とモンスター） ----
async function loadArt(dir, key) {
  try {
    const index = await (await fetch(`assets/${dir}/index.json`, { cache: 'no-store' })).json();
    const entries = await Promise.all(
      (index[key] || []).map(async (j) => {
        try {
          const r = await fetch(`assets/${dir}/${j.id}.svg`);
          if (!r.ok) return null;
          const m = (await r.text()).match(/<svg[^>]*>([\s\S]*)<\/svg>/);
          return m ? [j.id, m[1].replace(/<title>[\s\S]*?<\/title>/, '').replace(/<desc>[\s\S]*?<\/desc>/, '')] : null;
        } catch {
          return null;
        }
      }),
    );
    return Object.fromEntries(entries.filter(Boolean));
  } catch {
    return {};
  }
}

// ---- 描画 ----
let pawns;
let book;
function ensureSvg() {
  if (svg.dataset.init) return;
  svg.innerHTML = `${defs(state.monsters)}<g id="world"><g id="paper-layer"></g><g id="scenery-layer"></g><g id="road-layer"></g><g id="monster-layer"></g><g id="node-layer"></g><g id="head-layer"></g><g id="pawns"></g></g>`;
  pawns = new Pawns($('#pawns'), { walks: window.__masume.walks });
  svg.dataset.init = '1';
}

// 最初の1回だけ、ペンで描いていくように線を出す（動きを減らす設定では、最初から描き終わった姿。§36.5）
let drewOnce = false;
function penIn(view) {
  if (drewOnce || !Object.keys(view.nodes).length) return;
  drewOnce = true;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  svg.classList.add('drawing');
  setTimeout(() => svg.classList.remove('drawing'), 3800);
}

function freshMap(prev, view) {
  const fresh = Object.create(null);
  const slain = Object.create(null);
  if (!prev) return { fresh, slain };
  for (const [id, n] of Object.entries(view.nodes)) {
    const p = own(prev.nodes, id);
    const before = p?.state;
    if (before !== n.state) {
      if (n.state === 'cleared') fresh[id] = 'clear';
      else if (n.state === 'stale') fresh[id] = 'erase';
      else if (n.state === 'ready') fresh[id] = 'ready';
    }
    const now = Array.isArray(n.cases) ? n.cases : [];
    const was = Array.isArray(p?.cases) ? p.cases : [];
    const list = [];
    now.forEach((c, i) => {
      if (c.ok === true && was[i]?.ok !== true) list.push(i);
    });
    if (list.length) slain[id] = list;
  }
  return { fresh, slain };
}

/** 伝令から来たビューの形を整える（冒険の書が読めないときは head・quest が null で、配列が空のこともある。§29.2） */
function normalizeView(v) {
  const view = v && typeof v === 'object' ? { ...v } : {};
  view.characters = Array.isArray(view.characters) ? view.characters.filter((c) => c && typeof c === 'object').map((c) => ({ ...c, path: Array.isArray(c.path) ? c.path : [] })) : [];
  view.nodes = view.nodes && typeof view.nodes === 'object' && !Array.isArray(view.nodes) ? view.nodes : {};
  view.log = Array.isArray(view.log) ? view.log : [];
  if (!view.head || typeof view.head !== 'object') view.head = null;
  if (!view.quest || typeof view.quest !== 'object') view.quest = null;
  return view;
}
const seqOf = (v) => (Number.isInteger(v?.head?.seq) ? v.head.seq : -1);

/** はじめに開く見開き: 作業中の駒がいちばん多いページ（同じなら前のページ） */
function firstPage(view, lay) {
  const counts = lay.pages.map(() => 0);
  for (const c of view.characters) {
    const s = stopOf(view, lay, c);
    if (s) counts[s.page] += c.status === 'working' ? 2 : 1;
  }
  return counts.indexOf(Math.max(...counts, 0));
}

/** 層の中身が変わったときだけ書きかえる（同じなら DOM に触らない。大きなノートでも組み直しを小さく） */
const layerText = new Map();
function setLayer(sel, html) {
  if (layerText.get(sel) === html) return;
  layerText.set(sel, html);
  $(sel).innerHTML = html;
}

/** 1つずつの文字列の配列で書く層: 並びが同じなら、変わったものだけを差しかえる */
const layerItems = new Map();
function patchLayer(sel, items) {
  const el = $(sel);
  const before = layerItems.get(sel);
  layerItems.set(sel, items);
  if (!before || before.length !== items.length || el.children.length !== items.length) {
    el.innerHTML = items.join('');
    return;
  }
  const tpl = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  for (let i = 0; i < items.length; i++) {
    if (before[i] === items[i]) continue;
    tpl.innerHTML = items[i];
    if (tpl.firstElementChild) el.children[i].replaceWith(tpl.firstElementChild);
  }
}

function render(input) {
  ensureSvg();
  const view = normalizeView(input);
  const prev = state.view;
  const lay = layoutWorld(view);
  const sameQuest = prev && prev.quest?.id === view.quest?.id;
  state.prev = prev;
  state.view = view;
  state.lay = lay;
  if (view.head) seenHeads.set(view.head.seq, view.head.hash);
  const { fresh, slain } = freshMap(prev, view);
  const sel = state.selected?.kind === 'node' ? state.selected.id : null;
  setLayer('#paper-layer', paperLayer(view, lay));
  setLayer('#scenery-layer', sceneryLayer(lay));
  setLayer('#road-layer', roadLayer(view, lay));
  patchLayer('#monster-layer', monsterItems(view, lay, state.monsters, { fresh: slain }));
  patchLayer('#node-layer', nodeItems(view, lay, state.monsters, { fresh, selected: sel }));
  setLayer('#head-layer', headLayer(view, lay, state.sprites, state.monsters));
  penIn(view);
  const moved = pawns.update(view, lay, state.sprites, sameQuest ? prev : null);
  book.setPages(lay.pages.length, firstPage(view, lay));
  if (!book.cam || book.cam.auto) book.fit();
  else book.apply();
  followPawns(moved);
  updatePageNav();
  effects(prev, view, lay, sameQuest);

  setLayer('#party-list-wrap', renderParty(view, state.sprites, state.selected?.kind === 'char' ? state.selected.id : null));
  setLayer('#bestiary', renderBestiary(view, state.monsters));
  setLayer('#log', renderLog(view, prev ? seqOf(prev) : -1));
  setLayer('#ledger', renderLedger(view, state.sprites));
  // 見出しには記録の番号（seq）と最新のセーブのコミットを見せる。ふっかつのじゅもんは見せない（ユーザーの判断）。
  // #jumon は既存の判定（G1 など）と §50.13 の互換のため、見えないまま残す
  $('#jumon').textContent = view.head?.jumon || '—';
  $('#jumon').dataset.seq = view.head?.seq ?? '';
  $('#head-seq').textContent = view.head ? `seq ${view.head.seq}` : 'seq —';
  const save = latestSave(view);
  $('#head-commit').hidden = !save;
  $('#head-commit').textContent = save ? `commit ${String(save.commit).slice(0, 7)}` : '';
  const ok = view.integrity?.ok !== false && !!view.head && !!view.quest;
  const integ = $('#integrity');
  integ.dataset.ok = String(ok);
  integ.textContent = ok ? 'セーブ正常' : '呪われています';
  integ.title = ok ? 'ハッシュの鎖は正常です' : curseLines(view).join('\n');
  renderCurse(view, ok);
  document.body.classList.toggle('finished', !!view.finished);
  document.title = `${view.finished ? '🏁 ' : ''}${view.quest?.title ? view.quest.title + ' — ' : ''}GridHub`;
  renderDrawer();
  noteSorties(view);
  if (prev?.head && view.head && sameQuest) announce(prev, view);
  renderEnding(view);
  window.__masume.ready = true;
  askHandFonts();
  window.__masume.view = view;
  window.__masume.pages = lay.pages.length;
  window.__masume.spread = book.left + 1;
}

/** 最新のセーブ（キャラクターと町・ゲートの save のうち seq がいちばん大きいもの） */
function latestSave(view) {
  let best = null;
  for (const x of [...view.characters, ...Object.values(view.nodes)]) {
    const s = x?.save;
    if (s && s.commit && (!best || (s.seq ?? -1) > (best.seq ?? -1))) best = s;
  }
  return best;
}

/** 駒が今の見開きの外のページへ進んだら、歩き終わったあとで、そのページの見開きへめくる（§50.8） */
function followPawns(moved) {
  const out = moved.filter((m) => !m.back && !book.visible().includes(m.page));
  if (!out.length) return;
  const last = out.reduce((a, b) => (b.ms >= a.ms ? b : a));
  clearTimeout(state.turnTimer);
  state.turnTimer = setTimeout(() => book.turnTo(last.page + 1), last.ms + 150);
}

/** 新しく起きたこと（強敵・復活・レベルアップ）を、盤面の上の字で見せる */
function effects(prev, view, lay, sameQuest) {
  if (!prev || !sameQuest) return;
  for (const [id, n] of Object.entries(view.nodes)) {
    const p = own(prev.nodes, id);
    if (!Array.isArray(n.cases) || !p) continue;
    n.cases.forEach((c, i) => {
      const was = Array.isArray(p.cases) ? p.cases[i] : null;
      const sq = lay.place[id]?.squares?.[i];
      if (!sq) return;
      const at = { x: wx(sq.page, sq.x + 1), y: wy(sq.y) + 3.2 * U };
      if ((c.revived || 0) > (was?.revived || 0)) pawns.float(at, '復活！', 'down');
      else if (c.strong && !was?.strong) pawns.float(at, '強敵を倒した！', 'up');
    });
  }
}

function curseLines(view) {
  const errors = Array.isArray(view.integrity?.errors) ? view.integrity.errors : [];
  const lines = errors.slice(0, 3).map((e) => `seq ${e?.seq ?? '?'} ${e?.code ?? ''} ${e?.message ?? ''}`.trim());
  if (!lines.length) lines.push(view.head ? '冒険の書の中身が読めません' : '冒険の書の先頭から読めません');
  return lines;
}

/** 呪いの知らせ（盤面の上の帯。中身はすべてテキストとして入れる） */
function renderCurse(view, ok) {
  let el = $('#curse');
  if (ok) return el?.remove();
  if (!el) {
    el = document.createElement('div');
    el.id = 'curse';
    el.setAttribute('role', 'alert');
    $('#stage').appendChild(el);
  }
  const h = document.createElement('strong');
  h.textContent = '☠ 冒険の書が呪われています';
  const p = document.createElement('p');
  const code = (t) => Object.assign(document.createElement('code'), { textContent: t });
  p.append(code('masume verify'), ' で呪いの場所を確かめ、', code('masume repair'), ' で直してください（gridhub でも同じ。直すと、ここは消えます）。');
  const detail = document.createElement('small');
  detail.textContent = curseLines(view).join(' ／ ');
  el.replaceChildren(h, p, detail);
}

function renderDrawer() {
  const drawer = $('#drawer');
  const sel = state.selected;
  document.body.classList.toggle('drawer-open', !!(sel && state.view));
  if (!sel || !state.view) {
    drawer.hidden = true;
    drawer.removeAttribute('data-kind');
    drawer.removeAttribute('data-id');
    return;
  }
  const html = sel.kind === 'node' ? renderNodeDrawer(state.view, sel.id, { live: LIVE }) : renderCharDrawer(state.view, sel.id, state.sprites);
  if (!html) {
    state.selected = null;
    drawer.hidden = true;
    document.body.classList.remove('drawer-open');
    return;
  }
  drawer.innerHTML = html;
  drawer.hidden = false;
  drawer.dataset.kind = sel.kind;
  drawer.dataset.id = sel.id;
}

// ---- エンディング（§50.10） ----
function renderEnding(view) {
  const e = view.ending;
  const el = $('#ending');
  if (!e || typeof e !== 'object' || typeof e.text !== 'string') return;
  if (state.endingSeq === e.seq) return;
  state.endingSeq = e.seq;
  const lines = e.text.split('\n').filter(Boolean);
  const title = $('#ending-title');
  title.textContent = view.quest?.title || '';
  const body = $('#ending-text');
  body.replaceChildren(
    ...lines.map((l, i) => {
      const p = document.createElement('p');
      p.textContent = l;
      p.style.setProperty('--i', i);
      return p;
    }),
  );
  const s = e.stats || {};
  const stats = [
    ['テスト', `${s.defeated ?? '?'}/${s.tests ?? '?'}`],
    ['メダル', s.medals],
    ['強敵', s.strong],
    ['復活', s.revived],
    ['宝箱', s.treasures],
    ['技', s.skills],
    ['出撃', s.sorties],
  ].filter(([, v]) => v !== undefined && v !== null);
  $('#ending-stats').replaceChildren(
    ...stats.map(([k, v]) => {
      const d = document.createElement('div');
      const b = document.createElement('b');
      b.textContent = String(v);
      const sm = document.createElement('small');
      sm.textContent = k;
      d.append(b, sm);
      return d;
    }),
  );
  el.hidden = false;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  sound.play('fanfare');
}

// ---- 演出（新しく書かれた冒険の書を読み上げる） ----
function announce(prev, view) {
  const news = (view.log || []).filter((e) => e.seq > seqOf(prev));
  if (!news.length) return;
  let tone = null;
  for (const e of news.slice(-3)) {
    toast(e);
    if (e.type === 'gate_cleared') tone = 'fanfare';
    else if (e.ok === true && tone !== 'fanfare') tone = 'up';
    else if (e.ok === false && !tone) tone = 'down';
  }
  if (view.finished && !prev.finished) {
    tone = 'fanfare';
    toast({ text: 'あがり！ 全員そろってゴールしました', ok: true, type: 'finish' });
  }
  if (tone) sound.play(tone);
}

/** 知らせ。文字はすべてテキストとして入れる（HTML として解釈しない）。sticky なら自分では消えない */
function toast(e) {
  const boxEl = $('#toast');
  const el = document.createElement('div');
  const type = String(e.type || '').replace(/[^\w-]/g, '');
  el.className = `toast ${e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info'}${type ? ` ${type}` : ''}`;
  const stamp = document.createElement('span');
  stamp.className = 'toast-stamp';
  stamp.textContent = e.ok === true ? (e.type === 'gate_cleared' || e.type === 'finish' ? '★' : '◎') : e.ok === false ? '✗' : '✎';
  const text = document.createElement('span');
  text.textContent = String(e.text ?? '');
  el.append(stamp, text);
  boxEl.appendChild(el);
  if (e.sticky) return;
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 5000);
}

// ---- 見開きの操作 ----
function updatePageNav() {
  if (!book) return;
  const n = book.pages;
  const vis = book.visible();
  const no = $('#page-no');
  if (no) no.textContent = n ? (vis.length > 1 ? `${vis[0] + 1}–${vis[1] + 1} / ${n}` : `${vis[0] + 1} / ${n}`) : '— / —';
  const prevBtn = $('#page-prev');
  const nextBtn = $('#page-next');
  if (prevBtn) prevBtn.disabled = book.left <= 0;
  if (nextBtn) nextBtn.disabled = vis[vis.length - 1] >= n - 1;
  window.__masume.spread = book.left + 1;
  window.__masume.pages = n;
}

function setupCamera() {
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !book.cam) return;
    drag = { x: e.clientX, y: e.clientY, moved: false, lx: e.clientX, ly: e.clientY };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) {
      drag.moved = true;
      svg.classList.add('dragging');
    }
    if (drag.moved) book.pan(drag.lx - e.clientX, drag.ly - e.clientY);
    drag.lx = e.clientX;
    drag.ly = e.clientY;
  });
  window.addEventListener('pointerup', () => {
    if (drag?.moved) svg.dataset.justDragged = '1';
    setTimeout(() => delete svg.dataset.justDragged, 0);
    drag = null;
    svg.classList.remove('dragging');
  });
  svg.addEventListener(
    'wheel',
    (e) => {
      if (!book.cam) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) book.zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else book.pan(e.deltaX, e.deltaY);
    },
    { passive: false },
  );
  document.querySelectorAll('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const { w, h } = book.stageSize();
      if (b.dataset.zoom === 'fit') book.fit();
      else book.zoomAt(b.dataset.zoom === 'in' ? 1.25 : 0.8, w / 2, h / 2);
    }),
  );
  $('#page-prev').addEventListener('click', () => book.turnTo(book.left + 1 - (book.single ? 1 : 2)));
  $('#page-next').addEventListener('click', () => book.turnTo(book.left + 1 + (book.single ? 1 : 2)));
  new ResizeObserver(() => {
    if (!book.cam) return;
    if (book.cam.auto) book.fit();
    else book.apply();
  }).observe(svg);
}

// ---- 選択と操作 ----
function select(kind, id, { focus = false } = {}) {
  state.selected = kind ? { kind, id } : null;
  const url = new URL(location.href);
  url.searchParams.delete('select');
  url.searchParams.delete('char');
  if (kind === 'node') url.searchParams.set('select', id);
  if (kind === 'char') url.searchParams.set('char', id);
  history.replaceState(null, '', url);
  if (state.view) {
    patchLayer('#node-layer', nodeItems(state.view, state.lay, state.monsters, { selected: kind === 'node' ? id : null }));
    setLayer('#party-list-wrap', renderParty(state.view, state.sprites, kind === 'char' ? id : null));
  }
  renderDrawer();
  if (focus && state.lay) {
    let page = null;
    if (kind === 'node' && state.lay.place[id]) page = state.lay.place[id].page;
    if (kind === 'char') {
      const c = state.view.characters.find((x) => x.id === id);
      page = c ? stopOf(state.view, state.lay, c)?.page ?? null : null;
    }
    if (page != null && !book.visible().includes(page)) book.turnTo(page + 1);
  }
}

function setView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === name)));
  document.body.dataset.view = name;
  const url = new URL(location.href);
  if (name === 'board') url.searchParams.delete('view');
  else url.searchParams.set('view', name);
  history.replaceState(null, '', url);
  if (name === 'board' && book?.cam) requestAnimationFrame(() => (book.cam.auto ? book.fit() : book.apply()));
}

async function post(path, body) {
  if (!LIVE) {
    toast({ text: '見本の盤面なので記録はされません（gridhub serve で開くと本物のハンコが押せます）', ok: null });
    return null;
  }
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });
  } catch {
    toast({ text: 'サーバーに届きません（gridhub serve が動いているか確かめてください）', ok: false });
    return { ok: false, code: 'E_NETWORK', error: 'サーバーに届きません' };
  }
  const got = await r.json().catch(() => null);
  const j = got && typeof got === 'object' ? got : {};
  if (!r.ok || !got || j.ok === false) {
    toast({ text: `できませんでした: ${j.error || `HTTP ${r.status}`}`, ok: false });
    return { ...j, ok: false };
  }
  return j;
}

function setupInteractions() {
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-close],[data-stamp],[data-battle],button[data-view],.party-card,tr[data-node],.step[data-node],.log-entry[data-node],#copy-jumon,#sound,#ending-close');
    const inBoard = e.target.closest('#board');
    if (inBoard && svg.dataset.justDragged) return;
    if (!t && inBoard) {
      const node = e.target.closest('.node');
      const sq = e.target.closest('.sq');
      const head = e.target.closest('.lane-head, .pawn, .lane-tag');
      if (node) return select('node', node.dataset.node);
      if (sq) return select('node', sq.dataset.node);
      if (head) return select('char', head.dataset.char);
      return;
    }
    if (!t) return;
    if (t.matches('#ending-close')) {
      $('#ending').hidden = true;
      return;
    }
    if (t.matches('[data-close]')) return select(null);
    if (t.matches('button[data-view]')) return setView(t.dataset.view);
    if (t.matches('.party-card')) return select('char', t.dataset.char, { focus: true });
    if (t.matches('tr[data-node], .step[data-node], .log-entry[data-node]')) {
      setView('board');
      return select('node', t.dataset.node, { focus: true });
    }
    if (t.matches('[data-stamp]')) {
      t.disabled = true;
      const j = await post('api/stamp', { node: t.dataset.stamp, as: t.dataset.as });
      if (j?.ready) toast({ text: `仲間がそろいました。${j.ready} の結合テストを始めます…`, ok: null, type: 'battle' });
      t.disabled = false;
      return;
    }
    if (t.matches('[data-battle]')) {
      t.disabled = true;
      const j = await post('api/battle', { gate: t.dataset.battle });
      if (j?.ok) toast({ text: `${t.dataset.battle} の中ボス戦が始まりました（結合テストを実行中）`, ok: null, type: 'battle' });
      else t.disabled = false;
      return;
    }
    if (t.matches('#copy-jumon')) {
      const h = state.view?.head;
      const save = state.view ? latestSave(state.view) : null;
      const text = h ? `seq ${h.seq}${save ? ` commit ${String(save.commit).slice(0, 7)}` : ''}（gridhub load ${h.seq}）` : '';
      try {
        await navigator.clipboard.writeText(text);
        toast({ text: `記録の番号を写しました: ${text}`, ok: null });
      } catch {
        toast({ text: `記録の番号: ${text}`, ok: null });
      }
      return;
    }
    if (t.matches('#sound')) {
      sound.toggle();
      t.setAttribute('aria-pressed', String(sound.on));
      t.textContent = sound.on ? '♪ 音あり' : '♪ 音なし';
      if (sound.on) sound.play('up');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#ending').hidden) $('#ending').hidden = true;
      select(null);
    }
    if (e.target.closest && e.target.closest('input,textarea,select')) return;
    if (e.key === 'f') book.fit();
    if (e.key === 'ArrowRight' && document.body.dataset.view === 'board') $('#page-next').click();
    if (e.key === 'ArrowLeft' && document.body.dataset.view === 'board') $('#page-prev').click();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.node, .lane-head, .pawn, tr[data-node]')) {
      e.preventDefault();
      const n = e.target.closest('.node');
      if (n) select('node', n.dataset.node);
      const h = e.target.closest('.lane-head, .pawn');
      if (h) select('char', h.dataset.char);
    }
  });
}

// ---- データの入手（見本 or 本物） ----
async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
}

/** まだ何も描けていないときだけ出す、盤面の上のお知らせ（中身はすべてテキスト） */
function showNotice(title, body) {
  let el = $('#notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notice';
    $('#view-board').appendChild(el);
  }
  const card = document.createElement('div');
  card.className = 'notice-card';
  const h = document.createElement('h2');
  h.textContent = title;
  const code = document.createElement('p');
  code.className = 'notice-code';
  code.textContent = body ? `[${String(body.code ?? 'E_UNKNOWN')}] ${String(body.error ?? '')}` : '';
  const help = document.createElement('p');
  help.textContent = 'gridhub serve が動いているか確かめてください。つながれば、ひとりでに盤面が出ます。';
  card.append(h, code, help);
  el.replaceChildren(card);
}
function hideNotice() {
  $('#notice')?.remove();
}

function setLive(mode, text, title = '') {
  const el = $('#live');
  el.dataset.mode = mode;
  el.textContent = text;
  el.title = title;
}

// 応答の順番（§29.5）: 後から出した読み込みの応答をもう描いていたら、先に出した分は描かない。
// さらに、同じ冒険で今より古い head.seq のビューでは描き直さない
let reqNo = 0;
let appliedNo = 0;
const seenHeads = new Map();
let lastText = null;

function isOlder(body) {
  const cur = seqOf(state.view);
  const seq = seqOf(body);
  if (seq < 0 || cur < 0 || seq >= cur) return false;
  if (body.quest?.id !== state.view.quest?.id) return false;
  const known = seenHeads.get(seq);
  return known === undefined || known === body.head.hash;
}

function enterLobby() {
  hideNotice();
  renderCurse(null, true);
  showLobby();
  setLive('lobby', '入口');
  window.__masume.ready = true;
  window.__masume.lobby = true;
  askHandFonts();
  state.view = null;
  drewOnce = false;
  seenHeads.clear();
  lastText = null;
}

let partyWatched = false;
async function liveRefresh() {
  const no = ++reqNo;
  let r;
  let text = '';
  let body = null;
  try {
    r = await fetch('api/state', { cache: 'no-store' });
    text = await r.text();
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  } catch (err) {
    if (no < appliedNo) return;
    setLive('off', '盤面サーバーに届きません', String(err?.message || err));
    if (!state.view && !window.__masume.lobby) showNotice('盤面サーバーに届きません', null);
    return;
  }
  if (no < appliedNo) return;
  const isView = r.ok && body && typeof body === 'object' && !Array.isArray(body) && body.ok !== false;
  if (!isView) {
    if (body?.code === 'E_NO_GAME') {
      appliedNo = no;
      return enterLobby();
    }
    const why = body && typeof body === 'object' ? `[${String(body.code ?? '')}] ${String(body.error ?? '')}` : `HTTP ${r.status}`;
    setLive('off', `読み込めません（${r.status}）`, why);
    if (!state.view && !window.__masume.lobby) showNotice('盤面を読み込めません', body && typeof body === 'object' ? body : { code: `HTTP ${r.status}`, error: '' });
    return;
  }
  appliedNo = no;
  setLive('live', 'ライブ');
  if (text === lastText || isOlder(body)) return;
  lastText = text;
  hideNotice();
  hideLobby();
  window.__masume.lobby = false;
  render(body);
  if (!partyWatched) {
    partyWatched = true;
    pollParty();
  }
}

async function startLive() {
  await liveRefresh();
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(liveRefresh, 120);
  };
  if ('EventSource' in window && !params.has('nostream')) {
    const connect = () => {
      const es = new EventSource('api/stream');
      // つながった（つなぎ直した）ら、待たずにすぐ読み直す。切れている間に変わった分を取りこぼさない（§29.5）
      es.addEventListener('hello', () => {
        clearTimeout(timer);
        liveRefresh();
      });
      es.addEventListener('change', schedule);
      es.onerror = () => {
        setLive('off', '再接続中…');
        if (es.readyState === EventSource.CLOSED) {
          es.close();
          setTimeout(connect, 3000);
        }
      };
    };
    connect();
  }
  setInterval(() => {
    if (window.__masume.lobby) liveRefresh();
  }, 2000);
  setInterval(liveRefresh, 15000);
}

async function startFixture() {
  if (!FIXTURE) {
    setLive('fixture', '見本: —');
    throw new Error('見本の名前には英数字・-・_ だけが使えます');
  }
  setLive('fixture', `見本: ${FIXTURE}`);
  if (params.has('script') && !SCRIPT) toast({ text: '台本の名前には英数字・-・_ だけが使えます（台本なしで見本を出します）', ok: false, sticky: true });
  if (SCRIPT) {
    const script = await getJson(`fixtures/${SCRIPT}-script.json`);
    const frames = script.frames || [];
    const interval = Number(params.get('interval') || script.interval || 1800);
    window.__masume.frames = frames.length;
    const play = (i) => {
      state.frame = i;
      window.__masume.frame = i;
      render(frames[i]);
      if (i + 1 < frames.length) setTimeout(() => play(i + 1), interval);
      else window.__masume.done = true;
    };
    play(0);
  } else {
    render(await getJson(`fixtures/${FIXTURE}-state.json`));
    window.__masume.done = true;
  }
}

// ---- ノートに書き出す（§22・§50.13: すべてのページを含むノート全体、1目 = 5mm の実寸） ----
function boardCss() {
  let css = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += rule.cssText + '\n';
    } catch {
      // よそのスタイルシート（Google Fonts など）は読めないので飛ばす
    }
  }
  const root = getComputedStyle(document.documentElement);
  const vars = ['--paper', '--paper-2', '--grid', '--grid-strong', '--ink', '--ink-soft', '--red', '--pencil', '--pencil-ink', '--hand', '--marker', '--pencil-hand', '--ui', '--mono']
    .map((v) => `${v}: ${root.getPropertyValue(v).trim()};`)
    .join(' ');
  return `svg { ${vars} } ${css}`;
}

const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const xmlText = (s) => String(s).replace(XML_BAD, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function exportSvg() {
  if (!state.view || !state.lay) return '';
  const n = state.lay.pages.length;
  const last = pageOrigin(n - 1);
  const x = -U;
  const y = -U;
  const w = (last.x + PAGE.w) * U + 2 * U;
  const h = PAGE.h * U + 2 * U;
  const world = $('#world').cloneNode(true);
  world.querySelectorAll('.float-text').forEach((el) => el.remove());
  world.querySelectorAll('[pathLength]').forEach((el) => el.removeAttribute('pathLength'));
  // 書き出しでは data-node はマス（札・町・城）だけに付ける。モンスターのマスはどのダンジョンのテストかを data-test-of で
  world.querySelectorAll('.sq[data-node]').forEach((el) => {
    el.setAttribute('data-test-of', el.getAttribute('data-node'));
    el.removeAttribute('data-node');
  });
  const ser = new XMLSerializer();
  const defsEl = svg.querySelector('defs');
  const css = boardCss().replace(/<\/?script/gi, '');
  const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${((w / U) * 5).toFixed(1)}mm" height="${((h / U) * 5).toFixed(1)}mm">
<title>${xmlText(state.view.quest?.title || 'GridHub')}</title>
<style><![CDATA[${css.replace(/]]>/g, ']]]]><![CDATA[>')}]]></style>
${defsEl ? ser.serializeToString(defsEl) : ''}
${ser.serializeToString(world)}
</svg>
`;
  return out.replace(XML_BAD, '');
}

function downloadNotebook() {
  const text = exportSvg();
  if (!text) return;
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const filename = `${state.view.quest?.id || 'gridhub'}-${ymd}.svg`;
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  window.__masume.lastExport = { filename, size: blob.size };
  toast({ text: `ノートに書き出しました: ${filename}（${state.lay.pages.length}ページ・1目 = 5mm の実寸）`, ok: true });
}

window.__masume = {
  ready: false,
  view: null,
  frame: 0,
  done: false,
  walks: [],
  spread: 1,
  pages: 0,
  render: (v) => render(v),
  select,
  setView,
  exportSvg,
  turnTo: (n, opts) => book.turnTo(n, opts),
  get flipping() {
    return !!book?.flipping;
  },
};

(async () => {
  book = new Book(svg, $('#view-board'), { onChange: updatePageNav });
  setupCamera();
  setupInteractions();
  initCommand({ live: LIVE, post, refresh: liveRefresh, toast, getView: () => state.view });
  $('#export-notebook').addEventListener('click', downloadNotebook);
  [state.sprites, state.monsters] = await Promise.all([loadArt('sprites', 'jobs'), loadArt('monsters', 'monsters')]);
  if (params.get('view')) setView(params.get('view'));
  try {
    if (LIVE) await startLive();
    else await startFixture();
  } catch (err) {
    console.warn(err);
    toast({ text: `盤面を読み込めませんでした: ${String(err?.message || err)}`, ok: false, sticky: true });
  }
})();
