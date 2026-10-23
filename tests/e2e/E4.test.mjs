// E4「時をさかのぼる」— 地図の改訂 amend（歴史は書き換えられない）と、過去の状態のロード load。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { masume, masumeJson, newToy, toyMap, flag, view, char, readLog, gitCommitAll } from '../helpers.mjs';

const check = (dir, who) => masume(['check', who, '--dir', dir, '--as', who]);

// 第11章 §52（GM）: じゅもんはやめた。戻り先は記録の番号（seq）か、冒険の書に記録された Git のコミットで指す。
test('load: seq でも、Git のコミットでも、その時の盤面に戻せる', () => {
  const dir = newToy();
  flag(dir, 'A1');
  flag(dir, 'A2');
  assert.equal(check(dir, 'a').code, 0);
  const snap = view(dir);
  const seq1 = snap.head.seq;
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'A3');

  const r = masume(['load', String(seq1), '--dir', dir, '--as', 'gm']);
  assert.equal(r.code, 0, r.all);
  const ev = readLog(dir).pop();
  assert.equal(ev.type, 'loaded');
  assert.deepEqual(ev.data, { to_seq: seq1 });
  let v = view(dir);
  // 第11章（CONTRACTS §40・§42）: 戦いの記録（テスト1件ずつの成否から導く square・メダルなど）は、ロードしても巻き戻らない。
  // それ以外（位置・レベル・経験値など）がその時の状態に戻ることを確かめる。
  const BATTLE = ['square', 'medals', 'revived', 'strong', 'skills', 'treasures', 'traps'];
  const timeless = (characters) => characters.map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !BATTLE.includes(k))));
  assert.deepEqual(timeless(v.characters), timeless(snap.characters), 'キャラクターはその時の状態');
  for (const id of Object.keys(snap.nodes)) assert.equal(v.nodes[id].state, snap.nodes[id].state, `${id} の state`);
  assert.equal(masume(['verify', '--dir', dir]).code, 0, 'ロードしても鎖は正常');

  // Git の作業ツリーにして、コミットの上で判定する。判定の記録は、そのとき見ていたコミットを持つ（§52.3）
  const c1 = gitCommitAll(dir, 'c1');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'A3');
  const atC1 = readLog(dir).filter((e) => e.data?.git?.head === c1);
  assert.ok(atC1.length >= 1, '判定の記録に data.git.head');
  assert.equal(view(dir).head.commit, c1, 'head.commit は最後に記録されたコミット');
  const st = masume(['status', '--dir', dir]);
  assert.equal(st.out.trim().split('\n').pop().trim(), `記録: seq ${view(dir).head.seq} / Git: commit ${c1.slice(0, 7)}`);
  flag(dir, 'A3');
  const c2 = gitCommitAll(dir, 'c2');
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'G1', 'A3 を抜けて砦で待つ');
  assert.equal(view(dir).head.commit, c2);
  // c1 が初めて記録された時点（a が A3 に進んだところ）に、短いコミットで戻る
  // 数字だけの短いコミットは seq と読まれる（§52.5）ので、英字が入るところまで伸ばす
  const short = c1.slice(0, Math.max(7, c1.search(/[a-f]/) + 1));
  const r2 = masume(['load', short, '--dir', dir, '--as', 'gm']);
  assert.equal(r2.code, 0, r2.all);
  assert.deepEqual(readLog(dir).pop().data, { to_seq: atC1[0].seq });
  assert.match(r2.out.trim().split('\n').pop(), /^記録: seq \d+ \/ Git: commit [0-9a-f]{7}$/, 'load の最後の行は記録の目印');
  v = view(dir);
  assert.equal(char(v, 'a').at, 'A3');
  // 大文字でも、40桁でも同じ
  assert.equal(masume(['load', c1.toUpperCase(), '--dir', dir, '--as', 'gm']).code, 0);
  assert.deepEqual(readLog(dir).pop().data, { to_seq: atC1[0].seq });
  // 冒険の書に記録されていないコミットには戻れない
  const unknown = masume(['load', 'deadbeef', '--dir', dir, '--as', 'gm']);
  assert.equal(unknown.code, 2, unknown.all);
  assert.match(unknown.all, /E_LOAD/);
  // seq で戻って、A2 から
  assert.equal(masume(['load', String(seq1), '--dir', dir, '--as', 'gm']).code, 0);
  v = view(dir);
  assert.equal(char(v, 'a').at, 'A2');

  // 戻した後も普通に遊べる
  assert.equal(check(dir, 'a').code, 0);
  assert.equal(char(view(dir), 'a').at, 'A3');

  // 未来や存在しない所にはロードできない
  const bad = masume(['load', '9999', '--dir', dir, '--as', 'gm']);
  assert.equal(bad.code, 2, bad.all);
  assert.match(bad.all, /E_LOAD/);
  // seq でもコミットでもないもの（第10章までのじゅもんも）は受け付けない
  for (const bad of ['ぼぼぼ ぼぼぼ ぼぼぼ ぼぼぼ', 'abc', 'seq12']) {
    const r3 = masume(['load', bad, '--dir', dir, '--as', 'gm']);
    assert.equal(r3.code, 2, r3.all);
    assert.match(r3.all, /E_LOAD/);
  }
});

