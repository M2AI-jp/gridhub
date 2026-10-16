// E5「出撃と願いを記録する」— CONTRACTS §12（wish / sortie / returned、ビュー、brief、CLI、API）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, tmp, masume, masumeJson, newToy, flag, view, char, readLog, sha256, playToyToFinale } from '../helpers2.mjs';

const lastOf = (dir, type) => readLog(dir).filter((e) => e.type === type).pop();

test('出撃と帰還（進んだ）', () => {
  const dir = newToy();
  const s = masume(['sortie', 'a', '--agent', 'codex', '--model', 'gpt-x', '--dir', dir, '--as', 'party']);
  assert.equal(s.code, 0, s.all);
  const sortie = lastOf(dir, 'sortie');
  assert.match(s.out, new RegExp(String(sortie.seq)));
  assert.equal(sortie.actor, 'party');
  assert.deepEqual(sortie.data, { character: 'a', node: 'A1', agent: 'codex', model: 'gpt-x' });
  let v = view(dir);
  let a = char(v, 'a');
  assert.deepEqual(a.sortie, { seq: sortie.seq, agent: 'codex', model: 'gpt-x', node: 'A1', since: sortie.ts });
  assert.equal(a.sorties, 1);
  assert.equal(char(v, 'b').sortie, null);
  assert.equal(char(v, 'b').sorties, 0);
  assert.equal(a.at, 'A1', '出撃は盤面の状態を変えない');
  assert.match(v.log[v.log.length - 1].text, /戦士アリス が出撃した（codex gpt-x）/);
  assert.equal(v.log[v.log.length - 1].ok, null);
  const b = masume(['brief', 'a', '--dir', dir]);
  assert.match(b.out, /出撃中: codex/);
  const bj = masumeJson(['brief', 'a', '--dir', dir]);
  assert.deepEqual(bj.data.sortie, a.sortie);
  assert.equal(masumeJson(['brief', 'b', '--dir', dir]).data.sortie, null);

  // 出撃中にもう一度は出せない
  const twice = masume(['sortie', 'a', '--agent', 'claude', '--dir', dir]);
  assert.equal(twice.code, 2, twice.all);
  assert.match(twice.all, /E_BUSY/);

  flag(dir, 'A1');
  assert.equal(masume(['check', 'a', '--dir', dir, '--as', 'a']).code, 0);
  const logFile = join(dir, 'agent-out.txt');
  writeFileSync(logFile, 'エージェントの出力です\nA1 をやりました\n');
  const r = masume(['return', 'a', '--sortie', String(sortie.seq), '--code', '0', '--log', logFile, '--dir', dir, '--as', 'party']);
  assert.equal(r.code, 0, r.all);
  const ret = lastOf(dir, 'returned');
  const out = `outputs/sortie-${String(sortie.seq).padStart(6, '0')}.log`;
  assert.deepEqual(ret.data, {
    sortie: sortie.seq, character: 'a', node_before: 'A1', node_after: 'A2', advanced: true, code: 0,
    output: out, output_hash: sha256(readFileSync(logFile)),
  });
  assert.equal(readFileSync(join(dir, '.masume', out), 'utf8'), readFileSync(logFile, 'utf8'));
  v = view(dir);
  a = char(v, 'a');
  assert.equal(a.sortie, null, '帰還したら出撃中ではない');
  assert.equal(a.sorties, 1);
  const last = v.log[v.log.length - 1];
  assert.match(last.text, /戦士アリス が帰還した（A1 → A2、進んだ）/);
  assert.equal(last.ok, true);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);

  // 同じ出撃は二度帰還できない
  const again = masume(['return', 'a', '--sortie', String(sortie.seq), '--code', '0', '--dir', dir]);
  assert.equal(again.code, 2, again.all);
  assert.match(again.all, /E_USAGE/);
});

