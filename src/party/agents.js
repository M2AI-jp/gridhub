// エージェントのアダプタ（CONTRACTS §13）と、子プロセスの起動・タイムアウト・後始末。
import { spawn } from 'node:child_process';
import { constants } from 'node:os';
import { MasumeError } from '../engine/index.js';

// 出力は stdout+stderr で最大 200KB。冒頭と末尾を残し、中ほどを省く（最後の報告が読めるように）。
export const OUTPUT_LIMIT = 200 * 1024;
const RESERVED = 1024; // 「止めた理由」などの追記ぶん
const HEAD_LIMIT = 64 * 1024;
const TAIL_LIMIT = OUTPUT_LIMIT - RESERVED - HEAD_LIMIT - 256;

const TERM_GRACE_MS = 3000; // SIGTERM から SIGKILL までの猶予
const LINGER_MS = 1000; // 本体が終わってもパイプが閉じないとき（孫が握っている）の猶予

/** `--agent` の文字列を、起動コマンドに直す。 */
export function resolveAgent(agent, model, root) {
  if (agent === 'claude') {
    const name = model || 'sonnet';
    const args = ['-p', '--model', name, '--permission-mode', 'bypassPermissions'];
    return { name: 'claude', model: name, file: 'claude', args, display: ['claude', ...args].join(' ') };
  }
  if (agent === 'codex') {
    const args = ['exec', '-C', root, '-s', 'workspace-write', '--skip-git-repo-check', ...(model ? ['-m', model] : []), '-'];
    return { name: 'codex', model: model || null, file: 'codex', args, display: ['codex', ...args].join(' ') };
  }
  if (typeof agent === 'string' && agent.startsWith('cmd:') && agent.slice(4).trim()) {
    const command = agent.slice(4);
    return { name: 'cmd', model: null, file: '/bin/sh', args: ['-c', command], display: command };
  }
  throw new MasumeError('E_USAGE', `知らないエージェントです: ${agent}（claude / codex / cmd:<command> のどれか）`);
}

// UTF-8 の途中で切れた端を落とす
function trimEnd(buffer) {
  let i = buffer.length - 1;
  let back = 0;
  while (i >= 0 && back < 3 && (buffer[i] & 0xc0) === 0x80) {
    i--;
    back++;
  }
  if (i < 0) return buffer;
  const lead = buffer[i];
  const need = lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : lead >= 0xc0 ? 2 : 1;
  return need > back + 1 ? buffer.subarray(0, i) : buffer;
}

function trimStart(buffer) {
  let i = 0;
  while (i < buffer.length && i < 3 && (buffer[i] & 0xc0) === 0x80) i++;
  return buffer.subarray(i);
}

class Capture {
  constructor() {
    this.head = [];
    this.headSize = 0;
    this.tail = [];
    this.tailSize = 0;
    this.dropped = 0;
  }

  push(chunk) {
    let rest = chunk;
    if (this.headSize < HEAD_LIMIT) {
      const take = rest.subarray(0, HEAD_LIMIT - this.headSize);
      this.head.push(take);
      this.headSize += take.length;
      rest = rest.subarray(take.length);
    }
    if (rest.length === 0) return;
    this.tail.push(rest);
    this.tailSize += rest.length;
    while (this.tailSize > TAIL_LIMIT) {
      const over = this.tailSize - TAIL_LIMIT;
      const first = this.tail[0];
      if (first.length <= over) {
        this.tail.shift();
        this.tailSize -= first.length;
        this.dropped += first.length;
      } else {
        this.tail[0] = first.subarray(over);
        this.tailSize -= over;
        this.dropped += over;
      }
    }
  }

  toBuffer() {
    const head = Buffer.concat(this.head);
    const tail = Buffer.concat(this.tail);
    if (this.dropped === 0) return Buffer.concat([head, tail]);
    const marker = Buffer.from(`\n……（出力が長いため、中ほどの ${this.dropped} バイトを省きました）……\n`);
    return Buffer.concat([trimEnd(head), marker, trimStart(tail)]);
  }
}