test('amend: 計画は変えられるが、歴史は書き換えられない', () => {
  const dir = newToy();
  flag(dir, 'A1');
  assert.equal(check(dir, 'a').code, 0); // a は A2 にいる。A1 は通過済み

  const write = (m) => {
    writeFileSync(join(dir, 'next.map.json'), JSON.stringify(m, null, 2));
    return masume(['amend', 'next.map.json', '--dir', dir, '--as', 'gm'], { cwd: dir }); // 地図のパスはカレント基準（§24.2）
  };

  // 通過済みのマスを消す → だめ
  let m = toyMap();
  m.characters[0].path = m.characters[0].path.filter((id) => id !== 'A1');
  delete m.nodes.A1;
  let r = write(m);
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /E_AMEND_HISTORY/);

  // 通過済みのマスの判定を変える → だめ
  m = toyMap();
  m.nodes.A1.check = { kind: 'cmd', run: 'true' };
  r = write(m);
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /E_AMEND_HISTORY/);

  // 通過済みのマスより前に差し込む → だめ
  m = toyMap();
  m.nodes.A0 = { type: 'task', title: '前日の準備', check: { kind: 'cmd', run: 'true' } };
  m.characters[0].path.unshift('A0');
  r = write(m);
  assert.equal(r.code, 1, r.all);
  assert.match(r.all, /E_AMEND_HISTORY/);

  // キャラクターを消す → だめ
  m = toyMap();
  m.characters = m.characters.filter((c) => c.id !== 'b');
  m.nodes.G1 = undefined;
  r = write(JSON.parse(JSON.stringify(m)));
  assert.equal(r.code, 1, r.all);

  // 先のマスを足す・タイトルを直す・仲間を増やす → よい
  m = toyMap();
  m.nodes.A1.title = '剣をとぐ（改）';
  m.nodes.A5 = { type: 'task', title: '宝を持ち帰る', detail: '宝を持ち帰ること。', check: { kind: 'cmd', run: 'node checks/flag.mjs A5', seal: ['checks/flag.mjs'] } };
  m.characters[0].path.splice(m.characters[0].path.indexOf('FIN'), 0, 'A5');
  m.nodes.D1 = { type: 'task', title: '道案内をする', check: { kind: 'cmd', run: 'node checks/flag.mjs D1', seal: ['checks/flag.mjs'] } };
  m.characters.push({ id: 'd', name: '盗賊デイジー', kind: 'agent', agent: 'test', job: 'thief', color: 'green', path: ['D1', 'FIN'] });
  r = write(m);
  assert.equal(r.code, 0, r.all);
  const ev = readLog(dir).filter((e) => e.type === 'amended').pop();
  assert.equal(ev.data.version, 2);
  assert.equal(ev.data.map_file, 'maps/0002.json');
  assert.ok(existsSync(join(dir, '.masume', 'maps', '0002.json')));
  const v = view(dir);
  assert.equal(v.map_version, 2);
  assert.equal(v.nodes.A1.title, '剣をとぐ（改）');
  assert.equal(v.nodes.A1.state, 'cleared', '通過済みはそのまま');
  assert.ok(v.nodes.A5, '新しいマス');
  assert.equal(v.nodes.A5.sealed, true, '判定ファイルがそろっていれば自動で封印');
  assert.deepEqual(v.nodes.FIN.members, ['a', 'b', 'h', 'd'].filter((x) => v.characters.some((c) => c.id === x)));
  const d = char(v, 'd');
  assert.deepEqual([d.at, d.level, d.status], ['D1', 1, 'working'], '新しい仲間はふりだしから');
  assert.equal(char(v, 'a').at, 'A2', 'a の位置は変わらない');
  assert.equal(masume(['verify', '--dir', dir]).code, 0);

  // 改訂後も遊べる
  flag(dir, 'D1');
  assert.equal(check(dir, 'd').code, 0);
  assert.equal(char(view(dir), 'd').at, 'FIN');

  // 壊れた地図での改訂は E_INVALID_MAP
  const broken = toyMap();
  broken.quest.goal = 'NOPE';
  const rb = write(broken);
  assert.equal(rb.code, 1, rb.all);
  const j = masumeJson(['status', '--dir', dir]);
  assert.equal(j.data.map_version, 2, '失敗した改訂は記録されない');
});
