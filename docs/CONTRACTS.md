# 契約書（CONTRACTS） — モジュール間の約束（GridHub）

> 第11章で名前を **GridHub** に改めた（旧名マスメ）。CLI は `gridhub`、`masume` は別名。冒険の書のフォルダ `.masume/`、環境変数 `MASUME_*`、MCP の道具名 `masume_*`、セーブデータの `masume: 1` は互換のため変えない。第10章までの節に出てくる `masume <command>` は、`gridhub <command>` と同じ意味。

各キャラクター（モジュール担当）は、この契約だけを頼りに並行して作る。結合ゲートでこの契約が守られているかが判定される。
契約を変えたいときは GM に依頼する（自分で変えない）。

- 実行環境: Node.js 20 以上、ESM（`"type": "module"`）、**外部パッケージなし**（標準ライブラリだけ）。
- 文字コード UTF-8、改行 LF。ユーザー向けの文言は日本語。

---

## 1. リポジトリと縄張り

| 縄張り | 持ち主 |
| --- | --- |
| `docs/**` `tests/**` `schema/**` `bin/**` `quests/masume.map.json` `AGENTS.md` `README.md` `package.json` | GM（判定と契約。キャラクターは編集禁止） |
| `src/engine/**`、`src/commands/{new,validate,seal,check,stamp,status,brief,log,verify,repair,note,amend,load,step}.js` | 書記 `engine` |
| `src/server/**`、`src/commands/serve.js` | 伝令 `server` |
| `src/linear/**`、`src/commands/{export,import}.js`、`quests/kotozuke.*`、`quests/tutorial/**` | 地図職人 `gmkit` |
| `web/assets/sprites/**`、`web/assets/icons/**`、`web/assets/sheet.html` | 絵師 `assets` |
| `web/**`（上の絵師の場所を除く） | 盤面 `board`（賢者クロード） |

### サブコマンドの形

`bin/gridhub.js`（第10章までは `bin/masume.js`。いまはその別名）が `src/commands/<name>.js` を読み込み、次を呼ぶ:

```js
export async function run(argv /* string[] */, ctx /* {bin, root, cwd, env} */) { return 0; /* 終了コード */ }
```

- `ctx.bin` = 実際に起動した受付係（`bin/gridhub.js` か `bin/masume.js`）の絶対パス、`ctx.root` = リポジトリの絶対パス（ゲームのルートではない）。
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
| `new <map> [--force]` | 書記 | 地図を検証（エラーなら1）→ `.masume/` を作る（既にあれば `--force` なしで `E_EXISTS`/2）→ genesis → **seal ファイルが存在するマスを自動封印**（マスごとに `sealed`）。stdout の最後の行は記録の目印 `記録: seq <N>`（§52.4） |
| `validate <map>` | 書記 | §2 |
| `seal <nodeId…>` / `seal --all` | 書記 | 指定したマスの封印。ファイルが無ければ `E_SEAL_MISSING`/2（何も記録しない）。`--all` は seal を持つマスのうち**ファイルがそろっているものだけ**を封印し、そろっていないマスは「保留」として表示して飛ばす（終了コード0） |
| `check <characterId\|gateId> [--no-boss]` | 書記 | §4.3〜4.5。成功0 / 判定失敗1 / 前提不足2 |
| `stamp <nodeId> --as <humanId>` | 書記 | §4.6 |
| `status [--json]` | 書記 | 人間向けの盤面要約。`--json` は §5 のビュー |
| `brief <characterId> [--json]` | 書記 | §6 の指令書 |
| `log [--tail N] [--json]` | 書記 | イベント一覧（`--json` はイベント行の配列） |
| `verify [--json]` | 書記 | SAVE_FORMAT §6。正常なら `冒険の書は正常です`（0）、呪いなら `呪われています` と最初の seq（3）。`--json` は `{ok, errors:[{seq, code, message}], warnings, head:{seq, hash, commit}}`（§52.3） |
| `repair` | 書記 | SAVE_FORMAT §6 |
| `note <characterId> <text…>` | 書記 | `note` イベント（残りの引数を半角スペースでつないだものが text）。知らないキャラは `E_UNKNOWN`/2 |
| `amend <map>` | 書記 | §4.8 |
| `load <seq\|commit>` | 書記 | §4.9・§52.5 |
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

`load <S>`（seq の数字、または Git のコミット。§52.5）: `0 <= S < 現在の seq` でなければ `E_LOAD`/2。`loaded{to_seq:S}` を記録。再生では、状態を「seq 0..S を再生した状態」に置き換える。

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
  "head": { "seq": 12, "hash": "…", "commit": "a1b2c3d…" | null },   // §52.3
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
  "seq": 12, "commit": "a1b2c3d…" | null,     // §52.3
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
export function logFile(root)                            // → <root>/.masume/log.jsonl の絶対パス
export function outputFile(root, seq)                    // → 出力ファイルの絶対パス | null
export function amend(root, mapPath, { actor })
export function load(root, seqOrCommit, { actor })      // §52.5
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
- 正しければ `newGame(root, 'quest.map.json')`（存在する判定ファイルは自動で封印）→ `wish` を記録 → 要約（キャラクター・マス・ゲートの数、記録の目印 `記録: seq <N>`（§52.4）、次の一手 `masume serve` / `masume party`）を出して終了コード 0。
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

---

# 第3章の契約 — どの LLM からでも

第2章で、願いからエージェントたちがあがるまでが CLI と盤面で通った。第3章では、それを**どの LLM のクライアントからでも**使えるようにし、Jira とも同期する。

| 縄張り（第3章で増えるもの） | 持ち主 |
| --- | --- |
| `src/mcp/**`、`src/commands/mcp.js`（と既存の伝令の縄張り） | 伝令 `server` |
| `src/jira/**`、`src/commands/jira.js`（と既存の地図職人の縄張り） | 地図職人 `gmkit` |
| `src/commands/init.js`（と既存の語り部の縄張り `src/quest/**`） | 語り部 `teller` |
| `web/**`（絵師の場所を除く） | 盤面 `board` |
| `tests/helpers3.mjs` ほか GM の縄張り | GM |

## 19. 伝令の MCP サーバー（LLM の道具箱）

`masume mcp [--dir D]` — 標準入出力の MCP サーバー（Model Context Protocol）。1行に1つの JSON-RPC 2.0 メッセージ。stdout はプロトコル専用、ログは stderr。

- ルート: `--dir` > `MASUME_DIR` > カレントから冒険の書を探す > カレント（冒険の書が無くても起動する。`masume_quest` で始められる）。
- `initialize` → `{protocolVersion, capabilities: {tools: {}, resources: {}}, serverInfo: {name: "masume", version}}`（`protocolVersion` は相手の要求をそのまま返す）。
- `notifications/initialized` などの通知（`id` の無いもの）には返事をしない。`ping` → `{}`。
- `tools/list` → `{tools: [{name, description, inputSchema}]}`。道具（すべて日本語の説明つき。`inputSchema` は JSON Schema）:

| name | arguments | すること（中身は CLI と同じ） |
| --- | --- | --- |
| `masume_status` | `{json?}` | `status`（`json: true` なら §5 のビューの JSON 文字列） |
| `masume_brief` | `{character, json?}` | `brief` |
| `masume_check` | `{target, as?, no_boss?}` | `check <target>`（`as` 既定は target） |
| `masume_stamp` | `{node, as}` | `stamp` |
| `masume_note` | `{character, text, as?}` | `note`（`as` 既定は character） |
| `masume_log` | `{tail?}` | `log --tail N`（既定 20） |
| `masume_verify` | `{}` | `verify` |
| `masume_quest` | `{wish, gm?, model?}` | `quest`（`gm` は `claude` / `codex`。`cmd:` は受け付けない。`MASUME_GM_OVERRIDE` はそのまま効く） |

- `tools/call` `{name, arguments}` → `{content: [{type: "text", text}], isError}`。`text` は CLI の stdout+stderr、`isError` は終了コードが 0 でないとき true（判定失敗も true。出力は返す）。知らない道具・引数の不足は `isError: true` と説明の text。
- `resources/list` → `{resources: [{uri, name, mimeType}]}`: `masume://docs/RULEBOOK.md`、`masume://docs/GM_GUIDE.md`、`masume://docs/CONTRACTS.md`。`resources/read` `{uri}` → `{contents: [{uri, mimeType: "text/markdown", text}]}`。知らない uri は JSON-RPC エラー `-32602`。
- 知らないメソッドは JSON-RPC エラー `-32601`。壊れた JSON は `-32700`（`id: null`）。

## 20. 地図職人の Jira 同期

`masume jira push [--project KEY] [--dry-run]` / `masume jira pull --project KEY --out <map.json>`

- ベース URL: `MASUME_JIRA_URL` > `JIRA_BASE_URL`（例 `https://example.atlassian.net`）。認証: `Authorization: Basic base64(JIRA_EMAIL:JIRA_API_TOKEN)`。どれかが無ければ `E_JIRA_AUTH`/2。
- 使う REST（v3）:

