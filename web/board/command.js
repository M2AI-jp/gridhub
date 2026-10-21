// 第2章のUI: 願いの入口（ロビー）と、出撃の指揮。伝令の窓口（CONTRACTS §15）を使う。
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let ctx = null;
let questTimer = null;
let partyTimer = null;
let party = { running: false, code: null, log: '' };
let openSorties = 0;

/** ctx: { live, post(path, body), refresh(), toast(e), getView() } */
export function initCommand(c) {
  ctx = c;
  // 入口
  const wish = $('#wish');
  const start = $('#start-quest');
  const sync = () => (start.disabled = !wish.value.trim() || wish.value.length > 2000);
  wish.addEventListener('input', sync);
  sync();
  for (const b of document.querySelectorAll('[data-wish-example]'))
    b.addEventListener('click', () => {
      wish.value = b.dataset.wishExample;
      sync();
      wish.focus();
    });
  $('#lobby-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (start.disabled) return;
    const body = { wish: wish.value.trim(), gm: $('#gm').value };
    const model = $('#gm-model').value.trim();
    if (model) body.model = model;
    // 箱のソケット（§34.1）: チェックしたときだけ頼む。GM が codex でなくても、生まれた冒険の party.json に持ち越す
    if ($('#gm-allow-listen').checked) body.allow_listen = true;
    start.disabled = true;
    const j = await ctx.post('api/quest', body);
    if (!j || j.ok === false) {
      start.disabled = false;
      return;
    }
    $('#lobby').dataset.phase = 'brewing';
    pollQuest();
  });

  // 出撃の指揮
  const modal = $('#sortie-modal');
  $('#sortie-open').addEventListener('click', () => {
    if (!ctx.live) return ctx.toast({ text: '見本の盤面なので出撃はできません（gridhub serve で開くと本物のエージェントを出撃させられます）', ok: null });
    fillSortieChoices();
    modal.showModal();
    loadSortieDefaults();
  });
  // 窓を開いたあとで自分で触った欄は、あとから届いた既定値で上書きしない
  for (const id of ['#sortie-agent', '#sortie-parallel', '#sortie-allow-listen', '#sortie-tactic'])
    for (const type of ['input', 'change']) $(id).addEventListener(type, () => (touched[id] = true));
  $('#sortie-agent').addEventListener('change', syncListen);
  $('#sortie-tactic').addEventListener('change', syncTactic);
  syncTactic();
  syncListen();
  $('#sortie-cancel').addEventListener('click', () => modal.close());
  $('#sortie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const boxes = [...document.querySelectorAll('#sortie-modal input[name="sortie-only"]')];
    const chosen = boxes.filter((b) => b.checked).map((b) => b.value);
    if (!chosen.length) return ctx.toast({ text: '出撃させるキャラクターを選んでください', ok: false });
    const body = { agent: $('#sortie-agent').value, parallel: Math.max(1, Math.min(8, Number($('#sortie-parallel').value) || 3)) };
    const model = $('#sortie-model').value.trim();
    if (model) body.model = model;
    if (chosen.length < boxes.length) body.only = chosen;
    // 箱のソケット（§34.2・34.3）: codex のときはチェックの状態を必ず送る。codex でなければ送らない
    if (body.agent === 'codex') body.allow_listen = $('#sortie-allow-listen').checked;
    // 作戦（§50.12）: いつも入れる
    body.tactic = TACTICS.includes($('#sortie-tactic').value) ? $('#sortie-tactic').value : 'balanced';
    $('#sortie-go').disabled = true;
    const j = await ctx.post('api/sortie', body);
    $('#sortie-go').disabled = false;
    if (j && j.ok !== false) {
      modal.close();
      ctx.toast({ text: `パーティが出撃しました（${body.agent}${model ? ' ' + model : ''}・作戦: ${TACTIC_JA[body.tactic]}）`, ok: null, type: 'battle' });
      party.running = true;
      renderPartyStatus();
      pollParty(true);
    }
  });
  $('#party-stop').addEventListener('click', async () => {
    $('#party-stop').disabled = true;
    await ctx.post('api/party/stop', {});
    $('#party-stop').disabled = false;
    pollParty(true);
  });
  renderPartyStatus();
}

// ---- 入口（ロビー） ----

export function showLobby() {
  const lobby = $('#lobby');
  if (!lobby.hidden) return;
  lobby.hidden = false;
  document.body.classList.add('in-lobby');
  if (ctx?.live) pollQuest();
}

export function hideLobby() {
  const lobby = $('#lobby');
  if (lobby.hidden) return;
  lobby.hidden = true;
  lobby.dataset.phase = '';
  document.body.classList.remove('in-lobby');
  clearTimeout(questTimer);
  questTimer = null;
}

async function pollQuest() {
  clearTimeout(questTimer);
  if ($('#lobby').hidden) return;
  try {
    const q = await (await fetch('api/quest', { cache: 'no-store' })).json();
    const box = $('#quest-progress');
    if (q.running || q.log) {
      box.hidden = false;
      $('#quest-log').textContent = (q.log || '').split('\n').slice(-14).join('\n');
      $('#quest-phase').textContent = q.running ? 'GM が地図を描いています…' : q.code === 0 ? '地図ができました' : `GM が地図を描けませんでした（終了コード ${q.code}）`;
      box.dataset.state = q.running ? 'running' : q.code === 0 ? 'done' : 'failed';
      if (!q.running && q.code !== 0 && q.code !== null) $('#start-quest').disabled = !$('#wish').value.trim();
    }
    if (!q.running && q.code === 0) ctx.refresh();
  } catch {}
  questTimer = setTimeout(pollQuest, 1000);
}

