// MCP の道具の一覧と、道具の引数を CLI の argv に写す規則（CONTRACTS §19）。
// 位置引数は必ず `--` のあとに置く。LLM が書いた文字列が `--dir=…` のようなオプションとして読まれないようにするため。

import { isDev } from '../engine/words.js';

const GMS = ['claude', 'codex'];
const MAX_WISH = 2000;
/** 道具の題と説明は、いまのことば（冒険 / 開発。§76.4）で。{game, dev} なら、いまのほう */
const say = (text) => (typeof text === 'string' ? text : text[isDev() ? 'dev' : 'game']);

/** 引数を検査して、足りない・型違いは説明つきで投げる。 */
function invalid(message) {
  return Object.assign(new Error(message), { code: 'E_ARGS' });
}

const str = (description, extra = {}) => ({ type: 'string', description, minLength: 1, ...extra });
/** スキーマの中の description（{game, dev} の字）を、いまのことばの字にする */
function sayDeep(value) {
  if (Array.isArray(value)) return value.map(sayDeep);
  if (value && typeof value === 'object') {
    if ('game' in value && 'dev' in value && Object.keys(value).length === 2) return say(value);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sayDeep(v)]));
  }
  return value;
}

export const TOOLS = [
  {
    name: 'masume_status',
    title: '盤面の状態',
    description: { game: '盤面（GridHub の冒険）の状態を見る。キャラクターごとの現在地・レベル・テストの成否・記録の番号（seq）が分かる。json を true にすると機械向けの JSON を返す。', dev: '盤面（GridHub のプロジェクト）の状態を見る。担当ごとの現在のマス・レベル・テストの成否・記録の番号（seq）が分かる。json を true にすると機械向けの JSON を返す。' },
    readOnly: true,
    properties: { json: { type: 'boolean', description: 'true なら盤面の JSON を返す' } },
    required: [],
    argv: (a) => ['status', ...(a.json ? ['--json'] : [])],
    jsonOutput: (a) => a.json === true,
  },
  {
    name: 'masume_brief',
    title: { game: '指令書を読む', dev: '作業指示を読む' },
    description: { game: 'キャラクターの指令書を読む。いまのマス・やること・判定コマンド・縄張り・見えている先のマスと、道の余白（別の担当との会話・町の住人・瓦版）のいちばん新しい出来事が書いてある。作業の前にまず読む。', dev: '担当の作業指示を読む。いまのマス・やること・テストのコマンド・担当ファイル・見えている先のマスと、いちばん新しいイベントが書いてある。作業の前にまず読む。' },
    readOnly: true,
    properties: {
      character: str('キャラクターのID（例: engine）'),
      json: { type: 'boolean', description: 'true なら JSON を返す' },
    },
    required: ['character'],
    argv: (a) => ['brief', ...(a.json ? ['--json'] : []), '--', a.character],
    jsonOutput: (a) => a.json === true,
  },
  {
    name: 'masume_check',
    title: { game: '宣言判定', dev: '判定する（check）' },
    description: { game: '宣言判定する。キャラクターまたはゲートの判定（E2E）を走らせ、成功すれば次のマスへ進み、失敗すれば判定失敗として出力の末尾を返す。no_boss を true にすると、あがりに着く宣言でボス戦を省く。', dev: '判定する。担当または結合テストのテスト（E2E）を累積で走らせ、合格すれば次のマスへ進み、失敗すれば判定失敗として出力の末尾を返す。no_boss を true にすると、全員がそろっても結合テストをまだ走らせない。' },
    properties: {
      target: str('キャラクターIDまたはゲートID'),
      as: str('宣言する者のID（既定は target）'),
      no_boss: { type: 'boolean', description: { game: 'true ならボス戦を省いて宣言する', dev: 'true なら結合テストを走らせずに判定だけする' } },
    },
    required: ['target'],
    argv: (a) => ['check', `--as=${a.as ?? a.target}`, ...(a.no_boss ? ['--no-boss'] : []), '--', a.target],
  },
  {
    name: 'masume_step',
    title: { game: '歩く', dev: 'テストを走らせる（step）' },
    description: { game: '歩く（GridHub の step）。いまのダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する。何度でもよく、位置もレベルも変わらない（罰なし）。いちばん手前の落ちているテストだけを通してから歩き、全部通ったら masume_check で宣言する。', dev: 'いまのタスクのテストだけを走らせ、1件ずつの成否を記録する（GridHub の step）。何度でもよく、位置もレベルも変わらない。最初に落ちているテストだけを通してから走らせ、全部通ったら masume_check で判定する。' },
    properties: {
      character: str({ game: '歩くキャラクターのID', dev: '担当の ID' }),
      as: str({ game: '歩く者のID（既定は character）', dev: '記録する者の ID（既定は character）' }),
    },
    required: ['character'],
    argv: (a) => ['step', `--as=${a.as ?? a.character}`, '--', a.character],
  },
  {
    name: 'masume_stamp',
    title: { game: 'ハンコを押す', dev: '承認する' },
    description: { game: '人間のマスにハンコを押す。人間のキャラクターだけが押せる。', dev: '承認のマスを通す。人間の担当だけができる。' },
    properties: {
      node: str({ game: 'ハンコを押すマスのID', dev: '承認するマスの ID' }),
      as: str({ game: 'ハンコを押す人間のキャラクターID', dev: '承認する人間の ID' }),
    },
    required: ['node', 'as'],
    argv: (a) => ['stamp', `--as=${a.as}`, '--', a.node],
  },
  {
    name: 'masume_note',
    title: { game: '日誌を書く', dev: 'メモを書く' },
    description: { game: '冒険の書に日誌を書く。次の自分（や仲間）への申し送りを残す。', dev: 'セーブデータにメモを書く。次の自分（やほかの担当）への申し送りを残す。' },
    properties: {
      character: str({ game: '日誌を書くキャラクターのID', dev: 'メモを書く担当の ID' }),
      text: str('申し送りの本文'),
      as: str('書く者のID（既定は character）'),
    },
    required: ['character', 'text'],
    argv: (a) => ['note', `--as=${a.as ?? a.character}`, '--', a.character, a.text],
  },
  {
    name: 'masume_log',
    title: { game: '冒険の書を読む', dev: 'ログを読む' },
    description: { game: '冒険の書（イベントの記録）の末尾を読む。何が起きたかをさかのぼれる。', dev: 'セーブデータ（イベントの記録）の末尾を読む。何が起きたかをさかのぼれる。' },
    readOnly: true,
    properties: { tail: { type: 'integer', minimum: 0, description: '末尾から何件読むか（既定 20）' } },
    required: [],
    argv: (a) => ['log', `--tail=${a.tail ?? 20}`],
  },
  {
    name: 'masume_verify',
    title: { game: '冒険の書の検証', dev: 'セーブデータの検証' },
    description: { game: '冒険の書（セーブデータ。ハッシュの鎖）が壊れていない・書き換えられていないか検証する。', dev: 'セーブデータ（ハッシュの鎖）が壊れていない・書き換えられていないか検証する。' },
    readOnly: true,
    properties: {},
    required: [],
    argv: () => ['verify'],
  },
  {
    name: 'masume_quest',
    title: { game: '願いから冒険をはじめる', dev: '作りたいものから地図を作る' },
    description: { game: '「メモアプリのようなアプリを作りたい」のような願いから、GM の LLM に地図をつくらせて冒険をはじめる。時間がかかる。冒険の書がすでにあるときは失敗する。allow_listen は、判定が 127.0.0.1 にサーバーを立てられるように Codex の箱のソケットを開ける。ゲームはローカルのままだが、Codex の設定は localhost だけに絞れないため、エージェントはインターネットにも出られる。codex にだけ効き、生まれた冒険の出撃にも設定を引き継ぐ。', dev: '「メモアプリのようなアプリを作りたい」のような依頼から、GM の LLM に地図と E2E テストを作らせてプロジェクトを始める。時間がかかる。セーブデータがすでにあるときは失敗する。allow_listen は、テストが 127.0.0.1 にサーバーを立てられるように Codex のサンドボックスのソケットを開ける。ローカルのままだが、Codex の設定は localhost だけに絞れないため、エージェントはインターネットにも出られる。codex にだけ効き、生まれたプロジェクトのエージェント起動にも設定を引き継ぐ。' },
    properties: {
      wish: str({ game: `作りたいものの願い（前後の空白を除いて1〜${MAX_WISH}コードポイント）`, dev: `作りたいもの（前後の空白を除いて1〜${MAX_WISH}コードポイント）` }),
      gm: { type: 'string', enum: GMS, description: '地図をつくる GM の LLM（claude または codex）' },
      model: str('GM のモデル名（省略可）'),
      allow_listen: { type: 'boolean', description: 'true なら Codex の箱のソケットを開ける（省略可）' },
    },
    required: ['wish'],
    argv: (a) => ['quest', ...(a.gm !== undefined ? [`--gm=${a.gm}`] : []), ...(a.model !== undefined ? [`--model=${a.model}`] : []), ...(a.allow_listen === true ? ['--allow-listen'] : []), '--', a.wish],
    validate: (a) => {
      if (a.wish.trim() === '') throw invalid('wish が空です');
      if ([...a.wish.trim()].length > MAX_WISH) throw invalid(`wish は${MAX_WISH}文字までです`);
      if (a.gm !== undefined && !GMS.includes(a.gm)) {
        throw invalid(`gm は ${GMS.join(' か ')} だけ指定できます（cmd: は受け付けません）: ${a.gm}`);
      }
    },
    exclusive: 'quest',
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** tools/list の中身 */
export function listTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: say(tool.title),
    description: say(tool.description),
    inputSchema: { type: 'object', properties: sayDeep(tool.properties), required: tool.required },
    annotations: { readOnlyHint: tool.readOnly === true },
  }));
}

