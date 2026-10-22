// 盤面のまわり: なかま一覧・モンスター図鑑・冒険の書（ログ）・マスの詳細（issue）・キャラクターシート・台帳（Linear風）。
import { esc, hl, own, byId } from './sketch.js';
import { spriteMarkup, jobJa, STATUS_JA, monsterMarkup, speciesOf } from './draw.js';

export const LINEAR = { cleared: 'Done', current: 'In Progress', waiting: 'In Review', ready: 'In Review', stale: 'Todo', open: 'Todo', fog: 'Backlog' };
const LINEAR_JA = { 'In Progress': '進行中', 'In Review': '結合待ち', Todo: 'これから', Backlog: '霧の中', Done: '完了' };
const LINEAR_ORDER = ['In Progress', 'In Review', 'Todo', 'Backlog', 'Done'];

const CHAR_STATUS = { working: '作業中', waiting: '待機中', done: 'あがり' };

function mini(sprites, c, size = 40) {
  return `<svg class="mini" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${spriteMarkup(sprites, c, 0, 0, size, 'mini')}</svg>`;
}

function agentLabel(c) {
  if (c.kind === 'human') return '人間';
  return c.agent ? c.agent[0].toUpperCase() + c.agent.slice(1) : 'エージェント';
}

/** いまのマスのテスト（task の上にいて、テストがあれば） */
function testsHere(view, c) {
  const n = c.at ? own(view.nodes, c.at) : null;
  if (!n || !n.tests || !(n.tests.total > 0)) return null;
  return n.tests;
}

export function renderParty(view, sprites, selectedChar) {
  const cards = view.characters
    .map((c) => {
      const node = c.at ? own(view.nodes, c.at) : null;
      const progress = c.path.length ? Math.round((c.pos / c.path.length) * 100) : 0;
      const t = testsHere(view, c);
      const gen = Number.isInteger(c.generation) ? c.generation : 1;
      const medals = Number.isInteger(c.medals) ? c.medals : 0;
      const cases = node && Array.isArray(node.cases) ? node.cases : [];
      const fight = c.status === 'working' && node?.check?.kind === 'cmd' ? (!cases.length ? '？ まだ走らせていない' : c.square != null && c.square < cases.length ? cases[c.square].name : '全部倒した → gridhub check') : '';
      const where = c.status !== 'done' && node ? `${c.at} ${node.title}` : '';
      return `<button class="party-card${selectedChar === c.id ? ' selected' : ''}" data-char="${esc(c.id)}" style="--hl:${hl(c.color)}" aria-label="${esc(c.name)}のキャラクターシートを開く">
        ${mini(sprites, c, 40)}
        <span class="pc-body">
          <span class="pc-top"><span class="pc-name">${esc(c.name)}</span><span class="pc-gen">${gen}代目</span></span>
          <span class="pc-meta">${esc(agentLabel(c))}・${esc(jobJa(c.job))}・<b>Lv${c.level}</b>${medals ? ` <span class="pc-medal" title="ちいさなメダル（一発で出口を抜けた）">◎${medals}</span>` : ''}${c.strong ? ` <span class="pc-strong" title="強敵を倒した">強${c.strong}</span>` : ''}${c.skills?.length ? ` <span class="pc-skill" title="技（先代から受け継いだもの）">技${c.skills.length}</span>` : ''}</span>
          <span class="pc-where" data-status="${esc(c.status)}">${t ? `<b class="pc-tests${t.pass === t.total ? ' all' : ''}">テスト ${t.pass}/${t.total}</b> ` : ''}${esc(own(CHAR_STATUS, c.status) || c.status)}${where ? ` @ ${esc(where)}` : ''}</span>
          ${fight ? `<span class="pc-fight" title="いま戦うテスト">⚔ ${esc(fight)}</span>` : ''}
          ${c.sortie ? `<span class="pc-sortie">⏳ 出撃中（${esc(c.sortie.agent)}${c.sortie.model ? ' ' + esc(c.sortie.model) : ''}）</span>` : ''}
          <span class="pc-progress" aria-label="道のり ${progress}%"><i style="width:${progress}%"></i></span>
        </span>
      </button>`;
    })
    .join('');
  return `<h2 class="side-title">なかま <small>${view.characters.length}人</small></h2>
    ${renderTrack(view)}
    <div class="party-list">${cards}</div>`;
}

