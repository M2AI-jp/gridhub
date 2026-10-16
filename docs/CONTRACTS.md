# 契約書（CONTRACTS） — モジュール間の約束

各キャラクター（モジュール担当）は、この契約だけを頼りに並行して作る。結合ゲートでこの契約が守られているかが判定される。
契約を変えたいときは GM に依頼する（自分で変えない）。

- 実行環境: Node.js 20 以上、ESM（`"type": "module"`）、**外部パッケージなし**（標準ライブラリだけ）。
- 文字コード UTF-8、改行 LF。ユーザー向けの文言は日本語。

---

## 1. リポジトリと縄張り

| 縄張り | 持ち主 |
| --- | --- |
| `docs/**` `tests/**` `schema/**` `bin/**` `quests/masume.map.json` `AGENTS.md` `README.md` `package.json` | GM（判定と契約。キャラクターは編集禁止） |
| `src/engine/**`、`src/commands/{new,validate,seal,check,stamp,status,brief,log,verify,repair,jumon,note,amend,load}.js` | 書記 `engine` |
| `src/server/**`、`src/commands/serve.js` | 伝令 `server` |
| `src/linear/**`、`src/commands/{export,import}.js`、`quests/kotozuke.*`、`quests/tutorial/**` | 地図職人 `gmkit` |
| `web/assets/sprites/**`、`web/assets/icons/**`、`web/assets/sheet.html` | 絵師 `assets` |
| `web/**`（上の絵師の場所を除く） | 盤面 `board`（賢者クロード） |

### サブコマンドの形

`bin/masume.js` が `src/commands/<name>.js` を読み込み、次を呼ぶ:

```js
export async function run(argv /* string[] */, ctx /* {bin, root, cwd, env} */) { return 0; /* 終了コード */ }
```

- `ctx.bin` = `bin/masume.js` の絶対パス、`ctx.root` = リポジトリの絶対パス（ゲームのルートではない）。
- 例外に `code`（例 `'E_UNSEALED'`）と `exitCode` を付けて投げると、受付係が `[E_UNSEALED] メッセージ` を stderr に出して終了する。
- 終了コード: `0` 成功 / `1` 判定失敗・地図が不正 / `2` 使い方の誤り・前提不足（未封印・待機中など） / `3` 冒険の書が呪われている。
- 共通オプション: `--dir <root>`、`--as <actor>`、`--json`（機械向け出力。stdout に JSON だけを出す）。

---

## 2. 地図（map）

```jsonc
{
  "masume": 1,
  "quest": { "id": "MSM", "title": "マスメ", "pitch": "一言で", "goal": "GOAL" },
  "characters": [
    {
      "id": "engine",                // /^[a-z][a-z0-9-]{0,23}$/
      "name": "書記",
      "kind": "agent",               // "agent" | "human"
      "agent": "codex",              // 任意。codex / claude / human など
      "job": "scribe",               // 絵の種類（§10 の12職業）
      "color": "yellow",             // 蛍光ペン（§10 の8色）
      "module": "セーブデータとルール", // 任意。担当モジュールの説明
      "territory": ["src/engine/**"], // 任意。縄張り（globの配列）
      "path": ["E1", "E2", "C1", "E3", "G1", "GOAL"]  // 一方通行の道
    }
  ],
  "nodes": {
    "E1": {
      "type": "task",                // "task" | "gate" | "camp"
      "title": "冒険の書をひらく",      // 1〜80文字
      "detail": "やることと合格条件",    // 任意
      "check": { "kind": "cmd", "run": "node --test tests/e2e/E1.test.mjs", "seal": ["tests/e2e/E1.test.mjs"] },
      "xp": 1,                       // 任意。0〜10。既定 task 1 / gate 3 / camp 0
      "rollback_to": "@camp",        // 任意。task のみ。"@camp"(既定) | "@here" | 同じ道の前のマスID
      "estimate": 3,                 // 任意（Linear の見積もり）
      "labels": ["engine"]           // 任意
    },
    "H1": { "type": "task", "title": "遊んでみる", "check": { "kind": "stamp", "by": "player" } },
    "C1": { "type": "camp", "title": "宿屋" },
    "G1": { "type": "gate", "title": "結合: 盤面に冒険が映る", "check": { "kind": "cmd", "run": "…", "seal": ["…"] } }
  }
}
```

- ゲートのメンバー = そのゲートIDを `path` に含むキャラクター全員（地図には書かない）。
- ゲートのメンバーは2人以上。ただし**キャラクターが1人だけの地図では、あがり（`quest.goal`）のゲートはメンバー1人でよい**（1人の冒険も、あがりの結合E2Eで終わる）。goal 以外のゲートは、1人だけの地図でも2人以上が必要（つまり1人だけの地図に置けるゲートはあがりだけ）。
- `check.seal` は判定ファイルの一覧（ルートからの相対パス）。空配列・省略なら、判定は地図に書かれたコマンドだけで成立し、封印イベントは不要。
- `check.kind: "stamp"` は task だけ。`by` は `kind: "human"` のキャラクターID。gate と camp は stamp にできない。

### 検証（`validateMap` / `masume validate`）のエラーコード

