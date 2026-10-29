// D2「組み立て」— 大工（第16章）。CONTRACTS §72.2・§72.3・§72.5。
// Swift の組み立て・アイコン・署名は Mac でしかできないので、GRIDHUB_SKIP_SWIFT=1 で中身の詰め方だけを、本当に走らせて確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { delimiter, dirname, join } from 'node:path';
import { ROOT, tmp } from '../helpers.mjs';

const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const PKG = JSON.parse(read('package.json'));

/** plist の dict の <key>…</key> のすぐあとの値（文字列・真偽・dict の中身） */
function plistValue(xml, key) {
  const m = xml.match(new RegExp(`<key>${key}</key>\\s*(<string>([^<]*)</string>|<(true|false)\\s*/>|<dict>([\\s\\S]*?)</dict>)`));
  if (!m) return undefined;
  if (m[2] !== undefined) return m[2];
  if (m[3] !== undefined) return m[3] === 'true';
  return m[4];
}

function cleanEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('npm_') || k.startsWith('NPM_') || (k.startsWith('MASUME_') && k !== 'MASUME_CHROME')) delete env[k];
  env.PATH = [dirname(process.execPath), env.PATH].filter(Boolean).join(delimiter);
  return { ...env, ...extra };
}

test('§72.2 mac/Info.plist: 実行ファイル・ID・版の置き場・アイコン・127.0.0.1 への通信（NSAllowsLocalNetworking）', () => {
  const xml = read('mac/Info.plist');
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<plist version="1\.0">\s*<dict>[\s\S]*<\/dict>\s*<\/plist>\s*$/);
  assert.equal(plistValue(xml, 'CFBundleExecutable'), 'GridHub');
  assert.equal(plistValue(xml, 'CFBundleIdentifier'), 'jp.m2ai.gridhub');
  assert.equal(plistValue(xml, 'CFBundleName'), 'GridHub');
  assert.equal(plistValue(xml, 'CFBundlePackageType'), 'APPL');
  assert.equal(plistValue(xml, 'CFBundleShortVersionString'), '__VERSION__');
  assert.equal(plistValue(xml, 'CFBundleVersion'), '__VERSION__');
  assert.equal(plistValue(xml, 'CFBundleIconFile'), 'AppIcon');
  assert.match(String(plistValue(xml, 'LSMinimumSystemVersion')), /^\d+\.\d+$/);
  assert.equal(plistValue(xml, 'NSHighResolutionCapable'), true);
  const ats = plistValue(xml, 'NSAppTransportSecurity');
  assert.equal(typeof ats, 'string', 'NSAppTransportSecurity は dict');
  assert.equal(plistValue(ats, 'NSAllowsLocalNetworking'), true, '127.0.0.1 への通信を許す');
  assert.equal(plistValue(ats, 'NSAllowsArbitraryLoads'), undefined, 'どこへでも、は許さない');
});

test('§72.3・§72.5・§77 mac/build.sh は swiftc で組み（xcodebuild は使わない）、動くのに要るファイルは cp で写す（パッケージの道具は呼ばない）、sips・iconutil でアイコン、アドホック署名。scripts.mac と .gitignore の dist/', () => {
  const sh = read('mac/build.sh');
  assert.match(sh, /^#!\/bin\/sh\n/);
  assert.equal(spawnSync('sh', ['-n', join(ROOT, 'mac', 'build.sh')]).status, 0, 'sh として読める');
  const lines = sh.split('\n').filter((l) => !/^\s*#/.test(l));
  const body = lines.join('\n');
  assert.match(body, /\bswiftc\b/, 'swiftc');
  assert.doesNotMatch(body, /\bxcodebuild\b/, 'xcodebuild は使わない');
  assert.doesNotMatch(body, /\bnpm\b|\byarn\b|\bpnpm\b/, 'パッケージの道具は呼ばない（§77）');
  assert.match(body, /\bcp -R bin src web\b/, '動くのに要るファイルをこのフォルダから写す');
  assert.match(body, /cp docs\/\*\.md/, 'docs の md');
  assert.match(body, /quests\/tutorial/, 'チュートリアル');
  assert.match(body, /\bsips\b/, 'sips');
  assert.match(body, /\biconutil\b/, 'iconutil');
  assert.match(body, /AppIcon\.icns/, 'AppIcon.icns');
  assert.match(body, /codesign --force --deep --sign -/, 'アドホック署名');
  assert.match(body, /GRIDHUB_SKIP_SWIFT/, 'Swift を飛ばせる');
  assert.match(sh, /右クリック/, '最初の起動は右クリックから');
  assert.equal(PKG.scripts.mac, 'sh mac/build.sh');
  assert.match(read('.gitignore'), /^\/?dist\/?$/m, 'dist/ は Git に入れない');
});

test('§72.3・§62.4 GRIDHUB_SKIP_SWIFT=1 で組むと、GridHub.app に動くのに要るファイルと、版の入った Info.plist が入り、中の gridhub が動く', { timeout: 180000 }, () => {
  const dist = tmp('gridhub-d2-');
  const r = spawnSync('sh', [join(ROOT, 'mac', 'build.sh')], { cwd: ROOT, env: cleanEnv({ GRIDHUB_SKIP_SWIFT: '1', GRIDHUB_DIST: dist }), encoding: 'utf8', timeout: 170000 });
  assert.equal(r.status, 0, (r.stdout || '') + (r.stderr || ''));
  const app = join(dist, 'GridHub.app', 'Contents');
  const plist = readFileSync(join(app, 'Info.plist'), 'utf8');
  assert.equal(plistValue(plist, 'CFBundleShortVersionString'), PKG.version);
  assert.doesNotMatch(plist, /__VERSION__/);
  const res = join(app, 'Resources', 'gridhub');
  for (const f of ['package.json', 'bin/gridhub.js', 'bin/masume.js', 'src/server/index.js', 'web/index.html', 'quests/tutorial/tutorial.map.json', 'docs/RULEBOOK.md', 'LICENSE']) {
    assert.ok(existsSync(join(res, f)), `入れる: ${f}`);
  }
  for (const f of ['.masume', 'tests', 'examples', 'demos', 'mac', 'AGENTS.md', 'quests/masume.map.json', 'docs/shots', 'docs/board.png']) assert.ok(!existsSync(join(res, f)), `入れない: ${f}`);
  assert.equal(JSON.parse(readFileSync(join(res, 'package.json'), 'utf8')).version, PKG.version);
  const v = spawnSync(process.execPath, [join(res, 'bin', 'gridhub.js'), '--version'], { cwd: dist, encoding: 'utf8' });
  assert.equal(v.stdout.trim(), `gridhub ${PKG.version} (rules 1)`, v.stderr);
  assert.ok(existsSync(join(app, 'MacOS')), 'Contents/MacOS');
});
