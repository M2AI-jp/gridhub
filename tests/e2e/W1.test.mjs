// W1「紹介ページの中身」— 看板屋（第17章）。CONTRACTS §75.1・§75.2。
// gridhub.matsunai.com に置く1ページ（site/index.html）が、困りごとから始まり、GridHub 自身の14日間の記録を背骨にしているか。
// 記録とコミットで確かめられないことを書いていないか（seq・数・キャラクターの担当・GM の裁定の引用）を、冒険の書と Git で照らし合わせる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, SITE, GITHUB, ORIGIN, readSite, textOf, sectionOf, tagsOf, pngSize } from '../helpers9.mjs';

const html = existsSync(join(SITE, 'index.html')) ? readSite('index.html') : '';
const tags = tagsOf(html);
const meta = (key) => tags.find((t) => t.tag === 'meta' && (t.attrs.name === key || t.attrs.property === key))?.attrs.content ?? null;
const part = (id) => {
  const s = sectionOf(html, id);
  assert.ok(s, `#${id} がある`);
  return s;
};
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const LOG = readFileSync(join(ROOT, '.masume', 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
// 数字を書いた時点（#numbers の data-seq）。それより後の記録は、ページを書いたときにはまだ無い
const AT_SEQ = Number(/<div id="numbers"[^>]*data-seq="(\d+)"/u.exec(html)?.[1] ?? -1);

/** 引用（…で縮めてよい）が、元の文の中に、その順で入っているか（空白の数と種類は見ない。字は1字も変えない） */
function quotedFrom(quote, sources) {
  const norm = (x) => x.replace(/\s+/gu, ' ').trim();
  const parts = norm(quote).split('…').map((p) => p.trim()).filter(Boolean);
  return sources.map(norm).some((src) => {
    let at = 0;
    for (const p of parts) {
      const i = src.indexOf(p, at);
      if (i < 0) return false;
      at = i + p.length;
    }
    return true;
  });
}

// 人間の言葉の原文（監督が会話の記録から写したもの。2026-10-22 以降は、この会話の記録でも確かめた）
const HUMAN = [
  'どのエージェントがどこまで何をやっていないのかという『セーブデータ』が失われたり、セーブデータ自体がバグって、元の開発状況に戻れなくなったりする、これはGitやGitHubを使うだけじゃ解決できない。なぜならコンテキストは有限で、ゲームデザインされた制約がないと、あなたは好き勝手やって開発業務全体を破壊するから',
  '5mm方眼ノートというものがあって、私は昔、その方眼ノートを使って、すごろく兼RPGゲームを作って兄と遊んでいました。',
  'このゲームの意義は、まず開発が楽しくなること、次にLinearやJiraという文字だけのタスク管理ツールがゲームという状態を持つことで、人間にもLLMにも進行管理が容易になること',
  'H1のハンコ、などは私ではなくてあなた自身が作ったものです。私は全ての許可を与えると最初に明示しています。',
  'いちいち中途半端なところでとまらないでください。あなたは責任者・指揮官です。',
  '作業中に利用制限に達しましたが、現在はリセットされています。中断したところから続けてください。',
  'うーん、全然ダメかも。まずマスメってタイトルからして終わってるしセンスない',
  'ノートって縦だからね？',
  '何もかもを「早馬を走らせる」とか意味不明な表現にしなくてよくて、しっかりとエンジニアでも使えるようにして欲しい',
  'これじゃただのJiraの劣化版で見た目だけ変わっただけ、ゲームとしての体験度がゼロ',
  '「いい無駄」がないんだよ、遊び心がない',
  'いまはどれくらいできている？',
  'アーティファクトが消えて、現状を視覚的に私が評価できない',
  '遊びのマスのセンスが悪い、例えば、別担当と会話イベントが起きるとか、NPCとのなんでもない会話がおこるとか、作ってる製品に関連ニュースが流れるとか　あくまでも開発と関連のある、良い余白という意味',
  'いつになったら完成すんの？とっとと進めろよ',
  'めんどくさすぎる、Macでローカルアプリケーションとして、私が簡単にフォルダを選んでゲームとして遊べるように、GUIも作って。',
  'うーんと、価値訴求が意味不明で読んでも入れたいと思うユーザーいないと思うよ？　コンテキストがないから意味不明なんですよ。あなたの私の開発工程そのものが、このゲームを必要としているユーザーへのメッセージになるので、作り直してください。',
  '完成までどんどん進めて欲しい。時間かかりすぎ',
  '続けろ、いちいち言われなくてもさ',
];

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
  const text = textOf(html);
  assert.doesNotMatch(text, /ことづけ|[\w.+-]+@[\w-]+\.[\w.]+|\/Users\/|\/home\//u, 'ほかのサービス名・メールアドレス・手元のパスを出さない');
  assert.doesNotMatch(text, /\d+(\.\d+)?\s*倍/u, '「生産性が○倍」のような、記録で確かめられない数を書かない');
});

test('§75.2 1画面目（#hero）は困りごとから: 最初の依頼の原文・自己申告では進まない・盤面でわかること3つ・この14日間の記録へ。仕組みの言葉は出さない', () => {
  const hero = part('hero');
  const t = textOf(hero);
  assert.match(t.replace(/\s+/gu, ''), /いま、どこまで/u, '読む人の言葉の困りごと');
  const gains = [...hero.matchAll(/<ul class="gains"[^>]*>([\s\S]*?)<\/ul>/gu)].flatMap((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/gu)]);
  assert.equal(gains.length, 3, '盤面でわかることを3つ');
  for (const [, li] of gains) assert.match(li, /href="#day-\d+"/u, `実録のマスにつながる: ${textOf(li)}`);
  assert.ok(t.includes('『セーブデータ』が失われたり') && t.includes('コンテキストは有限'), '最初の依頼の芯の一節');
  assert.match(t, /自己申告では/u);
  assert.match(t, /14日間/u);
  assert.ok(tagsOf(hero).some((x) => x.tag === 'a' && x.attrs.href === '#days'), '#days（実録）へのリンク');
  assert.doesNotMatch(t, /封印|ダンジョン|宿屋|町 ＝|ゲート/u, '仕組みの言葉は1画面目に出さない');
  assert.ok(tagsOf(hero).some((x) => x.tag === 'img' && x.attrs.src === 'img/board.png'), '盤面の写真');
});

