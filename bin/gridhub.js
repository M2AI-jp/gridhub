#!/usr/bin/env node
// GridHub CLI の受付係。各サブコマンドは src/commands/<name>.js が担当する（担当キャラクターの縄張り）。
// この受付係は GM の縄張り。サブコマンドを足すときは COMMANDS に1行足すだけにする。
// bin/masume.js は旧名の別名（第11章）。どちらから起動しても、ctx.bin は実際に起動したファイル。
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const COMMANDS = {
  new: ['書記', '地図から冒険の書をつくる', 'new <map.json> [--force]'],
  validate: ['書記', '地図を検査する', 'validate <map.json>'],
  seal: ['書記', '判定（E2E）のファイルを封印する', 'seal <nodeId...|--all>'],
  step: ['書記', '歩く: 今のダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する（罰なし）', 'step <characterId>'],
  check: ['書記', '宣言判定する（町からの判定をまとめて走らせて進む／戻る）', 'check <characterId|gateId> [--no-boss]'],
  stamp: ['書記', '人間のマスにハンコを押す', 'stamp <nodeId> --as <humanId>'],
  status: ['書記', '盤面の状態', 'status [--json]'],
  brief: ['書記', '指令書（いまやること・見えている範囲）', 'brief <characterId> [--json]'],
  log: ['書記', '冒険の書を読む', 'log [--tail N] [--json]'],
  verify: ['書記', '冒険の書のハッシュの鎖を検証する（改ざんを見つける）', 'verify [--json]'],
  repair: ['書記', '呪われたセーブデータを修復する', 'repair'],
  note: ['書記', '日誌を書く（次の自分への申し送り）', 'note <characterId> <text>'],
  amend: ['書記', '地図を改訂する（歴史は書き換えられない）', 'amend <map.json>'],
  load: ['書記', '過去の時点（冒険の書の seq か Git のコミット）の盤面に戻る', 'load <seq|commit>'],
  remote: ['書記', 'Git と GitHub の様子と、GitHub につなぐ手引き', 'remote [--json]'],
  push: ['書記', 'いまのブランチを GitHub（リモート）に送る（force はしない）', 'push [--json]'],
  sortie: ['書記', 'エージェントの出撃を記録する', 'sortie <characterId> --agent <name> [--model M]'],
  return: ['書記', 'エージェントの帰還を記録する', 'return <characterId> --sortie <seq> --code <n> [--log file]'],
  wish: ['書記', '冒険の始まりの願いを記録する', 'wish <text> [--gm G] [--model M]'],
  quest: ['語り部', '「xxxのようなアプリを作りたい」から冒険をつくる', 'quest "<願い>" [--gm claude|codex] [--allow-listen]'],
  party: ['軍師', 'キャラクターごとにエージェントを出撃させる', 'party [--agent claude|codex] [--tactic careful|balanced|bold] [--allow-listen]'],
  init: ['語り部', 'よそのプロジェクトに GridHub の支度をする（AGENTS.md ほか）', 'init [--agent claude|codex] [--allow-listen]'],
  serve: ['伝令', '盤面（5mm方眼ノート）を開く', 'serve [--port 5005]'],
  mcp: ['伝令', 'LLM の道具箱（MCP サーバー、標準入出力）', 'mcp [--dir D]'],
  export: ['地図職人', 'Linear形式で書き出す', 'export linear [--format csv|json] [--out file]'],
  import: ['地図職人', 'Linear CSVから地図の下書きをつくる', 'import linear <file.csv> --out <map.json>'],
  linear: ['地図職人', 'Linear と同期する', 'linear push|pull [--team KEY] [--project NAME]'],
  jira: ['地図職人', 'Jira と同期する', 'jira push|pull [--project KEY]'],
};

function usage() {
  const lines = [
    'GridHub — テスト1件が1マス。5mm方眼ノートのすごろくで開発を進めるゲーム（旧名 マスメ。masume は別名）',
    '',
    'つかいかた: gridhub <command> [options]   共通: --dir <冒険の書のある場所> --as <あなたのID> --json',
    '',
  ];
  for (const [name, [who, what, how]] of Object.entries(COMMANDS)) {
    lines.push(`  ${how.padEnd(44)} ${what}（担当: ${who}）`);
  }
  lines.push('', '--allow-listen: 判定が 127.0.0.1 にサーバーを立てられるよう、Codex の箱（サンドボックス）のソケットを開ける。',
    '  ゲームはローカルのまま。ただし Codex の設定は localhost だけに絞れないので、その出撃中はインターネットにも出られる。',
    'くわしくは gridhub <command> --help');
  lines.push('', 'ルールブック: docs/RULEBOOK.md');
  return lines.join('\n');
}

// process.exit() は使わない（macOS のパイプでは stdout の書き込みが非同期なので、`gridhub --help | less` などで出力が途中で切れる）
export async function main(bin) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(usage());
    return 0;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log('gridhub 0.2.0 (rules 1)');
    return 0;
  }
  if (!Object.hasOwn(COMMANDS, cmd)) {
    console.error(`[E_USAGE] 「${cmd}」というコマンドはありません。\n\n${usage()}`);
    return 2;
  }

  const file = join(ROOT, 'src', 'commands', `${cmd}.js`);
  if (!existsSync(file)) {
    console.error(`[E_NOT_YET] 「${cmd}」はまだ誰も踏んでいないマスです（src/commands/${cmd}.js 担当: ${COMMANDS[cmd][0]}）`);
    return 2;
  }

  const mod = await import(pathToFileURL(file).href);
  try {
    const code = await mod.run(rest, { bin, root: ROOT, cwd: process.cwd(), env: process.env });
    return typeof code === 'number' ? code : 0;
  } catch (err) {
    const code = err && err.code ? `[${err.code}] ` : '';
    console.error(`${code}${err && err.message ? err.message : err}`);
    return err && typeof err.exitCode === 'number' ? err.exitCode : 2;
  }
}

// 直接起動されたときだけ動く（bin/masume.js から読み込まれたときは、そちらが main を呼ぶ）
const self = fileURLToPath(import.meta.url);
const launched = (() => {
  try {
    return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(self);
  } catch {
    return false;
  }
})();
if (launched) process.exitCode = await main(self);
