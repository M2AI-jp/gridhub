#!/usr/bin/env node
// GridHub CLI の受付係。各サブコマンドは src/commands/<name>.js が担当する（担当キャラクターの縄張り）。
// この受付係は GM の縄張り。サブコマンドを足すときは COMMANDS に1行足すだけにする。
// bin/masume.js は旧名の別名（第11章）。どちらから起動しても、ctx.bin は実際に起動したファイル。
import { existsSync, readFileSync, realpathSync } from 'node:fs';
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
  log: ['書記', '冒険の書を読む（人の読める文。--json で生のイベント）', 'log [--tail [N]] [--json]'],
  verify: ['書記', '冒険の書のハッシュの鎖を検証する（改ざんを見つける）', 'verify [--json]'],
  repair: ['書記', '呪われたセーブデータを修復する', 'repair'],
  note: ['書記', '日誌を書く（次の自分への申し送り）', 'note <characterId> <text>'],
  amend: ['書記', '地図を改訂する（歴史は書き換えられない）', 'amend <map.json>'],
  load: ['書記', '過去の時点（冒険の書の seq か Git のコミット）の盤面に戻る', 'load <seq|commit>'],
  remote: ['書記', 'Git と GitHub の様子と、GitHub につなぐ手引き', 'remote [--auto-push on|off] [--json]'],
  push: ['書記', 'いまのブランチを GitHub（リモート）に送る（force はしない）', 'push [--json]'],
  sortie: ['書記', 'エージェントの出撃を記録する', 'sortie <characterId> --agent <name> [--model M]'],
  return: ['書記', 'エージェントの帰還を記録する', 'return <characterId> --sortie <seq> --code <n> [--log file]'],
  wish: ['書記', '冒険の始まりの願いを記録する', 'wish <text> [--gm G] [--model M]'],
  quest: ['語り部', '「xxxのようなアプリを作りたい」から冒険をつくる', 'quest "<願い>" [--gm claude|codex] [--allow-listen]'],
  party: ['軍師', 'キャラクターごとにエージェントを出撃させる', 'party [--agent claude|codex] [--tactic careful|balanced|bold] [--allow-listen]'],
  init: ['語り部', 'よそのプロジェクトに GridHub の支度をする（AGENTS.md ほか）', 'init [--agent claude|codex] [--allow-listen]'],
  serve: ['伝令', '盤面（5mm方眼ノート）を開く', 'serve [--port 5005] [--host 127.0.0.1] [--dir D] [--no-open] [--lifeline]'],
  app: ['伝令', 'アプリの起動役（はじめの画面・フォルダを開く・チュートリアル）', 'app [--port 0] [--home D] [--play D] [--lifeline]'],
  mcp: ['伝令', 'LLM の道具箱（MCP サーバー、標準入出力）', 'mcp [--dir D]'],
  export: ['地図職人', 'Linear形式で書き出す', 'export linear [--format csv|json] [--out file]'],
  import: ['地図職人', 'Linear CSVから地図の下書きをつくる', 'import linear <file.csv> --out <map.json> [--quest-id KEY] [--title T]'],
  linear: ['地図職人', 'Linear と同期する', 'linear push|pull --team KEY [--project NAME] [--out map.json]'],
  jira: ['地図職人', 'Jira と同期する', 'jira push|pull [--project KEY] [--out map.json]'],
};

// 版は package.json から読む（決め打ちしない。CONTRACTS §62.2）
function version() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

// ---- 各コマンドの --help / -h（受付係が答える。quest・party・init・app は、自分でもっとくわしい説明を出す） ----
const SELF_HELP = new Set(['quest', 'party', 'init', 'app']);

