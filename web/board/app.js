// マスメの盤面。ビュー（CONTRACTS §5）を受け取り、5mm方眼ノートのすごろくとして描く。
import { layout, U } from './layout.js';
import { defs, paper, roads, laneHeads, nodesLayer } from './render.js';
import { Pawns } from './pawns.js';
import { renderParty, renderLog, renderNodeDrawer, renderCharDrawer, renderLedger } from './panels.js';
import { Sound } from './sound.js';

const params = new URLSearchParams(location.search);
const FIXTURE = params.get('fixture');
const SCRIPT = params.get('script');
const LIVE = !FIXTURE;

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
  const fresh = {};
  if (!prev) return fresh;
  for (const [id, n] of Object.entries(view.nodes)) {
    const before = prev.nodes[id]?.state;
    if (before === n.state) continue;
    if (n.state === 'cleared') fresh[id] = 'clear';
    else if (n.state === 'stale') fresh[id] = 'erase';
    else if (n.state === 'ready') fresh[id] = 'ready';
  }
  return fresh;
}

function render(view) {
  ensureSvg();
  const prev = state.view;
  const prevLay = state.lay;
  const lay = layout(view);
  state.prev = prev;
  state.view = view;
  state.lay = lay;
  const fresh = freshMap(prev, view);
  const sel = state.selected?.kind === 'node' ? state.selected.id : null;
  $('#paper-layer').innerHTML = paper(view, lay);
  $('#road-layer').innerHTML = roads(view, lay);
  $('#head-layer').innerHTML = laneHeads(view, lay, state.sprites);
  $('#node-layer').innerHTML = nodesLayer(view, lay, { fresh, selected: sel });
  pawns.update(view, lay, state.sprites, prev, prevLay);
  if (!state.cam) fitCamera({ whole: false });
  else applyCamera();

  $('#party').innerHTML = renderParty(view, state.sprites, state.selected?.kind === 'char' ? state.selected.id : null);
  $('#log').innerHTML = renderLog(view, prev ? prev.head.seq : -1);
  $('#ledger').innerHTML = renderLedger(view, state.sprites);
  $('#jumon').textContent = view.head?.jumon || '—';
  $('#jumon').dataset.seq = view.head?.seq ?? '';
  const ok = view.integrity?.ok !== false;
  const integ = $('#integrity');
  integ.dataset.ok = String(ok);
  integ.textContent = ok ? 'セーブ正常' : '呪われています';
  integ.title = ok ? 'ハッシュの鎖は正常です' : (view.integrity.errors || []).map((e) => `seq ${e.seq} ${e.code}`).join('\n');
  document.body.classList.toggle('finished', !!view.finished);
  document.title = `${view.finished ? '🏁 ' : ''}${view.quest?.title || 'マスメ'} — マスメ`;
  renderDrawer();
  if (prev) announce(prev, view);
  window.__masume.ready = true;
  window.__masume.view = view;
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
  const news = (view.log || []).filter((e) => e.seq > prev.head.seq);
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

function toast(e) {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = `toast ${e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info'} ${e.type || ''}`;
  el.innerHTML = `<span class="toast-stamp">${e.ok === true ? (e.type === 'gate_cleared' || e.type === 'finish' ? '★' : '◎') : e.ok === false ? '✗' : '✎'}</span><span>${String(e.text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])}</span>`;
  box.appendChild(el);
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
    $('#party').innerHTML = renderParty(state.view, state.sprites, kind === 'char' ? id : null);
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
  const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-masume': '1' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) toast({ text: `できませんでした: ${j.error || r.status}`, ok: false });
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

function showNotice(body) {
  let el = $('#notice');
  if (!el) {
    el = document.createElement('div');
    el.id = 'notice';
    $('#view-board').appendChild(el);
  }
  const code = body?.code || 'E_UNKNOWN';
  const msg = body?.error || '';
  const help =
    code === 'E_CURSED'
      ? '<p>セーブデータ（ハッシュの鎖）が壊れています。<code>masume verify</code> で場所を確かめ、<code>masume repair</code> で直してください。</p>'
      : '<p>このフォルダにはまだ冒険の書がありません。地図から始めましょう:</p><pre>masume new quests/tutorial/tutorial.map.json\nmasume serve</pre><p>「xxxのようなアプリを作りたい」から地図を作る手順は <code>docs/GM_GUIDE.md</code>。</p>';
  el.innerHTML = `<div class="notice-card"><h2>${code === 'E_CURSED' ? '☠ 冒険の書が呪われています' : '冒険の書が見つかりません'}</h2><p class="notice-code">[${code}] ${msg.replace(/[&<>]/g, '')}</p>${help}</div>`;
}
function hideNotice() {
  $('#notice')?.remove();
}

function setLive(mode, text) {
  const el = $('#live');
  el.dataset.mode = mode;
  el.textContent = text;
}

async function startLive() {
  const refresh = async () => {
    try {
      const r = await fetch('api/state', { cache: 'no-store' });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setLive('off', body?.code === 'E_CURSED' ? '冒険の書が呪われています' : '冒険の書が読めません');
        showNotice(body);
        return;
      }
      hideNotice();
      render(body);
    } catch (err) {
      setLive('off', '盤面サーバーに届きません');
      console.warn(err);
    }
  };
  await refresh();
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 120);
  };
  if ('EventSource' in window && !params.has('nostream')) {
    const es = new EventSource('api/stream');
    es.addEventListener('hello', () => setLive('live', 'ライブ'));
    es.addEventListener('change', schedule);
    es.onerror = () => setLive('off', '再接続中…');
  }
  setInterval(refresh, 15000);
}

async function startFixture() {
  setLive('fixture', `見本: ${FIXTURE}`);
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

window.__masume = { ready: false, view: null, frame: 0, done: false, render: (v) => render(v), select, setView };

(async () => {
  setupCamera();
  setupInteractions();
  state.sprites = await loadSprites();
  if (params.get('view')) setView(params.get('view'));
  try {
    if (LIVE) await startLive();
    else await startFixture();
  } catch (err) {
    console.error(err);
    $('#toast').innerHTML = `<div class="toast ng"><span class="toast-stamp">✗</span><span>盤面を読み込めませんでした: ${String(err.message || err)}</span></div>`;
  }
})();
