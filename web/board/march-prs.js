// 進軍の PR の札（CONTRACTS §80.16）。gh から読んだ本物の PR を下に並べ、状態が変わると盤面で見せる。盤面の担当
import { t } from './words.js';
import { prsToShow, canMerge, prEvents } from './march-status.js';

const key = (p) => `${p.state}|${p.draft}|${p.review}|${p.checks}|${p.note?.at ?? ''}`;

export function createPrs({ host, load, merge, open, march, every = 20000 }) {
  let last = null;
  let canOpen = false;
  let nextMerge = null;
  let armed = null;
  let busy = false;

  function chip(p) {
    const el = document.createElement('div');
    el.className = 'pr-chip';
    el.dataset.number = String(p.number);
    el.dataset.state = p.state;
    const name = document.createElement('span');
    name.className = 'pr-name';
    name.textContent = `#${p.number} ${p.title}`;
    name.title = `${p.branch ?? ''} ${p.author ?? ''}`.trim();
    el.append(name);
    const badge = (text, kind) => {
      const b = document.createElement('span');
      b.className = 'pr-badge';
      b.dataset.kind = kind;
      b.textContent = text;
      el.append(b);
    };
    if (p.state === 'MERGED') badge(t('pr.merged'), 'merged');
    else {
      if (p.draft) badge(t('pr.draft'), 'draft');
      if (p.checks) badge(`${t(`pr.ci.${p.checks}`)}${p.job ? `: ${p.job}` : ''}`, p.checks);
      badge(t(p.review === 'APPROVED' ? 'pr.approved' : p.review === 'CHANGES_REQUESTED' ? 'pr.changes' : 'pr.review'), p.review === 'APPROVED' ? 'pass' : p.review === 'CHANGES_REQUESTED' ? 'fail' : 'wait');
    }
    if (canMerge(p)) {
      // マージは取り消しにくいので、2回押す
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pr-merge';
      b.disabled = busy;
      b.textContent = armed === p.number ? t('pr.merge.sure') : t('pr.merge');
      b.dataset.armed = String(armed === p.number);
      b.dataset.next = String(nextMerge === p.number);
      b.addEventListener('click', () => onMerge(p));
      el.append(b);
    }
    return el;
  }

  function render() {
    const shown = prsToShow(last);
    host.hidden = !shown.length;
    host.replaceChildren(...shown.map(chip));
    window.__masume.prs = shown.map((p) => ({ number: p.number, state: p.state, canMerge: canMerge(p) }));
  }

  async function onMerge(p) {
    if (busy) return;
    if (armed !== p.number) {
      armed = p.number;
      render();
      return;
    }
    armed = null;
    busy = true;
    render();
    await merge(p.number);
    busy = false;
    await poll();
  }

  function show(ev) {
    const { kind, pr } = ev;
    if (kind === 'comment') march.talk(pr.branch, pr.note.who, pr.note.text);
    else if (kind === 'merged') march.announce(t('pr.ev.merged', pr.number), true);
    else if (kind === 'ci_failed') march.announce(t('pr.ev.ci_failed', pr.number, pr.job), false);
    else march.notice(t(`pr.ev.${kind}`, pr.number));
  }

  async function poll() {
    let j = null;
    try {
      j = await load();
    } catch {
      j = null;
    }
    canOpen = !!j?.canOpen;
    if (!j || !j.available) {
      last = null;
      host.hidden = true;
      return;
    }
    const before = last;
    const same = before && before.length === j.prs.length && before.every((p, i) => key(p) === key(j.prs[i]));
    last = j.prs;
    for (const ev of prEvents(before, last)) show(ev);
    if (!same || !host.children.length) render();
  }

  let timer = 0;
  return {
    start() {
      clearInterval(timer);
      timer = setInterval(poll, every);
      return poll();
    },
    poll,
    /** いまのブランチから PR を作れるか（§80.16） */
    canOpen: () => canOpen,
    prs: () => last ?? [],
    /** 次に押す PR を光らせる（§80.9） */
    highlight(number) {
      if (nextMerge === number) return;
      nextMerge = number;
      render();
    },
    async open() {
      const j = await open();
      if (j && j.ok !== false) {
        march.announce(t('pr.ev.created'), true);
        canOpen = false;
      }
      await poll();
    },
    rewords: render,
  };
}
