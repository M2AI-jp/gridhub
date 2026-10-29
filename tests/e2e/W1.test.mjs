// W1「紹介ページの中身」— 看板屋（第17章）。CONTRACTS §75.1・§75.2。
// gridhub.matsunai.com に置く2ページ（はじめての方へ site/index.html・エンジニアの方へ site/engineers.html）が、ふつうのサービス紹介の日本語で書かれ、タブで行き来できるか。
// 開発の記録・家計簿の例・ユーザーが例に挙げた言い回しが載っていないか。技術の固有名詞を省略していないか。書いてある事実がリポジトリと合うか。
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, GITHUB, ORIGIN, readSite, decode, textOf, sectionOf, tagsOf, pngSize } from '../helpers9.mjs';

const PAGES = { index: 'index.html', engineers: 'engineers.html' };
const KEYS = Object.keys(PAGES);
const html = Object.fromEntries(KEYS.map((k) => [k, existsSync(join(SITE, PAGES[k])) ? readSite(PAGES[k]) : '']));
const body = Object.fromEntries(KEYS.map((k) => [k, html[k].slice(html[k].indexOf('<body'))]));
const tags = Object.fromEntries(KEYS.map((k) => [k, tagsOf(html[k])]));
const metaOf = (k, key) => tags[k].find((t) => t.tag === 'meta' && (t.attrs.name === key || t.attrs.property === key))?.attrs.content ?? null;
const flat = (s) => s.replace(/\s+/gu, '');
const part = (k, id) => {
  const s = sectionOf(html[k], id);
  assert.ok(s, `${PAGES[k]} に #${id} がある`);
  return s;
};
const h3s = (s) => [...s.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gu)].map((m) => flat(textOf(m[1])));
const codes = (s) => [...s.matchAll(/<pre><code>([\s\S]*?)<\/code><\/pre>/gu)].map((m) => m[1].split('\n').map((line) => textOf(line)).filter(Boolean));
/** コードの字（pre・code）を除いた字 */
const prose = (s) => textOf(s.replace(/<pre[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/gu, ' '));
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const help = spawnSync(process.execPath, [join(ROOT, 'bin', 'gridhub.js'), '--help'], { encoding: 'utf8' });
const memo = JSON.parse(read('examples', 'memo', 'quest.map.json'));
const pkg = JSON.parse(read('package.json'));

const HEAD = {
  index: {
    title: 'GridHub — 1マス進むたび、アプリができていく。',
    description: '作りたいものを書けば、AI の仲間が開発を方眼ノートのすごろくにして、1マスずつ進めていきます。テストに1つ合格するたびに、キャラクターが1マス進みます。',
    url: ORIGIN,
    nav: ['#features', '#map', '#how', '#start', GITHUB],
  },
  engineers: {
    title: 'GridHub — テスト1件が1マスの、AI エージェント開発の進行管理',
    description: 'Claude Code や Codex に任せた開発を、E2E テストと Git で1マスずつ進める、すごろく型の進行管理ツール。Node.js 22 以上、外部パッケージなし、MIT ライセンス。',
    url: `${ORIGIN}engineers.html`,
    nav: ['#stack', '#mechanics', '#example', '#start', GITHUB],
  },
};

test('§75.1 2ページ（site/index.html・site/engineers.html）は、どちらも日本語のページ（lang="ja"・utf-8・viewport・title・description・og・アイコン）で、スクリプトを使わない。ヘッダーの目次はそのページの節へ', () => {
  for (const k of KEYS) {
    const at = `site/${PAGES[k]}`;
    assert.ok(html[k], `${at} がある`);
    assert.match(html[k], /^<!doctype html>/iu, at);
    assert.equal(tags[k].find((t) => t.tag === 'html')?.attrs.lang, 'ja', at);
    assert.ok(tags[k].some((t) => t.tag === 'meta' && /^utf-8$/iu.test(t.attrs.charset ?? '')), `${at}: meta charset="utf-8"`);
    assert.match(metaOf(k, 'viewport') ?? '', /width=device-width/u, at);
    assert.equal(textOf(/<title>([\s\S]*?)<\/title>/u.exec(html[k])?.[1] ?? ''), HEAD[k].title, `${at} の title`);
    assert.equal(metaOf(k, 'description'), HEAD[k].description, `${at} の description`);
    assert.equal(metaOf(k, 'og:title'), HEAD[k].title, `${at} の og:title`);
    assert.equal(metaOf(k, 'og:description'), HEAD[k].description, `${at} の og:description`);
    assert.equal(metaOf(k, 'og:url'), HEAD[k].url, `${at} の og:url`);
    assert.ok((metaOf(k, 'og:image') ?? '').startsWith(ORIGIN), `${at}: og:image は ${ORIGIN} の下`);
    assert.ok(tags[k].some((t) => t.tag === 'link' && t.attrs.rel === 'icon' && t.attrs.href === 'img/icon.png'), `${at} のアイコン`);
    assert.equal(tags[k].filter((t) => t.tag === 'script').length, 0, `${at}: <script> を使わない`);
    assert.ok(!tags[k].some((t) => Object.keys(t.attrs).some((a) => a.startsWith('on'))), `${at}: onclick などを使わない`);
    assert.equal(tags[k].filter((t) => t.tag === 'h1').length, 1, `${at}: 見出し h1 は1つ`);
    const header = /<header class="top">[\s\S]*?<\/header>/u.exec(body[k])?.[0] ?? '';
    const nav = tagsOf(/<nav[\s\S]*?<\/nav>/u.exec(header)?.[0] ?? '').filter((t) => t.tag === 'a').map((t) => t.attrs.href);
    assert.deepEqual(nav, HEAD[k].nav, `${at} のヘッダーの目次`);
    for (const href of nav.filter((x) => x.startsWith('#'))) assert.ok(sectionOf(html[k], href.slice(1)), `${at} に ${href}`);
  }
});

test('§75.2 2ページとも、ヘッダーのすぐ下に同じタブ（はじめての方へ → index.html・エンジニアの方へ → engineers.html）。いまのページのタブに aria-current="page"', () => {
  const tabs = {};
  for (const k of KEYS) {
    const m = /<\/header>\s*(<nav class="tabs"[^>]*>[\s\S]*?<\/nav>)/u.exec(body[k]);
    assert.ok(m, `${PAGES[k]}: ヘッダーのすぐ下にタブ（nav.tabs）`);
    tabs[k] = m[1];
    const links = tagsOf(m[1]).filter((t) => t.tag === 'a');
    assert.deepEqual(links.map((a) => a.attrs.href), ['index.html', 'engineers.html'], `${PAGES[k]}: タブのリンク（相対パス）`);
    assert.deepEqual([...m[1].matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gu)].map((x) => textOf(x[1])), ['はじめての方へ', 'エンジニアの方へ'], `${PAGES[k]}: タブの名前`);
    assert.deepEqual(links.filter((a) => a.attrs['aria-current'] === 'page').map((a) => a.attrs.href), [PAGES[k]], `${PAGES[k]}: いまのページのタブに印`);
  }
  const plain = (s) => s.replace(/\s+aria-current="page"/gu, '');
  assert.equal(plain(tabs.index), plain(tabs.engineers), '2ページで同じタブ（印の場所だけが違う）');
});

