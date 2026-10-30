// ボス戦のカットイン（CONTRACTS §76.8）: 結合ゲート（中ボス）・魔王の城の判定が記録されたら、
// 仲間とボスを並べ、テスト1件ずつで HP を削って見せる。数秒で消える（押せばすぐ消える）。盤面の操作はふさがない。
import { spriteMarkup } from './draw.js';

const $ = (sel) => document.querySelector(sel);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function text(tag, cls, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.textContent = String(value ?? '');
  return node;
}

let hideTimer = null;
const timers = [];

export function hideBoss() {
  const box = $('#boss-cut');
  if (!box) return;
  clearTimeout(hideTimer);
  timers.splice(0).forEach(clearTimeout);
  box.classList.remove('show');
  box.hidden = true;
}

/**
 * entry: 冒険の書の1行（gate_cleared / gate_failed）。view: その行を書いたあとのビュー
 */
export function showBoss(entry, view, sprites, sound) {
  const box = $('#boss-cut');
  const gate = view?.nodes?.[entry.node];
  if (!box || !gate) return;
  hideBoss();
  const win = entry.type === 'gate_cleared';
  const goal = view.quest?.goal === entry.node;
  const cases = Array.isArray(gate.cases) ? gate.cases : [];
  const total = Math.max(cases.length, 1);
  const hits = win ? cases.length || 1 : cases.filter((c) => c.ok === true).length;
  const members = view.characters.filter((c) => gate.members?.includes(c.id));

  box.dataset.result = win ? 'win' : 'lose';
  box.dataset.goal = String(goal);
  const band = document.createElement('div');
  band.className = 'bc-band';
  band.append(text('p', 'bc-kicker', goal ? `魔王の城 ${entry.node} — あがりの結合テスト` : `中ボス戦 ${entry.node} — 結合テスト`));
  band.append(text('h2', 'bc-title', gate.title || entry.node));

  const arena = document.createElement('div');
  arena.className = 'bc-arena';
  const party = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const n = Math.max(members.length, 1);
  party.setAttribute('viewBox', `0 0 ${n * 46 + 4} 54`);
  party.setAttribute('class', 'bc-party');
  party.setAttribute('aria-label', members.map((m) => m.name).join('、'));
  party.innerHTML = members.map((m, i) => spriteMarkup(sprites, m, 2 + i * 46, 4, 46, `boss:${m.id}`)).join('');
  const boss = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  boss.setAttribute('viewBox', '0 0 64 64');
  boss.setAttribute('class', 'bc-boss');
  boss.innerHTML = `<use href="#mon-${goal ? 'maou' : 'dragon'}" width="64" height="64" style="--monster:${goal ? '#e6dcff' : '#c9f0dc'}"/>`;
  arena.append(party, text('span', 'bc-vs', 'VS'), boss);
  band.append(arena);

  const hp = document.createElement('div');
  hp.className = 'bc-hp';
  const fill = document.createElement('i');
  const label = text('span', 'bc-hp-text', `HP ${total}/${total}`);
  hp.append(fill, label);
  band.append(hp);

  const list = document.createElement('ol');
  list.className = 'bc-hits';
  band.append(list);
  const result = text('p', 'bc-result', '');
  band.append(result);
  const skip = text('button', 'bc-skip mini-btn', '閉じる');
  skip.type = 'button';
  skip.addEventListener('click', hideBoss);
  band.append(skip);
  box.replaceChildren(band);
  box.hidden = false;
  void box.offsetWidth;
  box.classList.add('show');

  // テスト1件ずつ: 通れば HP が1減る。落ちたテストは「はじかれた」
  const step = reduced() ? 0 : Math.max(120, Math.min(320, 2400 / total));
  const shown = (cases.length ? cases : [{ name: gate.title || entry.node, ok: win }]).slice(0, 12);
  let left = total;
  shown.forEach((c, i) => {
    timers.push(setTimeout(() => {
      const ok = win || c.ok === true;
      const li = text('li', ok ? 'hit' : 'miss', `${ok ? '✔' : '✖'} ${c.name}`);
      list.append(li);
      if (ok) {
        left = Math.max(0, left - 1);
        boss.classList.remove('hurt');
        void boss.getBoundingClientRect();
        boss.classList.add('hurt');
        sound.play('hit');
      }
      fill.style.width = `${(left / total) * 100}%`;
      label.textContent = `HP ${left}/${total}`;
    }, 500 + i * step));
  });
  const end = 500 + shown.length * step + 200;
  timers.push(setTimeout(() => {
    if (win) {
      left = 0;
      fill.style.width = '0%';
      label.textContent = `HP 0/${total}`;
      boss.classList.add('down');
    }
    result.textContent = win ? (goal ? '魔王を倒した！ あがり！' : `撃破！ テスト ${hits}/${total}`) : `${entry.text.includes('全滅') ? '全滅…' : '差し戻し…'} テスト ${hits}/${total}`;
    box.classList.add('done');
  }, end));
  hideTimer = setTimeout(hideBoss, end + (reduced() ? 2500 : 2600));
}
