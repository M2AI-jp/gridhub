// E1「冒険の書をひらく」— 書記の最初のマス。SAVE_FORMAT.md と CONTRACTS §2/§3 の判定。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeJson, masumeAsync, readLog, setupToy, toyMap, eventHash, sha256, canonical } from '../helpers.mjs';

const ZERO = '0'.repeat(64);

function writeMap(dir, name, map) {
  writeFileSync(join(dir, name), JSON.stringify(map, null, 2));
  return name;
}

test('validate: 正しい地図は通る', () => {
  const dir = tmp();
  setupToy(dir);
  const r = masume(['validate', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  const j = masumeJson(['validate', 'toy.map.json'], { cwd: dir });
  assert.equal(j.code, 0, j.all);
  assert.equal(j.data.ok, true);
  assert.deepEqual(j.data.errors, []);
});

test('validate: 壊れた地図はエラーコードで指摘される', () => {
  const dir = tmp();
  const cases = [
    ['E_UNKNOWN_NODE', (m) => m.characters[0].path.splice(1, 0, 'NOPE')],
    ['E_SHARED_TASK', (m) => m.characters[1].path.splice(0, 0, 'A1')],
    ['E_GATE_MEMBERS', (m) => { m.nodes.G9 = { type: 'gate', title: 'ひとりのゲート', check: { kind: 'cmd', run: 'true' } }; m.characters[0].path.splice(1, 0, 'G9'); }],
    ['E_ORPHAN', (m) => { m.nodes.Z9 = { type: 'task', title: '迷子', check: { kind: 'cmd', run: 'true' } }; }],
    ['E_CYCLE', (m) => {
      m.nodes.G2 = { type: 'gate', title: '二つ目', check: { kind: 'cmd', run: 'true' } };
      m.characters[0].path.splice(m.characters[0].path.indexOf('G1') + 1, 0, 'G2');
      m.characters[1].path.splice(m.characters[1].path.indexOf('G1'), 0, 'G2');
    }],
    ['E_ROLLBACK', (m) => { m.nodes.A1.rollback_to = 'A4'; }],
    ['E_CHECK', (m) => { delete m.nodes.A2.check; }],
    ['E_CHECK', (m) => { m.nodes.H1.check.by = 'a'; }],
    ['E_GOAL', (m) => { m.quest.goal = 'A1'; }],
    ['E_DUP_IN_PATH', (m) => { m.characters[0].path.splice(2, 0, 'A1'); }],
    ['E_DUP_CHAR', (m) => { m.characters.push({ ...m.characters[1], path: ['FIN'] }); }],
    ['E_FORMAT', (m) => { m.masume = 2; }],
    ['E_ID', (m) => { m.characters[0].id = 'Bad Id'; }],
  ];
  for (const [code, mutate] of cases) {
    const m = toyMap();
    mutate(m);
    writeMap(dir, 'bad.map.json', m);
    const r = masume(['validate', 'bad.map.json'], { cwd: dir });
    assert.equal(r.code, 1, `${code} のとき終了コード1: ${r.all}`);
    assert.match(r.all, new RegExp(code), `${code} が出力に含まれる: ${r.all}`);
    const j = masumeJson(['validate', 'bad.map.json'], { cwd: dir });
    assert.equal(j.data.ok, false);
    assert.ok(j.data.errors.some((e) => e.code === code), `${code} が errors に含まれる: ${JSON.stringify(j.data.errors)}`);
  }
});

test('new: 冒険の書が生まれ、存在する判定ファイルは自動で封印される', () => {
  const dir = tmp();
  setupToy(dir);
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  // 第11章 §52（GM）: いまの記録の目印は「記録: seq N」（と Git のコミット）。じゅもんはやめた。
  assert.match(r.out, /記録: seq \d+/);
  assert.ok(existsSync(join(dir, '.masume', 'log.jsonl')));
  assert.ok(existsSync(join(dir, '.masume', 'maps', '0001.json')));

  const log = readLog(dir);
  assert.equal(log[0].seq, 0);
  assert.equal(log[0].type, 'genesis');
  assert.equal(log[0].prev, ZERO);
  assert.equal(log[0].data.masume, 1);
  assert.equal(log[0].data.quest_id, 'TOY');
  assert.equal(log[0].data.map_file, 'maps/0001.json');
  const map = JSON.parse(readFileSync(join(dir, '.masume', 'maps', '0001.json'), 'utf8'));
  assert.equal(log[0].data.map_hash, sha256(canonical(map)));

  // 鎖が正しい
  log.forEach((e, i) => {
    assert.equal(e.seq, i);
    assert.equal(e.hash, eventHash(e), `seq ${i} の hash`);
    if (i > 0) assert.equal(e.prev, log[i - 1].hash, `seq ${i} の prev`);
  });

  // checks/flag.mjs を使うマスは封印済み、checks/b3.mjs（存在しない）のB3は未封印
  const sealed = log.filter((e) => e.type === 'sealed');
  const sealedNodes = sealed.map((e) => e.data.node).sort();
  assert.deepEqual(sealedNodes, ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'FIN', 'G1']);
  const flagHash = sha256(readFileSync(join(dir, 'checks', 'flag.mjs')));
  for (const e of sealed) assert.deepEqual(e.data.files, { 'checks/flag.mjs': flagHash });

  // 二重に new はできない
  const again = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(again.code, 2, again.all);
  assert.match(again.all, /E_EXISTS/);
  // 壊れた地図では始まらない
  const dir2 = tmp();
  const bad = toyMap();
  bad.quest.goal = 'NOPE';
  writeMap(dir2, 'bad.map.json', bad);
  const r2 = masume(['new', 'bad.map.json'], { cwd: dir2 });
  assert.equal(r2.code, 1, r2.all);
  assert.ok(!existsSync(join(dir2, '.masume', 'log.jsonl')));
});

// 第11章 §52（GM）: ふっかつのじゅもんはやめた（ユーザーの指示）。いまの状態は記録の番号（seq）とハッシュで指す。
test('verify: 記録の番号（seq）とハッシュで、いまの状態を指せる', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const log = readLog(dir);
  const head = log[log.length - 1];

  const v = masume(['verify'], { cwd: dir });
  assert.equal(v.code, 0, v.all);
  assert.match(v.out, /冒険の書は正常です/);
  const vj = masumeJson(['verify'], { cwd: dir });
  assert.equal(vj.data.ok, true);
  // Git の外の冒険なので、記録が見ていたコミットは無い
  assert.deepEqual(vj.data.head, { seq: head.seq, hash: head.hash, commit: null });
  const s = masume(['status'], { cwd: dir });
  assert.equal(s.code, 0, s.all);
  assert.equal(s.out.trim().split('\n').pop().trim(), `記録: seq ${head.seq}`, 'status の最後の行は記録の目印');

  // じゅもんは、互換のためにも残さない
  const old = masume(['jumon'], { cwd: dir });
  assert.equal(old.code, 2, old.all);
  assert.match(old.all, /E_USAGE/);
  const oldVerify = masume(['verify', '--jumon', 'あいう えおか きくけ こさし'], { cwd: dir });
  assert.equal(oldVerify.code, 2, oldVerify.all);
  assert.match(oldVerify.all, /E_USAGE/);
  const help = masume(['--help'], { cwd: dir });
  assert.doesNotMatch(help.all, /じゅもん|jumon/i);
});

