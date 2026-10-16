// E7「地図と記録の作法」— CONTRACTS §24（第4章: 総点検の修理）。
//  1. amend: 突破済みのゲートの顔ぶれ（そのゲートを path に含むキャラクター）を変える改訂は E_AMEND_HISTORY/1
//  2. amend の地図のパスはカレントからの相対（new・validate と同じ）
//  3. note は epoch を上げない（日誌で判定が E_CONFLICT にならない）
//  4. seal --all は、そろっていないマスを「保留: <マスID>…」と表示する（終了コード0）
//  5. ゲートの封印破りのログの文は「<ゲートID> の封印が破れていた」（null を出さない）
//  6. new --force は .masume/linear.json と .masume/jira.json を残す
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeAsync, newToy, setupToy, toyMap, playToyToFinale, flag, view, char, readLog, waitUntil } from '../helpers3.mjs';

// ---- この判定だけで使う小道具 ----

const check = (dir, who, extra = []) => masume(['check', who, '--dir', dir, '--as', who, ...extra]);

/** おもちゃの地図に、斥候シロ（c）を足す。path は呼び出し側が決める */
function withScout(path) {
  const map = toyMap();
  map.characters.push({ id: 'c', name: '斥候シロ', kind: 'agent', agent: 'test', job: 'thief', color: 'green', path });
  map.nodes.C1 = { type: 'task', title: '偵察する', check: { kind: 'cmd', run: 'node checks/flag.mjs C1', seal: ['checks/flag.mjs'] } };
  return map;
}

/** map を next.map.json として書き、dir から amend する（カレント = dir なので、どちらの基準でも読める） */
function amendWith(dir, map) {
  writeFileSync(join(dir, 'next.map.json'), JSON.stringify(map, null, 2));
  return masume(['amend', 'next.map.json', '--dir', dir, '--as', 'gm'], { cwd: dir });
}

function assertRejected(dir, r, what) {
  assert.equal(r.code, 1, `${what}: 終了コード1:\n${r.all}`);
  assert.match(r.all, /E_AMEND_HISTORY/, what);
}

// ---------------------------------------------------------------------------
// §24.1 突破済みのゲートの顔ぶれを変える改訂は E_AMEND_HISTORY
// ---------------------------------------------------------------------------

test('§24.1 突破済みのゲートを通る新しいキャラクターを足す改訂は断られる（途中）', () => {
  const dir = newToy({ withB3: true });
  playToyToFinale(dir); // G1 は突破済み。a, b は FIN で待機、h は H1
  assert.equal(view(dir).nodes.G1.state, 'cleared');
  const events = readLog(dir).length;

  // 新しいキャラクターが突破済みの G1 を通る → そのキャラクターは永遠に詰む
  assertRejected(dir, amendWith(dir, withScout(['C1', 'G1', 'FIN'])), '新キャラが G1 を通る');
  // 既存のキャラクター（h）の道に突破済みの G1 を足すのも、顔ぶれが変わる
  const map = toyMap();
  map.characters[2].path = ['H1', 'G1', 'FIN'];
  assertRejected(dir, amendWith(dir, map), 'h の道に G1 を足す');

  assert.equal(readLog(dir).length, events, '断られた改訂は何も記録しない');
  assert.equal(view(dir).map_version, 1);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);

  // 対照: まだ突破していない FIN にだけ加わる新キャラクターは、これまでどおり足せる
  const ok = amendWith(dir, withScout(['C1', 'FIN']));
  assert.equal(ok.code, 0, ok.all);
  const v = view(dir);
  assert.equal(v.map_version, 2);
  assert.equal(char(v, 'c').at, 'C1');
  assert.deepEqual(v.nodes.FIN.members, ['a', 'b', 'h', 'c']);
  assert.equal(readLog(dir).filter((e) => e.type === 'amended').length, 1);
});

