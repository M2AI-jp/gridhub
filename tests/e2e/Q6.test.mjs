// Q6「Git でセーブする新しい冒険」— CONTRACTS §46（第11章）の語り部の分。
// git init・quest.save の補い・最初のコミット・AGENTS.md の step と「GridHub（旧名マスメ）」・GM のプロンプトに cases と save。
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masumeEnv, readLog, fakeGm, BIN } from '../helpers2.mjs';
import { git, gitInit, GIT_ENV } from '../helpers5.mjs';

const WISH = 'メモアプリのようなアプリを作りたい';
const quest = (args, env = {}) => masumeEnv(['quest', ...args], { cwd: tmp('gridhub-q6-cwd-'), env: { ...GIT_ENV, ...env } });

test('§46.2・§46.3 Git の外なら git init し、quest.save を補い、ふりだしをセーブし、支度のあとで最初のコミット', async () => {
  const root = tmp('gridhub-q6-');
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(r.code, 0, r.all);
  assert.ok(existsSync(join(root, '.git')), 'git init した');
  const map = JSON.parse(readFileSync(join(root, 'quest.map.json'), 'utf8'));
  assert.equal(map.quest.save, 'git', 'quest.map.json に quest.save: "git" を足した');
  const genesis = readLog(root)[0];
  const stored = JSON.parse(readFileSync(join(root, '.masume', genesis.data.map_file), 'utf8'));
  assert.equal(stored.quest.save, 'git', '冒険の書の地図も git でセーブする');
  const saved = readLog(root).filter((e) => e.type === 'saved');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].data.node, null);
  assert.match(saved[0].data.commit, /^[0-9a-f]{40}$/);

  assert.equal(git(root, ['log', '-1', '--format=%s']).out, 'gridhub: 冒険のはじまり');
  assert.equal(git(root, ['log', '-1', '--format=%s', 'HEAD~1']).out, 'gridhub save: ふりだし', 'ふりだしのセーブが最初のコミット');
  assert.equal(git(root, ['rev-parse', 'HEAD~1']).out, saved[0].data.commit);
  assert.match(git(root, ['log', '-1', '--format=%an <%ae>']).out, /GridHub <gridhub@localhost>/, '名前が無ければ GridHub');
  const files = git(root, ['ls-files']).out.split('\n');
  for (const f of ['quest.map.json', 'checks/done.mjs', 'AGENTS.md', 'CLAUDE.md', 'WISH.md', '.gitignore', '.masume/log.jsonl']) {
    assert.ok(files.includes(f), `最初のコミットに ${f}`);
  }
  assert.ok(!files.includes('.masume/lock'), '.gitignore に従う');
  assert.equal(git(root, ['status', '--porcelain']).out, '', 'ルートの全部をコミットした');
  assert.match(r.all, /git init/);
});

test('§46.3 もとから Git の中なら git init もコミットもしない（ふりだしのセーブは記録する）', async () => {
  const outer = tmp('gridhub-q6-repo-');
  gitInit(outer);
  const root = join(outer, 'game');
  mkdirSync(root);
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(r.code, 0, r.all);
  assert.equal(existsSync(join(root, '.git')), false, 'サブディレクトリに git init しない');
  const subjects = git(outer, ['log', '--format=%s']).out.split('\n');
  assert.ok(!subjects.includes('gridhub: 冒険のはじまり'), '語り部はコミットしない');
  const saved = readLog(root).filter((e) => e.type === 'saved');
  assert.equal(saved.length, 1);
  assert.equal(subjects.at(-1), 'gridhub save: ふりだし', 'HEAD が無ければ、ふりだしのセーブが最初のコミット');
  assert.match(git(outer, ['status', '--porcelain']).out, /\?\? game\//, 'ほかのファイルはコミットしない');
});

test('§46.3 --dry-run は git init しない', async () => {
  const root = tmp('gridhub-q6-dry-');
  const d = await quest([WISH, '--dir', root, '--gm', fakeGm('good'), '--dry-run']);
  assert.equal(d.code, 0, d.all);
  assert.equal(existsSync(join(root, '.git')), false, '--dry-run は何もしない');
});

test('§46.3 git が無ければ、その旨を出して続ける', async () => {
  const bin = tmp('gridhub-q6-bin-');
  symlinkSync(process.execPath, join(bin, 'node'));
  const root = tmp('gridhub-q6-nogit-');
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')], { PATH: bin });
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /git が見つかりません/);
  assert.equal(existsSync(join(root, '.git')), false);
  const saved = readLog(root).filter((e) => e.type === 'saved');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].data.commit, null, 'セーブできなかったことを記録する');
  assert.equal(typeof saved[0].data.error, 'string');
});

test('§46.1・§46.4 GM のプロンプトに cases・quest.save・territory。AGENTS.md は GridHub の名前で、歩くコマンドと1マスずつの進め方', async () => {
  const root = tmp('gridhub-q6-text-');
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(r.code, 0, r.all);
  const prompt = readFileSync(join(root, 'gm-prompt-1.txt'), 'utf8');
  assert.match(prompt, /GridHub/);
  assert.match(prompt, /`cases`/);
  assert.match(prompt, /2〜6件/);
  assert.match(prompt, /テストの名前を、`cases` と\*\*同じ\*\*/);
  assert.match(prompt, /quest\.save: "git"/);
  assert.match(prompt, /重ならない `territory`/);
  const agents = readFileSync(join(root, 'AGENTS.md'), 'utf8');
  assert.match(agents, /GridHub（旧名マスメ）/);
  assert.ok(agents.includes(`node '${BIN}' step <ID> --as <ID>`), '歩くコマンド（AGENTS.md の中で <ID> はあなたのキャラクターID と定義している）');
  assert.match(agents, /いちばん手前の落ちているテスト/);
  assert.match(agents, /全部のテストが通ってから/);
  assert.match(readFileSync(join(root, 'CLAUDE.md'), 'utf8').split('\n')[0], /GridHub（旧名マスメ）/);
});
