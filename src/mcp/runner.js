// CLI（bin/masume.js）を子プロセスとして呼ぶ。MCP の道具の中身は CLI と同じ（CONTRACTS §19）。
import { spawn } from 'node:child_process';

const MAX_OUTPUT = 200_000; // 文字数。超えたら先頭を捨てる（判定の失敗理由は末尾にある）
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const KILL_GRACE_MS = 2000;

/** 起動中の子プロセス。後始末（サーバー終了・キャンセル・時間切れ）でまとめて止める。 */
const live = new Set();

export function killAll(signal = 'SIGTERM') {
  for (const run of live) run.kill(signal);
}

function timeoutMs(env) {
  const value = Number(env.MASUME_MCP_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

/**
 * `node <bin> <args…>` を走らせて { code, stdout, stderr, output, stopped } を返す。
 * 起動できなければ code=127。呼び出し側は kill() で途中で止められる。
 */
export function runCli({ bin, args, cwd, env }) {
  const childEnv = { ...env };
  // 入れ子の判定（node --test）が何も走らずに通ってしまわないように
  delete childEnv.NODE_TEST_CONTEXT;

  let stdout = '';
  let stderr = '';
  let combined = '';
  let truncated = false;
  const keep = (text, chunk) => {
    const next = text + chunk;
    if (next.length <= MAX_OUTPUT * 2) return next;
    truncated = true;
    return next.slice(-MAX_OUTPUT);
  };

  let child;
  let stopped = null;
  let timer = null;
  let killTimer = null;

  const handle = {
    kill(signal = 'SIGTERM') {
      if (!child || child.exitCode !== null || child.signalCode !== null) return;
      stopped ??= signal;
      signalGroup(child, signal);
      if (signal !== 'SIGKILL' && !killTimer) {
        killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE_MS);
        killTimer.unref?.();
      }
    },
    result: null,
  };

  handle.result = new Promise((resolve) => {
    const finish = (code, extra = '') => {
      clearTimeout(timer);
      clearTimeout(killTimer);
      live.delete(handle);
      if (combined.length > MAX_OUTPUT) {
        combined = combined.slice(-MAX_OUTPUT);
        truncated = true;
      }
      resolve({
        code,
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: stderr.slice(-MAX_OUTPUT),
        output: (truncated ? '（出力が長いので先頭を省略しました）\n' : '') + combined + extra,
        stopped,
      });
    };
    try {
      // 独自のプロセスグループで動かし、止めるときは孫（GM の LLM など）ごと止める
      child = spawn(process.execPath, [bin, ...args], { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
    } catch (error) {
      finish(127, `起動できませんでした: ${error.message}`);
      return;
    }
    live.add(handle);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout = keep(stdout, d); combined = keep(combined, d); });
    child.stderr.on('data', (d) => { stderr = keep(stderr, d); combined = keep(combined, d); });
    child.once('error', (error) => finish(127, `起動できませんでした: ${error.message}`));
    child.once('close', (code, signal) => {
      const note = stopped === 'timeout' ? '\n（時間切れで止めました）' : '';
      finish(typeof code === 'number' ? code : signal ? 128 : 1, note);
    });
    timer = setTimeout(() => {
      stopped = 'timeout';
      signalGroup(child, 'SIGTERM');
      killTimer = setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE_MS);
      killTimer.unref?.();
    }, timeoutMs(env));
    timer.unref?.();
  });
  return handle;
}

function signalGroup(child, signal) {
  const pid = child?.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, signal);
  } catch {
    try { process.kill(pid, signal); } catch { /* すでに終わっている */ }
  }
}
