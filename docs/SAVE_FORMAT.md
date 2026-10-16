# セーブデータ仕様（冒険の書 / masume 1）

この仕様は**実装と判定（E2E）の両方の正本**。ここに書いていない挙動に依存しないこと。

## 1. 置き場所

ゲームのルート（= 判定コマンドを実行するディレクトリ）に `.masume/` を作る。

```
<root>/.masume/
  log.jsonl          追記専用のイベントログ（正本）
  maps/0001.json     地図の版（genesis で 0001、amend ごとに +1。4桁ゼロ埋め）
  outputs/000042.log 判定の出力（イベント seq を6桁ゼロ埋め）
  state.json         再生結果のキャッシュ（任意。消してよい。正本ではない）
  lock               書き込みロック（一時ファイル）
```

ルートの決め方: `--dir <path>` > 環境変数 `MASUME_DIR`（空文字は未設定扱い） > カレントから親へ `.masume/log.jsonl` を探す。
`new` だけは `--dir` かカレントをルートにする。

## 2. 正規化JSON（canonical）とハッシュ

```
canonical(v):
  配列    → "[" + 要素を canonical して "," で連結 + "]"
  オブジェクト(null以外) → "{" + キーを Unicode コードポイント順にソートし、値が undefined のキーを除いて
            JSON.stringify(key) + ":" + canonical(value) を "," で連結 + "}"
  それ以外 → JSON.stringify(v)
```

- イベントのハッシュ: `hash = sha256_hex(canonical({seq, ts, type, actor, data, prev}))`
- 地図のハッシュ: `map_hash = sha256_hex(canonical(map))`（ファイルのバイト列ではなく、パースした値）
- ファイルの封印ハッシュ・出力ハッシュ: ファイルのバイト列の `sha256_hex`

## 3. イベント行

`log.jsonl` の1行 = 1イベント = 次の JSON（キー順は自由、改行で終わる）:

```json
{"seq":0,"ts":"2026-10-16T05:00:00.000Z","type":"genesis","actor":"gm","data":{...},"prev":"000…0","hash":"…"}
```

| キー | 内容 |
| --- | --- |
| `seq` | 0 から 1 ずつ増える整数 |
| `ts` | ISO 8601 UTC（`new Date().toISOString()`） |
| `type` | 下の表のどれか |
| `actor` | 書いた人（`--as` > `MASUME_ACTOR` > `"gm"`） |
| `data` | 型ごとの中身（オブジェクト） |
| `prev` | 1つ前の `hash`。seq 0 は `"0"` を64個 |
| `hash` | 上の式 |

### イベントの型（事実だけを記録する。効果は再生で導く）

| type | data | 意味 |
| --- | --- | --- |
| `genesis` | `{masume:1, rules:1, quest_id, version:1, map_file:"maps/0001.json", map_hash}` | 冒険の書の誕生。必ず seq 0 |
| `sealed` | `{node, files:{"<相対パス>":"<sha256>"}}` | 判定ファイルの封印（GM） |
| `seal_broken` | `{character, node, files:[{path, expected, actual}]}` | 判定しようとしたら封印が破れていた（actual はファイルが無ければ null） |
| `check_passed` | `{character, node, ran:[nodeId…], output, output_hash, duration_ms, git}` | 宣言判定の成功 |
| `check_failed` | `{character, node, failed, ran:[nodeId…], output, output_hash, duration_ms, git}` | 宣言判定の失敗（`failed` = 落ちたマス） |
| `gate_cleared` | `{gate, members:[…], output, output_hash, duration_ms, git}` | ボス戦勝利 |
| `gate_failed` | `{gate, members:[…], blamed:[…], output, output_hash, duration_ms, git}` | ボス戦敗北 |
| `stamped` | `{character, node, by}` | 人間のハンコ（`character` = マスの持ち主） |
| `note` | `{character, text}` | 日誌 |
| `amended` | `{version, map_file, map_hash}` | 地図の改訂 |
| `loaded` | `{to_seq}` | 過去の状態のロード |

- `output` は `.masume` からの相対パス（例 `"outputs/000042.log"`）。`output_hash` はその中身の sha256。
- `git` は `{head:"<sha>"|null, dirty:true|false}`。ルートが git 管理外なら `null`。
- 知らない `type` は再生時に無視する（前方互換）。

## 4. 再生（状態の導出）

状態は `log.jsonl` を seq 0 から順に適用して作る。規則は [RULEBOOK.md](RULEBOOK.md) と [CONTRACTS.md](CONTRACTS.md) §4。

- `loaded{to_seq:S}` を適用するときは、状態を「seq 0..S を再生した状態」で置き換える（地図の版・封印も含めて）。
- `state.json` を使う場合は `{head_seq, head_hash, state}` を保存し、`log.jsonl` の末尾と一致するときだけ使う。

## 5. 書き込み（ロック）

1. `.masume/lock` を `open(..., 'wx')` で作る（中身 `{pid, actor, ts}`）。作れなければ 50ms 待って再試行、最大15秒。
   ロックファイルが30秒以上古ければ壊れたロックとみなして消してよい。
2. ロック中に `log.jsonl` の末尾を読み直し、`seq = 末尾+1`、`prev = 末尾hash` で行を作り、追記して fsync。
3. ロックを消す。

判定コマンドの実行中はロックを持たない。判定前に読んだキャラクター（ゲートならメンバー全員）の状態が、
追記直前に読み直した状態と違っていたら、その判定は記録せずに `E_CONFLICT`（終了コード2）で終える。

## 6. 検証と修復

`verify` は次をすべて確かめる。1つでも駄目なら「呪われています」。

| code | 内容 |
| --- | --- |
| `E_PARSE` | 行が JSON として読めない（途中で切れた行を含む） |
| `E_SEQ` | seq が 0 から連番でない |
| `E_PREV` | prev が1つ前の hash と違う |
| `E_HASH` | hash を計算し直すと違う |
| `E_GENESIS` | seq 0 が genesis でない |
| `E_MAP` | genesis/amended の地図ファイルが無い・ハッシュが違う |
| `E_OUTPUT` | 判定出力ファイルが無い・ハッシュが違う |

エラーの `seq` は、その行の位置（0始まりの行番号）。

`repair` は、最初に壊れていたイベントより前だけを残して `log.jsonl` を書き直し（一時ファイル→rename）、
後ろ（壊れた行を含む）を `.masume/log.corrupt-<タイムスタンプ>.jsonl` に退避する。seq 0 が壊れていたら修復できない（終了コード3）。

`verify`/`repair`/`jumon`/`log` 以外のコマンドは、呪われた冒険の書では動かない（`E_CURSED`、終了コード3）。

## 7. ふっかつのじゅもん

64文字のかな表（この順番が仕様）:

```
あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ
```

```
jumon(hashHex):
  n = BigInt("0x" + hashHex.slice(0, 18))      // 先頭72ビット
  i = 0..11 について  k = (n >> BigInt(66 - 6*i)) & 63n → 表[k]
  12文字を3文字ずつ半角スペースで区切る         // 例 "ゆうて いみや おうき むこう"
```

- 現在のじゅもん = 最新イベントの hash のじゅもん。
- 入力の正規化: 空白（半角・全角）を除き、カタカナはひらがなに直してから12文字で比較する。
- じゅもんから seq を探すときは、ログ中でじゅもんが一致するイベントのうち最も新しいものを使う。
