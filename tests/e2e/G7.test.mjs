// G7「結合: 願いから出撃まで、箱が開いたまま」— 語り部（quest --allow-listen → .masume/party.json）＋軍師（party が party.json の allow_listen で codex の箱を開ける）。
// CONTRACTS §30・§31 を、外から流れで確かめる。本物の codex は呼ばない（PATH の先頭に置いた偽の codex が、GM もエージェントも演じる）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, readdirSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { tmp, masume, masumeEnv, view, readLog, fakeGm } from '../helpers3.mjs';

const WISH = 'メモアプリのようなアプリを作りたい';
const NET = 'sandbox_workspace_write.network_access=true';
const codexArgv = (dir, { net = false } = {}) =>
  ['exec', '-C', dir, '-s', 'workspace-write', ...(net ? ['-c', NET] : []), '--skip-git-repo-check', '-'];

// ---- 偽の codex（このファイルの中だけ） ----
// cwd（ゲームのルート）の codex-argv/ に引数を残す。
//  GM として（MASUME_WISH がある）… gm-<n>.json に残し、プロンプトをそのまま偽の GM（第2章の fakeGm good）に渡す
//  エージェントとして          … <キャラ>-<マス>.json に残し、work/<マス>.txt を書いて宣言判定（--no-boss）する
const FAKE_BIN = tmp('masume-g7-bin-');
const FAKE_CODEX = join(FAKE_BIN, 'fake-codex.mjs');
writeFileSync(FAKE_CODEX, `import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
let prompt = '';
try { prompt = readFileSync(0); } catch {}
const env = process.env;
const argv = process.argv.slice(2);
mkdirSync('codex-argv', { recursive: true });
if (env.MASUME_WISH) {
  const n = readdirSync('codex-argv').filter((f) => f.startsWith('gm-')).length + 1;
  writeFileSync('codex-argv/gm-' + n + '.json', JSON.stringify(argv));
  const r = spawnSync('/bin/sh', ['-c', ${JSON.stringify(fakeGm('good').slice('cmd:'.length))}], { input: prompt, stdio: ['pipe', 'inherit', 'inherit'] });
  process.exit(r.status ?? 1);
}
writeFileSync('codex-argv/' + env.MASUME_CHARACTER + '-' + env.MASUME_NODE + '.json', JSON.stringify(argv));
console.log('偽の codex（エージェント）: ' + env.MASUME_CHARACTER + ' @ ' + env.MASUME_NODE + ' / ' + argv.join(' '));
mkdirSync('work', { recursive: true });
writeFileSync('work/' + env.MASUME_NODE + '.txt', 'done');
const r = spawnSync(process.execPath, [env.MASUME_BIN, 'check', env.MASUME_CHARACTER, '--as', env.MASUME_CHARACTER, '--no-boss', '--dir', env.MASUME_DIR], { encoding: 'utf8' });
console.log(r.stdout + r.stderr);
`);
writeFileSync(join(FAKE_BIN, 'codex'), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(FAKE_CODEX)} "$@"\n`);
chmodSync(join(FAKE_BIN, 'codex'), 0o755);
// ボス戦の中で走っても、マスメ自身の MASUME_* を受け継がない
const ENV = { PATH: `${FAKE_BIN}:${process.env.PATH}`, MASUME_ROOT: '', MASUME_CHARACTER: '', MASUME_NODE: '', MASUME_WISH: '', MASUME_AGENT_OVERRIDE: '', MASUME_GM_OVERRIDE: '' };

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const agentArgvs = (root) => {
  let files = [];
  try {
    files = readdirSync(join(root, 'codex-argv')).filter((f) => !f.startsWith('gm-')).sort();
  } catch {}
  return files.map((f) => ({ file: f, argv: readJson(join(root, 'codex-argv', f)) }));
};

test('願いから出撃まで: quest --allow-listen が GM の箱を開けて party.json に持ち越し、何も指定しない party がそれを読んで codex の箱を開けて進む', { timeout: 240000 }, async () => {
  const root = join(tmp('masume-g7-'), 'memo');

  // 1. 語り部: 願い → codex の GM（箱を開ける）→ 冒険が生まれ、party.json に allow_listen: true
  const q = await masumeEnv(['quest', WISH, '--dir', root, '--gm', 'codex', '--allow-listen'], { cwd: tmp('masume-cwd-'), env: ENV });
  const gmArgv = readJson(join(root, 'codex-argv', 'gm-1.json'));
  const partyJson = readJson(join(root, '.masume', 'party.json'));
  const tellerOk = q.code === 0 && isDeepStrictEqual(gmArgv, codexArgv(root, { net: true }))
    && partyJson?.agent === 'codex' && partyJson?.allow_listen === true;
  if (!tellerOk) console.log('MASUME_BLAME: teller');
  assert.equal(q.code, 0, q.all);
  assert.deepEqual(gmArgv, codexArgv(root, { net: true }), 'GM の箱が開いた');
  assert.equal(partyJson?.agent, 'codex', JSON.stringify(partyJson));
  assert.equal(partyJson?.allow_listen, true, `出撃の箱も開けたまま始まる: ${JSON.stringify(partyJson)}`);

  // 2. 軍師: 何も指定せずに出撃（party.json の agent と allow_listen が既定）→ ボス戦 G1 → ハンコ待ちで止まる
  //    G1 の判定の材料（work/G1.txt）は、偽の GM の地図では誰の task にもないので、ここで置く
  mkdirSync(join(root, 'work'), { recursive: true });
  writeFileSync(join(root, 'work', 'G1.txt'), 'done');
  const p = await masumeEnv(['party', '--dir', root], { cwd: root, env: ENV });
  const agents = agentArgvs(root);
  const v = view(root);
  const partyOk = p.code === 2 && agents.length === 3
    && agents.every((a) => isDeepStrictEqual(a.argv, codexArgv(root, { net: true })))
    && v.nodes.G1.state === 'cleared';
  if (!partyOk) console.log('MASUME_BLAME: party');
  assert.equal(p.code, 2, `ハンコ待ちで止まる\n${p.all}`);
  assert.match(p.all, /ハンコ待ち: H1/, p.all);
  assert.deepEqual(agents.map((a) => a.file), ['store-T1.json', 'store-T2.json', 'ui-U1.json'], p.all);
  for (const a of agents) assert.deepEqual(a.argv, codexArgv(root, { net: true }), `${a.file}: エージェントの箱も開いた`);
  assert.equal(v.nodes.G1.state, 'cleared', 'パーティ自身がボス戦をした');

  const log = readLog(root);
  const sorties = log.filter((e) => e.type === 'sortie');
  assert.equal(sorties.length, 3);
  for (const s of sorties) {
    assert.equal(s.data.agent, 'codex');
    const ret = log.find((e) => e.type === 'returned' && e.data.sortie === s.seq);
    assert.ok(ret?.data.advanced, `seq ${s.seq} の出撃は進んで帰った`);
  }
  assert.equal(masume(['verify', '--dir', root]).code, 0);
});