test('§75.2 人間の言葉は原文のまま（…で縮めるだけ）。はじまり（#origin）に最初の依頼の2つ', () => {
  const origin = textOf(part('origin'));
  assert.ok(origin.includes('兄と遊んでいました') && origin.includes('人間にもLLMにも進行管理が容易になること'), '#origin に最初の依頼');
  const quotes = [...html.matchAll(/<blockquote class="quote[^"]*">\s*<p>([\s\S]*?)<\/p>/gu), ...[...html.matchAll(/<div class="said">([\s\S]*?)<\/div>/gu)].flatMap((m) => [...m[1].matchAll(/<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/gu)])].map((m) => textOf(m[1]));
  assert.ok(quotes.length >= 15, `人間の言葉 ${quotes.length}`);
  for (const q of quotes) assert.ok(quotedFrom(q, HUMAN), `原文のまま: ${q}`);
  for (const q of [...textOf(html).matchAll(/「([^「」]*(?:「[^」]*」[^「」]*)*)」（10-2\d）/gu)].map((m) => m[1])) assert.ok(quotedFrom(q, HUMAN), `原文のまま: ${q}`);
});

test('§75.2 実録（#days）: 日付の順に10マス以上。どのマスも「人間のひと言か記録 → AI 側 → 入ったもの」。seq と GM の裁定の引用は冒険の書のとおり', () => {
  const days = part('days');
  const items = [...days.matchAll(/<li class="day[^"]*" id="(day-\d+)" data-date="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/li>/gu)];
  assert.ok(items.length >= 10, `マス ${items.length}`);
  const dates = items.map((m) => m[2]);
  assert.deepEqual([...dates].sort(), dates, '日付の順');
  assert.ok(dates[0] >= '2026-10-15' && dates.at(-1) <= '2026-10-28', '14日間の中');
  for (const [, id, , body] of items) {
    assert.ok(/class="said"|class="record"/u.test(body), `${id}: 人間のひと言か記録`);
    assert.match(body, /class="ai"/u, `${id}: そのとき AI 側では`);
    assert.match(body, /class="mech"/u, `${id}: GridHub に入ったもの`);
  }
  const wipes = items.filter((m) => /class="day wipe"/u.test(m[0]));
  assert.ok(AT_SEQ >= 0, '#numbers の data-seq');
  assert.equal(wipes.length, LOG.filter((e) => e.type === 'gate_failed' && e.seq <= AT_SEQ).length, 'ボス戦の全滅は、その時点の記録にあるぶんだけ隠さずに');
  for (const m of html.matchAll(/<span data-seq="(\d+)" data-type="([a-z_]+)"(?: data-(gate|node)="([^"]+)")?>seq (\d+)<\/span>/gu)) {
    const [, seq, type, key, value, shown] = m;
    assert.equal(seq, shown, 'seq の字と data-seq が同じ');
    const e = LOG[Number(seq)];
    assert.ok(e && e.seq === Number(seq) && e.type === type, `seq ${seq} は ${type}（記録: ${e?.type}）`);
    if (key) assert.equal(e.data[key], value, `seq ${seq} の ${key}`);
  }
  assert.ok((days.match(/data-seq=/gu) ?? []).length >= 6, '出来事の seq');
  for (const m of days.matchAll(/<div class="record">\s*<p class="label">[^<]*seq (\d+)[^<]*<\/p>\s*<blockquote><p>([\s\S]*?)<\/p><\/blockquote>/gu)) {
    const note = LOG[Number(m[1])];
    assert.equal(note?.type, 'note', `seq ${m[1]} は日誌`);
    assert.ok(quotedFrom(textOf(m[2]), [note.data.text]), `seq ${m[1]} の GM の裁定のとおり: ${textOf(m[2])}`);
  }
});