| 使いみち | メソッド パス | body / 返り値 |
| --- | --- | --- |
| プロジェクトの確認 | `GET /rest/api/3/project/{key}` | `{id, key, name}`（無ければ 404 → `E_JIRA`/2） |
| issue を作る | `POST /rest/api/3/issue` | `{fields: {project: {key}, summary, description, issuetype: {name: "Task"}, labels}}` → `{id, key, self}` |
| issue を直す | `PUT /rest/api/3/issue/{key}` | `{fields: {summary, description, labels}}` → 204 |
| 今の状態 | `GET /rest/api/3/issue/{key}?fields=status` | `{fields: {status: {name, statusCategory: {key}}}}` |
| 遷移の候補 | `GET /rest/api/3/issue/{key}/transitions` | `{transitions: [{id, name, to: {name, statusCategory: {key}}}]}` |
| 遷移する | `POST /rest/api/3/issue/{key}/transitions` | `{transition: {id}}` → 204 |
| issue を読む | `POST /rest/api/3/search/jql` | `{jql, fields: [...], maxResults}` → `{issues: [{key, fields: {summary, description, status: {name, statusCategory: {key}}, assignee: {displayName} or null, labels, created}}]}` |

- push: task と gate を1件ずつ。`.masume/jira.json`（`{project, issues: {<マスID>: {key, id}}}`）に key があれば PUT、無ければ POST。
  summary は `[マスID] タイトル`、description は Atlassian Document Format `{type: "doc", version: 1, content: [{type: "paragraph", content: [{type: "text", text: <§9 の Description>}]}]}`、
  labels は `["masume", <持ち主ID か gate>]`（stale なら `masume-stale` も）。
  状態は §9 の Status を Jira の statusCategory に写す: `Backlog`/`Todo` → `new`、`In Progress`/`In Review` → `indeterminate`、`Done` → `done`。今の statusCategory と違えば、`to.statusCategory.key` が合う遷移（`In Review` は名前が `In Review` のものを優先）で遷移する。
  stdout に `作成 N件・更新 M件・遷移 K件`。`--dry-run` は通信せず、送る予定（マスIDと Status）を出す。
- pull: `jql = "project = KEY ORDER BY created ASC"` で読み、§9 の import と同じ規則で地図の下書きにする（ID = key、Title = summary、Description = description の ADF から text を連結、Status = status.name、statusCategory が `done` なら完了扱いで省く、Assignee = assignee.displayName、Labels = labels、Created = created）。

## 21. 語り部の支度（よそのプロジェクトでも、エージェントがルールを守れるように）

`masume init [--dir D] [--agent claude|codex] [--force]`

- `<root>/AGENTS.md` を書く（既にあって `--force` が無ければ書かずに「AGENTS.md はそのまま」と出す）。中身（日本語）に必ず入れること:
  このプロジェクトはマスメで進めていること / 指令書・宣言判定・日誌のコマンド（`node "<bin/masume.js の絶対パス>" brief <あなたのID>`、`check <ID> --as <ID>`、`note`）/
  現在のマスだけ・縄張り・封印された判定ファイルと地図を編集しない・git の書き込み操作をしない / あがりに着く宣言は `--no-boss` /
  ルールブックの場所（`docs/RULEBOOK.md` の絶対パス）
- `<root>/CLAUDE.md` を書く（同じく既存なら `--force` なしでは触らない）: 1行目に「このプロジェクトはマスメで進めています。AGENTS.md を読んでください。」、そのあと `@AGENTS.md` の行。
- `<root>/.gitignore` に `.masume/lock` `.masume/state.json` `.masume/party.log` を足す（無ければ作る。既にある行は重ねない）。
- 冒険の書があって `--agent` があれば `.masume/party.json` に `{agent, parallel: 3}` を書く。
- stdout に、書いたファイルと書かなかったファイルを1行ずつ。終了コード 0。
- `masume quest` は冒険の書を生んだあとに `init` を行う（`--agent` は `--gm` と同じものを既定に）。

## 22. 盤面（ノートに書き出す）

- 盤面の右下に「ノートに書き出す」（`#export-notebook`）。押すと、地図全体を1枚の SVG（5mm方眼の紙・道・マス・ゲート・駒・題名）にして `<quest.id>-<YYYYMMDD>.svg` として保存する。
- 試験用に `window.__masume.exportSvg()` がその SVG の文字列を返し、保存したら `window.__masume.lastExport = {filename, size}`。
- 印刷（`@media print`）では盤面だけを紙いっぱいに出す。

---

# 第4章の契約 — 総点検の修理

独立した点検役5人がコードを読み、自分で再現できた問題を報告した。第4章では、それを再発防止の判定つきで直す。
ここに書く挙動は、第1章〜第3章の契約に**足す**もの（前の章と矛盾するところは、こちらが優先）。

## 23. 書記: 判定の誠実さ

1. 封印は、判定コマンドを起動する**直前（マスごと）**と、結果を記録する**直前（ロックの中）**にも確かめる。食い違えば結果を捨て、`seal_broken` を記録して `E_SEAL_BROKEN`/2。
2. ゲートの `MASUME_BLAME` は、判定出力の**全体**（保存のために切り詰める前）から拾う。
3. 判定の成否は、判定コマンド（シェル）の**終了コード**で決める。シェルが終わってから1秒たってもパイプが閉じなければ、そのプロセスグループを SIGKILL して、終了コードどおりに扱う（時間切れにしない）。
4. 判定コマンドには、環境変数 `NODE_TEST_CONTEXT` を**渡さない**（入れ子の `node --test` が何も走らせずに通るのを防ぐ）。
5. `check`・`stamp`（その中のボス戦を含む）が SIGINT・SIGTERM・SIGHUP を受けたら、判定のプロセスグループを SIGKILL し、何も記録せずに終了コード 130・143・129 で終わる。

## 24. 書記: 地図と記録の作法

1. `amend`: 突破済みのゲートについて、そのゲートを `path` に含むキャラクターの集合が変わる改訂は `E_AMEND_HISTORY`/1。
2. `amend` の地図のパスは、`new`・`validate` と同じく**カレントからの相対**。
3. `note` は epoch を上げない（日誌で判定が `E_CONFLICT` にならない）。
4. `seal --all` は、そろっていないマスを `保留: <マスID>…` と表示する（終了コード 0）。
5. ゲートの封印破りのログの文は「<ゲートID> の封印が破れていた」（`null` を出さない）。
6. `new --force` は `.masume/linear.json` と `.masume/jira.json` を残す（同期先での重複作成を防ぐ）。

## 25. 伝令: 窓口の守り

1. すべての応答に `X-Frame-Options: DENY`、`Content-Security-Policy: frame-ancestors 'none'`、`X-Content-Type-Options: nosniff`。
2. POST の本文は 64KB まで。超えたら 413（全部を読み切らない。`Content-Length` が大きければ読む前に断る）。
3. `/api/battle` とハンコからのボス戦は、同じゲートのボス戦が動いている間は 409 `E_BUSY`。起動したボス戦は伝令の子として管理し、`stop()` で止める。子プロセスに `NODE_TEST_CONTEXT` を渡さない。
4. `serve` と `mcp` は SIGHUP でも、SIGINT と同じく子を片づけて終わる。
5. MCP の `masume_quest` の願いの長さは、HTTP と同じく `trim()` 後のコードポイント数で 1〜2000。
6. `--host 0.0.0.0` / `::` のとき、表示する URL は `http://127.0.0.1:<port>/`。

## 26. 軍師: 出撃の後始末

