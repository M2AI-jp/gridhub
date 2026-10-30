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

// ---- アプリの中身（CONTRACTS §62.4）: sh mac/build.sh を GRIDHUB_SKIP_SWIFT=1 で走らせ、GridHub.app に詰めた中身（動くのに要るファイル）を読む ----
import { spawnSync as spawnSyncDist } from 'node:child_process';
import { readdirSync as readdirSyncDist, statSync as statSyncDist } from 'node:fs';
import { delimiter as delimiterDist, dirname as dirnameDist, join as joinDist, relative as relativeDist } from 'node:path';
import { ROOT as ROOT_DIST, tmp as tmpDist } from './helpers6.mjs';

/** 判定の子に渡す環境変数（冒険の書の場所や、外の道具の設定を持ち込まない。PATH の先頭はいまの node） */
export function distEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('npm_') || k.startsWith('NPM_') || k.startsWith('GRIDHUB_') || (k.startsWith('MASUME_') && k !== 'MASUME_CHROME')) delete env[k];
  delete env.NODE_TEST_CONTEXT;
  env.PATH = [dirnameDist(process.execPath), env.PATH].filter(Boolean).join(delimiterDist);
  return { ...env, NO_COLOR: '1', ...extra };
}

let distCache = null;
/** { root, paths, bytes }: アプリの中身を詰めたフォルダと、その中の相対パス（/ 区切り。並び順）と、合計のバイト数。1回だけ組む */
export function distPaths() {
  if (distCache) return distCache;
  const dist = tmpDist('gridhub-dist-');
  const r = spawnSyncDist('sh', [joinDist(ROOT_DIST, 'mac', 'build.sh')], { cwd: ROOT_DIST, env: distEnv({ GRIDHUB_SKIP_SWIFT: '1', GRIDHUB_DIST: dist }), encoding: 'utf8', timeout: 180000 });
  if (r.status !== 0) throw new Error(`mac/build.sh が失敗した (${r.status}):\n${r.stdout}${r.stderr}`);
  const root = joinDist(dist, 'GridHub.app', 'Contents', 'Resources', 'gridhub');
  const paths = [];
  let bytes = 0;
  const walk = (dir) => {
    for (const name of readdirSyncDist(dir).sort()) {
      const file = joinDist(dir, name);
      const info = statSyncDist(file);
      if (info.isDirectory()) walk(file);
      else {
        paths.push(relativeDist(root, file).split('\\').join('/'));
        bytes += info.size;
      }
    }
  };
  walk(root);
  distCache = { root, paths, bytes };
  return distCache;
}