export function findTool(name) {
  return typeof name === 'string' ? BY_NAME.get(name) : undefined;
}

/** arguments を道具の inputSchema に照らして検査する（足りない・型違いは E_ARGS で投げる）。 */
export function checkArguments(tool, args) {
  if (args === undefined || args === null) args = {};
  if (typeof args !== 'object' || Array.isArray(args)) throw invalid('arguments はオブジェクトで渡してください');
  for (const key of tool.required) {
    if (args[key] === undefined || args[key] === null) throw invalid(`引数が足りません: ${key}`);
  }
  for (const [key, spec] of Object.entries(tool.properties)) {
    const value = args[key];
    if (value === undefined) continue;
    if (spec.type === 'string' && typeof value !== 'string') throw invalid(`${key} は文字列で指定してください`);
    if (spec.type === 'string' && spec.minLength && value.trim() === '') throw invalid(`${key} が空です`);
    if (spec.type === 'boolean' && typeof value !== 'boolean') throw invalid(`${key} は true か false で指定してください`);
    if (spec.type === 'integer' && (!Number.isSafeInteger(value) || value < (spec.minimum ?? 0))) {
      throw invalid(`${key} は${spec.minimum ?? 0}以上の整数で指定してください`);
    }
    if (spec.enum && !spec.enum.includes(value)) throw invalid(`${key} は ${spec.enum.join(' か ')} のどちらかです`);
  }
  tool.validate?.(args);
  return args;
}