1. 自分の stdout/stderr が閉じても（EPIPE）落ちない。出撃中のエージェントの帰還を必ず記録してから終わる。
2. `sortie` の記録が `E_BUSY`（ほかの指揮役がすでに出撃させた）なら、そのキャラクターを今回の候補から外して巡回を続ける（自分の出撃を巻き添えにしない）。
3. 現在のマスが未封印（`cmd` で seal ファイルを持つのに `sealed: false`）のキャラクターは候補にしない。止まるときの理由に `未封印: <マスID>` と `masume seal <マスID>` の案内を出す。
4. 出撃を止めるとき（タイムアウト・SIGINT）は、最後に必ずエージェントのプロセスグループを SIGKILL する（SIGTERM を無視する孫を残さない）。ボス戦の判定中に SIGINT を受けたら、その判定も止める（判定の子孫を残さない）。
5. プロンプトのファイルは、`sortie` を記録する**前に**書く。
6. プロンプトに書くコマンドは、ルートや bin のパスに `$` `"` `` ` `` があっても、そのまま貼って動くように単一引用符で引用する。

## 27. 語り部: GM の後始末と支度の安全

1. GM を呼ぶたびに（やり直しを含む）、その呼び出しの間に `quest.map.json` が書き換わったことを確かめる。書かれていなければ `E_GM`/2（古い地図を受け入れない）。
2. GM のシェルが終わってから1秒たってもパイプが閉じなければ、プロセスグループを SIGKILL して、終了コードどおりに扱う。
3. SIGINT・SIGTERM・SIGHUP では、GM のプロセスグループに SIGTERM、2秒後に SIGKILL。
4. GM の出力は UTF-8 として正しく読み（マルチバイトを壊さない）、`quest.log` と手元に残すのは最大 2MB。
5. `MASUME_GM_TIMEOUT` は 1〜86400 秒に丸める。
6. `--force` で GM が失敗したら `WISH.md` を元のままにする（新しい願いは冒険が生まれたときに書く）。
7. `init`: `AGENTS.md`・`CLAUDE.md`・`.gitignore` が symlink なら、実体がルートの中にあるときだけ書く。外を指す・ぶら下がった symlink には書かない（`書きません: <ファイル>（<理由>）`）。`CLAUDE.md` が `AGENTS.md` と同じ実体なら `CLAUDE.md` は書かない。
8. `AGENTS.md` に書くコマンドも、§26.6 と同じく単一引用符で引用する。

## 28. 地図職人: 同期の守り

1. API キー・トークン・URL の userinfo を、どの出力・エラー・ファイルにも出さない。キーやトークンが印字可能な ASCII でなければ `E_LINEAR_AUTH` / `E_JIRA_AUTH`/2。URL に userinfo があれば `E_USAGE`/2。
2. 通信の途中で切れたら（応答の本文の読み込み中を含む）`E_LINEAR_NETWORK` / `E_JIRA_NETWORK`/1。
3. Linear も 429 を `retry-after` に従って最大3回まで待って再試行する。作成の結果の `issue` が null なら `E_LINEAR_API`/1。
4. push で、ある issue が見つからない（Linear の not found、Jira の 404）・権限が無い（403）・遷移が拒まれた（400）ときは、そのマスを飛ばして残りを最後まで同期し、最後に `飛ばしたマス: <マスID>（<理由>）…` をまとめて出して終了コード 1。Jira の 403 は「権限」と書く（認証のせいにしない）。
5. pull: Linear は `state.type` が `completed` / `canceled` の issue も省く。
6. import / pull: タイトルが80文字を超えたら先頭80文字（全文は detail の先頭に）、空ならマスID。プロジェクト名（quest.title）も80文字まで。quest.id は英大文字と数字だけ残し、先頭が英大文字の2〜10文字に整える（作れなければ `QUEST`）。`linear pull`・`jira pull` にも `--quest-id`・`--title`。取り込める issue が1件も無ければ `E_NOTHING`/1「取り込める issue がありません」。

## 29. 盤面: 表示の守り

1. URL の `fixture`・`script` は `/^[A-Za-z0-9_-]+$/` のときだけ使う。読み込みの失敗の表示はテキストとして出す（HTML として解釈しない）。
2. `head` や `quest` が null のビュー（冒険の書が読めない）でも落ちず、「冒険の書が呪われています」と `masume verify` / `masume repair` の案内を出す。
3. `/api/state` の一時的な失敗（`E_NO_GAME` 以外）は盤面を覆わず、端の表示（`#live`）だけにする。取れたら「ライブ」に戻る。
4. POST が届かなかったら「サーバーに届きません」と知らせ、ボタンを押せる状態に戻す。
5. SSE の `hello` で読み直す。SSE が閉じたら数秒後につなぎ直す。今より古い応答（`head.seq` が小さい）では描き直さない。
6. 書き出しの SVG は XML として正しい（NBSP・制御文字を含む文字列でも単独で開ける）。
7. 狭い画面（860px 以下）では、マスやキャラクターを選ぶと詳細が画面の中に出る。
8. `job`・マスID・キャラIDが `constructor`・`toString`・`__proto__` などでも描ける。

---

# 第5章の契約 — エージェントの箱（サンドボックス）のソケット

マスメの判定（E2E）は、テストの中で手元に小さなサーバーを立てることがある（`127.0.0.1` で listen する。偽の Linear・偽の Jira・盤面の窓口など）。
Codex の `-s workspace-write` の箱（サンドボックス）は、既定でソケットを閉じていて、**`127.0.0.1` での listen まで** `EPERM` で止める。素振りも宣言判定も通らず、キャラクターのせいではないのにレベルが下がる。
第4章では `MASUME_AGENT_OVERRIDE` でアダプタを差し替えて開けた（GM_GUIDE「エージェントの箱を確かめる」）。第5章では、それを製品の選択肢にする。

- **ゲームはローカルのまま**。この選択肢はインターネットのためのものではなく、判定が手元でサーバーを立てられるようにするためのもの。
- **注意**: 開けるのに使う Codex の設定（`sandbox_workspace_write.network_access`）は localhost だけを許すことができない。開けると、**その出撃中のエージェントはインターネットにも出られる**。
- **既定は閉じたまま**（開けるのは、頼まれたときだけ）。名前は第5章の初版では `--network` / `network` だったが、「インターネットが要る」と誤解されるので、第6章で `--allow-listen` / `allow_listen` に改めた（§32）。以下は改めた名前で書く。

ここに書く挙動は、第1章〜第4章の契約に足すもの。

| 縄張り（第5章・第6章で触るもの） | 持ち主 |
| --- | --- |
| `src/party/**`、`src/commands/party.js` | 軍師 `party` |
| `src/quest/**`、`src/commands/quest.js`、`src/commands/init.js` | 語り部 `teller` |

伝令（HTTP の `POST /api/sortie`・`POST /api/quest`、MCP の `masume_quest`）と盤面は変えない。盤面から出撃させるときは、`.masume/party.json` の `allow_listen` が効く（伝令は `masume party` を起動するだけなので）。

## 30. 軍師: 箱のソケットを開ける（`--allow-listen`）

`masume party [...] [--allow-listen | --no-allow-listen]`

1. 箱のソケットを開けるか（`allow_listen`）は、`--allow-listen`（開ける）/ `--no-allow-listen`（閉じる）> `.masume/party.json` の `allow_listen` > 既定 `false` の順に決める。
   - `party.json` の `allow_listen` は `true` か `false`（書かなければ `false`）。ほかの値（文字列・数・null など）は `E_USAGE`/2。
   - `--allow-listen` と `--no-allow-listen` は値を取らない（`--allow-listen=…` は `E_USAGE`/2）。両方を付けたら `E_USAGE`/2。
2. `allow_listen` が `true` で、エージェントが `codex` なら、アダプタ（§13）のコマンドは `-s workspace-write` の**すぐ後ろ**に `-c sandbox_workspace_write.network_access=true` を足したものになる。
   `codex exec -C <root> -s workspace-write -c sandbox_workspace_write.network_access=true --skip-git-repo-check [-m <M>] -`
   （`-c` とその値は別々の引数。シェルを通さずに起動するので、引用符は付けない）
3. `claude` と `cmd:<command>` のコマンドは `allow_listen` に関係なく変わらない（`claude` には §13 の箱の指定が無い。`cmd:` は持ち主が自分で決める）。
   `MASUME_AGENT_OVERRIDE` が `codex` なら 2. が効き、`cmd:…` なら効かない。
4. `--dry-run` の `出撃予定: <キャラID> <コマンド>` と、巡回を始めるときの見出しの行（行頭から `出撃準備: `。`あがり！` の行と同じく時刻の接頭辞を付けない）に出すコマンドは、実際に起動するコマンドと同じ（2. の引数を含む）。
5. `allow_listen` が `false` のときは、コマンドにも出力にも `network_access` を出さない（第2章どおりの、閉じた箱）。

## 31. 語り部: GM の箱と、出撃への持ち越し

`masume quest "<願い>" [...] [--allow-listen]` / `masume init [...] [--agent claude|codex] [--allow-listen]`

1. `quest --allow-listen` で GM が `codex`（`--gm codex`、または `MASUME_GM_OVERRIDE` が `codex`）なら、GM のコマンドは §30.2 と同じく `-s workspace-write` のすぐ後ろに `-c sandbox_workspace_write.network_access=true` を足したもの（GM が判定を素振りするときにも、手元でサーバーを立てられる）。
   `claude` と `cmd:` の GM のコマンドは変わらない。`--allow-listen` が無ければ、どこにも `network_access` を出さない。
2. `quest --dry-run` の `コマンド:` の行（`--json` なら `command`）は、実際に起動するコマンドと同じ（1. の引数を含む）。
3. `quest --allow-listen` で冒険が生まれ、支度（§21）が `.masume/party.json` を書くときは、`"allow_listen": true` も書く（GM の箱を開けた冒険は、出撃の箱も開けたまま始まる）。
   `--allow-listen` が無ければ `allow_listen` には触らない（第3章どおり `{agent, parallel}`）。
4. `init --agent <A> --allow-listen` は、`.masume/party.json` に `"allow_listen": true` も書く（ほかの項目は §21 どおり残す）。`--allow-listen` の無い `init` は `allow_listen` に触らない。`--agent` の無い `--allow-listen` は `E_USAGE`/2。

---

# 第6章の契約 — 箱のソケットの名前と説明

第5章の `--network` という名前は「ネットワークって何？ これはローカルのゲームなのに」と誤解された。第6章では、名前と説明で次のことが分かるようにする:
**目的**（判定が `127.0.0.1` にサーバーを立てられるように、Codex の箱のソケットを開ける）・**ゲームはローカルのまま**（インターネットは要らない）・**注意**（Codex の設定は localhost だけに絞れないので、開けるとその出撃中のエージェントはインターネットにも出られる）。

## 32. 名前・`--help`・知らせ

