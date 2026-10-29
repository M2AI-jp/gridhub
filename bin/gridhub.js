#!/usr/bin/env node
// GridHub CLI の受付係。各サブコマンドは src/commands/<name>.js が担当する（担当キャラクターの縄張り）。
// この受付係は GM の縄張り。サブコマンドを足すときは COMMANDS に1行足すだけにする。
// bin/masume.js は旧名の別名（第11章）。どちらから起動しても、ctx.bin は実際に起動したファイル。
// 字は2つの言い方（冒険のことば / 開発のことば。CONTRACTS §76）を持ち、--words・GRIDHUB_WORDS・.masume/words.json で決まる。
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { guessRoot, wordsFlag } from '../src/engine/cli.js';
import { isDev, resolveWords, t } from '../src/engine/words.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// [役の key, 説明 {game, dev}, つかいかた]
const COMMANDS = {
  new: ['engine', { game: '地図から冒険の書をつくる', dev: '地図からセーブデータをつくる' }, 'new <map.json> [--force]'],
  validate: ['engine', { game: '地図を検査する', dev: '地図を検査する' }, 'validate <map.json>'],
  seal: ['engine', { game: '判定（E2E）のファイルを封印する', dev: '判定（E2E）のファイルのハッシュを記録する' }, 'seal <nodeId...|--all>'],
  step: ['engine', { game: '歩く: 今のダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する（罰なし）', dev: '今のタスクのテストだけを走らせ、1件ずつの成否を記録する（レベルも位置も変わらない）' }, 'step <characterId>'],
  check: ['engine', { game: '宣言判定する（町からの判定をまとめて走らせて進む／戻る）', dev: '判定する（セーブポイントからの累積テストに合格すれば進む。失敗なら Lv−1 で戻る）' }, 'check <characterId|gateId> [--no-boss]'],
  stamp: ['engine', { game: '人間のマスにハンコを押す', dev: '承認のマスを人間が通す' }, 'stamp <nodeId> --as <humanId>'],
  status: ['engine', { game: '盤面の状態', dev: '盤面の状態' }, 'status [--json]'],
  brief: ['engine', { game: '指令書（いまやること・見えている範囲）', dev: '作業指示（いまやること・見えている範囲）' }, 'brief <characterId> [--json]'],
  log: ['engine', { game: '冒険の書を読む', dev: 'セーブデータのログを読む' }, 'log [--tail N] [--json]'],
  verify: ['engine', { game: '冒険の書のハッシュの鎖を検証する（改ざんを見つける）', dev: 'セーブデータのハッシュの鎖を検証する（改ざんを見つける）' }, 'verify [--json]'],
  repair: ['engine', { game: '呪われたセーブデータを修復する', dev: '整合性エラーのあるセーブデータを修復する' }, 'repair'],
  note: ['engine', { game: '日誌を書く（次の自分への申し送り）', dev: 'メモを書く（次の自分への申し送り）' }, 'note <characterId> <text>'],
  amend: ['engine', { game: '地図を改訂する（歴史は書き換えられない）', dev: '地図を改訂する（通過したマスは変えられない）' }, 'amend <map.json>'],
  load: ['engine', { game: '過去の時点（冒険の書の seq か Git のコミット）の盤面に戻る', dev: '過去の時点（記録の seq か Git のコミット）の盤面に戻る' }, 'load <seq|commit>'],
  remote: ['engine', { game: 'Git と GitHub の様子と、GitHub につなぐ手引き', dev: 'Git と GitHub の様子と、GitHub につなぐ手順' }, 'remote [--auto-push on|off] [--json]'],
  push: ['engine', { game: 'いまのブランチを GitHub（リモート）に送る（force はしない）', dev: 'いまのブランチを push する（--force はしない）' }, 'push [--json]'],
  words: ['engine', { game: 'ことばを見る・変える（冒険のことば / 開発のことば）', dev: 'ことばを見る・変える（冒険のことば / 開発のことば）' }, 'words [game|dev]'],
  sortie: ['engine', { game: 'エージェントの出撃を記録する', dev: 'エージェントの起動を記録する' }, 'sortie <characterId> --agent <name> [--model M]'],
  return: ['engine', { game: 'エージェントの帰還を記録する', dev: 'エージェントの終了を記録する' }, 'return <characterId> --sortie <seq> --code <n> [--log file]'],
  wish: ['engine', { game: '冒険の始まりの願いを記録する', dev: '作りたいもの（最初の依頼）を記録する' }, 'wish <text> [--gm G] [--model M]'],
  quest: ['quest', { game: '「xxxのようなアプリを作りたい」から冒険をつくる', dev: '「xxxのようなアプリを作りたい」から地図とテストをつくる' }, 'quest "<願い>" [--gm claude|codex] [--allow-listen]'],
  party: ['party', { game: 'キャラクターごとにエージェントを出撃させる', dev: '担当ごとにエージェントを起動する' }, 'party [--agent claude|codex] [--tactic careful|balanced|bold] [--allow-listen]'],
  init: ['quest', { game: 'よそのプロジェクトに GridHub の支度をする（AGENTS.md ほか）', dev: 'よそのプロジェクトに GridHub の支度をする（AGENTS.md ほか）' }, 'init [--agent claude|codex] [--allow-listen]'],
  serve: ['server', { game: '盤面（5mm方眼ノート）を開く', dev: '盤面（5mm方眼ノート）を開く' }, 'serve [--port 5005] [--host 127.0.0.1] [--dir D] [--lifeline]'],
  app: ['server', { game: 'アプリの起動役（はじめの画面・フォルダを開く・チュートリアル）', dev: 'アプリの起動役（はじめの画面・フォルダを開く・チュートリアル）' }, 'app [--port 0] [--home D] [--play D] [--lifeline]'],
  mcp: ['server', { game: 'LLM の道具箱（MCP サーバー、標準入出力）', dev: 'MCP サーバー（標準入出力）' }, 'mcp [--dir D]'],
  export: ['linear', { game: 'Linear形式で書き出す', dev: 'Linear 形式で書き出す' }, 'export linear [--format csv|json] [--out file]'],
  import: ['linear', { game: 'Linear CSVから地図の下書きをつくる', dev: 'Linear の CSV から地図の下書きをつくる' }, 'import linear <file.csv> --out <map.json> [--quest-id KEY] [--title T]'],
  linear: ['linear', { game: 'Linear と同期する', dev: 'Linear と同期する' }, 'linear push|pull --team KEY [--project NAME] [--out map.json]'],
  jira: ['linear', { game: 'Jira と同期する', dev: 'Jira と同期する' }, 'jira push|pull [--project KEY] [--out map.json]'],
};
const what = (cmd) => COMMANDS[cmd][1][isDev() ? 'dev' : 'game'];
const who = (cmd) => t(`role.${COMMANDS[cmd][0]}`);

