# はじめての GridHub

勇者が決めた名前で、見習いAIがあいさつカードを作る冒険です。初回は1人で両方の役を担当できます。人間がエージェント役を演じるので、AIの契約や外部サービスへの接続は不要です。

Node.js 22以上と、macOS・Linuxのターミナル（bashまたはzsh）を使います。所要時間は、以下の例をそのまま使う場合で約5分を目安にしています。

GridHub の看板は「テスト1件 = 1マス」です。この冒険の見習いAIのマスには、テストが3件・4件・2件あります。`gridhub step`（歩く）で1件ずつ倒し、全部倒したら `gridhub check`（宣言判定）で次のマスへ進みます。

## 1. 冒険の書を作る — gridhub new

GridHub のリポジトリのルートで、次のブロックを実行します。この場所では `bin/gridhub.js` と `quests/tutorial/` が見えます。

```sh
TUTORIAL_REPO="$PWD"
TUTORIAL_PLAY="$(mktemp -d "${TMPDIR:-/tmp}/gridhub-tutorial.XXXXXX")"
cp -R "$TUTORIAL_REPO/quests/tutorial/." "$TUTORIAL_PLAY/"
cd "$TUTORIAL_PLAY"
gridhub() (exec node "$TUTORIAL_REPO/bin/gridhub.js" "$@" --dir "$TUTORIAL_PLAY")
gridhub new tutorial.map.json
```

`gridhub` は、このターミナルでリポジトリのCLIを呼ぶための関数です。インストールは不要です。コピー先が今回のゲームのルートになり、作業ファイルと進行記録の `.masume/` がそこに保存されます。元のチュートリアルは次の人も遊べる状態で残ります。

npm で入れた人（リポジトリを持っていない人）は、最初の行を `TUTORIAL_REPO="$(npm root -g)/gridhub"` にします。チュートリアルは包みに入っています。

`new` は判定スクリプトを自動で封印します。遊ぶ人が編集するのは `human/` と `ai/` の中だけです。地図・`checks/`・`SOLUTIONS.json` は編集しません。

## 2. 盤面を開く — gridhub serve

同じターミナルで続けます。

```sh
node "$TUTORIAL_REPO/bin/gridhub.js" serve --port 0 --dir "$TUTORIAL_PLAY" &
TUTORIAL_SERVER_PID=$!
```

ブラウザーに盤面が開きます（ターミナルから起動すると自動で開きます。開かなければ、表示された `盤面: http://127.0.0.1:…/` のURLを開いてください）。`--port 0` は空いているポートを選び、`&` は盤面を動かしたままターミナルで続きを入力できるようにします。以降の操作も同じターミナルで行います。

サーバーは `node` で直接起動し、`$!` でサーバー本体のプロセスIDを保存します。最後にこのIDを使ってサーバーを止めます。

## 3. 勇者が名前を決める — gridhub brief → 作業 → gridhub stamp

指令書を読むコマンドが `brief` です。まず勇者（ID: `player`）の現在のマス H1 を読みます。

```sh
gridhub brief player
```

勇者の縄張りは `human/**`、つまり `human/` の中です。名前は自由に決められますが、初回は以下の「GridHub」で進めると、残りの例をそのまま使えます。

```sh
mkdir -p human
cat > human/request.json <<'JSON'
{"name":"GridHub"}
JSON
```

`human/request.json` を読んで、その名前でよいと判断したらハンコを押します。ハンコは「だれが押したか」の記録なので、`--as` は省略できません。

```sh
gridhub stamp H1 --as player
```

勇者は途中のゲート G1 で待機します。ゲートは仲間が合流して成果を確かめるマスです。ハンコは人間の判断を記録する操作で、ファイルの中身は G1 の判定で検査します。H1 の後はお願いの名前を変えません。

## 4. 見習いAIがあいさつを書く — gridhub brief → gridhub step → 作業 → gridhub check

ここからは見習いAI（ID: `apprentice`）の役を演じます。縄張りは `ai/**` です。現在のマス A1 を読み、まず何も書かずに歩いてみます。

```sh
gridhub brief apprentice
gridhub step apprentice
```

`step` は、このマスの判定だけを走らせて、テスト1件ずつの成否を記録します。何度でも打てて、罰はありません。いまは3件とも落ちていて、`いちばん手前のモンスター: ai/hello.txt がある` と出ます。これが、次に倒すテストです。

```
歩いた: apprentice A1 テスト 0/3
  ✖ ai/hello.txt がある
  ✖ 「こんにちは、」で始まる
  ✖ 名前のあとが「！」で終わる
いちばん手前のモンスター: ai/hello.txt がある
```

`ai/hello.txt` に、勇者が決めた名前を使って一行のあいさつを書き、もう一度歩きます。

```sh
mkdir -p ai
cat > ai/hello.txt <<'TEXT'
こんにちは、GridHub！
TEXT
gridhub step apprentice
```

3件とも `✔` になり、`全部倒した。出口で宣言する` と出ます。盤面では、見習いAIの道の3マスが塗られています。出口で宣言判定をします。

```sh
gridhub check apprentice
```

`gridhub check` は結果を記録して駒を進める宣言判定です（一発勝負。落ちるとレベルが下がります）。`--as` を付けなくても、渡したIDの記録になります。`✖` が残っているときは、表示された理由に沿って直してから `gridhub step` で確かめ、全部 `✔` になってから `gridhub check` を実行します。

## 5. カードを作って合流する

次のマス A2 を読み、名前とあいさつをJSONに写します。A2 のテストは4件です。