test('§75.2 体制（#team）: 地図のキャラクターと担当（Codex・Claude・人間）が合う', () => {
  const team = part('team');
  const map = JSON.parse(readFileSync(join(ROOT, 'quests', 'masume.map.json'), 'utf8'));
  const listed = Object.fromEntries([...team.matchAll(/<li data-char="([^"]+)" data-agent="([^"]+)"><b>([^<]+)<\/b>\s*([^<]+)</gu)].map((m) => [m[1], { agent: m[2], name: m[3], label: m[4].trim() }]));
  for (const c of map.characters) {
    const agent = c.kind === 'human' ? 'human' : c.agent;
    assert.ok(listed[c.id], `${c.id}（${c.name}）が体制にいる`);
    assert.equal(listed[c.id].agent, agent, `${c.id} の担当`);
    assert.equal(listed[c.id].label, { codex: 'Codex', claude: 'Claude', human: '人間' }[agent], `${c.id} の字`);
    assert.ok(c.name.startsWith(listed[c.id].name), `${c.id} の名前 ${listed[c.id].name}`);
  }
  assert.equal(Object.keys(listed).length, map.characters.length, '地図にいないキャラクターを書かない');
  for (const role of ['人間（勇者）', '監督', 'GM', 'キャラクター']) assert.ok(textOf(team).includes(role), `体制に ${role}`);
});