// 版は package.json から読む（決め打ちしない。CONTRACTS §62.2）
function version() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
}

// ---- 各コマンドの --help / -h（受付係が答える。quest・party・init・app は、自分でもっとくわしい説明を出す） ----
const SELF_HELP = new Set(['quest', 'party', 'init', 'app']);

// 書記のコマンドに共通のオプション（src/engine/cli.js の parseArgs）
const common = () => [t('cli.common.dir'), t('cli.common.as'), t('cli.common.json'), t('cli.help.words')];
const dirJson = () => [t('cli.common.dir'), t('cli.common.json'), t('cli.help.words')];
// 共通のオプションを使わないコマンドの、そのコマンドだけのオプション
const OPTIONS = {
  serve: () => [
    '  --port N       待ち受けるポート（既定 5005。0 なら空いているポート）',
    '  --host H       待ち受けるホスト名（既定 127.0.0.1）',
    { game: '  --dir D        冒険の書のあるフォルダ（無ければ入口を開く。省略すると、今いる場所から上へ探す）', dev: '  --dir D        セーブデータのあるフォルダ（無ければ入口を開く。省略すると、今いる場所から上へ探す）' },
    '  --lifeline     標準入力が閉じたら止まる（アプリから起こすとき用。アプリが落ちてもサーバーを残さない）',
    t('cli.help.words'),
  ],
  mcp: () => [{ game: '  --dir D        冒険の書のあるフォルダ（省略すると環境変数 MASUME_DIR か、今いる場所から上へ探す）', dev: '  --dir D        セーブデータのあるフォルダ（省略すると環境変数 MASUME_DIR か、今いる場所から上へ探す）' }, t('cli.help.words')],
  export: () => ['  --format json|csv  書き出す形（既定 json）', '  --out <file>       出力先（省略すると標準出力）', ...dirJson()],
  import: () => ['  --out <map.json>   地図の下書きの出力先（必須）', '  --quest-id KEY     冒険の ID', '  --title T          冒険の題', t('cli.common.json')],
  linear: () => [
    '  push: --team KEY [--project NAME] [--dry-run]                       盤面の状態を Linear の issue に送る',
    '  pull: --team KEY [--project NAME] --out <map.json> [--quest-id KEY] [--title T]   Linear の issue から地図の下書きをつくる',
    '  環境変数 LINEAR_API_KEY（Linear の API キー）',
    ...dirJson(),
  ],
  jira: () => [
    '  push: [--project KEY] [--dry-run]                                   盤面の状態を Jira の課題に送る',
    '  pull: --project KEY --out <map.json> [--quest-id KEY] [--title T]  Jira の課題から地図の下書きをつくる',
    '  環境変数 JIRA_BASE_URL・JIRA_EMAIL・JIRA_API_TOKEN',
    ...dirJson(),
  ],
  words: () => [t('cli.common.dir'), t('cli.common.json')],
};
// 1〜3行の補足（何をするか・いつ使うか）。{game, dev} なら、いまの言い方のほう
const DETAIL = {
  new: [{ game: '地図（*.map.json）を読んで、冒険の書（.masume/）をつくる。check.seal の判定ファイルがあれば、そのとき封印する。', dev: '地図（*.map.json）を読んで、セーブデータ（.masume/）をつくる。check.seal の判定ファイルがあれば、そのときハッシュを記録する。' }, { game: '--force: すでに冒険の書があっても作り直す。', dev: '--force: すでにセーブデータがあっても作り直す。' }],
  validate: ['地図の形を検査する（冒険の書はつくらない）。地図の契約は docs/CONTRACTS.md §2。'],
  seal: [{ game: '判定ファイル（check.seal）のハッシュを冒険の書に記録する（GM の仕事）。--all で、判定ファイルのあるマス全部。', dev: '判定ファイル（check.seal）のハッシュをセーブデータに記録する（GM の仕事）。--all で、判定ファイルのあるマス全部。' }],
  step: [{ game: '今のダンジョン（task）の判定だけを走らせ、テスト1件ずつの成否を記録する。位置もレベルも変わらない（何度でも・罰なし）。', dev: '今のタスク（task）のテストだけを走らせ、1件ずつの成否を記録する。位置もレベルも変わらない（何度でも）。' }, { game: '出力の「いちばん手前のモンスター」が、次に通すテスト。', dev: '出力の「次に通すテスト」が、次に直す所。' }],
  check: [{ game: '宣言判定（一発勝負）。町から今までの判定をまとめて走らせ、通れば次のマスへ、落ちれば Lv−1 で町へ戻る。', dev: '判定（累積）。セーブポイントから今までのテストをまとめて走らせ、合格なら次のマスへ、失敗なら Lv−1 でセーブポイントへ戻る。' }, { game: '--no-boss: 結合ゲートに仲間がそろっても、ボス戦を始めない（あとで check <gateId>）。', dev: '--no-boss: 結合テストに全員がそろっても、まだ走らせない（あとで check <gateId>）。' }],
  stamp: [{ game: '人間のマス（check.kind: stamp）にハンコを押す。--as には、そのマスの check.by（人間のID）を書く。', dev: '承認のマス（check.kind: stamp）を人間が通す。--as には、そのマスの check.by（人間の ID）を書く。' }],
  status: [{ game: '冒険の題・各キャラクターの場所と状態・レベル・いまの記録（seq と Git のコミット）。', dev: 'プロジェクトの題・各担当の場所と状態・レベル・いまの記録（seq と Git のコミット）。' }],
  brief: [{ game: '指令書: 現在のマス・テスト1件ずつの成否・いま戦うテスト・受け継いだ技・仲間の位置・自分の日誌。', dev: '作業指示: 現在のマス・テスト1件ずつの成否・次に通すテスト・引き継ぎメモ・ほかの担当の位置・自分のメモ。' }],
  log: [{ game: '冒険の書（.masume/log.jsonl）を最初から読む。--tail N で最後の N 件だけ。', dev: 'セーブデータ（.masume/log.jsonl）を最初から読む。--tail N で最後の N 件だけ。' }],
  verify: [{ game: 'ハッシュの鎖・地図・判定の出力の改ざんを見つける。壊れていれば「呪われています」（終了コード 3）。', dev: 'ハッシュの鎖・地図・テストの出力の改ざんを見つける。壊れていれば「整合性エラー」（終了コード 3）。' }],
  repair: ['壊れた所から後ろを退避して、鎖を直す。'],
  note: [{ game: '日誌（次の自分への申し送り）。強敵を倒した直後の日誌は技になり、次の代に受け継がれる。', dev: 'メモ（次の自分への申し送り）。2回以上失敗したテストを通した直後のメモは引き継ぎメモになり、次の起動に渡る。' }],
  amend: ['地図を改訂する（新しい章）。通過したマスの削除・判定の変更・その前への差し込みはできない。'],
  load: ['その時点の盤面に戻る（戻したことも記録される）。コードは git checkout <commit> で戻す。'],
  remote: [{ game: 'Git と GitHub の様子と、まだの手引き（gh の導入・ログイン・リポジトリ・送る）。', dev: 'Git と GitHub の様子と、まだの手順（gh の導入・ログイン・リポジトリ・push）。' }, { game: '--auto-push on|off: 町でセーブしたら GitHub に送る（初めはオフ）。', dev: '--auto-push on|off: コミットしたら自動で push する（初めはオフ）。' }],
  push: ['いまのブランチを git push する（force はしない。GitHub のほうが先に進んでいたら止まる）。'],
  words: [{ game: 'ことば（字の言い方）を見る・変える。game は冒険のことば（モンスター・ダンジョン・町）、dev は開発のことば（テスト・タスク・コミット）。', dev: 'ことば（字の言い方）を見る・変える。game は冒険のことば（モンスター・ダンジョン・町）、dev は開発のことば（テスト・タスク・コミット）。' }, { game: '引数をつけると、この冒険の .masume/words.json に書く（盤面の右上のボタンと同じ設定）。', dev: '引数をつけると、このプロジェクトの .masume/words.json に書く（盤面の右上のボタンと同じ設定）。' }],
  sortie: [{ game: '（軍師が使う）エージェントの出撃を冒険の書に記録する。ふつうは gridhub party が打つ。', dev: '（party が使う）エージェントの起動をセーブデータに記録する。ふつうは gridhub party が打つ。' }],
  return: [{ game: '（軍師が使う）出撃の帰還を記録する。止まったままの出撃を閉じるときにも使う。', dev: '（party が使う）起動の終了を記録する。止まったままの起動を閉じるときにも使う。' }],
  wish: [{ game: '（語り部が使う）冒険の始まりの願いを記録する。ふつうは gridhub quest が打つ。', dev: '（quest が使う）作りたいもの（最初の依頼）を記録する。ふつうは gridhub quest が打つ。' }],
  serve: ['盤面を http://127.0.0.1:5005/ で配る。URL を表示するので、ブラウザで開いてください（動かしたままにする）。', { game: '冒険の書が無ければ入口（願いを書く所）を開く。', dev: 'セーブデータが無ければ入口（作りたいものを書く所）を開く。' }],
  mcp: ['標準入出力の MCP サーバー。道具は masume_brief / masume_step / masume_check / masume_note / masume_stamp ほか。', '例: claude mcp add gridhub -- node <このファイル> mcp --dir <プロジェクト>'],
  export: ['盤面の状態を Linear 形式（issue の一覧）に書き出す。task にテストのチェックリストが付く。'],
  import: ['Linear の CSV（書き出したもの）から、地図の下書きをつくる。'],
  linear: ['Linear 本体と同期する。'],
  jira: ['Jira 本体と同期する。'],
};
const pick = (line) => (typeof line === 'string' ? line : line[isDev() ? 'dev' : 'game']);

