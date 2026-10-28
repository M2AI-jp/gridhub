// W2「壊れたリンク・外から読むものが無い」— 看板屋（第17章）。CONTRACTS §75.3。
// site/ だけで動き（index.html が入口）、リンクと画像が壊れておらず、外のサイトから何も読み込まない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SITE, GITHUB, ORIGIN, siteFiles, readSite, tagsOf, cssRefs, serveStatic, openBrowser } from '../helpers9.mjs';

const KINDS = new Set(['.html', '.css', '.png', '.svg', '.ico']);
const files = existsSync(SITE) ? siteFiles() : [];
const pages = files.filter((f) => f.endsWith('.html'));
const sheets = files.filter((f) => f.endsWith('.css'));
const exceptions = (page) => page.console.filter((l) => l.startsWith('[exception]') || l.startsWith('[error]'));

/** ページの中の参照（どこから・何を・どの種類） */
function refsOf(file) {
  const out = [];
  if (file.endsWith('.html')) {
    for (const { tag, attrs } of tagsOf(readSite(file))) {
      for (const key of ['href', 'src', 'poster', 'data', 'action', 'formaction']) {
        if (attrs[key] !== undefined) out.push({ file, tag, key, ref: attrs[key], rel: attrs.rel ?? '' });
      }
      if (attrs.srcset) for (const part of attrs.srcset.split(',')) out.push({ file, tag, key: 'srcset', ref: part.trim().split(/\s+/u)[0] });
      if (tag === 'meta' && /^og:(url|image)$/u.test(attrs.property ?? '')) out.push({ file, tag, key: attrs.property, ref: attrs.content ?? '' });
      if (attrs.style) for (const ref of cssRefs(attrs.style).urls) out.push({ file, tag, key: 'style', ref });
    }
  } else if (file.endsWith('.css')) {
    for (const ref of cssRefs(readSite(file)).urls) out.push({ file, tag: 'css', key: 'url', ref });
  } else if (file.endsWith('.svg')) {
    for (const m of readSite(file).matchAll(/\b(?:href|xlink:href|src)\s*=\s*"([^"]*)"/gu)) out.push({ file, tag: 'svg', key: 'href', ref: m[1] });
  }
  return out;
}

const refs = files.flatMap(refsOf);
const ids = Object.fromEntries(pages.map((p) => [p, new Set(tagsOf(readSite(p)).map((t) => t.attrs.id).filter(Boolean))]));

test('§75.3 site/ の中は HTML・CSS・画像だけ（スクリプト・Web フォントなし）。入口は site/index.html', () => {
  assert.ok(files.includes('index.html'), 'site/index.html');
  for (const f of files) assert.ok(KINDS.has(extname(f).toLowerCase()), `site/${f} は HTML・CSS・画像`);
  for (const f of files.filter((x) => x.endsWith('.svg'))) assert.doesNotMatch(readSite(f), /<script|<foreignObject|\son[a-z]+\s*=/iu, `site/${f} にスクリプトが無い`);
  for (const f of sheets) {
    const css = readSite(f);
    assert.equal(cssRefs(css).imports, 0, `site/${f} に @import が無い`);
    assert.doesNotMatch(css, /@font-face/iu, `site/${f} は字を読み込まない（手元の字だけ）`);
  }
});

test('§75.3 リンクと画像が壊れていない: site/ の中のファイル・ページの中の #id・GitHub のリンクだけ。site/ の外（../）を指さない', () => {
  assert.ok(refs.length >= 10, `参照 ${refs.length}`);
  for (const { file, tag, key, ref, rel } of refs) {
    const where = `site/${file} の <${tag} ${key}="${ref}">`;
    assert.ok(ref !== '', `${where} が空でない`);
    if (ref.startsWith('#')) {
      assert.ok(ref === '#' ? false : ids[file]?.has(decodeURIComponent(ref.slice(1))), `${where}: その id がある`);
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/iu.test(ref) || ref.startsWith('//')) {
      if (key === 'og:url' || key === 'og:image') {
        assert.ok(ref.startsWith(ORIGIN), `${where}: ${ORIGIN} の下`);
        const local = ref.slice(ORIGIN.length) || 'index.html';
        assert.ok(existsSync(join(SITE, local)), `${where}: site/${local} がある`);
        continue;
      }
      assert.ok(tag === 'a' && key === 'href', `${where}: 外を指せるのは <a href> のリンクだけ（読み込まない）`);
      assert.ok(ref === GITHUB || ref.startsWith(`${GITHUB}/`) || ref.startsWith(`${GITHUB}#`), `${where}: リンクは GitHub（${GITHUB}）だけ`);
      continue;
    }
    if (tag === 'link') assert.notEqual(rel, '', `${where}: rel がある`);
    const [path] = ref.split(/[?#]/u);
    const target = posix.normalize(posix.join(posix.dirname(file), decodeURIComponent(path)));
    assert.ok(!target.startsWith('..') && !path.startsWith('/'), `${where}: site/ の中を相対で指す`);
    assert.ok(files.includes(target) || files.includes(posix.join(target, 'index.html')), `${where}: site/${target} がある`);
  }
});

test('§75.3 Chrome で開くと、読み込むのは同じ場所のものだけ。画像は全部読めて、コンソールにエラーが無い（http でも file でも）', { timeout: 120000 }, async () => {
  const srv = await serveStatic(SITE);
  const page = await openBrowser({ width: 1280, height: 800 });
  try {
    for (const url of [`${srv.url}/`, pathToFileURL(join(SITE, 'index.html')).href]) {
      await page.goto(url);
      // 遅れて読む画像（loading="lazy"）も、いま読ませる（ヘッドレスの Chrome は、見えていないページでは遅れて読まない）
      await page.eval(`document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; })`);
      await page.waitFor(`[...document.images].every((i) => i.complete)`, { timeout: 20000, message: '画像を読み終える' });
      const r = await page.eval(`({
        broken: [...document.images].filter((i) => !(i.naturalWidth > 0)).map((i) => i.getAttribute('src')),
        count: document.images.length,
        loaded: performance.getEntriesByType('resource').map((e) => e.name),
        sheets: [...document.styleSheets].map((s) => s.href),
      })`);
      const origin = url.startsWith('file:') ? 'file://' : srv.url;
      assert.ok(r.count >= 10, `画像 ${r.count}`);
      assert.deepEqual(r.broken, [], `${url}: 読めない画像`);
      for (const name of r.loaded) assert.ok(name.startsWith(origin), `${url}: 外から読んだ ${name}`);
      assert.ok(r.sheets.length >= 1 && r.sheets.every((h) => h && h.startsWith(origin)), `${url}: スタイルシートは手元の site.css`);
    }
    assert.deepEqual(exceptions(page), [], 'コンソールにエラーが無い');
  } finally {
    await page.close();
    await srv.close();
  }
});