test('出撃と帰還（進めなかった）、出せない相手', () => {
  const dir = newToy();
  const s = masume(['sortie', 'b', '--agent', 'claude', '--dir', dir]);
  assert.equal(s.code, 0, s.all);
  const sortie = lastOf(dir, 'sortie');
  assert.equal(sortie.data.model, null);
  // 別のキャラの出撃としては帰還できない
  const wrong = masume(['return', 'a', '--sortie', String(sortie.seq), '--code', '0', '--dir', dir]);
  assert.equal(wrong.code, 2, wrong.all);
  const r = masume(['return', 'b', '--sortie', String(sortie.seq), '--code', '1', '--dir', dir]);
  assert.equal(r.code, 0, r.all);
  const ret = lastOf(dir, 'returned');
  assert.equal(ret.data.advanced, false);
  assert.equal(ret.data.node_after, 'B1');
  assert.equal(ret.data.code, 1);
  assert.equal(readFileSync(join(dir, '.masume', ret.data.output), 'utf8'), '', '--log が無ければ空の出力');
  const v = view(dir);
  assert.match(v.log[v.log.length - 1].text, /魔法使いボブ が帰還した（B1 → B1、進めなかった）/);
  assert.equal(v.log[v.log.length - 1].ok, false);

  const human = masume(['sortie', 'h', '--agent', 'claude', '--dir', dir]);
  assert.equal(human.code, 2, human.all);
  assert.match(human.all, /E_USAGE/);
  const unknown = masume(['sortie', 'zz', '--agent', 'claude', '--dir', dir]);
  assert.equal(unknown.code, 2);
  assert.match(unknown.all, /E_UNKNOWN/);
  const missing = masume(['return', 'b', '--sortie', '9999', '--code', '0', '--dir', dir]);
  assert.equal(missing.code, 2);

  const done = newToy({ withB3: true });
  playToyToFinale(done);
  assert.equal(masume(['stamp', 'H1', '--dir', done, '--as', 'h']).code, 0);
  const late = masume(['sortie', 'a', '--agent', 'claude', '--dir', done]);
  assert.equal(late.code, 2, late.all);
  assert.match(late.all, /E_DONE/);
});

test('願いの記録と、モジュール API', async () => {
  const dir = newToy();
  const w = masume(['wish', 'メモアプリのような', 'アプリを作りたい', '--gm', 'claude', '--model', 'sonnet', '--dir', dir, '--as', 'gm']);
  assert.equal(w.code, 0, w.all);
  const wish = lastOf(dir, 'wish');
  assert.deepEqual(wish.data, { text: 'メモアプリのような アプリを作りたい', gm: 'claude', model: 'sonnet' });
  const v = view(dir);
  assert.equal(v.log[v.log.length - 1].text, '願い: メモアプリのような アプリを作りたい');

  const engine = await import(pathToFileURL(join(ROOT, 'src', 'engine', 'index.js')).href);
  for (const fn of ['recordSortie', 'recordReturn', 'recordWish']) assert.equal(typeof engine[fn], 'function', `engine.${fn}`);
  const s = engine.recordSortie(dir, 'b', { agent: 'cmd', model: null });
  assert.equal(s.type, 'sortie');
  assert.equal(s.actor, 'party');
  const r = engine.recordReturn(dir, 'b', { sortie: s.seq, code: 0, log: 'こんにちは' });
  assert.equal(r.type, 'returned');
  assert.equal(readFileSync(join(dir, '.masume', r.data.output), 'utf8'), 'こんにちは');
  const w2 = engine.recordWish(dir, { text: 'もう一つの願い', gm: 'codex' });
  assert.deepEqual(w2.data, { text: 'もう一つの願い', gm: 'codex', model: null });
  assert.equal(masume(['verify', '--dir', dir]).code, 0);

  // 出撃の出力を書き換えると呪い
  writeFileSync(join(dir, '.masume', r.data.output), '書き換えた');
  const vj = masumeJson(['verify', '--dir', dir]);
  assert.equal(vj.code, 3);
  assert.ok(vj.data.errors.some((e) => e.code === 'E_OUTPUT' && e.seq === r.seq), JSON.stringify(vj.data.errors));
});
