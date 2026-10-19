# はじめてのマスメ

勇者が決めた名前で、見習いAIがあいさつカードを作る冒険です。初回は1人で両方の役を担当できます。人間がエージェント役を演じるので、AIの契約や外部サービスへの接続は不要です。

Node.js 20以上と、macOS・Linuxのターミナル（bashまたはzsh）を使います。所要時間は、以下の例をそのまま使う場合で約5分を目安にしています。

この手順は [CLIの契約](../../docs/CONTRACTS.md) に沿っています。開発途中の本体で `[E_NOT_YET]` が出た場合、そのコマンドはまだ未実装です。GMに伝えてください。`node checks/…` の素振りは、本体の進行コマンドがそろう前でも実行できます。

## 1. 冒険の書を作る — masume new

マスメのリポジトリのルートで、次のブロックを実行します。この場所では `bin/masume.js` と `quests/tutorial/` が見えます。

```sh
TUTORIAL_REPO="$PWD"
TUTORIAL_PLAY="$(mktemp -d "${TMPDIR:-/tmp}/masume-tutorial.XXXXXX")"
cp -R "$TUTORIAL_REPO/quests/tutorial/." "$TUTORIAL_PLAY/"
cd "$TUTORIAL_PLAY"
masume() (exec node "$TUTORIAL_REPO/bin/masume.js" "$@" --dir "$TUTORIAL_PLAY")
masume new tutorial.map.json
```

`masume` は、このターミナルでリポジトリのCLIを呼ぶための関数です。インストールは不要です。コピー先が今回のゲームのルートになり、作業ファイルと進行記録の `.masume/` がそこに保存されます。元のチュートリアルは次の人も遊べる状態で残ります。

`new` は判定スクリプトを自動で封印します。遊ぶ人が編集するのは `human/` と `ai/` の中だけです。地図・`checks/`・`SOLUTIONS.json` は編集しません。

## 2. 盤面を開く — masume serve

同じターミナルで続けます。

```sh
node "$TUTORIAL_REPO/bin/masume.js" serve --port 0 --dir "$TUTORIAL_PLAY" &
TUTORIAL_SERVER_PID=$!
```

表示された `盤面: http://127.0.0.1:…/` のURLをブラウザーで開きます。`--port 0` は空いているポートを選び、`&` は盤面を動かしたままターミナルで続きを入力できるようにします。以降の操作も同じターミナルで行います。

サーバーは `node` で直接起動し、`$!` でサーバー本体のプロセスIDを保存します。最後にこのIDを使ってサーバーを止めます。

## 3. 勇者が名前を決める — masume brief → 作業 → masume stamp

指令書を読むコマンドが `brief` です。まず勇者（ID: `player`）の現在のマス H1 を読みます。

```sh
masume brief player
```

勇者の縄張りは `human/**`、つまり `human/` の中です。名前は自由に決められますが、初回は以下の「マスメ」で進めると、残りの例をそのまま使えます。

```sh
mkdir -p human
cat > human/request.json <<'JSON'
{"name":"マスメ"}
JSON
```

`human/request.json` を読んで、その名前でよいと判断したらハンコを押します。

```sh
masume stamp H1 --as player
```

勇者は途中のゲート G1 で待機します。ゲートは仲間が合流して成果を確かめるマスです。ハンコは人間の判断を記録する操作で、ファイルの中身は G1 の判定で検査します。H1 の後はお願いの名前を変えません。

## 4. 見習いAIがあいさつを書く — masume brief → 作業 → masume check

ここからは見習いAI（ID: `apprentice`）の役を演じます。縄張りは `ai/**` です。現在のマス A1 を読みます。

```sh
masume brief apprentice
```

`ai/hello.txt` に、勇者が決めた名前を使って一行のあいさつを書きます。

```sh
mkdir -p ai
cat > ai/hello.txt <<'TEXT'
こんにちは、マスメ！
TEXT
node checks/hello.mjs
masume check apprentice --as apprentice
```

`node checks/hello.mjs` は進行を記録しない練習の判定（素振り）、`masume check` は結果を記録して駒を進める宣言判定です。素振りが失敗したら、表示された理由に沿って直してから `masume check` を実行します。

## 5. カードを作って合流する

次のマス A2 を読み、名前とあいさつをJSONに写します。

```sh
masume brief apprentice
cat > ai/card.json <<'JSON'
{"name":"マスメ","message":"こんにちは、マスメ！"}
JSON
node checks/card.mjs
masume check apprentice --as apprentice
```

A2 の宣言判定は、A1 のあいさつも再検査します。これが累積判定です。A2 が通ると2人が G1 にそろうので、お願いの名前とカードが一致するか自動で判定します。表示に `結合ゲート突破` が出れば成功です。

