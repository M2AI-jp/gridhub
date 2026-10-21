// U1: 画面の骨組み（web/index.html と web/style.css）
import { join } from 'node:path';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { runChecks, assert, ROOT } from './lib/helpers.mjs';

const read = () => {
  const p = join(ROOT, 'web/index.html');
  if (!existsSync(p)) throw new Error('未実装: web/index.html がまだありません');
  return readFileSync(p, 'utf8');
};
// id を持つ開始タグを返す
const tag = (html, id) => {
  const m = html.match(new RegExp(`<(\\w+)\\b[^>]*\\bid="${id}"[^>]*>`));
  if (!m) throw new Error(`id="${id}" の要素がありません`);
  return { name: m[1].toLowerCase(), text: m[0], index: m.index };
};

await runChecks([
  ['HTML の基本（doctype / lang=ja / charset / viewport / title）', () => {
    const h = read();
    assert.match(h, /^\s*<!doctype html>/i);
    assert.match(h, /<html\b[^>]*\blang="ja"/i);
    assert.match(h, /<meta\b[^>]*charset="?utf-8/i);
    assert.match(h, /<meta\b[^>]*name="viewport"/i);
    assert.match(h, /<title>[^<]*メモ[^<]*<\/title>/);
  }, 'ui'],
  ['入力フォーム #memo-form（title / body / 送信ボタン）', () => {
    const h = read();
    const f = tag(h, 'memo-form');
    assert.equal(f.name, 'form');
    const end = h.indexOf('</form>', f.index);
    assert.ok(end > 0, '</form> がありません');
    const inner = h.slice(f.index, end);
    assert.match(inner, /<input\b[^>]*\bid="memo-title"/, 'form の中に input#memo-title');
    assert.match(inner, /<textarea\b[^>]*\bid="memo-body"/, 'form の中に textarea#memo-body');
    assert.match(inner, /<button\b[^>]*\btype="submit"/, 'form の中に type="submit" のボタン');
    assert.match(tag(h, 'memo-title').text, /maxlength="100"/, 'input#memo-title に maxlength="100"');
  }, 'ui'],
  ['検索・一覧・空表示・エラー表示の置き場', () => {
    const h = read();
    assert.equal(tag(h, 'memo-search').name, 'input');
    assert.match(tag(h, 'memo-search').text, /type="(search|text)"/);
    assert.equal(tag(h, 'memo-list').name, 'ul');
    assert.ok(tag(h, 'memo-empty'));
    const err = tag(h, 'memo-error');
    assert.match(err.text, /role="alert"/);
    assert.match(err.text, /\bhidden\b/, 'memo-error は最初は hidden');
  }, 'ui'],
  ['app.mjs を module で読む', () => {
    assert.match(read(), /<script\b[^>]*type="module"[^>]*src="\/app\.mjs"|<script\b[^>]*src="\/app\.mjs"[^>]*type="module"/);
  }, 'ui'],
  ['style.css が読まれていて、中身がある', () => {
    assert.match(read(), /<link\b[^>]*rel="stylesheet"[^>]*href="\/style\.css"|<link\b[^>]*href="\/style\.css"[^>]*rel="stylesheet"/);
    const p = join(ROOT, 'web/style.css');
    assert.ok(existsSync(p), 'web/style.css がありません');
    assert.ok(statSync(p).size > 100, 'style.css が小さすぎます');
    const css = readFileSync(p, 'utf8');
    assert.match(css, /\.memo\b/, '.memo のスタイルがありません');
    assert.match(css, /pre-wrap/, '本文の改行を保つ white-space: pre-wrap がありません');
  }, 'ui'],
]);
