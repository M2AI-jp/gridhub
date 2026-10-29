// W1「紹介ページの中身」— 看板屋（第17章）。CONTRACTS §75.1・§75.2。
// gridhub.matsunai.com に置く1ページ（site/index.html）が、ゲームの紹介ページとして、ふつうのサービス紹介の日本語で書かれているか。
// 開発の記録（seq・発言の引用・コミット番号・開発の日付・体制や数字の欄）が載っていないか。書いてある事実がリポジトリと合うか。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, GITHUB, ORIGIN, readSite, textOf, sectionOf, tagsOf, pngSize } from '../helpers9.mjs';

const html = existsSync(join(SITE, 'index.html')) ? readSite('index.html') : '';
const tags = tagsOf(html);
const meta = (key) => tags.find((t) => t.tag === 'meta' && (t.attrs.name === key || t.attrs.property === key))?.attrs.content ?? null;
const flat = (s) => s.replace(/\s+/gu, '');
const part = (id) => {
  const s = sectionOf(html, id);
  assert.ok(s, `#${id} がある`);
  return s;
};
const body = html.slice(html.indexOf('<body'));
const DESCRIPTION = 'テストが1つ通るたびに、キャラクターが1マス進む。AI エージェントとパーティを組んで、ゲーム感覚で開発を進める、方眼ノートのすごろくです。';
const LEAD = 'テストが1つ通るたびに、キャラクターが1マス進む。AI エージェントとパーティを組んで、ゲーム感覚で開発を進めよう。';

test('§75.1 site/index.html は日本語の1ページ（lang="ja"・utf-8・viewport・title・description・og）で、スクリプトを使わない', () => {
  assert.ok(html, 'site/index.html がある');
  assert.match(html, /^<!doctype html>/iu);
  assert.equal(tags.find((t) => t.tag === 'html')?.attrs.lang, 'ja');
  assert.ok(tags.some((t) => t.tag === 'meta' && /^utf-8$/iu.test(t.attrs.charset ?? '')), 'meta charset="utf-8"');
  assert.match(meta('viewport') ?? '', /width=device-width/u);
  assert.equal(textOf(/<title>([\s\S]*?)<\/title>/u.exec(html)?.[1] ?? ''), 'GridHub — 退屈な開発を、楽しいゲームに。');
  assert.equal(meta('description'), DESCRIPTION);
  assert.match(meta('og:title') ?? '', /GridHub/u);
  assert.ok(meta('og:description'), 'og:description');
  assert.equal(meta('og:url'), ORIGIN);
  assert.ok((meta('og:image') ?? '').startsWith(ORIGIN), `og:image は ${ORIGIN} の下`);
  assert.equal(tags.filter((t) => t.tag === 'script').length, 0, '<script> を使わない');
  assert.ok(!tags.some((t) => Object.keys(t.attrs).some((k) => k.startsWith('on'))), 'onclick などを使わない');
  assert.equal(tags.filter((t) => t.tag === 'h1').length, 1, '見出し h1 は1つ');
  const nav = tagsOf(/<nav[\s\S]*?<\/nav>/u.exec(body)?.[0] ?? '').filter((t) => t.tag === 'a').map((t) => t.attrs.href);
  assert.deepEqual(nav, ['#features', '#how', '#start', GITHUB], 'ヘッダー: 特長・遊び方・はじめる・GitHub');
});

