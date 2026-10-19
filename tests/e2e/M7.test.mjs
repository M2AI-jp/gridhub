// M7「チュートリアルは書いてあるとおりに動く」— CONTRACTS §35（第8章）。
// quests/tutorial/README.md の sh のブロックを上から順につないで、本物のシェル（bash、あれば zsh）でそのまま走らせる。
// 冒険があがり、最後のブロックのあとに盤面のサーバーが残っていないこと。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, openSync, closeSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import { join } from 'node:path';
import { ROOT, tmp, masume } from '../helpers3.mjs';

const README = join(ROOT, 'quests', 'tutorial', 'README.md');

/** 「## 途中で止まったとき」より前の ```sh ブロック */
function blocks() {
  const text = readFileSync(README, 'utf8');
  const body = text.split(/^## 途中で止まったとき/m)[0];
  return [...body.matchAll(/```sh\n([\s\S]*?)```/g)].map((m) => m[1]);
}

const has = (shell) => spawnSync('sh', ['-c', `command -v ${shell}`]).status === 0;

/** 盤面のポートに、まだつながるか（サーバーが残っているか）。ps はエージェントの箱で禁止されることがあるので使わない */
function listening(port) {
  return new Promise((res) => {
    const s = connect(port, '127.0.0.1');
    const done = (v) => {
      s.destroy();
      res(v);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    setTimeout(() => done(false), 2000);
  });
}

/** 残ってしまったサーバーの後片づけ（できる環境でだけ。できなくても判定には関係しない） */
function cleanup(play) {
  try {
    spawnSync('pkill', ['-f', `serve --port 0 --dir ${play}`]);
  } catch {}
}

for (const shell of ['bash', 'zsh']) {
  test(`§35 ${shell}: チュートリアルのブロックを上から貼ると最後まで遊べ、最後に盤面のサーバーが止まる`, { timeout: 180000, skip: has(shell) ? false : `${shell} が無い` }, async () => {
    const base = tmp('masume-tutorial-doc-');
    const list = blocks();
    assert.ok(list.length >= 6, `sh のブロックが並んでいる（${list.length}）`);
    // ブロックはそのまま。最後に、遊んだ場所だけを書き出す（サーバーが残っても止まらないよう、出力はファイルへ）
    const script = join(base, 'tutorial.sh');
    writeFileSync(script, `${list.join('\n')}\necho "PLAY=$TUTORIAL_PLAY"\n`);
    const outFile = join(base, 'out.log');
    const fd = openSync(outFile, 'w');
    const env = { ...process.env, TMPDIR: base };
    delete env.NODE_TEST_CONTEXT;
    for (const k of Object.keys(env)) if (k.startsWith('MASUME_')) delete env[k];
    let play = null;
    try {
      const r = spawnSync(shell, [script], { cwd: ROOT, env, stdio: ['ignore', fd, fd], timeout: 150000 });
      closeSync(fd);
      const out = readFileSync(outFile, 'utf8');
      play = (out.match(/^PLAY=(.+)$/m) || [])[1];
      assert.equal(r.error, undefined, `シェルが時間内に終わる\n${out.slice(-3000)}`);
      assert.ok(play, `遊んだ場所が分かる\n${out.slice(-3000)}`);
      const port = Number((out.match(/盤面: http:\/\/127\.0\.0\.1:(\d+)\//) || [])[1]);
      assert.ok(port > 0, `盤面の URL が出る\n${out.slice(-3000)}`);
      const st = masume(['status', '--dir', play, '--json']);
      assert.equal(st.code, 0, st.all);
      const v = JSON.parse(st.out);
      assert.equal(v.finished, true, `冒険があがる\n${out.slice(-3000)}`);
      assert.ok(v.characters.every((c) => c.status === 'done'), '全員あがり');
      assert.equal(masume(['verify', '--dir', play]).code, 0, '冒険の書は正常');
      // 最後のブロック（kill / wait）のあと、盤面のサーバーが残っていない（ポートにつながらない）
      await new Promise((res) => setTimeout(res, 1500));
      assert.equal(await listening(port), false, `${shell}: 最後のブロックのあとも盤面のサーバーが残っている（127.0.0.1:${port} につながる）`);
    } finally {
      if (play) cleanup(play);
    }
  });
}
