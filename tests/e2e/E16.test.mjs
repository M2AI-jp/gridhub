// E16「最大レベルの表示」— CONTRACTS §60（第13章）。最大は Lv9（RULEBOOK §4）。Lv9 でも経験値は貯まるが、
// 「Lv9 経験値 16/10」と出ると壊れて見えるので、最大のときは「Lv9（最大）」と出し、経験値の分数を出さない。
// このリポジトリ自身の冒険の書（第12章のあがりで、Lv9 の仲間がいる）で確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOT, masume, masumeJson, view } from '../helpers6.mjs';

test('§60.1 ビューと指令書の character に max_level（level が 9 なら true）', () => {
  const v = view(ROOT);
  assert.ok(v.characters.some((c) => c.level === 9), 'Lv9 の仲間がいる');
  assert.ok(v.characters.some((c) => c.level < 9), 'Lv9 でない仲間もいる');
  for (const c of v.characters) {
    assert.equal(c.max_level, c.level === 9, `${c.id} の max_level`);
    const b = masumeJson(['brief', c.id, '--dir', ROOT]);
    assert.equal(b.code, 0, b.all);
    assert.equal(b.data.character.max_level, c.level === 9, `brief ${c.id} の max_level`);
  }
});

test('§60.2 status と brief: 最大なら「Lv9（最大）」で、経験値の分数を出さない。そうでなければ今までどおり', () => {
  const v = view(ROOT);
  const status = masume(['status', '--dir', ROOT]);
  assert.equal(status.code, 0, status.all);
  for (const c of v.characters) {
    const line = status.out.split('\n').find((l) => l.startsWith(`${c.name}: `));
    assert.ok(line, `${c.name} の行`);
    const brief = masume(['brief', c.id, '--dir', ROOT]).out.split('\n').find((l) => /^Lv\d/.test(l));
    assert.ok(brief, `${c.id} の指令書の Lv の行`);
    if (c.level === 9) {
      assert.ok(line.includes('Lv9（最大）'), `status: ${line}`);
      assert.doesNotMatch(line, /経験値/, `status に経験値の分数を出さない: ${line}`);
      assert.match(brief, /^Lv9（最大）/, `brief: ${brief}`);
      assert.doesNotMatch(brief, /経験値/);
    } else {
      assert.ok(line.includes(`Lv${c.level} 経験値 ${c.xp}/${c.xp_next}`), `status: ${line}`);
      assert.match(brief, new RegExp(`^Lv${c.level} / 経験値 ${c.xp}/${c.xp_next}`), `brief: ${brief}`);
    }
  }
  for (const m of status.out.matchAll(/経験値 (\d+)\/(\d+)/g)) assert.ok(Number(m[1]) < Number(m[2]), `経験値が上限を超えて見えない: ${m[0]}`);
});
