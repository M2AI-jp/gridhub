// GM（LLM）を起動するアダプタ。CONTRACTS §13 のアダプタ表と同じ形を、語り部の縄張りに小さく持つ。
// 後始末の作法は §27: 背景に残る GM を片づける・シグナルで孫まで止める・出力は UTF-8 のまま 2MB まで。
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { constants } from 'node:os';
import { MasumeError } from '../engine/index.js';

const TERM_GRACE_MS = 2000; // SIGTERM から SIGKILL までの猶予（§27.3、時間切れのときも同じ）
const LINGER_MS = 1000; // シェルが終わってから、パイプが閉じるのを待つ時間（§27.2）
const AFTER_KILL_MS = 500; // SIGKILL のあとも閉じないパイプ（別のセッションに逃げた孫）を待つ時間
const POLL_MS = 50;

export const OUTPUT_LIMIT = 2 * 1024 * 1024; // quest.log と手元に残す出力の上限（§27.4）
const HEAD_LIMIT = OUTPUT_LIMIT / 2;
const TAIL_LIMIT = OUTPUT_LIMIT / 2 - 256; // 残りは「省きました」の一言のぶん

export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const MIN_TIMEOUT_SECONDS = 1;
export const MAX_TIMEOUT_SECONDS = 86400;

const SIGNALS = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/**
 * MASUME_GM_TIMEOUT（秒）を 1〜86400 に丸める（§27.5）。
 * 未設定・数でない・0 以下は既定（1800 秒）。巨大な値や Infinity で即時間切れにならないようにする。
 */
export function gmTimeoutSeconds(value) {
  const text = String(value ?? '').trim();
  if (text === '') return DEFAULT_TIMEOUT_SECONDS;
  const seconds = Number(text);
  if (Number.isNaN(seconds) || seconds <= 0) return DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.max(seconds, MIN_TIMEOUT_SECONDS), MAX_TIMEOUT_SECONDS);
}

/** `claude` | `codex` | `cmd:<command>` を解釈する */
export function parseGm(spec) {
  const text = String(spec ?? '').trim();
  if (text === 'claude' || text === 'codex') return { kind: text };
  if (text.startsWith('cmd:') && text.slice(4).trim()) return { kind: 'cmd', command: text.slice(4).trim() };
  throw new MasumeError('E_USAGE', `--gm は claude / codex / cmd:<command> のどれかです（受け取った値: ${text || '空'}）`);
}

/** codex の箱（workspace-write）のソケットを開ける引数（§31.1・§32）。-c とその値は別々の引数 */
const LISTEN_ARGS = ['-c', 'sandbox_workspace_write.network_access=true'];

/**
 * 起動するコマンド（実行ファイル・引数・人間向けの表示）を組み立てる。
 * allowListen が true で codex のときだけ、`-s workspace-write` のすぐ後ろに箱のソケットを開ける引数を足す（§31.1）。
 */
export function gmCommand(gm, { root, model, allowListen = false }) {
  let file;
  let args;
  if (gm.kind === 'claude') {
    file = 'claude';
    args = ['-p', '--model', model || 'sonnet', '--permission-mode', 'bypassPermissions'];
  } else if (gm.kind === 'codex') {
    file = 'codex';
    args = [
      'exec', '-C', root, '-s', 'workspace-write',
      ...(allowListen === true ? LISTEN_ARGS : []),
      '--skip-git-repo-check', ...(model ? ['-m', model] : []), '-',
    ];
  } else {
    file = '/bin/sh';
    args = ['-c', gm.command];
  }
  return { file, args, display: [file, ...args].join(' ') };
}

/** 画面に出す GM の出力の末尾。行数と文字数の両方で切る（1行がとても長くても溢れない） */
export function tail(text, lines = 12, chars = 4000) {
  const picked = text.replace(/\s+$/u, '').split(/\r?\n/u).slice(-lines).join('\n');
  if (picked.length <= chars) return picked;
  const cut = picked.slice(-chars);
  const code = cut.charCodeAt(0);
  return `…${code >= 0xdc00 && code <= 0xdfff ? cut.slice(1) : cut}`; // 絵文字などの対の途中で切らない
}