1. 名前: §30・§31 の `--network` / `--no-network` / `network`（第5章の初版）は、`--allow-listen` / `--no-allow-listen` / `allow_listen` に改める。古い名前は残さない（`--network` は `E_USAGE`/2。`party.json` の `network` は、ほかの知らない項目と同じく読まない）。
2. `masume party --help`・`masume quest --help`・`masume init --help`（`-h` も同じ）は、使い方と各オプションの説明を **stdout** に出して終了コード 0（ほかの引数があっても、何も記録・起動しない。冒険の書が無くてもよい）。
   `--allow-listen` の説明には、少なくとも次の4つを書く: `127.0.0.1` にサーバーを立てられるようにすること / ゲームはローカルのまま（「ローカル」の語）/ 使う Codex の設定の名前 `sandbox_workspace_write.network_access` と、localhost だけに絞れないので**インターネット**にも出られること / codex にだけ効く（claude と `cmd:` は変わらない）こと。
   `party --help` には `--no-allow-listen` と `.masume/party.json` の `"allow_listen": true` も、`init --help` には `--agent` といっしょに使うことも書く。
3. 知らせ: `allow_listen` が効くとき（エージェントや GM が `codex` のとき）は、`party`（`--dry-run` を含む。巡回の見出しより前）と `quest`（`--dry-run` を含む。GM を呼ぶ前。`--json` のときは stderr）が、**行頭から `箱のソケット: `** で始まる1行を出す。その行には `127.0.0.1` と `インターネット` を含める。
   `--allow-listen` を頼まれたがエージェントや GM が `codex` でないときは、同じく `箱のソケット: ` で始まり `codex にだけ効きます` を含む1行を出す（コマンドは変えない。`quest` は §31.3 どおり `party.json` には書く）。
   頼まれていないときは `箱のソケット:` の行を出さない。
4. `masume --help`（受付係・GM の縄張り）の一覧にも `--allow-listen` を出す。

---

# 第7章: 盤面から箱のソケットを開ける

第6章までは、`--allow-listen` は CLI（`party`・`quest`・`init`）と `.masume/party.json` でしか決められなかった。
盤面だけで遊ぶ人（入口で願いを書き、「出撃させる」で出撃させる人）も、Codex の箱のソケットを開けられるようにする。
意味と注意（127.0.0.1 にサーバーを立てるため・ゲームはローカルのまま・Codex の設定は localhost だけに絞れないのでインターネットにも出られる・codex にだけ効く）は §30〜§32 と同じ。

## 33. 伝令: 窓口の `allow_listen`

1. `POST /api/sortie` の本文に `allow_listen`（省略可）を足す。`true` なら `masume party … --allow-listen`、`false` なら `… --no-allow-listen`、省略（`undefined`・`null`）なら何も足さない（`party.json` の値が効く）。真偽値以外は 400 `E_USAGE`（何も起動しない）。
2. `POST /api/quest` の本文に `allow_listen`（省略可）を足す。`true` なら `masume quest … --allow-listen`（`--` と願いより前）。`false`・省略なら何も足さない。真偽値以外は 400 `E_USAGE`。
3. `GET /api/party` の応答に、出撃の既定値を足す（`<root>/.masume/party.json` から。冒険の書が無くても答える）:
   - `allow_listen`: `party.json` の `allow_listen` が `true` なら `true`、それ以外（ファイルが無い・読めない・壊れている・値が `true` でない）は `false`。
   - `agent`: `party.json` の `agent` が `claude` か `codex` ならその文字列、それ以外（無い・`cmd:…`・ほかの値・壊れている）は `null`。
   - `parallel`: `party.json` の `parallel` が 1〜8 の整数ならその数、それ以外は `null`。
4. MCP の `masume_quest` の入力に `allow_listen`（boolean、省略可）を足す。意味は 33.2 と同じ（真偽値以外は道具のエラー）。道具の説明（description）には、127.0.0.1 にサーバーを立てるためであることと、インターネットにも出られることを書く。

## 34. 盤面: ソケットを開ける切り替え

1. 入口（ロビー）のフォームに、チェックボックス `#gm-allow-listen`（既定は外れている）と、その説明を置く。説明には `127.0.0.1`・`ローカル`・`インターネット`・`codex にだけ効く` を含める。
   チェックが入っていれば `POST /api/quest` の本文に `allow_listen: true` を入れる。外れていれば `allow_listen` を入れない。
2. 出撃の窓（`#sortie-modal`）に、チェックボックス `#sortie-allow-listen` と同じ説明を置く。窓を開くたびに `GET /api/party` を読み、
   `allow_listen` を既定のチェックに、`agent`（`null` でなければ）を `#sortie-agent` の既定に、`parallel`（`null` でなければ）を `#sortie-parallel` の既定にする（読めなければ、チェックは外し、ほかは今のまま）。
   願いから生まれた冒険では `party.json` に GM と同じエージェントが書かれているので、Codex の GM で始めた冒険は、窓を開くと Codex が選ばれている。
   `POST /api/sortie` の本文には、チェックの状態をそのまま `allow_listen: true` / `false` として必ず入れる。
3. エージェント（`#sortie-agent`）が `codex` でないあいだは `#sortie-allow-listen` を押せなくし（`disabled`）、`codex にだけ効きます` と見せる。そのときは本文に `allow_listen` を入れない。
   入口の GM（`#gm`）が `codex` でないときも、`#gm-allow-listen` は押せる（§31.3 どおり、生まれた冒険の `party.json` に持ち越すため）。説明に `codex にだけ効く` があればよい。
4. 見本の盤面（`?fixture=`）では、どちらのチェックボックスもあってよいが、何も送らない（§29 までどおり）。

---

# 第8章: 最終確認

最終確認で、チュートリアル（`quests/tutorial/README.md`）を書いてあるとおりに bash で上から貼っていくと、最後の `kill "$TUTORIAL_SERVER_PID"` で盤面のサーバーが止まらずに残ることが分かった。
2 で `masume serve --port 0 &` を、`masume() ( exec node … )` の関数を通して背景で起動しているため、`$!` がサーバー本体ではなく、関数のための子のシェルを指していた。

## 35. 地図職人: チュートリアルは書いてあるとおりに動く

1. `quests/tutorial/README.md` の「## 途中で止まったとき」より前にある ```` ```sh ```` のブロックを、上から順に1つのスクリプトにつないで、マスメのリポジトリのルートで `bash` で走らせると（`zsh` があれば `zsh` でも）:
   - 冒険があがる（`masume status --json` の `finished` が `true`、全員 `done`）。
   - 最後のブロックのあと、そのチュートリアルの盤面のサーバー（`masume.js serve … --dir <そのゲームのルート>`）が残っていない。
   - 2 のブロックが盤面の URL（`盤面: http://127.0.0.1:…/`）を出す。
2. 遊ぶ人の手順（名前・あいさつ・カード・ハンコの順）と、地図・判定・`SOLUTIONS.json` は変えない。直すのは手順の書き方だけ。

---

# 第9章: 手書きの方眼ノート

第8章までで、マスメは願いからあがりまで遊べるようになった。けれど盤面は「画面に方眼の模様を敷いて、マス目を並べたもの」に見えていた。
遊んだ人の言葉:「方眼ノートっていう手作りの温かみを活かしたUIになってなくて、ただのマス目じゃん？ 手書きのノートで遊んでる感がもっともっとほしい」。

何が「ただのマス目」に見せていたか:
- 紙に端も綴じも無く、どこまでも同じ方眼が続く（1ページのノートではない）。左の綴じは灰色の棒。
- 線はどれも同じ太さ・同じ色のベクター。RULEBOOK §10 の「鉛筆の下書き・ボールペン・蛍光ペン・赤ペンのはなまる」が、筆記具の違いとして見えない（霧は破線なだけ）。
- 字はほぼ1つの書体。まわり（紺の帯・白い角丸のカード・ピル）は Web アプリの部品のまま。
- 駒・名札・知らせが、ノートに置いた・貼った「物」に見えない。
- 何も描かれていかない（ペンで描いている途中の感じが無い）。

第9章では、盤面を「小学生のころ方眼ノートにマス目を引いて遊んだすごろく」に近づける。

| 縄張り（第9章で触るもの） | 持ち主 |
| --- | --- |
| `web/index.html`、`web/board/**`、`web/fixtures/**` | 盤面 `board`（賢者クロード） |

ここに書く挙動は、第1章〜第8章の契約に足すもの。前の章で決めた id・class・data-*（`.pawn[data-char]`、`#node-layer .node[data-node][data-state]`、`.road[data-char]`（キャラクターに1つ）、`.lane-head[data-char]`、`.party-card[data-char]`、`#drawer`、`#live`、`#integrity`、`#record`（§52.4）、`.quest-title`（題名だけ）、`#grid-5mm`・`#grid-10mm` ほか）と、§22・§29 は保つ。

## 36. 盤面: 手書きの方眼ノート

1. **ノートの1ページ**: 盤面の紙は、端のある1枚のページ。`#paper` の中に:
   - `.page-sheet` … ページの紙（1つ）。ページの外は机（`#stage` の背景は紙の色 `--paper` ではない）。
   - `.page-binding` … 左の綴じ。中にリング `.ring` が3つ以上。
   - `.page-margin` … 余白の赤い縦線。
   - `.page-grain` … 紙の色むら・黄ばみ（方眼とは別の層）。
   - 方眼（`url(#grid-5mm)` で塗るもの）は `.page-sheet` の中だけ。
   - ページの上の余白に、印刷の「No.」「Date」と、手書きの題名（`.quest-title`）・番号・日付。
   - 「全体」（`[data-zoom="fit"]`）で、ページ全体（綴じを含む）が盤面の中に見える。