| code | 条件 |
| --- | --- |
| `E_FORMAT` | `masume !== 1`、quest/characters/nodes の形・型が違う、必須項目がない、title が空や80文字超、quest.id が `/^[A-Z][A-Z0-9]{1,9}$/` でない |
| `E_ID` | キャラクターIDやマスIDの形が違う（マスID `/^[A-Za-z][A-Za-z0-9_-]{0,31}$/`） |
| `E_DUP_CHAR` | キャラクターIDの重複 |
| `E_UNKNOWN_NODE` | `path` に存在しないマスID |
| `E_DUP_IN_PATH` | 1つの `path` に同じマスが2回 |
| `E_SHARED_TASK` | task / camp が2つ以上の `path` に出てくる |
| `E_GATE_MEMBERS` | gate が2つ未満の `path` にしか出てこない（例外: キャラクターが1人だけの地図で、`quest.goal` のゲートがその1人の `path` に出てくるときはエラーにしない） |
| `E_ORPHAN` | どの `path` にも出てこないマス |
| `E_CYCLE` | 全 `path` の「前→次」をつないだグラフに閉路がある（ゲートの順番が道ごとに食い違うなど） |
| `E_CHECK` | task/gate に check が無い・形が違う、camp に check がある、gate が stamp、stamp の by が人間でない |
| `E_ROLLBACK` | rollback_to が task 以外にある、`@camp`/`@here`/同じ道の前のマス 以外 |
| `E_GOAL` | quest.goal が無い・gate でない・全キャラクターの `path` の最後でない |

警告（エラーではない）: `W_JOB`（知らない職業）、`W_COLOR`（知らない色）。

`validateMap(map)` は `{ ok, errors:[{code, path, message}], warnings:[{code, path, message}] }` を返す。
`masume validate <file>` は1件1行 `[CODE] path: message` を出し、エラーがあれば終了コード1。`--json` なら上のオブジェクト。

---

## 3. CLI

| コマンド | 担当 | 挙動 |
| --- | --- | --- |
| `new <map> [--force]` | 書記 | 地図を検証（エラーなら1）→ `.masume/` を作る（既にあれば `--force` なしで `E_EXISTS`/2）→ genesis → **seal ファイルが存在するマスを自動封印**（マスごとに `sealed`）。stdout に `ふっかつのじゅもん: <じゅもん>` を含める |
| `validate <map>` | 書記 | §2 |
| `seal <nodeId…>` / `seal --all` | 書記 | 指定したマスの封印。ファイルが無ければ `E_SEAL_MISSING`/2（何も記録しない）。`--all` は seal を持つマスのうち**ファイルがそろっているものだけ**を封印し、そろっていないマスは「保留」として表示して飛ばす（終了コード0） |
| `check <characterId\|gateId> [--no-boss]` | 書記 | §4.3〜4.5。成功0 / 判定失敗1 / 前提不足2 |
| `stamp <nodeId> --as <humanId>` | 書記 | §4.6 |
| `status [--json]` | 書記 | 人間向けの盤面要約。`--json` は §5 のビュー |
| `brief <characterId> [--json]` | 書記 | §6 の指令書 |
| `log [--tail N] [--json]` | 書記 | イベント一覧（`--json` はイベント行の配列） |
| `verify [--jumon "…"] [--json]` | 書記 | SAVE_FORMAT §6。正常なら `冒険の書は正常です`（0）、呪いなら `呪われています` と最初の seq（3）。`--jumon` はそのじゅもんのイベントがあれば0、無ければ1。`--json` は `{ok, errors:[{seq, code, message}], warnings, head:{seq, hash, jumon}}`（`--jumon` 付きなら `found: {seq}|null` も） |
| `repair` | 書記 | SAVE_FORMAT §6 |
| `jumon [--json]` | 書記 | 現在のじゅもん。stdout の最後の行はじゅもんだけ（`--json` は `{seq, hash, jumon}`） |
| `note <characterId> <text…>` | 書記 | `note` イベント（残りの引数を半角スペースでつないだものが text）。知らないキャラは `E_UNKNOWN`/2 |
| `amend <map>` | 書記 | §4.8 |
| `load <seq\|じゅもん>` | 書記 | §4.9 |
| `serve [--port 5005] [--host 127.0.0.1]` | 伝令 | §8。起動したら stdout に `盤面: http://127.0.0.1:<port>/` を出して動き続ける。`--port 0` は空きポート |
| `export linear [--format csv\|json] [--out file]` | 地図職人 | §9 |
| `import linear <csv> --out <map.json> [--quest-id KEY] [--title T]` | 地図職人 | §9 |

エラーは `[CODE] メッセージ` の形で stderr に出す（受付係に任せてよい）。使うコード:
`E_USAGE` `E_NO_GAME`（冒険の書が見つからない） `E_EXISTS` `E_INVALID_MAP` `E_UNKNOWN`（そんなキャラ/マスはない） `E_UNSEALED` `E_SEAL_BROKEN` `E_SEAL_MISSING` `E_NEEDS_STAMP` `E_STAMP` `E_PARTY_INCOMPLETE` `E_DONE`（もうあがっている） `E_CONFLICT` `E_CURSED` `E_AMEND_HISTORY` `E_LOAD`。

判定に失敗したときは、落ちたマスの判定出力の末尾（最大40行）も stdout に出す（なぜ落ちたかをその場で読めるように）。

判定まわりの stdout には次の言葉を含める（人間と LLM が読むため）:
成功 `判定成功` / 失敗 `判定失敗` / ゲート勝利 `結合ゲート突破` / ゲート敗北（全員）`全滅` / ゲート敗北（一部）`差し戻し` / 封印破り `封印が破れています` / 未封印 `未封印` / ハンコ待ち `ハンコ` / 仲間待ち `揃っていません`。

---

## 4. ルール（再生で導く状態）

### 4.1 キャラクターの状態

| 項目 | 意味 |
| --- | --- |
| `pos` | いまいる `path` の添字。`path.length` ならあがり（done） |
| `level` / `xp` | 初期 1 / 0。`xp_next = level + 1`。xp が xp_next 以上ならレベルアップ（xp -= xp_next、最大 Lv9） |
| `checkpoint` | `pos` より前で最後に通過した camp か gate の添字。無ければ -1（ふりだし） |
| `status` | `working`（task の上）/ `waiting`（gate の上）/ `done` |
| `clears` / `fails` | 判定成功で通過したマス数（再検証も含む）/ 失敗回数 |
| `epoch` | このキャラクターの状態が変わるたびに +1（楽観ロック用） |