function wantsHelp(args) {
  for (const arg of args) {
    if (arg === '--') return false;
    if (arg === '--help' || arg === '-h') return true;
  }
  return false;
}

function commandHelp(cmd) {
  const how = COMMANDS[cmd][2];
  return [
    `gridhub ${cmd} — ${what(cmd)}（担当: ${who(cmd)}）`,
    ...(DETAIL[cmd] ?? []).map(pick),
    '',
    `${t('cli.help.usage')}: gridhub ${how}`,
    '',
    t('cli.help.options'),
    ...(OPTIONS[cmd] ? OPTIONS[cmd]() : common()).map(pick),
    t('cli.help.this'),
    '',
    t('cli.help.foot'),
  ].join('\n');
}

function usage() {
  const lines = [t('cli.tagline'), '', t('cli.usage'), ''];
  for (const [name, [, , how]] of Object.entries(COMMANDS)) {
    lines.push(`  ${how.padEnd(44)} ${what(name)}（担当: ${who(name)}）`);
  }
  lines.push('', '--allow-listen: 判定が 127.0.0.1 にサーバーを立てられるよう、Codex の箱（サンドボックス）のソケットを開ける。',
    '  ゲームはローカルのまま。ただし Codex の設定は localhost だけに絞れないので、その出撃中はインターネットにも出られる。',
    'くわしくは gridhub <command> --help');
  lines.push('', t('cli.words.hint'));
  lines.push('', t('cli.rulebook'));
  return lines.join('\n');
}