test('§24.1 あがったあとに、突破済みのゲートへ加わる新しいキャラクターを足す改訂は断られる', () => {
  const dir = newToy({ withB3: true });
  playToyToFinale(dir);
  const s = masume(['stamp', 'H1', '--dir', dir, '--as', 'h']);
  assert.equal(s.code, 0, s.all);
  assert.equal(view(dir).finished, true);
  const events = readLog(dir).length;

  assertRejected(dir, amendWith(dir, withScout(['C1', 'G1', 'FIN'])), 'あがり後に G1 と FIN を通る新キャラ');
  assertRejected(dir, amendWith(dir, withScout(['C1', 'FIN'])), 'あがり後に FIN を通る新キャラ');
  assert.equal(readLog(dir).length, events, '断られた改訂は何も記録しない');
  assert.equal(view(dir).finished, true);
  assert.equal(view(dir).characters.length, 3, '詰むキャラクターは生まれない');
});

// ---------------------------------------------------------------------------
// §24.2 amend の地図のパスは、カレントからの相対
// ---------------------------------------------------------------------------

test('§24.2 amend <相対パス> は、--dir のルートではなくカレントを基準に読む', () => {
  const dir = newToy();
  const here = tmp('masume-cwd-'); // 地図のある場所（ルートではない）
  const titled = (title) => {
    const map = toyMap();
    map.nodes.A1.title = title;
    return JSON.stringify(map, null, 2);
  };
  // ルートにも同名の別の地図を置いておく: 間違った基準で読むと、こちらが採用される
  writeFileSync(join(dir, 'next.map.json'), titled('ルートにあった地図'));
  writeFileSync(join(here, 'next.map.json'), titled('カレントにあった地図'));

  const r = masume(['amend', 'next.map.json', '--dir', dir, '--as', 'gm'], { cwd: here });
  assert.equal(r.code, 0, r.all);
  assert.equal(view(dir).nodes.A1.title, 'カレントにあった地図');
  assert.equal(view(dir).map_version, 2);

  // ルートの子ディレクトリがカレントのとき（ルートは上へたどって見つかる）も、カレント基準
  const sub = join(dir, 'sub');
  mkdirSync(sub);
  writeFileSync(join(sub, 'next.map.json'), titled('子ディレクトリにあった地図'));
  const r2 = masume(['amend', 'next.map.json', '--as', 'gm'], { cwd: sub });
  assert.equal(r2.code, 0, r2.all);
  assert.equal(view(dir).nodes.A1.title, '子ディレクトリにあった地図');

  const r3 = masume(['amend', '../next.map.json', '--as', 'gm'], { cwd: sub });
  assert.equal(r3.code, 0, r3.all);
  assert.equal(view(dir).nodes.A1.title, 'ルートにあった地図');
  assert.equal(view(dir).map_version, 4);
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

// ---------------------------------------------------------------------------
// §24.3 note は epoch を上げない
// ---------------------------------------------------------------------------

const SLOW_JUDGE = `import { writeFileSync } from 'node:fs';
writeFileSync('flags/started-' + process.argv[2], '1');
await new Promise((r) => setTimeout(r, 2500));
console.log('slow ok');
`;

/** node の判定を、2.5秒かかる（始まると flags/started-<マスID> を書く）ものに差し替えた冒険を始める */
function slowToy(nodeId) {
  const dir = tmp('masume-e7-');
  const map = toyMap();
  map.nodes[nodeId].check = { kind: 'cmd', run: `node checks/slow.mjs ${nodeId}`, seal: ['checks/slow.mjs'] };
  setupToy(dir, { map, withB3: true });
  writeFileSync(join(dir, 'checks', 'slow.mjs'), SLOW_JUDGE);
  const r = masume(['new', 'toy.map.json'], { cwd: dir });
  assert.equal(r.code, 0, r.all);
  return dir;
}

test('§24.3 判定の最中に note を書いても、その判定は E_CONFLICT で捨てられない', async () => {
  const dir = slowToy('A1');
  const running = masumeAsync(['check', 'a', '--dir', dir, '--as', 'a']);
  await waitUntil(() => existsSync(join(dir, 'flags', 'started-A1')), { timeout: 15000, message: '判定の開始' });
  const note = masume(['note', 'a', '途中の申し送り', '--dir', dir, '--as', 'a']);
  assert.equal(note.code, 0, note.all);
  const r = await running;
  assert.equal(r.code, 0, `日誌のせいで判定が捨てられてはいけない:\n${r.all}`);
  assert.doesNotMatch(r.all, /E_CONFLICT/);
  assert.match(r.out, /判定成功/);

  const log = readLog(dir);
  const noteAt = log.findIndex((e) => e.type === 'note');
  const passedAt = log.findIndex((e) => e.type === 'check_passed');
  assert.ok(noteAt >= 0 && passedAt > noteAt, '日誌のあとに判定の成功が記録される');
  const v = view(dir);
  assert.equal(char(v, 'a').at, 'A2');
  assert.equal(char(v, 'a').last_note, '途中の申し送り');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
});

test('§24.3 ボス戦の最中に、メンバーが note を書いても、ボス戦は E_CONFLICT で捨てられない', async () => {
  const dir = slowToy('G1');
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2']) flag(dir, id);
  for (const who of ['a', 'a', 'a', 'b']) assert.equal(check(dir, who).code, 0);
  assert.equal(char(view(dir), 'a').status, 'waiting');

  // b の最後の宣言（B2）で G1 が ready になり、同じコマンドの中でボス戦（2.5秒）が始まる
  const running = masumeAsync(['check', 'b', '--dir', dir, '--as', 'b']);
  await waitUntil(() => existsSync(join(dir, 'flags', 'started-G1')), { timeout: 15000, message: 'ボス戦の開始' });
  assert.equal(masume(['note', 'a', 'ボス戦の最中のメモ', '--dir', dir, '--as', 'a']).code, 0);
  assert.equal(masume(['note', 'b', '同じく', '--dir', dir, '--as', 'b']).code, 0);
  const r = await running;
  assert.equal(r.code, 0, `日誌のせいでボス戦が捨てられてはいけない:\n${r.all}`);
  assert.doesNotMatch(r.all, /E_CONFLICT/);
  assert.match(r.out, /結合ゲート突破/);
  assert.equal(view(dir).nodes.G1.state, 'cleared');
});

// ---------------------------------------------------------------------------
// §24.4 seal --all は保留を表示する
// ---------------------------------------------------------------------------

test('§24.4 seal --all は、そろっていないマスを「保留: <マスID>」と表示して飛ばす（終了コード0）', () => {
  const dir = tmp('masume-e7-');
  const map = toyMap();
  // 判定ファイルがまだ無いマスを2つにする（B3 の checks/b3.mjs と、A4 の checks/a4.mjs）
  map.nodes.A4.check = { kind: 'cmd', run: 'node checks/flag.mjs A4', seal: ['checks/a4.mjs'] };
  setupToy(dir, { map });
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 0);
  const sealedBefore = readLog(dir).filter((e) => e.type === 'sealed').length;

  const r = masume(['seal', '--all', '--dir', dir, '--as', 'gm']);
  assert.equal(r.code, 0, r.all);
  assert.match(r.out, /保留:[^\n]*B3/, `B3 は保留と表示される:\n${r.out}`);
  assert.match(r.out, /保留:[^\n]*A4/, `A4 も保留と表示される:\n${r.out}`);
  assert.doesNotMatch(r.out, /保留:[^\n]*(A1|A2|A3|B1|B2|G1|FIN)/, 'そろっているマスは保留と言わない');
  const sealed = readLog(dir).filter((e) => e.type === 'sealed').slice(sealedBefore).map((e) => e.data.node).sort();
  assert.deepEqual(sealed, ['A1', 'A2', 'A3', 'B1', 'B2', 'FIN', 'G1'], 'そろっているマスだけが封印し直される');

  // 判定ファイルがそろえば、保留は無くなり、封印される
  writeFileSync(join(dir, 'checks', 'b3.mjs'), "console.log('PASS B3');\n");
  writeFileSync(join(dir, 'checks', 'a4.mjs'), "console.log('PASS A4');\n");
  const r2 = masume(['seal', '--all', '--dir', dir, '--as', 'gm']);
  assert.equal(r2.code, 0, r2.all);
  assert.doesNotMatch(r2.out, /保留/);
  const v = view(dir);
  assert.equal(v.nodes.B3.sealed, true);
  assert.equal(v.nodes.A4.sealed, true);
});

// ---------------------------------------------------------------------------
// §24.5 ゲートの封印破りのログの文
// ---------------------------------------------------------------------------

test('§24.5 ゲートの封印破りは「G1 の封印が破れていた」と記録され、null を出さない', () => {
  const dir = tmp('masume-e7-');
  const map = toyMap();
  // G1 だけが自分の封印ファイル（checks/g1.txt）を持つようにして、ほかのマスの封印を巻き込まない
  map.nodes.G1.check = { kind: 'cmd', run: 'node checks/flag.mjs G1', seal: ['checks/g1.txt'] };
  setupToy(dir, { map, withB3: true });
  writeFileSync(join(dir, 'checks', 'g1.txt'), '番人の判定\n');
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 0);
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2', 'G1']) flag(dir, id);
  for (const who of ['a', 'a', 'a', 'b']) assert.equal(check(dir, who).code, 0);
  assert.equal(check(dir, 'b', ['--no-boss']).code, 0); // G1 は ready のまま、ボス戦はまだ
  assert.equal(view(dir).nodes.G1.state, 'ready');

  appendFileSync(join(dir, 'checks', 'g1.txt'), '誰かがこっそり書き足した\n');
  const r = masume(['check', 'G1', '--dir', dir, '--as', 'gm']);
  assert.equal(r.code, 2, r.all);
  assert.match(r.all, /E_SEAL_BROKEN/);
  const ev = readLog(dir).pop();
  assert.equal(ev.type, 'seal_broken');
  assert.equal(ev.data.node, 'G1');
  assert.equal(ev.data.character, null, 'ゲートの封印破りは特定のキャラクターのものではない');

  const entry = view(dir).log.at(-1);
  assert.equal(entry.type, 'seal_broken');
  assert.equal(entry.node, 'G1');
  assert.match(entry.text, /^G1 の封印が破れていた/, `実際: ${entry.text}`);
  assert.doesNotMatch(entry.text, /null|undefined/);
  assert.equal(view(dir).nodes.G1.seal_broken, true);
});

