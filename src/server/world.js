// CLI と POST /api/world が共有する codecity の寿命（CONTRACTS §83.3）。
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MasumeError } from '../engine/errors.js';
import { appHome } from '../engine/home.js';
import { watchWorldOverlay, writeWorldOverlay } from '../engine/world.js';
import { t, wordsMode } from '../engine/words.js';

function readSettings(home) {
  try {
    const settings = JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'));
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('settings.json');
    return settings;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new MasumeError('E_WORLD', t('world.settings.failed', error.message));
  }
}

function codecityEntry(directory, status = 404) {
  if (typeof directory === 'string' && directory.trim()) {
    const file = resolve(directory, 'codecity.mjs');
    try { if (statSync(file).isFile()) return file; } catch { /* 下の同じエラーへ */ }
  }
  throw Object.assign(new MasumeError('E_NO_CODECITY', t('world.no_codecity')), { status });
}

/** ほかの設定を保ったまま、確かめた codecity のフォルダだけを覚える（§83.6）。 */
export function rememberCodecity(path, { env = process.env, home = appHome(env) } = {}) {
  codecityEntry(path, 400);
  const directory = resolve(path);
  const settings = { ...readSettings(home), codecity: directory };
  mkdirSync(home, { recursive: true });
  const file = join(home, 'settings.json');
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  return { ok: true, path: directory };
}

function localUrl(text) {
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' && /^(127\.\d+\.\d+\.\d+|localhost|\[::1\])$/iu.test(url.hostname)
      && !url.username && !url.password) return url.href;
  } catch { /* 壊れた URL */ }
  throw new MasumeError('E_WORLD', t('world.url.invalid'));
}

/** 同期にセッションを作る。ready を待っている途中でも stop() できる。 */
export function startWorld({ root, port = 0, codecity, env = process.env, home = appHome(env), words, onError = error => console.error(`[${error.code}] ${error.message}`) }) {
  const entry = codecityEntry(codecity || env.GRIDHUB_CODECITY || readSettings(home).codecity);
  const overlay = join(resolve(root), '.masume', 'world-overlay.json');
  writeWorldOverlay(root, overlay, { env, words });
  const child = spawn(process.execPath, [entry, resolve(root), '--overlay', overlay, '--port', String(port)], {
    cwd: root, env: { ...env, GRIDHUB_WORDS: wordsMode() }, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32',
  });
  let running = true, stopping = false, stopPromise, url = null, timer, stopWatching = () => {};
  let output = '', pending = '', resolveReady, rejectReady, resolveExit;
  const ready = new Promise((res, rej) => { resolveReady = res; rejectReady = rej; });
  // 同期に作った後、呼び出し側が ready を待つまでの拒否も処理済みにしておく。
  ready.catch(() => {});
  const exited = new Promise(res => { resolveExit = res; });
  const failure = reason => new MasumeError('E_WORLD', t('world.start.failed', [reason, ...output.trim().split(/\r?\n/u).slice(-8)].filter(Boolean).join('\n')));
  const remember = text => { output = (output + text).slice(-16_384); };
  const interruptNow = (signal = 'SIGTERM') => {
    if (!running || !child.pid) return;
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, signal); }
    catch { try { child.kill(signal); } catch { /* すでに終了 */ } }
  };
  const stop = () => {
    if (stopPromise) return stopPromise;
    stopping = true;
    clearTimeout(timer);
    stopWatching();
    rejectReady(failure(t('world.cancelled')));
    stopPromise = (async () => {
      if (!running) return;
      interruptNow();
      const force = setTimeout(() => interruptNow('SIGKILL'), 2000);
      try { await exited; } finally { clearTimeout(force); }
    })();
    return stopPromise;
  };
  const line = value => {
    if (url || stopping || !value.startsWith('街を開く: ')) return;
    try {
      url = localUrl(value.slice('街を開く: '.length).trim());
      clearTimeout(timer);
      resolveReady(url);
    } catch (error) {
      rejectReady(failure(error.message));
      void stop();
    }
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', text => {
    remember(text);
    pending += text;
    let end;
    while ((end = pending.indexOf('\n')) !== -1) {
      line(pending.slice(0, end).replace(/\r$/u, ''));
      pending = pending.slice(end + 1);
    }
    // 終わらない1行でメモリを使い続けない。
    if (pending.length > 16_384) pending = pending.slice(-16_384);
  });
  child.stderr.on('data', remember);
  child.once('error', error => { rejectReady(failure(error.message)); });
  child.once('close', (code, signal) => {
    running = false;
    clearTimeout(timer);
    stopWatching();
    // 改行なしで終わった出力は URL として採用しない。起動前に終了したことを報告する。
    rejectReady(failure(t('world.stopped')));
    resolveExit({ code, signal, error: stopping ? null : failure(t('world.stopped')) });
  });
  timer = setTimeout(() => {
    rejectReady(failure(t('world.start.timeout')));
    void stop();
  }, 30_000);
  stopWatching = watchWorldOverlay(root, overlay, { env, words, onError });
  return { ready, exited, stop, interruptNow, get running() { return running && !stopping; }, get url() { return url; } };
}