test('verify / repair: 改ざんは「呪い」として見つかり、修復できる', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  for (let i = 0; i < 3; i++) assert.equal(masume(['note', 'a', `日誌${i}`, '--as', 'a'], { cwd: dir }).code, 0);
  const file = join(dir, '.masume', 'log.jsonl');
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const target = lines.length - 2; // 最後から2つ目の日誌を書き換える
  const e = JSON.parse(lines[target]);
  e.data.text = '書き換えた';
  lines[target] = JSON.stringify(e);
  writeFileSync(file, lines.join('\n') + '\n');

  const v = masume(['verify'], { cwd: dir });
  assert.equal(v.code, 3, v.all);
  assert.match(v.all, /呪われています/);
  assert.match(v.all, new RegExp(`seq ${target}`));
  const vj = masumeJson(['verify'], { cwd: dir });
  assert.equal(vj.data.ok, false);
  assert.equal(vj.data.errors[0].seq, target);
  assert.equal(vj.data.errors[0].code, 'E_HASH');

  // 呪われた冒険の書では他のコマンドは動かない
  const n = masume(['note', 'a', 'もう一行', '--as', 'a'], { cwd: dir });
  assert.equal(n.code, 3, n.all);
  assert.match(n.all, /E_CURSED/);

  const rp = masume(['repair'], { cwd: dir });
  assert.equal(rp.code, 0, rp.all);
  assert.ok(readdirSync(join(dir, '.masume')).some((f) => /^log\.corrupt-.*\.jsonl$/.test(f)), '退避ファイルがある');
  assert.equal(masume(['verify'], { cwd: dir }).code, 0);
  const after = readLog(dir);
  assert.equal(after.length, target);
  assert.equal(masume(['note', 'a', '再開', '--as', 'a'], { cwd: dir }).code, 0);
  assert.equal(masume(['verify'], { cwd: dir }).code, 0);
});