// ---- 出力の取り込み（UTF-8 のまま・上限つき） ----

const isContinuation = (byte) => (byte & 0xc0) === 0x80;

/** 先頭から limit バイトまで（文字の途中では切らない） */
function clipHead(text, limit) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return text;
  let end = limit;
  while (end > 0 && isContinuation(bytes[end])) end--;
  return bytes.subarray(0, end).toString('utf8');
}

/** 末尾の limit バイトだけ（文字の途中では切らない） */
function clipTail(text, limit) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return text;
  let start = bytes.length - limit;
  while (start < bytes.length && isContinuation(bytes[start])) start++;
  return bytes.subarray(start).toString('utf8');
}

/**
 * GM の出力を、先頭 1MB（流れてきた分からすぐ write する）と末尾 1MB だけ残す。
 * 中ほどが溢れたら finish() で「省きました」を挟む。write はログファイルへの追記。
 */
class Capture {
  constructor(write) {
    this.write = write;
    this.head = '';
    this.headBytes = 0;
    this.tail = []; // { text, bytes }
    this.tailBytes = 0;
    this.dropped = 0;
    this.closed = false;
  }

  push(text) {
    if (this.closed || !text) return;
    let rest = text;
    if (this.headBytes < HEAD_LIMIT) {
      const piece = clipHead(rest, HEAD_LIMIT - this.headBytes);
      if (piece) {
        this.head += piece;
        this.headBytes += Buffer.byteLength(piece);
        this.write(piece);
        rest = rest.slice(piece.length);
      }
      if (!rest) return;
    }
    const bytes = Buffer.byteLength(rest);
    this.tail.push({ text: rest, bytes });
    this.tailBytes += bytes;
    while (this.tailBytes > TAIL_LIMIT) {
      const first = this.tail[0];
      const over = this.tailBytes - TAIL_LIMIT;
      if (first.bytes <= over) {
        this.tail.shift();
        this.tailBytes -= first.bytes;
        this.dropped += first.bytes;
        continue;
      }
      const clipped = clipTail(first.text, first.bytes - over);
      const kept = Buffer.byteLength(clipped);
      this.dropped += first.bytes - kept;
      this.tailBytes -= first.bytes - kept;
      first.text = clipped;
      first.bytes = kept;
      break;
    }
  }

  /** 末尾をログに書き、手元に残す出力全体（最大 2MB）を返す。2回呼んでもよい */
  finish() {
    if (this.closed) return this.text;
    this.closed = true;
    const tailText = this.tail.map((piece) => piece.text).join('');
    const marker = this.dropped > 0 ? `\n……（出力が長いため、中ほどの ${this.dropped} バイトを省きました）……\n` : '';
    if (marker || tailText) this.write(marker + tailText);
    this.text = this.head + marker + tailText;
    return this.text;
  }
}

/**
 * GM を1回起動する。プロンプトは stdin、出力は logFile に追記する（流れてきた分からすぐ）。
 * 戻り値は { code, output, timedOut }。起動できなかったときは E_GM を投げる。
 *
 *  - GM のプロセスは自分のプロセスグループに入れ、止めるときは孫ごと止める。
 *  - GM のシェルが終わっても1秒パイプが閉じなければ、背景に残ったものをグループごと SIGKILL して、
 *    シェルの終了コードどおりに扱う（§27.2）。
 *  - SIGINT・SIGTERM・SIGHUP を受けたら、グループに SIGTERM、2秒たっても残っていれば SIGKILL して、
 *    128+シグナル番号で終わる（§27.3）。
 *  - 出力は UTF-8 として読み、残すのは最大 2MB（§27.4）。
 */
