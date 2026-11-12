// D4「Mac のアプリも、ことばを切り替える」— 大工。CONTRACTS §76.7。
// Swift はこの判定の場所（Linux）では組めないので、ソースの約束だけを確かめる（D1 と同じやり方）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers.mjs';

const src = () => readFileSync(join(ROOT, 'mac', 'GridHub.swift'), 'utf8');
const has = (re, what) => assert.match(src(), re, what);

test('§76.7 web 側の postMessage({type: "words"}) を受けて UserDefaults に覚え、ページを描く前に window.__gridhubWords で渡す', () => {
  has(/case\s+"words"\s*:/, 'スクリプトの窓口で "words" を受ける');
  has(/UserDefaults\.standard\.set\(/, 'UserDefaults に覚える');
  has(/UserDefaults\.standard\.string\(forKey:/, 'UserDefaults から読む');
  has(/"GridHubWords"/, '覚える鍵は GridHubWords');
  has(/WKUserScript\(/, 'WKUserScript でページに渡す');
  has(/window\.__gridhubWords\s*=/, 'window.__gridhubWords に入れる');
  has(/injectionTime:\s*\.atDocumentStart/, 'ページを描く前に入れる');
  has(/removeAllUserScripts\(\)/, '切り替わったら入れ直す');
  has(/enum Words/, 'ことばの型');
  has(/case game\b/, 'game');
  has(/case dev\b/, 'dev');
});

test('§76.7 アプリ自身の字（フォルダのダイアログ・起動中と起動できなかったときの知らせ）は、両方のことばを持つ', () => {
  for (const [game, dev] of [
    ['このフォルダで遊ぶ', 'このフォルダを開く'],
    ['冒険の書のあるフォルダか', 'セーブデータ（.masume）のあるフォルダか'],
    ['盤面を配る GridHub（Node.js）を起こしています', '盤面のサーバー（Node.js）を起動しています'],
    ['GridHub を起こせませんでした', 'GridHub を起動できませんでした'],
  ]) {
    assert.ok(src().includes(game), `冒険のことば「${game}」`);
    assert.ok(src().includes(dev), `開発のことば「${dev}」`);
  }
  // どちらでも同じ字（D1 が見ているもの）は残っている
  for (const w of ['Node.js 22 以上', 'nodejs.org', 'brew install node', 'もう一度さがす', 'はじめの画面']) assert.ok(src().includes(w), `字「${w}」`);
});

test('§76.7 web 側: boot.js と words.js が window.__gridhubWords を読み、切り替えたらアプリに知らせる', () => {
  const boot = readFileSync(join(ROOT, 'web', 'board', 'boot.js'), 'utf8');
  const words = readFileSync(join(ROOT, 'web', 'board', 'words.js'), 'utf8');
  assert.match(boot, /window\.__gridhubWords/);
  assert.match(words, /window\.__gridhubWords/);
  assert.match(words, /type:\s*'words'/, 'postMessage({type: "words"})');
  assert.match(words, /messageHandlers\?\.gridhub\?\.postMessage/, 'アプリの外では何もしない（窓口が無ければ呼ばない）');
});
