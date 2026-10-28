// D1「Mac のアプリの骨組み」— 大工（第16章）。CONTRACTS §72.1。
// Swift はこのリポジトリの判定の場所（Linux）では組めないので、ソースの約束だけを確かめる。組めるかどうかは監督が Mac で mac/build.sh を走らせて確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../helpers.mjs';

const FILE = join(ROOT, 'mac', 'GridHub.swift');
const src = () => readFileSync(FILE, 'utf8');
// 文字列とコメントを除いたコード（括弧の数を数えるため）
const code = () => src().replace(/"""[\s\S]*?"""/g, '""').replace(/"(?:\\.|[^"\\\n])*"/g, '""').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const has = (re, what) => assert.match(src(), re, what);

test('§72.1 mac/GridHub.swift は1ファイルで、AppKit・WebKit・Foundation だけを使い、@main がある', () => {
  assert.ok(existsSync(FILE), 'mac/GridHub.swift');
  assert.deepEqual(readdirSync(join(ROOT, 'mac')).filter((f) => f.endsWith('.swift')), ['GridHub.swift'], 'Swift は1ファイル');
  const imports = [...src().matchAll(/^\s*import\s+(\w+)/gm)].map((m) => m[1]);
  assert.ok(imports.includes('AppKit') && imports.includes('WebKit'), `AppKit と WebKit（${imports.join(', ')}）`);
  assert.deepEqual(imports.filter((m) => !['AppKit', 'WebKit', 'Foundation'].includes(m)), [], 'ほかの import が無い');
  has(/^@main\b/m, '@main');
  const c = code();
  for (const [open, close] of [['{', '}'], ['(', ')'], ['[', ']']]) {
    assert.equal(c.split(open).length, c.split(close).length, `${open}${close} の数がそろう`);
  }
});

test('§72.1 フォルダのダイアログ（NSOpenPanel。新しいフォルダも作れる）と、スクリプトの窓口 gridhub・folderChosen', () => {
  has(/NSOpenPanel\(\)/, 'NSOpenPanel');
  has(/\.canChooseDirectories\s*=\s*true/, 'フォルダを選べる');
  has(/\.canChooseFiles\s*=\s*false/, 'ファイルは選ばない');
  has(/\.canCreateDirectories\s*=\s*true/, '新しいフォルダも作れる');
  has(/add\(\s*self\s*,\s*name:\s*"gridhub"\s*\)/, 'スクリプトの窓口 gridhub');
  has(/"chooseFolder"/, 'chooseFolder');
  has(/window\.gridhubApp\.folderChosen/, 'folderChosen を呼ぶ');
  has(/WKWebView\(/, 'WKWebView');
});

test('§72.1 ログインシェルの PATH で node を探し、22 以上でなければ日本語で入れ方を出す', () => {
  has(/pw_shell/, 'ユーザーのシェル（getpwuid）');
  has(/"-l"/, 'ログインシェル（-l）');
  for (const dir of ['/opt/homebrew/bin', '/usr/local/bin', '.local/bin']) assert.ok(src().includes(dir), `よくある場所 ${dir}`);
  has(/process\.versions\.node/, 'node の版を読む');
  has(/>=\s*22\b|<\s*22\b/, '22 と比べる');
  for (const w of ['Node.js 22 以上', 'nodejs.org', 'brew install node', 'もう一度さがす']) assert.ok(src().includes(w), `字「${w}」`);
});

test('§72.1 node で gridhub app --port 0 --lifeline を起こし、標準入力は Pipe。窓を閉じると終わり、終わるときにサーバーを止める', () => {
  has(/gridhub\/bin\/gridhub\.js/, 'アプリの中の GridHub');
  has(/"app"\s*,\s*"--port"\s*,\s*"0"\s*,\s*"--lifeline"/, 'app --port 0 --lifeline');
  has(/\.standardInput\s*=/, '標準入力をつなぐ');
  has(/Pipe\(\)/, 'Pipe');
  has(/"GRIDHUB_APP"\]?\s*=\s*"1"|"GRIDHUB_APP":\s*"1"/, 'GRIDHUB_APP=1');
  has(/"PATH"/, 'PATH を渡す');
  has(/GridHub: /, '起動役の URL の行を読む');
  has(/func applicationShouldTerminateAfterLastWindowClosed\([^)]*\)\s*->\s*Bool\s*\{\s*(return\s+)?true\s*\}/, '窓を閉じるとアプリも終わる');
  has(/func applicationWillTerminate\(/, '終わるとき');
  has(/\.terminate\(\)/, 'サーバーを止める');
});

test('§72.1 編集メニュー・終了・alert と confirm・手元でない URL は既定のブラウザで開く', () => {
  for (const sel of ['cut(_:)', 'copy(_:)', 'paste(_:)', 'selectAll(_:)']) assert.ok(src().includes(sel), `編集メニュー ${sel}`);
  has(/undo:/, '取り消す');
  has(/terminate\(_:\)/, '終了');
  has(/keyEquivalent:\s*"q"/, '⌘Q');
  has(/runJavaScriptAlertPanelWithMessage/, 'alert');
  has(/runJavaScriptConfirmPanelWithMessage/, 'confirm');
  has(/NSWorkspace\.shared\.open\(/, '既定のブラウザで開く');
  has(/"127\.0\.0\.1"/, '手元かどうか');
});
