// 勇者の手帳（CONTRACTS §79）: 遊ぶ人の積み上げ。手帳のタブ・勇者のカード・シール袋を開ける部屋・おかえりのカード・お祝い。
// 中身はすべてサーバーの GET /api/hero（冒険の書から導いたもの）。書くのは、シール袋を開けた・知らせを閉じた、の2つだけ。
// 字はすべてテキストとして入れる（冒険の書から来た字を HTML として解釈しない）。
import { U, PAGE, pageOrigin } from './world.js';

const $ = (sel) => document.querySelector(sel);
const NS = 'http://www.w3.org/2000/svg';
const escAttr = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const RARITY_RANK = { normal: 0, kira: 1, holo: 2, gold: 3 };
// シールの地の色（道のモンスターは盤面と同じ色の、少し濃いもの）
const TINT = { slime: '#8fd0ff', bat: '#cdb6ff', mushroom: '#ffb3c6', ghost: '#e9ecff', snake: '#a9e39a', golem: '#e6cf9f', dragon: '#9fe6c2', maou: '#c9b3ff' };
const ICON_IDS = ['map', 'inn', 'potion', 'crown', 'flag', 'lantern', 'sword', 'scroll', 'chest', 'bell', 'shield'];
// ちいさなメダル（アイコンに無いので、ここで描く）
const MEDAL = `<g fill="none" stroke="#1d2b5c" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 6L28 26M42 6L36 26" stroke="#d94a3a" stroke-width="5"/><path d="M22 6L28 26M42 6L36 26"/><circle cx="32" cy="40" r="15" fill="var(--pawn, #ffd84a)"/><circle cx="32" cy="40" r="10" fill="none"/><path d="M32 33L34 38L39 38L35 41L36.5 46L32 43L27.5 46L29 41L25 38L30 38Z" fill="#fff6c7"/></g>`;

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'style') node.setAttribute('style', v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c !== null && c !== undefined && c !== false) node.append(c instanceof Node ? c : String(c));
  return node;
}

function svgUse(id, cls = '') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 64 64');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  const u = document.createElementNS(NS, 'use');
  u.setAttribute('href', `#hs-${id}`);
  s.append(u);
  return s;
}

