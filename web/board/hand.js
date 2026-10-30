// 手で進める（CONTRACTS §71）。盤面の担当。
// 人間が、キャラクターの役を盤面から手で演じる: 指令書を読む・縄張りのファイルを書く・歩く・宣言判定・ハンコ・ボス戦。
// #hand はキャラクターシート（#drawer）とは別の欄。盤面が新しくなっても書きかけを消さない（いまのマスが変わったら空にする。§74.3）。
import { wordsFor } from './words.js';
import { speciesOf } from './draw.js';

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
  if (!panel) return { open() {}, refresh() {} };
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
    const parts = [el('p', { class: 'hand-who', text: `${c.name}（${c.kind === 'human' ? '人間' : 'エージェントの役'}）・Lv${c.level}` })];
    if (!n) {
      parts.push(el('p', { class: 'hand-node', text: 'あがりました。もう進むマスはありません。' }));
    } else {
      parts.push(el('h4', { class: 'hand-node', text: `${n.id}「${n.title}」` }));
      if (n.detail) parts.push(el('p', { class: 'hand-detail', text: words(n.detail) }));
      if (n.type === 'gate') {
        const waiting = b.waiting_for ?? [];
        parts.push(el('p', { class: 'hand-wait', text: waiting.length ? `仲間を待っています: ${waiting.join('、')}` : '仲間がそろいました。ボス戦（結合テスト）を始められます。' }));
      }
      const cases = Array.isArray(n.check?.cases) ? n.check.cases : [];
      if (cases.length) parts.push(el('ol', { class: 'hand-cases' }, ...cases.map((name) => el('li', { text: name }))));
      if (n.check?.kind === 'cmd') parts.push(el('p', { class: 'hand-run' }, '判定: ', el('code', { text: n.check.run })));
    }
    const territory = data.territory ?? [];
    parts.push(el('p', { class: 'hand-territory' }, '縄張り: ', ...(territory.length ? territory.flatMap((t, i) => [i ? ' ' : '', el('code', { text: t })]) : ['（ありません）'])));
    box.replaceChildren(...parts);
  }

  function renderFiles() {
    const ul = $('#hand-files');
    const files = data.files ?? [];
    ul.replaceChildren(...files.map((f) => el('li', { 'data-path': f.path, tabIndex: 0, title: `${f.size} バイト` }, el('code', { text: f.path }))));
    show('#hand-files-empty', files.length === 0);
    const samples = $('#hand-samples');
    samples.replaceChildren(...(data.solutions ?? []).map((s) => el('button', { type: 'button', class: 'mini-btn', 'data-sample': s.path, text: `見本を写す: ${s.path}` })));
    // 承認のマスで、指令書と判定に書かれた仲間のファイル（読むだけ。§74.3）
    const review = data.review ?? [];
    $('#hand-review-list').replaceChildren(...review.map((f) => el('li', { 'data-path': f.path, tabIndex: 0, title: `${f.owner} の縄張り・${f.size} バイト` }, el('code', { text: f.path }))));
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
      got = { ok: false, error: 'サーバーに届きません' };
    }
    if (character !== id) return;
    if (!got || got.ok === false) {
      message(`読めませんでした: ${got?.error ?? ''}`, false);
      panel.dataset.loaded = 'true';
      return;
    }
    data = got;
    const node = got.brief.current?.id ?? null;
    if (shownNode !== undefined && shownNode !== node) clearEdit(); // 進んだ・戻された
    shownNode = node;
    $('#hand-title').textContent = `手で進める: ${got.brief.character.name}`;
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
        message(`できませんでした: ${j.error || j.code || ''}`, false);
        return;
      }
      done(j);
    } finally {
      await load();
      setBusy(false);
    }
  }

  /** テスト1件ずつ: モンスターの絵・倒したら「撃破」・いちばん手前の落ちているものに「いま戦う」（§76.26） */
  function renderCases(cases) {
    const target = cases.findIndex((c) => c.ok !== true);
    $('#hand-result').replaceChildren(...cases.map((c, i) => {
      const state = c.ok === true ? 'ok' : c.ok === false ? 'ng' : 'unknown';
      const li = el('li', { class: `${state}${i === target ? ' target' : ''}` });
      li.style.setProperty('--d', `${i * 90}ms`);
      const art = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      art.setAttribute('viewBox', '0 0 64 64');
      art.setAttribute('aria-hidden', 'true');
      art.setAttribute('class', 'hr-mon');
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', `#mon-${speciesOf(c.name, i)}`);
      art.append(use);
      li.append(art, el('span', { class: 'hr-name', text: `${c.ok === true ? '✔' : c.ok === false ? '✖' : '・'} ${c.name}` }));
      if (state === 'ok') li.append(el('em', { class: 'hr-slain', text: '撃破' }));
      else if (i === target) li.append(el('em', { class: 'hr-next', text: 'いま戦う' }));
      return li;
    }));
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
        message(`読めませんでした: ${r?.error ?? ''}`, false);
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
      message('見本を書き込み欄に写しました。中身を確かめて「保存」を押してください。', true);
      return;
    }
    if (t.id === 'hand-save') {
      if (readonly) return;
      const path = $('#hand-path').value.trim();
      if (!path) {
        const example = $('#hand-path').placeholder;
        message(`ファイルのパスを書いてください${example ? `（例: ${example}）` : ''}`, false);
        return;
      }
      await act('api/file', { character, path, content: $('#hand-content').value }, (j) => message(`保存しました: ${j.path}（${j.bytes} バイト）`, true));
      return;
    }
    if (t.id === 'hand-note-save') {
      const input = $('#hand-note-text');
      const text = input.value.trim();
      if (!text) {
        message('日誌に書くことを入れてください', false);
        return;
      }
      await act('api/note', { character, text }, () => {
        input.value = '';
        message('日誌を書きました。次の自分（次の代）の指令書に出ます。', true);
      });
      return;
    }
    if (t.id === 'hand-step') {
      await act('api/step', { character }, (j) => {
        const cases = j.cases ?? [];
        renderCases(cases);
        const won = cases.filter((c) => c.ok === true).length;
        message(j.exit === 0
          ? `歩きました（${j.node}）。全部倒しました。「宣言判定」で次のマスへ進めます。`
          : `歩きました（${j.node}）。まだ落ちているテストがあります${cases.length ? `（${won}/${cases.length}）` : ''}。`, j.exit === 0);
      });
      return;
    }
    if (t.id === 'hand-check') {
      await act('api/check', { character }, (j) => {
        if (j.passed) {
          message(`判定成功。次のマスへ進みました。${j.ready ? `仲間がそろいました。${j.ready} のボス戦（結合テスト）を始めます。` : ''}`, true);
          if (j.ready) toast({ text: `仲間がそろいました。${j.ready} のボス戦を始めます…`, ok: null, type: 'battle' });
        } else {
          message('判定失敗。レベルが1つ下がり、戻されました。盤面のこのマスの記録の「出力」を見て直し、「歩く」で確かめてから宣言してください。', false);
        }
      });
      return;
    }
    if (t.id === 'hand-stamp') {
      const node = data.brief.current.id;
      await act('api/stamp', { node, as: character }, (j) => {
        message(`ハンコを押しました（${node}）。${j.ready ? `仲間がそろいました。${j.ready} のボス戦を始めます。` : ''}`, true);
        if (j.ready) toast({ text: `仲間がそろいました。${j.ready} のボス戦を始めます…`, ok: null, type: 'battle' });
      });
      return;
    }
    if (t.id === 'hand-battle') {
      const gate = data.brief.current.id;
      await act('api/battle', { gate }, () => message(`${gate} のボス戦（結合テスト）を始めました。盤面で結果が出ます。`, true));
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
  };
}
