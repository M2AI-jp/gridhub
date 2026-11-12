// 第17章の判定の共通道具（紹介ページ site/ を読む）。GM の縄張り・封印対象。キャラクターは編集しないこと。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './helpers8.mjs';

export * from './helpers8.mjs';

export const SITE = join(ROOT, 'site');
export const GITHUB = 'https://github.com/M2AI-jp/gridhub';
export const ORIGIN = 'https://gridhub.matsunai.com/';

/** site/ の中のファイル（/ 区切りの相対パス。パスの順） */
export function siteFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const file = join(dir, name);
      if (statSync(file).isDirectory()) walk(file);
      else out.push(relative(SITE, file).split(sep).join('/'));
    }
  };
  walk(SITE);
  return out;
}

export const readSite = (path) => readFileSync(join(SITE, path), 'utf8');

/** 文字参照をほどく（&amp; &lt; &gt; &quot; &#39; &#NN; &#xNN;） */
export function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/giu, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/gu, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&');
}

/** タグを外した字（空白は1つにまとめる） */
export function textOf(html) {
  return decode(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/giu, ' ').replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();
}

/** id="…" の要素の中の HTML（同じ名前のタグの入れ子を数える） */
export function sectionOf(html, id) {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\sid="${id}"[^>]*>`, 'iu').exec(html);
  if (!open) return null;
  const tag = open[1].toLowerCase();
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'giu');
  re.lastIndex = open.index + open[0].length;
  let depth = 1;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open.index, m.index + m[0].length);
  }
  return null;
}

/** タグ（開きタグ）の一覧: [{tag, attrs: {name: value}}]。値は文字参照をほどいたもの */
export function tagsOf(html) {
  const out = [];
  const clean = html.replace(/<!--[\s\S]*?-->/gu, '');
  for (const m of clean.matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/gu)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/gu)) {
      attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    }
    out.push({ tag: m[1].toLowerCase(), attrs });
  }
  return out;
}

/** CSS の url(…) と @import */
export function cssRefs(css) {
  const body = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  const urls = [...body.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/giu)].map((m) => m[1] ?? m[2] ?? m[3]);
  const imports = [...body.matchAll(/@import\b/giu)].length;
  return { urls, imports };
}

/** PNG の幅と高さ（IHDR）。PNG でなければ null */
export function pngSize(buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(sig) || buffer.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}
