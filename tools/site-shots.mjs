#!/usr/bin/env node
// 紹介ページ（site/img/）のスクリーンショットを撮り直す道具（CONTRACTS §75.1）。看板屋の縄張り。包みには入らない。
// テストの Chrome（MASUME_CHROME。無ければ /Applications/Google Chrome.app）で、次の4枚を 1440×900 で撮る:
//   board.png  … GridHub 自身の盤面（このリポジトリの冒険の書を gridhub serve で配る。読むだけ）
//   start.png  … gridhub app のはじめの画面（最近のフォルダ: チュートリアル・メモのアプリ・まだ冒険の無いフォルダ）
//   hand.png   … チュートリアルの盤面で、見習いAI の「手で進める」（見本を写す → 歩く）
//   ending.png … チュートリアルをあがったときのエンディング
//   icon.png   … ページの印（mac/AppIcon.png を 192×192 に。背景は透明）
// 冒険はすべて一時フォルダに作る。このリポジトリの冒険の書には書かない。
// つかいかた: MASUME_CHROME=<Chrome の場所> node tools/site-shots.mjs [icon|board|start|hand|ending …]
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, getJson, openBrowserWith, postJson, startApp, startGridhub, pathWith, waitUntil } from '../tests/helpers8.mjs';

const OUT = join(ROOT, 'site', 'img');
const SIZE = { width: 1440, height: 900 };
const SOLUTIONS = JSON.parse(readFileSync(join(ROOT, 'quests', 'tutorial', 'SOLUTIONS.json'), 'utf8'));
const LOADED = `document.querySelector('#hand')?.dataset.loaded === 'true' && document.querySelector('#hand').dataset.busy !== 'true'`;
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

/** 画面の大きさをきっちり 1440×900 にした Chrome（窓の枠のぶん小さくならないように） */
async function browser() {
  const page = await openBrowserWith(SIZE);
  await page.send('Emulation.setDeviceMetricsOverride', { ...SIZE, deviceScaleFactor: 1, mobile: false });
  return page;
}

async function shoot(page, name) {
  await settle(1500); // ペンで描かれていく線と駒の動きが落ち着くまで
  await page.screenshot(join(OUT, `${name}.png`));
  console.log(`撮りました: site/img/${name}.png`);
}