test('§75.2 ファーストビュー（#hero）は文字が少なく、絵が主役: ラベル・見出し2行・説明1つ・ボタン2つ、盤面の写真と駒やモンスターの絵', () => {
  const hero = part('hero');
  assert.equal(flat(textOf(sectionOf(hero, 'hero-title'))), '退屈な開発を、楽しいゲームに。');
  assert.equal((sectionOf(hero, 'hero-title').match(/<br>/gu) ?? []).length, 1, '見出しは2行');
  const ps = [...hero.matchAll(/<p class="([^"]+)">([\s\S]*?)<\/p>/gu)].map((m) => [m[1], textOf(m[2])]);
  assert.deepEqual(ps.map(([c]) => c), ['badge', 'hero-lead', 'actions'], '文字はラベル・説明・ボタンだけ');
  assert.equal(ps[0][1], '無料・オープンソース');
  assert.equal(ps[1][1], LEAD);
  const links = tagsOf(hero).filter((t) => t.tag === 'a');
  assert.deepEqual(links.map((a) => a.attrs.href), ['#start', GITHUB]);
  assert.deepEqual([...hero.matchAll(/<a class="btn[^"]*"[^>]*>([^<]+)<\/a>/gu)].map((m) => m[1]), ['Mac で遊んでみる', 'GitHub を見る']);
  assert.ok(flat(textOf(hero)).length <= 110, `ファーストビューの字は少なく（${flat(textOf(hero)).length} 字）`);
  const imgs = tagsOf(hero).filter((t) => t.tag === 'img');
  assert.ok(imgs.some((i) => i.attrs.src === 'img/board.png'), '盤面の写真');
  assert.ok(imgs.filter((i) => /^img\/[a-z]+\.svg$/u.test(i.attrs.src)).length >= 5, '駒やモンスターの絵を5つ以上');
});

test('§75.2 開発の記録を載せない（seq・発言の引用・コミット番号・開発の日付・体制や数字の欄・GridHub 自身の冒険の写真）', () => {
  const text = textOf(body);
  assert.doesNotMatch(text, /seq\s*\d/iu, 'seq');
  assert.doesNotMatch(text, /\b[0-9a-f]{7,40}\b/u, 'コミット番号');
  assert.doesNotMatch(text, /20\d\d\s*[-/年]\s*\d|\b(?:9|10|11|12)-\d{1,2}\b|\d{1,2}月\d{1,2}日/u, '開発の日付');
  for (const w of ['監督', 'GM', '体制', '実録', '14日間', '全滅', '依頼', '兄', 'セーブデータ』', 'コンテキストは有限', '賢者クロード', '書記', 'マスメ', 'ことづけ', 'コミット 1', '向いていない']) {
    assert.ok(!text.includes(w), `「${w}」を載せない`);
  }
  for (const id of ['days', 'team', 'numbers', 'fit', 'origin']) assert.ok(!html.includes(`id="${id}"`), `#${id} を置かない`);
  assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+|\/Users\/|\/home\//u, 'メールアドレス・手元のパス');
  assert.doesNotMatch(text, /\d+(\.\d+)?\s*倍/u, '確かめられない数を書かない');
  // 盤面の写真は、サンプルの冒険で撮る（このリポジトリ自身の冒険の書を配らない）
  const tool = readFileSync(join(ROOT, 'tools', 'site-shots.mjs'), 'utf8');
  assert.doesNotMatch(tool, /'--dir',\s*ROOT\b/u, '撮影の道具が、このリポジトリの冒険の書を配らない');
  assert.match(tool, /examples', 'memo'/u, '盤面はサンプル（examples/memo）で撮る');
});

test('§75.2 リポジトリの中だけの言い回しは、ゲームの言葉と開発の言葉の表（#words）の外では使わない', () => {
  const words = sectionOf(body, 'words') ?? '';
  const text = textOf(body.replace(words, ''));
  for (const w of ['包み', '版', '入れる', '縄張り', '宣言判定', 'あがり', '封印', '指令書', '出撃', '申し送り', '手で演じる']) {
    assert.ok(!text.includes(w), `「${w}」を使わない`);
  }
});

test('§75.2 こんな悩み（#pain）3つと、つなぎの1文。特長（#features）6つ', () => {
  const pain = part('pain');
  const pains = [...pain.matchAll(/<li class="pain">([\s\S]*?)<\/li>/gu)].map((m) => m[1]);
  assert.equal(pains.length, 3);
  for (const p of pains) assert.match(p, /<img src="img\/[a-z]+\.svg"/u, '絵つき');
  assert.deepEqual(pains.map((p) => textOf(p)), [
    'AI に開発を任せたけれど、いまどこまで進んでいるのか分からない。',
    '「できました」と言われても、本当に動くのか不安になる。',
    'タスク管理は文字のリストばかりで、見ていてちっとも楽しくない。',
  ]);
  assert.equal(textOf(/<p class="bridge">([\s\S]*?)<\/p>/u.exec(pain)?.[1] ?? ''), 'GridHub は、開発の進み具合をすごろくの盤面にします。見ればすぐ分かって、進むのが楽しくなります。');
  const features = [...part('features').matchAll(/<article class="feature">([\s\S]*?)<\/article>/gu)].map((m) => m[1]);
  assert.equal(features.length, 6);
  const titles = features.map((f) => flat(textOf(/<h3>([\s\S]*?)<\/h3>/u.exec(f)?.[1] ?? '')));
  assert.deepEqual(titles, ['進み具合が、ひと目で分かる', 'テストに通ったぶんだけ進める', 'AIとパーティを組める', 'ボス戦で、みんなの仕事を確かめる', '途中で止まっても、セーブした場所から', '寄り道も、開発の一部']);
  for (const f of features) assert.match(f, /<img src="img\/[a-z]+\.svg"/u, '特長は絵つき');
  const all = textOf(part('features'));
  for (const w of ['Claude Code や Codex', '結合テストのボス戦', '「冒険の書」に自動でセーブ', '続きのマスから再開できます', '「できたつもり」が起きません']) assert.ok(all.includes(w), `#features に「${w}」`);
});

test('§75.2 ゲームの言葉と開発の言葉（#words）・遊び方（#how）3ステップとチュートリアル・画面（#screens）3枚', () => {
  const rows = [...part('words').matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/gu)].map((m) => [textOf(m[1]), textOf(m[2])]);
  assert.deepEqual(rows, [
    ['マス', 'テスト1件'],
    ['ダンジョン', 'タスク'],
    ['町', 'Git のコミット（セーブ）'],
    ['ボス戦', '結合テスト'],
    ['王様の城', 'あなたの承認（ハンコ）'],
    ['冒険の書', '進み具合の記録'],
  ]);
  const how = part('how');
  const steps = [...how.matchAll(/<li class="step">([\s\S]*?)<\/li>/gu)].map((m) => m[1]);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((s) => flat(textOf(/<h3>([\s\S]*?)<\/h3>/u.exec(s)?.[1] ?? ''))), ['作りたいものを書く', '地図ができる', '冒険に出発']);
  for (const s of steps) assert.match(s, /<span class="num">\d<\/span>\s*<img src="img\/[a-z]+\.svg"/u, '番号と絵つき');
  assert.equal(flat(textOf(/<p class="callout">([\s\S]*?)<\/p>/u.exec(how)?.[1] ?? '')), flat('まずは5分のチュートリアルから。AI がなくても、最後まで遊べます。'));
  const shots = [...part('screens').matchAll(/<figure[^>]*>\s*<img src="img\/(\w+)\.png"[\s\S]*?<figcaption><b>([^<]+)<\/b>([^<]+)<\/figcaption>/gu)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(shots, [
    ['start', 'はじめの画面', 'フォルダを選ぶだけで始まります。'],
    ['hand', '手で進める', 'あなたもキャラクターになって遊べます。'],
    ['ending', 'エンディング', 'クリアすると、毎回ちがうエンディングが流れます。'],
  ]);
});

test('§75.2 はじめる（#start）とフッター。書いてある事実（必要なもの・コマンド・対応エージェント・AI なしのチュートリアル）がリポジトリと合う', () => {
  const start = part('start');
  const text = textOf(start);
  assert.ok(text.includes('必要なもの: macOS 13 以上・Node.js 22 以上・Command Line Tools'));
  const codes = [...start.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/gu)].map((m) => m[1].split('\n').map((line) => textOf(line)).filter(Boolean));
  assert.deepEqual(codes, [
    ['git clone https://github.com/M2AI-jp/gridhub.git', 'cd gridhub', 'npm run mac'],
    ['npm install -g github:M2AI-jp/gridhub#v0.3.0', 'gridhub --help'],
  ]);
  assert.ok(text.includes('dist/GridHub.app を「アプリケーション」フォルダに移して、ダブルクリックで開きます。'));
  assert.ok(text.includes('「開けません」と表示されたときは、右クリックして「開く」を選んでください。'));
  assert.ok(text.includes('Claude Code か Codex を用意しておきます。'));
  // 事実: npm run mac・macOS 13・Node.js 22・--help・エージェントは claude と codex・AI なしで遊べるチュートリアル
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.mac, 'sh mac/build.sh');
  assert.equal(pkg.engines.node, '>=22');
  assert.match(readFileSync(join(ROOT, 'mac', 'Info.plist'), 'utf8'), /<key>LSMinimumSystemVersion<\/key>\s*<string>13\.0<\/string>/u);
  const help = spawnSync(process.execPath, [join(ROOT, 'bin', 'gridhub.js'), '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, 'gridhub --help');
  assert.match(help.stdout, /party \[--agent claude\|codex\]/u, 'エージェントは Claude Code と Codex');
  assert.ok(existsSync(join(ROOT, 'quests', 'tutorial', 'SOLUTIONS.json')), 'AI なしで遊べるチュートリアル（見本つき）');
  const footer = /<footer[\s\S]*?<\/footer>/u.exec(body)?.[0] ?? '';
  assert.equal(textOf(footer).replace(/\s+/gu, ' '), 'GridHub ・ MIT ライセンス ・ GitHub', 'フッターはこれだけ');
  assert.deepEqual(tagsOf(footer).filter((t) => t.tag === 'a').map((a) => a.attrs.href), [GITHUB]);
  assert.match(readFileSync(join(ROOT, 'LICENSE'), 'utf8'), /^MIT License/u);
});

test('§75.2 スクリーンショット4枚（盤面・はじめの画面・手で進める・エンディング）。PNG で、alt と、本当の大きさの width・height がある', () => {
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
