import {
  assert, check, draw, historyFile, json, run, success, textDraw,
} from './support.mjs';
import { FAKE_ADVICE, fixtureCli } from './fakes.mjs';

check('C2', ({ dir }) => {
  const fixture = fixtureCli(dir);
  for (const [seed, machine, reordered] of [
    ['42', true, false],
    ['神社の 朝', false, false],
    ["quote'\";$(echo NO)", true, true],
  ]) {
    fixture.reset();
    const expected = { fortune: '中吉', advice: FAKE_ADVICE, seed };
    const args = reordered ? ['--json', '--seed', seed] : ['--seed', seed, ...(machine ? ['--json'] : [])];
    const result = run('cli', args, { dir, root: fixture.root, env: fixture.env });
    if (machine) assert.deepEqual(draw(json(result, '機械向け抽選')), expected, '依存先のDrawをそのまま表示する');
    else assert.equal(success(result, '人間向け抽選'), textDraw(expected), '運勢と助言を契約の2行で表示する');
    const calls = fixture.calls();
    assert.deepEqual(calls.map(call => [call.module, call.args]), [
      ['fortune', ['--seed', seed]], ['history', ['append']],
    ], '抽選1回→保存1回の順で子プロセスを呼ぶ');
    assert.deepEqual(JSON.parse(calls[1].input), expected, '同じDrawをappendのstdinへ渡す');
    for (const call of calls) {
      assert.equal(call.cwd, dir, '利用者のcwdを子プロセスへ引き継ぐ');
      assert.equal(call.file, historyFile(dir), '指定された履歴パスを子プロセスへ引き継ぐ');
    }
  }
});