test('§75.2 数字（#numbers）は、書いた時点のコミットと冒険の書から数え直せる', () => {
  const box = /<div id="numbers"[^>]*data-commit="([0-9a-f]{7,40})" data-seq="(\d+)" data-from="([\d-]+)" data-to="([\d-]+)">([\s\S]*?)<\/div>/u.exec(html);
  assert.ok(box, '#numbers に data-commit・data-seq・data-from・data-to');
  const [, commit, seqText, from, to, body] = box;
  const seq = Number(seqText);
  assert.match(textOf(body), new RegExp(`${commit}`), '時点（コミット）を添える');
  assert.match(textOf(body), new RegExp(`seq ${seq}`), '時点（冒険の書の seq）を添える');
  const upto = LOG.filter((e) => e.seq <= seq);
  const count = (type) => upto.filter((e) => e.type === type).length;
  const atCommit = (path) => git('show', `${commit}:${path}`);
  const expected = {
    days: Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1,
    commits: Number(git('rev-list', '--count', commit).trim()),
    nodes: Object.keys(JSON.parse(atCommit('quests/masume.map.json')).nodes).length,
    'test-files': git('ls-tree', '--name-only', commit, 'tests/e2e/').split('\n').filter((f) => f.endsWith('.test.mjs')).length,
    entries: upto.length,
    sealed: count('sealed'),
    amended: count('amended'),
    check_passed: count('check_passed'),
    gate_cleared: count('gate_cleared'),
    gate_failed: count('gate_failed'),
    sortie: count('sortie'),
    'sortie-claude': upto.filter((e) => e.type === 'sortie' && e.data.agent === 'claude').length,
    'sortie-codex': upto.filter((e) => e.type === 'sortie' && e.data.agent === 'codex').length,
    'sortie-cmd': upto.filter((e) => e.type === 'sortie' && e.data.agent === 'cmd').length,
  };
  const shown = Object.fromEntries([...body.matchAll(/data-count="([\w-]+)">(\d+)</gu)].map((m) => [m[1], Number(m[2])]));
  for (const [key, value] of Object.entries(expected)) assert.equal(shown[key], value, `${key}（${commit}・seq ${seq} の時点）`);
  // npm test の数は、その時点のコミットの本文に残した結果のとおり
  assert.match(git('log', '-1', '--format=%B', commit), new RegExp(`npm test: ${shown['npm-tests']} 件`), 'npm test のテストの数');
});

test('§75.2 仕組み（#what）は、どれも実録のマスにひもづく。向いている人・向いていない人（#fit）を正直に', () => {
  const what = part('what');
  const cards = [...what.matchAll(/<div class="term" id="(m-[a-z]+)">([\s\S]*?)<\/div>/gu)];
  assert.ok(cards.length >= 8, `仕組み ${cards.length}`);
  for (const [, id, body] of cards) {
    const links = [...body.matchAll(/href="#(day-\d+)"/gu)].map((m) => m[1]);
    assert.ok(links.length >= 1, `${id} は実録のマスへのリンクがある`);
    for (const l of links) assert.ok(html.includes(`id="${l}"`), `${id} → #${l} がある`);
  }
  for (const m of html.matchAll(/href="#(m-[a-z]+)"/gu)) assert.ok(cards.some((c) => c[1] === m[1]), `#${m[1]} の仕組みがある`);
  const fit = textOf(part('fit'));
  for (const w of ['向いている', '向いていない', 'テストで確かめられない', '日本語だけ', 'Node.js 22 以上', '署名・公証はしていません', 'npm には出していません']) assert.ok(fit.includes(w), `#fit に「${w}」`);
});

test('§75.2 遊び方は3つ（#play）と、入れ方（#install）', () => {
  const play = part('play');
  const ways = ['way-mac', 'way-tutorial', 'way-idea'].map((id) => {
    const s = sectionOf(play, id);
    assert.ok(s, `#play の中に #${id}`);
    return textOf(s);
  });
  assert.match(ways[0], /フォルダを選ぶ/u);
  assert.match(ways[1], /claude が無くても/u);
  assert.match(ways[2], /gridhub quest/u);
  const install = textOf(part('install'));
  for (const w of [
    GITHUB.replace('https://', ''),
    `git clone ${GITHUB}.git`,
    'npm run mac',
    'dist/GridHub.app',
    '「開けません」と出たら、右クリックして「開く」',
    'npm install -g github:M2AI-jp/gridhub#v0.3.0',
    'npm には出していません',
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