2. **筆記具**: 盤面の線は、どの筆記具で描いたかを `data-tool` で示す（RULEBOOK §10 の見え方）。
   - `pencil`（鉛筆）… 霧のマス（`data-state="fog"`）の枠。灰色で、紙のざらつき（`filter`）がある。
   - `ballpoint`（ボールペン）… 霧でないマスの枠。色はボールペン紺 `#1d2b5c`。
   - `marker`（蛍光ペン）… 道（`.road` の中の線）と、作業中のマスの塗り。半透明で、重なると濃くなる（`mix-blend-mode: multiply`）。
   - `redpen`（赤ペン）… はなまる（`.hanamaru`）。色は赤ペン `#d94a3a`。
   マスの枠は、task と宿屋が `.cell-line`、ゲートが `.gate-line`。
3. **字**: 書体は3つで、どれも手書きの字。題名・ふりだし・あがり・ゲートの旗は太いペン（マジック）、マスの題はボールペン、霧のマスの題は鉛筆の字。
   `.quest-title`・`.cell-title`（霧でない）・`.cell-title.pencil-text`（霧）の最初の書体はそれぞれ違う。Google Fonts の読み込みは今と同じ形（1つの `<link>` に3つの family）。
4. **物**:
   - 駒はシール（白いふちと影）。`.pawn .pawn-body` に `filter` がある。
   - 名札（`.lane-head`）は付箋で、マスキングテープ（`.tape`）で貼ってある（名札ごとに1つ以上）。
   - 冒険の書（`#side`）はルーズリーフ。とじ穴 `#side .punch` が3つ以上。
   - 知らせ（`.toast`）は付箋。少し傾いている（`transform` が回転を含む）。
5. **動き**: 盤面を最初に描くとき、マスの枠と道は、ペンで引かれるように出る（`stroke-dashoffset` を動かす CSS のアニメーション）。新しく突破したマス（`.fresh-clear`）のはなまるも、赤ペンで描かれるように出る。
   描き終わったら、線はすべて見えている。`prefers-reduced-motion: reduce` では、盤面（`#board`）の中で動き続けるアニメーションは無く、最初から描き終わった姿で出る。
6. **読みやすさ**: 紙の色（`--paper`）に対して、マスの題（ボールペン）と冒険の書の字のコントラスト比は 4.5 以上、霧のマスの題（鉛筆）は 3 以上。狭い画面（860px 以下）は §29.7 のまま。
7. **書き出し**（§22・§29.6 に足す）: 書き出しの SVG はノートの1ページ（`.page-sheet` と `.ring` を含み、ページ全体と綴じが viewBox の中）。幅・高さの mm は、viewBox の幅・高さ ÷ 1目（`#grid-5mm` の `width`）× 5。

---

# 第10章: 外の字を待たない

npm test の揺れを調べたところ、盤面が外の字（Google Fonts）の CSS を待って、描画もスクリプトも止めていた。
返ってこない回線（オフラインに近い・詰まった Wi-Fi・社内のプロキシ）では、盤面が白いまま `window.__masume` も生まれない。
「ゲームはローカルのまま」なのに、盤面だけが外を待っていた。判定の Chrome は外のホストを引けなくした（GM の縄張り）ので、盤面の約束としてここで守る。

## 37. 盤面: 外の字を待たない

1. 盤面は、外の字（Google Fonts）の CSS や字のファイルが返ってこなくても描かれる。`?fixture=demo` は、fonts.googleapis.com と fonts.gstatic.com への読み込みが止まったままでも、`window.__masume.ready` になり、駒が出る（字は手元の書体で先に描き、届いたら差し替わる）。
2. §36.3 はそのまま: Google Fonts は1つの `<link rel="stylesheet">` に3つの family。やり方は盤面が決める。ただし、要素に `onload` などのイベントの属性を書かない（§29.1 の判定が、URL の文字列が要素になっていないかを `[onload]` で見ているため）。
3. 外の字が届かないことを、未処理の例外やエラーの知らせにしない。

---

# 第11章: GridHub — テスト1件が1マス

第10章までのマスメは「タスク1つ = 1マス」で、マスとマスのあいだに意味のない道があった。遊んだ人の評価は「盤面がただのマス目の表で、ゲームとして楽しくない。言葉も分からない」。
第11章では、ゲームデザイン（[GAME_DESIGN.md](GAME_DESIGN.md)。ユーザーが承認したもの）に合わせて、ルールと盤面を作り直す。柱は2つ:

- **意味のないマスはない。** 普通のマス = テスト1件（雑魚モンスター）。タスク = ダンジョン、その出口 = 宣言判定。町 = セーブ（Git のコミット）。中ボス = 結合テスト、魔王 = あがり、王様の城 = 人間のハンコ。
- **エンジニアが一目で読める。** 字は技術の言葉が先（`POST /api/memos`、`テスト 3/5`、`commit a1b2c3d`）。ゲームの言葉は添え書き。

ここに書く挙動は、第1章〜第10章の契約に足すもの（矛盾するところはこちらが優先）。

| 縄張り（第11章で触るもの） | 持ち主 |
| --- | --- |
| `bin/**`（`bin/gridhub.js` と別名の `bin/masume.js`）、`package.json`、`README.md`、`docs/**`、`tests/**` | GM |
| `src/engine/**`、`src/commands/{…,step}.js`（既存の書記のコマンドに `step` を足す） | 書記 `engine` |
| `web/index.html`、`web/board/**`、`web/fixtures/**` | 盤面 `board`（賢者クロード） |
| `web/assets/monsters/**` | 絵師 `assets` |
| `src/quest/**`、`src/commands/{quest,init}.js` | 語り部 `teller` |
| `src/party/**`、`src/commands/party.js` | 軍師 `party` |
| `src/server/**`、`src/mcp/**`、`src/commands/{serve,mcp}.js` | 伝令 `server` |
| `src/linear/**`、`src/jira/**` ほか | 地図職人 `gmkit` |

### 分担（エンジンが決め、盤面が見せる）

- **書記（エンジン）が決める**: テスト1件ずつの成否、駒が立つマス（最初に落ちているテスト）、復活・強敵・技・メダル・宝・罠・図鑑・代・エンディング、町のセーブ（コミット）と巻き戻し。すべて冒険の書（と、ハッシュで守られた判定の出力）から導き、ビュー（§5）に入れる。
- **盤面（賢者クロード）が見せる**: ビューにあるものだけを、縦の5mm方眼ノートの世界地図として描く。盤面はルールを数え直さない（テストの出力を自分で読まない）。
- **軍師が決める**: 作戦（エージェントの動き方と、1回の出撃の長さ）。作戦はルールを変えない。

## 38. 名前と受付係（GM）

1. 受付係は `bin/gridhub.js`。`bin/masume.js` は別名で、同じコマンドを同じように受け付ける。`ctx.bin` は実際に起動したファイル（エージェントに渡す `MASUME_BIN` もそれ）。
2. `package.json` の `name` は `gridhub`、`bin` は `gridhub` と `masume` の2つ。
3. `gridhub --help` の1行目に `GridHub`。`gridhub --version` は `gridhub <版> (rules 1)`。
4. 変えないもの: `.masume/`、`MASUME_*`、MCP の `masume_*`、`masume: 1`、`rules: 1`。

## 39. 地図: `check.cases` と `quest.save`

```jsonc
"quest": { "id": "MEMO", "title": "メモアプリ", "goal": "GOAL", "save": "git" },   // save は任意
"S1": { "type": "task", "title": "POST /api/memos でメモを保存する",
  "check": { "kind": "cmd", "run": "node --test checks/S1.test.mjs", "seal": ["checks/S1.test.mjs"],
             "cases": ["title が空なら 400", "保存すると 201 と id", "保存したメモが一覧に出る"] } }
```

1. `check.cases`（任意）… `kind: "cmd"` の task と gate に書ける。テストの名前の配列（1〜50件。各1〜120文字の空でない文字列。重複なし）。1件が1マス（ゲートでは HP）。形が違えば `E_CHECK`。stamp・camp には書けない（`E_CHECK`）。
2. `quest.save`（任意）… `"git"` だけ。ほかの値は `E_FORMAT`。§43 の Git のセーブを使う冒険。
3. 改訂（§4.8）で、通過済みのマスの `check.cases` は変えられない（`check` の一部なので）。

## 40. テスト1件ずつの成否（書記）

判定の出力（`=== <nodeId>: <run> ===` の区切りごと）から、テスト1件ずつの結果を読む。

1. 読む行（行頭の空白は字下げとして数える。末尾の ` (12.3ms)` と ` # …` の指示は名前に含めない）:
   - `node --test` の spec: `✔ 名前` 成功 / `✖ 名前` 失敗 / `﹣ 名前 # SKIP`（`# TODO` も）結果なし。`✖ failing tests:` の行より後は読まない（まとめの繰り返し）。`▶ 名前`（スイートの見出し）は結果ではない。
   - TAP: `ok <n> - 名前` 成功 / `not ok <n> - 名前` 失敗（`# SKIP`・`# TODO` が付けば結果なし）。
   - そのほか: `✓ 名前` `PASS 名前` `ok 名前` 成功 / `✗ 名前` `FAIL 名前` `NG 名前` `ng 名前` 失敗。
