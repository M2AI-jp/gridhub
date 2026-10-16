// マスメの盤面。ビュー（CONTRACTS §5）を受け取り、5mm方眼ノートのすごろくとして描く。
import { layout, U } from './layout.js';
import { defs, paper, roads, laneHeads, nodesLayer } from './render.js';
import { Pawns } from './pawns.js';
import { renderParty, renderLog, renderNodeDrawer, renderCharDrawer, renderLedger } from './panels.js';
import { Sound } from './sound.js';
import { initCommand, showLobby, hideLobby, pollParty, noteSorties } from './command.js';
import { own } from './sketch.js';

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
  selected: params.get('select') ? { kind: 'node', id: params.get('select') } : params.get('char') ? { kind: 'char', id: params.get('char') } : null,
  cam: null,
  frame: 0,
};
const sound = new Sound();

// ---- 駒の絵 ----
async function loadSprites() {
  try {
    const index = await (await fetch('assets/sprites/index.json', { cache: 'no-store' })).json();
    const entries = await Promise.all(
      (index.jobs || []).map(async (j) => {
        try {
          const text = await (await fetch(`assets/sprites/${j.id}.svg`)).text();
          const m = text.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
          return m ? [j.id, m[1].replace(/<title>[\s\S]*?<\/title>/, '')] : null;
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
function ensureSvg() {
  if (svg.dataset.init) return;
  svg.innerHTML = `${defs()}<g id="world"><g id="paper-layer"></g><g id="road-layer"></g><g id="head-layer"></g><g id="node-layer"></g><g id="pawns"></g></g>`;
  pawns = new Pawns($('#pawns'));
  svg.dataset.init = '1';
}

function freshMap(prev, view) {
  const fresh = Object.create(null);
  if (!prev) return fresh;
  for (const [id, n] of Object.entries(view.nodes)) {
    const before = own(prev.nodes, id)?.state;
    if (before === n.state) continue;
    if (n.state === 'cleared') fresh[id] = 'clear';
    else if (n.state === 'stale') fresh[id] = 'erase';
    else if (n.state === 'ready') fresh[id] = 'ready';
  }
  return fresh;
}

/** 伝令から来たビューの形を整える（冒険の書が読めないときは head・quest が null で、配列が空のこともある。§29.2） */
function normalizeView(v) {
  const view = v && typeof v === 'object' ? { ...v } : {};
  view.characters = Array.isArray(view.characters) ? view.characters : [];
  view.nodes = view.nodes && typeof view.nodes === 'object' && !Array.isArray(view.nodes) ? view.nodes : {};
  view.log = Array.isArray(view.log) ? view.log : [];
  if (!view.head || typeof view.head !== 'object') view.head = null;
  if (!view.quest || typeof view.quest !== 'object') view.quest = null;
  return view;
}
const seqOf = (v) => (Number.isInteger(v?.head?.seq) ? v.head.seq : -1);

function render(input) {
  ensureSvg();
  const view = normalizeView(input);
  const prev = state.view;
  const prevLay = state.lay;
  const lay = layout(view);
  state.prev = prev;
  state.view = view;
  state.lay = lay;
  if (view.head) seenHeads.set(view.head.seq, view.head.hash);
  const fresh = freshMap(prev, view);
  const sel = state.selected?.kind === 'node' ? state.selected.id : null;
  $('#paper-layer').innerHTML = paper(view, lay);
  $('#road-layer').innerHTML = roads(view, lay);
  $('#head-layer').innerHTML = laneHeads(view, lay, state.sprites);
  $('#node-layer').innerHTML = nodesLayer(view, lay, { fresh, selected: sel });
  pawns.update(view, lay, state.sprites, prev, prevLay);
  // 盤面の大きさが変わったら（呪われた空の盤面から戻ったときなど）、自分で動かしていなければ合わせ直す
  if (!state.cam) fitCamera({ whole: false });
  else if (state.cam.auto && (prevLay?.width !== lay.width || prevLay?.height !== lay.height)) fitCamera({ whole: state.cam.auto === 'whole' });
  else applyCamera();

  $('#party-list-wrap').innerHTML = renderParty(view, state.sprites, state.selected?.kind === 'char' ? state.selected.id : null);
  $('#log').innerHTML = renderLog(view, prev ? seqOf(prev) : -1);
  $('#ledger').innerHTML = renderLedger(view, state.sprites);
  $('#jumon').textContent = view.head?.jumon || '—';
  $('#jumon').dataset.seq = view.head?.seq ?? '';
  const ok = view.integrity?.ok !== false && !!view.head && !!view.quest;
  const integ = $('#integrity');
  integ.dataset.ok = String(ok);
  integ.textContent = ok ? 'セーブ正常' : '呪われています';
  integ.title = ok ? 'ハッシュの鎖は正常です' : curseLines(view).join('\n');
  renderCurse(view, ok);
  document.body.classList.toggle('finished', !!view.finished);
  document.title = `${view.finished ? '🏁 ' : ''}${view.quest?.title || 'マスメ'} — マスメ`;
  renderDrawer();
  noteSorties(view);
  if (prev?.head && view.head && prev.quest?.id === view.quest?.id) announce(prev, view);
  window.__masume.ready = true;
  window.__masume.view = view;
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
  p.append(code('masume verify'), ' で呪いの場所を確かめ、', code('masume repair'), ' で直してください（直すと、ここは消えます）。');
  const detail = document.createElement('small');
  detail.textContent = curseLines(view).join(' ／ ');
  el.replaceChildren(h, p, detail);
}

function renderDrawer() {
  const drawer = $('#drawer');
  const sel = state.selected;
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
    return;
  }
  drawer.innerHTML = html;
  drawer.hidden = false;
  drawer.dataset.kind = sel.kind;
  drawer.dataset.id = sel.id;
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
    celebrate(view);
  }
  if (tone) sound.play(tone);
}

function celebrate(view) {
  const el = document.createElement('div');
  el.className = 'agari-overlay';
  el.innerHTML = `<div class="agari-stamp"><span>あがり</span><small>${(view.quest?.title || '').replace(/[&<>]/g, '')}</small></div>`;
  for (let i = 0; i < 26; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.setProperty('--x', `${Math.random() * 100}%`);
    c.style.setProperty('--d', `${0.6 + Math.random() * 1.4}s`);
    c.style.setProperty('--r', `${Math.random() * 360}deg`);
    c.textContent = ['★', '◎', '✿', '♪'][i % 4];
    el.appendChild(c);
  }
  el.addEventListener('click', () => el.remove());
  $('#view-board').appendChild(el);
  setTimeout(() => el.classList.add('out'), 6000);
  setTimeout(() => el.remove(), 7000);
}

/** 知らせ。文字はすべてテキストとして入れる（HTML として解釈しない）。sticky なら自分では消えない */
function toast(e) {
  const box = $('#toast');
  const el = document.createElement('div');
  const type = String(e.type || '').replace(/[^\w-]/g, '');
  el.className = `toast ${e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info'}${type ? ` ${type}` : ''}`;
  const stamp = document.createElement('span');
  stamp.className = 'toast-stamp';
  stamp.textContent = e.ok === true ? (e.type === 'gate_cleared' || e.type === 'finish' ? '★' : '◎') : e.ok === false ? '✗' : '✎';
  const text = document.createElement('span');
  text.textContent = String(e.text ?? '');
  el.append(stamp, text);
  box.appendChild(el);
  if (e.sticky) return;
  setTimeout(() => el.classList.add('out'), 4200);
  setTimeout(() => el.remove(), 5000);
}

// ---- カメラ（パンとズーム） ----
function stageSize() {
  const r = svg.getBoundingClientRect();
  return { w: Math.max(200, r.width), h: Math.max(200, r.height) };
}
function fitCamera({ whole = true } = {}) {
  const { w, h } = stageSize();
  const lay = state.lay;
  if (!lay) return;
  const fit = Math.min(w / (lay.width + 2 * U), h / (lay.height + 2 * U), 1.4);
  if (whole || fit >= 0.5) {
    state.cam = { scale: fit, x: (lay.width - w / fit) / 2, y: (lay.height - h / fit) / 2 - U, auto: whole ? 'whole' : 'frontier' };
  } else {
    // 小さい画面では読める大きさを保ち、いちばん遅れている駒（まだ仕事が残っている所）から映す
    const scale = 0.72;
    const pts = [...pawns.pos.values()];
    const vw = w / scale;
    const vh = h / scale;
    const minX = pts.length ? Math.min(...pts.map((p) => p.x)) : 0;
    const minY = pts.length ? Math.min(...pts.map((p) => p.y)) : 0;
    const maxY = pts.length ? Math.max(...pts.map((p) => p.y)) : 0;
    state.cam = {
      scale,
      x: Math.max(-U, Math.min(lay.width - vw + U, minX - 8 * U)),
      y: Math.max(-2 * U, Math.min(lay.height - vh + U, maxY + 3 * U - vh, minY - 4 * U)),
      auto: 'frontier',
    };
  }
  applyCamera();
}
function applyCamera() {
  const { w, h } = stageSize();
  const c = state.cam;
  svg.setAttribute('viewBox', `${c.x.toFixed(1)} ${c.y.toFixed(1)} ${(w / c.scale).toFixed(1)} ${(h / c.scale).toFixed(1)}`);
  svg.style.setProperty('--zoom', c.scale);
}
function zoomAt(factor, cx, cy) {
  const c = state.cam;
  const { w, h } = stageSize();
  const ns = Math.max(0.25, Math.min(3, c.scale * factor));
  const wx = c.x + cx / c.scale;
  const wy = c.y + cy / c.scale;
  c.x = wx - cx / ns;
  c.y = wy - cy / ns;
  c.scale = ns;
  c.auto = false;
  applyCamera();
  void w, h;
}
function focusOn(x, y) {
  const { w, h } = stageSize();
  const c = state.cam;
  c.x = x - w / c.scale / 2;
  c.y = y - h / c.scale / 2;
  c.auto = false;
  svg.classList.add('glide');
  applyCamera();
  setTimeout(() => svg.classList.remove('glide'), 400);
}

function setupCamera() {
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, y: e.clientY, cx: state.cam?.x, cy: state.cam?.y, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag || !state.cam) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) {
      drag.moved = true;
      svg.classList.add('dragging');
    }
    state.cam.x = drag.cx - dx / state.cam.scale;
    state.cam.y = drag.cy - dy / state.cam.scale;
    state.cam.auto = false;
    applyCamera();
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
      if (!state.cam) return;
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
      else {
        state.cam.x += e.deltaX / state.cam.scale;
        state.cam.y += e.deltaY / state.cam.scale;
        state.cam.auto = false;
        applyCamera();
      }
    },
    { passive: false },
  );
  document.querySelectorAll('[data-zoom]').forEach((b) =>
    b.addEventListener('click', () => {
      const { w, h } = stageSize();
      if (b.dataset.zoom === 'fit') fitCamera();
      else zoomAt(b.dataset.zoom === 'in' ? 1.25 : 0.8, w / 2, h / 2);
    }),
  );
  // 大きさが変わったら、まだ自分で動かしていなければ合わせ直す
  new ResizeObserver(() => {
    if (!state.cam) return;
    if (state.cam.auto) fitCamera({ whole: state.cam.auto === 'whole' });
    else applyCamera();
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
    $('#node-layer').innerHTML = nodesLayer(state.view, state.lay, { selected: kind === 'node' ? id : null });
    $('#party-list-wrap').innerHTML = renderParty(state.view, state.sprites, kind === 'char' ? id : null);
  }
  renderDrawer();
  if (focus && state.lay) {
    if (kind === 'node' && state.lay.nodes[id]) focusOn(state.lay.nodes[id].x, state.lay.nodes[id].y);
    if (kind === 'char') {
      const p = pawns.pos.get(id);
      if (p) focusOn(p.x, p.y);
    }
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
  if (name === 'board' && state.cam) requestAnimationFrame(applyCamera);
}

async function post(path, body) {
  if (!LIVE) {
    toast({ text: '見本の盤面なので記録はされません（masume serve で開くと本物のハンコが押せます）', ok: null });
    return null;
  }
  let r;
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });
  } catch {
    // つながらない・途中で切れた（§29.4）。呼んだ側はボタンを押せる状態に戻す
    toast({ text: 'サーバーに届きません（masume serve が動いているか確かめてください）', ok: false });
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
    const t = e.target.closest('[data-close],[data-stamp],[data-battle],button[data-view],.party-card,tr[data-node],.step[data-node],.log-entry[data-node],#copy-jumon,#sound');
    const inBoard = e.target.closest('#board');
    if (inBoard && svg.dataset.justDragged) return;
    if (!t && inBoard) {
      const node = e.target.closest('.node');
      const head = e.target.closest('.lane-head, .pawn');
      if (node) return select('node', node.dataset.node);
      if (head) return select('char', head.dataset.char);
      return;
    }
    if (!t) return;
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
      if (j?.ready) toast({ text: `仲間がそろいました。${j.ready} のボス戦を始めます…`, ok: null, type: 'battle' });
      t.disabled = false;
      return;
    }
    if (t.matches('[data-battle]')) {
      t.disabled = true;
      const j = await post('api/battle', { gate: t.dataset.battle });
      if (j?.ok) toast({ text: `${t.dataset.battle} のボス戦が始まりました（結合E2Eを実行中）`, ok: null, type: 'battle' });
      else t.disabled = false; // 始まらなかったら、もう一度押せるように
      return;
    }
    if (t.matches('#copy-jumon')) {
      const text = $('#jumon').textContent;
      try {
        await navigator.clipboard.writeText(text);
        toast({ text: `ふっかつのじゅもんを写しました: ${text}`, ok: null });
      } catch {
        toast({ text: `ふっかつのじゅもん: ${text}`, ok: null });
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
    if (e.key === 'Escape') select(null);
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'f') fitCamera();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest?.('.node, .lane-head, .pawn, tr[data-node]')) {
      e.preventDefault();
      e.target.click?.();
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
  help.textContent = 'masume serve が動いているか確かめてください。つながれば、ひとりでに盤面が出ます。';
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
const seenHeads = new Map(); // 描いたことのある head.seq → hash（別の冒険の鎖かどうかを見分ける）
let lastText = null; // 最後に描いた応答の本文。同じ中身なら描き直さない（開いている詳細や演出を崩さない）

function isOlder(body) {
  const cur = seqOf(state.view);
  const seq = seqOf(body);
  if (seq < 0 || cur < 0 || seq >= cur) return false;
  if (body.quest?.id !== state.view.quest?.id) return false; // 別の冒険
  const known = seenHeads.get(seq);
  return known === undefined || known === body.head.hash; // 同じ鎖の昔の姿（または分からない）なら古い
}

function enterLobby() {
  hideNotice();
  renderCurse(null, true);
  showLobby();
  setLive('lobby', '入口');
  window.__masume.ready = true;
  window.__masume.lobby = true;
  // 次に来る冒険は別の冒険（seq が小さくても描く）
  state.view = null;
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
  if (no < appliedNo) return; // もっと新しい応答をもう描いた
  const isView = r.ok && body && typeof body === 'object' && !Array.isArray(body) && body.ok !== false;
  if (!isView) {
    if (body?.code === 'E_NO_GAME') {
      appliedNo = no;
      return enterLobby();
    }
    // 一時的な失敗（§29.3）: 盤面は覆わず、端の表示だけ
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
      // つながった（つなぎ直した）ら読み直す。切れている間に変わった分を取りこぼさない
      es.addEventListener('hello', schedule);
      es.addEventListener('change', schedule);
      es.onerror = () => {
        setLive('off', '再接続中…');
        if (es.readyState === EventSource.CLOSED) {
          // HTTP エラーなどで閉じた EventSource は自分ではつなぎ直さないので、作り直す
          es.close();
          setTimeout(connect, 3000);
        }
      };
    };
    connect();
  }
  // 入口にいる間は冒険の書が生まれるのをこまめに見る。盤面ではときどき読み直す
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

// ---- ノートに書き出す（CONTRACTS §22） ----
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
  const vars = ['--paper', '--grid', '--grid-strong', '--ink', '--ink-soft', '--red', '--pencil', '--hand', '--mono']
    .map((v) => `${v}: ${root.getPropertyValue(v).trim()};`)
    .join(' ');
  return `svg { ${vars} } ${css}`;
}

