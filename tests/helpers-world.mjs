// X1 の外部境界。偽の codecity は実際に待ち受け、引数・PID・終了を一時フォルダに残す。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, GRIDHUB, waitUntil } from './helpers5.mjs';
export * from './helpers5.mjs';

export function fakeCodecity({ mode = 'normal', delay = 0 } = {}) {
  const dir = tmp('gridhub-codecity-');
  writeFileSync(join(dir, 'codecity.mjs'), `
import { createServer } from 'node:http';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = import.meta.dirname;
const args = process.argv.slice(2);
writeFileSync(join(dir, 'args.json'), JSON.stringify({ args, pid: process.pid }));
appendFileSync(join(dir, 'starts'), 'start\\n');
console.log('解析: モジュール 3、建物 3');
console.log('外部工務店: 0');
console.log('生き物: 0');
console.log('地面: 準備完了（案内ではない URL http://127.0.0.1:1/）');
const mode = ${JSON.stringify(mode)};
if (mode === 'early') { console.error('試験用の起動失敗'); process.exit(7); }
const server = createServer((request, response) => { response.end('<!doctype html><title>偽の町</title>町'); });
let pending;
function stop() {
  clearTimeout(pending);
  writeFileSync(join(dir, 'stopped'), 'stopped');
  server.close(() => process.exit(0));
  server.closeAllConnections();
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const port = Number(args[args.indexOf('--port') + 1]);
server.listen(mode === 'shift' ? 0 : port, '127.0.0.1', () => {
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  writeFileSync(join(dir, 'url'), url);
  if (mode === 'silent') return;
  pending = setTimeout(() => {
    process.stdout.write('街を開く: ');
    setTimeout(() => process.stdout.write(url + '\\n'), 10);
  }, ${delay});
});
`);
  return dir;
}

export function launchWorld(dir, extra = [], env = {}) {
  const proc = spawn(process.execPath, [GRIDHUB, 'world', '--dir', dir, ...extra], {
    cwd: dir, env: { ...process.env, MASUME_DIR: '', GRIDHUB_CODECITY: '', ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let out = '', err = '';
  proc.stdout.on('data', data => { out += data; });
  proc.stderr.on('data', data => { err += data; });
  const exited = new Promise(resolve => proc.once('close', (code, signal) => resolve({ code, signal })));
  return {
    proc, exited, output: () => out, error: () => err,
    async ready() {
      return waitUntil(() => {
        const match = out.match(/^世界: (http:\/\/[^\s]+)\r?$/mu);
        if (match) return match[1];
        if (proc.exitCode !== null) throw new Error(`world が終了: ${out}${err}`);
        return false;
      }, { timeout: 15_000, message: '世界の URL' });
    },
    async stop() {
      if (proc.exitCode !== null || proc.signalCode !== null) return;
      proc.kill('SIGTERM');
      const timer = setTimeout(() => proc.kill('SIGKILL'), 5000);
      try { await exited; } finally { clearTimeout(timer); }
    },
  };
}