/**
 * エージェントを起動する。プロンプトは stdin に流す。
 * 戻り値の done は、終了・タイムアウト・中断のどれでも必ず解決する { code, output(Buffer) }。
 *   code … エージェントの終了コード / 124 = タイムアウト / 130 = 中断 / 127 = 起動できない
 * stop(why) … 'timeout' | 'interrupt'。プロセスグループごと止める。force=true で即 SIGKILL。
 */
export function launch({ agent, root, env, prompt, timeoutMs }) {
  const capture = new Capture();
  let child = null;
  let stopReason = null;
  let launchError = null;
  let exitInfo = null;
  let settled = false;
  const timers = new Set();
  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  const killGroup = (signal) => {
    if (!child || !child.pid) return;
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

  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });

  const finish = () => {
    if (settled) return;
    settled = true;
    for (const t of timers) clearTimeout(t);
    timers.clear();
    let code;
    if (launchError) code = 127;
    else if (stopReason === 'timeout') code = 124;
    else if (stopReason === 'interrupt') code = 130;
    else if (exitInfo?.status !== null && exitInfo?.status !== undefined) code = exitInfo.status;
    else code = 128 + (constants.signals[exitInfo?.signal] ?? 0);
    const notes = [];
    if (launchError) {
      notes.push(`（エージェントを起動できませんでした: ${agent.file} — ${launchError.code ?? launchError.message}）`);
    }
    if (stopReason === 'timeout') notes.push(`（制限時間 ${Math.round(timeoutMs / 1000)} 秒を超えたので止めました）`);
    if (stopReason === 'interrupt') notes.push('（パーティが中断したので止めました）');
    // 止めたときは、SIGTERM を無視する孫を残さない（最後に必ず、グループごと SIGKILL）
    if (stopReason) killGroup('SIGKILL');
    const body = capture.toBuffer();
    const tailNote = notes.length ? Buffer.from(`${body.length && body[body.length - 1] !== 10 ? '\n' : ''}${notes.join('\n')}\n`) : Buffer.alloc(0);
    // パイプを握ったままの孫が残っていないように
    child?.stdout?.destroy();
    child?.stderr?.destroy();
    resolveDone({ code, output: Buffer.concat([body, tailNote]) });
  };

  try {
    child = spawn(agent.file, agent.args, {
      cwd: root,
      env,
      detached: true, // 自分のプロセスグループを持たせ、孫ごと止められるようにする
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    launchError = error;
    queueMicrotask(finish);
    return { done, stop() {}, pid: null };
  }

  child.on('error', (error) => {
    if (child.pid === undefined) {
      launchError = error;
      finish();
    }
  });
  child.stdout.on('data', (chunk) => capture.push(chunk));
  child.stderr.on('data', (chunk) => capture.push(chunk));
  child.stdin.on('error', () => {}); // 読まずに終わるエージェント（EPIPE）
  child.stdin.end(prompt);

  child.on('exit', (status, signal) => {
    exitInfo = { status, signal };
    // 止めている最中に本体が先に終わったら、SIGTERM を無視する孫がいても、ここで片付ける
    if (stopReason) killGroup('SIGKILL');
    // 本体が終わったのにパイプが閉じない = 背景に残った孫がいる。少し待って片付ける。
    later(() => {
      killGroup('SIGKILL');
      later(finish, 500);
    }, LINGER_MS);
  });
  child.on('close', (status, signal) => {
    exitInfo ??= { status, signal };
    finish();
  });

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    later(() => stop('timeout'), Math.min(timeoutMs, 2 ** 31 - 1));
  }

  function stop(why, { force = false } = {}) {
    if (settled) return;
    stopReason ??= why;
    // 本体がもう終わっているなら、猶予は要らない（残っているのは孫だけ）
    const now = force || exitInfo !== null;
    killGroup(now ? 'SIGKILL' : 'SIGTERM');
    later(() => {
      killGroup('SIGKILL');
      later(finish, 1000);
    }, now ? 0 : TERM_GRACE_MS);
  }

  return { done, stop, pid: child.pid ?? null };
}
