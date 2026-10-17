// P5「箱のソケットの名前と説明」— CONTRACTS §32（第6章）の軍師の分。
// party --help / -h の説明、ソケットを開けるときの「箱のソケット:」の知らせ、古い名前（--network）は受け付けない。
// 名前を改めた挙動そのもの（--allow-listen / --no-allow-listen / party.json の allow_listen）は P4 の判定が確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masumeEnv, newToy, readLog } from '../helpers3.mjs';

const party = (dir, args, env = {}) => masumeEnv(['party', '--dir', dir, ...args], { cwd: dir, env });
const partyJson = (dir, obj) => writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify(obj));
/** 行頭から「箱のソケット: 」で始まる行 */
const notices = (text) => text.split('\n').filter((l) => l.startsWith('箱のソケット: '));

// 何もせずに終わる偽の codex（PATH の先頭に置く。本物の codex は呼ばない）
const FAKE_BIN = tmp('masume-p5-bin-');
writeFileSync(join(FAKE_BIN, 'codex'), '#!/bin/sh\ncat > /dev/null\necho "偽の codex: $*"\nexit 0\n');
chmodSync(join(FAKE_BIN, 'codex'), 0o755);
const WITH_CODEX = { PATH: `${FAKE_BIN}:${process.env.PATH}` };

// ---- §32.2 ----

const HELP_WORDS = [
  '--allow-listen', '--no-allow-listen', '127.0.0.1', 'ローカル',
  'sandbox_workspace_write.network_access', 'インターネット', 'codex', 'claude', '"allow_listen": true',
];

test('§32.2 party --help / -h: 使い方と --allow-listen の説明（目的・ローカルのまま・インターネットの注意・codex だけ）を stdout に出して 0', async () => {
  const dir = newToy();
  const before = readLog(dir).length;
  for (const flag of ['--help', '-h']) {
    const r = await party(dir, [flag]);
    assert.equal(r.code, 0, `${flag}\n${r.all}`);
    for (const w of HELP_WORDS) assert.ok(r.out.includes(w), `${flag} の stdout に「${w}」\n${r.all}`);
  }
  const x = await party(dir, ['--agent', 'codex', '--allow-listen', '--help'], WITH_CODEX);
  assert.equal(x.code, 0, x.all);
  assert.ok(x.out.includes('--allow-listen'), x.all);
  assert.doesNotMatch(x.all, /出撃準備|出撃予定|偽の codex/, 'ほかの引数があっても、--help は出撃しない');
  assert.equal(readLog(dir).length, before, '--help は冒険の書に書かない');

  const empty = tmp('masume-p5-empty-');
  const e = await masumeEnv(['party', '--help', '--dir', empty], { cwd: empty });
  assert.equal(e.code, 0, `冒険の書が無くても --help は出せる\n${e.all}`);
  assert.ok(e.out.includes('--allow-listen'), e.all);
});

// ---- §32.3 ----

test('§32.3 開けるときは「箱のソケット:」の知らせを1行（127.0.0.1・インターネット）。codex でなければ「codex にだけ効きます」。頼まれなければ出さない', async () => {
  const dir = newToy();
  const open = await party(dir, ['--dry-run', '--agent', 'codex', '--allow-listen']);
  assert.equal(open.code, 0, open.all);
  const n = notices(open.all);
  assert.equal(n.length, 1, `知らせは1行\n${open.all}`);
  assert.match(n[0], /127\.0\.0\.1/, n[0]);
  assert.match(n[0], /インターネット/, n[0]);

  partyJson(dir, { agent: 'codex', allow_listen: true });
  const pj = await party(dir, ['--dry-run']);
  assert.equal(pj.code, 0, pj.all);
  assert.equal(notices(pj.all).length, 1, `party.json で開けているときも知らせる\n${pj.all}`);
  const off = await party(dir, ['--dry-run', '--no-allow-listen']);
  assert.equal(off.code, 0, off.all);
  assert.doesNotMatch(off.all, /箱のソケット/, `閉じたら知らせない\n${off.all}`);

  partyJson(dir, { agent: 'codex' });
  const closed = await party(dir, ['--dry-run']);
  assert.equal(closed.code, 0, closed.all);
  assert.doesNotMatch(closed.all, /箱のソケット/, '頼まれなければ知らせない');

  const c = await party(dir, ['--dry-run', '--agent', 'claude', '--allow-listen']);
  assert.equal(c.code, 0, c.all);
  const nc = notices(c.all);
  assert.equal(nc.length, 1, c.all);
  assert.match(nc[0], /codex にだけ効きます/, nc[0]);
  assert.doesNotMatch(c.all, /network_access/, 'claude のコマンドは変えない');

  const x = await party(dir, ['--dry-run', '--agent', 'cmd:echo やあ', '--allow-listen']);
  assert.equal(x.code, 0, x.all);
  assert.match(notices(x.all)[0] ?? '', /codex にだけ効きます/, x.all);
});

test('§32.3 本当に出撃するときも、巡回の見出し（出撃準備:）より前に知らせる', async () => {
  const dir = newToy();
  const r = await party(dir, ['--agent', 'codex', '--allow-listen', '--only', 'a', '--rounds', '1'], WITH_CODEX);
  assert.equal(r.code, 2, r.all);
  const lines = r.out.split('\n');
  const notice = lines.findIndex((l) => l.startsWith('箱のソケット: '));
  const heading = lines.findIndex((l) => l.startsWith('出撃準備: '));
  assert.ok(notice !== -1, `知らせがある\n${r.all}`);
  assert.ok(heading !== -1, r.all);
  assert.ok(notice < heading, `知らせは見出しより前\n${r.all}`);
  assert.match(lines[notice], /インターネット/);
});

// ---- §32.1 ----

test('§32.1 古い名前 --network / --no-network は E_USAGE/2。party.json の network は読まない', async () => {
  const dir = newToy();
  for (const old of ['--network', '--no-network']) {
    const r = await party(dir, ['--dry-run', '--agent', 'codex', old]);
    assert.equal(r.code, 2, `${old}\n${r.all}`);
    assert.match(r.all, /E_USAGE/, r.all);
  }
  partyJson(dir, { agent: 'codex', network: true });
  const p = await party(dir, ['--dry-run']);
  assert.equal(p.code, 0, p.all);
  assert.doesNotMatch(p.all, /network_access/, '古い network: true では開けない');
  assert.doesNotMatch(p.all, /箱のソケット/);
});