```sh
gridhub brief apprentice
cat > ai/card.json <<'JSON'
{"name":"GridHub","message":"こんにちは、GridHub！"}
JSON
gridhub step apprentice
gridhub check apprentice
```

A2 の宣言判定は、A1 のあいさつも再検査します。これが累積判定です。A2 が通ると2人が G1 にそろうので、お願いの名前とカードが一致するか自動で判定します。表示に `結合ゲート突破` が出れば成功です。

見習いAIは宿屋 C1 を自動で通過し、次のマス A3 に進みます。宿屋への操作は不要です。宿屋は失敗したときの戻り先となり、ここより前の進行が消されるのを防ぎます。作ったファイルは引き続き使います。

## 6. 完成の印を付け、勇者が承認する

見習いAIの指令書を読み、カードに `"ready": true` を追加します。自分で名前を変えた場合は、ここでも同じ名前とあいさつを保ってください。A3 のテストは2件です。

```sh
gridhub brief apprentice
cat > ai/card.json <<'JSON'
{"name":"GridHub","message":"こんにちは、GridHub！","ready":true}
JSON
gridhub step apprentice
gridhub check apprentice
```

見習いAIがあがりのゲートで待つ間に、勇者として最終確認のマス H2 を読みます。

```sh
gridhub brief player
cat human/request.json ai/hello.txt ai/card.json
```

お願いの名前、あいさつ、カードの内容が一致し、`ready` が `true` になっていることを人間が確認してから、完成を承認します。

```sh
gridhub stamp H2 --as player
gridhub status
```

最後のゲート GOAL も自動で判定されます。`gridhub status` で2人とも `あがり` になり、`この章はあがり` と出れば、この冒険は完了です。盤面にはエンディングが出ます。何が起きたかを最初から読み返すなら `gridhub log` です。盤面を閉じるときは、このターミナルで起動したサーバーを止めます。

```sh
kill "$TUTORIAL_SERVER_PID"
wait "$TUTORIAL_SERVER_PID"
```

## 途中で止まったとき

- `gridhub step` で `✖` のテストが残ったら、その下に出る判定の出力（`不合格:` や `AssertionError` の行）を読んで、言われたファイルと項目を直します。JSONの `true` と文字列の `"true"` は別の値です。
- 宣言判定で失敗したら `gridhub brief <自分のID>` を読み直します。ゲートの `MASUME_BLAME: player` は勇者のお願い、`MASUME_BLAME: apprentice` はAIのあいさつかカードの修正が必要という意味です。戻された役が現在のマスを直して再判定・再ハンコし、仲間がそろうと再戦します。待機中の役は成果物を保ちます。
- `揃っていません` は仲間待ちです。`gridhub brief player` と `gridhub brief apprentice` で現在地を見て、まだ到着していない役のマスを進めます。
- `未封印` や `封印が破れています` が出たら、判定を編集せずGMに伝えます。
- 中断するときはゲームのルートのパスを `pwd` で控えます。別のターミナルでは `node "/リポジトリの場所/bin/gridhub.js" brief apprentice --dir "/控えたゲームのルート"` のように再開できます。一時フォルダーはOSが削除する場合があるので、長く残したい冒険はフォルダーごと保管してください。

## 解答と、この地図をお手本にする人へ

`SOLUTIONS.json` はマスIDごとに保存するファイルの `path` と `content` をまとめた解答です。困ったときに現在のマスの項目を読み、`content` を対応する `path` に保存してください。サンプルの名前はすべて「GridHub」です。自分で名前を変えた場合は、その名前にそろえます。ハンコや駒の移動は、ファイルを保存した後に行います。

G1・C1・H2・GOAL の配列は空です。これらは新しい成果物を作るマスではありません。A3 は A2 の `ai/card.json` を完成版に更新します。解答を試す場合も、各役の道の順に当てます。判定スクリプトは解答ファイルを読みません。

地図の設計は [GMガイド](../../docs/GM_GUIDE.md) に沿い、次の前提を置いています。

- 完成の場面は「人間が承認した名前入りのあいさつカードを読める」です。GOAL はお願い・本文・カード・完成の印をまとめて検査し、人間の承認は H2 のハンコで記録します。
- 約5分で役割の違いを体験するため、この入門編は通常の人数・作業時間の目安を縮め、2人・8マスにしています。各作業はファイル1つを数十秒で書ける大きさです。
- 人間の縄張りは `human/**`、見習いAIの縄張りは `ai/**` です。地図・判定・解答はGMの教材です。
- 見習いAIのマス A1〜A3 の判定は `node:test` のテストで、テストの名前は地図の `check.cases` と同じです（1件 = 1マス）。ゲート G1・GOAL の判定は、だれに差し戻すか（`MASUME_BLAME`）を出す1本のスクリプトです。
- 2つの成果が初めてつながる G1 で名前の一致を確かめます。G1 の後は見習いAIが仕上げ、人間が最後に承認します。ゲートの責任判定は `human/request.json` を人間が決めた名前の正本として扱います。
- 各マスの `detail` に作業と合格条件を書き、判定の `seal` には入口のスクリプトと共有処理 `checks/common.mjs` の両方を含めています。判定はゲームのルートをカレントディレクトリとして実行し、成果物を読み取るだけなので繰り返し実行できます。

教材を変更したGMは、リポジトリのルートで次の素振りを実行できます。

```sh
node bin/gridhub.js validate quests/tutorial/tutorial.map.json
node --test tests/e2e/M2.test.mjs tests/e2e/M9.test.mjs tests/e2e/M10.test.mjs
```
