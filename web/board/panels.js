// 盤面のまわり: なかま一覧・モンスター図鑑・冒険の書（ログ）・マスの詳細（issue）・キャラクターシート・台帳（Linear風）。
// 字はすべて words.js の辞書（冒険のことば / 開発のことば。§75）から取る。1つの文に2つの言い方を並べない。
import { esc, hl, own, byId } from './sketch.js';
import { spriteMarkup, jobJa, monsterMarkup, speciesOf } from './draw.js';
import { marginsOf, marginHappened, marginSource, whoName, newsOf } from './world.js';
import { wordsFor, t, statusJa, charStatusJa, linearJa, marginJa } from './words.js';

export const LINEAR = { cleared: 'Done', current: 'In Progress', waiting: 'In Review', ready: 'In Review', stale: 'Todo', open: 'Todo', fog: 'Backlog' };
const LINEAR_ORDER = ['In Progress', 'In Review', 'Todo', 'Backlog', 'Done'];

function mini(sprites, c, size = 40) {
  return `<svg class="mini" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">${spriteMarkup(sprites, c, 0, 0, size, 'mini')}</svg>`;
}

function agentLabel(c) {
  if (c.kind === 'human') return t('human');
  return c.agent ? c.agent[0].toUpperCase() + c.agent.slice(1) : t('agent');
}

/** いまのマスのテスト（task の上にいて、テストがあれば） */
function testsHere(view, c) {
  const n = c.at ? own(view.nodes, c.at) : null;
  if (!n || !n.tests || !(n.tests.total > 0)) return null;
  return n.tests;
}

