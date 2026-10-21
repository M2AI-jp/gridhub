# CONTRACTS — メモアプリのモジュール間の約束

Node.js 20+ の標準ライブラリだけ。ESM（拡張子は `.mjs`）。外部パッケージなし。

## 1. 縄張り

| キャラクター | ID | 縄張り |
| --- | --- | --- |
| 倉庫番（保存） | `store` | `src/store/**` |
| 伝令（サーバーと API） | `api` | `src/server/**` |
| 絵師（画面） | `ui` | `web/**` |
| 勇者（人間） | `hero` | なし（ハンコだけ） |

`checks/**` `CONTRACTS.md` `ASSUMPTIONS.md` `quest.map.json` は GM の縄張り（封印済み。編集しない）。

## 2. ストア（`src/store/memo-store.mjs`）

```js
export async function createStore(dir) -> Store
```

- `dir` が無ければ作る。データは `<dir>/memos.json`（中身の形は自由、有効な JSON）に保存する。
- 書き込みのたびにファイルへ保存してから resolve する（一時ファイル + rename が望ましい）。`createStore(dir)` を作り直すと、前のデータが読める。
- 同時に呼ばれても取りこぼさない（書き込みを直列にする）。

```js
Store.create({ title?, body? }) -> Promise<Memo>
Store.list({ q? } = {})         -> Promise<Memo[]>      // 新しく作った順（作成の新しいものが先頭）
Store.get(id)                   -> Promise<Memo | null>
Store.update(id, { title?, body? }) -> Promise<Memo>    // 指定した項目だけ変える。updatedAt 更新。一覧の順序は変えない
Store.remove(id)                -> Promise<void>
```

`Memo` = `{ id: string, title: string, body: string, createdAt: string, updatedAt: string }`
（日時は `new Date().toISOString()` の形式。`id` は空でない文字列で、消した後も再利用しない）。

- `title` 省略時は `""`、`body` 省略時は `""`。文字列はそのまま保存する（trim しない）。
- 検査（`create` と、更新後の値に対する `update`）。失敗したら何も変えず、`error.code` 付きの `Error` で reject する:
  - `E_INVALID`: 入力がオブジェクトでない、`title` / `body` が（あれば）文字列でない（`null` も不可）
  - `E_TOO_LONG`: `title` が 100 文字超、`body` が 10000 文字超
  - `E_EMPTY`: `title` も `body` も、空白を除くと空
  - `E_NOT_FOUND`: `update` / `remove` で id が無い
- `list({ q })`: `q` が空・空白だけ・省略なら全件。そうでなければ `title` または `body` に `q`（前後の空白は除く）を**文字列として**含むもの（大文字小文字を区別しない）。順序は新しい順のまま。

## 3. サーバー（`src/server/main.mjs`、`node src/server/main.mjs` で起動）

環境変数:

| 名前 | 意味 | 既定 |
| --- | --- | --- |
| `PORT` | 待ち受けポート。`0` なら空いているポート | `3000` |
| `MEMO_DATA_DIR` | `createStore` に渡すフォルダ | `<ルート>/data` |
| `MEMO_WEB_DIR` | 静的ファイルのフォルダ | `<ルート>/web` |
| `MEMO_STORE_MODULE` | ストアのモジュールの**絶対パス**（`createStore` を export）。判定がにせストアに差し替える | `src/store/memo-store.mjs` |

`<ルート>` は `main.mjs` の場所（`src/server/`）から `../..`。

- `127.0.0.1` だけで待ち受ける。待ち受けが始まったら標準出力に 1 行 `LISTENING http://127.0.0.1:<実際のポート>` を出す。
- `SIGTERM` を受けたら、新しい接続を止め、つながっている接続も閉じて、終了コード 0 で終わる。
- `MEMO_STORE_MODULE` のモジュールは起動時に動的 `import()` する。

### 静的ファイル

- `GET /` は `MEMO_WEB_DIR/index.html`。`GET /<パス>` は `MEMO_WEB_DIR` の下のファイル。`GET` と `HEAD` だけ。
- Content-Type: `.html` → `text/html; charset=utf-8` / `.mjs` `.js` → `text/javascript; charset=utf-8` / `.css` → `text/css; charset=utf-8` / `.json` → `application/json; charset=utf-8` / ほか → `application/octet-stream`。
- ファイルが無ければ 404。`MEMO_WEB_DIR` の外は絶対に読まない（`/../x`、`/%2e%2e/x`、`/..%2fx` は 400 か 404）。`/api/` で始まるパスは静的ファイルにしない。

### API（JSON。応答の Content-Type は `application/json; charset=utf-8`）

| リクエスト | 成功 | 備考 |
| --- | --- | --- |
| `GET /api/health` | 200 `{"ok":true}` | |
| `GET /api/memos[?q=語]` | 200 `{"memos":[Memo,…]}` | `Store.list({q})`。q 省略は `""` 扱い |
| `POST /api/memos` | 201 `Memo` | 本文 `{title?, body?}` |
| `GET /api/memos/:id` | 200 `Memo` | 無ければ 404 `E_NOT_FOUND`。`:id` は URL デコードする |
| `PUT /api/memos/:id` | 200 `Memo` | 本文 `{title?, body?}`（部分更新） |
| `DELETE /api/memos/:id` | 204（本文なし） | |