test('verify / repair: 書きかけで途切れた行も見つかる', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const n = readLog(dir).length;
  appendFileSync(join(dir, '.masume', 'log.jsonl'), '{"seq":' + n + ',"ts":"2026');
  const vj = masumeJson(['verify'], { cwd: dir });
  assert.equal(vj.code, 3);
  assert.equal(vj.data.errors[0].code, 'E_PARSE');
  assert.equal(vj.data.errors[0].seq, n);
  assert.equal(masume(['repair'], { cwd: dir }).code, 0);
  assert.equal(masume(['verify'], { cwd: dir }).code, 0);
  assert.equal(readLog(dir).length, n);
});

test('verify: 地図ファイルの改ざんも見つかる', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const f = join(dir, '.masume', 'maps', '0001.json');
  const m = JSON.parse(readFileSync(f, 'utf8'));
  m.nodes.A1.check.run = 'true';
  writeFileSync(f, JSON.stringify(m, null, 2));
  const vj = masumeJson(['verify'], { cwd: dir });
  assert.equal(vj.code, 3, vj.all);
  assert.ok(vj.data.errors.some((e) => e.code === 'E_MAP'), JSON.stringify(vj.data.errors));
});

test('ロック: 8人が同時に日誌を書いても鎖は壊れない', async () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const before = readLog(dir).length;
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, i) => masumeAsync(['note', i % 2 ? 'a' : 'b', `同時${i}`, '--as', 'gm'], { cwd: dir })),
  );
  for (const r of results) assert.equal(r.code, 0, r.all);
  const log = readLog(dir);
  assert.equal(log.length, before + 8);
  const notes = log.filter((e) => e.type === 'note').map((e) => e.data.text).sort();
  assert.deepEqual(notes, Array.from({ length: 8 }, (_, i) => `同時${i}`).sort());
  log.forEach((e, i) => {
    assert.equal(e.seq, i);
    assert.equal(e.hash, eventHash(e));
    if (i > 0) assert.equal(e.prev, log[i - 1].hash);
  });
  assert.ok(!existsSync(join(dir, '.masume', 'lock')), 'ロックは残らない');
  assert.equal(masume(['verify'], { cwd: dir }).code, 0);
});

test('note / log: 日誌が書けて、ログが読める', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const r = masume(['note', 'a', '剣は', '研ぎかけ', '--as', 'a'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  const unknown = masume(['note', 'zz', 'だれ?', '--as', 'gm'], { cwd: dir });
  assert.equal(unknown.code, 2, unknown.all);
  assert.match(unknown.all, /E_UNKNOWN/);
  const lj = masumeJson(['log'], { cwd: dir });
  assert.equal(lj.code, 0, lj.all);
  const last = lj.data[lj.data.length - 1];
  assert.equal(last.type, 'note');
  assert.equal(last.actor, 'a');
  assert.deepEqual(last.data, { character: 'a', text: '剣は 研ぎかけ' });
  const tail = masumeJson(['log', '--tail', '2'], { cwd: dir });
  assert.equal(tail.data.length, 2);
  // --dir でも、子ディレクトリからでも見つかる
  const other = tmp();
  assert.equal(masume(['verify', '--dir', dir], { cwd: other }).code, 0);
  const none = masume(['verify'], { cwd: other });
  assert.equal(none.code, 2, none.all);
  assert.match(none.all, /E_NO_GAME/);
});

test('seal: 封印のやり直しと、無いファイルの封印', () => {
  const dir = tmp();
  setupToy(dir);
  masume(['new', 'toy.map.json'], { cwd: dir });
  const missing = masume(['seal', 'B3', '--as', 'gm'], { cwd: dir });
  assert.equal(missing.code, 2, missing.all);
  assert.match(missing.all, /E_SEAL_MISSING/);
  writeFileSync(join(dir, 'checks', 'b3.mjs'), 'process.exit(0)\n');
  const ok = masume(['seal', 'B3', '--as', 'gm'], { cwd: dir });
  assert.equal(ok.code, 0, ok.all);
  const last = readLog(dir).pop();
  assert.equal(last.type, 'sealed');
  assert.equal(last.data.node, 'B3');
  assert.equal(last.data.files['checks/b3.mjs'], sha256(readFileSync(join(dir, 'checks', 'b3.mjs'))));
  const before = readLog(dir).length;
  assert.equal(masume(['seal', '--all', '--as', 'gm'], { cwd: dir }).code, 0);
  assert.equal(readLog(dir).length, before + 9, 'seal を持つ9マスが封印し直される');
});