`vision = min(level - 1, 4)`。

マスの状態: 通過済み（cleared）の集合、消された（stale）の集合、封印（node → {path: sha256}）、`clears`/`fails` 回数。

### 4.2 到着処理

`pos` が進んだら、`path[pos]` が camp の間はそれを cleared にして `checkpoint = pos`、`pos++` を繰り返す。
`path[pos]` が gate なら `status = waiting`、task なら `working`、末尾を越えたら `done`。

### 4.3 宣言判定（task）

`check <characterId>` で、キャラクターが task の上にいるとき:

1. マスが stamp なら `E_NEEDS_STAMP`/2。
2. **区間** = 添字 `checkpoint+1 .. pos` の task のうち `kind: "cmd"` のもの（stamp は飛ばす）。
3. 区間の全マスの封印を確かめる。seal が空なら封印済み扱い。`sealed` 記録が無い、または記録のファイル集合が現在の `check.seal` と違う → `E_UNSEALED`/2（記録しない）。
   ファイルのハッシュが違う・ファイルが無い → `seal_broken` を記録して `E_SEAL_BROKEN`/2。
4. 区間のマスの `check.run` を古い順に `/bin/sh -c` で実行（cwd = ルート、環境変数に `MASUME_ROOT` `MASUME_CHARACTER` `MASUME_NODE` を追加、タイムアウト `MASUME_CHECK_TIMEOUT` 秒・既定600）。最初の失敗で止める。
   出力は `=== <nodeId>: <run> ===` の見出しの後に stdout+stderr、最後に `(exit <code>, <ms>ms)`。1マス100KBまで。
5. 全部成功 → `check_passed`。効果: 現在のマスを cleared（stale だったなら stale を外すだけで **xp なし**、そうでなければ xp を得る）、`pos++`、到着処理。
6. 失敗 → `check_failed{failed: F}`。効果:
   - `level = max(1, level-1)`、`xp = 0`、`fails++`
   - 戻り先 `t`: F の `rollback_to` が `@here` → F の添字 / `@camp`（既定）→ `checkpoint+1` / マスID → その添字。ただし `t < checkpoint+1` なら `checkpoint+1`。
   - 添字 `t .. pos-1` で cleared のマスを stale にする（cleared から外す）。`pos = t`、到着処理。

### 4.4 ゲート（合流）

- メンバー全員が `status: waiting` でそのゲートにいる状態を **ready** という。
- `check` / `stamp` の効果でゲートが ready になったら、`--no-boss` が無ければ**そのコマンドの中で続けて**ボス戦（4.5）を行う。
- `check <gateId>`、またはそのゲートで待機中のキャラクターIDでの `check` は、ready ならボス戦、そうでなければ `E_PARTY_INCOMPLETE`/2（来ていない仲間の名前を出す）。

### 4.5 ボス戦

1. ゲートの封印を確かめる（4.3 と同じ）。
2. ゲートの `check.run` だけを実行。
3. 成功 → `gate_cleared`。効果: ゲートを cleared。各メンバー: xp を得る、`pos++`（`checkpoint` はゲート）、到着処理。
4. 失敗 → `gate_failed{blamed}`。blamed = 出力中の `MASUME_BLAME: a,b` 行（カンマ・空白区切り、複数行可）のIDのうちメンバーであるもの。空ならメンバー全員。
   効果: blamed の各メンバー: `level-1`（最低1）、`xp = 0`、`fails++`、`t = checkpoint+1`、添字 `t .. pos-1` の cleared を stale に、`pos = t`、到着処理。
   blamed でないメンバーは待機のまま。

終了コードは、そのコマンドで最後に行った判定の結果（成功0 / 失敗1）。

### 4.6 ハンコ

`stamp <nodeId> --as <humanId>`: マスが stamp の task で、`by === humanId`、持ち主がいまそのマスにいる → `stamped`（効果は 4.3 の5と同じ。そのあとゲートが ready ならボス戦）。それ以外は `E_STAMP`/2。

### 4.7 楽観ロック

判定コマンドを走らせる前に、関係するキャラクター（ゲートならメンバー全員）の `epoch` を覚えておき、追記直前に読み直して違えば `E_CONFLICT`/2（記録しない）。

### 4.8 地図の改訂（amend）

新しい地図を検証（エラーなら `E_INVALID_MAP`/1）したうえで:
- `quest.id` は同じ。既存のキャラクターは消せない（追加はよい）。
- 各キャラクターについて、新しい `path` は古い `path[0 .. pos-1]`（通過済み）と同じIDで始まる。
- 通過済みのマスは、`title` `detail` `labels` `estimate` 以外を変えてはいけない。
- 違反は `E_AMEND_HISTORY`/1。
- 成功 → `.masume/maps/000N.json` を書き、`amended{version:N}` を記録。新しく増えたマス・封印の無いマスのうち seal ファイルが存在するものは自動封印。
- 封印は `{node → files}` で、ファイル集合が新しい `check.seal` と違えば未封印に戻る。

### 4.9 ロード

`load <S>`（seq の数字、またはじゅもん）: `0 <= S < 現在の seq` でなければ `E_LOAD`/2。`loaded{to_seq:S}` を記録。再生では、状態を「seq 0..S を再生した状態」に置き換える。

---

## 5. ビュー（`status --json` / `buildView(root)` / `GET /api/state`）

3つは**同じ JSON** を返す。

