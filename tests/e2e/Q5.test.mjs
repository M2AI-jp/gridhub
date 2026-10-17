// Q5「GM の箱のソケットの名前と説明」— CONTRACTS §32（第6章）の語り部の分。
// quest --help / init --help の説明、GM の箱を開けるときの「箱のソケット:」の知らせ、古い名前（--network）は受け付けない。
// 名前を改めた挙動そのもの（quest / init の --allow-listen と party.json の allow_listen）は Q4 の判定が確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, newToy, fakeGm } from '../helpers3.mjs';

const WISH = 'メモアプリのようなアプリを作りたい';
const quest = (args, env = {}) => masumeEnv(['quest', ...args], { cwd: tmp('masume-cwd-'), env });
const notices = (text) => text.split('\n').filter((l) => l.startsWith('箱のソケット: '));

// 偽の codex（PATH の先頭）。プロンプトをそのまま偽の GM（第2章の fakeGm good）に渡す。本物の codex は呼ばない
const FAKE_BIN = tmp('masume-q5-bin-');
const FAKE_CODEX = join(FAKE_BIN, 'fake-codex.mjs');
writeFileSync(FAKE_CODEX, `import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let prompt = '';
try { prompt = readFileSync(0); } catch {}
const r = spawnSync('/bin/sh', ['-c', ${JSON.stringify(fakeGm('good').slice('cmd:'.length))}], { input: prompt, stdio: ['pipe', 'inherit', 'inherit'] });
process.exit(r.status ?? 1);
`);
writeFileSync(join(FAKE_BIN, 'codex'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CODEX)} "$@"\n`);
chmodSync(join(FAKE_BIN, 'codex'), 0o755);
const WITH_CODEX = { PATH: `${FAKE_BIN}:${process.env.PATH}` };

// ---- §32.2 ----

const HELP_WORDS = ['--allow-listen', '127.0.0.1', 'ローカル', 'sandbox_workspace_write.network_access', 'インターネット', 'codex', 'claude'];

test('§32.2 quest --help / -h: 使い方と --allow-listen の説明を stdout に出して 0。願いといっしょでも GM を呼ばない', async () => {
  for (const flag of ['--help', '-h']) {
    const r = await quest([flag]);
    assert.equal(r.code, 0, `${flag}\n${r.all}`);
    for (const w of HELP_WORDS) assert.ok(r.out.includes(w), `${flag} の stdout に「${w}」\n${r.all}`);
  }
  const root = tmp('masume-q5-');
  const w = await quest([WISH, '--dir', root, '--gm', 'codex', '--allow-listen', '--help'], WITH_CODEX);
  assert.equal(w.code, 0, w.all);
  assert.ok(w.out.includes('--allow-listen'), w.all);
  assert.deepEqual(readdirSync(root), [], '--help は何も書かない・GM を呼ばない');
});

test('§32.2 init --help / -h: --allow-listen の説明（--agent といっしょに使う）を stdout に出して 0。何も書かない', async () => {
  const dir = tmp('masume-q5-init-');
  for (const flag of ['--help', '-h']) {
    const r = masume(['init', '--dir', dir, flag]);
    assert.equal(r.code, 0, `${flag}\n${r.all}`);
    for (const w of [...HELP_WORDS, '--agent', '"allow_listen": true']) assert.ok(r.out.includes(w), `${flag} の stdout に「${w}」\n${r.all}`);
  }
  assert.deepEqual(readdirSync(dir), [], '--help は AGENTS.md などを書かない');
});

// ---- §32.3 ----

test('§32.3 GM の箱を開けるときは「箱のソケット:」の知らせ（127.0.0.1・インターネット）。codex でなければ「codex にだけ効きます」。頼まれなければ出さない', async () => {
  const root = tmp('masume-q5-');
  const d = await quest([WISH, '--dir', root, '--gm', 'codex', '--allow-listen', '--dry-run']);
  assert.equal(d.code, 0, d.all);
  const n = notices(d.all);
  assert.equal(n.length, 1, `知らせは1行\n${d.all}`);
  assert.match(n[0], /127\.0\.0\.1/, n[0]);
  assert.match(n[0], /インターネット/, n[0]);

  const o = await quest([WISH, '--dir', root, '--gm', 'claude', '--allow-listen', '--dry-run'], { MASUME_GM_OVERRIDE: 'codex' });
  assert.equal(o.code, 0, o.all);
  assert.match(notices(o.all)[0] ?? '', /インターネット/, `MASUME_GM_OVERRIDE が codex でも知らせる\n${o.all}`);

  const c = await quest([WISH, '--dir', root, '--gm', 'claude', '--allow-listen', '--dry-run']);
  assert.equal(c.code, 0, c.all);
  assert.match(notices(c.all)[0] ?? '', /codex にだけ効きます/, c.all);
  assert.doesNotMatch(c.all, /network_access/);

  const closed = await quest([WISH, '--dir', root, '--gm', 'codex', '--dry-run']);
  assert.equal(closed.code, 0, closed.all);
  assert.doesNotMatch(closed.all, /箱のソケット/, '頼まれなければ知らせない');

  const j = await quest([WISH, '--dir', root, '--gm', 'codex', '--allow-listen', '--dry-run', '--json']);
  assert.equal(j.code, 0, j.all);
  assert.doesNotThrow(() => JSON.parse(j.out), `--json の stdout は JSON だけ\n${j.out}`);
  assert.equal(notices(j.err).length, 1, `--json のときの知らせは stderr\n${j.err}`);
  assert.deepEqual(readdirSync(root), [], 'dry-run は何も書かない');
});

test('§32.3 本当に GM を呼ぶときも、呼ぶ前に知らせる（偽の codex）', async () => {
  const root = join(tmp('masume-q5-'), 'memo');
  const r = await quest([WISH, '--dir', root, '--gm', 'codex', '--allow-listen'], WITH_CODEX);
  assert.equal(r.code, 0, r.all);
  const lines = r.out.split('\n');
  const notice = lines.findIndex((l) => l.startsWith('箱のソケット: '));
  const call = lines.findIndex((l) => l.startsWith('GM を呼びます'));
  assert.ok(notice !== -1, `知らせがある\n${r.all}`);
  assert.ok(call !== -1, r.all);
  assert.ok(notice < call, `知らせは GM を呼ぶ前\n${r.all}`);
});

// ---- §32.1 ----

test('§32.1 古い名前: quest --network と init --network は E_USAGE/2', async () => {
  const q = await quest([WISH, '--dir', tmp('masume-q5-'), '--gm', 'codex', '--network', '--dry-run']);
  assert.equal(q.code, 2, q.all);
  assert.match(q.all, /E_USAGE/);
  const dir = newToy();
  const i = masume(['init', '--dir', dir, '--agent', 'codex', '--network']);
  assert.equal(i.code, 2, i.all);
  assert.match(i.all, /E_USAGE/);
});
