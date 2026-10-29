// 手で進める（CONTRACTS §71）。盤面の担当。
// 人間が、キャラクターの役を盤面から手で演じる: 指令書を読む・縄張りのファイルを書く・歩く・宣言判定・ハンコ・ボス戦。
// #hand はキャラクターシート（#drawer）とは別の欄。盤面が新しくなっても書きかけを消さない（いまのマスが変わったら空にする。§74.3）。
import { wordsFor, t as say } from './words.js';

const $ = (sel) => document.querySelector(sel);

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('data-')) node.setAttribute(key, value);
    else node[key] = value;
  }
  node.append(...children);
  return node;
}

/** 縄張りの glob から、ファイル名の欄の例を作る（human/** → human/memo.txt。§74.3） */
function exampleOf(glob) {
  const parts = String(glob ?? '').split('/').filter(Boolean);
  const fixed = [];
  for (const part of parts) {
    if (/[*?[\]{}]/.test(part)) break;
    fixed.push(part);
  }
  if (!parts.length) return '';
  if (fixed.length === parts.length) return fixed.join('/');
  const ext = /^\*(\.[\w.-]+)$/.exec(parts.at(-1))?.[1] ?? '.txt';
  return [...fixed, `memo${ext}`].join('/');
}

export function initHand({ live, post, toast, app = false }) {
  const panel = $('#hand');
  if (!panel) return { open() {}, refresh() {}, rewords() {} };
  const words = wordsFor(app);
  let character = null;
  let data = null;
  let busy = false;
  let readonly = false;
  let shownNode; // いま書き込み欄が向いているマス（変わったら欄を空にする）

  const show = (sel, on) => {
    const node = $(sel);
    if (node) node.hidden = !on;
  };

  function message(text, ok) {
    const box = $('#hand-msg');
    box.textContent = text;
    box.dataset.ok = String(ok);
    box.hidden = !text;
  }

  function setBusy(on) {
    busy = on;
    panel.dataset.busy = String(on);
    for (const b of panel.querySelectorAll('button:not(#hand-close)')) b.disabled = on || (b.id === 'hand-save' && readonly);
  }

  /** 書き込み欄を、読むだけ（仲間のファイル）か、書ける（自分の縄張り）にする */
  function setReadonly(on) {
    readonly = on;
    $('#hand-content').readOnly = on;
    $('#hand-path').readOnly = on;
    $('#hand-save').disabled = on || busy;
    show('#hand-readonly', on);
  }

  function clearEdit() {
    $('#hand-path').value = '';
    $('#hand-content').value = '';
    setReadonly(false);
  }

  function renderBrief() {
    const box = $('#hand-brief');
    const b = data.brief;
    const c = b.character;
    const n = b.current;
    const parts = [el('p', { class: 'hand-who', text: say('hand.who', c.name, say(c.kind === 'human' ? 'hand.role.human' : 'hand.role.agent'), c.level) })];
    if (!n) {
      parts.push(el('p', { class: 'hand-node', text: say('hand.done') }));
    } else {
      parts.push(el('h4', { class: 'hand-node', text: `${n.id}「${n.title}」` }));
      if (n.detail) parts.push(el('p', { class: 'hand-detail', text: words(n.detail) }));
      if (n.type === 'gate') {
        const waiting = b.waiting_for ?? [];
        parts.push(el('p', { class: 'hand-wait', text: waiting.length ? say('hand.waiting', waiting.join('、')) : say('hand.ready') }));
      }
      const cases = Array.isArray(n.check?.cases) ? n.check.cases : [];
      if (cases.length) parts.push(el('ol', { class: 'hand-cases' }, ...cases.map((name) => el('li', { text: name }))));
      if (n.check?.kind === 'cmd') parts.push(el('p', { class: 'hand-run' }, say('hand.run'), el('code', { text: n.check.run })));
    }
    const territory = data.territory ?? [];
    parts.push(el('p', { class: 'hand-territory' }, say('hand.territory'), ...(territory.length ? territory.flatMap((glob, i) => [i ? ' ' : '', el('code', { text: glob })]) : [say('hand.territory.none')])));
    box.replaceChildren(...parts);
  }

  function renderFiles() {
    const ul = $('#hand-files');
    const files = data.files ?? [];
    ul.replaceChildren(...files.map((f) => el('li', { 'data-path': f.path, tabIndex: 0, title: say('hand.file.title', f.size) }, el('code', { text: f.path }))));
    show('#hand-files-empty', files.length === 0);
    const samples = $('#hand-samples');
    samples.replaceChildren(...(data.solutions ?? []).map((s) => el('button', { type: 'button', class: 'mini-btn', 'data-sample': s.path, text: say('hand.sample', s.path) })));
    // 承認のマスで、指令書と判定に書かれた仲間のファイル（読むだけ。§74.3）
    const review = data.review ?? [];
    $('#hand-review-list').replaceChildren(...review.map((f) => el('li', { 'data-path': f.path, tabIndex: 0, title: say('hand.review.title', f.owner, f.size) }, el('code', { text: f.path }))));
    show('#hand-review', review.length > 0);
    $('#hand-path').placeholder = data.solutions?.[0]?.path ?? exampleOf((data.territory ?? [])[0]);
  }

  function renderActions() {
    const b = data.brief;
    const n = b.current;
    const me = b.character;
    const task = n?.type === 'task';
    const stamp = task && n.check?.kind === 'stamp';
    show('#hand-step', task && !stamp);
    show('#hand-check', task && !stamp);
    show('#hand-stamp', stamp && me.kind === 'human' && n.check.by === me.id);
    show('#hand-battle', n?.type === 'gate' && (b.waiting_for ?? []).length === 0);
    show('.hand-edit', ((data.territory ?? []).length > 0 || (data.review ?? []).length > 0) && n !== null);
  }

  async function load() {
    if (!character) return;
    const id = character;
    let got;
    try {
      const r = await fetch(`api/hand?character=${encodeURIComponent(id)}`, { cache: 'no-store' });
      got = await r.json();
    } catch {
      got = { ok: false, error: say('hand.msg.unreachable') };
    }
    if (character !== id) return;
    if (!got || got.ok === false) {
      message(say('hand.msg.readfail', got?.error ?? ''), false);
      panel.dataset.loaded = 'true';
      return;
    }
    data = got;
    const node = got.brief.current?.id ?? null;
    if (shownNode !== undefined && shownNode !== node) clearEdit(); // 進んだ・戻された
    shownNode = node;
    $('#hand-title').textContent = say('hand.title.for', got.brief.character.name);
    renderBrief();
    renderFiles();
    renderActions();
    panel.dataset.loaded = 'true';
  }

  /** 窓口に送る。送っているあいだは押せない。終わったら読み直す */
  async function act(path, body, done) {
    if (busy || !character) return;
    setBusy(true);
    try {
      const j = await post(path, body);
      if (j === null) return;
      if (!j.ok) {
        message(say('hand.msg.fail', j.error || j.code || ''), false);
        return;
      }
      done(j);
    } finally {
      await load();
      setBusy(false);
    }
  }

  function renderCases(cases) {
    $('#hand-result').replaceChildren(...cases.map((c) => el('li', { class: c.ok === true ? 'ok' : c.ok === false ? 'ng' : 'unknown', text: `${c.ok === true ? '✔' : c.ok === false ? '✖' : '・'} ${c.name}` })));
  }

  panel.addEventListener('click', async (e) => {
    const t = e.target.closest('button, li[data-path]');
    if (!t || !panel.contains(t)) return;
    if (t.id === 'hand-close') {
      panel.hidden = true;
      return;
    }
    if (busy) return;
    if (t.matches('li[data-path]')) {
      const path = t.dataset.path;
      const r = await fetch(`api/file?character=${encodeURIComponent(character)}&path=${encodeURIComponent(path)}`, { cache: 'no-store' }).then((x) => x.json()).catch(() => null);
      if (!r || r.ok === false) {
        message(say('hand.msg.readfail', r?.error ?? ''), false);
        return;
      }
      $('#hand-path').value = r.path;
      $('#hand-content').value = r.content;
      setReadonly(r.readonly === true);
      return;
    }
    if (t.matches('[data-sample]')) {
      const sample = (data?.solutions ?? []).find((s) => s.path === t.dataset.sample);
      if (!sample) return;
      setReadonly(false);
      $('#hand-path').value = sample.path;
      $('#hand-content').value = sample.content;
      message(say('hand.msg.sample'), true);
      return;
    }
    if (t.id === 'hand-save') {
      if (readonly) return;
      const path = $('#hand-path').value.trim();
      if (!path) {
        const example = $('#hand-path').placeholder;
        message(say('hand.msg.nopath', example), false);
        return;
      }
      await act('api/file', { character, path, content: $('#hand-content').value }, (j) => message(say('hand.msg.saved', j.path, j.bytes), true));
      return;
    }
    if (t.id === 'hand-step') {
      await act('api/step', { character }, (j) => {
        const cases = j.cases ?? [];
        renderCases(cases);
        const won = cases.filter((c) => c.ok === true).length;
        message(j.exit === 0 ? say('hand.msg.step.ok', j.node) : say('hand.msg.step.ng', j.node, won, cases.length), j.exit === 0);
      });
      return;
    }
    if (t.id === 'hand-check') {
      await act('api/check', { character }, (j) => {
        if (j.passed) {
          message(say('hand.msg.check.ok', j.ready), true);
          if (j.ready) toast({ text: say('toast.ready', j.ready), ok: null, type: 'battle' });
        } else {
          message(say('hand.msg.check.ng'), false);
        }
      });
      return;
    }
    if (t.id === 'hand-stamp') {
      const node = data.brief.current.id;
      await act('api/stamp', { node, as: character }, (j) => {
        message(say('hand.msg.stamp', node, j.ready), true);
        if (j.ready) toast({ text: say('toast.ready', j.ready), ok: null, type: 'battle' });
      });
      return;
    }
    if (t.id === 'hand-battle') {
      const gate = data.brief.current.id;
      await act('api/battle', { gate }, () => message(say('hand.msg.battle', gate), true));
    }
  });

  panel.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('li[data-path]')) {
      e.preventDefault();
      e.target.click();
    }
  });

  return {
    /** キャラクターの「手で進める」を開く。同じキャラクターなら書きかけは残す */
    open(id) {
      if (!live) return;
      if (character !== id) {
        clearEdit();
        $('#hand-result').replaceChildren();
        message('', true);
        data = null;
        shownNode = undefined;
      }
      character = id;
      panel.dataset.char = id;
      panel.dataset.loaded = 'false';
      panel.hidden = false;
      load();
    },
    /** 盤面が新しくなったら、開いていれば指令書だけ読み直す（書きかけは触らない） */
    refresh() {
      if (!panel.hidden && !busy) load();
    },
    /** ことばが切り替わったら、読み直さずに今の中身を描き直す（§75。書きかけは触らない） */
    rewords() {
      if (!data) return;
      $('#hand-title').textContent = say('hand.title.for', data.brief.character.name);
      renderBrief();
      renderFiles();
      renderActions();
    },
  };
}
