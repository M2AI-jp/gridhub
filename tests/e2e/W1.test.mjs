// W1「紹介ページの中身」— 看板屋（第17章）。CONTRACTS §75.1・§75.2。
// gridhub.matsunai.com に置く1ページ（site/index.html）が、GridHub をエンジニアにすぐ伝わる言葉で書いているか、字で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, GITHUB, ORIGIN, readSite, textOf, sectionOf, tagsOf, pngSize } from '../helpers9.mjs';

const html = existsSync(join(SITE, 'index.html')) ? readSite('index.html') : '';
const tags = tagsOf(html);
const meta = (key) => tags.find((t) => t.tag === 'meta' && (t.attrs.name === key || t.attrs.property === key))?.attrs.content ?? null;
const part = (id) => {
  const s = sectionOf(html, id);
  assert.ok(s, `#${id} がある`);
  return textOf(s);
};

test('§75.1 site/index.html は日本語の1ページ（lang="ja"・utf-8・viewport・title・description・og）で、スクリプトを使わない', () => {
  assert.ok(html, 'site/index.html がある');
  assert.match(html, /^<!doctype html>/iu);
  assert.equal(tags.find((t) => t.tag === 'html')?.attrs.lang, 'ja');
  assert.ok(tags.some((t) => t.tag === 'meta' && /^utf-8$/iu.test(t.attrs.charset ?? '')), 'meta charset="utf-8"');
  assert.match(meta('viewport') ?? '', /width=device-width/u);
  assert.match(textOf(/<title>([\s\S]*?)<\/title>/u.exec(html)?.[1] ?? ''), /GridHub/u);
  assert.ok((meta('description') ?? '').length >= 40, 'description');
  assert.match(meta('og:title') ?? '', /GridHub/u);
  assert.ok(meta('og:description'), 'og:description');
  assert.equal(meta('og:url'), ORIGIN);
  assert.ok((meta('og:image') ?? '').startsWith(ORIGIN), `og:image は ${ORIGIN} の下`);
  assert.equal(tags.filter((t) => t.tag === 'script').length, 0, '<script> を使わない');
  assert.ok(!tags.some((t) => Object.keys(t.attrs).some((k) => k.startsWith('on'))), 'onclick などを使わない');
  assert.equal(tags.filter((t) => t.tag === 'h1').length, 1, '見出し h1 は1つ');
});

test('§75.2 GridHub とは（#what）: テスト1件=1マス・タスク=ダンジョン・町=Git のコミット・AI と人間のキャラクター・結合テスト・王様の城=人間のハンコ・余白のマス・冒険の書', () => {
  const what = part('what');
  for (const words of [
    ['テスト1件', '1マス', 'gridhub step'],
    ['タスク', 'ダンジョン', '宣言', 'gridhub check'],
    ['町', 'Git のコミット', 'git stash'],
    ['キャラクター', 'AI エージェント', '人間', '縄張り'],
    ['結合テスト', '中ボス', '魔王'],
    ['王様の城', 'ハンコ'],
    ['余白のマス', '会話', '瓦版'],
    ['冒険の書', 'ハッシュ', '封印'],
  ]) {
    for (const w of words) assert.ok(what.includes(w), `#what に「${w}」`);
  }
});

test('§75.2 遊び方は3つ（#play）: Mac のアプリ・5分のチュートリアル（claude なしでも）・自分のアイデアで Claude と', () => {
  const ways = ['way-mac', 'way-tutorial', 'way-idea'].map((id) => {
    const s = sectionOf(sectionOf(html, 'play') ?? '', id);
    assert.ok(s, `#play の中に #${id}`);
    return textOf(s);
  });
  assert.match(ways[0], /Mac/u);
  assert.match(ways[0], /フォルダを選ぶ/u);
  assert.match(ways[1], /5分/u);
  assert.match(ways[1], /チュートリアル/u);
  assert.match(ways[1], /claude が無くても/u);
  assert.match(ways[2], /Claude/u);
  assert.match(ways[2], /gridhub quest/u);
});

test('§75.2 入れ方（#install）: GitHub・git clone と npm run mac・npm install -g github:M2AI-jp/gridhub#v0.3.0・要るもの', () => {
  const install = part('install');
  for (const w of [
    GITHUB.replace('https://', ''),
    `git clone ${GITHUB}.git`,
    'npm run mac',
    'dist/GridHub.app',
    '右クリック',
    'npm install -g github:M2AI-jp/gridhub#v0.3.0',
    'Node.js 22 以上',
    'macOS 13 以上',
    'Command Line Tools',
  ]) assert.ok(install.includes(w), `#install に「${w}」`);
  assert.ok(tags.some((t) => t.tag === 'a' && t.attrs.href === GITHUB), `${GITHUB} へのリンク`);
});

test('§75.2 スクリーンショット4枚（盤面・はじめの画面・手で進める・あがり）。PNG で、alt と、本当の大きさの width・height がある', () => {
  for (const name of ['board', 'start', 'hand', 'ending']) {
    const img = tags.find((t) => t.tag === 'img' && t.attrs.src === `img/${name}.png`);
    assert.ok(img, `<img src="img/${name}.png">`);
    assert.ok((img.attrs.alt ?? '').length >= 10, `${name} の alt`);
    const size = pngSize(readFileSync(join(SITE, 'img', `${name}.png`)));
    assert.ok(size, `${name}.png は PNG`);
    assert.ok(size.width >= 1000, `${name}.png の幅 ${size.width}`);
    assert.deepEqual([Number(img.attrs.width), Number(img.attrs.height)], [size.width, size.height], `${name} の width・height`);
  }
  for (const img of tags.filter((t) => t.tag === 'img')) assert.ok('alt' in img.attrs, `${img.attrs.src} に alt（飾りなら空）`);
});
