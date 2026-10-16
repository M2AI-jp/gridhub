#!/usr/bin/env node
// マスメ CLI の受付係。各サブコマンドは src/commands/<name>.js が担当する（担当キャラクターの縄張り）。
// この受付係は GM の縄張り。サブコマンドを足すときは COMMANDS に1行足すだけにする。
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BIN = fileURLToPath(import.meta.url);
const ROOT = join(dirname(BIN), '..');

const COMMANDS = {
  new: ['書記', '地図から冒険の書をつくる', 'new <map.json> [--force]'],
  validate: ['書記', '地図を検査する', 'validate <map.json>'],
  seal: ['書記', '判定（E2E）のファイルを封印する', 'seal <nodeId...|--all>'],
  check: ['書記', '宣言判定する（E2Eを走らせて進む／戻る）', 'check <characterId|gateId> [--no-boss]'],
  stamp: ['書記', '人間のマスにハンコを押す', 'stamp <nodeId> --as <humanId>'],
  status: ['書記', '盤面の状態', 'status [--json]'],
  brief: ['書記', '指令書（いまやること・見えている範囲）', 'brief <characterId> [--json]'],
  log: ['書記', '冒険の書を読む', 'log [--tail N] [--json]'],
  verify: ['書記', 'セーブデータを検証する', 'verify [--jumon "..."] [--json]'],
  repair: ['書記', '呪われたセーブデータを修復する', 'repair'],
  jumon: ['書記', 'ふっかつのじゅもんを表示する', 'jumon [--json]'],
  note: ['書記', '日誌を書く（次の自分への申し送り）', 'note <characterId> <text>'],
  amend: ['書記', '地図を改訂する（歴史は書き換えられない）', 'amend <map.json>'],
  load: ['書記', '過去の状態をロードする', 'load <seq|ふっかつのじゅもん>'],
  serve: ['伝令', '盤面（5mm方眼ノート）を開く', 'serve [--port 5005]'],
  export: ['地図職人', 'Linear形式で書き出す', 'export linear [--format csv|json] [--out file]'],
  import: ['地図職人', 'Linear CSVから地図の下書きをつくる', 'import linear <file.csv> --out <map.json>'],
};

function usage() {
  const lines = [
    'マスメ — 5mm方眼すごろくで開発を進めるゲーム',
    '',
    'つかいかた: masume <command> [options]   共通: --dir <冒険の書のある場所> --as <あなたのID> --json',
    '',
  ];
  for (const [name, [who, what, how]] of Object.entries(COMMANDS)) {
    lines.push(`  ${how.padEnd(44)} ${what}（担当: ${who}）`);
  }
  lines.push('', 'ルールブック: docs/RULEBOOK.md');
  return lines.join('\n');
}

const [cmd, ...rest] = process.argv.slice(2);

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(usage());
  process.exit(0);
}
if (cmd === '--version' || cmd === '-v') {
  console.log('masume 0.1.0 (rules 1)');
  process.exit(0);
}
if (!Object.hasOwn(COMMANDS, cmd)) {
  console.error(`[E_USAGE] 「${cmd}」というコマンドはありません。\n\n${usage()}`);
  process.exit(2);
}

const file = join(ROOT, 'src', 'commands', `${cmd}.js`);
if (!existsSync(file)) {
  console.error(`[E_NOT_YET] 「${cmd}」はまだ誰も踏んでいないマスです（src/commands/${cmd}.js 担当: ${COMMANDS[cmd][0]}）`);
  process.exit(2);
}

const mod = await import(pathToFileURL(file).href);
try {
  const code = await mod.run(rest, { bin: BIN, root: ROOT, cwd: process.cwd(), env: process.env });
  process.exitCode = typeof code === 'number' ? code : 0;
} catch (err) {
  const code = err && err.code ? `[${err.code}] ` : '';
  console.error(`${code}${err && err.message ? err.message : err}`);
  process.exitCode = err && typeof err.exitCode === 'number' ? err.exitCode : 2;
}
