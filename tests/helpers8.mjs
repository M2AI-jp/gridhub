// 第16章の判定の共通道具（gridhub app を起こす・PATH を作る・POST する）。GM の縄張り・封印対象。キャラクターは編集しないこと。
import { spawn } from 'node:child_process';
import { chmodSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import { GRIDHUB, tmp } from './helpers7.mjs';

export * from './helpers7.mjs';

/**
 * PATH に置くフォルダ。node はいつも入れる（判定のコマンドが node を呼ぶ）。claude は claude: true のときだけ偽物を入れる。
 * この判定の場所では claude が node と同じフォルダにあることがあるので、node のフォルダそのものは PATH に入れない。
 */
export function pathWith({ claude = false } = {}) {
  const bin = tmp('gridhub-path-');
  symlinkSync(process.execPath, join(bin, 'node'));
  if (claude) {
    writeFileSync(join(bin, 'claude'), '#!/bin/sh\necho "偽の claude"\n');
    chmodSync(join(bin, 'claude'), 0o755);
  }
  return { bin, PATH: [bin, '/usr/bin', '/bin'].join(':'), claude: claude ? join(bin, 'claude') : null };
}

/** 判定の子に渡す環境変数（冒険の書の場所・npm の設定は持ち込まない） */
export function appEnv(extra = {}) {
  const env = { ...process.env, NO_COLOR: '1' };
  for (const k of Object.keys(env)) {
    if (k.startsWith('npm_') || k.startsWith('GRIDHUB_') || (k.startsWith('MASUME_') && k !== 'MASUME_CHROME')) delete env[k];
  }
  delete env.NODE_TEST_CONTEXT;
  return { ...env, ...extra };
}

/** gridhub <command> … を起こし、1行目の URL（pattern の1番目のかたまり）を待つ。stdin は管のまま（命綱の判定で閉じる） */
export function startGridhub(args, { env = {}, cwd, pattern = /^GridHub: (http:\/\/\S+)/m, timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [GRIDHUB, ...args], { cwd: cwd ?? tmp('gridhub-cwd-'), env: appEnv(env), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => reject(new Error(`起動しない:\n${out}`)), timeout);
    const look = () => {
      const m = out.match(pattern);
      if (!m) return;
      clearTimeout(timer);
      const url = m[1].replace(/\/$/, '');
      resolve({
        url,
        proc,
        output: () => out,
        exited: new Promise((done) => (proc.exitCode !== null ? done(proc.exitCode) : proc.once('exit', (code, signal) => done(code ?? signal)))),
        stop: () => new Promise((done) => {
          if (proc.exitCode !== null || proc.signalCode !== null) return done();
          proc.once('exit', () => done());
          proc.kill('SIGTERM');
          setTimeout(() => proc.kill('SIGKILL'), 3000).unref();
        }),
      });
    };
    proc.stdout.on('data', (d) => {
      out += d;
      look();
    });
    proc.stderr.on('data', (d) => (out += d));
    proc.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`終わってしまった（${code}）:\n${out}`));
    });
  });
}

/** gridhub app を、判定用の home・play・PATH で起こす */
export async function startApp({ claude = false, lifeline = false, inApp = false, home, play } = {}) {
  const path = pathWith({ claude });
  const dirs = { home: home ?? tmp('gridhub-home-'), play: play ?? tmp('gridhub-play-') };
  mkdirSync(dirs.play, { recursive: true });
  const app = await startGridhub(['app', '--port', '0', '--home', dirs.home, '--play', dirs.play, ...(lifeline ? ['--lifeline'] : [])], {
    env: { PATH: path.PATH, ...(inApp ? { GRIDHUB_APP: '1' } : {}) },
  });
  return { ...app, ...dirs, path };
}

/** X-Masume 付きの POST。{status, body} */
export async function postJson(url, body = {}, { masume = true } = {}) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(masume ? { 'x-masume': '1' } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }
  return { status: r.status, body: json, text };
}

/** そのポートにまだつながるか（サーバーが残っているか） */
export function listening(url) {
  const { port, hostname } = new URL(url);
  return new Promise((resolve) => {
    const socket = connect(Number(port), hostname);
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
    setTimeout(() => done(false), 2000).unref();
  });
}
