// GM（LLM）を起動するアダプタ。CONTRACTS §13 のアダプタ表と同じ形を、語り部の縄張りに小さく持つ。
import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { MasumeError } from '../engine/index.js';

const SIGKILL_AFTER_MS = 3000;

/** GM が孫プロセスを起こしていても止まるよう、プロセスグループごと止める */
function killTree(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

/** `claude` | `codex` | `cmd:<command>` を解釈する */
export function parseGm(spec) {
  const text = String(spec ?? '').trim();
  if (text === 'claude' || text === 'codex') return { kind: text };
  if (text.startsWith('cmd:') && text.slice(4).trim()) return { kind: 'cmd', command: text.slice(4).trim() };
  throw new MasumeError('E_USAGE', `--gm は claude / codex / cmd:<command> のどれかです（受け取った値: ${text || '空'}）`);
}

/** 起動するコマンド（実行ファイル・引数・人間向けの表示）を組み立てる */
export function gmCommand(gm, { root, model }) {
  let file;
  let args;
  if (gm.kind === 'claude') {
    file = 'claude';
    args = ['-p', '--model', model || 'sonnet', '--permission-mode', 'bypassPermissions'];
  } else if (gm.kind === 'codex') {
    file = 'codex';
    args = ['exec', '-C', root, '-s', 'workspace-write', '--skip-git-repo-check', ...(model ? ['-m', model] : []), '-'];
  } else {
    file = '/bin/sh';
    args = ['-c', gm.command];
  }
  return { file, args, display: [file, ...args].join(' ') };
}

const tail = (text, lines = 12) => text.replace(/\s+$/u, '').split(/\r?\n/u).slice(-lines).join('\n');

/**
 * GM を1回起動する。プロンプトは stdin、出力は logFile に追記する（流れてきた分からすぐ）。
 * 戻り値は { code, output, timedOut }。起動できなかったときは E_GM を投げる。
 */
export function runGm(command, { cwd, env, prompt, logFile, heading, timeoutSeconds }) {
  return new Promise((resolve, reject) => {
    appendFileSync(logFile, `\n===== ${heading} =====\n$ ${command.display}\n`);
    let output = '';
    let timedOut = false;
    let settled = false;
    const child = spawn(command.file, command.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
    const take = (chunk) => {
      const text = chunk.toString('utf8');
      output += text;
      appendFileSync(logFile, text);
    };
    child.stdout.on('data', take);
    child.stderr.on('data', take);

    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child, 'SIGTERM');
      setTimeout(() => killTree(child, 'SIGKILL'), SIGKILL_AFTER_MS).unref();
    }, timeoutSeconds * 1000);
    const stop = (signal) => () => {
      killTree(child, signal);
      appendFileSync(logFile, `\n(${signal} を受けて GM を止めました)\n`);
      process.exit(130);
    };
    const onInt = stop('SIGINT');
    const onTerm = stop('SIGTERM');
    process.once('SIGINT', onInt);
    process.once('SIGTERM', onTerm);
    const done = (fn) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener('SIGINT', onInt);
      process.removeListener('SIGTERM', onTerm);
      fn();
    };

    child.on('error', (error) => done(() => {
      const missing = error.code === 'ENOENT';
      const why = missing ? `${command.file} コマンドが見つかりません（インストールされていますか）` : error.message;
      appendFileSync(logFile, `\n(GM を起動できませんでした: ${why})\n`);
      reject(new MasumeError('E_GM', `GM を起動できませんでした: ${why}`));
    }));
    // GM が標準入力を読まずに終わっても落ちない
    child.stdin.on('error', () => {});
    child.on('close', (code, signal) => done(() => {
      const exit = timedOut ? 124 : code ?? (signal ? 128 : 1);
      appendFileSync(logFile, `\n(GM の終了コード: ${exit}${timedOut ? '・時間切れ' : ''})\n`);
      resolve({ code: exit, output, timedOut });
    }));
    child.stdin.end(prompt);
  });
}

export { tail };