const symbolOf = (f) => (f.kind === 'item' ? f.item : f.species);
const localTime = (ts) => {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/** 手元の時刻の日付（YYYY-MM-DD） */
const localYmd = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** シール1枚（手帳・開ける部屋・お祝いで同じ形） */
export function stickerEl(f, { count = null, fresh = false, big = false } = {}) {
  const sym = symbolOf(f);
  const card = el('div', {
    class: `sticker r-${f.rarity}${big ? ' big' : ''}`,
    'data-kind': f.kind, 'data-slot': f.slot,
    style: `--tint:${TINT[f.species] ?? '#fff6c7'}`,
    title: `${f.name}（${f.rarity_ja}）`,
  });
  card.append(el('span', { class: 'st-face' }, svgUse(sym, 'st-art'), el('span', { class: 'st-shine', 'aria-hidden': 'true' })));
  card.append(el('span', { class: 'st-name', text: f.name }));
  card.append(el('span', { class: 'st-rar', text: f.rarity_ja }));
  if (count !== null && count > 1) card.append(el('span', { class: 'st-count', text: `×${count}` }));
  if (fresh) card.append(el('span', { class: 'st-new', text: 'NEW' }));
  return card;
}

/**
 * 次のボス戦（§79.23）: まだ突破していない結合ゲート・魔王の城のうち、仲間が全員そろうまでに倒すテストがいちばん少ないもの。
 * { id, title, goal, left, stamps, arrived, members }。残っていなければ null
 */
export function nextBoss(view) {
  if (!view?.nodes || !Array.isArray(view.characters) || view.finished) return null;
  const byId = new Map(view.characters.map((c) => [c.id, c]));
  let best = null;
  for (const n of Object.values(view.nodes)) {
    if (n.type !== 'gate' || n.state === 'cleared' || !Array.isArray(n.members) || !n.members.length) continue;
    let left = 0;
    let stamps = 0;
    let arrived = 0;
    let reachable = true;
    for (const id of n.members) {
      const c = byId.get(id);
      if (!c || !Array.isArray(c.path)) {
        reachable = false;
        break;
      }
      if (c.at === n.id) {
        arrived++;
        continue;
      }
      const end = c.path.indexOf(n.id);
      if (end < 0 || end < c.pos) {
        reachable = false;
        break;
      }
      for (let i = Math.max(0, c.pos); i < end; i++) {
        const t = view.nodes[c.path[i]];
        if (!t || t.type !== 'task' || t.state === 'cleared') continue;
        if (t.check?.kind === 'stamp') {
          stamps++; // ハンコはモンスターではない
          continue;
        }
        const cases = Array.isArray(t.cases) ? t.cases : [];
        left += cases.length ? cases.filter((x) => x.ok !== true).length : 1;
      }
    }
    if (!reachable) continue;
    const cand = { id: n.id, title: n.title ?? n.id, goal: view.quest?.goal === n.id, left, stamps, arrived, members: n.members.length };
    if (!best || cand.left + cand.stamps < best.left + best.stamps || (cand.left + cand.stamps === best.left + best.stamps && cand.arrived > best.arrived)) best = cand;
  }
  return best;
}

export function initHero({ live, post, toast, sound, setView, monsters = {}, board = null, getView = () => null }) {
  let journal = null;
  let available = false;
  let welcomed = false;
  let timer = null;
  const prevBagIds = new Set();

  // ---- シールの絵（hidden の SVG に symbol を並べる） ----
  async function defs() {
    if ($('#hero-defs')) return;
    const holder = document.createElementNS(NS, 'svg');
    holder.id = 'hero-defs';
    holder.setAttribute('aria-hidden', 'true');
    holder.setAttribute('width', '0');
    holder.setAttribute('height', '0');
    holder.style.position = 'absolute';
    let inner = '';
    for (const [id, body] of Object.entries(monsters)) {
      if (typeof body === 'string') inner += `<symbol id="hs-${id}" viewBox="0 0 64 64" overflow="visible">${body}</symbol>`;
    }
    const icons = await Promise.all(ICON_IDS.map(async (id) => {
      try {
        const r = await fetch(`assets/icons/${id}.svg`);
        const m = r.ok ? (await r.text()).match(/<svg[^>]*>([\s\S]*)<\/svg>/) : null;
        return m ? `<symbol id="hs-${id}" viewBox="0 0 64 64" overflow="visible">${m[1].replace(/<title>[\s\S]*?<\/title>/, '').replace(/<desc>[\s\S]*?<\/desc>/, '')}</symbol>` : '';
      } catch {
        return '';
      }
    }));
    inner += icons.join('') + `<symbol id="hs-medal" viewBox="0 0 64 64" overflow="visible">${MEDAL}</symbol>`;
    holder.innerHTML = inner;
    document.body.prepend(holder);
  }

  // ---- 読み込み ----
  // 読み込み（GET）と操作（POST）は、出した順の番号を持つ。後から出したものの手帳を描いたあとに、
  // 先に出したものの手帳が届いても描かない（古い手帳で描き直さない）
  let ticket = 0;
  let appliedTicket = 0;
  async function fetchHero() {
    if (!live) return null;
    try {
      const r = await fetch('api/hero', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j && j.ok && j.hero === 1 ? j : null;
    } catch {
      return null;
    }
  }

  async function refresh({ celebrate = true } = {}) {
    const t = ++ticket;
    const next = await fetchHero();
    if (!next) return;
    const before = journal;
    if (!apply(next, t)) return;
    if (before && celebrate) celebrateDiff(before, next);
  }

  /** 番号つきで POST し、届いた手帳を描く（もっと新しい手帳を描いていれば描かない） */
  async function postHero(path, body) {
    const t = ++ticket;
    const j = await post(path, body);
    return { j, t };
  }

  // Mac のアプリの中（§79.14）: Dock に未開封の数を出し、窓が後ろのときの大きな出来事は Dock で知らせる
  const tell = (message) => {
    try {
      window.webkit?.messageHandlers?.gridhub?.postMessage(message);
    } catch {
      // アプリの外・橋が無い
    }
  };
  function attention() {
    if (document.hidden || !document.hasFocus()) tell({ type: 'attention' });
  }

  function apply(next, t = ++ticket) {
    if (t < appliedTicket) return false;
    appliedTicket = t;
    journal = next;
    tell({ type: 'badge', count: next.bags.count });
    if (!available) {
      available = true;
      document.body.classList.add('has-hero');
      $('#techo-tab').hidden = false;
      $('#hero-card').hidden = false;
    }
    renderCard();
    renderBadge();
    renderPasted();
    renderEndingLoot();
    renderMvp();
    document.documentElement.dataset.notebook = next.theme ?? 'note';
    if (document.body.dataset.view === 'techo') renderTecho();
    else $('#techo').dataset.stale = '1';
    window.__masume.heroSvg = () => cardSvg();
    window.__masume.hero = { rank: next.rank.level, bags: next.bags.count, album: next.album.owned, achievements: next.achievements.filter((a) => a.done).length };
    return true;
  }

  // ---- 見出しのタブのシール袋の数 ----
  function renderBadge() {
    const badge = $('#bag-badge');
    const n = journal.bags.count;
    badge.hidden = n === 0;
    badge.textContent = n > 999 ? '999+' : String(n);
    badge.title = `未開封のシール袋 ${n}`;
  }
  function bumpBadge() {
    const badge = $('#bag-badge');
    badge.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
  }

  // ---- 今週のMVP（§79.21）: なかまのカードに「今週のMVP」の札（並べ直されても消えないよう、CSS で付ける） ----
  function renderMvp() {
    let style = document.querySelector('#mvp-style');
    if (!style) {
      style = document.createElement('style');
      style.id = 'mvp-style';
      document.head.append(style);
    }
    const top = journal.current?.mvp?.[0];
    const id = top && /^[a-z][a-z0-9-]*$/u.test(top.id) ? top.id : null;
    style.textContent = id ? [
      `.party-card[data-char="${id}"]::after { content: '今週のMVP ${top.n}体'; }`,
      `.tr-row[data-char="${id}"] .tr-name { fill: #a16207; font-weight: 700; }`,
      `.pawn[data-char="${id}"] .pawn-body { filter: drop-shadow(0 0 3px #f5c542) drop-shadow(0 0 6px rgba(245, 197, 66, 0.8)); }`,
    ].join('\n') : '';
    window.__masume.mvp = id;
  }

  // ---- エンディングの戦利品（§79.15）: 章をあがったら、勇者のランクと、開けられるシール袋 ----
  function renderEndingLoot() {
    const box = $('#ending-loot');
    if (!box) return;
    const { rank, bags } = journal;
    box.replaceChildren(...[
      el('span', { class: 'el-rank' }, el('small', { text: '勇者ランク' }), el('b', { text: rank.level }), el('span', { text: `「${rank.title}」` })),
      el('span', { class: 'el-bags', text: bags.count ? `未開封のシール袋 ${bags.count}` : 'シール袋はぜんぶ開けた' }),
      bags.count ? el('button', { type: 'button', class: 'mini-btn el-open', 'data-hero': 'bags-from-ending', text: 'シール袋をあける' }) : null,
    ].filter(Boolean));
    box.hidden = false;
  }

  /** 出撃中の戦果（§79.27）: だれかが出撃しているあいだ、いちばん新しい出撃のあとに倒したテストの数 */
  function sortieLine() {
    const view = getView();
    const out = (view?.characters ?? []).filter((c) => c.sortie);
    const s = journal.current?.sortie;
    if (!out.length || !s) return null;
    const min = Math.max(0, Math.round((Date.now() - new Date(s.ts).getTime()) / 60000));
    return el('div', { class: 'hc-sortie', role: 'status' },
      el('span', { class: 'hc-live', text: '出撃中' }),
      el('b', { text: `${s.defeats}体撃破` }),
      el('small', { text: `${s.clears ? `ダンジョン ${s.clears}・` : ''}${min}分・${out.map((c) => c.name).join('、')}` }));
  }

  // ---- なかまの欄の上の、勇者のカード ----
  function renderCard() {
    const { rank, streak, daily, bags } = journal;
    const card = $('#hero-card');
    const pct = Math.round((rank.into / rank.need) * 100);
    const dailyDone = daily.missions.filter((m) => m.done).length;
    card.replaceChildren(...[
      el('div', { class: 'hc-top' },
        el('span', { class: 'hc-rank', title: `勇者ランク ${rank.level}` }, el('small', { text: 'ランク' }), el('b', { text: rank.level })),
        el('span', { class: 'hc-title' }, el('b', { text: `${rank.title}${journal.epithet ? `「${journal.epithet.name}」` : ''}` }), el('small', { text: `経験値 ${rank.xp}・次まで ${rank.next - rank.xp}` })),
        el('span', { class: `hc-streak${streak.today ? ' lit' : ''}`, title: streak.today ? `${streak.current}日つづけてテストを倒した` : '今日はまだ。1件倒すとスタンプが押せる' },
          el('b', { text: streak.current }), el('small', { text: '日連続' }))),
      el('div', { class: 'hc-xp', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': rank.need, 'aria-valuenow': rank.into, 'aria-label': '次のランクまで' }, el('i', { style: `width:${pct}%` })),
      el('div', { class: 'hc-row' },
        el('button', { type: 'button', class: 'hc-daily', 'data-hero': 'techo', title: daily.missions.map((m) => `${m.done ? '☑' : '☐'} ${m.text} ${m.now}/${m.goal}`).join('\n') },
          el('span', { text: 'お題' }), el('span', { class: 'hc-dots' }, ...daily.missions.map((m) => el('i', { class: m.done ? 'on' : '' }))), el('b', { text: `${dailyDone}/3` })),
        el('button', { type: 'button', class: `hc-bags${bags.count ? ' has' : ''}`, 'data-hero': 'bags', disabled: bags.count === 0 },
          el('span', { class: 'hc-bag-icon', 'aria-hidden': 'true' }), el('span', { text: bags.count ? `シール袋 ${bags.count}` : 'シール袋 0' }))),
      sortieLine(),
      journal.next_achievement ? el('button', { type: 'button', class: 'hc-next', 'data-hero': 'techo', title: journal.next_achievement.desc },
        el('span', { text: '次の称号' }), el('b', { text: journal.next_achievement.name }),
        el('span', { class: 'hc-next-bar' }, el('i', { style: `width:${Math.round((journal.next_achievement.now / journal.next_achievement.goal) * 100)}%` })),
        el('small', { text: `${journal.next_achievement.now}/${journal.next_achievement.goal}` })) : null,
    ].filter(Boolean));
  }

  // ---- 手帳のタブ ----
  function renderTecho() {
    const root = $('#techo');
    delete root.dataset.stale;
    if (!journal) return;
    const { rank, totals, streak, daily, album, achievements, bags } = journal;
    const done = achievements.filter((a) => a.done).length;
    const pct = Math.round((rank.into / rank.need) * 100);

    const profile = el('section', { class: 'tc-card tc-profile' },
      el('h2', { class: 'tc-h' }, '冒険者カード'),
      el('div', { class: 'tc-rankline' },
        el('div', { class: 'tc-rankbadge' }, el('small', { text: '勇者ランク' }), el('b', { text: rank.level })),
        el('div', { class: 'tc-rankname' }, el('b', { text: rank.title }), journal.epithet ? el('em', { class: 'tc-epithet', text: `「${journal.epithet.name}」を名乗っている` }) : el('em', { class: 'tc-epithet none', text: '称号の「名乗る」で、名前に添えられる' }), el('span', { text: `経験値 ${rank.xp}（次のランクまで ${rank.next - rank.xp}）` }),
          el('div', { class: 'hc-xp big' }, el('i', { style: `width:${pct}%` })))),
      el('dl', { class: 'tc-stats' },
        ...[['倒したテスト', totals.defeats], ['ダンジョン', totals.clears], ['結合ゲート', totals.gates], ['あがり', totals.goals], ['メダル', totals.medals], ['技', totals.skills], ['出撃', totals.sorties], ['冒険', totals.quests]]
          .map(([k, v]) => el('div', {}, el('dt', { text: k }), el('dd', { text: v })))),
      el('div', { class: 'tc-share' },
        el('button', { type: 'button', class: 'mini-btn', 'data-hero': 'card-copy', text: 'カードを画像でコピー' }),
        el('button', { type: 'button', class: 'mini-btn', 'data-hero': 'card-save', text: '画像で保存' })),
      el('p', { class: 'tc-note', text: '手帳は冒険をまたいで残ります。中身はすべて冒険の書（ハッシュの鎖）から導いたもの。シールのレア度も、そのテストを倒したときの記録のハッシュで決まります。' }));

    const missions = el('section', { class: `tc-card tc-daily${daily.done ? ' done' : ''}` },
      el('h2', { class: 'tc-h' }, '今日のお題', el('small', { text: daily.date })),
      el('ul', { class: 'tc-missions' }, ...daily.missions.map((m) => el('li', { class: m.done ? 'done' : '' },
        el('span', { class: 'tc-check', 'aria-hidden': 'true', text: m.done ? '✔' : '' }),
        el('span', { class: 'tc-mtext', text: m.text }),
        el('span', { class: 'tc-mnum', text: `${m.now}/${m.goal}` })))),
      el('p', { class: 'tc-reward' }, daily.done ? 'ぜんぶこなした！ お題のランタンを手に入れた' : `3つこなすと「${daily.reward}」のシールと経験値 ${daily.xp}。お題は毎日かわります。`));

    const stampCard = renderStampCard(streak, journal.calendar, journal.today);
    const week = renderWeek(journal.calendar, journal.today);
    const best = renderRecords(journal.records);
    const themes = journal.themes ? el('section', { class: 'tc-card tc-themes' },
      el('h2', { class: 'tc-h' }, 'ノートの模様', el('small', { text: '勇者ランクで増える' })),
      el('div', { class: 'th-grid' }, ...journal.themes.map((t) => el('button', {
        type: 'button', class: `th-swatch${t.id === journal.theme ? ' on' : ''}${t.unlocked ? '' : ' locked'}`, 'data-hero': 'theme', 'data-id': t.id, 'data-notebook': t.id, disabled: !t.unlocked,
        title: t.unlocked ? t.name : `勇者ランク ${t.rank} で使える`,
      }, el('span', { class: 'th-paper', 'aria-hidden': 'true' }), el('b', { text: t.name }), el('small', { text: t.unlocked ? (t.id === journal.theme ? '使っている' : '使う') : `ランク ${t.rank}` }))))) : null;
    const mvp = journal.current?.mvp?.length ? el('section', { class: 'tc-card tc-mvp' },
      el('h2', { class: 'tc-h' }, '今週のMVP', el('small', { text: 'この7日・この冒険' })),
      el('ol', {}, ...journal.current.mvp.slice(0, 5).map((m, i) => el('li', { class: i === 0 ? 'top' : '' }, el('span', { class: 'mvp-rank', text: i === 0 ? '👑' : `${i + 1}` }), el('b', { text: m.name }), el('span', { text: `${m.n}体` }))))) : null;

    const albumSec = el('section', { class: 'tc-card tc-album' },
      el('h2', { class: 'tc-h' }, 'シール帳', el('small', { text: `${album.owned}/${album.total}` })),
      el('div', { class: 'tc-album-head' },
        el('div', { class: 'bt-bar' }, el('i', { style: `width:${Math.round((album.owned / album.total) * 100)}%` })),
        el('button', { type: 'button', class: 'act tc-open', 'data-hero': 'bags', disabled: bags.count === 0, text: bags.count ? `シール袋をあける（${bags.count}）` : 'シール袋はありません' })),
      el('p', { class: 'tc-note', text: `シールを押すと、どのテストを倒して手に入れたかが出ます。「ノートに貼る」で、この冒険のノートの好きな所に貼れます（貼ったシール ${journal.current?.pasted?.length ?? 0}枚。貼ったシールを押すと、はがせます）。` }),
      ...albumGroups(album.slots));

    const titles = el('section', { class: 'tc-card tc-titles' },
      el('h2', { class: 'tc-h' }, '称号', el('small', { text: `${done}/${achievements.length}` })),
      el('ul', { class: 'tc-ach' }, ...[...achievements].sort((a, b) => Number(b.done) - Number(a.done) || b.now / b.goal - a.now / a.goal).map((a) => el('li', { class: a.done ? 'done' : '', title: a.at ? `${localTime(a.at)} に手に入れた` : '' },
        el('span', { class: 'ach-medal', 'aria-hidden': 'true', text: a.done ? '★' : '☆' }),
        el('span', { class: 'ach-body' }, el('b', { text: a.name }), el('small', { text: a.desc }),
          a.done ? null : el('span', { class: 'ach-bar' }, el('i', { style: `width:${Math.round((a.now / a.goal) * 100)}%` }), el('em', { text: `${a.now}/${a.goal}` }))),
        a.done ? el('button', { type: 'button', class: `ach-wear${journal.epithet?.id === a.id ? ' on' : ''}`, 'data-hero': 'title', 'data-id': journal.epithet?.id === a.id ? '' : a.id, text: journal.epithet?.id === a.id ? '名乗っている' : '名乗る' }) : null))));

    const quests = journal.quests.length > 1 ? el('section', { class: 'tc-card tc-quests' },
      el('h2', { class: 'tc-h' }, 'これまでの冒険', el('small', { text: `${journal.quests.length}` })),
      el('ul', {}, ...journal.quests.map((q) => el('li', {}, el('b', { text: q.title }), el('small', { text: `${q.name}・テスト ${q.defeats}${q.finished ? '・あがり' : ''}` }))))) : null;

    const guide = el('details', { class: 'tc-guide', open: journal.totals.opened === 0 ? true : null },
      el('summary', { text: '手帳の遊び方' }),
      el('ol', {},
        el('li', { text: 'テストが1件通るたびに、シール袋が1つ落ちます（エージェントが倒しても、あなたが手で倒しても）。' }),
        el('li', { text: '「シール袋をあける」で開けると、シール帳に貼られます。キラ・ホロ・金は記録のハッシュで決まっています。' }),
        el('li', { text: '同じシールが6枚たまったら、シールを押して「交換所」へ。1列そろえると経験値 +200。' }),
        el('li', { text: 'シールを押して「ノートに貼る」で、盤面の好きな所に貼れます。' }),
        el('li', { text: '毎日1件でも倒すとスタンプカードにハンコ。今日のお題を3つこなすと、お題のランタン。' })));
    root.replaceChildren(guide, el('div', { class: 'tc-cols' },
      el('div', { class: 'tc-col' }, profile, missions, week, mvp, best, themes, stampCard, quests),
      el('div', { class: 'tc-col wide' }, albumSec, titles)));
  }

  /** 自己ベスト（§79.17） */
  function renderRecords(r) {
    if (!r) return null;
    const md = (date) => (date ? `${Number(date.slice(5, 7))}/${Number(date.slice(8))}` : '');
    const row = (label, value, sub, hot = false) => el('div', { class: `rc-row${hot ? ' hot' : ''}` }, el('span', { text: label }), el('b', { text: value }), el('small', { text: sub }));
    const beat = r.day.before && r.day.today > r.day.before.n;
    return el('section', { class: 'tc-card tc-records' },
      el('h2', { class: 'tc-h' }, '自己ベスト'),
      row('1日に倒したテスト', r.day.best ? `${r.day.best.n}件` : '—', r.day.best ? `${md(r.day.best.date)}${beat ? '（今日、更新！）' : `・今日 ${r.day.today}件`}` : '', beat),
      row('1回の判定でまとめて', r.combo.best ? `${r.combo.best}体` : '—', r.combo.at ? md(localYmd(r.combo.at)) : ''),
      row('続けた日数', `${r.streak}日`, 'スタンプカード'),
      row('1日のメダル', `${r.medals}枚`, '一発で抜けたダンジョン'));
  }

  /** 今週のふりかえり: この7日に倒したテストの数（棒）と、その前の7日とくらべて */
  function renderWeek(calendar, today) {
    const days = calendar.slice(-7);
    const before = calendar.slice(-14, -7);
    const sum = days.reduce((a, d) => a + d.n, 0);
    const prev = before.reduce((a, d) => a + d.n, 0);
    const max = Math.max(1, ...days.map((d) => d.n));
    const best = days.reduce((a, d) => (d.n > a.n ? d : a), days[0]);
    const youbi = (date) => '日月火水木金土'[new Date(`${date}T00:00:00`).getDay()];
    const diff = sum - prev;
    return el('section', { class: 'tc-card tc-week' },
      el('h2', { class: 'tc-h' }, '今週のふりかえり', el('small', { text: `テスト ${sum}件` })),
      el('div', { class: 'wk-bars', role: 'img', 'aria-label': days.map((d) => `${d.date} ${d.n}件`).join('、') },
        ...days.map((d) => el('div', { class: `wk-day${d.date === today ? ' today' : ''}` },
          el('span', { class: 'wk-n', text: d.n || '' }),
          el('i', { style: `height:${Math.round((d.n / max) * 100)}%` }),
          el('small', { text: youbi(d.date) })))),
      el('p', { class: 'tc-note', text: sum === 0 ? 'この7日はまだ。1件倒すと、スタンプカードにハンコが押せます。'
        : `その前の7日（${prev}件）より ${diff >= 0 ? `+${diff}` : diff}件。いちばん倒したのは ${Number(best.date.slice(5, 7))}/${Number(best.date.slice(8))}（${best.n}件）。` }));
  }

  /** ラジオ体操のスタンプカード（この5週）。テストを倒した日にハンコ */
  function renderStampCard(streak, calendar, today) {
    const days = calendar.slice(-35);
    const first = new Date(`${days[0].date}T00:00:00`);
    const pad = (first.getDay() + 6) % 7; // 月曜はじまり
    const cells = [];
    for (let i = 0; i < pad; i++) cells.push(el('span', { class: 'sc-cell blank' }));
    for (const d of days) {
      const dd = Number(d.date.slice(8));
      cells.push(el('span', { class: `sc-cell${d.played ? ' stamped' : ''}${d.date === today ? ' today' : ''}${d.daily ? ' daily' : ''}`, title: `${d.date}${d.played ? `・テスト ${d.n}` : ''}${d.daily ? '・お題クリア' : ''}` },
        el('small', { text: dd === 1 || d === days[0] ? `${Number(d.date.slice(5, 7))}/${dd}` : dd }),
        d.played ? el('i', { class: 'sc-hanko', 'aria-hidden': 'true', text: d.daily ? '花' : '済' }) : null));
    }
    return el('section', { class: 'tc-card tc-stamps' },
      el('h2', { class: 'tc-h' }, 'スタンプカード', el('small', { text: streak.today ? `${streak.current}日つづけて` : streak.current ? `${streak.current}日つづけて（今日はまだ）` : '今日から' })),
      el('div', { class: 'sc-week' }, ...['月', '火', '水', '木', '金', '土', '日'].map((w) => el('span', { text: w }))),
      el('div', { class: 'sc-grid' }, ...cells),
      el('p', { class: 'tc-note', text: `テストを1件でも倒した日にハンコ。お題をこなした日は花まる。いちばん長く続いたのは ${streak.best}日。3・7・14・30日で「皆勤の鐘」のシール。` }));
  }

  function groupHead(label, id) {
    const set = journal.album.sets?.find((x) => x.id === id);
    return el('h3', {}, label, set ? el('small', { class: 'al-setcount', text: ` ${set.owned}/${set.total}` }) : null, set?.done ? el('i', { class: 'al-comp', text: 'コンプ' }) : null);
  }

  function albumGroups(slots) {
    const slotButton = (s) => {
      if (!s.count) {
        return el('button', { type: 'button', class: `al-slot empty r-${s.rarity}`, 'data-slot': s.slot, title: `${s.name}（${s.rarity_ja}）: ${s.how}` },
          svgUse(symbolOf(s), 'al-ghost'), el('span', { class: 'al-q', text: '？' }), el('small', { text: s.rarity_ja }));
      }
      const b = el('button', { type: 'button', class: `al-slot${s.trade?.can ? ' tradable' : ''}`, 'data-slot': s.slot, title: `${s.name}（${s.rarity_ja}）×${s.count}${s.trade?.can ? '・交換所で換えられる' : ''}` });
      b.append(stickerEl(s, { count: s.count }));
      if (s.trade?.can) b.append(el('span', { class: 'al-trade', text: '交換' }));
      return b;
    };
    // 道のモンスターは、種類ごとに1行（ノーマル・キラ・ホロ・金）
    const monsters = slots.filter((s) => s.kind === 'monster');
    const species = [...new Set(monsters.map((s) => s.species))];
    const table = el('div', { class: 'al-table' },
      el('span', { class: 'al-corner' }), ...['ノーマル', 'キラ', 'ホロ', '金'].map((r) => el('span', { class: 'al-colhead', text: r })),
      ...species.flatMap((sp) => {
        const row = monsters.filter((s) => s.species === sp);
        const owned = row.filter((s) => s.count).length;
        return [el('span', { class: `al-rowhead${owned === 4 ? ' comp' : ''}` }, el('b', { text: row[0].name }), el('small', { text: `${owned}/4` }), owned === 4 ? el('i', { class: 'al-comp', text: 'コンプ' }) : null), ...row.map(slotButton)];
      }));
    return [
      el('div', { class: 'al-group' }, el('h3', { text: `道のモンスター（テスト1件。種類はテストの名前で決まる）。1列そろえると経験値 +${journal.album.set_xp}` }), table),
      el('div', { class: 'al-group' }, groupHead('ボス（結合ゲート・魔王の城）', 'boss'), el('div', { class: 'al-grid' }, ...slots.filter((s) => s.kind === 'boss' || s.kind === 'maou').map(slotButton))),
      el('div', { class: 'al-group' }, groupHead('出来事（開発の節目）', 'items'), el('div', { class: 'al-grid' }, ...slots.filter((s) => s.kind === 'item').map(slotButton))),
    ];
  }

  function slotDetail(slotId) {
    const s = journal?.album.slots.find((x) => x.slot === slotId);
    if (!s) return;
    const pop = $('#slot-pop');
    const body = [el('h3', { text: `${s.name}（${s.rarity_ja}）` }), s.lore ? el('p', { class: 'sp-lore', text: s.lore }) : null, el('p', { class: 'sp-how', text: `手に入れ方: ${s.how}` })].filter(Boolean);
    if (s.count) {
      body.unshift(stickerEl(s, { big: true }));
      body.push(el('p', { text: `持っている数: ${s.count}` }));
      const line = (label, f) => el('p', { class: 'sp-src' }, el('b', { text: label }), ` ${f.what}${f.where ? ` — ${f.where}` : ''}${f.who ? `（${f.who}）` : ''}`, el('small', { text: ` ${localTime(f.ts)}${f.seq !== null ? `・seq ${f.seq}` : ''}${f.title ? `・${f.title}` : ''}` }));
      body.push(line('はじめて:', s.first));
      if (s.count > 1) body.push(line('いちばん新しい:', s.last));
      if (s.trade) {
        body.push(el('button', { type: 'button', class: 'act sp-trade', 'data-hero': 'trade', 'data-slot': s.slot, disabled: !s.trade.can,
          text: `交換所: ${s.trade.n}枚 →「${s.trade.to_rarity_ja}」1枚`, title: s.trade.can ? '' : `貼っていないものが ${s.trade.n + s.trade.keep}枚要ります（いま ${s.free}枚。1枚はシール帳に残ります）` }));
      }
      if (journal.current) {
        body.push(el('button', { type: 'button', class: 'act sp-paste', 'data-hero': 'paste', 'data-slot': s.slot, disabled: s.free < 1,
          text: s.free > 0 ? `ノートに貼る（のこり ${s.free}）` : `ぜんぶ貼ってある（${s.pasted}枚）` }));
      }
    } else body.unshift(el('div', { class: 'sp-ghost' }, svgUse(symbolOf(s))));
    body.push(el('button', { type: 'button', class: 'mini-btn', 'data-hero': 'pop-close', text: '閉じる' }));
    pop.replaceChildren(el('div', { class: 'sp-card' }, ...body));
    pop.hidden = false;
  }

  // ---- シール袋を開ける部屋 ----
  let opening = false;
  function openRoom() {
    if (!journal) return;
    const room = $('#bag-room');
    room.hidden = false;
    room.dataset.state = 'idle';
    $('#bag-reveal').replaceChildren();
    $('#bag-sum').replaceChildren();
    renderRoom();
    $('#bag-one').focus();
  }
  function closeRoom() {
    $('#bag-room').hidden = true;
  }
  function renderRoom() {
    const n = journal.bags.count;
    $('#bag-count').textContent = String(n);
    $('#bag-one').disabled = n === 0 || opening;
    $('#bag-one').hidden = n === 0;
    $('#bag-ten').disabled = n < 2 || opening;
    $('#bag-ten').hidden = n < 2;
    $('#bag-ten').textContent = `${Math.min(10, Math.max(n, 2))}枚まとめて`;
    $('#bag-all').disabled = n < 11 || opening;
    $('#bag-all').hidden = n < 11;
    $('#bag-all').textContent = `ぜんぶ（${n}）`;
    const pile = $('#bag-pile');
    pile.replaceChildren(...Array.from({ length: Math.min(n, 5) }, (_, i) => el('span', { class: 'bag', style: `--i:${i}` }, el('span', { class: 'bag-label', text: 'シール' }))));
    pile.dataset.empty = String(n === 0);
  }

  async function openBags(count) {
    if (opening || !journal?.bags.count) return;
    opening = true;
    renderRoom();
    const { j, t } = await postHero('api/hero/open', { count });
    if (!j?.ok) {
      opening = false;
      renderRoom();
      return;
    }
    const opened = Array.isArray(j.opened) ? j.opened : [];
    await reveal(opened);
    // 開けたことで手に入ったもの（キラ・金・シール帳の称号、列のコンプ、ランク）だけを祝う
    const was = journal;
    if (apply(j.journal, t)) celebrateCollection(was, journal);
    opening = false;
    renderRoom();
    // 押していたボタンにフォーカスを戻す（Enter を押し続けて、次々に開けられる）
    const again = count === 1 ? $('#bag-one') : count <= 10 ? $('#bag-ten') : $('#bag-one');
    if (!again.disabled) again.focus();
  }

  /** 袋をゆらす（いちばん良いシールの色で光る）→ やぶる → めくる。前にめくったシールは片づけて、毎回袋から */
  async function reveal(opened, { label = null } = {}) {
    const room = $('#bag-room');
    const best = opened.reduce((m, f) => Math.max(m, RARITY_RANK[f.rarity] ?? 0), 0);
    const tease = ['normal', 'kira', 'holo', 'gold'][best];
    $('#bag-reveal').replaceChildren();
    $('#bag-sum').replaceChildren();
    room.dataset.state = 'shake';
    room.dataset.tease = tease;
    sound.play('rip');
    await wait(reduced() ? 50 : 650);
    room.dataset.state = 'reveal';
    const box = $('#bag-reveal');
    const show = opened.length > 24 ? [...opened].sort((a, b) => (RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity]) || Number(b.new) - Number(a.new)).slice(0, 24) : opened;
    box.dataset.many = String(show.length > 1);
    box.replaceChildren(...show.map((f, i) => {
      const wrap = el('div', { class: 'reveal-card', style: `--d:${reduced() ? 0 : i * (show.length > 10 ? 70 : 160)}ms` });
      wrap.append(stickerEl(f, { fresh: f.new, big: show.length === 1 }));
      if (show.length === 1) {
        wrap.append(el('p', { class: 'rv-what', text: f.what }));
        wrap.append(el('p', { class: 'rv-where', text: [f.where, f.who, f.title].filter(Boolean).join(' ・ ') }));
        wrap.append(el('p', { class: 'rv-when', text: `${localTime(f.ts)}${f.seq !== null && f.seq !== undefined ? `・seq ${f.seq}` : ''}` }));
      }
      return wrap;
    }));
    const counts = { gold: 0, holo: 0, kira: 0, normal: 0 };
    for (const f of opened) counts[f.rarity]++;
    const fresh = opened.filter((f) => f.new).length;
    $('#bag-sum').replaceChildren(...[
      label ? el('span', { class: 'sum-label', text: label }) : el('span', { text: `${opened.length}枚` }),
      ...['gold', 'holo', 'kira'].filter((r) => counts[r]).map((r) => el('span', { class: `sum-${r}`, text: `${{ gold: '金', holo: 'ホロ', kira: 'キラ' }[r]} ${counts[r]}` })),
      fresh ? el('span', { class: 'sum-new', text: `NEW ${fresh}` }) : null,
      opened.length > show.length ? el('small', { text: `（レアなものから ${show.length}枚を表に）` }) : null,
    ].filter(Boolean));
    sound.play(tease === 'normal' ? 'drop' : tease);
    return tease;
  }

  /** 交換所（§79.16）: 5枚を1つ上のレア度1枚と換えて、開ける部屋でめくって見せる */
  async function trade(slot) {
    if (opening) return;
    $('#slot-pop').hidden = true;
    opening = true;
    const { j, t } = await postHero('api/hero/trade', { slot });
    if (!j?.ok) {
      opening = false;
      return;
    }
    const room = $('#bag-room');
    room.hidden = false;
    renderRoom();
    // 交換所の封筒（袋が残っていなくても、ゆれてから破れる）
    $('#bag-pile').replaceChildren(el('span', { class: 'bag trade-bag', style: '--i:0' }, el('span', { class: 'bag-label', text: '交換所' })));
    await reveal([j.got], { label: '交換所' });
    const was = journal;
    if (apply(j.journal, t)) celebrateCollection(was, journal);
    opening = false;
    renderRoom();
  }

  // ---- おかえりのカード（留守のあいだの戦果） ----
  let welcomeHead = null;
  function welcome() {
    if (welcomed || !journal?.current) return;
    welcomed = true;
    const { since } = journal.current;
    welcomeHead = journal.current.head; // 見せたところまでを「見た」にする（あとから届いたものは、次に見せる）
    const freshAch = journal.achievements.filter((a) => a.fresh);
    const rankUp = journal.rank_seen > 0 && journal.rank.level > journal.rank_seen;
    const anything = since.defeats + since.clears + since.gates + since.goals + since.stamps > 0;
    if (!anything && !freshAch.length && !rankUp) return;
    const card = $('#welcome');
    const stat = (label, n) => (n ? el('div', {}, el('b', { text: n }), el('small', { text: label })) : null);
    card.replaceChildren(...[
      el('p', { class: 'wl-kicker', text: since.first ? 'ようこそ、勇者' : 'おかえりなさい' }),
      el('h2', { text: since.first ? 'この冒険の、これまでの戦果' : '留守のあいだの戦果' }),
      since.from ? el('p', { class: 'wl-from', text: `前に見たのは ${localTime(since.from)}` }) : null,
      el('div', { class: 'wl-stats' }, stat('テスト撃破', since.defeats), stat('ダンジョン', since.clears), stat('メダル', since.medals), stat('結合ゲート', since.gates), stat('あがり', since.goals), stat('経験値', since.xp ? `+${since.xp}` : 0)),
      since.by.length ? el('p', { class: 'wl-by' }, 'よく戦った: ', ...since.by.slice(0, 4).map((b, i) => el('span', {}, i ? '、' : '', el('b', { text: b.name }), ` ${b.n}体`))) : null,
      rankUp ? el('p', { class: 'wl-rank' }, `勇者ランクが ${journal.rank_seen} → `, el('b', { text: journal.rank.level }), `「${journal.rank.title}」に上がった！`) : null,
      freshAch.length ? el('div', { class: 'wl-ach' }, el('small', { text: '新しい称号' }), ...freshAch.slice(0, 6).map((a) => el('span', { class: 'chip-ach', text: `★ ${a.name}` })), freshAch.length > 6 ? el('small', { text: `ほか ${freshAch.length - 6}` }) : null) : null,
      el('div', { class: 'wl-actions' },
        sound.on ? null : el('button', { type: 'button', class: 'mini-btn wl-sound', 'data-hero': 'sound-on', title: '撃破・シール・称号の効果音（見出しの ♪ でも切りかえられます）', text: '♪ 音を出す' }),
        journal.bags.count ? el('button', { type: 'button', class: 'act wl-open', 'data-hero': 'welcome-bags', text: `シール袋をあける（${journal.bags.count}）` }) : null,
        el('button', { type: 'button', class: 'mini-btn', 'data-hero': 'welcome-close', text: '盤面を見る' })),
    ].filter(Boolean));
    card.hidden = false;
    requestAnimationFrame(() => card.classList.add('show'));
    for (const a of freshAch) shownAch.add(a.id);
    if (rankUp || freshAch.length) sound.play('achieve');
  }
  async function closeWelcome() {
    const card = $('#welcome');
    if (card.hidden) return;
    card.classList.remove('show');
    setTimeout(() => (card.hidden = true), 250);
    const { j, t } = await postHero('api/hero/seen', welcomeHead === null ? {} : { seq: welcomeHead });
    if (j?.ok && j.journal) apply(j.journal, t);
  }

  // ---- お祝い（称号・ランク・お題・スタンプ） ----
  const shownAch = new Set();
  function fanfare(kind, title, body, tone) {
    // ボス戦のカットインの上には重ねない（消えてから出す）
    if ($('#boss-cut')?.hidden === false) return void whenStageFree(() => fanfare(kind, title, body, tone));
    const box = $('#fanfare');
    const item = el('div', { class: `fanfare ${kind}`, role: 'status' }, el('span', { class: 'ff-mark', 'aria-hidden': 'true', text: kind === 'rank' ? '▲' : kind === 'daily' ? '◎' : kind === 'stamp' ? '済' : '★' }),
      el('span', { class: 'ff-body' }, el('b', { text: title }), body ? el('small', { text: body }) : null));
    box.append(item);
    if (tone) sound.play(tone);
    setTimeout(() => item.classList.add('out'), 4600);
    setTimeout(() => item.remove(), 5400);
  }
  function celebrateAchievements(list) {
    list.slice(0, 4).forEach((a, i) => setTimeout(() => fanfare('ach', `称号「${a.name}」`, a.desc, 'achieve'), i * 700));
    if (list.length > 4) setTimeout(() => fanfare('ach', `ほかに称号を ${list.length - 4} つ`, '手帳の「称号」で見られます', null), 4 * 700);
    for (const a of list) shownAch.add(a.id);
    if (list.length) attention();
  }
  /** 称号・シール帳の列のコンプ・ランクアップ（a のあと b になったときに増えたもの） */
  function celebrateCollection(a, b) {
    const was = new Set(a.achievements.filter((x) => x.done).map((x) => x.id));
    celebrateAchievements(b.achievements.filter((x) => x.done && !was.has(x.id) && !shownAch.has(x.id)));
    const setWas = new Set((a.album.sets ?? []).filter((x) => x.done).map((x) => x.id));
    for (const set of (b.album.sets ?? []).filter((x) => x.done && !setWas.has(x.id))) {
      fanfare('ach', `シール帳「${set.name}」の列、コンプリート！`, `経験値 +${b.album.set_xp}`, 'gold');
    }
    if (b.rank.level > a.rank.level) {
      rankBanner(a.rank.level, b.rank);
      attention();
      for (const t of (b.themes ?? []).filter((x) => x.unlocked && !a.themes?.find((y) => y.id === x.id)?.unlocked)) {
        setTimeout(() => fanfare('ach', `ノートの模様「${t.name}」が使えるようになった`, '手帳の「ノートの模様」で着がえられます', 'achieve'), 3800);
      }
    }
  }
  function celebrateDiff(a, b) {
    celebrateCollection(a, b);
    if (b.daily.done && !a.daily.done && b.daily.date === a.daily.date) fanfare('daily', '今日のお題をぜんぶこなした！', `「${b.daily.reward}」のシールと経験値 ${b.daily.xp}`, 'achieve');
    // 自己ベスト更新（前の日までの記録を、今日はじめて超えた瞬間）
    const before = b.records?.day.before;
    if (before && a.records && b.records.day.today > before.n && a.records.day.today <= before.n) {
      fanfare('rank', '自己ベスト更新！', `1日に倒したテスト ${b.records.day.today}件（これまで ${before.n}件）`, 'fanfare');
      attention();
    }
    if (a.records && a.records.combo.best > 0 && b.records.combo.best >= 5 && b.records.combo.best > a.records.combo.best) fanfare('rank', `まとめ斬りの記録更新！ ${b.records.combo.best}体`, `これまで ${a.records.combo.best}体`, 'achieve');
    const mvpA = a.current?.mvp?.[0];
    const mvpB = b.current?.mvp?.[0];
    if (mvpA && mvpB && a.current.key === b.current.key && mvpA.id !== mvpB.id) fanfare('rank', `MVP交代！ ${mvpB.name}`, `今週 ${mvpB.n}体（${mvpA.name} ${b.current.mvp.find((m) => m.id === mvpA.id)?.n ?? mvpA.n}体を追いこした）`, 'achieve');
    if (b.streak.today && !a.streak.today) fanfare('stamp', b.streak.current >= 2 ? `スタンプカードにハンコ（${b.streak.current}日つづけて）` : 'スタンプカードにハンコ！', b.streak.current >= 2 ? 'あしたも1件倒せば、記録がのびる' : 'あしたも1件倒せば、2日つづけて', 'drop');
    const added = b.bags.count - a.bags.count;
    if (added > 0) {
      const fresh = (b.bags.latest ?? []).filter((f) => !prevBagIds.has(f.id)).slice(-12);
      flyDrops(fresh);
    }
    rememberBags(b);
  }
  function rememberBags(j) {
    for (const f of [...(j.bags.next ?? []), ...(j.bags.latest ?? [])]) prevBagIds.add(f.id);
  }
  /** ボス戦のカットインが出ていれば、消えるまで待ってから（大きな知らせは重ねない） */
  function whenStageFree(fn, tries = 40) {
    if ($('#boss-cut')?.hidden === false && tries > 0) return void setTimeout(() => whenStageFree(fn, tries - 1), 300);
    fn();
  }
  function rankBanner(from, rank) {
    // カットインは知らせが届いてから少しあとに始まるので、ひと呼吸おいてから確かめる
    setTimeout(() => whenStageFree(() => showRank(from, rank)), 400);
  }
  function showRank(from, rank) {
    const el2 = $('#rank-up');
    el2.replaceChildren(el('small', { text: '勇者ランク アップ！' }), el('b', { text: `${from} → ${rank.level}` }), el('span', { text: `「${rank.title}」` }));
    el2.hidden = false;
    el2.classList.remove('show');
    void el2.offsetWidth;
    el2.classList.add('show');
    sound.play('fanfare');
    setTimeout(() => (el2.hidden = true), reduced() ? 2500 : 3600);
  }

  /** 倒したマスから、見出しの「手帳」のタブへシール袋が飛ぶ（色はいちばん良いシールの気配） */
  function flyDrops(fresh) {
    const tab = $('#techo-tab');
    const to = tab.getBoundingClientRect();
    // 新しく落ちたシールが分かるものだけ飛ばす（分からなければ、札をはずませるだけ）
    const list = fresh;
    list.slice(0, 8).forEach((f, i) => {
      const sq = f.node ? document.querySelector(`.sq[data-node="${CSS.escape(f.node)}"].fresh-slain, .node[data-node="${CSS.escape(f.node)}"]`) : null;
      const r = sq?.getBoundingClientRect();
      const from = r && r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth * 0.42, y: innerHeight * 0.55 };
      const bag = el('span', { class: `fly-bag r-${f.rarity}`, 'aria-hidden': 'true', style: `left:${from.x}px;top:${from.y}px;--dx:${to.left + to.width / 2 - from.x}px;--dy:${to.top + to.height / 2 - from.y}px;--d:${i * 120}ms` });
      document.body.append(bag);
      // ホロ・金は、落ちた所で気配だけ見せる（中身は開けるまでのお楽しみ）
      if (f.rarity === 'holo' || f.rarity === 'gold') {
        const tease = el('span', { class: `tease r-${f.rarity}`, 'aria-hidden': 'true', style: `left:${from.x}px;top:${from.y}px`, text: f.rarity === 'gold' ? '★ 金の気配…！' : '✦ ホロの気配…！' });
        document.body.append(tease);
        setTimeout(() => tease.remove(), 2000);
      }
      setTimeout(() => bag.remove(), 1600 + i * 120);
    });
    setTimeout(() => {
      bumpBadge();
      sound.play(list.some((f) => RARITY_RANK[f.rarity] >= 2) ? 'kira' : 'drop');
    }, reduced() ? 0 : 900);
  }

  // ---- シールをノートに貼る（§79.11） ----
  const PASTE_SIZE = 4 * U;
  /** 貼ったシールを、盤面の #sticker-layer（景色の上・道の下）に描く */
  function renderPasted() {
    const layer = document.querySelector('#sticker-layer');
    if (!layer) return;
    const list = journal?.current?.pasted ?? [];
    const key = JSON.stringify(list);
    if (layer.dataset.key === key) return;
    layer.dataset.key = key;
    const S = PASTE_SIZE;
    const h = S / 2;
    let out = `<defs><linearGradient id="ps-holo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f9a8d4"/><stop offset=".35" stop-color="#c4b5fd"/><stop offset=".7" stop-color="#99f6e4"/><stop offset="1" stop-color="#fde68a"/></linearGradient>`
      + `<linearGradient id="ps-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7cc"/><stop offset=".45" stop-color="#f5c542"/><stop offset=".6" stop-color="#fff1a8"/><stop offset="1" stop-color="#d4a017"/></linearGradient></defs>`;
    for (const p of list) {
      const o = pageOrigin(p.page);
      const cx = ((o.x + p.x) * U).toFixed(1);
      const cy = (p.y * U).toFixed(1);
      const sym = p.kind === 'item' ? `hs-${p.item}` : `mon-${p.species}`;
      const tint = TINT[p.species] ?? '#fff6c7';
      const face = p.rarity === 'gold' ? 'url(#ps-gold)' : p.rarity === 'holo' ? 'url(#ps-holo)' : tint;
      const label = `${p.name}（${{ normal: 'ノーマル', kira: 'キラ', holo: 'ホロ', gold: '金' }[p.rarity]}）のシール`;
      out += `<g class="pasted r-${escAttr(p.rarity)}" data-index="${p.index}" transform="translate(${cx} ${cy}) rotate(${Number(p.r) || 0})" role="img" aria-label="${escAttr(label)}"><title>${escAttr(label)}（押すとはがせる）</title>`
        + `<rect class="ps-edge" x="${-h}" y="${-h}" width="${S}" height="${S}" rx="10"/>`
        + `<rect class="ps-face" x="${-h + 4}" y="${-h + 4}" width="${S - 8}" height="${S - 8}" rx="7" fill="${face}"/>`
        + `<use href="#${sym}" x="${-h + 6}" y="${-h + 5}" width="${S - 12}" height="${S - 12}" style="--monster:${tint}"/>`
        + (p.rarity === 'normal' ? '' : `<path class="ps-star" d="M${h - 9} ${-h + 4}l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>`)
        + '</g>';
    }
    layer.innerHTML = out;
  }

  let pasting = null;
  function startPaste(slot) {
    const s = journal?.album.slots.find((x) => x.slot === slot);
    if (!s || s.free < 1 || !board) return;
    $('#slot-pop').hidden = true;
    closeRoom();
    setView('board');
    pasting = { slot, r: Math.round((Math.random() * 24 - 12) * 10) / 10 };
    document.body.classList.add('pasting');
    const ghost = $('#paste-ghost');
    ghost.replaceChildren(stickerEl(s));
    ghost.hidden = false;
    ghost.style.setProperty('--r', `${pasting.r}deg`);
    const hint = $('#paste-hint');
    hint.textContent = `「${s.name}（${s.rarity_ja}）」を、ノートの好きな所を押して貼る（Esc でやめる）`;
    hint.hidden = false;
  }
  function endPaste() {
    pasting = null;
    document.body.classList.remove('pasting');
    $('#paste-ghost').hidden = true;
    $('#paste-hint').hidden = true;
  }
  /** 画面の点 → ノートのページと、その中の目 */
  function spotAt(e) {
    const m = board.getScreenCTM();
    if (!m) return null;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const pages = Number(window.__masume?.pages) || 0;
    for (let p = 0; p < pages; p++) {
      const o = pageOrigin(p);
      const x = pt.x / U - o.x;
      const y = pt.y / U;
      if (x >= 0 && x <= PAGE.w && y >= 0 && y <= PAGE.h) {
        const pad = PASTE_SIZE / U / 2;
        return { page: p, x: Math.min(PAGE.w - pad, Math.max(pad, x)), y: Math.min(PAGE.h - pad, Math.max(pad, y)) };
      }
    }
    return null;
  }
  async function pasteAt(e) {
    const spot = spotAt(e);
    if (!spot) {
      toast({ text: 'ノートのページの上を押してください', ok: null });
      return;
    }
    const { slot, r } = pasting;
    endPaste();
    const { j, t } = await postHero('api/hero/paste', { slot, page: spot.page, x: spot.x, y: spot.y, r });
    if (!j?.ok) return;
    apply(j.journal, t);
    sound.play('drop');
    const g = document.querySelector('#sticker-layer .pasted:last-of-type');
    g?.classList.add('fresh');
  }
  function openPeel(g, e) {
    const menu = $('#peel-menu');
    const p = journal?.current?.pasted?.[Number(g.dataset.index)];
    if (!p) return;
    menu.replaceChildren(el('span', { text: `${p.name}のシール` }),
      el('button', { type: 'button', class: 'mini-btn', 'data-hero': 'peel', 'data-index': p.index, text: 'はがす' }),
      el('button', { type: 'button', class: 'mini-btn plain', 'data-hero': 'peel-cancel', text: 'そのまま' }));
    menu.style.left = `${Math.min(e.clientX, innerWidth - 220)}px`;
    menu.style.top = `${Math.min(e.clientY + 8, innerHeight - 60)}px`;
    menu.hidden = false;
  }
  if (board) {
    // 盤面の選ぶ・めくる より先に受ける（貼るあいだと、貼ったシールを押したとき）
    board.addEventListener('click', (e) => {
      if (board.dataset.justDragged) return;
      if (pasting) {
        e.stopPropagation();
        e.preventDefault();
        pasteAt(e);
        return;
      }
      const g = e.target.closest?.('#sticker-layer .pasted');
      if (g) {
        e.stopPropagation();
        openPeel(g, e);
      }
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!pasting) return;
      $('#paste-ghost').style.left = `${e.clientX}px`;
      $('#paste-ghost').style.top = `${e.clientY}px`;
    });
  }

  // ---- 冒険者カードを画像に（§79.24）: 1200×630 の SVG を描いて PNG に。コピーか保存 ----
  function cardSvg() {
    const j = journal;
    const W = 1200;
    const H = 630;
    const t = j.totals;
    const owned = j.album.slots.filter((x) => x.count > 0).sort((a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || b.count - a.count).slice(0, 6);
    const ids = new Set(owned.map(symbolOf));
    const symbols = [...document.querySelectorAll('#hero-defs symbol')].filter((sym) => ids.has(sym.id.slice(3))).map((sym) => sym.outerHTML).join('');
    const rarityStroke = { normal: '#c7cbd6', kira: '#38bdf8', holo: '#a78bfa', gold: '#b8860b' };
    const stats = [['倒したテスト', t.defeats], ['ダンジョン', t.clears], ['結合ゲート', t.gates], ['あがり', t.goals], ['メダル', t.medals], ['続けた日数', j.streak.best]];
    const font = `'Hiragino Maru Gothic ProN','Klee One','Yu Gothic',sans-serif`;
    let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${symbols}<pattern id="g" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#a6d2e4" stroke-width="1"/></pattern></defs>`;
    out += `<rect width="${W}" height="${H}" fill="#fdfaf0"/><rect width="${W}" height="${H}" fill="url(#g)"/><rect x="18" y="18" width="${W - 36}" height="${H - 36}" fill="none" stroke="#1d2b5c" stroke-width="4" rx="18"/>`;
    out += `<text x="60" y="92" font-family="${font}" font-size="40" font-weight="700" fill="#1d2b5c">GridHub 勇者の手帳</text>`;
    out += `<text x="${W - 60}" y="92" text-anchor="end" font-family="${font}" font-size="22" fill="#45517a">${escAttr(j.today)}</text>`;
    out += `<circle cx="150" cy="230" r="86" fill="#1d2b5c" stroke="#ffe45c" stroke-width="8"/><text x="150" y="208" text-anchor="middle" font-family="${font}" font-size="22" fill="#fff">ランク</text><text x="150" y="268" text-anchor="middle" font-family="${font}" font-size="72" font-weight="700" fill="#ffe45c">${j.rank.level}</text>`;
    out += `<text x="270" y="210" font-family="${font}" font-size="52" font-weight="700" fill="#1d2b5c">${escAttr(j.rank.title)}</text>`;
    if (j.epithet) out += `<text x="272" y="258" font-family="${font}" font-size="30" font-weight="700" fill="#d94a3a">「${escAttr(j.epithet.name)}」</text>`;
    out += `<text x="272" y="300" font-family="${font}" font-size="22" fill="#45517a">経験値 ${j.rank.xp}・称号 ${j.achievements.filter((a) => a.done).length}/${j.achievements.length}・シール帳 ${j.album.owned}/${j.album.total}</text>`;
    stats.forEach(([k, v], i) => {
      const x = 60 + i * 183;
      out += `<rect x="${x}" y="350" width="168" height="104" rx="12" fill="#fffefa" stroke="#1d2b5c" stroke-width="2"/><text x="${x + 84}" y="414" text-anchor="middle" font-family="${font}" font-size="44" font-weight="700" fill="#d94a3a">${v}</text><text x="${x + 84}" y="440" text-anchor="middle" font-family="${font}" font-size="18" fill="#45517a">${k}</text>`;
    });
    owned.forEach((x, i) => {
      const cx = 60 + i * 120;
      out += `<g transform="translate(${cx} 474) rotate(${i % 2 ? 3 : -3} 46 46)"><rect width="92" height="92" rx="15" fill="#fff" stroke="${rarityStroke[x.rarity]}" stroke-width="4"/><use href="#hs-${symbolOf(x)}" x="11" y="9" width="70" height="70" style="--monster:${TINT[x.species] ?? '#fff6c7'};--pawn:#ffe45c"/></g>`;
    });
    out += `<text x="${W - 60}" y="600" text-anchor="end" font-family="${font}" font-size="18" fill="#45517a">テスト1件 = 1マス。通ったぶんだけ進む開発すごろく</text></svg>`;
    return out;
  }
  async function cardPng() {
    const url = URL.createObjectURL(new Blob([cardSvg()], { type: 'image/svg+xml' }));
    try {
      const img = new Image();
      await new Promise((ok, ng) => {
        img.onload = ok;
        img.onerror = ng;
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  async function shareCard(how) {
    if (!journal) return;
    let blob;
    try {
      blob = await cardPng();
    } catch {
      blob = null;
    }
    const kind = blob ? 'image/png' : 'image/svg+xml';
    blob ??= new Blob([cardSvg()], { type: kind });
    window.__masume.heroCard = { type: kind, size: blob.size };
    if (how === 'copy' && blob.type === 'image/png' && navigator.clipboard?.write && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast({ text: '冒険者カードを画像でコピーしました（チャットや SNS に貼れます）', ok: true });
        return;
      } catch {
        // コピーできなければ保存する
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gridhub-hero-${journal.today}.${blob.type === 'image/png' ? 'png' : 'svg'}`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast({ text: `冒険者カードを保存しました: ${a.download}`, ok: true });
  }

  // ---- 操作 ----
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-hero], .al-slot, #bag-one, #bag-ten, #bag-all, #bag-close, #bag-room, #slot-pop');
    if (!t) return;
    if (t.id === 'bag-room') {
      if (e.target === t && !opening) closeRoom();
      return;
    }
    if (t.id === 'slot-pop') {
      if (e.target === t) t.hidden = true;
      return;
    }
    if (t.matches('.al-slot')) return slotDetail(t.dataset.slot);
    if (t.id === 'bag-one') return openBags(1);
    if (t.id === 'bag-ten') return openBags(10);
    if (t.id === 'bag-all') return openBags(5000);
    if (t.id === 'bag-close') return closeRoom();
    switch (t.dataset.hero) {
      case 'techo': return setView('techo');
      case 'bags': return openRoom();
      case 'welcome-bags':
        closeWelcome();
        return openRoom();
      case 'welcome-close': return closeWelcome();
      case 'bags-from-ending':
        $('#ending').hidden = true;
        return openRoom();
      case 'sound-on':
        if (!sound.on) $('#sound')?.click();
        t.remove();
        return undefined;
      case 'pop-close':
        $('#slot-pop').hidden = true;
        return undefined;
      case 'techo-from-room':
        closeRoom();
        return setView('techo');
      case 'paste': return startPaste(t.dataset.slot);
      case 'trade': return trade(t.dataset.slot);
      case 'theme':
        return postHero('api/hero/theme', { id: t.dataset.id }).then(({ j, t: no }) => {
          if (j?.ok) {
            apply(j.journal, no);
            sound.play('drop');
          }
        });
      case 'card-copy': return shareCard('copy');
      case 'card-save': return shareCard('save');
      case 'title':
        return postHero('api/hero/title', { id: t.dataset.id || null }).then(({ j, t: no }) => {
          if (j?.ok) {
            apply(j.journal, no);
            sound.play('achieve');
          }
        });
      case 'peel-cancel':
        $('#peel-menu').hidden = true;
        return undefined;
      case 'peel':
        $('#peel-menu').hidden = true;
        return postHero('api/hero/peel', { index: Number(t.dataset.index) }).then(({ j, t: no }) => {
          if (j?.ok) {
            apply(j.journal, no);
            sound.play('rip');
          }
        });
    }
    return undefined;
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (pasting) return endPaste();
    if (!$('#peel-menu').hidden) return void ($('#peel-menu').hidden = true);
    if (!$('#slot-pop').hidden) $('#slot-pop').hidden = true;
    else if (!$('#bag-room').hidden && !opening) closeRoom();
    else if (!$('#welcome').hidden) closeWelcome();
  });
  $('#bag-pile').addEventListener('click', () => openBags(1));

  return {
    /** 盤面のはじめ（本物の盤面だけ）。手帳が読めれば、タブとカードを出し、おかえりのカードを出す */
    async start() {
      if (!live) return;
      const t = ++ticket;
      const [j] = await Promise.all([fetchHero(), defs()]);
      if (!j || !apply(j, t)) return;
      rememberBags(j);
      setTimeout(welcome, 900);
    },
    /** 冒険の書が新しくなったら、少し待って手帳を読み直す（お祝いと、シール袋が飛ぶ） */
    changed() {
      if (!available) return;
      clearTimeout(timer);
      timer = setTimeout(() => refresh(), 450);
    },
    /** 帰還・ボス戦・あがり（盤面の知らせから）。Mac のアプリで窓が後ろなら Dock で知らせる */
    attention,
    /** 盤面が描き直されたら、勇者のカードの「出撃中」を合わせる（手帳は読み直さない） */
    viewChanged() {
      if (available && journal) renderCard();
    },
    /** 手帳のタブを開いた */
    shown() {
      if (journal && $('#techo').dataset.stale !== undefined) renderTecho();
      else if (journal && !$('#techo').childElementCount) renderTecho();
    },
  };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
