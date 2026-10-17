// MCP の道具の一覧と、道具の引数を CLI の argv に写す規則（CONTRACTS §19）。
// 位置引数は必ず `--` のあとに置く。LLM が書いた文字列が `--dir=…` のようなオプションとして読まれないようにするため。

const GMS = ['claude', 'codex'];
const MAX_WISH = 2000;

/** 引数を検査して、足りない・型違いは説明つきで投げる。 */
function invalid(message) {
  return Object.assign(new Error(message), { code: 'E_ARGS' });
}

const str = (description, extra = {}) => ({ type: 'string', description, minLength: 1, ...extra });

export const TOOLS = [
  {
    name: 'masume_status',
    title: '盤面の状態',
    description: '盤面（マスメの冒険）の状態を見る。キャラクターごとの現在地・レベル・ふっかつのじゅもんが分かる。json を true にすると機械向けの JSON を返す。',
    readOnly: true,
    properties: { json: { type: 'boolean', description: 'true なら盤面の JSON を返す' } },
    required: [],
    argv: (a) => ['status', ...(a.json ? ['--json'] : [])],
    jsonOutput: (a) => a.json === true,
  },
  {
    name: 'masume_brief',
    title: '指令書を読む',
    description: 'キャラクターの指令書を読む。いまのマス・やること・判定コマンド・縄張り・見えている先のマスが書いてある。作業の前にまず読む。',
    readOnly: true,
    properties: {
      character: str('キャラクターのID（例: engine）'),
      json: { type: 'boolean', description: 'true なら指令書の JSON を返す' },
    },
    required: ['character'],
    argv: (a) => ['brief', ...(a.json ? ['--json'] : []), '--', a.character],
    jsonOutput: (a) => a.json === true,
  },
  {
    name: 'masume_check',
    title: '宣言判定',
    description: '宣言判定する。キャラクターまたはゲートの判定（E2E）を走らせ、成功すれば次のマスへ進み、失敗すれば判定失敗として出力の末尾を返す。no_boss を true にすると、あがりに着く宣言でボス戦を省く。',
    properties: {
      target: str('キャラクターIDまたはゲートID'),
      as: str('宣言する者のID（既定は target）'),
      no_boss: { type: 'boolean', description: 'true ならボス戦を省いて宣言する' },
    },
    required: ['target'],
    argv: (a) => ['check', `--as=${a.as ?? a.target}`, ...(a.no_boss ? ['--no-boss'] : []), '--', a.target],
  },
  {
    name: 'masume_stamp',
    title: 'ハンコを押す',
    description: '人間のマスにハンコを押す。人間のキャラクターだけが押せる。',
    properties: {
      node: str('ハンコを押すマスのID'),
      as: str('ハンコを押す人間のキャラクターID'),
    },
    required: ['node', 'as'],
    argv: (a) => ['stamp', `--as=${a.as}`, '--', a.node],
  },
  {
    name: 'masume_note',
    title: '日誌を書く',
    description: '冒険の書に日誌を書く。次の自分（や仲間）への申し送りを残す。',
    properties: {
      character: str('日誌を書くキャラクターのID'),
      text: str('申し送りの本文'),
      as: str('書く者のID（既定は character）'),
    },
    required: ['character', 'text'],
    argv: (a) => ['note', `--as=${a.as ?? a.character}`, '--', a.character, a.text],
  },
  {
    name: 'masume_log',
    title: '冒険の書を読む',
    description: '冒険の書（イベントの記録）の末尾を読む。何が起きたかをさかのぼれる。',
    readOnly: true,
    properties: { tail: { type: 'integer', minimum: 0, description: '末尾から何件読むか（既定 20）' } },
    required: [],
    argv: (a) => ['log', `--tail=${a.tail ?? 20}`],
  },
  {
    name: 'masume_jumon',
    title: 'ふっかつのじゅもん',
    description: 'いまのふっかつのじゅもん（セーブの合言葉）を教える。',
    readOnly: true,
    properties: {},
    required: [],
    argv: () => ['jumon'],
  },
  {
    name: 'masume_verify',
    title: '冒険の書の検証',
    description: '冒険の書（セーブデータ）が壊れていないか検証する。jumon を渡すと、そのじゅもんの記録があるかも調べる。',
    readOnly: true,
    properties: { jumon: str('調べたいふっかつのじゅもん') },
    required: [],
    argv: (a) => ['verify', ...(a.jumon !== undefined ? [`--jumon=${a.jumon}`] : [])],
  },
  {
    name: 'masume_quest',
    title: '願いから冒険をはじめる',
    description: '「メモアプリのようなアプリを作りたい」のような願いから、GM の LLM に地図をつくらせて冒険をはじめる。時間がかかる。冒険の書がすでにあるときは失敗する。allow_listen は、判定が 127.0.0.1 にサーバーを立てられるように Codex の箱のソケットを開ける。ゲームはローカルのままだが、Codex の設定は localhost だけに絞れないため、エージェントはインターネットにも出られる。codex にだけ効き、生まれた冒険の出撃にも設定を引き継ぐ。',
    properties: {
      wish: str(`作りたいものの願い（前後の空白を除いて1〜${MAX_WISH}コードポイント）`),
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
    title: tool.title,
    description: tool.description,
    inputSchema: { type: 'object', properties: tool.properties, required: tool.required },
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