export function renderParty(view, sprites, selectedChar, { app = false } = {}) {
  const cards = view.characters
    .map((c) => {
      const node = c.at ? own(view.nodes, c.at) : null;
      const progress = c.path.length ? Math.round((c.pos / c.path.length) * 100) : 0;
      const t_ = testsHere(view, c);
      const gen = Number.isInteger(c.generation) ? c.generation : 1;
      const medals = Number.isInteger(c.medals) ? c.medals : 0;
      const cases = node && Array.isArray(node.cases) ? node.cases : [];
      const fight = c.status === 'working' && node?.check?.kind === 'cmd' ? (!cases.length ? t('party.fight.unknown') : c.square != null && c.square < cases.length ? cases[c.square].name : app ? t('party.fight.all') : t('party.fight.all.cli')) : '';
      const where = c.status !== 'done' && node ? `${c.at} ${node.title}` : '';
      return `<button class="party-card${selectedChar === c.id ? ' selected' : ''}" data-char="${esc(c.id)}"${c.max_level ? ' data-max="true"' : ''} style="--hl:${hl(c.color)}" aria-label="${esc(t('party.sheet.aria', c.name))}">
        ${mini(sprites, c, 40)}
        <span class="pc-body">
          <span class="pc-top"><span class="pc-name">${esc(c.name)}</span><span class="pc-gen" title="${esc(t('party.gen.title'))}">${esc(t('party.gen', gen))}</span></span>
          <span class="pc-meta">${esc(agentLabel(c))}・${esc(jobJa(c.job))}・<b class="lv">Lv${c.level}${c.max_level ? t('party.max') : ''}</b>${medals ? ` <span class="pc-medal" title="${esc(t('party.medal.title'))}">◎${medals}</span>` : ''}${c.strong ? ` <span class="pc-strong" title="${esc(t('party.strong.title'))}">${esc(t('party.strong', c.strong))}</span>` : ''}${c.skills?.length ? ` <span class="pc-skill" title="${esc(t('party.skill.title'))}">${esc(t('party.skill', c.skills.length))}</span>` : ''}</span>
          <span class="pc-where" data-status="${esc(c.status)}">${t_ ? `<b class="pc-tests${t_.pass === t_.total ? ' all' : ''}">テスト ${t_.pass}/${t_.total}</b> ` : ''}${esc(charStatusJa(c.status))}${where ? ` @ ${esc(where)}` : ''}</span>
          ${fight ? `<span class="pc-fight" title="${esc(t('party.fight.title'))}">⚔ ${esc(fight)}</span>` : ''}
          ${c.sortie ? `<span class="pc-sortie">${esc(t('party.sortie', `${c.sortie.agent}${c.sortie.model ? ' ' + c.sortie.model : ''}`))}</span>` : ''}
          <span class="pc-progress" aria-label="${esc(t('party.progress', progress))}"><i style="width:${progress}%"></i></span>
        </span>
      </button>`;
    })
    .join('');
  return `<h2 class="side-title">${esc(t('party.head'))} <small>${esc(t('party.count', view.characters.length))}</small></h2>
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
  return `<div class="track" aria-label="${esc(t('track.aria'))}"><svg viewBox="0 0 ${W} ${h}" width="100%" role="img">${rows}</svg></div>`;
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
  return `<div class="bestiary-head"><span class="bt-title">${esc(t('bestiary.head'))}</span><span class="bt-count"><b>${b.defeated}</b> / ${b.total}</span></div>
    <div class="bt-bar" aria-label="${esc(t('bestiary.meta', b.defeated, b.total, pct))}"><i style="width:${pct}%"></i></div>
    <div class="bt-meta">${esc(t('bestiary.meta', b.defeated, b.total, pct))}${b.revived ? `・<span class="bt-rev">${esc(t('bestiary.revived', b.revived))}</span>` : ''}${b.strong ? `・<span class="bt-strong">${esc(t('bestiary.strong', b.strong))}</span>` : ''}</div>
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
        <span class="le-meta">seq ${e.seq}・${esc(fmtTime(e.ts))}${e.actor ? `・${esc(e.actor)}` : ''}</span>
      </li>`;
    })
    .join('');
  return `<h2 class="side-title">${esc(t('log.head'))} <small>${esc(t('log.count', (view.log || []).length))}</small></h2><ol class="log-list">${items}</ol>`;
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
  if (!n.check) return t('node.check.none');
  if (n.check.kind === 'stamp') {
    const who = view.characters.find((c) => c.id === n.check.by);
    return t('node.check.stamp', who ? who.name : n.check.by);
  }
  return n.check.run;
}

/** テスト1件ずつ（モンスター）の一覧 */
function testList(n) {
  if (!Array.isArray(n.cases) || (n.type !== 'gate' && n.check?.kind !== 'cmd')) return '';
  if (!n.cases.length) return `<h4>${esc(t('node.tests.head'))}</h4><p class="hint">${esc(t('node.tests.unknown'))}</p>`;
  const pass = n.cases.filter((c) => c.ok === true).length;
  const items = n.cases
    .map((c, i) => `<li class="case ${c.ok === true ? 'ok' : c.ok === false ? 'ng' : 'none'}"><span class="case-mark">${c.ok === true ? '✔' : c.ok === false ? '✖' : '・'}</span><span class="case-name">${esc(c.name)}</span>${c.revived ? `<span class="case-tag rev" title="${esc(t('node.case.revived.title'))}">${esc(t('node.case.revived', c.revived))}</span>` : ''}${c.strong ? `<span class="case-tag strong" title="${esc(t('node.case.strong.title'))}">${esc(t('node.case.strong'))}</span>` : ''}${c.losses ? `<small>${esc(t('node.case.losses', c.losses))}</small>` : ''}</li>`)
    .join('');
  return `<h4>テスト ${pass}/${n.cases.length} <small>${esc(t('node.tests.sub'))}</small></h4><ol class="case-list">${items}</ol>`;
}

function relatedLog(view, id) {
  return (view.log || []).filter((e) => e.node === id).slice(-8).reverse();
}

export function renderNodeDrawer(view, id, { live, app = false }) {
  const n = own(view.nodes, id);
  if (!n) return '';
  const words = wordsFor(app);
  const chars = byId(view.characters);
  const people = (n.members || []).map((m) => chars[m]).filter(Boolean);
  const kind = n.type === 'gate' ? (view.quest?.goal === id ? t('node.kind.goal') : t('node.kind.gate')) : n.type === 'camp' ? t('node.kind.camp') : n.check?.kind === 'stamp' ? t('node.kind.king') : t('node.kind.task');
  const status = own(LINEAR, n.state) || 'Backlog';
  const sealTxt = n.type === 'camp' || n.check?.kind === 'stamp' ? '—' : n.seal_broken ? t('node.seal.broken') : n.sealed ? t('node.seal.ok') : t('node.seal.none');
  const owner = n.owner ? chars[n.owner] : null;
  let action = '';
  if (n.check?.kind === 'stamp' && owner && owner.at === id) {
    const by = chars[n.check.by];
    action = `<button class="act stamp" data-stamp="${esc(id)}" data-as="${esc(n.check.by)}">${esc(t('node.stamp.btn', by ? by.name : n.check.by))}</button>
      <p class="hint">${esc(t('node.stamp.hint', n.title))}${live ? '' : esc(t('node.demo.note'))}</p>`;
  }
  if (n.type === 'gate' && n.state === 'ready')
    action = `<button class="act battle" data-battle="${esc(id)}">${esc(t('node.battle.btn'))}</button><p class="hint">${esc(t('node.battle.hint'))} <code>${esc(n.check?.run || '')}</code> を走らせます。</p>`;
  const log = relatedLog(view, id)
    .map((e) => `<li class="${e.ok === true ? 'ok' : e.ok === false ? 'ng' : 'info'}"><span>${esc(e.text)}</span>${live && /check_|gate_/.test(e.type) ? ` <a href="api/output/${e.seq}" target="_blank" rel="noopener">${esc(t('node.output'))}</a>` : ''}<small>seq ${e.seq}</small></li>`)
    .join('');
  return `<div class="drawer-head">
      <span class="issue-id">${esc(id)}</span>
      <span class="status-pill" data-status="${esc(status)}">${esc(status)}・${esc(statusJa(n.state))}</span>
      <button class="close" data-close aria-label="閉じる">✕</button>
    </div>
    <h3 class="issue-title">${esc(n.title)}</h3>
    <p class="issue-kind">${esc(kind)}</p>
    ${n.detail ? `<p class="issue-detail">${esc(words(n.detail))}</p>` : ''}
    ${action}
    <dl class="props">
      <dt>${esc(n.type === 'gate' ? t('node.members') : t('node.owner'))}</dt><dd>${people.map((c) => `<span class="who" style="--hl:${hl(c.color)}">${esc(c.name)}${n.type === 'gate' ? (c.at === id && c.status === 'waiting' ? ' ✓' : c.status === 'done' ? ' ✓' : ' …') : ''}</span>`).join(' ') || '—'}</dd>
      <dt>${esc(t('node.check'))}</dt><dd><code>${esc(checkText(view, n))}</code></dd>
      <dt>${esc(t('node.seal'))}</dt><dd>${esc(sealTxt)}</dd>
      ${n.type === 'task' && n.check?.kind !== 'stamp' ? `<dt>${esc(t('node.rollback'))}</dt><dd>${esc(n.rollback_to === '@here' ? t('node.rollback.here') : n.rollback_to === '@camp' || !n.rollback_to ? t('node.rollback.camp') : t('node.rollback.to', n.rollback_to))}${esc(t('node.rollback.lv'))}</dd>` : ''}
      <dt>${esc(t('node.xp'))}</dt><dd>${n.xp ?? 0}</dd>
      <dt>${esc(t('node.milestone'))}</dt><dd>${esc(milestone(view, id) || '—')}</dd>
      ${n.estimate != null ? `<dt>${esc(t('node.estimate'))}</dt><dd>${esc(n.estimate)}</dd>` : ''}
      ${n.labels?.length ? `<dt>${esc(t('node.labels'))}</dt><dd>${n.labels.map((l) => `<span class="label">${esc(l)}</span>`).join(' ')}</dd>` : ''}
      <dt>${esc(t('node.record'))}</dt><dd>${esc(t('node.record.text', n.clears ?? 0, n.fails ?? 0))}${n.first_try === true ? esc(t('node.record.first')) : n.first_try === false ? esc(t('node.record.notfirst')) : ''}</dd>
      ${n.save?.commit ? `<dt>${esc(t('node.save'))}</dt><dd><code>commit ${esc(String(n.save.commit).slice(0, 7))}</code>（seq ${esc(n.save.seq)}）</dd>` : ''}
    </dl>
    ${testList(n)}
    ${log ? `<h4>${esc(t('node.log.head'))}</h4><ol class="mini-log">${log}</ol>` : ''}`;
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
        <span class="sr-text">${esc(sortie.text)}${ret ? ` → ${esc(ret.text.replace(/^.*が帰還した/, t('sheet.return')))}` : esc(t('sheet.sortie.open'))}</span>
        <small>seq ${sortie.seq}・${esc(fmtTime(sortie.ts))}</small>
        ${ret ? `<a href="api/output/${ret.seq}" target="_blank" rel="noopener">${esc(t('node.output'))}</a>` : ''}
      </li>`,
    )
    .join('');
  return `<h4>${esc(t('sheet.sorties'))} <small>${esc(t('sheet.sorties.count', c.sorties ?? rows.length))}</small></h4><ol class="sortie-list">${items}</ol>`;
}