/** すごろくの帯: キャラごとの道のり（マス1つ = 点1つ）。進み具合のばらつきがひと目で分かる */
function renderTrack(view) {
  const W = 268;
  const L = 58;
  const rowH = 19;
  const goal = view.quest?.goal;
  let rows = '';
  view.characters.forEach((c, i) => {
    const n = c.path.length;
    if (!n) return;
    const y = 12 + i * rowH;
    const step = (W - L - 14) / Math.max(1, n - 1);
    const xOf = (k) => L + k * step;
    const pos = Math.min(c.pos, n);
    const color = hl(c.color);
    let dots = `<path d="M${L} ${y} H${xOf(n - 1)}" class="tr-line"/>`;
    dots += `<path d="M${L} ${y} H${xOf(Math.min(pos, n - 1))}" class="tr-done" stroke="${color}"/>`;
    c.path.forEach((id, k) => {
      const node = own(view.nodes, id);
      const x = xOf(k);
      const cls = k < pos ? 'done' : 'todo';
      if (node?.type === 'gate') dots += `<rect x="${(x - 3.5).toFixed(1)}" y="${y - 3.5}" width="7" height="7" class="tr-gate ${id === goal ? 'goal' : ''} ${cls}"><title>${esc(id)} ${esc(node.title)}</title></rect>`;
      else dots += `<circle cx="${x.toFixed(1)}" cy="${y}" r="${node?.type === 'camp' ? 2.2 : 2.8}" class="tr-dot ${cls}${node?.type === 'camp' ? ' camp' : ''}"><title>${esc(id)} ${esc(node?.title || '')}</title></circle>`;
    });
    const px = pos >= n ? xOf(n - 1) : xOf(pos);
    dots += `<circle cx="${px.toFixed(1)}" cy="${y}" r="6" fill="${color}" class="tr-me"/>`;
    const name = [...c.name].slice(0, 4).join('');
    rows += `<g class="tr-row" data-char="${esc(c.id)}"><text x="4" y="${y + 4}" class="tr-name">${esc(name)}</text>${dots}</g>`;
  });
  const h = 12 + view.characters.length * rowH;
  return `<div class="track" aria-label="道のり（すごろくの帯）"><svg viewBox="0 0 ${W} ${h}" width="100%" role="img">${rows}</svg></div>`;
}

/** モンスター図鑑（§42 の bestiary。無ければ cases から数える） */
export function renderBestiary(view, monsters) {
  let b = view.bestiary;
  if (!b || !Number.isInteger(b.total)) {
    const all = Object.values(view.nodes).flatMap((n) => (Array.isArray(n.cases) ? n.cases : []));
    b = { total: all.length, defeated: all.filter((x) => x.ok === true).length, revived: all.reduce((s, x) => s + (x.revived || 0), 0), strong: all.filter((x) => x.strong).length };
  }
  const pct = b.total ? Math.round((b.defeated / b.total) * 100) : 0;
  const shown = ['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem'].map((sp, i) => monsterMarkup(monsters, sp, 4 + i * 26, 2, 24, i < Math.round((pct / 100) * 6) ? '#ffffff' : '#e8ecf3', '')).join('');
  return `<div class="bestiary-head"><span class="bt-title">モンスター図鑑</span><span class="bt-count"><b>${b.defeated}</b> / ${b.total}</span></div>
    <div class="bt-bar" aria-label="倒したテスト ${b.defeated}/${b.total}"><i style="width:${pct}%"></i></div>
    <div class="bt-meta">倒したテスト ${b.defeated}/${b.total}（${pct}%）${b.revived ? `・<span class="bt-rev">復活 ${b.revived}</span>` : ''}${b.strong ? `・<span class="bt-strong">強敵 ${b.strong}</span>` : ''}</div>
    <svg class="bt-art" viewBox="0 0 160 28" aria-hidden="true">${shown}</svg>`;
}