```jsonc
{
  "masume": 1,
  "quest": { …地図の quest },
  "map_version": 1,
  "characters": [            // 地図の順
    { …地図のキャラクター全項目,
      "pos": 2, "at": "E2",     // at = path[pos]、done なら null
      "level": 2, "xp": 1, "xp_next": 3, "vision": 1,
      "status": "working",      // working | waiting | done
      "checkpoint": "C1",       // マスID か null
      "clears": 3, "fails": 1,
      "last_note": "…" | null }
  ],
  "nodes": {
    "E1": { …地図のマス全項目（xp は既定値を補う、task には rollback_to の既定 "@camp" を補う）,
      "id": "E1",
      "owner": "engine",        // task/camp の持ち主。gate は null
      "members": ["engine"],    // gate はメンバー、task/camp は [owner]
      "state": "cleared",       // 下の表
      "sealed": true,           // seal 不要なら true
      "seal_broken": false,     // 最新の seal_broken が最新の sealed より新しい
      "clears": 1, "fails": 0,  // そのマスで成功した回数 / そのマスが原因で失敗した回数（failed や gate）
      "last_seq": 12 }          // そのマスに関する最新イベントの seq か null
  },
  "log": [ { "seq": 0, "ts": "…", "type": "genesis", "actor": "gm",
             "character": null, "node": null, "ok": null, "text": "冒険の書がひらかれた" } ],  // 古い順、最新200件
  "head": { "seq": 12, "hash": "…", "jumon": "ゆうて いみや おうき むこう" },
  "integrity": { "ok": true, "errors": [] },
  "finished": false           // goal が cleared
}
```

`log[].character` / `node` はイベントの主役（gate のイベントなら `node` = gate、`character` = null）。`ok` は成功 true / 失敗 false / それ以外 null。`text` は人間向けの日本語1行。

### マスの state（上から順に最初に当てはまるもの）

| type | state |
| --- | --- |
| task / camp | `cleared` → `stale` → `current`（持ち主の pos）→ `open`（持ち主より前方 vision マス以内）→ `fog` |
| gate | `cleared` → `ready`（全員待機）→ `waiting`（1人以上待機）→ `open`（いずれかのメンバーの vision 以内）→ `fog` |

---

## 6. 指令書（`brief <id> --json`）

```jsonc
{
  "jumon": "…", "seq": 12,
  "character": { "id", "name", "kind", "module", "territory", "level", "xp", "xp_next", "vision", "status" },
  "current": { "id", "type", "title", "detail", "check", "sealed", "seal_broken", "rollback_to" } | null,
  "visible": [ { "id", "type", "title" } ],   // current の先、vision マスまで
  "fog": 3,                                     // それより先に残っているマスの数
  "party": [ { "id", "name", "at", "status", "level" } ],  // 自分以外
  "waiting_for": ["server"],                    // gate で待機中なら、まだ来ていない仲間
  "notes": [ { "seq", "ts", "text" } ],          // 自分の日誌、新しい順に最大5件
  "rules": [ "現在のマスだけをやる", … ]          // 守ること（日本語）
}
```

テキスト版（`--json` なし）も同じ内容を日本語で出す。**視界の外のマスのタイトルを出してはいけない。**

---

## 7. エンジンのモジュール API（`src/engine/index.js`）

伝令・地図職人・盤面はこれだけを使う。

```js
export class MasumeError extends Error { /* code, exitCode */ }
export function findRoot(startDir)                       // → string | null
export function validateMap(map)                         // → { ok, errors, warnings }
export function newGame(root, mapPath, { actor, force }) // → { head }
export function buildView(root)                          // → §5 のビュー（呪いなら integrity.ok=false で可能な限り返す）
export function brief(root, characterId)                 // → §6
export async function check(root, target, { actor, boss = true })      // → { exitCode, events }
export async function stamp(root, nodeId, { actor, as, boss = true })  // → { exitCode, events, ready: gateId|null }
export function seal(root, nodeIds /* string[] | 'all' */, { actor })  // → { events }
export function appendEvent(root, type, data, { actor }) // → 追記したイベント
export function verify(root)                             // → { ok, errors, warnings, head }
export function repair(root)                             // → { kept, moved, file }
export function jumonOf(hashHex)                         // → "ゆうて いみや おうき むこう"
export function logFile(root)                            // → <root>/.masume/log.jsonl の絶対パス
export function outputFile(root, seq)                    // → 出力ファイルの絶対パス | null
export function amend(root, mapPath, { actor })
export function load(root, seqOrJumon, { actor })
```

`stamp(..., { boss: false })` の戻り値 `ready` は、ハンコの結果 ready になったゲートID（なければ null）。

---

## 8. 伝令（`src/server/index.js`）

```js
export function createServer({ webRoot, getView, watchFile, onStamp, onBattle, outputFor })  // → http.Server（未listen）+ stop()
export async function startServer({ root, port = 5005, host = '127.0.0.1', webRoot })     // → { server, url, port, stop }
```

- `createServer` が返す `http.Server` には `stop(): Promise<void>` を足す（監視・SSE接続・サーバーを全部閉じる）。
- `getView` は同期でも Promise を返してもよい。
- `startServer` は engine を使って上を組み立てる（`webRoot` 既定 = リポジトリの `web/`、`watchFile` = `logFile(root)`）。

| メソッド パス | 内容 |
| --- | --- |
| `GET /` と静的ファイル | `webRoot` から配る。`index.html`。MIME: html/css/js(mjs)/json/svg/png/woff2/txt。ディレクトリの外は 403 か 404 |
| `GET /api/state` | `getView()` の JSON。`Cache-Control: no-store`。例外は 500 `{ok:false, code, error}` |
| `GET /api/health` | `{ok:true, masume:1}` |
| `GET /api/stream` | Server-Sent Events。接続時 `event: hello`、`watchFile` が変わるたびに `event: change`（data は JSON）。15秒ごとに `: ping` |
| `GET /api/output/:seq` | `outputFor(seq)` の文字列を `text/plain; charset=utf-8` で。null なら 404、数字でなければ 400 |
| `POST /api/stamp` | body `{node, as}` → `onStamp({node, as})` の結果を JSON で 200。`startServer` では engine の `stamp(boss:false)` を呼び、ready になったゲートがあれば `bin/masume.js check <gate> --dir <root> --as gm` を**別プロセスで**起動して `{ok:true, ready:<gate>}` を返す |
| `POST /api/battle` | body `{gate}` → `onBattle({gate})`。`startServer` では ready なら上と同じく別プロセスでボス戦、そうでなければ 409 |