見習いAIは宿屋 C1 を自動で通過し、次のマス A3 に進みます。宿屋への操作は不要です。宿屋は失敗したときの戻り先となり、ここより前の進行が消されるのを防ぎます。作ったファイルは引き続き使います。

## 6. 完成の印を付け、勇者が承認する

見習いAIの指令書を読み、カードに `"ready": true` を追加します。自分で名前を変えた場合は、ここでも同じ名前とあいさつを保ってください。

```sh
masume brief apprentice
cat > ai/card.json <<'JSON'
{"name":"マスメ","message":"こんにちは、マスメ！","ready":true}
JSON
node checks/ready.mjs
masume check apprentice --as apprentice
```

見習いAIがあがりのゲートで待つ間に、勇者として最終確認のマス H2 を読みます。

```sh
masume brief player
cat human/request.json ai/hello.txt ai/card.json
```

お願いの名前、あいさつ、カードの内容が一致し、`ready` が `true` になっていることを人間が確認してから、完成を承認します。

```sh
masume stamp H2 --as player
masume status --json
```

最後のゲート GOAL も自動で判定されます。`finished` が `true` になり、2人の `status` が `done` なら、この冒険は完了です。盤面を閉じるときは、このターミナルで起動したサーバーを止めます。

```sh
kill "$TUTORIAL_SERVER_PID"
wait "$TUTORIAL_SERVER_PID"
```

## 途中で止まったとき

- ファイルの判定が落ちたら、エラーに出たファイルと項目を直します。JSONの `true` と文字列の `"true"` は別の値です。
- 宣言判定で失敗したら `masume brief <自分のID>` を読み直します。ゲートの `MASUME_BLAME: player` は勇者のお願い、`MASUME_BLAME: apprentice` はAIのあいさつかカードの修正が必要という意味です。戻された役が現在のマスを直して再判定・再ハンコし、仲間がそろうと再戦します。待機中の役は成果物を保ちます。
- `揃っていません` は仲間待ちです。`masume brief player` と `masume brief apprentice` で現在地を見て、まだ到着していない役のマスを進めます。
- `未封印` や `封印が破れています` が出たら、判定を編集せずGMに伝えます。
- 中断するときはゲームのルートのパスを `pwd` で控えます。別のターミナルでは `node "/リポジトリの場所/bin/masume.js" brief apprentice --dir "/控えたゲームのルート"` のように再開できます。一時フォルダーはOSが削除する場合があるので、長く残したい冒険はフォルダーごと保管してください。

## 解答と、この地図をお手本にする人へ

`SOLUTIONS.json` はマスIDごとに保存するファイルの `path` と `content` をまとめた解答です。困ったときに現在のマスの項目を読み、`content` を対応する `path` に保存してください。サンプルの名前はすべて「マスメ」です。自分で名前を変えた場合は、その名前にそろえます。ハンコや駒の移動は、ファイルを保存した後に行います。

G1・C1・H2・GOAL の配列は空です。これらは新しい成果物を作るマスではありません。A3 は A2 の `ai/card.json` を完成版に更新します。解答を試す場合も、各役の道の順に当てます。判定スクリプトは解答ファイルを読みません。

地図の設計は [GMガイド](../../docs/GM_GUIDE.md) に沿い、次の前提を置いています。

- 完成の場面は「人間が承認した名前入りのあいさつカードを読める」です。GOAL はお願い・本文・カード・完成の印をまとめて検査し、人間の承認は H2 のハンコで記録します。
- 約5分で役割の違いを体験するため、この入門編は通常の人数・作業時間の目安を縮め、2人・8マスにしています。各作業はファイル1つを数十秒で書ける大きさです。
- 人間の縄張りは `human/**`、見習いAIの縄張りは `ai/**` です。地図・判定・解答はGMの教材です。
- 2つの成果が初めてつながる G1 で名前の一致を確かめます。G1 の後は見習いAIが仕上げ、人間が最後に承認します。ゲートの責任判定は `human/request.json` を人間が決めた名前の正本として扱います。
- 各マスの `detail` に作業と合格条件を書き、判定の `seal` には入口のスクリプトと共有処理 `checks/common.mjs` の両方を含めています。判定はゲームのルートをカレントディレクトリとして実行し、成果物を読み取るだけなので繰り返し実行できます。

教材を変更したGMは、リポジトリのルートで次の素振りを実行できます。

```sh
node bin/masume.js validate quests/tutorial/tutorial.map.json
node --test tests/e2e/M2.test.mjs
```
