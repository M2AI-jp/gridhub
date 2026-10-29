// アプリの中の言い方（CONTRACTS §74.3）。盤面の担当。
// はじめの画面から開いた盤面（?home=）では、遊び方の指示に出てくる CLI（gridhub check apprentice --as apprentice など）を、
// 盤面のボタンの名前に言い換える。引数の無い「gridhub check」は、作るものの名前のことがあるので、そのままにする。
const BUTTON = { stamp: '「ハンコを押す」', check: '「宣言判定」', step: '「歩く」', brief: '「手で進める」' };
const CLI = /\s*\b(?:gridhub|masume)\s+(stamp|check|step|brief)(?:\s+(?:--?[A-Za-z][\w-]*|[\w<>][\w.<>-]*))+\s*/gu;

export function appWords(text) {
  return String(text ?? '').replace(CLI, (_, command) => BUTTON[command]);
}

/** アプリの中なら言い換え、外ならそのまま */
export const wordsFor = (app) => (app ? appWords : (text) => String(text ?? ''));