- POST は `X-Masume: 1` ヘッダ必須（無ければ 403）。`Origin` ヘッダがあってホストと違えば 403。JSON が壊れていれば 400。
- `onStamp`/`onBattle` が `code` 付きの例外を投げたら 409 `{ok:false, code, error}`。

---

## 9. Linear との文通（`src/linear/**`）

### export

`masume export linear [--format json|csv] [--out file]`（既定 json、stdout）。task と gate だけを1件ずつ（camp は出さない）。

| 列 | 内容 |
| --- | --- |
| `ID` | マスID |
| `Title` | title |
| `Description` | detail + 空行 + `判定: \`<run>\``（stamp なら `判定: <名前>のハンコ`） |
| `Status` | cleared→`Done` / current→`In Progress` / waiting・ready→`In Review` / stale・open→`Todo` / fog→`Backlog` |
| `Assignee` | 持ち主の name。gate はメンバーの name を ` & ` でつなぐ |
| `Project` | quest.title |
| `Milestone` | 持ち主の道で、そのマス以降にある最初の gate の title（gate はそれ自身） |
| `Labels` | labels + 持ち主ID（gate は `gate`）+ stale なら `要再検証`。CSV ではカンマ区切りの1セル |
| `Estimate` | estimate（無ければ空） |

JSON は `[{ "ID", "Title", "Description", "Status", "Assignee", "Project", "Milestone", "Labels": [..], "Estimate" }]`。
CSV は1行目が `ID,Title,Description,Status,Assignee,Project,Milestone,Labels,Estimate`、RFC 4180 のクォート。

### import

`masume import linear <csv> --out <map.json> [--quest-id KEY] [--title T]` — Linear の CSV（列名は大文字小文字を区別せず `ID`/`Identifier`、`Title`、`Description`、`Status`、`Assignee`、`Labels`、`Estimate`、`Created`/`Created At`、`Project` を探す）から**地図の下書き**を作る。

- `Status` が done / canceled / cancelled / completed / duplicate（大文字小文字無視）の issue は省き、件数を quest.pitch に書く。
- Assignee ごとに1キャラクター（出てきた順）。空は `nanashi`（名前「名無し」）。ID は名前を小文字英数字にしたもの、作れなければ `c1`,`c2`…。`kind:"agent"`、job と color は §10 の順に巡回。
- Labels に `E2E` か `gate`（大文字小文字無視）を含む issue は **gate**。メンバー = その issue より `Created` が前の task を持つキャラクター + その issue の Assignee のキャラクター。2人未満なら普通の task。
- 各道の並びは `Created` の昇順（同じなら ID の数字部分の昇順）。gate は、各メンバーの道で「それより前に作られた task」の後に置く。
- 最後に `GOAL`（使われていれば `GOAL-1`）「あがり」を全キャラクターの最後に置く。`quest.goal` はそれ。
- 担当者が1人だけ（残った issue の Assignee がすべて同じ、またはすべて空で `nanashi` だけ）なら、キャラクターは1人で、`GOAL` のメンバーも1人になる（§2 の例外により有効）。このとき `E2E`/`gate` ラベルの issue はメンバーが2人未満なので普通の task になる。
- 判定はすべて仮置き `{"kind":"cmd","run":"echo \"TODO(GM): <ID> のE2E判定を書く\" && exit 1","seal":[]}`（GM が本物に差し替えるまで通らない）。
- quest.id は `--quest-id`、無ければ最初の ID の `-` の前を大文字に。title は `--title` > 最初の行の Project > 「インポートした冒険」。
- 出力した地図は `validateMap` に通ること。

---

## 10. 絵（`web/assets/**`）

### 12の職業（`job`）と並び順

`hero` 勇者 / `warrior` 戦士 / `mage` 魔法使い / `priest` 僧侶 / `thief` 盗賊 / `merchant` 商人 / `sage` 賢者 / `scribe` 書記 / `herald` 伝令 / `cartographer` 地図職人 / `painter` 絵師 / `villager` 村人

### 8色（蛍光ペン `color`）

`yellow #ffe45c` / `pink #ff8fc7` / `green #8ee28a` / `blue #7cc7ff` / `orange #ffb35c` / `purple #c9a2ff` / `mint #7fe3d0` / `gray #c8c8c8`

### インク

ボールペン紺 `#1d2b5c` / 赤ペン `#d94a3a` / 白 `#ffffff`

### 駒の絵（`web/assets/sprites/<job>.svg`）

- 方眼ノートにボールペンで描いた、ちびキャラの立ち絵（台座つき）。線は丸い端、手描きのゆらぎ。
- `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">`、6000バイト以下。
- 使ってよい要素: `svg g path circle ellipse rect line polyline polygon title desc`。`<title>` に日本語の職業名。
- 使ってはいけないもの: `style` 属性、`<style>`、`<script>`、`<text>`、`<image>`、`<foreignObject>`、`href`、外部参照。
- `fill`/`stroke` の値は `none` `#1d2b5c` `#ffffff` `#d94a3a` `var(--pawn, #ffe45c)` のどれか。体の塗りに `fill="var(--pawn, #ffe45c)"` を必ず使う（盤面が担当色に塗り替える）。
- `stroke-width` は 3 以下。描画要素は4つ以上。12枚はすべて違う絵。
- `web/assets/sprites/index.json` = `{"jobs":[{"id":"hero","name":"勇者"}, …]}`（上の順で12件）。

### 道具の絵（`web/assets/icons/<id>.svg`）