// ---- 出撃 ----

const TACTICS = ['careful', 'balanced', 'bold'];
const TACTIC_JA = { careful: 'いのちだいじに', balanced: 'バッチリがんばれ', bold: 'ガンガンいこうぜ' };
let touched = {};
let defaultsSeq = 0;

/** 窓を開くたびに、この冒険の party.json の既定値（allow_listen・agent・parallel）を読む（§34.2） */
async function loadSortieDefaults() {
  touched = {};
  const mine = ++defaultsSeq;
  let p = null;
  try {
    const r = await fetch('api/party', { cache: 'no-store' });
    if (r.ok) p = await r.json();
  } catch {
    p = null;
  }
  if (mine !== defaultsSeq) return; // もっと新しく開き直した
  const listen = $('#sortie-allow-listen');
  if (!touched['#sortie-allow-listen']) listen.checked = p?.allow_listen === true;
  if (p && (p.agent === 'claude' || p.agent === 'codex') && !touched['#sortie-agent']) $('#sortie-agent').value = p.agent;
  if (p && Number.isInteger(p.parallel) && p.parallel >= 1 && p.parallel <= 8 && !touched['#sortie-parallel']) $('#sortie-parallel').value = String(p.parallel);
  // 作戦の既定は party.json の tactic（null・読めなければ balanced）
  if (!touched['#sortie-tactic']) $('#sortie-tactic').value = TACTICS.includes(p?.tactic) ? p.tactic : 'balanced';
  syncTactic();
  syncListen();
}

/** 作戦の説明（選んだ作戦の動き方と止まる条件） */
function syncTactic() {
  const v = $('#sortie-tactic').value;
  for (const el of document.querySelectorAll('[data-tactic-hint]')) el.hidden = el.dataset.tacticHint !== v;
}

/** エージェントが codex でないあいだは、ソケットの切り替えを押せなくする（§34.3） */
function syncListen() {
  const codex = $('#sortie-agent').value === 'codex';
  $('#sortie-allow-listen').disabled = !codex;
  $('#sortie-allow-listen-note').hidden = codex;
}

function fillSortieChoices() {
  const v = ctx.getView();
  const list = $('#sortie-choices');
  const agents = (v?.characters || []).filter((c) => c.kind === 'agent' && c.status === 'working');
  list.innerHTML = agents.length
    ? agents
        .map(
          (c) => `<label class="choice"><input type="checkbox" name="sortie-only" value="${esc(c.id)}" checked>
            <span class="choice-name">${esc(c.name)}</span><span class="choice-at">${esc(c.at || '')} ${esc((c.at && Object.hasOwn(v.nodes, c.at) ? v.nodes[c.at].title : '') || '')}</span>
            ${c.sortie ? '<span class="choice-busy">出撃中</span>' : ''}</label>`,
        )
        .join('')
    : '<p class="hint">いま作業中のエージェントがいません（全員ゲートで待機中か、あがり）。</p>';
  $('#sortie-go').disabled = !agents.length;
}

function renderPartyStatus() {
  const el = $('#party-status');
  el.dataset.running = String(!!party.running);
  const lines = (party.log || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines.slice(-2).join(' / ');
  // 盤面からではなく CLI（gridhub party）や外の指揮役から出撃していることもあるので、冒険の書の「出撃中」も数えて見せる
  const outside = !party.running && openSorties > 0 ? `⏳ 出撃中のエージェント ${openSorties}人` : '';
  $('#party-status-text').textContent = party.running
    ? `⚔ 出撃中… ${lines.slice(-1)[0] || ''}`
    : [last, outside].filter(Boolean).join(' ／ ') || '出撃していません';
  $('#party-stop').hidden = !party.running;
}

/** 出撃中の様子を見張る（本物の盤面だけ） */
export function pollParty(now = false) {
  if (!ctx?.live) return;
  clearTimeout(partyTimer);
  const tick = async () => {
    try {
      const r = await fetch('api/party', { cache: 'no-store' });
      if (r.ok) {
        const p = await r.json();
        const was = party.running;
        party = { running: !!p.running, code: p.code ?? null, log: p.log || '' };
        renderPartyStatus();
        if (was && !party.running) ctx.toast({ text: `パーティが帰ってきました: ${party.log.split('\n').filter(Boolean).slice(-1)[0] || ''}`, ok: party.code === 0 ? true : null });
      }
    } catch {}
    partyTimer = setTimeout(tick, party.running ? 1500 : 5000);
  };
  if (now) tick();
  else partyTimer = setTimeout(tick, 0);
}

/** 盤面が描き直されるたびに、冒険の書の上で出撃中の人数を受け取る */
export function noteSorties(view) {
  const n = (view?.characters || []).filter((c) => c.sortie).length;
  if (n === openSorties) return;
  openSorties = n;
  if ($('#party-status')) renderPartyStatus();
}
