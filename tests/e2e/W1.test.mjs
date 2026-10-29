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
  assert.deepEqual(nav, ['#features', '#map', '#how', '#start', GITHUB], 'ヘッダー: 特長・地図・遊び方・はじめる・GitHub');
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

test('§75.2 リポジトリの中だけの言い回しと、ほかのゲームの作品名・決まった言い回しを使わない', () => {
  const text = textOf(body);
  for (const w of ['包み', '入れる', '縄張り', '宣言判定', 'あがり', '封印', '指令書', '出撃', '申し送り', '手で演じる']) {
    assert.ok(!text.includes(w), `「${w}」を使わない`);
  }
  assert.doesNotMatch(text, /(?<!瓦)版/u, '「版」を使わない（瓦版は、ゲームの言葉としてよい）');
  for (const w of ['ドラゴンクエスト', 'ドラクエ', 'ファイナルファンタジー', 'ロマンシング', 'サ・ガ', '聖剣伝説', 'クロノ', 'いのちだいじに', 'ガンガンいこうぜ', 'バッチリがんばれ', '伝承法', '閃き', 'DQ', 'FF']) {
    assert.ok(!text.includes(w), `「${w}」を出さない`);
  }
});

test('§75.2 こんな悩み（#pain）3つと、つなぎの1文。特長（#features）4つ（テストは具体的な例で）', () => {
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
  assert.equal(features.length, 4);
  const titles = features.map((f) => flat(textOf(/<h3>([\s\S]*?)<\/h3>/u.exec(f)?.[1] ?? '')));
  assert.deepEqual(titles, ['進み具合が、ひと目で分かる', '合格したぶんだけ進める', 'AIとパーティを組める', '途中で止まっても、セーブした場所から']);
  for (const f of features) assert.match(f, /<img src="img\/[a-z]+\.svg"/u, '特長は絵つき');
  const all = textOf(part('features'));
  for (const w of ['マスの1つ1つは、「1,200円の食費を記録すると、一覧に出てくる」のような小さなテストです。', '「できたつもり」が起きません', 'Claude Code や Codex', '「冒険の書」に自動でセーブ', '続きのマスから再開できます']) assert.ok(all.includes(w), `#features に「${w}」`);
});

test('§75.2 地図のつくり（#map）: AI の得意・不得意に合わせた大きさの凡例7段と、「テストは、あなたが書かなくて大丈夫」。目安はルールのとおり', () => {
  const map = part('map');
  assert.equal(flat(textOf(sectionOf(map, 'map-title'))), 'AIがいちばん力を出せる大きさで、地図ができています');
  assert.equal(textOf(/<p class="map-lead">([\s\S]*?)<\/p>/u.exec(map)?.[1] ?? ''), 'AI は、小さくてはっきりした仕事が得意です。いっぽうで、長い会話では前のことを忘れやすく、頼んでいない所まで手を広げがちです。GridHub の地図は、その性質に合わせて、1マスから大ボスまでの大きさが決めてあります。');
  assert.deepEqual([...(/<p class="scale"[^>]*>([\s\S]*?)<\/p>/u.exec(map)?.[1] ?? '').matchAll(/<span>([^<]+)<\/span>/gu)].map((m) => m[1]), ['数分', '30〜90分', '数時間', '数日'], '目盛り');
  const rows = [...map.matchAll(/<li class="row s\d">\s*<img src="img\/[a-z]+\.svg"[^>]*>([\s\S]*?)<\/li>/gu)].map((m) => ({
    title: flat(textOf(/<h3>([\s\S]*?)<\/h3>/u.exec(m[1])?.[1] ?? '')),
    dev: textOf(/<span class="dev">([\s\S]*?)<\/span>/u.exec(m[1])?.[1] ?? ''),
    size: textOf(/<span class="size">([\s\S]*?)<\/span>/u.exec(m[1])?.[1] ?? ''),
    ex: textOf(/<p class="ex">([\s\S]*?)<\/p>/u.exec(m[1])?.[1] ?? ''),
  }));
  assert.deepEqual(rows.map((r) => [r.title, r.dev, r.size]), [
    ['マス（モンスター）', 'テスト1件', '数分'],
    ['ダンジョン', 'タスク', '30〜90分（マス2〜6個）'],
    ['町（宿屋）', 'セーブ（Git のコミット）', 'ダンジョン2〜3つごと'],
    ['中ボス', '結合テスト', '数時間に1回'],
    ['王様の城', 'あなたのハンコ', '大ボスの前に必ず1つ'],
    ['大ボス（魔王の城）', '章の最後の結合テスト', '数日に1回'],
    ['イベント（寄り道）', '開発に関係するおしゃべり', '道の途中'],
  ], '小さいものから大きいものへ');
  for (const i of [0, 1, 3, 5]) assert.match(rows[i].ex, /^例:「/u, `${rows[i].title} の例は「例」として書く`);
  const not = textOf(/<aside class="nottest"[\s\S]*?<\/aside>/u.exec(map)?.[0] ?? '');
  assert.ok(flat(not).startsWith('テストは、あなたが書かなくて大丈夫'), '囲みの見出し');
  for (const w of ['「こう動いたら合格」を確かめる小さなプログラムです。', '画面やコマンドを外から動かして確かめます。', 'AI のゲームマスターが、地図といっしょに用意します。', 'AI の仲間がテストを都合よく書き換えると、すぐに分かるようになっています。']) assert.ok(not.includes(w), `囲みに「${w}」`);
  // 目安と仕組みは、ルールのとおり（GAME_DESIGN・GM_GUIDE・盤面の余白のマス）
  const design = readFileSync(join(ROOT, 'docs', 'GAME_DESIGN.md'), 'utf8');
  const guide = readFileSync(join(ROOT, 'docs', 'GM_GUIDE.md'), 'utf8');
  for (const w of ['1マス（数分）', 'ダンジョン（タスク）は 2〜6 マス', '町は 2〜3 ダンジョンごと', '地方（数時間）', '大陸（数日）', 'あがりの手前には必ず1つ', '余白のマスは進みを止めない']) assert.ok(design.includes(w), `GAME_DESIGN に「${w}」`);
  assert.match(guide, /目安 30〜90分/u, 'GM_GUIDE の目安');
  assert.match(guide, /`check` は \*\*E2E\*\*（外から叩く）/u, 'テストは外から確かめる');
  assert.match(readFileSync(join(ROOT, 'src', 'engine', 'margins.js'), 'utf8'), /テスト \$\{passed\} 件、通ってきたね/u, '宿屋の主人のせりふ');
});