`sword` 剣 / `shield` 盾 / `key` 鍵 / `scroll` 巻物 / `chest` 宝箱 / `flag` 旗 / `inn` 宿屋 / `crown` 王冠 / `potion` 薬 / `map` 地図 / `bell` 鐘 / `lantern` ランタン

- 駒と同じ制約。ただし `var(--pawn, #ffe45c)` は必須ではなく、`#ffe45c` も使ってよい。
- `web/assets/icons/index.json` = `{"icons":[{"id":"sword","name":"剣"}, …]}`（上の順で12件）。
- `web/assets/sheet.html` = 24枚を並べて見られる一覧ページ（方眼の背景）。

---

## 11. 盤面（`web/`）

- `web/index.html` が盤面。通常は `/api/state` と `/api/stream` を使う。
- `?fixture=<name>` のときは `web/fixtures/<name>-state.json` を読む（サーバー無しで見られる）。
- 駒は `web/assets/sprites/<job>.svg` があれば使い、無ければ手描き風の丸い駒で代用する。

---

# 第2章の契約 —「xxxのようなアプリを作りたい」から、エージェントたちがあがるまで

第1章で、ルール・冒険の書・盤面ができた。第2章では、それを**製品の流れ**にする。

```
願い（masume quest / 盤面の入口） → GM の LLM が地図と最初の判定を書く → 冒険の書が生まれる
 → パーティ出撃（masume party / 盤面の出撃ボタン） → キャラクターごとにエージェントが出撃し、1マスずつ進む
 → ゲートでボス戦（パーティが自動で） → 人間のハンコ → あがり
```

縄張り（第2章で増えるもの）:

| 縄張り | 持ち主 |
| --- | --- |
| `src/engine/**`、`src/commands/{sortie,return,wish}.js`（と既存の書記のコマンド） | 書記 `engine` |
| `src/server/**`、`src/commands/serve.js` | 伝令 `server` |
| `src/quest/**`、`src/commands/quest.js` | 語り部 `teller`（新） |
| `src/party/**`、`src/commands/party.js` | 軍師 `party`（新） |
| `src/linear/**`、`src/commands/{export,import,linear}.js` | 地図職人 `gmkit` |
| `web/assets/marks/**` | 絵師 `assets` |
| `web/index.html`、`web/board/**`、`web/fixtures/**` | 盤面 `board`（賢者クロード） |
| `tests/**`（`tests/helpers2.mjs` を含む）、`docs/**`、`bin/**`、`quests/masume.map.json` ほか | GM |

`bin/masume.js` の受付係には、GM が `sortie` `return` `wish` `quest` `party` `linear` を足しておく。

## 12. 出撃の記録（書記）

### イベント（SAVE_FORMAT に追加）

| type | data | 意味 |
| --- | --- | --- |
| `wish` | `{text, gm, model}` | 冒険の始まりの願い（`gm` は `claude` / `codex` / `cmd`、`model` は文字列か null） |
| `sortie` | `{character, node, agent, model}` | キャラクターにエージェントが出撃した（`node` = そのときの `at`、`agent` は `claude` / `codex` / `cmd` / 自由な名前、`model` は文字列か null） |
| `returned` | `{sortie, character, node_before, node_after, advanced, code, output, output_hash}` | 出撃したエージェントが帰還した。`sortie` = 出撃イベントの seq、`node_after` = 帰還時の `at`（あがりなら null）、`advanced` = 出撃時より `pos` が進んでいる（またはあがった）、`code` = エージェントの終了コード、`output` = `outputs/sortie-<出撃のseq 6桁>.log`（エージェントの出力。先にファイルを書いてから追記する） |

- これらは盤面の状態（位置・レベル）を変えない。再生では無視してよい（ビューにだけ使う）。
- `verify` は第1章どおり、`output` を持つイベントの出力ファイルとハッシュを確かめる。

### ビュー（§5 に追加）

- `characters[].sortie` … いま出撃中なら `{seq, agent, model, node, since}`（`since` = 出撃イベントの ts）、そうでなければ `null`。出撃中 = その `sortie` イベントの seq を `data.sortie` に持つ `returned` がまだ無い。
- `characters[].sorties` … そのキャラクターの `sortie` イベントの数。
- `log[].text`: `wish` →「願い: <text>」、`sortie` →「<名前> が出撃した（<agent>[ <model>]）」、`returned` →「<名前> が帰還した（<node_before> → <node_after か あがり>、進んだ / 進めなかった）」。`ok` は `sortie`/`wish` は null、`returned` は `advanced`。
- `brief`（テキスト）は出撃中なら「出撃中: <agent>（seq N から）」の行を出す。`brief --json` に `sortie` を足す（ビューと同じ形か null）。

### CLI

| コマンド | 挙動 |
| --- | --- |
| `sortie <characterId> --agent <name> [--model M]` | `sortie` を記録して seq を出す。知らないキャラ `E_UNKNOWN`/2、人間 `E_USAGE`/2、あがり済み `E_DONE`/2、すでに出撃中 `E_BUSY`/2 |
| `return <characterId> --sortie <seq> --code <n> [--log <file>]` | `outputs/sortie-<seq>.log` に `--log` の中身（無ければ空）を書き、`returned` を記録する。`node_before` は出撃イベントの `node`、`advanced` は出撃時点の `pos`（seq までを再生した状態）と今の `pos` を比べる。その出撃がすでに帰還済み・存在しない・別のキャラなら `E_USAGE`/2 |
| `wish <text…> [--gm G] [--model M]` | `wish` を記録する |

モジュール API（`src/engine/index.js`）に足す:

```js
export function recordSortie(root, characterId, { actor = 'party', agent, model = null })        // → event
export function recordReturn(root, characterId, { actor = 'party', sortie, code, log = '' })     // → event
export function recordWish(root, { actor = 'gm', text, gm = null, model = null })                // → event
```

## 13. 軍師（パーティ出撃）