// XML 1.0 で使えない文字（制御文字・対になっていないサロゲート・U+FFFE/FFFF）
const XML_BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const xmlText = (s) => String(s).replace(XML_BAD, '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** 盤面全体を1枚の SVG の文字列にする。1目 = 5mm の実寸。XML として正しい（§29.6） */
function exportSvg() {
  if (!state.view || !state.lay) return '';
  const lay = state.lay;
  const x = -U;
  const y = 0;
  const w = lay.width + 2 * U;
  const h = lay.height + U;
  const world = $('#world').cloneNode(true);
  world.querySelectorAll('.float-text').forEach((el) => el.remove());
  // outerHTML は HTML の書き方（&nbsp; など）になるので、XML の書き方で書き出す
  const ser = new XMLSerializer();
  const defsEl = svg.querySelector('defs');
  const css = boardCss().replace(/<\/?script/gi, '');
  const out = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${((w / U) * 5).toFixed(1)}mm" height="${((h / U) * 5).toFixed(1)}mm">
<title>${xmlText(state.view.quest?.title || 'マスメ')}</title>
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
  const filename = `${state.view.quest?.id || 'masume'}-${ymd}.svg`;
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
  toast({ text: `ノートに書き出しました: ${filename}（1目 = 5mm の実寸）`, ok: true });
}

window.__masume = { ready: false, view: null, frame: 0, done: false, render: (v) => render(v), select, setView, exportSvg };

(async () => {
  setupCamera();
  setupInteractions();
  initCommand({ live: LIVE, post, refresh: liveRefresh, toast, getView: () => state.view });
  $('#export-notebook').addEventListener('click', downloadNotebook);
  state.sprites = await loadSprites();
  if (params.get('view')) setView(params.get('view'));
  try {
    if (LIVE) await startLive();
    else await startFixture();
  } catch (err) {
    console.warn(err);
    toast({ text: `盤面を読み込めませんでした: ${String(err?.message || err)}`, ok: false, sticky: true });
  }
})();