test('§75.2 ゲームとして、ここが楽しい（#fun）: 絵つきのカード6〜8枚・1枚2文まで。書いてある仕組みはルールのとおり', () => {
  const fun = part('fun');
  assert.equal(flat(textOf(sectionOf(fun, 'fun-title'))), 'ゲームとして、ここが楽しい');
  const cards = [...fun.matchAll(/<article class="fun">([\s\S]*?)<\/article>/gu)].map((m) => m[1]);
  assert.ok(cards.length >= 6 && cards.length <= 8, `カード ${cards.length}`);
  for (const c of cards) {
    assert.match(c, /<img src="img\/[a-z]+\.svg"/u, '絵つき');
    const p = textOf(/<p>([\s\S]*?)<\/p>/u.exec(c)?.[1] ?? '');
    assert.ok((p.match(/。/gu) ?? []).length <= 2, `1枚2文まで: ${p}`);
  }
  assert.deepEqual(cards.map((c) => flat(textOf(/<h3>([\s\S]*?)<\/h3>/u.exec(c)?.[1] ?? ''))), [
    '練習は何度でも、本番は一発勝負', '倒したモンスターが、仲間になる', '仲間がそろうと、ボス戦が始まる', 'あなたは、作戦を出す指揮官',
    '信頼が増えるほど、先が見えてくる', '代がかわっても、技は受け継がれる', '集めて、眺めて、また遊びたくなる', '方眼ノートの手ざわり',
  ]);
  // 仕組みは、ルールと盤面のとおり
  const design = readFileSync(join(ROOT, 'docs', 'GAME_DESIGN.md'), 'utf8');
  for (const w of ['普通のマスで負けても罰がない', '出口で負けると Lv−1・町からやり直し', '累積判定', '**復活**', '責任のある仲間だけ、町からやり直し', '1マスずつ `step` で確かめる', '次の町まで、ダンジョンを続けて進んでよい', '`視界 = min(Lv−1, 4)`', '「◯代目」', '**技**', 'ちいさなメダル', 'モンスター図鑑', '**宝**', '記録が違えば文も違う', '縦の5mm方眼ノート（B5）']) {
    assert.ok(design.includes(w), `GAME_DESIGN に「${w}」`);
  }
  assert.match(readFileSync(join(ROOT, 'web', 'board', 'app.js'), 'utf8'), /book\.turnTo\(last\.page \+ 1\)/u, '駒が次のページへ進むと、ノートがめくれる');
});

test('§75.2 遊び方（#how）3ステップとチュートリアル・画面（#screens）3枚', () => {
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