`masume party [--agent claude|codex|cmd:<command>] [--model M] [--parallel N] [--rounds R] [--only id,id] [--dry-run] [--dir D]`

- 既定: `--agent claude`、`--model` なし（claude は `sonnet`）、`--parallel 3`、`--rounds 40`。`<root>/.masume/party.json`（`{agent, model, parallel}`）があればその値が既定になる。
- 環境変数 `MASUME_AGENT_OVERRIDE` があれば、`--agent` に関係なくそれを使う（テストや社内ラッパー用）。

### 1巡の流れ

1. ビューを読む。`finished` なら `あがり！` を出して終了コード 0。
2. ready なゲートがあれば、パーティ自身がボス戦をする（エンジンの `check(root, gateId, {actor: 'party'})` か CLI）。結果を出す。
3. 候補 = `kind: agent`・`status: working`・出撃中でない・`--only` に含まれる（指定時）・**迷子**でないキャラクター。
   迷子 = この `party` の実行中に、進めずに帰還したことが2回続いたキャラクター。
4. 候補もなく、出撃中もいなければ止まる。理由を出して終了コード 2:
   人間のハンコ待ちのマスがあれば `ハンコ待ち: <マスID>…`、迷子がいれば `迷子: <キャラID>…`、`--rounds` を使い切ったら `巡回の上限`。
5. 出撃中が `--parallel` 未満の間、候補を1人ずつ出撃させる（1キャラにつき同時に1エージェント）:
   `sortie` を記録 → エージェントを起動 → 終了したら出力を `outputs/sortie-<seq>.log` に書き → `returned` を記録 → 1. に戻る。
6. 帰還1回を1巡と数える。

`SIGINT`/`SIGTERM` を受けたら、出撃中のエージェントを止め、それぞれ `code: 130` で `returned` を記録して終了コード 130。

### エージェントの起動（アダプタ）

| agent | コマンド（cwd = ゲームのルート、プロンプトは stdin） |
| --- | --- |
| `claude` | `claude -p --model <M または sonnet> --permission-mode bypassPermissions` |
| `codex` | `codex exec -C <root> -s workspace-write --skip-git-repo-check [-m <M>] -` |
| `cmd:<command>` | `/bin/sh -c <command>` |

すべてのエージェントに環境変数 `MASUME_DIR`（ゲームのルート）、`MASUME_BIN`（`bin/masume.js` の絶対パス）、`MASUME_CHARACTER`、`MASUME_NODE`（出撃時の `at`）、`MASUME_PROMPT_FILE`（プロンプトを書いたファイル）を渡す。
1回の出撃のタイムアウトは `MASUME_SORTIE_TIMEOUT` 秒（既定 3600）。超えたら止めて `code: 124`。出力は stdout+stderr を最大 200KB。

`--dry-run` は何も記録・起動せず、候補ごとに `出撃予定: <キャラID> <コマンド>` とプロンプトの先頭を出して終了コード 0。

### プロンプト（日本語）に必ず入れること

- キャラクターの名前と ID、`masume brief <id>` のテキスト全文
- 守ること: 現在のマスだけをやる / 縄張り（territory）の外を編集しない / 封印された判定ファイルと地図を編集しない / git の書き込み操作をしない
- 宣言判定のコマンドをそのまま: `node "<MASUME_BIN>" check <id> --as <id> --no-boss --dir "<root>"`（ゲートのボス戦はパーティがする）
- 日誌のコマンド: `node "<MASUME_BIN>" note <id> "<申し送り>" --as <id> --dir "<root>"`
- 止まる条件: 現在のマスを1つ突破したら、または宣言判定に2回失敗したら、そこで止まって短く報告する

## 14. 語り部（願いから冒険をつくる）

`masume quest "<願い>" [--gm claude|codex|cmd:<command>] [--model M] [--dir D] [--force] [--retries N] [--dry-run]`

- ルート = `--dir`（無ければ作る）かカレント。冒険の書があれば `--force` なしで `E_EXISTS`/2。
- 環境変数 `MASUME_GM_OVERRIDE` があれば、`--gm` に関係なくそれを使う。
- `<root>/WISH.md` に願いを書く。
- GM のプロンプト（日本語）をつくる。必ず入れること:
  願いの全文 / `docs/GM_GUIDE.md` の全文 / `docs/CONTRACTS.md` の §2（地図）と §10（職業と色） /
  指示「ルートに `quest.map.json` を書く。判定ファイル（E2E）は、パーティが止まらずに進めるよう、**できるだけすべての task と gate の分**を書いて `check.seal` に入れる（少なくとも各エージェントの道の最初の task の分は必ず）。判定はいまは落ちること（まだ何も実装されていない）。本物の外部サービスは使わない。アプリそのものは実装しない」
- GM を起動する（§13 と同じアダプタ。cwd = ルート、プロンプトは stdin。環境変数 `MASUME_DIR` `MASUME_BIN` `MASUME_WISH` `MASUME_PROMPT_FILE`）。GM の出力は `<root>/quest.log` に追記する。
- GM が終わったら `quest.map.json` を `validateMap` で検査する。エラーなら、エラー（`[CODE] path: message` の行）と「`quest.map.json` を直して」を書いた追いプロンプトで GM をもう一度起動する（`--retries` 回まで、既定 2）。
- 正しければ `newGame(root, 'quest.map.json')`（存在する判定ファイルは自動で封印）→ `wish` を記録 → 要約（キャラクター・マス・ゲートの数、ふっかつのじゅもん、次の一手 `masume serve` / `masume party`）を出して終了コード 0。
- 直らなければ `E_INVALID_MAP`/1。GM が 0 以外で終わったら `E_GM`/2。地図が書かれなかったら `E_GM`/2。
- `--dry-run` は GM を起動せず、GM のコマンドとプロンプトの先頭を出して終了コード 0（何も書かない）。

## 15. 伝令（入口と出撃の窓口）