test('§75.2 2ページとも、開発の記録とメタな話を載せない・例に家計簿を出さない・ユーザーが例に挙げた言い回し（「退屈な開発を、楽しいゲームに」「ゲーム感覚で」）を使わない', () => {
  for (const k of KEYS) {
    const at = PAGES[k];
    const text = textOf(body[k]);
    const whole = flat(decode(html[k]));
    for (const w of ['退屈な開発', '楽しいゲームに', 'ゲーム感覚']) assert.ok(!whole.includes(w), `${at}: 「${w}」を使わない（<head> の中も）`);
    for (const w of ['家計簿', 'kakeibo', '食費', '支出', '1,200円']) assert.ok(!whole.includes(w), `${at}: 家計簿の例（「${w}」）を出さない`);
    assert.doesNotMatch(text, /seq\s*\d/iu, `${at}: seq`);
    assert.doesNotMatch(text, /\b[0-9a-f]{7,40}\b/u, `${at}: コミット番号`);
    assert.doesNotMatch(text, /20\d\d\s*[-/年]\s*\d|\b(?:9|10|11|12)-\d{1,2}\b|\d{1,2}月\d{1,2}日/u, `${at}: 開発の日付`);
    const words = ['監督', '体制', '実録', '14日間', '全滅', '依頼', '兄', 'セーブデータ』', 'コンテキストは有限', '賢者クロード', '書記', 'マスメ', 'ことづけ', 'コミット 1', '向いていない', 'このリポジトリ', 'GridHub で作', 'GridHub 自身', '自分自身'];
    if (k === 'index') words.push('GM');
    for (const w of words) assert.ok(!text.includes(w), `${at}: 「${w}」を載せない`);
    for (const id of ['days', 'team', 'numbers', 'fit', 'origin']) assert.ok(!html[k].includes(`id="${id}"`), `${at}: #${id} を置かない`);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+|\/Users\/|\/home\//u, `${at}: メールアドレス・手元のパス`);
    assert.doesNotMatch(text, /\d+(\.\d+)?\s*倍/u, `${at}: 確かめられない数を書かない`);
  }
  // 盤面の写真は、サンプルの冒険で撮る（このリポジトリ自身の冒険の書を配らない）
  const tool = read('tools', 'site-shots.mjs');
  assert.doesNotMatch(tool, /'--dir',\s*ROOT\b/u, '撮影の道具が、このリポジトリの冒険の書を配らない');
  assert.match(tool, /examples', 'memo'/u, '盤面はサンプル（examples/memo）で撮る');
});

test('§75.2 リポジトリの中だけの言い回し: はじめての方へは使わない。エンジニアの方へは、技術の意味のあとのかっこ（「判定ファイルの固定（封印）」）でだけ。ほかのゲームの作品名・決まった言い回しは2ページとも出さない', () => {
  const text = textOf(body.index);
  for (const w of ['包み', '入れる', '縄張り', '宣言判定', 'あがり', '封印', '指令書', '出撃', '申し送り', '手で演じる']) assert.ok(!text.includes(w), `はじめての方へ: 「${w}」を使わない`);
  const eng = prose(body.engineers).replace(/（(?:封印|縄張り|出撃)）/gu, '');
  for (const w of ['包み', '入れる', '縄張り', '宣言判定', 'あがり', '封印', '指令書', '出撃', '申し送り', '手で演じる']) assert.ok(!eng.includes(w), `エンジニアの方へ: 「${w}」は、コードの外では技術の意味のあとのかっこでだけ`);
  assert.match(textOf(body.engineers), /判定ファイルの固定\s*（封印）/u, '技術の意味が先');
  assert.match(textOf(body.engineers), /担当の範囲\s*（縄張り）/u, '技術の意味が先');
  for (const k of KEYS) {
    const all = textOf(body[k]);
    assert.doesNotMatch(all, /(?<!瓦)版/u, `${PAGES[k]}: 「版」を使わない（瓦版は、ゲームの言葉としてよい）`);
    for (const w of ['ドラゴンクエスト', 'ドラクエ', 'ファイナルファンタジー', 'ロマンシング', 'サ・ガ', '聖剣伝説', 'クロノ', 'いのちだいじに', 'ガンガンいこうぜ', 'バッチリがんばれ', '伝承法', '閃き', 'DQ', 'FF']) {
      assert.ok(!all.includes(w), `${PAGES[k]}: 「${w}」を出さない`);
    }
  }
});

test('§75.2 2ページとも、使う道具の名前を省略しない（Claude Code・Codex・Anthropic・OpenAI・Git・GitHub・Node.js・API キー）', () => {
  for (const k of KEYS) {
    const text = textOf(body[k]);
    for (const w of ['Claude Code', 'Codex', 'Anthropic', 'OpenAI', 'GitHub', 'Node.js', 'API キー']) assert.ok(text.includes(w), `${PAGES[k]} に「${w}」`);
    assert.match(text, /\bGit\b(?!Hub)/u, `${PAGES[k]} に「Git」`);
  }
});

// ---- はじめての方へ（index.html） ----

test('§75.2 はじめての方へ: ファーストビュー（#hero）は文字が少なく、絵が主役: ラベル・見出し2行・説明1つ・ボタン2つ、盤面の写真と駒やモンスターの絵', () => {
  const hero = part('index', 'hero');
  assert.equal(flat(textOf(sectionOf(hero, 'hero-title'))), '1マス進むたび、アプリができていく。');
  assert.equal((sectionOf(hero, 'hero-title').match(/<br>/gu) ?? []).length, 1, '見出しは2行');
  assert.match(sectionOf(hero, 'hero-title'), /進むたび、<\/span><br>/u, '「1マス進むたび、／アプリができていく。」で折る');
  const ps = [...hero.matchAll(/<p class="([^"]+)">([\s\S]*?)<\/p>/gu)].map((m) => [m[1], textOf(m[2])]);
  assert.deepEqual(ps.map(([c]) => c), ['badge', 'hero-lead', 'actions'], '文字はラベル・説明・ボタンだけ');
  assert.equal(ps[0][1], '無料・オープンソース');
  assert.equal(ps[1][1], '作りたいものを書けば、AI の仲間が開発を方眼ノートのすごろくにして、1マスずつ進めていきます。');
  assert.deepEqual(tagsOf(hero).filter((t) => t.tag === 'a').map((a) => a.attrs.href), ['#start', GITHUB]);
  assert.deepEqual([...hero.matchAll(/<a class="btn[^"]*"[^>]*>([^<]+)<\/a>/gu)].map((m) => m[1]), ['Mac で遊んでみる', 'GitHub を見る']);
  assert.ok(flat(textOf(hero)).length <= 110, `ファーストビューの字は少なく（${flat(textOf(hero)).length} 字）`);
  const imgs = tagsOf(hero).filter((t) => t.tag === 'img');
  assert.ok(imgs.some((i) => i.attrs.src === 'img/board.png'), '盤面の写真');
  assert.ok(imgs.filter((i) => /^img\/[a-z]+\.svg$/u.test(i.attrs.src)).length >= 5, '駒やモンスターの絵を5つ以上');
});

test('§75.2 はじめての方へ: こんな悩み（#pain）3つと、つなぎの1文。特長（#features）4つ（テストはメモアプリの例で。AI と Git と GitHub は名前で）', () => {
  const pain = part('index', 'pain');
  const pains = [...pain.matchAll(/<li class="pain">([\s\S]*?)<\/li>/gu)].map((m) => m[1]);
  assert.equal(pains.length, 3);
  for (const p of pains) assert.match(p, /<img src="img\/[a-z]+\.svg"/u, '絵つき');
  assert.deepEqual(pains.map((p) => textOf(p)), [
    'AI に開発を任せたけれど、いまどこまで進んでいるのか分からない。',
    '「できました」と言われても、本当に動くのか不安になる。',
    'タスク管理は文字のリストばかりで、見ていてちっとも楽しくない。',
  ]);
  assert.equal(textOf(/<p class="bridge">([\s\S]*?)<\/p>/u.exec(pain)?.[1] ?? ''), 'GridHub は、開発の進み具合をすごろくの盤面にします。見ればすぐ分かって、進むのが楽しくなります。');
  const features = [...part('index', 'features').matchAll(/<article class="feature">([\s\S]*?)<\/article>/gu)].map((m) => m[1]);
  assert.equal(features.length, 4);
  assert.deepEqual(features.map((f) => h3s(f)[0]), ['進み具合が、ひと目で分かる', '合格したぶんだけ進める', 'AIとパーティを組める', '途中で止まっても、セーブした場所から']);
  for (const f of features) assert.match(f, /<img src="img\/[a-z]+\.svg"/u, '特長は絵つき');
  const all = textOf(part('index', 'features'));
  for (const w of [
    'マスの1つ1つは、「メモを1件書くと、一覧のいちばん上に出てくる」のような小さなテストです。合格しないと先へ進めないので、「できたつもり」が起きません。',
    'Claude Code（Anthropic）か Codex（OpenAI）が、担当ごとのキャラクターになって冒険に出発します。あなたも勇者として、同じ盤面で遊べます。',
    '進み具合は「冒険の書」に、作ったファイルは Git に、自動でセーブされます。AI との会話が途切れても、続きのマスから再開できます。セーブは GitHub に送っておくこともできます。',
  ]) assert.ok(all.includes(w), `#features に「${w}」`);
  // 例はサンプルの冒険のとおり: 一覧は新しい順（S1）
  assert.match(memo.nodes.S1.detail, /list が新しい順/u);
});

test('§75.2 はじめての方へ: 地図のつくり（#map）: AI の得意・不得意に合わせた大きさの凡例7段（メモアプリの例つき）と、「テストは、あなたが書かなくて大丈夫」。目安はルールのとおり', () => {
  const map = part('index', 'map');
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
  assert.deepEqual(rows.map((r) => r.ex), [
    '例:「メモを1件書くと、一覧のいちばん上に出てくる」',
    '例:「メモを保存して、一覧に出す」',
    '',
    '例:「アプリを止めて動かし直しても、メモが消えていない」（保存の担当と、サーバーの担当が合流）',
    '例:「ブラウザで実際に触ってみて、よければハンコ」',
    '例:「メモを書いて、一覧で見られる。探す・直す・消すもできる」',
    '',
  ], 'メモアプリの例');
  const not = textOf(/<aside class="nottest"[\s\S]*?<\/aside>/u.exec(map)?.[0] ?? '');
  assert.ok(flat(not).startsWith('テストは、あなたが書かなくて大丈夫'), '囲みの見出し');
  for (const w of ['「こう動いたら合格」を確かめる小さなプログラムです。', '画面やコマンドを外から動かして確かめます。', 'AI のゲームマスター（Claude Code か Codex）が、地図といっしょに用意します。', 'AI の仲間がテストを都合よく書き換えると、すぐに分かるようになっています。']) assert.ok(not.includes(w), `囲みに「${w}」`);
  // 例はサンプルの冒険のとおり: 中ボス G1 は保存（store）とサーバー（api）の合流で、再起動後も残る。王様の城 H2 はブラウザで触る。大ボスは探す・直す・消す
  assert.deepEqual(memo.characters.filter((c) => c.path.includes('G1')).map((c) => c.module), ['メモの保存（ファイル）', 'HTTP サーバーと API']);
  assert.match(memo.nodes.G1.title, /再起動後も残る/u);
  assert.equal(memo.nodes.H2.title, 'ブラウザで触って承認');
  for (const w of ['絞り込める', '直せる', '消せる']) assert.ok(memo.nodes.GOAL.detail.includes(w), `GOAL の判定に「${w}」`);
  // 目安と仕組みは、ルールのとおり（GAME_DESIGN・GM_GUIDE・盤面の余白のマス）
  const design = read('docs', 'GAME_DESIGN.md');
  const guide = read('docs', 'GM_GUIDE.md');
  for (const w of ['1マス（数分）', 'ダンジョン（タスク）は 2〜6 マス', '町は 2〜3 ダンジョンごと', '地方（数時間）', '大陸（数日）', 'あがりの手前には必ず1つ', '余白のマスは進みを止めない']) assert.ok(design.includes(w), `GAME_DESIGN に「${w}」`);
  assert.match(guide, /目安 30〜90分/u, 'GM_GUIDE の目安');
  assert.match(guide, /`check` は \*\*E2E\*\*（外から叩く）/u, 'テストは外から確かめる');
  assert.match(read('src', 'engine', 'margins.js'), /テスト \$\{passed\} 件、通ってきたね/u, '宿屋の主人のせりふ');
});

test('§75.2 はじめての方へ: ゲームとして、ここが楽しい（#fun）: 絵つきのカード6〜8枚・1枚2文まで。書いてある仕組みはルールのとおり', () => {
  const fun = part('index', 'fun');
  assert.equal(flat(textOf(sectionOf(fun, 'fun-title'))), 'ゲームとして、ここが楽しい');
  const cards = [...fun.matchAll(/<article class="fun">([\s\S]*?)<\/article>/gu)].map((m) => m[1]);
  assert.ok(cards.length >= 6 && cards.length <= 8, `カード ${cards.length}`);
  for (const c of cards) {
    assert.match(c, /<img src="img\/[a-z]+\.svg"/u, '絵つき');
    const p = textOf(/<p>([\s\S]*?)<\/p>/u.exec(c)?.[1] ?? '');
    assert.ok((p.match(/。/gu) ?? []).length <= 2, `1枚2文まで: ${p}`);
  }
  assert.deepEqual(cards.map((c) => h3s(c)[0]), [
    '練習は何度でも、本番は一発勝負', '倒したモンスターが、仲間になる', '仲間がそろうと、ボス戦が始まる', 'あなたは、作戦を出す指揮官',
    '信頼が増えるほど、先が見えてくる', '代がかわっても、技は受け継がれる', '集めて、眺めて、また遊びたくなる', '方眼ノートの手ざわり',
  ]);
  // 仕組みは、ルールと盤面のとおり
  const design = read('docs', 'GAME_DESIGN.md');
  for (const w of ['普通のマスで負けても罰がない', '出口で負けると Lv−1・町からやり直し', '累積判定', '**復活**', '責任のある仲間だけ、町からやり直し', '1マスずつ `step` で確かめる', '次の町まで、ダンジョンを続けて進んでよい', '`視界 = min(Lv−1, 4)`', '「◯代目」', '**技**', 'ちいさなメダル', 'モンスター図鑑', '**宝**', '記録が違えば文も違う', '縦の5mm方眼ノート（B5）']) {
    assert.ok(design.includes(w), `GAME_DESIGN に「${w}」`);
  }
  assert.match(read('web', 'board', 'app.js'), /book\.turnTo\(last\.page \+ 1\)/u, '駒が次のページへ進むと、ノートがめくれる');
});

test('§75.2 はじめての方へ: 遊び方（#how）3ステップ（メモアプリの例・AI は名前で）とチュートリアル・画面（#screens）3枚', () => {
  const how = part('index', 'how');
  const steps = [...how.matchAll(/<li class="step">([\s\S]*?)<\/li>/gu)].map((m) => m[1]);
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((s) => h3s(s)[0]), ['作りたいものを書く', '地図ができる', '冒険に出発']);
  for (const s of steps) assert.match(s, /<span class="num">\d<\/span>\s*<img src="img\/[a-z]+\.svg"/u, '番号と絵つき');
  assert.equal(textOf(/<p>([\s\S]*?)<\/p>/u.exec(steps[0])?.[1] ?? ''), '「メモアプリを作りたい」のように、作りたいものを一文で書きます。');
  assert.equal(textOf(/<p>([\s\S]*?)<\/p>/u.exec(steps[1])?.[1] ?? ''), 'AI（Claude Code か Codex）がゲームマスターになって、作業を担当ごとに分け、テストのマスを並べた地図を作ります。');
  assert.equal(flat(textOf(/<p class="callout">([\s\S]*?)<\/p>/u.exec(how)?.[1] ?? '')), flat('まずは5分のチュートリアルから。AI がなくても、最後まで遊べます。'));
  const shots = [...part('index', 'screens').matchAll(/<figure[^>]*>\s*<img src="img\/(\w+)\.png"[\s\S]*?<figcaption><b>([^<]+)<\/b>([^<]+)<\/figcaption>/gu)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(shots, [
    ['start', 'はじめの画面', 'フォルダを選ぶだけで始まります。'],
    ['hand', '手で進める', 'あなたもキャラクターになって遊べます。'],
    ['ending', 'エンディング', 'クリアすると、毎回ちがうエンディングが流れます。'],
  ]);
});

test('§75.2 はじめての方へ: はじめる（#start）の頭に「必要なもの」を名前つきで（Mac・Node.js・Command Line Tools・Claude Code か Codex・GitHub・Linear や Jira）。Mac アプリとコマンドライン。書いてある事実がリポジトリと合う', () => {
  const start = part('index', 'start');
  assert.ok(start.indexOf('class="needs"') < start.indexOf('class="starts"'), '「必要なもの」が頭に');
  const needs = /<div class="needs"[\s\S]*?<\/ul>/u.exec(start)?.[0] ?? '';
  assert.deepEqual(h3s(needs), ['必要なもの']);
  const items = [...needs.matchAll(/<li( class="opt")?>([\s\S]*?)<\/li>/gu)].map((m) => ({ opt: !!m[1], html: m[2] }));
  assert.equal(items.length, 6, '必要なもの 6つ');
  const say = (i) => flat(textOf(/<p>([\s\S]*?)<\/p>/u.exec(items[i].html)?.[1] ?? items[i].html));
  assert.deepEqual(items.map((_, i) => say(i)), [
    'Mac（macOS 13 以上）',
    'Node.js 22 以上（https://nodejs.org/）',
    'Command Line Tools（Git が入っています。ターミナルで xcode-select --install）',
    'Claude Code（Anthropic）か Codex（OpenAI）のどちらか1つ。それぞれのアカウントか API キーでログインして使います。AI の利用料は、Anthropic か OpenAI にかかります。GridHub 自体は無料です。（5分のチュートリアルだけなら要りません）',
    'GitHub … GridHub は GitHub からダウンロードします。セーブを GitHub に送ることもできます（送らなくても遊べます）。',
    'Linear や Jira を使っているチームは、進み具合をそちらにも映せます（任意。それぞれの API キーを使います）。',
  ].map(flat));
  assert.deepEqual(items.map((i) => i.opt), [false, false, false, false, true, true], 'GitHub と Linear・Jira は、無くても遊べる');
  assert.deepEqual(codes(items[3].html), [['npm install -g @anthropic-ai/claude-code'], ['npm install -g @openai/codex']], 'Claude Code と Codex の入れ方');
  assert.deepEqual(codes(start).slice(2), [
    ['git clone https://github.com/M2AI-jp/gridhub.git', 'cd gridhub', 'npm run mac'],
    ['npm install -g github:M2AI-jp/gridhub#v0.3.0', 'gridhub --help'],
  ]);
  const text = textOf(start);
  assert.ok(text.includes('dist/GridHub.app を「アプリケーション」フォルダに移して、ダブルクリックで開きます。'));
  assert.ok(text.includes('「開けません」と表示されたときは、右クリックして「開く」を選んでください。'));
  assert.ok(tagsOf(start).some((t) => t.tag === 'a' && t.attrs.href === 'engineers.html'), 'くわしい話は、エンジニアの方へ');
  // 事実: npm run mac・macOS 13・Node.js 22・--help・エージェントは claude と codex・Claude Code の入れ方・AI なしで遊べるチュートリアル
  assert.equal(pkg.scripts.mac, 'sh mac/build.sh');
  assert.equal(pkg.engines.node, '>=22');
  assert.match(read('mac', 'Info.plist'), /<key>LSMinimumSystemVersion<\/key>\s*<string>13\.0<\/string>/u);
  assert.match(read('mac', 'build.sh'), /xcode-select --install/u, 'Command Line Tools の入れ方');
  assert.equal(help.status, 0, 'gridhub --help');
  assert.match(help.stdout, /party \[--agent claude\|codex\]/u, 'エージェントは Claude Code と Codex');
  assert.match(read('README.md'), /npm install -g @anthropic-ai\/claude-code/u, 'Claude Code の入れ方');
  assert.ok(existsSync(join(ROOT, 'quests', 'tutorial', 'SOLUTIONS.json')), 'AI なしで遊べるチュートリアル（見本つき）');
});

// ---- エンジニアの方へ（engineers.html） ----

test('§75.2 エンジニアの方へ: ファーストビュー（#hero）: ラベル・見出し2行・説明1つ・ボタン2つ。盤面の写真に、gridhub step の出力の例（いまの出力の形・サンプルの冒険のテストの名前）を重ねる', () => {
  const hero = part('engineers', 'hero');
  assert.equal(flat(textOf(sectionOf(hero, 'hero-title'))), flat('テスト1件が、1マス。Git のコミットが、セーブ。'));
  assert.equal((sectionOf(hero, 'hero-title').match(/<br>/gu) ?? []).length, 1, '見出しは2行');
  assert.match(sectionOf(hero, 'hero-title'), /1マス。<\/span><br>/u, '「テスト1件が、1マス。／Git のコミットが、セーブ。」で折る');
  assert.equal(flat(textOf(/<p class="badge">([\s\S]*?)<\/p>/u.exec(hero)?.[1] ?? '')), flat('MIT ライセンス・Node.js 22 以上・外部パッケージなし'));
  assert.equal(textOf(/<p class="hero-lead">([\s\S]*?)<\/p>/u.exec(hero)?.[1] ?? ''), 'Claude Code や Codex に任せた開発を、E2E テストと Git で1マスずつ進める、すごろく型の進行管理ツールです。');
  assert.deepEqual([...hero.matchAll(/<a class="btn[^"]*" href="([^"]+)">([^<]+)<\/a>/gu)].map((m) => [m[1], m[2]]), [['#start', 'はじめる'], [GITHUB, 'GitHub を見る']]);
  const imgs = tagsOf(hero).filter((t) => t.tag === 'img');
  assert.ok(imgs.some((i) => i.attrs.src === 'img/board.png'), '盤面の写真');
  assert.ok(imgs.filter((i) => (i.attrs.class ?? '').split(' ').includes('deco')).length >= 4, '駒やモンスターの絵を4つ以上');
  // ターミナル風のカード: 例だと分かる・いまの gridhub step の出力の形
  const shell = /<figure class="shell">([\s\S]*?)<\/figure>/u.exec(hero)?.[1] ?? '';
  assert.ok(shell, 'figure.shell');
  assert.match(textOf(/<figcaption>([\s\S]*?)<\/figcaption>/u.exec(shell)?.[1] ?? ''), /^例: gridhub step の出力$/u, '例だと分かる');
  const lines = decode((/<pre><code>([\s\S]*?)<\/code><\/pre>/u.exec(shell)?.[1] ?? '').replace(/<[^>]+>/gu, '')).split('\n');
  assert.equal(lines[0], '$ gridhub step store');
  const head = /^歩いた: (\S+) (\S+) テスト (\d+)\/(\d+)$/u.exec(lines[1] ?? '');
  assert.ok(head, `1行目: ${lines[1]}`);
  const cases = lines.slice(2).map((l) => /^ {2}([✔✖]) (.+)$/u.exec(l)).filter(Boolean).map((m) => ({ ok: m[1] === '✔', name: m[2] }));
  assert.equal(cases.length, Number(head[4]), 'テストの数');
  assert.equal(cases.filter((c) => c.ok).length, Number(head[3]), '通ったテストの数');
  assert.equal(lines[2 + cases.length], `いちばん手前のモンスター: ${cases.find((c) => !c.ok).name}`);
  assert.equal(lines[3 + cases.length], '--- 判定の出力（末尾） ---', '落ちていれば、判定の出力の末尾が続く');
  const step = read('src', 'commands', 'step.js');
  for (const w of ["{ true: '✔', false: '✖'", '`歩いた: ${data.character} ${data.node} テスト ', '`  ${MARK[c.ok]} ${c.name}`', '`いちばん手前のモンスター: ${next.name}`', "'--- 判定の出力（末尾） ---'"]) assert.ok(step.includes(w), `step.js に ${w}`);
  // テストの名前は、サンプルの冒険の判定のとおり（同じ順）
  assert.ok(memo.characters.find((c) => c.id === head[1])?.path.includes(head[2]), `${head[1]} の道に ${head[2]}`);
  const names = [...read('examples', 'memo', 'checks', `${head[2]}.mjs`).matchAll(/^ {2}\['([^']+)', \(\) =>/gmu)].map((m) => m[1]);
  assert.deepEqual(cases.map((c) => c.name), names, `examples/memo/checks/${head[2]}.mjs のテスト`);
});

test('§75.2 エンジニアの方へ: つかう技術（#stack）の表（名前・役目・要るか）7行。書いてある事実がリポジトリと合う', () => {
  const stack = part('engineers', 'stack');
  assert.deepEqual([...stack.matchAll(/<th scope="col">([^<]+)<\/th>/gu)].map((m) => m[1]), ['名前', '役目', '要るか']);
  const rows = [...stack.matchAll(/<tr>\s*<th scope="row">([\s\S]*?)<\/th>\s*<td>([\s\S]*?)<\/td>\s*<td>([\s\S]*?)<\/td>\s*<\/tr>/gu)].map((m) => ({ name: flat(textOf(m[1])), role: textOf(m[2]), need: textOf(m[3]) }));
  assert.deepEqual(rows.map((r) => [r.name, r.need]), [
    ['Node.js22以上', '必須'],
    ['Git', '必須'],
    ['ClaudeCode（Anthropic）Codex（OpenAI）', 'AI と遊ぶなら必須'],
    ['GitHub', '任意'],
    ['MCP', '任意'],
    ['Linear・Jira', '任意'],
    ['macOS13以上・CommandLineTools', 'Mac アプリを使うときだけ'],
  ]);
  const says = [
    ['ESM', '外部パッケージは0'],
    ['git commit', 'git stash', '町のコミットへ戻します'],
    ['GM（地図と E2E テストを書く）', 'キャラクター（実装する）', 'gridhub quest --gm claude', 'gridhub party --agent claude', 'codex', 'アカウントか API キー'],
    ['git clone', 'gridhub push', 'gridhub remote --auto-push on', 'force push はしません', 'gh'],
    ['gridhub mcp', '標準入出力'],
    ['issue', 'LINEAR_API_KEY', 'JIRA_BASE_URL', 'JIRA_EMAIL', 'JIRA_API_TOKEN', 'CSV'],
    ['GridHub.app', 'swiftc', 'アドホック署名'],
  ];
  says.forEach((ws, i) => { for (const w of ws) assert.ok(rows[i].role.includes(w), `${rows[i].name} の役目に「${w}」`); });
  // 事実
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.dependencies, undefined, '外部パッケージは0');
  assert.match(read('src', 'engine', 'save.js'), /'stash', 'push'/u, '負けたら git stash');
  for (const w of ['quest "<願い>" [--gm claude|codex]', 'party [--agent claude|codex]', 'remote [--auto-push on|off]', '（force はしない）', 'mcp [--dir D]', 'MCP サーバー、標準入出力', 'linear push|pull', 'jira push|pull', 'export linear [--format csv|json]', 'import linear <file.csv>']) assert.ok(help.stdout.includes(w), `gridhub --help に「${w}」`);
  assert.match(read('README.md'), /gh auth login/u, 'gh でつなぐ手順');
  assert.match(read('src', 'linear', 'client.js'), /env\.LINEAR_API_KEY/u);
  const jira = read('src', 'jira', 'client.js');
  for (const w of ['env.JIRA_BASE_URL', 'env.JIRA_EMAIL', 'env.JIRA_API_TOKEN']) assert.ok(jira.includes(w), `Jira の ${w}`);
  const build = read('mac', 'build.sh');
  assert.match(build, /^swiftc /mu, 'swiftc で組む');
  assert.match(build, /codesign --force --deep --sign - /u, 'アドホック署名');
  assert.match(read('mac', 'Info.plist'), /<string>13\.0<\/string>/u, 'macOS 13 以上');
});

test('§75.2 エンジニアの方へ: ゲームの言葉と、実際に起きること（#mechanics）12。左にゲームの言葉、右に実際の動き。ルールと src のとおり', () => {
  const mech = part('engineers', 'mechanics');
  assert.equal(flat(textOf(sectionOf(mech, 'mechanics-title'))), 'ゲームの言葉と、実際に起きること');
  const terms = [...mech.matchAll(/<div class="term">\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/div>/gu)].map((m) => ({
    word: flat(textOf(m[1].replace(/<span class="size">[\s\S]*?<\/span>\s*$/u, ''))),
    size: textOf(/<span class="size">([\s\S]*?)<\/span>\s*$/u.exec(m[1])?.[1] ?? ''),
    icon: /<img src="img\/[a-z]+\.svg"/u.test(m[1]),
    dd: textOf(m[2]),
  }));
  assert.deepEqual(terms.map((t) => t.word), ['マス', 'ダンジョン', '出口の判定', '町', '中ボス', '大ボス', '王様の城', '冒険の書', '判定ファイルの固定（封印）', '視界', '担当の範囲（縄張り）', 'イベント']);
  assert.ok(terms.every((t) => t.icon), '絵つき');
  assert.deepEqual(terms.map((t) => t.size), ['数分', '30〜90分・2〜6マス', 'gridhub check', 'タスク2〜3つごと', '数時間に1回', '数日に1回', '大ボスの前に必ず1つ', '.masume/log.jsonl', '', '', '', ''], '目安の大きさ');
  const says = [
    ['テスト1件', '終了コード 0 が合格', 'node --test', 'TAP'],
    ['タスク', 'エージェント1回分のコンテキスト', 'gridhub step は何度でも', 'gridhub check は一発勝負'],
    ['直近のセーブ以降', '自分の道のタスクの判定を、古い順にすべて走らせ直します', '前にできていたことを壊していても落ちます'],
    ['quest.save', '"git"', 'territory', 'ファイルだけをコミット', 'フックは走りません', 'gridhub remote --auto-push on'],
    ['結合 E2E', 'gate', 'メンバーがそろうと自動で走ります', 'MASUME_BLAME: <id>', 'その担当だけを町のコミットへ戻します'],
    ['quest.goal', '願いが叶った一場面を外から確かめる', 'E2E'],
    ['人間の承認', 'gridhub stamp <マスID> --as <人間のID>', '盤面のボタン'],
    ['追記専用', 'SHA-256', 'ハッシュの鎖', 'gridhub verify', 'gridhub load <seq|commit>'],
    ['GM', 'SHA-256', '判定できなくなり'],
    ['gridhub brief', 'min(Lv−1, 4)'],
    ['重ならない glob', '共有ファイルは GM'],
    ['判定のない余白のマス', '日誌', '宿屋の主人', '瓦版', '号外'],
  ];
  says.forEach((ws, i) => { for (const w of ws) assert.ok(terms[i].dd.includes(w), `${terms[i].word} に「${w}」`); });
  // ルールと src のとおり
  const rules = read('docs', 'RULEBOOK.md');
  for (const w of ['終了コード 0 なら成功', 'TAP の `ok`/`not ok`', '自分の道のダンジョンの判定を**古い順にすべて**走らせる', 'MASUME_BLAME: <id>', '**視界** = `min(レベル − 1, 4)`', 'あがりの手前には必ず1つ', '`.masume/log.jsonl` に**追記だけ**', '各行は前の行のハッシュを含む']) assert.ok(rules.includes(w), `RULEBOOK に「${w}」`);
  assert.match(read('src', 'engine', 'canonical.js'), /createHash\('sha256'\)/u, 'ハッシュは SHA-256');
  assert.match(read('src', 'engine', 'checks.js'), /sha256\(readFileSync\(file\)\)/u, '判定ファイルの SHA-256');
  assert.match(read('src', 'engine', 'save.js'), /core\.hooksPath=\/dev\/null/u, 'フックは走らない');
  assert.match(read('src', 'engine', 'view.js'), /Math\.min\(character\.level - 1, 4\)/u, '視界');
  assert.match(read('docs', 'GM_GUIDE.md'), /重ならない glob/u);
  assert.match(read('docs', 'GM_GUIDE.md'), /共有ファイル（[^）]*）は GM の縄張り/u);
  const margins = read('src', 'engine', 'margins.js');
  for (const w of ["'宿屋の主人'", '号外: ']) assert.ok(margins.includes(w), `余白のマスに ${w}`);
});

test('§75.2 エンジニアの方へ: 例: メモアプリの地図（#example）。願い・キャラクター・道の図・中ボス・大ボス・王様の城が、サンプルの冒険（examples/memo）の地図のとおり', () => {
  const ex = part('engineers', 'example');
  assert.equal(flat(textOf(sectionOf(ex, 'example-title'))), flat('例: メモアプリの地図'));
  const lead = textOf(/<p class="lead">([\s\S]*?)<\/p>/u.exec(ex)?.[1] ?? '');
  assert.ok(lead.includes('examples/memo'), 'サンプルの冒険の場所');
  assert.ok(lead.includes(`「${memo.quest.pitch}」`), `願い「${memo.quest.pitch}」`);
  const cast = [...ex.matchAll(/<ul class="cast">([\s\S]*?)<\/ul>/gu)][0]?.[1] ?? '';
  const people = [...cast.matchAll(/<li>([\s\S]*?)<\/li>/gu)].map((m) => textOf(m[1]));
  assert.equal(people.length, memo.characters.length, 'キャラクターの数');
  memo.characters.forEach((c, i) => {
    assert.ok(people[i].startsWith(c.name), `${i + 1}人目は ${c.name}`);
    for (const g of c.territory ?? []) assert.ok(people[i].includes(g), `${c.name} の担当の範囲 ${g}`);
    assert.ok(people[i].includes(c.kind === 'human' ? '人間' : { claude: 'Claude Code', codex: 'Codex' }[c.agent]), `${c.name} のエージェント`);
  });
  // 道の図: 横（スマホでは縦）に並んだマス。中ボスと大ボスは、通る仲間の道をまたぐ
  const roads = /<div class="roads"[\s\S]*?<\/div>/u.exec(ex)?.[0] ?? '';
  const items = [...roads.matchAll(/<span class="(who|lane [a-z]+|sq[^"]*)" style="([^"]*)"[^>]*>([\s\S]*?)<\/span>/gu)].map((m) => {
    const who = /--who:\s*(\d+)(?:\s*\/\s*(\d+))?/u.exec(m[2]);
    const from = Number(who[1]);
    return { kind: m[1].split(' ')[0], rows: Array.from({ length: who[2] ? Number(who[2]) - from : 1 }, (_, i) => from + i), at: Number(/--at:\s*(\d+)/u.exec(m[2])?.[1] ?? 0), label: textOf(m[3]) };
  });
  const whos = items.filter((i) => i.kind === 'who');
  assert.deepEqual(whos.map((w) => w.label), memo.characters.map((c) => c.name), '道の図の名前');
  assert.equal(items.filter((i) => i.kind === 'lane').length, memo.characters.length, '1人に1本の道');
  for (const w of whos) {
    const c = memo.characters.find((x) => x.name === w.label);
    const drawn = items.filter((i) => i.kind === 'sq' && i.rows.includes(w.rows[0])).sort((a, b) => a.at - b.at).map((i) => i.label);
    assert.deepEqual(drawn, c.path.map((id) => (memo.nodes[id].type === 'camp' ? '町' : id)), `${c.name} の道（地図の path のとおり）`);
  }
  assert.equal(new Set(items.filter((i) => i.kind === 'sq').map((i) => i.at)).size, 9, '道は9マスの幅に並ぶ');
  // 中ボス・大ボス・王様の城（地図の題のとおり）
  const bosses = [...ex.matchAll(/<article class="boss">([\s\S]*?)<\/article>/gu)].map((m) => ({ h3: h3s(m[1])[0], p: textOf(/<p>([\s\S]*?)<\/p>/u.exec(m[1])?.[1] ?? '') }));
  const title = (id) => memo.nodes[id].title.replace(/^(?:結合|あがり): /u, '');
  assert.deepEqual(bosses.map((b) => b.h3), [`中ボスG1「${title('G1')}」`, `中ボスG2「${title('G2')}」`, `大ボスGOAL「${title('GOAL')}」`, '王様の城H1・H2'].map(flat));
  assert.ok(bosses[0].p.includes('SIGTERM') && memo.nodes.G1.detail.includes('SIGTERM'), 'G1 は SIGTERM で止めて起動し直す');
  for (const w of ['本物のストアと本物のサーバー']) assert.ok(bosses[0].p.includes(w) && memo.nodes.G1.detail.includes(w), `G1 に「${w}」`);
  for (const w of ['作成', '一覧', '検索', '更新', '削除']) assert.ok(bosses[1].p.includes(w) && memo.nodes.G2.detail.includes(w), `G2 に「${w}」`);
  assert.equal(bosses[2].p, '書く → 新しい順に並ぶ → 検索 → 編集 → 削除 → 再起動しても残る、を外から確かめます。');
  for (const id of ['H1', 'H2']) assert.ok(bosses[3].p.includes(`${id}「${memo.nodes[id].title}」`), `${id}「${memo.nodes[id].title}」`);
  assert.ok(memo.characters.filter((c) => c.kind === 'human').every((c) => c.path.includes('H1') && c.path.includes('H2')), 'ハンコは勇者（人間）');
});

test('§75.2 エンジニアの方へ: エージェントの1ターン（#turn）と作戦（careful・balanced・bold）。ルールと gridhub --help のとおり', () => {
  const turn = part('engineers', 'turn');
  const steps = [...(/<ol class="turn">([\s\S]*?)<\/ol>/u.exec(turn)?.[1] ?? '').matchAll(/<li>([\s\S]*?)<\/li>/gu)].map((m) => ({
    head: textOf(/^<(?:code|span class="no-code")>([\s\S]*?)<\/(?:code|span)>/u.exec(m[1])?.[1] ?? ''),
    p: textOf(/<p>([\s\S]*?)<\/p>/u.exec(m[1])?.[1] ?? ''),
  }));
  assert.deepEqual(steps.map((s) => s.head), ['gridhub brief <ID>', 'コードを直す', 'gridhub step <ID>', 'gridhub check <ID>', 'gridhub note <ID> "次の自分への申し送り"']);
  assert.equal(steps[1].p, 'いちばん手前の落ちているテストだけを通します。');
  assert.ok(steps[2].p.includes('何度でも'), 'step は何度でも');
  const rows = [...turn.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/gu)].map((m) => [flat(textOf(m[1])), textOf(m[3])]);
  assert.deepEqual(rows, [
    ['careful', 'タスクを1つ抜けたら'],
    ['balanced（既定）', 'タスクを1つ抜けたら'],
    ['bold', '町でセーブしたら・中ボスで待つことになったら'],
  ]);
  assert.ok(textOf(turn).includes('止まる所と、1回の実行（出撃）の長さ（利用料）'), '作戦で変わるもの');
  assert.ok(textOf(turn).includes('check に2回落ちたら止まって知らせます。'));
  assert.match(help.stdout, /--tactic careful\|balanced\|bold/u);
  const rules = read('docs', 'RULEBOOK.md');
  for (const w of ['`balanced`、既定', '町に着いたら（セーブしたら）・砦で待機になったら', 'どの作戦でも、宣言に2回失敗したら止まって報告する', '変わるのは、エージェントの動き方と1回の出撃の長さ（利用料）']) assert.ok(rules.includes(w), `RULEBOOK に「${w}」`);
});

test('§75.2 エンジニアの方へ: 主なコマンド（#commands）。どれも gridhub --help にある', () => {
  const cmds = part('engineers', 'commands');
  const names = [...cmds.matchAll(/<tr><th scope="row">([\s\S]*?)<\/th><td>([\s\S]*?)<\/td><\/tr>/gu)].flatMap((m) => [...textOf(m[1]).matchAll(/gridhub ([a-z]+(?: (?:linear|push))?)/gu)].map((x) => x[1]));
  assert.deepEqual(names, ['quest', 'serve', 'app', 'party', 'brief', 'step', 'check', 'note', 'stamp', 'status', 'verify', 'load', 'remote', 'push', 'mcp', 'export linear', 'import linear', 'linear push', 'jira push']);
  for (const n of names) assert.ok(new RegExp(`^ {2}${n}\\b`, 'mu').test(help.stdout), `gridhub --help に ${n}`);
  assert.match(help.stdout, /serve \[--port 5005\]/u);
  assert.ok(textOf(cmds).includes('http://127.0.0.1:5005/'), 'serve の場所');
});

test('§75.2 エンジニアの方へ: はじめる（#start）。手元に置く・Claude Code か Codex・願いから冒険・盤面・出撃と、Mac アプリ・チュートリアル。書いてある事実がリポジトリと合う', () => {
  const start = part('engineers', 'start');
  assert.deepEqual(codes(start), [
    ['git clone https://github.com/M2AI-jp/gridhub.git && cd gridhub && npm link'],
    ['npm install -g @anthropic-ai/claude-code'],
    ['mkdir ~/memo && cd ~/memo', 'gridhub quest "メモを書いて一覧できるアプリを作りたい" --gm claude', 'gridhub serve'],
    ['gridhub party --agent claude --tactic careful'],
  ]);
  const text = textOf(start);
  for (const w of ['npm install -g github:M2AI-jp/gridhub#v0.3.0', 'npm install -g @openai/codex', 'アカウントか API キー', '別のターミナル', 'npm run mac', 'dist/GridHub.app', 'エージェントなしで', '約5分', 'quests/tutorial/README.md']) assert.ok(text.includes(w), `#start に「${w}」`);
  const readme = read('README.md');
  for (const w of ['git clone https://github.com/M2AI-jp/gridhub.git && cd gridhub', 'npm link', 'npm install -g @anthropic-ai/claude-code', 'mkdir ~/memo && cd ~/memo', 'gridhub quest "メモを書いて一覧できるアプリを作りたい" --gm claude', 'gridhub serve', 'gridhub party --agent claude --tactic careful', '続きは別のターミナルで', 'npm run mac          # dist/GridHub.app ができる']) assert.ok(readme.includes(w), `README に「${w}」`);
  assert.equal(pkg.version, '0.3.0', '#v0.3.0 は package.json の版');
  assert.match(read('quests', 'tutorial', 'README.md'), /約5分/u);
});

test('§75.2 2ページとも、フッターは GridHub ・ MIT ライセンス ・ GitHub だけ', () => {
  for (const k of KEYS) {
    const footer = /<footer[\s\S]*?<\/footer>/u.exec(body[k])?.[0] ?? '';
    assert.equal(textOf(footer).replace(/\s+/gu, ' '), 'GridHub ・ MIT ライセンス ・ GitHub', `${PAGES[k]}: フッターはこれだけ`);
    assert.deepEqual(tagsOf(footer).filter((t) => t.tag === 'a').map((a) => a.attrs.href), [GITHUB]);
  }
  assert.match(read('LICENSE'), /^MIT License/u);
});

test('§75.2 スクリーンショット4枚（盤面・はじめの画面・手で進める・エンディング。盤面は2ページとも）。PNG で、alt と、本当の大きさの width・height がある', () => {
  const all = KEYS.flatMap((k) => tags[k].map((t) => ({ ...t, page: PAGES[k] })));
  for (const name of ['board', 'start', 'hand', 'ending']) {
    const img = all.find((t) => t.tag === 'img' && t.attrs.src === `img/${name}.png`);
    assert.ok(img, `<img src="img/${name}.png">`);
    assert.ok((img.attrs.alt ?? '').length >= 10, `${name} の alt`);
    const size = pngSize(readFileSync(join(SITE, 'img', `${name}.png`)));
    assert.ok(size, `${name}.png は PNG`);
    assert.ok(size.width >= 1000, `${name}.png の幅 ${size.width}`);
    for (const t of all.filter((x) => x.tag === 'img' && x.attrs.src === `img/${name}.png`)) {
      assert.deepEqual([Number(t.attrs.width), Number(t.attrs.height)], [size.width, size.height], `${t.page} の ${name} の width・height`);
    }
  }
  for (const k of KEYS) assert.ok(tags[k].some((t) => t.tag === 'img' && t.attrs.src === 'img/board.png'), `${PAGES[k]} に盤面の写真`);
  for (const img of all.filter((t) => t.tag === 'img')) assert.ok('alt' in img.attrs, `${img.page} の ${img.attrs.src} に alt（飾りなら空）`);
});