// 書記のコマンドに共通のオプション（src/engine/cli.js の parseArgs）
const COMMON = [
  '  --dir <場所>   冒険の書（.masume/）のあるフォルダ。省略すると、今いる場所から上へ探す（環境変数 MASUME_DIR も見る）',
  '  --as <ID>      だれとして記録するか（キャラクターID）。省略すると環境変数 MASUME_ACTOR。それも無ければ、',
  '                 step・check・note はコマンドに渡したキャラクターID、それ以外（seal・amend・load など）は gm',
  '  --json         結果を JSON で出す',
];
const DIR_JSON = [COMMON[0], COMMON[2]];
// 共通のオプションを使わないコマンドの、そのコマンドだけのオプション
const OPTIONS = {
  serve: [
    '  --port N       待ち受けるポート（既定 5005。0 なら空いているポート）',
    '  --host H       待ち受けるホスト名（既定 127.0.0.1）',
    '  --dir D        冒険の書のあるフォルダ（無ければ入口を開く。省略すると、今いる場所から上へ探す。フォルダ自体が無ければ止まる）',
    '  --open         ブラウザで盤面を開く（ターミナルから打ったときは、言わなくても開く）',
    '  --no-open      ブラウザを開かない（URL を出すだけ）',
    '  --lifeline     標準入力が閉じたら止まる（アプリから起こすとき用。アプリが落ちてもサーバーを残さない）',
  ],
  mcp: ['  --dir D        冒険の書のあるフォルダ（省略すると環境変数 MASUME_DIR か、今いる場所から上へ探す）'],
  export: ['  --format json|csv  書き出す形（既定 json）', '  --out <file>       出力先（省略すると標準出力）', ...DIR_JSON],
  import: ['  --out <map.json>   地図の下書きの出力先（必須）', '  --quest-id KEY     冒険の ID', '  --title T          冒険の題', COMMON[2]],
  linear: [
    '  push: --team KEY [--project NAME] [--dry-run]                       盤面の状態を Linear の issue に送る',
    '  pull: --team KEY [--project NAME] --out <map.json> [--quest-id KEY] [--title T]   Linear の issue から地図の下書きをつくる',
    '  環境変数 LINEAR_API_KEY（Linear の API キー）',
    ...DIR_JSON,
  ],
  jira: [
    '  push: [--project KEY] [--dry-run]                                   盤面の状態を Jira の課題に送る',
    '  pull: --project KEY --out <map.json> [--quest-id KEY] [--title T]  Jira の課題から地図の下書きをつくる',
    '  環境変数 JIRA_BASE_URL・JIRA_EMAIL・JIRA_API_TOKEN',
    ...DIR_JSON,
  ],
};
// 1〜3行の補足（何をするか・いつ使うか）
const DETAIL = {
  new: ['地図（*.map.json）を読んで、冒険の書（.masume/）をつくる。check.seal の判定ファイルがあれば、そのとき封印する。', '--force: すでに冒険の書があっても作り直す。'],
  validate: ['地図の形を検査する（冒険の書はつくらない）。地図の契約は docs/CONTRACTS.md §2。'],
  seal: ['判定ファイル（check.seal）のハッシュを冒険の書に記録する（GM の仕事）。--all で、判定ファイルのあるマス全部。'],
  step: ['今のダンジョン（task）の判定だけを走らせ、テスト1件ずつの成否を記録する。位置もレベルも変わらない（何度でも・罰なし）。', '出力の「いちばん手前のモンスター」が、次に通すテスト。'],
  check: ['宣言判定（一発勝負）。町から今までの判定をまとめて走らせ、通れば次のマスへ、落ちれば Lv−1 で町へ戻る。', '--no-boss: 結合ゲートに仲間がそろっても、ボス戦を始めない（あとで check <gateId>）。'],
  stamp: ['人間のマス（check.kind: stamp）にハンコを押す。--as には、そのマスの check.by（人間のID）を書く。'],
  status: ['冒険の題・各キャラクターの場所と状態・レベル・いまの記録（seq と Git のコミット）。'],
  brief: ['指令書: 現在のマス・テスト1件ずつの成否・いま戦うテスト・受け継いだ技・仲間の位置・自分の日誌。'],
  log: ['冒険の書（.masume/log.jsonl）を、最初から人の読める文で出す（盤面の「冒険の書」と同じ言い方。時刻はこの機械のローカル時刻）。', '--tail で最後の 20 件、--tail N で最後の N 件。--json は生のイベント（seq・ts・actor・type・data）。'],
  verify: ['ハッシュの鎖・地図・判定の出力の改ざんを見つける。壊れていれば「呪われています」（終了コード 3）。'],
  repair: ['壊れた所から後ろを退避して、鎖を直す。'],
  note: ['日誌（次の自分への申し送り）。強敵を倒した直後の日誌は技になり、次の代に受け継がれる。'],
  amend: ['地図を改訂する（新しい章）。通過したマスの削除・判定の変更・その前への差し込みはできない。'],
  load: ['その時点の盤面に戻る（戻したことも記録される）。コードは git checkout <commit> で戻す。'],
  remote: ['Git と GitHub の様子と、まだの手引き（gh の導入・ログイン・リポジトリ・送る）。', '--auto-push on|off: 町でセーブしたら GitHub に送る（初めはオフ）。'],
  push: ['いまのブランチを git push する（force はしない。GitHub のほうが先に進んでいたら止まる）。'],
  sortie: ['（軍師が使う）エージェントの出撃を冒険の書に記録する。ふつうは gridhub party が打つ。'],
  return: ['（軍師が使う）出撃の帰還を記録する。止まったままの出撃を閉じるときにも使う。'],
  wish: ['（語り部が使う）冒険の始まりの願いを記録する。ふつうは gridhub quest が打つ。'],
  serve: ['盤面を http://127.0.0.1:5005/ で配る（動かしたままにする）。ターミナルから打てばブラウザも開く（--no-open で開かない。パイプの先やアプリからは開かない）。', '冒険の書が無ければ入口（願いを書く所）を開く。'],
  mcp: ['標準入出力の MCP サーバー。道具は masume_brief / masume_step / masume_check / masume_note / masume_stamp ほか。', '例: claude mcp add gridhub -- node <このファイル> mcp --dir <プロジェクト>'],
  export: ['盤面の状態を Linear 形式（issue の一覧）に書き出す。task にテストのチェックリストが付く。'],
  import: ['Linear の CSV（書き出したもの）から、地図の下書きをつくる。'],
  linear: ['Linear 本体と同期する。'],
  jira: ['Jira 本体と同期する。'],
};

