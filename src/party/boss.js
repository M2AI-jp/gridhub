// ボス戦（結合ゲートの判定）を子プロセスとして起こし、中断のときは判定の子孫まで残さず止める（CONTRACTS §26.4）。
// 判定コマンドのシェルは書記の判定係が独自のプロセスグループで起こす。そのため子の CLI だけを止めても、
// 判定そのものと孫が残る。起こす前後の子孫を ps で控えて、生き残りを SIGKILL する。
import { spawn, spawnSync } from 'node:child_process';

const INTERRUPT_GRACE_MS = 1500; // SIGINT を伝えてから、強制的に止めるまで
const CLOSE_WAIT_MS = 1000; // SIGKILL のあと、終わりを待つ長さ
const OUTPUT_CAP = 4 * 1024 * 1024;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** いま動いているプロセスの { pid → {ppid, pgid} }。ps が使えなければ空。 */
export function processTable() {
  const table = new Map();
  try {
    const r = spawnSync('ps', ['-A', '-o', 'pid=,ppid=,pgid='], { encoding: 'utf8', timeout: 5000, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0 || !r.stdout) return table;
    for (const line of r.stdout.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/u.exec(line);
      if (m) table.set(Number(m[1]), { ppid: Number(m[2]), pgid: Number(m[3]) });
    }
  } catch {
    // ps が無い・動かないときは、プロセスグループだけで止める
  }
  return table;
}

/** rootPid と、その子孫すべて（根が先）。[{pid, pgid}] */
export function treeOf(rootPid, table = processTable()) {
  const children = new Map();
  for (const [pid, { ppid }] of table) {
    if (!children.has(ppid)) children.set(ppid, []);
    children.get(ppid).push(pid);
  }
  const found = [];
  const queue = table.has(rootPid) ? [rootPid] : [];
  const seen = new Set(queue);
  while (queue.length) {
    const pid = queue.shift();
    found.push({ pid, pgid: table.get(pid).pgid });
    for (const child of children.get(pid) ?? []) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return found;
}

/**
 * 控えたプロセスのうち、まだ同じプロセスグループで生きているものを SIGKILL する（グループごと）。
 * 終わったあとに pid が使い回されていても、別のものを撃たないように、いまの表と突き合わせる。
 */
export function killTree(entries, table = processTable()) {
  const own = table.get(process.pid)?.pgid;
  const pids = [];
  const groups = [];
  for (const { pid, pgid } of entries) {
    const now = table.get(pid);
    if (!now || now.pgid !== pgid || pid <= 1 || pid === process.pid) continue;
    pids.push(pid);
    if (pgid > 1 && pgid !== own && !groups.includes(pgid)) groups.push(pgid);
  }
  for (const group of groups) {
    try {
      process.kill(-group, 'SIGKILL');
    } catch {
      // すでにいない
    }
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // すでにいない
    }
  }
}

function errorOf(stderr, exitCode) {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  const line = lines.find((l) => /^\[[A-Z][A-Z0-9_]*\]/u.test(l)) ?? lines.at(-1) ?? '';
  const m = /^\[([A-Z][A-Z0-9_]*)\]\s*(.*)$/u.exec(line);
  if (m) return { code: m[1], message: m[2] || m[1], exitCode };
  return { code: null, message: line || `ボス戦の結果を読めません（終了コード ${exitCode}）`, exitCode };
}

/**
 * ゲートのボス戦（`masume check <gate> --as party --json`）を子プロセスで起こす。
 * done は必ず解決する: { exitCode, result(解析できた JSON か null), error({code, message}|null), stopped }
 * stop({force}) … 中断。SIGINT → 猶予 → 判定の子孫まで SIGKILL。2回目（force）は即 SIGKILL。
 */
export function startBoss({ bin, root, env, gate }) {
  const childEnv = { ...env };
  // 入れ子の判定（node --test）が何も走らずに通ってしまわないように
  delete childEnv.NODE_TEST_CONTEXT;
  let stdout = '';
  let stderr = '';
  let spawnError = null;
  let stopped = false;
  let finished = false;
  let known = []; // 起こしたあとに見えた子孫（中断のとき、生き残りを撃つために控える）

  let resolveDone;
  const done = new Promise((resolve) => {
    resolveDone = resolve;
  });
  const finish = (exitCode) => {
    if (finished) return;
    finished = true;
    let result = null;
    try {
      result = JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1) ?? '');
    } catch {
      // 解析できなければ result は null
    }
    const error = spawnError
      ? { code: spawnError.code ?? 'ERROR', message: `ボス戦を起動できません: ${spawnError.message}`, exitCode }
      : result === null || ![0, 1].includes(exitCode) ? errorOf(stderr, exitCode) : null;
    resolveDone({ exitCode, result, error, stopped, stdout, stderr });
  };

  const child = spawn(process.execPath, [bin, 'check', '--as', 'party', '--dir', root, '--json', '--', gate], {
    cwd: root,
    env: childEnv,
    detached: true, // 端末の Ctrl-C は軍師にだけ届く。止めるのは軍師の仕事
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pid = child.pid;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    if (stdout.length < OUTPUT_CAP) stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    if (stderr.length < OUTPUT_CAP) stderr += chunk;
  });
  child.on('error', (error) => {
    if (pid === undefined) {
      spawnError = error;
      finish(127);
    }
  });
  child.on('exit', (status, signal) => {
    // 本体が終わったのにパイプが閉じないときも、少しだけ待って締める
    setTimeout(() => finish(status ?? (signal ? 130 : 1)), 1000).unref();
  });
  child.on('close', (status, signal) => finish(status ?? (signal ? 130 : 1)));

  let stopping = null;
  const remember = () => {
    if (pid !== undefined && !finished) {
      const now = treeOf(pid);
      const have = new Set(known.map((e) => e.pid));
      known = [...known, ...now.filter((e) => !have.has(e.pid))];
    }
  };

  function stop({ force = false } = {}) {
    if (finished) return done;
    stopped = true;
    if (pid === undefined) return done;
    if (stopping === null) {
      stopping = (async () => {
        remember(); // 子が先に死ぬと孫がつながりを失うので、先に控える
        if (!force) {
          try {
            process.kill(pid, 'SIGINT');
          } catch {
            // すでにいない
          }
          await Promise.race([done, sleep(INTERRUPT_GRACE_MS)]);
          remember();
        }
        // 根を先に撃ち、これ以上孫を起こされないようにする。生き残りはグループごと。
        killTree(known);
        if (!finished) {
          try {
            process.kill(-pid, 'SIGKILL'); // ps が使えなくても、子自身のグループは止める
          } catch {
            // すでにいない
          }
        }
        await Promise.race([done, sleep(CLOSE_WAIT_MS)]);
        finish(130);
      })().catch(() => finish(130));
    } else if (force) {
      remember();
      killTree(known);
    }
    return done;
  }

  return { done, stop, pid: pid ?? null };
}