export function runGm(command, { cwd, env, prompt, logFile, heading, timeoutSeconds }) {
  return new Promise((resolve, reject) => {
    const log = (text) => {
      try {
        appendFileSync(logFile, text);
      } catch {
        // ログを書けなくても GM の仕事は続ける
      }
    };
    log(`\n===== ${heading} =====\n$ ${command.display}\n`);
    const capture = new Capture(log);

    let child;
    try {
      child = spawn(command.file, command.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      log(`\n(GM を起動できませんでした: ${error.message})\n`);
      reject(new MasumeError('E_GM', `GM を起動できませんでした: ${error.message}`));
      return;
    }

    let settled = false;
    let timedOut = false;
    let interrupted = null;
    let exitInfo = null;
    const timers = new Set();
    const later = (fn, ms) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        fn();
      }, ms);
      timers.add(timer);
      return timer;
    };
    const cancel = (timer) => {
      clearTimeout(timer);
      timers.delete(timer);
    };

    const killGroup = (signal) => {
      if (!child.pid) return;
      try {
        process.kill(-child.pid, signal);
      } catch {
        try {
          child.kill(signal);
        } catch {
          // すでにいない
        }
      }
    };
    const groupAlive = () => {
      if (!child.pid) return false;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        return error.code === 'EPERM';
      }
    };

    // ---- シグナル（§27.3） ----
    const handlers = SIGNALS.map((signal) => [signal, () => onSignal(signal)]);
    for (const [signal, handler] of handlers) process.on(signal, handler);
    const dropHandlers = () => {
      for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    };
    let poll = null;
    const leave = (signal) => {
      if (poll) clearInterval(poll);
      if (groupAlive()) killGroup('SIGKILL');
      capture.finish();
      log(`\n(${signal} を受けて GM を止めました)\n`);
      process.exit(128 + (constants.signals[signal] ?? 0));
    };
    function onSignal(signal) {
      if (interrupted) {
        // 2回目: もう待たない
        leave(interrupted);
        return;
      }
      interrupted = signal;
      for (const timer of [...timers]) cancel(timer);
      killGroup('SIGTERM');
      const asked = Date.now();
      poll = setInterval(() => {
        if (!groupAlive() || Date.now() - asked >= TERM_GRACE_MS) leave(signal);
      }, POLL_MS);
    }

    const finish = () => {
      if (settled || interrupted) return;
      settled = true;
      for (const timer of [...timers]) cancel(timer);
      dropHandlers();
      // パイプを握ったままの孫がいても、ここで読むのをやめる
      child.stdout.destroy();
      child.stderr.destroy();
      const output = capture.finish();
      const code = timedOut ? 124 : exitInfo?.code ?? (exitInfo?.signal ? 128 + (constants.signals[exitInfo.signal] ?? 0) : 1);
      log(`\n(GM の終了コード: ${code}${timedOut ? '・時間切れ' : ''})\n`);
      resolve({ code, output, timedOut });
    };

    // ---- 出力（UTF-8 の途中で切れても壊さない） ----
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (text) => capture.push(text));
    child.stderr.on('data', (text) => capture.push(text));

    child.on('error', (error) => {
      if (child.pid !== undefined || settled) return; // 起動後の失敗は close / exit に任せる
      settled = true;
      for (const timer of [...timers]) cancel(timer);
      dropHandlers();
      const missing = error.code === 'ENOENT';
      const why = missing ? `${command.file} コマンドが見つかりません（インストールされていますか）` : error.message;
      capture.finish();
      log(`\n(GM を起動できませんでした: ${why})\n`);
      reject(new MasumeError('E_GM', `GM を起動できませんでした: ${why}`));
    });
    // GM が標準入力を読まずに終わっても落ちない
    child.stdin.on('error', () => {});

    // GM のシェルが終わった。パイプがまだ閉じなければ、背景に残ったものを片づけて終了コードどおりに扱う
    child.on('exit', (code, signal) => {
      exitInfo = { code, signal };
      for (const timer of [...timers]) cancel(timer);
      later(() => {
        killGroup('SIGKILL');
        later(finish, AFTER_KILL_MS);
      }, LINGER_MS);
    });
    child.on('close', (code, signal) => {
      exitInfo ??= { code, signal };
      finish();
    });

    // 時間切れ: グループに SIGTERM、猶予のあと SIGKILL
    later(() => {
      timedOut = true;
      killGroup('SIGTERM');
      later(() => {
        killGroup('SIGKILL');
        later(finish, AFTER_KILL_MS);
      }, TERM_GRACE_MS);
    }, timeoutSeconds * 1000);

    child.stdin.end(prompt);
  });
}