2. 地図に `cases` があるマス: 各 case について、名前が同じ（前後の空白を除いて完全一致）結果のうち**最後のもの**。どの case も名前で見つからなければ、いちばん浅い字下げの結果を出てきた順に case へ割り当てる。名前で見つかった case があるときは、見つからない case は「結果なし」。
3. `cases` が無いマス: いちばん浅い字下げの結果が、出てきた順にそのマスのテスト（同じ名前は最後のもの）。結果が1つも読めなければ、名前 `判定` のテスト1件（成否は終了コードどおり）。
4. 判定を走らせなかったマス（累積判定が前のマスで止まった）は、何も変わらない。
5. 記録: 判定の結果を持つイベント（`check_passed` `check_failed` `gate_cleared` `gate_failed` と §41 の `stepped`）の `data` に `cases: {"<nodeId>": [{"name", "ok": true|false|null}]}`（走らせたマスごと）を入れる。第10章までのイベントで `cases` が無いものは、ビューを作るときにその出力ファイルから同じ規則で読む。

### ビュー（§5 に足す）

- `nodes[id].cases` … `[{name, ok, losses, revived, strong}]`。地図に `cases` があればその順、無ければ最後に走らせたときに読めたテストの順。まだ一度も走らせていなければ `[]`。
  - `ok` … いちばん新しい結果（`true` / `false` / まだ結果が無ければ `null`。「結果なし」の回は前の値を保つ）
  - `losses` … 失敗した回数、`revived` … 一度でも通ったあとで失敗した回数（**復活**。リグレッション）、`strong` … 2回以上失敗してから通った（**強敵を倒した**）なら `true`
- `nodes[id].tests` … `{pass, total}`（`ok === true` の数 / `cases` の数）。
- `characters[].square` … いま task の上にいれば、その `cases` の中で最初に `ok !== true` の添字（0始まり）。全部 `true` なら `cases.length`（出口の前）。`cases` が `[]` なら `0`（中の分からないダンジョンの「？」）。task の上にいなければ `null`。**駒はこのマスに立つ。**
- 戦いの記録は、ロード（§4.9）しても巻き戻らない（起きた戦いは起きた）。

## 41. 歩く（`gridhub step <characterId>`）

1. キャラクターが `kind: "cmd"` の task の上にいるときだけ。知らないキャラ `E_UNKNOWN`/2、あがり済み `E_DONE`/2、ゲートで待機中 `E_USAGE`/2、stamp のマス `E_NEEDS_STAMP`/2。
2. 封印は宣言（§4.3・§23）と同じく確かめる（今のマスだけ）。未封印 `E_UNSEALED`/2（記録しない）、封印破り `seal_broken` を記録して `E_SEAL_BROKEN`/2。
3. **今のマスの判定だけ**を、宣言と同じやり方（環境変数・タイムアウト・出力の形・シグナル）で走らせる。
4. `stepped {character, node, cases, code, output, output_hash, duration_ms, git}` を記録する（`code` は判定の終了コード、`output` は `outputs/<seq 6桁>.log`）。楽観ロック（§4.7）は宣言と同じ（`E_CONFLICT`/2）。
5. **位置・レベル・経験値・epoch は変わらない**（普通の戦い。負けても罰はない）。
6. 終了コード: 判定が通れば 0、落ちれば 1。stdout:
   - `歩いた: <キャラID> <マスID> テスト <通った数>/<全部の数>`
   - テスト1件ずつ `  ✔ <名前>` / `  ✖ <名前>` / `  ・ <名前>`（結果なし）
   - 落ちたテストがあれば `いちばん手前のモンスター: <名前>`、全部通れば `全部倒した。出口で宣言する: gridhub check <キャラID>`
   - 判定が落ちたら、出力の末尾（最大40行）も出す
   - `--json` は `{exitCode, events}`
7. モジュール API: `export async function step(root, characterId, { actor })` → `{exitCode, events}`。

## 42. 積み上げ（書記・ビュー）

ビューに足す（§5）。すべて冒険の書から導く。

| 項目 | 意味 |
| --- | --- |
| `characters[].generation` | 代。そのキャラクターの `sortie` の数（0なら1）。出撃1回が1代（伝承） |
| `characters[].revived` / `strong` | そのキャラクター（`stepped`・`check_*` の `character`）の戦いで、テストが復活した回数 / 強敵を倒した回数 |
| `characters[].skills` | 技。`[{seq, ts, text, node, case}]`（新しい順）。強敵を倒したあと、そのキャラクターの次の `note` が技になる（次の `sortie` が始まると、その機会は閉じる）。`node`・`case` は倒した強敵 |
| `characters[].medals` | ちいさなメダル。そのキャラクターの task（`cmd`）のうち、そのマスを `data.node` に持つ最初の宣言（`check_passed` / `check_failed`）が成功だった数（一発で出口を抜けた） |
| `characters[].treasures` | 宝。そのキャラクターが task の上にいる（ゲートなら待機している）マスを、GM がファイルの中身を変えて封印し直した（`sealed` が2回目以降で、ファイルのハッシュが前と違う）回数（判定のバグを見つけた） |
| `characters[].traps` | 罠。`seal_broken` の `character` がそのキャラクターである数（封印破り） |
| `nodes[id].first_try` | task（`cmd`）で、最初の宣言が成功なら `true`、失敗なら `false`、まだなら `null`。ほかのマスは `null` |
| `bestiary` | モンスター図鑑 `{total, defeated, revived, strong}`。`total` = 全マスの `cases` の数の合計、`defeated` = そのうち `ok === true` の数、`revived`・`strong` = 全マスの合計 |
| `ending` | 章のエンディング。`finished` のとき `{seq, text, stats}`、そうでなければ `null`（§42.1） |

### 42.1 エンディング

- 章 = 今の `quest.goal` がその地図の goal になった時点（genesis、または goal が変わった `amended`）から、goal の `gate_cleared` まで。`seq` はその `gate_cleared` の seq。
- `stats` = その章の間の `{tests, defeated, medals, strong, revived, treasures, traps, skills, sorties, fails}`（`tests`・`defeated` はあがった時点の図鑑。`fails` は `check_failed` と `gate_failed` の数。ほかは章の間に起きた数）。
- `text` は `stats` と仲間の名前から作る、日本語の数行。**記録が違えば文も違う**（少なくとも、強敵・復活・宝・一発合格・出撃の回数のどれかが違えば、文が違う）。技術の言葉を先に（例「テスト 42/42 が通った。」）。

## 43. 町 = セーブ（Git のコミット）

`quest.save` が `"git"` の冒険だけ。それ以外の冒険では Git に触らず、`saved`・`restored` は記録しない（第10章まで、このリポジトリ自身の冒険もこれ）。

1. **縄張りのファイル** = ゲームのルートの中で、キャラクターの `territory` の glob（`**`・`*`・`{a,b}`）に合い、Git で変更・追加・削除されているファイル。`.masume/` は含めない。`territory` の無いキャラクターは、縄張りのファイルが無い。
2. **セーブ**（コミット）: 縄張りのファイルだけを、ユーザーのほかの変更やステージ（index）に触れずにコミットする（一時的な index で木を作ってコミットし、HEAD のブランチを進め、本物の index はそのファイルだけ HEAD に合わせる）。push はしない。フックは走らせない。名前とメールが設定されていなければ `GridHub <gridhub@localhost>`。
   - 変更が無ければコミットしない（`commit` は今の HEAD、`changed: false`）。
   - コミットのメッセージの1行目は `gridhub save: <マスID> <マスの題>`（ふりだしは `gridhub save: ふりだし`）。
3. セーブする時と記録（`saved {characters:[…], node, commit, changed, files:[…]}` か、失敗したら `{characters, node, commit: null, error}`）:
   - `new`（冒険の書が生まれたとき）: 全員の縄張りのファイルをセーブ（ふりだし。`node: null`）。HEAD がまだ無い（`git init` 直後）なら、ふりだしのコミットが最初のコミットになる。
   - キャラクターが町（camp）に着いたとき（`check_passed`・`stamped` のあとの到着処理で camp を通ったとき）: そのキャラクターの縄張りをセーブ（`node` は camp）。
   - 結合ゲートを突破したとき（`gate_cleared`）: メンバー全員の縄張りを1つのコミットでセーブ（`node` はゲート）。
   - ゲームのルートが Git の作業ツリーの中でなければ、`commit: null`・`error` を記録する（判定の結果は変えない）。
4. **巻き戻し**: 宣言に負けた（`check_failed`）キャラクター、ボス戦に負けた（`gate_failed`）責任のあるキャラクターごとに、その判定の記録のすぐ後で:
   - そのキャラクターを含む最新の `saved`（`commit` が null でないもの）のコミットを戻り先にする。
   - 縄張りのファイルを `git stash push --include-untracked -m "gridhub grave: <キャラID> <マスID> seq <判定のseq>"` で**墓**に残す（無くならない）。
   - 戻り先のコミットと縄張りのファイルが違えば、戻り先から取り出す。
   - `restored {character, node, commit, stash}` を記録する（`node` = 落ちたマスかゲート、`stash` = 墓のコミットの sha。変更が無ければ `null`）。失敗したら `{character, node, commit, stash: null, error}`。
   - 縄張りの無いキャラクターは記録しない。