function skillList(c) {
  if (!Array.isArray(c.skills) || !c.skills.length) return '';
  return `<h4>${esc(t('sheet.skills'))} <small>${esc(t('sheet.skills.sub'))}</small></h4><ol class="skill-list">${c.skills.map((k) => `<li><span class="skill-text">「${esc(k.text)}」</span><small>${esc(k.node || '')}${k.case ? ` ・ ${esc(k.case)}` : ''}</small></li>`).join('')}</ol>`;
}

/** エージェントへの最初の指示（CLI）。アプリの中では「ターミナルでは」に畳む（§74.3） */
function cliHint(c) {
  return `<p class="hint">${t('sheet.cli', esc(c.id))}</p>`;
}

export function renderCharDrawer(view, id, sprites, { live = false, app = false } = {}) {
  const c = view.characters.find((x) => x.id === id);
  if (!c) return '';
  const steps = c.path
    .map((nid) => {
      const n = own(view.nodes, nid);
      const st = n?.state || 'fog';
      const here = c.at === nid;
      return `<li class="step" data-state="${esc(st)}" data-node="${esc(nid)}"${here ? ' aria-current="step"' : ''}><span class="dot"></span><span class="step-id">${esc(nid)}</span><span class="step-title">${esc(n?.title || '')}</span></li>`;
    })
    .join('');
  const visionTxt = c.vision > 0 ? t('sheet.vision.n', c.vision) : t('sheet.vision.0');
  return `<div class="drawer-head">
      <span class="issue-id">${esc(t('sheet.head'))}</span>
      <button class="close" data-close aria-label="閉じる">✕</button>
    </div>
    <div class="sheet-top" style="--hl:${hl(c.color)}">
      ${mini(sprites, c, 88)}
      <div>
        <h3 class="issue-title">${esc(c.name)}</h3>
        <p class="issue-kind">${esc(jobJa(c.job))}・${esc(agentLabel(c))}・ID <code>${esc(c.id)}</code></p>
        <p class="lv">Lv<b>${c.level}</b>${c.max_level ? t('party.max') : ` <span class="xp">経験値 ${c.xp}/${c.xp_next}</span>`}</p>
      </div>
    </div>
    ${live && c.status !== 'done' ? `<button class="act hand-open" type="button" data-hand="${esc(c.id)}">${esc(t('sheet.hand'))}</button>
    <p class="hint">${esc(t('sheet.hand.hint'))}</p>` : ''}
    <dl class="props">
      <dt>${esc(t('sheet.module'))}</dt><dd>${esc(c.module || '—')}</dd>
      <dt>${esc(t('sheet.at'))}</dt><dd>${c.at ? `${esc(c.at)} ${esc(own(view.nodes, c.at)?.title || '')}` : esc(t('sheet.done'))}（${esc(charStatusJa(c.status))}）</dd>
      <dt>${esc(t('sheet.vision'))}</dt><dd>${esc(visionTxt)}</dd>
      <dt>${esc(t('sheet.checkpoint'))}</dt><dd>${esc(c.checkpoint ? `${c.checkpoint} ${own(view.nodes, c.checkpoint)?.title || ''}` : t('sheet.start'))}</dd>
      <dt>${esc(t('sheet.territory'))}</dt><dd>${(c.territory || []).map((x) => `<code>${esc(x)}</code>`).join(' ') || '—'}</dd>
      <dt>${esc(t('sheet.results'))}</dt><dd>${esc(t('sheet.results.text', c.clears, c.fails))}${c.medals ? esc(t('sheet.medals', c.medals)) : ''}${c.strong ? esc(t('sheet.strong', c.strong)) : ''}${c.revived ? esc(t('sheet.revived', c.revived)) : ''}${c.treasures ? esc(t('sheet.treasures', c.treasures)) : ''}${c.traps ? esc(t('sheet.traps', c.traps)) : ''}</dd>
      <dt>${esc(t('sheet.gen'))}</dt><dd>${esc(t('sheet.gen.text', c.generation ?? 1))}</dd>
      ${c.save?.commit ? `<dt>${esc(t('sheet.lastsave'))}</dt><dd><code>commit ${esc(String(c.save.commit).slice(0, 7))}</code>（${esc(c.save.node ?? t('sheet.start'))}）</dd>` : ''}
      ${c.grave?.stash ? `<dt>${esc(t('sheet.grave'))}</dt><dd><code>git stash apply ${esc(c.grave.stash)}</code></dd>` : ''}
      ${c.last_note ? `<dt>${esc(t('sheet.note'))}</dt><dd class="note">「${esc(c.last_note)}」</dd>` : ''}
    </dl>
    ${sortieRows(view, c)}
    ${skillList(c)}
    ${app ? `<details class="cli"><summary>${esc(t('sheet.terminal'))}</summary>${cliHint(c)}</details>` : cliHint(c)}
    <h4>${esc(t('sheet.path'))}</h4>
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
          <td class="title">${n.type === 'gate' ? `<span class="gate-tag">${esc(t('ledger.gate'))}</span>` : ''}${esc(n.title)}${n.state === 'stale' ? ` <span class="label warn">${esc(t('ledger.stale'))}</span>` : ''}${n.seal_broken ? ` <span class="label warn">${esc(t('ledger.broken'))}</span>` : ''}</td>
          <td class="ms">${esc(milestone(view, id))}</td>
          <td class="assignees">${people.map((c) => `<span class="avatar" title="${esc(c.name)}" style="--hl:${hl(c.color)}">${mini(sprites, c, 22)}</span>`).join('')}</td>
          <td class="est">${n.estimate ?? ''}</td>
        </tr>`;
      })
      .join('');
  const sections = LINEAR_ORDER.filter((s) => groups[s].length)
    .map(
      (s) => `<tbody class="group" data-group="${esc(s)}">
        <tr class="group-head"><th colspan="6"><svg viewBox="0 0 14 14" width="14" height="14" class="st-icon" data-status="${esc(s)}">${STATUS_ICON[s]}</svg> ${esc(s)} <span class="ja">${esc(linearJa(s))}</span> <span class="count">${groups[s].length}</span></th></tr>
        ${rows(groups[s])}
      </tbody>`,
    )
    .join('');
  return `<div class="ledger-head">
      <h2>${esc(t('ledger.head'))} <small>${esc(t('ledger.sub'))}</small></h2>
      <p>${esc(t('ledger.lead'))}</p>
    </div>
    <table class="ledger"><thead><tr><th></th><th>${esc(t('ledger.id'))}</th><th>${esc(t('ledger.title'))}</th><th>${esc(t('ledger.milestone'))}</th><th>${esc(t('ledger.assignee'))}</th><th>${esc(t('ledger.estimate'))}</th></tr></thead>${sections}</table>`;
}