function wantsHelp(args) {
  for (const arg of args) {
    if (arg === '--') return false;
    if (arg === '--help' || arg === '-h') return true;
  }
  return false;
}

function commandHelp(cmd) {
  const [who, what, how] = COMMANDS[cmd];
  return [
    `gridhub ${cmd} — ${what}（担当: ${who}）`,
    ...(DETAIL[cmd] ?? []),
    '',
    `つかいかた: gridhub ${how}`,
    '',
    'オプション:',
    ...(OPTIONS[cmd] ?? COMMON),
    '  -h, --help     この説明を出す',
    '',
    '一覧: gridhub --help / ルールブック: docs/RULEBOOK.md',
  ].join('\n');
}

function usage() {
  const lines = [
    'GridHub — テスト1件が1マス。5mm方眼ノートのすごろくで開発を進めるゲーム（旧名 マスメ。masume は別名）',
    '',
    'つかいかた: gridhub <command> [options]   共通: --dir <冒険の書のある場所> --as <あなたのID> --json',
    '',
  ];
  const width = Math.max(...Object.values(COMMANDS).map(([, , how]) => how.length)) + 2;
  for (const [, [who, what, how]] of Object.entries(COMMANDS)) {
    lines.push(`  ${how.padEnd(width)}${what}（担当: ${who}）`);
  }
  lines.push('', '--allow-listen: 判定が 127.0.0.1 にサーバーを立てられるよう、Codex の箱（サンドボックス）のソケットを開ける。',
    '  ゲームはローカルのまま。ただし Codex の設定は localhost だけに絞れないので、その出撃中はインターネットにも出られる。',
    'くわしくは gridhub <command> --help');
  lines.push('', 'ルールブック: docs/RULEBOOK.md',
    '版: gridhub --version（`gridhub 0.3.0 (rules 1)` の rules は、冒険の書と地図の形式の版。同じ rules なら、ほかの版の gridhub でも同じ冒険の書を読める）');
  return lines.join('\n');
}

// process.exit() は使わない（macOS のパイプでは stdout の書き込みが非同期なので、`gridhub --help | less` などで出力が途中で切れる）
export async function main(bin) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(usage());
    return 0;
  }
  if (cmd === '--version' || cmd === '-v' || cmd === '-V' || cmd === 'version') {
    // `gridhub <版> (rules 1)` の1行だけ（道具と判定が全文を読む）。rules の意味は --help の末尾に
    console.log(`gridhub ${version()} (rules 1)`);
    return 0;
  }
  if (!Object.hasOwn(COMMANDS, cmd)) {
    console.error(`[E_USAGE] 「${cmd}」というコマンドはありません。\n\n${usage()}`);
    return 2;
  }

  // 各コマンドの --help / -h は受付係が答える（何も読まず・書かず、冒険の書が無くてもよい）
  if (!SELF_HELP.has(cmd) && wantsHelp(rest)) {
    console.log(commandHelp(cmd));
    return 0;
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