5. ビュー: `characters[].save` = そのキャラクターを含む最新の `saved` の `{seq, node, commit}` か `null`。`characters[].grave` = そのキャラクターの最新の `restored` で `stash` があるものの `{seq, node, commit, stash}` か `null`。`nodes[id].save` = その町・ゲートの最新の `saved` の `{seq, commit}` か `null`。
6. `log[].text`: `saved` →「<名前（複数なら、でつなぐ）> が <マスID かふりだし> でセーブした（commit <7桁>）」（失敗は「セーブできなかった: <error>」）、`restored` →「<名前> の縄張りを commit <7桁> に戻した（墓: stash <7桁>）」、`stepped` →「<名前> が <マスID> を歩いた（テスト p/t）」（`ok` は `code === 0`）。

## 44. 指令書（`brief`）

`brief --json` に足す: `generation`、`cases`（今のマスの `nodes[id].cases`）、`next_case`（駒が立つマスのテストの名前か `null`）、`square`、`skills`（§42。新しい順に全部）、`medals`、`grave`（§43.5 に `command: "git stash apply <stash>"` を足したものか `null`）、`save`（`quest.save` か `null`）。
`notes` は今までどおり（新しい順に最大5件）。

テキスト版に必ず出すこと:
- `<名前>（<id>）… <N>代目`
- 今のマスのテスト `テスト <p>/<t>` と、1件ずつの `✔` / `✖` / `・`、`いま戦うテスト: <名前>`（全部通っていれば「全部倒した。出口で宣言する」）
- `技（受け継いだもの）:` と技の一覧（無ければ「まだない」）
- 墓があれば `墓: git stash apply <stash>`
- 歩き方: `歩く（何度でも・記録される・罰なし）: gridhub step <id>`、`宣言（一発勝負）: gridhub check <id>`、`日誌: gridhub note <id> "…"`
- `rules` に「1マスずつ: いちばん手前の落ちているテストだけを通して、gridhub step で確かめる」を足す。

## 45. 軍師: 作戦（`--tactic`）

`gridhub party [...] [--tactic careful|balanced|bold]`

| id | 名前 | プロンプトでの動き方 | 止まる条件 |
| --- | --- | --- | --- |
| `careful` | いのちだいじに | 1マスずつ `step` で確かめる。全部のテストが通るまで宣言しない | 1つのダンジョンを抜けたら、または宣言に2回失敗したら |
| `balanced`（既定） | バッチリがんばれ | 小さく変えて `step` を回す。全部通ったら宣言 | 同上 |
| `bold` | ガンガンいこうぜ | 次の町まで、ダンジョンを続けて進んでよい | 町に着いたら（セーブしたら）・ゲートで待機になったら・宣言に2回失敗したら |

1. 決め方: `--tactic` > `.masume/party.json` の `tactic` > `balanced`。日本語の名前（`いのちだいじに` ほか）も `--tactic` に書ける（id に直す）。ほかの値は `E_USAGE`/2（`party.json` の不正な値も）。
2. プロンプトに必ず入れること（§13 に足す）: `作戦: <名前>（<id>）` の行と、上の表の動き方・止まる条件 / 歩くコマンド `node '<MASUME_BIN>' step <id> --as <id> --dir '<root>'` / 「いちばん手前の落ちているテスト（いま戦うテスト）だけを通す」/ 伝承「あなたは <名前> の <N>代目。指令書の技と日誌は先代から受け継いだもの。苦労して分かったことは、次の代のために日誌に書く」（`N` = この出撃が何回目か）。
3. 巡回の見出し（`出撃準備: `）と `--dry-run` に `作戦: <名前>` を出す。`--help` に `--tactic` と3つの作戦。
4. 作戦はルール（宣言の重さ・セーブ）を変えない。

## 46. 語り部: Git でセーブする新しい冒険

1. `gridhub quest` の GM のプロンプトに足す: 「各 task の `check` に `cases`（テストの名前。1件 = 1マス = 1つの変数に対する小さな作業。ダンジョン1つに2〜6件）を書き、判定ファイルの中のテストの名前をそれと同じにする」「`quest.save: "git"` を書く」「各キャラクターに重ならない `territory` を書く」。
2. 生まれた地図に `quest.save` が無ければ、`"git"` を足してから冒険の書をつくる（`quest.map.json` も書き直す）。
3. ルートが Git の作業ツリーの中でなければ、冒険の書をつくる前に `git init` する（`git` が無ければ、その旨を出して続ける）。`git init` した冒険では、支度（§21）のあとで、ルートの全部（`.gitignore` に従う）を `gridhub: 冒険のはじまり` としてコミットする。もとから Git の中だったら、語り部はコミットしない。
4. 支度（§21）の `AGENTS.md`・`CLAUDE.md` は GridHub の名前で書く（`GridHub（旧名マスメ）`）。`AGENTS.md` には、歩くコマンド（`node '<bin>' step <あなたのID> --as <あなたのID>`）と、1マスずつの進め方（いちばん手前の落ちているテストだけを通して step で確かめる。全部通ったら check）を足す。

## 47. 伝令: 歩く道具と作戦の窓口

1. MCP の道具に `masume_step {character, as?}`（`step <character>`。`as` 既定は character）を足す。
2. `POST /api/sortie` の本文に `tactic`（省略可）。`careful` / `balanced` / `bold` なら `gridhub party … --tactic <id>`、省略（`undefined`・`null`）なら何も足さない、ほかの値は 400 `E_USAGE`（何も起動しない）。
3. `GET /api/party` の応答に `tactic`（`party.json` の `tactic` が3つの id のどれかならその id、それ以外は `null`）。

## 48. 地図職人: テストのチェックリスト

`export linear` の `Description`（§9。Linear・Jira の push も同じ文を使う）で、地図に `check.cases` があるマスは、判定の行のあとに空行と `テスト:` の行、そのあと1件ずつ `- [x] <名前>`（ビューの `ok === true`）/ `- [ ] <名前>` を足す。`cases` が無いマスの文は第10章どおり。

## 49. 絵師: モンスター

`web/assets/monsters/<id>.svg` と `web/assets/monsters/index.json`（`{"monsters":[{"id","name"}]}`、次の順で8件）:
`slime` スライム / `bat` こうもり / `mushroom` おばけきのこ / `ghost` ゴースト / `snake` へび / `golem` ゴーレム / `dragon` ドラゴン（中ボス） / `maou` 魔王。

制約は §10 の駒の絵と同じ（`viewBox="0 0 64 64"`、6000バイト以下、使える要素、`<title>` に日本語の名前、`stroke-width` 3 以下、描画要素4つ以上、8枚すべて違う絵）。ただし色は `none` `#1d2b5c` `#ffffff` `#d94a3a` `#ffe45c` `var(--monster, #ffffff)` のどれかで、体の塗りに `fill="var(--monster, #ffffff)"` を必ず使う（盤面が、生きている・倒した・復活したで塗り替える）。

## 50. 盤面: 縦の5mm方眼ノートの世界地図

ノート全体を1つの `svg#board` に描く（`#world` の中）。座標の単位 1目 = 5mm = `#grid-5mm` の `width`。

