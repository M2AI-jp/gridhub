// 第15章の判定の共通道具（旧名の見つけ方）。GM の縄張り・封印対象。キャラクターは編集しないこと。CONTRACTS §64.1。
export * from './helpers6.mjs';

// 旧名だと分かる書き方。これだけは書いてよい
const ALLOWED = /旧名\s?マスメ|旧名はマスメ/gu;

/** 旧名「マスメ」を名前として使っている行 [{line, text}]（旧名だと分かる書き方は除く） */
export function oldNameHits(text) {
  return String(text)
    .split('\n')
    .map((t, i) => ({ line: i + 1, text: t }))
    .filter(({ text: t }) => t.replace(ALLOWED, '').includes('マスメ'));
}

/** 失敗の知らせ用: [{line, text}] を「<file>:<line> <text>」の行に */
export function showHits(file, hits) {
  return hits.map((h) => `${file}:${h.line} ${h.text.trim().slice(0, 120)}`).join('\n');
}
