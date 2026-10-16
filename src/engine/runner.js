import { spawn, spawnSync } from 'node:child_process';
import { constants } from 'node:os';
import { StringDecoder } from 'node:string_decoder';
import { MasumeError } from './errors.js';

const OUTPUT_LIMIT = 100 * 1024;
const activeChecks = new Set();

function killGroup(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

export function killActiveChecks() {
  for (const child of activeChecks) killGroup(child);
}

// 保存出力とは別に、各ストリームの全行を読む。通常の長い行は保持しない。
function blameReader(blamed) {
  const decoder = new StringDecoder('utf8');
  let line = '';
  let ignored = false;
  const prefix = 'MASUME_BLAME:';
  const flush = () => {
    if (!ignored && line.startsWith(prefix)) {
      for (const id of line.slice(prefix.length).split(/[,\s]+/u)) {
        if (id) blamed.add(id);
      }
    }
    line = '';
    ignored = false;
  };
  const read = (text) => {
    for (const char of text) {
      if (char === '\n' || char === '\r') {
        flush();
      } else if (!ignored) {
        if (line === '' && (char === ' ' || char === '\t')) continue;
        line += char;
        if (line.length <= prefix.length && !prefix.startsWith(line)) {
          line = '';
          ignored = true;
        }
      }
    }
  };
  return {
    write(bytes) { read(decoder.write(bytes)); },
    end() { read(decoder.end()); flush(); },
  };
}

function clipUtf8(text, limit) {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return bytes;
  let end = limit;
  while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
}

function runCommand(root, character, node, run, timeout) {
  return new Promise((resolve) => {
    const start = performance.now();
    const chunks = [];
    let size = 0;
    let truncated = false;
    let timedOut = false;
    let launchError = null;
    let shellCode;
    let pipeTimer;
    const blamed = new Set();
    const env = { ...process.env, MASUME_ROOT: root, MASUME_CHARACTER: character, MASUME_NODE: node };
    delete env.NODE_TEST_CONTEXT;
    const child = spawn('/bin/sh', ['-c', run], {
      cwd: root,
      env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    activeChecks.add(child);
    const capture = (bytes) => {
      const remaining = OUTPUT_LIMIT - size;
      const kept = bytes.subarray(0, remaining);
      if (kept.length) chunks.push(Buffer.from(kept));
      size += kept.length;
      if (bytes.length > remaining) truncated = true;
    };
    for (const stream of [child.stdout, child.stderr]) {
      const reader = blameReader(blamed);
      stream.on('data', (bytes) => { reader.write(bytes); capture(bytes); });
      stream.on('end', () => reader.end());
    }
    child.on('error', (error) => { launchError = error; });
    const timer = setTimeout(() => {
      timedOut = true;
      // シェルの子孫も止め、判定終了後に書き込みが続かないようにする。
      killGroup(child);
    }, timeout);
    child.on('exit', (status, signal) => {
      clearTimeout(timer);
      shellCode = status ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1);
      // exit はシェルの終了、close は子孫も共有するパイプの終了。
      pipeTimer = setTimeout(() => killGroup(child), 1000);
    });
    child.on('close', (status, signal) => {
      clearTimeout(timer);
      clearTimeout(pipeTimer);
      activeChecks.delete(child);
      const duration = Math.round(performance.now() - start);
      const code = timedOut ? 124 : launchError ? 127
        : shellCode ?? status ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1);
      const heading = clipUtf8(`=== ${node}: ${run} ===\n`, OUTPUT_LIMIT - 512);
      const detail = timedOut ? '\n判定が制限時間を超えました'
        : launchError ? `\n判定を起動できませんでした: ${launchError.code ?? '不明'}` : '';
      const ending = Buffer.from(`${detail}\n(exit ${code}, ${duration}ms)\n`);
      const body = Buffer.concat(chunks).toString('utf8');
      const available = OUTPUT_LIMIT - heading.length - ending.length;
      truncated ||= Buffer.byteLength(body) > available;
      const marker = truncated ? Buffer.from('\n（出力は100KBまでのため省略しました）') : Buffer.alloc(0);
      const output = Buffer.concat([
        heading, clipUtf8(body, available - marker.length), marker, ending,
      ]);
      resolve({ code, output, blamed: [...blamed] });
    });
  });
}

export async function runChecks(root, character, segment, map, { beforeRun } = {}) {
  const seconds = Number(process.env.MASUME_CHECK_TIMEOUT || 600);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds * 1000 > 2 ** 31 - 1) {
    throw new MasumeError('E_USAGE', 'MASUME_CHECK_TIMEOUT は有効な正の秒数で指定してください');
  }
  const start = performance.now();
  const ran = [];
  const outputs = [];
  const blamed = [];
  let failed = null;
  for (const node of segment) {
    await beforeRun?.(node);
    const result = await runCommand(root, character, node, map.nodes[node].check.run, seconds * 1000);
    ran.push(node);
    outputs.push(result.output);
    blamed.push(...result.blamed);
    if (result.code !== 0) {
      failed = node;
      break;
    }
  }
  return { ran, failed, blamed, output: Buffer.concat(outputs), duration_ms: Math.round(performance.now() - start) };
}

export function gitInfo(root) {
  const run = (args) => spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  const repository = run(['rev-parse', '--is-inside-work-tree']);
  if (repository.status !== 0 || repository.stdout.trim() !== 'true') return null;
  const head = run(['rev-parse', '--verify', 'HEAD']);
  const status = run(['status', '--porcelain', '--untracked-files=normal']);
  return {
    head: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status !== 0 || status.stdout.length > 0,
  };
}