// process.exit() は使わない（macOS のパイプでは stdout の書き込みが非同期なので、`gridhub --help | less` などで出力が途中で切れる）
export async function main(bin) {
  const [cmd, ...rest] = process.argv.slice(2);
  // ことば（§76）: 受付係の字も、--words > GRIDHUB_WORDS > 冒険の設定 > game で決める
  resolveWords({ root: guessRoot({ cwd: process.cwd(), env: process.env, dir: dirFlag(rest) }), env: process.env, flag: wordsFlag(rest) });
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(usage());
    return 0;
  }
  if (cmd === '--version' || cmd === '-v') {
    console.log(`gridhub ${version()} (rules 1)`);
    return 0;
  }
  if (!Object.hasOwn(COMMANDS, cmd)) {
    console.error(`[E_USAGE] ${t('cli.unknown', cmd)}\n\n${usage()}`);
    return 2;
  }

  // 各コマンドの --help / -h は受付係が答える（何も読まず・書かず、冒険の書が無くてもよい）
  if (!SELF_HELP.has(cmd) && wantsHelp(rest)) {
    console.log(commandHelp(cmd));
    return 0;
  }

  const file = join(ROOT, 'src', 'commands', `${cmd}.js`);
  if (!existsSync(file)) {
    console.error(`[E_NOT_YET] ${t('cli.notyet', cmd, who(cmd))}`);
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

/** argv の --dir D（--dir=D でも）。受付係が、ことばの設定を読む場所を知るため */
function dirFlag(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--') return undefined;
    if (argv[i] === '--dir') return argv[i + 1];
    if (argv[i].startsWith('--dir=')) return argv[i].slice('--dir='.length);
  }
  return undefined;
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
