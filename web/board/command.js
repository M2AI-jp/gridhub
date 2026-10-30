// 第2章のUI: 願いの入口（ロビー）と、出撃の指揮。伝令の窓口（CONTRACTS §15）を使う。
const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let ctx = null;
let questTimer = null;
let questRunning = false;
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
    questRunning = true;
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
  $('#git-push')?.addEventListener('click', pushGit);
  $('#git-auto')?.addEventListener('change', setAutoPush);
  refreshGit();
}

// ---- 入口（ロビー） ----

/**
 * 冒険づくり（GM と語り部。GET /api/quest の running）がまだ終わっていない。
 * 冒険の書は、語り部が仕上げる（願いの記録・Git のふりだしのセーブ・party.json）より先に生まれるので、
 * そのあいだは入口のまま待つ（生まれかけの冒険の書で盤面にすると、願いも出撃の既定もまだ無い）
 */
export function questBrewing() {
  return questRunning;
}

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

/** GM のログの、いちばん後ろの `[E_…] …` の行（無ければ最後の行）。見出しに添える理由 */
function lastErrorLine(log) {
  const lines = String(log || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find((l) => /^\[E_[A-Z_]+\]/.test(l));
  return (err ?? lines.at(-1) ?? '').replace(/^\[E_[A-Z_]+\]\s*/, '').slice(0, 160);
}

async function pollQuest() {
  clearTimeout(questTimer);
  if ($('#lobby').hidden) return;
  try {
    const q = await (await fetch('api/quest', { cache: 'no-store' })).json();
    const wasRunning = questRunning;
    questRunning = q.running === true;
    const box = $('#quest-progress');
    if (q.running || q.log) {
      box.hidden = false;
      $('#quest-log').textContent = (q.log || '').split('\n').slice(-14).join('\n');
      const next = q.running ? 'running' : q.code === 0 ? 'done' : 'failed';
      // 失敗したら、見出しに理由（ログの最後の [E_…] の行）を添える。「終了コード 2」だけでは、claude が入っていないのか分からない
      const why = next === 'failed' ? lastErrorLine(q.log) : '';
      $('#quest-phase').textContent = q.running ? 'GM が地図を描いています…' : q.code === 0 ? '地図ができました' : `GM が地図を描けませんでした（終了コード ${q.code}）${why ? `: ${why}` : ''}`;
      if (box.dataset.state !== next) {
        box.dataset.state = next;
        // 様子の欄はカードの下にあるので、変わったときは見える所まで送る
        box.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }
      if (!q.running && q.code !== 0 && q.code !== null) $('#start-quest').disabled = !$('#wish').value.trim();
    }
    // 終わったら読み直す（失敗で終わっても、冒険の書が生まれていれば盤面にする）
    if (!q.running && (q.code === 0 || wasRunning)) ctx.refresh();
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

/** 軍師の出力の行。ターミナル向けの「ハンコは: node …」は盤面では見せない（盤面には「あなたの番！」のボタンがある。§76.32） */
function partyLines() {
  return (party.log || '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('ハンコは:'));
}

function renderPartyStatus() {
  const el = $('#party-status');
  el.dataset.running = String(!!party.running);
  const lines = partyLines();
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
        if (was && !party.running) ctx.toast({ text: `パーティが帰ってきました: ${partyLines().slice(-1)[0] || ''}`, ok: party.code === 0 ? true : null });
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

// ---- GitHub につなぐ導線（§56.4）: 右の欄のセーブの近く。GET /api/git が取れなければ出さない ----

let gitSeq = 0;
let gitPushing = false;
let gitState = null;

/** GET /api/git の様子から、欄の状態（outside / no-remote / unpushed / synced） */
function gitStateOf(g) {
  if (!g || g.inside !== true) return 'outside';
  if (!g.remote) return 'no-remote';
  if (!g.upstream || !(g.ahead === 0)) return 'unpushed';
  return 'synced';
}

/** 欄を読み直す（開いたとき・冒険の書が変わるたび・送ったあと）。見本の盤面では出さない */
export async function refreshGit() {
  const panel = $('#git-panel');
  if (!panel) return;
  if (!ctx?.live) return void (panel.hidden = true);
  const no = ++gitSeq;
  let g = null;
  try {
    const r = await fetch('api/git', { cache: 'no-store' });
    g = r.ok ? await r.json() : null;
  } catch {
    g = null;
  }
  if (no !== gitSeq) return;
  if (!g || typeof g !== 'object' || g.ok === false || typeof g.inside !== 'boolean') return void (panel.hidden = true);
  renderGit(g);
}

function renderGit(g) {
  const panel = $('#git-panel');
  const state = gitStateOf(g);
  gitState = state;
  panel.hidden = false;
  panel.dataset.state = state;
  const steps = Array.isArray(g.steps) ? g.steps.filter((x) => x && typeof x === 'object') : [];
  const guide = $('#git-guide');
  const showGuide = state === 'outside' || state === 'no-remote';
  guide.hidden = !showGuide;
  guide.innerHTML = showGuide
    ? steps
        .map((x) => `<li data-step="${esc(x.id)}" data-done="${x.done === true}"><span class="git-step-mark" aria-hidden="true">${x.done === true ? '✓' : '・'}</span><span class="git-step-text">${esc(x.text)}</span>${x.done !== true && x.command ? `<code>${esc(x.command)}</code>` : ''}</li>`)
        .join('')
    : '';
  $('#git-sub').textContent =
    state === 'outside' ? 'ここはまだ Git の作業ツリーではありません'
    : state === 'no-remote' ? 'GitHub につなぐ手引き（上から順に）'
    : g.branch ? `ブランチ ${g.branch}` : '';
  const remote = $('#git-remote');
  remote.hidden = !g.remote;
  remote.textContent = g.remote ? `${g.remote.name || 'origin'}: ${g.remote.url || ''}` : '';
  const ahead = $('#git-ahead');
  ahead.hidden = !(state === 'unpushed' || state === 'synced');
  ahead.textContent = state === 'synced' ? 'GitHub に送っていないセーブ: 0' : !g.upstream ? 'まだ一度も送っていない' : `GitHub に送っていないセーブ: ${g.ahead}`;
  const btn = $('#git-push');
  btn.hidden = !(state === 'unpushed' || state === 'synced');
  btn.disabled = gitPushing || state !== 'unpushed';
  btn.title = state === 'synced' ? 'GitHub と同じです（送るものはありません）' : '町でセーブしたコミットを GitHub に送る（git push。force push はしない）';
  // 町でセーブしたら GitHub に送る（§59.6）。初めはオフ
  const auto = $('#git-auto');
  auto.closest('label').hidden = state === 'outside';
  if (!gitAutoBusy) auto.checked = g.auto_push === true;
  auto.disabled = gitAutoBusy;
  renderLastPush(ctx.getView?.()?.push ?? null);
}

/** 町でセーブしたあとに GitHub へ送った結果（view.push、§59.6） */
function renderLastPush(push) {
  const last = $('#git-last');
  if (!last) return;
  const valid = push && typeof push === 'object' && typeof push.ok === 'boolean';
  last.hidden = !valid;
  if (!valid) return;
  last.dataset.ok = String(push.ok);
  last.textContent = push.ok
    ? `GitHub に送った（commit ${String(push.commit ?? '').slice(0, 7)}）`
    : `GitHub に送れなかった: ${push.error ?? '不明'}`;
}

let gitAutoBusy = false;
/** 切り替え（POST /api/git/auto）。送り終えたら読み直す */
async function setAutoPush() {
  const auto = $('#git-auto');
  if (gitAutoBusy) return;
  gitAutoBusy = true;
  auto.disabled = true;
  const on = auto.checked;
  const j = await ctx.post('api/git/auto', { auto_push: on });
  if (j && j.ok !== false) ctx.toast({ text: `町でセーブしたら GitHub に送る: ${j.auto_push ? 'オン' : 'オフ'}`, ok: true });
  gitAutoBusy = false;
  await refreshGit();
}

/** 送る（POST /api/git/push）。送っているあいだは押せない。結果は知らせに出し、読み直す */
export async function pushGit() {
  const btn = $('#git-push');
  if (gitPushing || gitState !== 'unpushed') return;
  gitPushing = true;
  btn.disabled = true;
  btn.textContent = '送っています…';
  const j = await ctx.post('api/git/push', {});
  if (j && j.ok !== false) ctx.toast({ text: `GitHub に送った: ${j.remote ?? ''} ${j.branch ?? ''}${j.commit ? `（commit ${String(j.commit).slice(0, 7)}）` : ''}`, ok: true });
  gitPushing = false;
  btn.textContent = 'GitHub に送る';
  await refreshGit();
}
