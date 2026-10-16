// 伝令が起こす長い仕事（語り部・パーティ・ボス戦）の子プロセス管理（CONTRACTS §15・§25）。
// 子は独自のプロセスグループで動かす。端末の Ctrl-C は伝令にだけ届き、伝令が SIGINT を1回だけ伝える
// （軍師は2回目の SIGINT でエージェントを即 SIGKILL するので、二重に届かないようにする）。
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { constants as osConstants } from 'node:os';
import { dirname } from 'node:path';

const TAIL_LINES = 200;
const TAIL_BYTES = 512 * 1024;
const REPEAT_STOP_MS = 3000; // 「止める」の連打で2回目の SIGINT（即 SIGKILL）が行かないようにする

/** ログの末尾 `lines` 行。ファイルが無ければ空文字。 */
export async function tailLines(file, lines = TAIL_LINES, maxBytes = TAIL_BYTES) {
  let handle;
  try {
    handle = await open(file, 'r');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return '';
    throw error;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - maxBytes);
    const buffer = Buffer.alloc(size - start);
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, start + filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    let text = buffer.subarray(0, filled).toString('utf8');
    // 途中から読んだときは、切れた先頭の行（UTF-8 の欠けを含む）を捨てる
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    const all = text.split('\n');
    if (all.at(-1) === '') all.pop();
    return all.slice(-lines).join('\n');
  } finally {
    await handle.close();
  }
}

function exitCodeOf(code, signal) {
  if (typeof code === 'number') return code;
  const number = signal ? osConstants.signals[signal] : undefined;
  return 128 + (number ?? 1);
}

/** 同時に1つだけ動かせる子プロセス（`node bin/masume.js …`）。 */
export class ChildJob {
  constructor() {
    this.child = null;
    this.running = false;
    this.code = null;
    this.stoppedAt = 0;
    this.exited = Promise.resolve();
  }

  /**
   * 子を起動する。logFile があれば出力を追記し、無ければ捨てる。起動できたら解決し、できなければ拒否する。
   * 呼び出し側の「動いていないか」の確認から spawn までに await を挟まないこと（二重起動を防ぐ）。
   */
  start(args, { cwd, logFile, heading }) {
    if (this.running) throw Object.assign(new Error('すでに動いています'), { code: 'E_BUSY' });

    let fd;
    if (logFile !== undefined) {
      mkdirSync(dirname(logFile), { recursive: true });
      fd = openSync(logFile, 'a');
    }
    let child;
    try {
      if (heading && fd !== undefined) writeSync(fd, heading);
      const env = { ...process.env };
      // 入れ子の判定（node --test）が何も走らずに通ってしまわないように
      delete env.NODE_TEST_CONTEXT;
      child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', fd ?? 'ignore', fd ?? 'ignore'], detached: true });
    } finally {
      if (fd !== undefined) closeSync(fd);
    }

    this.child = child;
    this.running = true;
    this.code = null;
    this.stoppedAt = 0;
    let finished = false;
    let release;
    this.exited = new Promise((resolve) => { release = resolve; });
    const finish = (code, note) => {
      if (finished) return;
      finished = true;
      if (note && logFile !== undefined) {
        try { appendFileSync(logFile, `\n${note}\n`); } catch { /* ログに書けなくても状態は進める */ }
      }
      if (this.child === child) {
        this.child = null;
        this.running = false;
        this.code = code;
      }
      release();
    };

    return new Promise((resolve, reject) => {
      let spawned = false;
      child.once('spawn', () => {
        spawned = true;
        resolve();
      });
      child.once('error', (error) => {
        if (spawned) return; // 起動後の error は終了を待つ（close で締める）
        finish(127, `(起動できませんでした: ${error.message})`);
        reject(error);
      });
      child.once('close', (code, signal) => finish(exitCodeOf(code, signal)));
    });
  }

  /** 「止める」。動いていれば SIGINT を伝えて true。連打は1回にまとめる。 */
  interrupt() {
    if (!this.running || this.child === null) return false;
    const now = Date.now();
    if (this.stoppedAt === 0 || now - this.stoppedAt >= REPEAT_STOP_MS) {
      this.stoppedAt = now;
      this.#kill('SIGINT');
    }
    return true;
  }

  /** 伝令の後始末: SIGINT → しばらく待って2回目の SIGINT（強制）→ さらに待って SIGKILL。 */
  async terminate({ graceMs = 2500 } = {}) {
    if (!this.running || this.child === null) return;
    const exited = this.exited;
    const wait = (ms) => new Promise((resolve) => {
      const timer = setTimeout(() => resolve('timeout'), ms);
      exited.then(() => { clearTimeout(timer); resolve('exited'); });
    });
    this.stoppedAt = Date.now();
    this.#kill('SIGINT');
    if (await wait(graceMs) === 'exited') return;
    this.#kill('SIGINT');
    if (await wait(graceMs) === 'exited') return;
    this.#kill('SIGKILL', { group: true });
    await wait(1000);
  }

  /** 同期の後始末（プロセスが終わる間際用）。待たずに SIGINT を送るだけ。 */
  interruptNow() {
    if (this.running && this.child !== null) this.#kill('SIGINT');
  }

  #kill(signal, { group = false } = {}) {
    const pid = this.child?.pid;
    if (pid === undefined) return;
    try {
      process.kill(group ? -pid : pid, signal);
    } catch {
      try { process.kill(pid, signal); } catch { /* すでに終わっている */ }
    }
  }
}