/** 余白のマスの詳細（§53）: 会話の全文と、出典の seq・commit */
export function renderMarginDrawer(view, id) {
  const m = marginsOf(view).find((x) => x.id === id);
  if (!m) return '';
  const chars = byId(view.characters);
  const road = chars[m.road];
  const after = own(view.nodes, m.after);
  const seen = marginHappened(m);
  const kind = marginJa(m.kind);
  const lines = m.lines
    .filter((l) => l.text)
    .map((l) => {
      const c = l.who != null ? chars[l.who] : null;
      const name = whoName(view, l.who);
      return `<li class="mg-line-row">${name ? `<span class="who" style="--hl:${hl(c ? c.color : 'gray')}">${esc(name)}</span>` : ''}<span class="mg-say-text">${esc(m.kind === 'news' ? l.text : `「${l.text}」`)}</span></li>`;
    })
    .join('');
  const src = marginSource(m);
  return `<div class="drawer-head">
      <span class="issue-id">${esc(kind)}</span>
      <span class="status-pill" data-status="${seen ? 'Done' : 'Backlog'}">${esc(seen ? t('margin.seen') : t('margin.unseen'))}</span>
      <button class="close" data-close aria-label="閉じる">✕</button>
    </div>
    <h3 class="issue-title">${esc(m.title || kind)}</h3>
    <p class="issue-kind">${esc(t('margin.lead', road?.name || m.road, `${m.after}${after?.title ? `「${after.title}」` : ''}`))}</p>
    ${seen ? (lines ? `<ol class="mg-lines">${lines}</ol>` : '') : `<p class="hint">${esc(t('margin.hint'))}</p>`}
    <dl class="props">
      <dt>${esc(t('margin.source'))}</dt><dd>${src ? `<code>${esc(src)}</code>` : '—'}</dd>
    </dl>`;
}

/** 瓦版（§53.6）: view.news を出てきた順に。domain は作っている製品の分野の話題、extra は冒険の書から来た号外 */
export function renderNews(view) {
  const list = newsOf(view);
  if (!list.length) return '';
  // 並びは view.news のまま（§54.3: エンジンが号外と製品の話題を交互に並べるので、上のほうに両方が見える）
  const rows = list
    .map((n) => `<li class="news-item${n.kind === 'extra' ? ' extra' : ''}" data-kind="${esc(n.kind)}">${esc(n.text)}${n.seq != null ? `<small class="news-seq">seq ${esc(n.seq)}</small>` : ''}</li>`)
    .join('');
  return `<h2 class="news-head"><span class="news-mast">${esc(t('news.head'))}</span><small>${esc(t('news.sub'))}</small></h2><ol class="news-list">${rows}</ol>`;
}