// ---------------------------------------------------------------------------
// §24.6 new --force は同期先の対応表を残す
// ---------------------------------------------------------------------------

test('§24.6 new --force は .masume/linear.json と .masume/jira.json を残し、冒険の書は作り直す', () => {
  const dir = newToy();
  const linear = JSON.stringify({ team: 'TOY', project: { id: 'proj-1', name: 'おもちゃの冒険' }, issues: { A1: { id: 'issue-1', identifier: 'TOY-1' } } }, null, 2) + '\n';
  const jira = JSON.stringify({ project: 'TOY', issues: { A1: { id: '20001', key: 'TOY-1' } } }, null, 2) + '\n';
  writeFileSync(join(dir, '.masume', 'linear.json'), linear);
  writeFileSync(join(dir, '.masume', 'jira.json'), jira);
  assert.equal(masume(['note', 'a', '作り直す前の日誌', '--dir', dir, '--as', 'a']).code, 0);
  flag(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'A2');

  const again = masume(['new', 'toy.map.json', '--force'], { cwd: dir });
  assert.equal(again.code, 0, again.all);
  assert.equal(readFileSync(join(dir, '.masume', 'linear.json'), 'utf8'), linear, 'linear.json はそのまま残る');
  assert.equal(readFileSync(join(dir, '.masume', 'jira.json'), 'utf8'), jira, 'jira.json はそのまま残る');

  // 冒険の書そのものは作り直されている
  const log = readLog(dir);
  assert.equal(log[0].type, 'genesis');
  assert.ok(!log.some((e) => e.type === 'note' || e.type === 'check_passed'), '前の冒険の記録は消えている');
  assert.equal(char(view(dir), 'a').at, 'A1');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);
  // --force なしの二重の new は、これまでどおり断る
  assert.equal(masume(['new', 'toy.map.json'], { cwd: dir }).code, 2);
});
