// Q7「瓦版は、作っている製品の話題」— CONTRACTS §54.1・§54.2（第12章）の語り部の分。
// ユーザーの指示「作ってる製品に関連ニュースが流れる」。開発の進め方のコツではなく、製品の分野の話題を GM に書かせる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp, masumeEnv, fakeGm } from '../helpers2.mjs';
import { GIT_ENV } from '../helpers5.mjs';

const WISH = 'メモを書いて、あとで探せるアプリを作りたい';
const quest = (args, env = {}) => masumeEnv(['quest', ...args], { cwd: tmp('gridhub-q7-cwd-'), env: { ...GIT_ENV, ...env } });

/** 偽の GM（good）を走らせてから、地図の quest.news を NEWS（JSON）に差し替える GM */
function newsGm(news) {
  const good = fakeGm('good').replace(/^cmd:node /, '').replace(/ good$/, '');
  const file = join(tmp('gridhub-q7-gm-'), 'news-gm.mjs');
  writeFileSync(file, `import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const input = readFileSync(0);
const r = spawnSync(process.execPath, [${good}, 'good'], { input, stdio: ['pipe', 'inherit', 'inherit'] });
if (r.status !== 0) process.exit(r.status ?? 1);
const map = JSON.parse(readFileSync('quest.map.json', 'utf8'));
map.quest.news = ${JSON.stringify(news)};
writeFileSync('quest.map.json', JSON.stringify(map, null, 2));
`);
  return `cmd:node ${JSON.stringify(file)}`;
}

test('§54.1・§54.2 GM のプロンプトに瓦版の決まり（製品の分野の話題・開発の進め方のコツは書かない・作り話を事実のように書かない）', async () => {
  const root = tmp('gridhub-q7-');
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(r.code, 0, r.all);
  const prompt = readFileSync(join(root, 'gm-prompt-1.txt'), 'utf8');
  assert.ok(prompt.includes(WISH), 'プロンプトに願いの全文');
  for (const w of ['`quest.news`', '作っている製品の分野', '開発の進め方のコツ', 'テストを先に書く', '作り話を事実のように書きません']) {
    assert.ok(prompt.includes(w), `プロンプトに「${w}」`);
  }
  const news = await import(pathToFileURL(join(ROOT, 'src', 'quest', 'news.js')).href);
  for (const line of news.NEWS_GUIDE) assert.ok(prompt.includes(line), `プロンプトに NEWS_GUIDE の行: ${line.slice(0, 30)}…`);
  const map = JSON.parse(readFileSync(join(root, 'quest.map.json'), 'utf8'));
  assert.match(r.all, new RegExp(`瓦版の話題: ${(map.quest.news ?? []).length} 件`), 'まとめに瓦版の話題の件数（0件でも出す）');
});

test('§54.1・§54.2 話題が開発の進め方のコツや事実に見える書き方なら、まとめに ※ で知らせる（冒険は止めない）', async () => {
  const root = tmp('gridhub-q7-warn-');
  const NEWS = [
    'テストを先に書いてから実装する進め方がよく使われる',
    'メモアプリでは、全文検索より先にタグで絞り込む使い方がよく見られる',
    '2025年に発表された調査によると、メモを毎日書く人は40%いる',
  ];
  const r = await quest([WISH, '--dir', root, '--gm', newsGm(NEWS)]);
  assert.equal(r.code, 0, `冒険は止めない: ${r.all}`);
  assert.match(r.all, /瓦版の話題: 3 件/);
  const { newsProblems } = await import(pathToFileURL(join(ROOT, 'src', 'quest', 'news.js')).href);
  assert.deepEqual(newsProblems(['メモアプリでは、全文検索より先にタグで絞り込む使い方がよく見られる'], WISH), [], '製品の話題は問題なし');
  const problems = newsProblems(NEWS, WISH);
  assert.ok(problems.some((p) => p.startsWith('quest.news[0]:')), '開発の進め方のコツ');
  assert.ok(problems.some((p) => p.startsWith('quest.news[2]:')), '事実に見える書き方');
  assert.ok(!problems.some((p) => p.startsWith('quest.news[1]:')));
  const lines = r.all.split('\n');
  const at = lines.findIndex((l) => /瓦版の話題: 3 件/.test(l));
  for (const p of problems) assert.ok(lines.slice(at + 1, at + 1 + problems.length).includes(`  ※ ${p}`), `まとめに「  ※ ${p}」`);
  assert.equal(JSON.parse(readFileSync(join(root, 'quest.map.json'), 'utf8')).quest.news.length, 3, '地図はそのまま');
});