1. **ページ**: B5 の縦（1ページ 36×51 目）。`#paper` の中に `.page[data-page="<n>"]`（1始まり）がページの数だけあり、各ページに `.page-sheet` が1つ。方眼（`url(#grid-5mm)` で塗るもの）は、どれかの `.page-sheet` の中だけ。ページ 2k−1 と 2k が見開きで左右に並ぶ（綴じ目 `.page-gutter`）。ページの外は机。上の余白に印刷の `No.` `Date`。
2. **すべてを方眼に合わせる**: `#node-layer .node` と `#monster-layer .sq` は `data-page` と `data-box="x y w h"`（そのページの左上からの目の整数）を持ち、その紙（task・camp は `.cell-paper`、gate は `.gate-paper`、モンスターは `.sq-paper`）の `x y width height` は、ページの左上 + 目 × 1目 にちょうど一致する。題名（`.quest-title`）は1字1マス: `.quest-title .title-cell` が題名の字数だけあり、それぞれ1字で、`data-box` は目の整数で同じ大きさの正方形。`.quest-title` の字は題名。
3. **道はキャラクターごと**: `.road[data-char]` がキャラクターに1つ（ページごとに `[data-tool="marker"]` の線）。ページの上から下へ、まっすぐではなく曲がりながら下りる（どれかの道は横にも曲がる）。結合テストで合流し、また分かれる（今の規則どおり）。名札 `.lane-head[data-char]`（ふりだしの付箋。キャラに1つ、`.tape` つき）と、2ページ目からは道の上の小さな名札 `.lane-tag[data-char]`（そのキャラの駒が別のページにいれば `↓p.<n>`・`↑p.<n>`）。
4. **景色**: ページの空きに `.scenery[data-kind]`（`mountain` `forest` `lake` `sea` `town` `tree` `grass` ほか）。景色はマスではない（`.cell-paper`・`.gate-paper`・`.sq-paper` と重ならない）。各ページに1つ以上。
5. **マス = テスト1件 = モンスター**: `cmd` の task ごとに、ビューの `nodes[id].cases` の数だけ `#monster-layer .sq[data-node="<id>"][data-case="<添字>"]` を、そのダンジョンの出口（task の札）の手前の道に並べる（`data-ok` は `true` / `false` / `null`、`<title>` にテストの名前）。`cases` が `[]` なら `.sq[data-case="?"]` を1つ。倒したテスト（`ok === true`）は赤い斜線 `.slain`、復活したまま（`revived > 0` で `ok !== true`）は赤い丸 `.revived`。stamp の task・camp・gate の前にはモンスターを置かない。
6. **ダンジョンの出口・町・城**: task の札 `.node.task` に ID・持ち主・題（`.cell-title`）と、`cmd` なら `.cell-tests` に `テスト <p>/<t>`。抜けたら赤ペンのはなまる。町 `.node.camp` は宿屋の看板で、セーブしていれば `.save-commit` に `commit <7桁>`。ゲート `.node.gate` は、メンバーの道をまたぐ城壁の帯 `.gate-paper`（中ボス）。あがり `.node.goal` は魔王の城。ゲートの HP `.gate-hp` に `テスト <p>/<t>`（`cases` があれば）。人間のハンコの task は王様の城。
7. **駒**: `.pawn[data-char]` に `data-at`・`data-level`・`data-square`（ビューの `square`。task の上でなければ空）・`data-page`。task の上の駒は `.sq[data-node=<at>][data-case=<square>]` の上に立つ（`square` が `cases.length` なら出口の札の前）。
8. **見開きとページめくり**: 盤面は見開き（2ページ）を見せる。`#page-prev`・`#page-next` と `#page-no`（`<左>–<右> / <全部>`）。`window.__masume.spread`（見えている左のページ番号）・`window.__masume.pages`（ページの数）・`window.__masume.turnTo(<ページ番号>)`。めくっているあいだは `.page-flip` の葉（中身は `<use href="#world">`。DOM の数え方を変えない）が回る。駒が今の見開きの外のページへ進んだら、そのページの見開きへめくる。`prefers-reduced-motion: reduce` では、めくる動きなしで切り替わる。狭い画面（860px 以下）では1ページずつ。「全体」（`[data-zoom="fit"]`）は今の見開き全体。
9. **1マスずつ歩く**: 駒の (マス, `square`) が前に進んだら、間のマスを1つずつ踏んで進む。`window.__masume.walks` に `{char, from, to, steps}`（`steps` = 踏んだマスの数）を足す。
10. **エンディング**: ビューの `ending` があれば、`#ending`（`role="dialog"`）にその `text` を出す（新しい `ending.seq` のときに開く。`#ending-close` で閉じる）。
11. **名前と言葉**: `document.title` と見出しの `.logo` に `GridHub`。右の欄のなかま `.party-card[data-char]` に `<N>代目`・今のマスの `テスト <p>/<t>`・メダル。図鑑 `#bestiary` に `<defeated>/<total>`。
12. **作戦の窓**: 出撃の窓に `#sortie-tactic`（`careful` いのちだいじに / `balanced` バッチリがんばれ / `bold` ガンガンいこうぜ）。開くたびに `GET /api/party` の `tactic` を既定にし（`null` なら `balanced`）、`POST /api/sortie` の本文に `tactic` を必ず入れる。
13. 保つもの: §22（書き出しは、すべてのページを含むノート全体。viewBox にすべての `.page-sheet`、1目 = 5mm の実寸）、§29、§36.2〜§36.6（筆記具・字・物・動き・読みやすさ）、§37、`#drawer` `#live` `#integrity` `#record`（§52.4）、ロビー・出撃の窓、`#node-layer [data-node][data-state]` がすべてのマス、`.cell-hit`。§36.1 の綴じのリング（`.page-binding .ring`）は見開きのノートでは要らない。

## 51. あがり（第11章）

- `GOAL11`: 第1章〜第11章のすべての判定がまとめて通り、すべての冒険の書が正常で、README が GridHub として書かれている（ゲームの対応表・`gridhub step`・Git のセーブ・作戦・前後の盤面の絵）。盤面・CLI・MCP・docs に「じゅもん」が出てこない（§52.2）。
- `package.json` の `test:goal` は `GOAL11` に向ける。

## 52. ふっかつのじゅもんをやめる（第11章・ユーザーの指示）

ユーザーの評価（10/21）:「これいらない。これ昔のドラクエでしょ？」「意味のない、なくてもいいレガシー要素を入れるな」。
「いまの状態を短く指す」役目は、エンジニアが毎日使っている**記録の番号（seq）と Git のコミット**が果たす。
じゅもんは**互換のためにも残さない**（第10章までの判定は、GM が seq とコミットを見るように直して封印し直した）。

1. **残すもの**: 改ざんを見つける仕組み（ハッシュの鎖・地図と判定の出力のハッシュ・`verify`・`repair`）と、過去の時点に戻る機能（`load`）。
2. **外すもの**（どこにも出さない・受け付けない）:
   - `jumon` コマンド（ほかの知らないコマンドと同じ `E_USAGE`/2）。`--help` にも出さない（受付係の隠しコマンドも無くす）。
   - `verify --jumon`（知らないオプション `E_USAGE`/2）と、`load <じゅもん>`（§52.5 のどちらでもないので `E_LOAD`/2）。
   - ビューの `head.jumon`、`brief --json` の `jumon`、`verify --json` の `head.jumon`。
   - エンジンの `jumonOf`（`src/engine/index.js` から出さない）。`src/engine/jumon.js` と `src/commands/jumon.js` は消す。
   - MCP の道具 `masume_jumon` と、`masume_verify` の `jumon` 引数（`inputSchema.properties` は `{}`）。
   - 盤面の `#jumon` と `#copy-jumon`。
   - `src/**`・`bin/**`・`web/**`（見本の `web/fixtures/**` も作り直す）、`README.md`・`AGENTS.md`、`docs/` の RULEBOOK・SAVE_FORMAT・GM_GUIDE・GAME_DESIGN に「じゅもん」「jumon」と書かない。このファイル（CONTRACTS）では §52 だけが、外したことを書く。過去の記録（`.masume/` と見本の冒険の書・出力）は歴史なので書き換えない。
3. **ビューの `head`**（§5）は `{seq, hash, commit}`。
   - `seq`・`hash` は最後のイベント（今までどおり）。
   - `commit` は**その記録が見ていた Git のコミット**: 冒険の書を新しいほうから見て最初に見つかる、`saved` の `data.commit`（null でないもの）か、判定の記録（`check_passed` `check_failed` `gate_cleared` `gate_failed` `stepped`）の `data.git.head`（null でないもの）。40桁の16進。見つからなければ `null`。冒険の書だけから決まる（ビューを作るときに Git を呼ばない）。
   - `verify --json` の `head` も同じ `{seq, hash, commit}`（呪われていても、読めた所まで）。`brief --json` は `seq` と `commit`（= `head.commit`）。
4. **人に見せる目印**: `記録: seq <N>`。`head.commit` があれば、続けて ` / Git: commit <先頭7桁>`（例 `記録: seq 42 / Git: commit a1b2c3d`）。
   - 出すコマンド: `status`（最後の行）・`brief`・`new`・`amend`・`load`（最後の行）、`quest` のまとめ、`party` のあがりの行。
   - エージェントへのプロンプト（§13）で、指令書が読めなかったときの代わりの行は `記録: seq <N>`。
   - 盤面: 見出しの `#record`（`data-seq` = `head.seq`、`data-commit` = `head.commit` か空文字）。字は `seq <N>`、`commit` があれば続けて ` / commit <先頭7桁>`。そばの `#copy-record` を押すと `記録: seq <N>`（commit があれば ` / Git: commit <7桁>`）を写して、知らせ（`#toast .toast`）を出す。
   - 日誌・コミットメッセージ・PR・Linear のコメントでは、この字で「その時点」を指す。
5. **`load <S>`**（§4.9）:
   - `S` が数字だけなら seq。
   - そうでなく 4〜40 桁の16進なら **Git のコミット**（前方一致、大文字小文字を問わない）。そのコミットが冒険の書に**初めて**記録されたイベント（§52.3 と同じイベントと欄）の seq を戻り先にする（町の看板の commit なら、その町でセーブした時点）。見つからない、または2つ以上のコミットに当たる（曖昧）なら `E_LOAD`/2。
   - どちらでもなければ `E_LOAD`/2。戻り先が `0 <= S < 現在の seq` でなければ `E_LOAD`/2。
   - 記録は今までどおり `loaded {to_seq: S}`。**コードは戻さない**（コードは Git で戻す。`git checkout <commit>`、墓は `git stash apply <stash>`）。
6. **指し方のまとめ**（README・RULEBOOK に書くこと）: 盤面の時点は `seq`、コードの時点は Git のコミット。戻るのは `gridhub load <seq>` か `gridhub load <commit>`、改ざんを見つけるのは `gridhub verify`。