function fmtTime(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const MARK = { check_passed: '◎', gate_cleared: '★', stamped: '印', check_failed: '✗', gate_failed: '✗', seal_broken: '!', sealed: '封', note: '✎', genesis: '✦', amended: '✐', loaded: '↺', stepped: '⚔', saved: '⌂', restored: '↩', sortie: '📯', returned: '↵' };

export function renderLog(view, freshSeq = -1) {
  const items = [...(view.log || [])]
    .reverse()
    .slice(0, 80)
    .map((e) => {
      const cls = e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info';
      return `<li class="log-entry ${cls}${e.seq > freshSeq && freshSeq >= 0 ? ' fresh' : ''}" data-seq="${e.seq}" data-type="${esc(e.type)}"${e.node ? ` data-node="${esc(e.node)}"` : ''}>
        <span class="le-mark">${own(MARK, e.type) || '・'}</span>
        <span class="le-text">${esc(e.text)}</span>
        <span class="le-meta">#${e.seq}・${esc(fmtTime(e.ts))}${e.actor ? `・${esc(e.actor)}` : ''}</span>
      </li>`;
    })
    .join('');
  return `<h2 class="side-title">冒険の書 <small>${(view.log || []).length}件</small></h2><ol class="log-list">${items}</ol>`;
}

function milestone(view, id) {
  const n = own(view.nodes, id);
  if (!n) return '';
  if (n.type === 'gate') return n.title;
  const owner = view.characters.find((c) => c.id === n.owner);
  if (!owner) return '';
  const i = owner.path.indexOf(id);
  for (let k = i; k < owner.path.length; k++) if (own(view.nodes, owner.path[k])?.type === 'gate') return own(view.nodes, owner.path[k]).title;
  return '';
}

function checkText(view, n) {
  if (!n.check) return '（判定なし：着いたら休んで通過）';
  if (n.check.kind === 'stamp') {
    const who = view.characters.find((c) => c.id === n.check.by);
    return `${who ? who.name : n.check.by} のハンコ`;
  }
  return n.check.run;
}

/** テスト1件ずつ（モンスター）の一覧 */
function testList(n) {
  if (!Array.isArray(n.cases) || (n.type !== 'gate' && n.check?.kind !== 'cmd')) return '';
  if (!n.cases.length) return `<h4>テスト（モンスター）</h4><p class="hint">まだ一度も判定を走らせていません。中の分からないダンジョン（？のマス）です。</p>`;
  const pass = n.cases.filter((c) => c.ok === true).length;
  const items = n.cases
    .map((c, i) => `<li class="case ${c.ok === true ? 'ok' : c.ok === false ? 'ng' : 'none'}"><span class="case-mark">${c.ok === true ? '✔' : c.ok === false ? '✖' : '・'}</span><span class="case-name">${esc(c.name)}</span>${c.revived ? `<span class="case-tag rev" title="一度通ったあとで落ちた（リグレッション）">復活${c.revived}</span>` : ''}${c.strong ? '<span class="case-tag strong" title="2回以上負けてから倒した">強敵</span>' : ''}${c.losses ? `<small>負け ${c.losses}</small>` : ''}</li>`)
    .join('');
  return `<h4>テスト ${pass}/${n.cases.length} <small>1件 = 1マス = 1体のモンスター</small></h4><ol class="case-list">${items}</ol>`;
}

function relatedLog(view, id) {
  return (view.log || []).filter((e) => e.node === id).slice(-8).reverse();
}

export function renderNodeDrawer(view, id, { live }) {
  const n = own(view.nodes, id);
  if (!n) return '';
  const chars = byId(view.characters);
  const people = (n.members || []).map((m) => chars[m]).filter(Boolean);
  const kind = n.type === 'gate' ? (view.quest?.goal === id ? '魔王の城（章のあがり・結合テスト）' : '中ボスの砦（結合テスト）') : n.type === 'camp' ? '町（セーブ = git commit）' : n.check?.kind === 'stamp' ? '王様の城（人間のハンコ）' : 'ダンジョン（タスク）。出口で宣言判定';
  const status = own(LINEAR, n.state) || 'Backlog';
  const sealTxt = n.type === 'camp' || n.check?.kind === 'stamp' ? '—' : n.seal_broken ? '封印が破れています（GMが再封印するか、元に戻す）' : n.sealed ? '封印済み' : '未封印（GMの封印待ち）';
  const owner = n.owner ? chars[n.owner] : null;
  let action = '';
  if (n.check?.kind === 'stamp' && owner && owner.at === id) {
    const by = chars[n.check.by];
    action = `<button class="act stamp" data-stamp="${esc(id)}" data-as="${esc(n.check.by)}">${esc(by ? by.name : n.check.by)}のハンコを押す</button>
      <p class="hint">押すと「${esc(n.title)}」が突破になり、次のマスへ進みます。${live ? '' : '（見本の盤面なので記録はされません）'}</p>`;
  }
  if (n.type === 'gate' && n.state === 'ready')
    action = `<button class="act battle" data-battle="${esc(id)}">ボス戦を始める</button><p class="hint">結合E2E <code>${esc(n.check?.run || '')}</code> を走らせます。</p>`;
  const log = relatedLog(view, id)
    .map((e) => `<li class="${e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info'}"><span>${esc(e.text)}</span>${live && /check_|gate_/.test(e.type) ? ` <a href="api/output/${e.seq}" target="_blank" rel="noopener">出力</a>` : ''}<small>#${e.seq}</small></li>`)
    .join('');
  return `<div class="drawer-head">
      <span class="issue-id">${esc(id)}</span>
      <span class="status-pill" data-status="${esc(status)}">${esc(status)}・${esc(own(STATUS_JA, n.state) || n.state)}</span>
      <button class="close" data-close aria-label="閉じる">✕</button>
    </div>
    <h3 class="issue-title">${esc(n.title)}</h3>
    <p class="issue-kind">${esc(kind)}</p>
    ${n.detail ? `<p class="issue-detail">${esc(n.detail)}</p>` : ''}
    ${action}
    <dl class="props">
      <dt>${n.type === 'gate' ? 'メンバー' : '担当'}</dt><dd>${people.map((c) => `<span class="who" style="--hl:${hl(c.color)}">${esc(c.name)}${n.type === 'gate' ? (c.at === id && c.status === 'waiting' ? ' ✓' : c.status === 'done' ? ' ✓' : ' …') : ''}</span>`).join(' ') || '—'}</dd>
      <dt>判定</dt><dd><code>${esc(checkText(view, n))}</code></dd>
      <dt>封印</dt><dd>${esc(sealTxt)}</dd>
      ${n.type === 'task' && n.check?.kind !== 'stamp' ? `<dt>失敗したら</dt><dd>${esc(n.rollback_to === '@here' ? 'このマスでやり直し' : n.rollback_to === '@camp' || !n.rollback_to ? '直前のセーブポイントの次まで戻る' : `${n.rollback_to} まで戻る`)}（Lv−1）</dd>` : ''}
      <dt>経験値</dt><dd>${n.xp ?? 0}</dd>
      <dt>マイルストーン</dt><dd>${esc(milestone(view, id) || '—')}</dd>
      ${n.estimate != null ? `<dt>見積もり</dt><dd>${esc(n.estimate)}</dd>` : ''}
      ${n.labels?.length ? `<dt>ラベル</dt><dd>${n.labels.map((l) => `<span class="label">${esc(l)}</span>`).join(' ')}</dd>` : ''}
      <dt>記録</dt><dd>突破 ${n.clears ?? 0} 回・失敗 ${n.fails ?? 0} 回${n.first_try === true ? '・一発で抜けた ◎' : n.first_try === false ? '・最初の宣言は失敗' : ''}</dd>
      ${n.save?.commit ? `<dt>セーブ</dt><dd><code>commit ${esc(String(n.save.commit).slice(0, 7))}</code>（seq ${esc(n.save.seq)}）</dd>` : ''}
    </dl>
    ${testList(n)}
    ${log ? `<h4>このマスの記録</h4><ol class="mini-log">${log}</ol>` : ''}`;
}

/** 出撃の記録: 出撃1回につき1行。帰還があれば、その出力へのリンク */
function sortieRows(view, c) {
  const mine = (view.log || []).filter((e) => e.character === c.id && (e.type === 'sortie' || e.type === 'returned'));
  const rows = [];
  for (const e of mine) {
    if (e.type === 'sortie') rows.push({ sortie: e, ret: null });
    else if (rows.length && !rows[rows.length - 1].ret) rows[rows.length - 1].ret = e;
  }
  if (!rows.length && !c.sorties) return '';
  const items = rows
    .reverse()
    .map(
      ({ sortie, ret }) => `<li class="sortie-row ${ret ? (ret.ok ? 'ok' : 'ng') : 'open'}">
        <span class="sr-text">${esc(sortie.text)}${ret ? ` → ${esc(ret.text.replace(/^.*が帰還した/, '帰還'))}` : ' → 出撃中…'}</span>
        <small>#${sortie.seq}・${esc(fmtTime(sortie.ts))}</small>
        ${ret ? `<a href="api/output/${ret.seq}" target="_blank" rel="noopener">出力</a>` : ''}
      </li>`,
    )
    .join('');
  return `<h4>出撃の記録 <small>${c.sorties ?? rows.length}回</small></h4><ol class="sortie-list">${items}</ol>`;
}

function skillList(c) {
  if (!Array.isArray(c.skills) || !c.skills.length) return '';
  return `<h4>技（閃き） <small>先代から受け継いだもの</small></h4><ol class="skill-list">${c.skills.map((k) => `<li><span class="skill-text">「${esc(k.text)}」</span><small>${esc(k.node || '')}${k.case ? ` ・ ${esc(k.case)}` : ''}</small></li>`).join('')}</ol>`;
}

export function renderCharDrawer(view, id, sprites) {
  const c = view.characters.find((x) => x.id === id);
  if (!c) return '';
  const steps = c.path
    .map((nid, i) => {
      const n = own(view.nodes, nid);
      const st = n?.state || 'fog';
      const here = c.at === nid;
      return `<li class="step" data-state="${esc(st)}" data-node="${esc(nid)}"${here ? ' aria-current="step"' : ''}><span class="dot"></span><span class="step-id">${esc(nid)}</span><span class="step-title">${esc(n?.title || '')}</span></li>`;
    })
    .join('');
  const visionTxt = c.vision > 0 ? `${c.vision}マス先まで` : '現在のマスだけ';
  return `<div class="drawer-head">
      <span class="issue-id">キャラクターシート</span>
      <button class="close" data-close aria-label="閉じる">✕</button>
    </div>
    <div class="sheet-top" style="--hl:${hl(c.color)}">
      ${mini(sprites, c, 88)}
      <div>
        <h3 class="issue-title">${esc(c.name)}</h3>
        <p class="issue-kind">${esc(jobJa(c.job))}・${esc(agentLabel(c))}・ID <code>${esc(c.id)}</code></p>
        <p class="lv">Lv<b>${c.level}</b> <span class="xp">経験値 ${c.xp}/${c.xp_next}</span></p>
      </div>
    </div>
    <dl class="props">
      <dt>担当モジュール</dt><dd>${esc(c.module || '—')}</dd>
      <dt>いまの場所</dt><dd>${c.at ? `${esc(c.at)} ${esc(own(view.nodes, c.at)?.title || '')}` : 'あがり'}（${esc(own(CHAR_STATUS, c.status) || c.status)}）</dd>
      <dt>視界</dt><dd>${visionTxt}</dd>
      <dt>セーブポイント</dt><dd>${esc(c.checkpoint ? `${c.checkpoint} ${own(view.nodes, c.checkpoint)?.title || ''}` : 'ふりだし')}</dd>
      <dt>縄張り</dt><dd>${(c.territory || []).map((t) => `<code>${esc(t)}</code>`).join(' ') || '—'}</dd>
      <dt>戦績</dt><dd>突破 ${c.clears} ・ 失敗 ${c.fails}${c.medals ? ` ・ メダル ◎${c.medals}` : ''}${c.strong ? ` ・ 強敵 ${c.strong}` : ''}${c.revived ? ` ・ 復活 ${c.revived}` : ''}${c.treasures ? ` ・ 宝箱 ${c.treasures}` : ''}${c.traps ? ` ・ 罠 ${c.traps}` : ''}</dd>
      <dt>代</dt><dd>${esc(c.generation ?? 1)}代目（出撃1回が1代。技と日誌を受け継ぐ）</dd>
      ${c.save?.commit ? `<dt>最後のセーブ</dt><dd><code>commit ${esc(String(c.save.commit).slice(0, 7))}</code>（${esc(c.save.node ?? 'ふりだし')}）</dd>` : ''}
      ${c.grave?.stash ? `<dt>墓</dt><dd><code>git stash apply ${esc(c.grave.stash)}</code></dd>` : ''}
      ${c.last_note ? `<dt>日誌</dt><dd class="note">「${esc(c.last_note)}」</dd>` : ''}
    </dl>
    ${sortieRows(view, c)}
    ${skillList(c)}
    <p class="hint">このキャラクターを動かすエージェントへの最初の指示: <code>gridhub brief ${esc(c.id)}</code> を読んで、いちばん手前の落ちているテストだけを通し、<code>gridhub step ${esc(c.id)}</code> で歩く（何度でも）。全部倒したら <code>gridhub check ${esc(c.id)}</code> で宣言（一発勝負）。</p>
    <h4>道のり</h4>
    <ol class="steps">${steps}</ol>`;
}

const STATUS_ICON = {
  Backlog: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-dasharray="2 2"/>',
  Todo: '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  'In Progress': '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 1.5 A5.5 5.5 0 0 1 7 12.5 Z" fill="currentColor"/>',
  'In Review': '<circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M7 1.5 A5.5 5.5 0 1 1 1.5 7 L7 7 Z" fill="currentColor"/>',
  Done: '<circle cx="7" cy="7" r="6" fill="currentColor"/><path d="M4 7.2 L6.2 9.3 L10 5" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
};

export function renderLedger(view, sprites) {
  const chars = byId(view.characters);
  const groups = Object.fromEntries(LINEAR_ORDER.map((s) => [s, []]));
  for (const [id, n] of Object.entries(view.nodes)) {
    if (n.type === 'camp') continue;
    groups[own(LINEAR, n.state) || 'Backlog'].push([id, n]);
  }
  const rows = (list) =>
    list
      .map(([id, n]) => {
        const people = (n.members || []).map((m) => chars[m]).filter(Boolean);
        const status = own(LINEAR, n.state) || 'Backlog';
        return `<tr data-node="${esc(id)}" data-status="${esc(status)}" tabindex="0">
          <td class="st"><svg viewBox="0 0 14 14" width="14" height="14" class="st-icon" data-status="${esc(status)}">${STATUS_ICON[status]}</svg></td>
          <td class="id">${esc(id)}</td>
          <td class="title">${n.type === 'gate' ? '<span class="gate-tag">結合</span>' : ''}${esc(n.title)}${n.state === 'stale' ? ' <span class="label warn">要再検証</span>' : ''}${n.seal_broken ? ' <span class="label warn">封印破れ</span>' : ''}</td>
          <td class="ms">${esc(milestone(view, id))}</td>
          <td class="assignees">${people.map((c) => `<span class="avatar" title="${esc(c.name)}" style="--hl:${hl(c.color)}">${mini(sprites, c, 22)}</span>`).join('')}</td>
          <td class="est">${n.estimate ?? ''}</td>
        </tr>`;
      })
      .join('');
  const sections = LINEAR_ORDER.filter((s) => groups[s].length)
    .map(
      (s) => `<tbody class="group" data-group="${esc(s)}">
        <tr class="group-head"><th colspan="6"><svg viewBox="0 0 14 14" width="14" height="14" class="st-icon" data-status="${esc(s)}">${STATUS_ICON[s]}</svg> ${esc(s)} <span class="ja">${esc(LINEAR_JA[s])}</span> <span class="count">${groups[s].length}</span></th></tr>
        ${rows(groups[s])}
      </tbody>`,
    )
    .join('');
  return `<div class="ledger-head">
      <h2>台帳 <small>Linear でいうと、こう見える</small></h2>
      <p>マスの状態は、そのまま Linear のステータスになります（<code>masume export linear</code> で書き出せます）。行をクリックすると盤面のマスを開きます。</p>
    </div>
    <table class="ledger"><thead><tr><th></th><th>ID</th><th>タイトル</th><th>マイルストーン（次のゲート）</th><th>担当</th><th>見積</th></tr></thead>${sections}</table>`;
}
