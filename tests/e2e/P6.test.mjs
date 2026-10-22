// P6「作戦」— CONTRACTS §45（第11章）。作戦はエージェントの動き方と止まる条件を変える。ルールは変えない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { masumeEnv, readLog, fakeAgent } from '../helpers2.mjs';
import { newDungeon, GRIDHUB } from '../helpers5.mjs';

/** シェルの単一引用符 */
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
const party = (dir, args, env = {}) => masumeEnv(['party', '--dir', dir, ...args], { cwd: dir, env });
const partyJson = (dir, obj) => writeFileSync(join(dir, '.masume', 'party.json'), JSON.stringify(obj));

const NAMES = { careful: 'いのちだいじに', balanced: 'バッチリがんばれ', bold: 'ガンガンいこうぜ' };

test('§45.1・§45.3 --dry-run: 作戦の行・伝承の代・歩くコマンド。既定はバッチリがんばれ', async () => {
  const dir = newDungeon();
  const before = readLog(dir).length;
  const r = await party(dir, ['--dry-run', '--agent', 'claude']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /^作戦: バッチリがんばれ/m, '既定は balanced');
  assert.match(r.all, /作戦: バッチリがんばれ（balanced）/);
  assert.match(r.all, /あなたは 戦士アリス の 1代目/);
  assert.ok(r.all.includes(`step a --as a --dir ${sq(dir)}`), `歩くコマンド\n${r.all}`);
  assert.match(r.all, /いちばん手前の落ちているテスト（いま戦うテスト）だけを通す/);
  for (const [id, name] of Object.entries(NAMES)) {
    for (const value of [id, name]) {
      const t = await party(dir, ['--dry-run', '--agent', 'claude', '--tactic', value]);
      assert.equal(t.code, 0, t.all);
      assert.match(t.all, new RegExp(`^作戦: ${name}`, 'm'), `--tactic ${value}`);
      assert.match(t.all, new RegExp(`作戦: ${name}（${id}）`));
    }
  }
  assert.equal(readLog(dir).length, before, 'dry-run は冒険の書に書かない');
});

test('§45.1 party.json の tactic。--tactic が優先。不正な値は E_USAGE/2', async () => {
  const dir = newDungeon();
  partyJson(dir, { agent: 'claude', tactic: 'bold' });
  assert.match((await party(dir, ['--dry-run'])).all, /^作戦: ガンガンいこうぜ/m);
  assert.match((await party(dir, ['--dry-run', '--tactic', 'careful'])).all, /^作戦: いのちだいじに/m);
  partyJson(dir, { agent: 'claude', tactic: 'いのちだいじに' });
  assert.match((await party(dir, ['--dry-run'])).all, /^作戦: いのちだいじに/m, 'party.json にも日本語の名前');
  const bad = await party(dir, ['--dry-run', '--tactic', 'yolo']);
  assert.equal(bad.code, 2, bad.all);
  assert.match(bad.err, /E_USAGE/);
  partyJson(dir, { agent: 'claude', tactic: 'everyone-attack' });
  const badJson = await party(dir, ['--dry-run']);
  assert.equal(badJson.code, 2, badJson.all);
  assert.match(badJson.err, /E_USAGE/);
  partyJson(dir, { agent: 'claude', tactic: 3 });
  assert.equal((await party(dir, ['--dry-run'])).code, 2, '文字列でない tactic も E_USAGE');
});

test('§45.2 プロンプト: 作戦・動き方・止まる条件・歩くコマンド・伝承（この出撃が何回目か）', async () => {
  const dir = newDungeon();
  const agent = fakeAgent('record');
  const r = await party(dir, ['--agent', agent, '--only', 'a', '--rounds', '1', '--tactic', 'bold']);
  assert.match(r.all, /出撃準備: [^\n]*作戦: ガンガンいこうぜ/, `巡回の見出しに作戦\n${r.all}`);
  const first = JSON.parse(readFileSync(join(dir, 'record-a-1.json'), 'utf8'));
  const prompt = first.prompt;
  assert.ok(prompt.includes('作戦: ガンガンいこうぜ（bold）'));
  assert.match(prompt, /次の町まで/, '動き方');
  assert.match(prompt, /町に着いたら（セーブしたら）/, '止まる条件');
  assert.ok(prompt.includes(`node ${sq(first.MASUME_BIN)} step a --as a --dir ${sq(dir)}`), '歩くコマンドそのまま');
  assert.match(prompt, /いちばん手前の落ちているテスト（いま戦うテスト）だけを通す/);
  assert.match(prompt, /あなたは 戦士アリス の 1代目。指令書の技と日誌は先代から受け継いだもの。苦労して分かったことは、次の代のために日誌に書く/);
  assert.match(prompt, /GridHub/);

  const again = await party(dir, ['--agent', agent, '--only', 'a', '--rounds', '1', '--tactic', 'careful']);
  assert.ok([0, 2].includes(again.code), again.all);
  const second = JSON.parse(readFileSync(join(dir, 'record-a-2.json'), 'utf8')).prompt;
  assert.match(second, /あなたは 戦士アリス の 2代目/, '2回目の出撃は2代目');
  assert.ok(second.includes('作戦: いのちだいじに（careful）'));
  assert.match(second, /全部のテストが通るまで宣言（check）しない/);
  assert.match(second, /1つのダンジョンを抜けたら/);
});

test('§45.3 party --help に --tactic と3つの作戦', async () => {
  const dir = newDungeon();
  const r = await masumeEnv(['party', '--help'], { cwd: dir });
  assert.equal(r.code, 0);
  for (const w of ['--tactic', 'careful', 'balanced', 'bold', ...Object.values(NAMES)]) assert.ok(r.out.includes(w), `--help に ${w}`);
  const g = await masumeEnv(['--help'], { cwd: dir });
  assert.match(g.out, /--tactic/);
  assert.ok(GRIDHUB);
});