/** はじめの画面と、チュートリアルの「手で進める」・あがり */
async function launcher(root) {
  const play = join(root, 'GridHub');
  mkdirSync(play, { recursive: true });
  const memo = join(play, 'メモのアプリ');
  cpSync(join(ROOT, 'examples', 'memo'), memo, { recursive: true });
  const idea = join(play, '新しいアイデア');
  mkdirSync(idea, { recursive: true });
  const app = await startApp({ claude: true, home: join(root, 'home'), play });
  const page = await browser();
  try {
    // 最近のフォルダを3つにする（開くと最近のフォルダに入る）
    for (const dir of [idea, memo]) {
      const r = await postJson(`${app.url}/api/app/open`, { dir });
      if (r.status !== 200) throw new Error(`${dir} を開けない: ${r.text}`);
    }
    const tutorial = await postJson(`${app.url}/api/app/tutorial`, {});
    if (tutorial.status !== 200) throw new Error(`チュートリアルを作れない: ${tutorial.text}`);
    await page.goto(`${app.url}/`);
    await page.waitFor('window.__gridhubStart && window.__gridhubStart.ready === true', { timeout: 20000 });
    await page.waitFor(`document.querySelectorAll('#recent li[data-dir]').length === 3`, { message: '最近のフォルダが3つ' });
    await shoot(page, 'start');

    // チュートリアルの盤面: 見習いAI の「手で進める」で、見本を写して歩く
    await page.eval(`document.querySelector('#tutorial').click()`);
    await page.waitFor(`new URLSearchParams(location.search).has('home') && window.__masume && window.__masume.ready && !!window.__masume.view`, { timeout: 30000, message: 'チュートリアルの盤面' });
    const board = await page.eval('location.origin');
    await page.eval(`window.__masume.select('char', 'apprentice')`);
    await page.waitFor(`!!document.querySelector('#drawer button[data-hand="apprentice"]')`);
    await page.eval(`document.querySelector('#drawer button[data-hand="apprentice"]').click()`);
    await page.waitFor(LOADED, { timeout: 15000 });
    await page.eval(`document.querySelector('#hand button[data-sample]').click()`);
    await page.eval(`document.querySelector('#hand-save').click()`);
    await page.waitFor(`${LOADED} && /保存しました/.test(document.querySelector('#hand-msg').innerText)`, { timeout: 15000 });
    await page.eval(`document.querySelector('#hand-step').click()`);
    await page.waitFor(`${LOADED} && /歩きました/.test(document.querySelector('#hand-msg').innerText)`, { timeout: 60000 });
    await shoot(page, 'hand');

    // あがりまで進める（窓口に、見本を書いてハンコと宣言判定。ボス戦は仲間がそろうと始まる）
    const write = async (character, node) => {
      for (const s of SOLUTIONS[node] ?? []) {
        const r = await postJson(`${board}/api/file`, { character, path: s.path, content: s.content });
        if (r.status !== 200) throw new Error(`${s.path} を書けない: ${r.text}`);
      }
    };
    const state = async () => (await getJson(`${board}/api/state`)).body;
    const check = async () => {
      const r = await postJson(`${board}/api/check`, { character: 'apprentice' });
      if (!r.body?.passed) throw new Error(`宣言判定に負けた: ${r.text}`);
    };
    await check(); // A1（見本はもう書いた）
    await write('apprentice', 'A2');
    await check();
    await write('player', 'H1');
    await postJson(`${board}/api/stamp`, { node: 'H1', as: 'player' });
    await waitUntil(async () => (await state()).nodes.G1.state === 'cleared', { timeout: 90000, message: 'G1 を突破' });
    await write('apprentice', 'A3');
    await check();
    await postJson(`${board}/api/stamp`, { node: 'H2', as: 'player' });
    await waitUntil(async () => (await state()).finished === true, { timeout: 90000, message: 'あがり' });
    await page.eval(`document.querySelector('#hand-close').click()`);
    await page.eval(`window.__masume.select(null)`).catch(() => {});
    await page.waitFor(`!document.querySelector('#ending').hidden`, { timeout: 20000, message: 'エンディング' });
    await shoot(page, 'ending');
  } finally {
    await page.close();
    await app.stop();
  }
}

/** GridHub 自身の盤面（このリポジトリの冒険の書。読むだけ） */
async function own() {
  const srv = await startGridhub(['serve', '--port', '0', '--dir', ROOT], { pattern: /盤面: (http:\/\/\S+)/, env: { PATH: pathWith().PATH }, cwd: ROOT });
  const page = await browser();
  try {
    await page.goto(`${srv.url}/`);
    await page.waitFor('window.__masume && window.__masume.ready && !!window.__masume.view', { timeout: 30000 });
    await shoot(page, 'board');
  } finally {
    await page.close();
    await srv.stop();
  }
}

/** ページの印: アプリのアイコンを 192×192 に縮める（背景は透明） */
async function icon(root) {
  const html = join(root, 'icon.html');
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}</style><img src="${pathToFileURL(join(ROOT, 'mac', 'AppIcon.png')).href}" width="192" height="192">`);
  const page = await openBrowserWith({ width: 480, height: 480 });
  try {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 192, height: 192, deviceScaleFactor: 1, mobile: false });
    await page.goto(pathToFileURL(html).href);
    await page.waitFor(`document.images[0].complete && document.images[0].naturalWidth > 0`);
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const r = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 192, height: 192, scale: 1 }, captureBeyondViewport: true });
    writeFileSync(join(OUT, 'icon.png'), Buffer.from(r.data, 'base64'));
    console.log('撮りました: site/img/icon.png');
  } finally {
    await page.close();
  }
}

// 名前を渡せば、その絵だけ撮り直す（例: node tools/site-shots.mjs icon）。start・hand・ending は1つの冒険で続けて撮る
const only = new Set(process.argv.slice(2));
const want = (name) => only.size === 0 || only.has(name);
const root = mkdtempSync(join(tmpdir(), 'gh-'));
try {
  mkdirSync(OUT, { recursive: true });
  if (want('icon')) await icon(root);
  if (want('board')) await own();
  if (want('start') || want('hand') || want('ending')) await launcher(root);
} finally {
  rmSync(root, { recursive: true, force: true });
}