- リクエスト本文から**取り出すのは `title` と `body` だけ**。`id` などの余計な項目はストアに渡さない。
- エラーは `{"error":"<CODE>","message":"<人が読める説明>"}`:
  - ストアの `E_EMPTY` `E_TOO_LONG` `E_INVALID` → 400、`E_NOT_FOUND` → 404（`error` にはストアのコードをそのまま入れる）
  - 本文が壊れた JSON（空本文を含む）→ 400 `E_BAD_JSON`。JSON だがオブジェクトでない（配列・文字列・数値）→ 400 `E_INVALID`
  - 未知の `/api/…` → 404 `E_NO_ROUTE`
  - 既知のパスで使えないメソッド（`/api/memos` への `PATCH` `DELETE`、`/api/memos/:id` への `POST` など）→ 405 `E_METHOD`
  - 想定外の例外 → 500 `E_INTERNAL`（サーバーは落ちない）

## 4. 画面（`web/`）

すべて `web/` の中。ブラウザでもそのまま動く ES モジュール（ビルドなし）。ファイルは `/` から始まる絶対パスで参照し合うか、`./相対` で import する。

### `web/index.html`

- `<!doctype html>`、`<html lang="ja">`、`<meta charset="utf-8">`、viewport、`<title>` に「メモ」。
- `<link rel="stylesheet" href="/style.css">` と `<script type="module" src="/app.mjs"></script>`。
- 次の id を持つ要素（`app.mjs` がこの id で拾う）:

| id | 要素 | 説明 |
| --- | --- | --- |
| `memo-form` | `form` | 中に `input#memo-title`（`maxlength="100"`）、`textarea#memo-body`、`button[type=submit]` |
| `memo-search` | `input`（`type="search"` か `type="text"`） | 検索語 |
| `memo-list` | `ul` | 一覧。中身は `renderMemoList` が作る |
| `memo-empty` | 任意 | 「メモがありません」などの表示。最初は `hidden` でもよい |
| `memo-error` | 任意 | `role="alert"`、最初は `hidden` |

### `web/memo-view.mjs`

- `escapeHtml(s)`: `& < > " '` を `&amp; &lt; &gt; &quot; &#39;` に置き換えた文字列。
- `renderMemoList(memos)`: `Memo[]` を、渡された順のまま `<li>` の連なり（HTML 文字列）にする。空配列なら空文字。1 件は次の形（属性の順は不問）:

```html
<li class="memo" data-id="ID">
  <h3 class="memo-title">タイトル（空なら (無題)）</h3>
  <p class="memo-body">本文</p>
  <time class="memo-time" datetime="updatedAt">表示用の日時</time>
  <button type="button" class="memo-edit" data-action="edit">編集</button>
  <button type="button" class="memo-delete" data-action="delete">削除</button>
</li>
```

ユーザー入力（id・title・body）は必ずエスケープする。本文の改行は CSS `white-space: pre-wrap` で見せる（`<br>` に置き換えない）。

### `web/api-client.mjs`

```js
export function createClient(baseUrl = '', fetchImpl = globalThis.fetch) -> { list, create, update, remove }
```

- `list(q?)` → `GET {base}/api/memos`（`q` が空でなければ `?q=` + `encodeURIComponent(q)`）。`memos` の配列を返す。
- `create({title, body})` → `POST`、JSON 本文、`content-type: application/json`。作られた Memo を返す。
- `update(id, patch)` → `PUT {base}/api/memos/{encodeURIComponent(id)}`。更新後の Memo を返す。
- `remove(id)` → `DELETE`。`undefined` を返す。
- 2xx 以外は `Error` で reject する。`error.status`（HTTP ステータス）、本文が JSON なら `error.code`（= `error`）と `error.message`（= `message`）。つながらないときも reject。
- `fetchImpl(url: string, init: {method, headers, body})` の形で呼ぶ。`baseUrl` が空なら `url` は `/api/memos…` の相対パス。

### `web/controller.mjs`

```js
export function createController({ client, onChange }) -> { state, init, save, startEdit, cancelEdit, remove, search }
```

- `state`（読み取り専用の getter）= `{ memos: Memo[], query: string, editingId: string|null, error: string|null }`。最初は `{ memos: [], query: '', editingId: null, error: null }`。
- 状態が変わるたびに `onChange(state)` を呼ぶ。
- すべて Promise を返してよい（`await` される）。**失敗しても throw せず**、`state.error` に文字列を入れる。
- `init()` — `client.list(state.query)` で `memos` を読む。
- `save({title, body})` — `title` も `body` も空白だけなら `client` を呼ばず `error` を入れる。`editingId` があれば `client.update(editingId, {title, body})`、無ければ `client.create({title, body})`。成功したら `editingId = null`、`error = null` にして、現在の `query` で一覧を読み直す。失敗したら `error` を入れ、`editingId` と `memos` は変えない。
- `startEdit(id)` — `state.memos` にある id のときだけ `editingId = id`。`cancelEdit()` — `editingId = null`。
- `remove(id)` — `client.remove(id)` して一覧を読み直す。消したのが編集中のメモなら `editingId = null`。
- `search(q)` — `query = q` にして `client.list(q)`。**後から始めた読み込みが勝つ**（遅れて返った古い結果で `memos` を上書きしない）。

### `web/app.mjs`

DOM とのつなぎ。`./api-client.mjs` `./controller.mjs` `./memo-view.mjs` を import し、上の id の要素を拾って:

- 送信で `controller.save`（編集中ならフォームに値を入れ、保存後に空に戻す）、検索欄の入力で `controller.search`、一覧の `data-action="edit"|"delete"` ボタンのクリックで `startEdit` / `remove`（イベント委譲）。
- `onChange` で `memo-list.innerHTML = renderMemoList(state.memos)`、`memo-empty` の表示切り替え、`memo-error` の表示。
- 読み込み時に `controller.init()`。`createClient('')`（同じオリジン）を使う。

### `web/style.css`

読みやすい最小限のスタイル。`.memo` のカードと、本文の `white-space: pre-wrap` を含む。