- `startServer` は、ルートに冒険の書が**まだ無くても**起動する（ロビー）。そのとき `GET /api/state` は 404 `{ok:false, code:'E_NO_GAME'}`。
  冒険の書が生まれたら `change` を SSE で送る（まだ無いファイルも0.5秒ごとに見張る）。
- `POST /api/quest` `{wish, gm, model?}`（wish 1〜2000文字、gm は `claude`/`codex`）→ 冒険の書があれば 409 `E_EXISTS`、生成中なら 409 `E_BUSY`、それ以外は `masume quest <wish> --dir <root> --gm <gm> [--model M]` を別プロセスで起動して 202 `{ok:true}`。子プロセスの出力は `<root>/quest.log`。
- `GET /api/quest` → `{ok:true, running, code, log}`（`code` は終了コードか null、`log` は `quest.log` の末尾200行）。
- `POST /api/sortie` `{agent, model?, parallel?, only?}`（agent は `claude`/`codex`、parallel は 1〜8、only は キャラIDの配列）→ 冒険の書が無ければ 409 `E_NO_GAME`、出撃中なら 409 `E_BUSY`、それ以外は `masume party --dir <root> --agent <agent> [...]` を別プロセスで起動して 202 `{ok:true}`。出力は `<root>/.masume/party.log`。
- `GET /api/party` → `{ok:true, running, code, log}`（`party.log` の末尾200行）。
- `POST /api/party/stop` → 動いていれば SIGINT を送って `{ok:true, stopped:true}`、いなければ `{ok:true, stopped:false}`。
- これらの POST も X-Masume と Origin の確認をする。HTTP から `cmd:` は受け付けない（400）。
  `MASUME_GM_OVERRIDE` / `MASUME_AGENT_OVERRIDE` はサーバーの環境変数として子プロセスにそのまま渡る（そちらが優先される）。

## 16. 地図職人（Linear と同期する）

`masume linear push [--team KEY] [--project NAME] [--dry-run]` / `masume linear pull --team KEY [--project NAME] --out <map.json>`

- エンドポイント `MASUME_LINEAR_URL`（既定 `https://api.linear.app/graphql`）、`Authorization: <LINEAR_API_KEY>`。キーが無ければ `E_LINEAR_AUTH`/2。
- POST の body は `{query, variables, operationName}`。使う操作（operationName と変数）は次のとおり:

| operationName | 使いみち | variables | 返り値（data の中） |
| --- | --- | --- | --- |
| `MasumeTeams` | チームと状態を引く | `{key}` | `teams.nodes[0] = {id, key, name, states: {nodes: [{id, name, type}]}}` |
| `MasumeProjects` | プロジェクトを探す | `{name}` | `projects.nodes = [{id, name}]` |
| `MasumeProjectCreate` | プロジェクトを作る | `{input: {name, teamIds}}` | `projectCreate = {success, project: {id, name}}` |
| `MasumeIssueCreate` | issue を作る | `{input: {teamId, projectId, title, description, stateId}}` | `issueCreate = {success, issue: {id, identifier, url}}` |
| `MasumeIssueUpdate` | issue を更新する | `{id, input: {title, description, stateId}}` | `issueUpdate = {success, issue: {id, identifier}}` |
| `MasumeIssues` | issue を読む | `{key, project}`（project は null 可） | `issues.nodes = [{identifier, title, description, estimate, createdAt, state: {name, type}, assignee: {name} or null, labels: {nodes: [{name}]}, project: {name} or null}]` |

- push: `--team` は `.masume/linear.json` の `team` か必須。プロジェクト名は `--project` か quest.title（無ければ作る）。task と gate を1件ずつ、
  `.masume/linear.json` の `issues[マスID]` に issue id があれば `MasumeIssueUpdate`、無ければ `MasumeIssueCreate` して id と identifier を保存する。
  title は `[マスID] タイトル`、description は §9 の Description と同じ、state は §9 の Status を Linear の状態に写す:
  `Backlog`→type `backlog`、`Todo`→`unstarted`、`In Progress`→名前が `In Progress` の `started`（無ければ最初の `started`）、`In Review`→名前が `In Review` の `started`（無ければ最初の `started`）、`Done`→`completed`。
  `.masume/linear.json` = `{team, project: {id, name}, issues: {<マスID>: {id, identifier}}}`。stdout に `作成 N件・更新 M件`。
- `--dry-run` は通信せずに、送る予定（マスIDと Status）を出す。
- pull: `MasumeIssues` の結果を §9 の import と同じ規則で地図の下書きにする（Created = `createdAt`、Assignee = `assignee.name`、Labels = `labels.nodes[].name`、Status = `state.name`、ID = `identifier`、Project = `project.name`）。

## 17. 絵師（第2章のしるし）

`web/assets/marks/<id>.svg` と `web/assets/marks/index.json`（`{"marks":[{"id","name"}]}`、次の順で4件）:
`crystal` 水晶玉（願い） / `hourglass` 砂時計（出撃中） / `bubble` ふきだし（考え中） / `horn` 角笛（出撃の合図）。
制約は §10 の道具の絵と同じ（`var(--pawn, #ffe45c)` は必須ではない）。

## 18. 盤面（賢者クロード）

- 冒険の書が無いときは**入口**（ロビー）: 願いの入力欄・GM の選択（claude / codex）・モデル（任意）・「冒険をはじめる」→ `POST /api/quest`。生成中は `GET /api/quest` の様子を見せ、冒険の書が生まれたら盤面に切り替わる。
- **出撃**: なかまの欄の「出撃させる」→ エージェント・モデル・同時に何人・誰を、を選んで `POST /api/sortie`。出撃中は `GET /api/party` の様子と「止める」。
  出撃中のキャラクターの駒には、ふきだしとエージェント名が出る。キャラクターシートに出撃の記録と、帰還ごとの出力へのリンク。
