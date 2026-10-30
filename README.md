# GridHub — テスト1件が1マス

**GridHub** は、E2E テストを1件ずつ通して開発を進める進行管理ツールです。進み具合を、5mm方眼ノートに描いたすごろく（JRPG）として見せます。旧名はマスメで、`masume` コマンドも別名として使えます。

- **テスト1件 = 1マス。** タスクの E2E テストの1件ずつが、道の上のマスになります。テストが通ると、駒が1マス進みます。
- **タスクの判定は累積。** タスクのテストが全部通ったら `gridhub check` で判定します。直前のセーブポイントから今までのテストをまとめて走らせるので、自己申告では1マスも進みません。
- **セーブポイントは Git のコミット。** セーブポイントに着くと、担当ファイルが自動でコミットされます。判定に失敗するとそのコミットに戻り、戻す前の変更は `git stash` に残ります。
- **結合テストで合流。** モジュールの担当ごとに道が分かれ、結合テストで合流します。
- **人間とエージェントが同じ盤面を見ます。** エージェント（Claude Code・Codex）に**作戦**を出して任せ、人間は承認します。コンテキストが切れても、`gridhub brief` を読めば誰でも再開できます。

この README は**開発のことば**（テスト・タスク・コミット・承認）で書いてあります。ゲームの言い方（モンスター・ダンジョン・町・ハンコ）で読みたい人は [docs/RULEBOOK.md](docs/RULEBOOK.md) をどうぞ。盤面と CLI の字も、どちらの言い方にも切り替えられます（下の「ことば」）。

![GridHub の盤面（縦の5mm方眼ノートの見開き）](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board.png)

動かすのに要るのは Node.js 22 以上と Git だけです（外部パッケージはありません。macOS と Linux で動きます。Windows は WSL で）。
作りたいものから地図を作る（`gridhub quest`）とエージェントの起動（`gridhub party`）には、手元に [Claude Code](https://claude.com/claude-code) か [Codex CLI](https://github.com/openai/codex) が入っていてログイン済みであることも要ります（下の「0. 入れる」）。

## Mac アプリで遊ぶ（ターミナルなし）

Mac なら、GridHub をアプリ（`GridHub.app`）にして、Finder からダブルクリックで遊べます。フォルダを選ぶと、そのフォルダの盤面が窓に開きます（冒険の書がまだ無ければ、作りたいものの願いを書く入口が開きます）。そのあとの冒険づくり・出撃・ハンコ・ボス戦は、窓の中のボタンでできます。

1. **アプリを作る**（最初の1回だけ、ターミナルを使います。要るのは macOS 13 以上・Node.js 22 以上・Command Line Tools（`xcode-select --install`）で、Xcode は要りません）:

   ```sh
   git clone https://github.com/M2AI-jp/gridhub.git && cd gridhub
   sh mac/build.sh      # dist/GridHub.app ができる（swiftc で組み、アドホック署名する）
   ```

2. **開く**: Finder で `dist/GridHub.app` を「アプリケーション」フォルダに入れて、ダブルクリックします。署名していないので、はじめて開くときに「開けません」と出たら、`GridHub.app` を右クリックして「開く」を選んでください。
3. **はじめの画面**（方眼ノートの1ページ）:
   - **フォルダを選ぶ**: Mac のいつものダイアログで選びます。「新規フォルダ」で、その場でフォルダも作れます。
   - **最近のフォルダ**: 前に開いたフォルダに、押すだけで戻れます。
   - **チュートリアルで遊ぶ**: `~/GridHub/チュートリアル` に冒険を作って開きます。盤面のキャラクター（勇者・見習いAI）を押して「手で進める」を開き、「見本を写す」→「保存」→「ハンコを押す」か「宣言判定」で、ターミナルもエディタも使わずにあがれます。

- 「手で進める」では、そのキャラクターの縄張りの中のファイルだけを書けます。封印された判定・地図・冒険の書には書けません。
- 盤面の右上のボタンでことば（冒険のことば / 開発のことば）を切り替えると、アプリがそれを覚えて、次に開くときのはじめの画面と盤面、アプリ自身のダイアログの字もそのことばになります。
- アプリは、Finder から開いても、ログインシェルの PATH（`.zprofile`・`.zshrc` など）で `node` と `claude` を探します。Node.js 22 以上が無いときは、窓に入れ方が出ます。
- `claude`（Claude Code）が無くても、チュートリアルは遊べます。作りたいものから地図を作る（GM）・エージェントを起動するときは、[Claude Code](https://claude.com/claude-code) の手順で `claude` を入れてログインします。
- 窓を閉じるとアプリが終わり、盤面のサーバーも止まります（アプリが落ちても、サーバーは残りません）。
- ターミナルから同じ画面を開くなら `gridhub app`（出てきた URL をブラウザで開く）。

## 勇者の手帳（あなたの積み上げ）

エージェントが道を進むあいだ、あなた（勇者）にも冒険をまたいで残る**手帳**があります。盤面の見出しの「手帳」のタブと、なかまの欄の上の勇者のカードで見られます（ターミナルなら `gridhub me`）。

- **シール袋**: テストが1件通るたびに、シール袋が1つ落ちてきます（一発合格・リグレッションを直す・セーブ・結合・あがりでも）。袋は自分の手で開けます。キラ・ホロ・金が出るかどうかは、そのテストを倒した記録のハッシュで決まっていて、ずるでは引き直せません。
- **シール帳とノートに貼る**: 開けたシールは 39 枠のシール帳に貼られます。シールを押すと、どのテストを・だれが・いつ倒して手に入れたかが出ます。「ノートに貼る」で、冒険のノート（盤面）の好きな所にも貼れます（押せば、はがせます）。
- **交換所と列のコンプ**: 同じシールが6枚たまったら、5枚を1つ上のレア度（ノーマル → キラ → ホロ → 金）1枚と換えられます。シール帳の1列（スライムの4つのレア度など）をそろえると、経験値 +200。
- **今週のMVP と駒の装備**: この7日にいちばんテストを倒した仲間（エージェント）が、盤面で金色に光ります。レベル（信頼）が上がった仲間の駒には、剣・マント・王冠が付きます。
- **勇者ランクと称号**: テスト・宣言・メダル・結合・あがりで経験値がたまり、ランクが上がります。称号は「一発合格」「見逃さない（リグレッションを直す）」「こまめなセーブ」「一週間皆勤」「交換所デビュー」など 44 個。手に入れた称号は1つ名乗れます（「伝説の勇者「メダル王」」）。
- **自己ベスト**: 1日に倒したテスト・1回の判定でまとめて倒した数・続けた日数。記録を超えた瞬間にお祝い。
- **スタンプカードと今日のお題**: テストを1件でも倒した日にハンコ。毎日かわる3つのお題をこなすと、お題のランタンのシール。
- **おかえり・今週のふりかえり**: 盤面を開くと、前に見てから（エージェントが働いているあいだ）の戦果が左下に出ます。手帳には、この7日に倒したテストの棒グラフ。
- **盤面の手ごたえ**: 「撃破！」「N体まとめて撃破！」、ホロ・金が落ちると「✦ ホロの気配…！」、仲間のひとこと（「よし、A1 を抜けた！」）、ボス戦のカットイン。
- 手帳は `~/Library/Application Support/GridHub/hero.json`（macOS。ほかは `~/.config/gridhub/`、`GRIDHUB_APP_HOME` で変えられます）。中身はすべて冒険の書から導いたもので、このファイルが覚えるのは「どの袋を開けたか・どこまで見たか」だけです。

---

## 5分で始める

### 0. 入れる

GridHub は git clone したフォルダから、そのまま `node` で動きます（インストールの道具もパッケージの登録も使いません）。`gridhub` と打てるように、PATH の通った所にリンクを置きます。

```sh
git clone https://github.com/M2AI-jp/gridhub.git && cd gridhub
ln -s "$PWD/bin/gridhub.js" ~/.local/bin/gridhub   # ~/.local/bin が PATH に無ければ、alias gridhub="node $PWD/bin/gridhub.js" でも
gridhub --version     # gridhub 0.3.0 (rules 1)
```

#### GM とエージェントに使う LLM のコマンド（`gridhub quest`・`gridhub party` に要る）

GridHub 自身は LLM を呼びません。GM（地図と判定を書く）とキャラクター（実装する）は、手元に入っている **Claude Code**（`claude` コマンド）か **Codex CLI**（`codex` コマンド）を起動して動かします。どちらか1つを入れて、ログインしておきます。

| | 入れる | ログイン |
| --- | --- | --- |
| Claude Code | https://claude.com/claude-code の手順で | `claude` を一度起動して、画面のとおりにログイン |
| Codex CLI | https://github.com/openai/codex の手順で | `codex login` |

入っていないと、`[E_GM] GM を起動できませんでした: claude コマンドが見つかりません` のように止まります（盤面の入口も同じ理由を出します）。

知っておくこと:

- **権限**: GM もエージェントも、**確認なしにファイルを読み書きしてコマンドを実行する**設定で起動します。Claude Code は `claude -p --permission-mode bypassPermissions`（箱はありません。あなたと同じ権限で動きます）、Codex は `codex exec -s workspace-write`（箱の中で、書けるのはそのフォルダだけ）です。大事なファイルが置いてあるフォルダでは遊ばず、新しいフォルダか、Git で管理しているフォルダで始めてください。
- **時間と利用料**: 本物の LLM を呼ぶので、`gridhub quest` は数分かかり、出撃のたびに利用料がかかります（作戦で、1回の出撃の長さが変わります）。
- GM やエージェントをほかのコマンドにするには `--gm cmd:<command>` / `--agent cmd:<command>`（プロンプトは標準入力に流れます）。

### 1. 願いから冒険をつくる（`gridhub quest`）

```sh
mkdir ~/memo && cd ~/memo
gridhub quest "メモを書いて一覧できるアプリを作りたい" --gm claude
```

GM の LLM（手元の `claude` か `codex`）が、作りたいものを地図（`quest.map.json`）にし、タスクごとの判定（E2E テスト）を書いて封印します（数分かかり、利用料がかかります）。
フォルダが Git の作業ツリーでなければ、GridHub が `git init` して、最初のコミット `gridhub: 冒険のはじまり` を作ります。

### 2. 盤面を開く（`gridhub serve`）

```sh
gridhub serve         # 盤面 http://127.0.0.1:5005/ をブラウザで開く（動かしたままにするので、続きは別のターミナルで。--no-open で URL を出すだけ）
```

盤面の入口（「どんなアプリを作りたい？」）から、手順 1 の願いを書いて始めることもできます。

### 3. エージェントに作戦を出して出撃させる（`gridhub party --tactic`）

```sh
gridhub party --agent claude --tactic careful     # いのちだいじに: 1マスずつ確かめ、1つのタスクを抜けたら止まる
gridhub party --dry-run                           # 誰に何を出撃させるかと、プロンプトの先頭だけを見る
```

盤面の「出撃させる」の窓でも、エージェント・人数・作戦を選べます。

### 4. 自分の手で進める（`gridhub step` と `gridhub check`）

人間もキャラクターになれます。エージェントが出撃したときも、エージェントは同じコマンドを打っています。

```sh
gridhub brief engine          # 作業指示: いまのタスクと、テスト1件ずつの成否・次に通すテスト
# …最初に落ちているテストだけを通すように、コードを1か所変える…
gridhub step engine           # いまのタスクのテストだけを走らせる。何度でも（レベルも位置も変わらない）
gridhub check engine          # 判定: 全部のテストが通ったら、セーブポイントからの累積で判定する（失敗すると Lv−1）
gridhub note engine "TTL は秒ではなくミリ秒。テストの名前に単位を書くと迷わない"   # 次の自分への申し送り
```

`--as <ID>` を付けなくても、渡したキャラクターID（ここでは `engine`）の記録になります。別の人として記録したいときだけ `--as` を付けます（エージェントを起動したときは、`gridhub party` が付けて打っています）。

`gridhub step` の出力（開発のことば。`gridhub words dev` で切り替えたとき）:

```
テストを走らせた: engine S1 テスト 2/3
  ✔ title が空なら 400
  ✔ 保存すると 201 と id
  ✖ 保存したメモが一覧に出る
次に通すテスト: 保存したメモが一覧に出る
```

人間の承認が要るマスは、`gridhub stamp <マスID> --as <人間のID>` で通します（盤面のボタンでも押せます）。

### ことば（冒険のことば / 開発のことば）

GridHub のすべての字（盤面・CLI・MCP の道具・`gridhub init` が書く AGENTS.md）は、2つの言い方を持っています。どちらでも、1つの文の中に2つの言い方を並べません。

| | 向いている人 | 例 |
| --- | --- | --- |
| 🗡 冒険のことば（既定） | はじめての人・ゲームとして遊ぶ人 | モンスター・ダンジョン・出口で宣言判定・町でセーブ・ハンコ・全滅・ちいさなメダル |
| ⌨ 開発のことば | エンジニア | テスト・タスク・判定（check・累積）・セーブポイント（コミット）・承認・リグレッション・最初の判定で合格 |

```sh
gridhub words                 # いまの言い方と、何で決まっているか
gridhub words dev             # このプロジェクトの設定（.masume/words.json）を開発のことばに。盤面の右上のボタンと同じ設定
gridhub status --words dev    # 1回だけ切り替える（どのコマンドにも付けられる。環境変数 GRIDHUB_WORDS=dev でも）
```

盤面では右上のボタン1つで切り替わり、選んだほうはブラウザとこのプロジェクトの設定に残ります。文書は、[docs/RULEBOOK.md](docs/RULEBOOK.md) が冒険のことば、この README が開発のことばです。

### チュートリアル（エージェントなし・手で1本）

`quests/tutorial/README.md` に、エージェントも LLM も使わずに、手で最後まで遊べるチュートリアルがあります（5分）。書いてあるとおりに sh のブロックを貼れば動きます。

---

## ゲームと開発の対応表

開発の言い方が、盤面（冒険のことば）では何にあたるかの一覧です。本文では開発のことばだけを使い、ゲームの言い方はこの表にまとめます。

| 開発 | ゲーム | 地図のデータ |
| --- | --- | --- |
| プロダクト全体 | 世界 | `quest` |
| 章・リリース | 大陸（ページのかたまり） | 地図の版（`gridhub amend` で増える） |
| 章のあがりの結合 E2E | 魔王の城（大ボス） | `quest.goal` のゲート |
| マイルストーン（結合と結合のあいだ） | 地方 | ゲートで区切られた道 |
| 結合テスト（モジュールが初めてつながる所） | 中ボスの砦 | `gate` |
| タスク（エージェント1回分の仕事） | ダンジョン | `task` |
| **テスト1件**（1つの値・状態・分岐に対する小さな作業） | **普通のマス（雑魚モンスター）** | `check.cases[]` |
| **Git のコミット** | **町（宿屋）でのセーブ** | `camp` と `quest.save: "git"` |
| 人間の判断（契約・鍵・承認） | 王様の城（ハンコ） | `check.kind: "stamp"` |
| モジュールの担当（エージェントか人間） | キャラクター（駒） | `characters[]` |
| エージェントの出撃1回 | 1代（伝承） | `sortie` |

| 開発の出来事 | 盤面で起きること |
| --- | --- |
| テストが通った | モンスターを倒して1マス進む（赤い斜線） |
| テストが落ちている | そのマスで戦い続ける（罰はない） |
| タスクの判定（町から今までの累積）が通った | ダンジョンを抜ける（経験値・赤ペンのはなまる） |
| タスクの判定が落ちた | 全滅: Lv−1、町のコミットからやり直し |
| 一度で判定が通った | ちいさなメダル |
| 前に通ったテストが落ちた（リグレッション） | モンスターが**復活**（赤い丸） |
| 2回以上落ちたテストを通した | 強敵を倒した。直後の日誌が**技**になり、次の代に受け継がれる |
| GM が判定のバグを直して封印し直した | 宝 |
| 判定ファイルを書き換えた | 罠（封印破り。判定できず、記録が残る） |
| 全員の結合 E2E が通った | あがり。章のエンディング（記録から毎回違う文） |

遊び方のループと、うまく遊ぶほどよい開発になる理由は [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)、ルールの全部は [docs/RULEBOOK.md](docs/RULEBOOK.md) にあります。

---

## Git のセーブと墓

`quest.save` が `"git"` の冒険（`gridhub quest` で作る冒険は、既定でこれ）では、GridHub が Git を操作します。

| いつ | GridHub がすること | コミットのメッセージ |
| --- | --- | --- |
| セーブデータをつくったとき | 全員の担当ファイル（`territory`）をコミットする（開始） | `gridhub save: ふりだし` |
| 担当がセーブポイント（`camp`）に着いたとき | その担当のファイルをコミットする | `gridhub save: C1 宿屋` |
| 結合テスト（`gate`）に合格したとき | メンバー全員の担当ファイルを1つのコミットにする | `gridhub save: G1 …` |
| 判定・結合テストに失敗したとき | 担当ファイルを `git stash` に残して、最後のセーブのコミットに戻す | （stash: `gridhub grave: <ID> <マス> seq <N>`） |

- コミットするのは**担当ファイルだけ**です。あなたのほかの変更やステージ（`git add` したもの）には触れません。push はしません。フックは走りません。
- `gridhub quest` が置く GM の作業ファイル（依頼書の控え `quest-prompt-*.txt` と GM の出力 `quest.log`）は `.gitignore` に入れるので、コミットには入りません。
- **セーブデータ（`.masume/log.jsonl`）とテストの出力（`.masume/outputs/`）は Git に入れます**（プロジェクトの歴史そのもので、`gridhub verify` は出力のハッシュも確かめます。`gridhub quest` の最初のコミットに入ります）。セーブポイントのコミットは担当のファイルだけなので、遊んでいるあいだ `git status` には ` M .masume/log.jsonl` と `.masume/outputs/` が出たままになります。壊れているのではありません。章の区切りなど、好きなときに `git add .masume && git commit -m "gridhub: セーブデータ"` で入れてください（このリポジトリ自身もそうしています）。
- `gridhub quest` が `git init` するときのブランチは `main` です（GitHub の既定と同じ）。
- stash から変更を取り出すには、作業指示（`gridhub brief`）に出るコマンドを打ちます: `git stash apply <stash>`。
- `quest.save` が無い地図では、GridHub は Git に触りません。

### Git と GitHub を初めて使う人へ

- **Git** は、ファイルの変更の歴史を手元に残す道具です。1回分の保存を**コミット**と呼び、`a1b2c3d` のような短い名前で指せます。GridHub では、セーブポイントに着くたびに GridHub がコミットします。
- **GitHub** は、Git の歴史を置いておき、ほかの人にレビューしてもらう Web サービスです。変更を見てもらう申し出を **PR（pull request）** と呼びます。GitHub は使わなくても遊べます（手元の Git だけで、セーブも stash も働きます）。

GridHub が `git init` とコミットをしてくれるので、最初に要るのは名前の設定だけです（Git が無ければ、先に https://git-scm.com/ から入れます）。

```sh
git config --global user.name "あなたの名前"          # 1回だけ。無ければ GridHub <gridhub@localhost> でコミットされる
git config --global user.email "you@example.com"
git log --oneline                                      # セーブポイントのコミット（gridhub save: …）が並ぶ
```

#### GitHub につなぐ（`gridhub remote`・`gridhub push`・盤面の「GitHub に送る」ボタン）

いちばん簡単なのは、盤面の GitHub の欄です。GitHub につながっていなければ、つなぐ手順（下の1〜4）が、まだのものだけ出ます。つながっていれば「push していないコミット: 2」（冒険のことばでは「GitHub に送っていないセーブ: 2」）のように数が出て、「push」（「GitHub に送る」）ボタンで送れます。コマンドでも同じことができます。

```sh
gridhub remote        # いまの様子と、まだの手引き（gh が入っているか・ログインしたか・リポジトリがあるか・送ったか）
```

1. **gh（GitHub のコマンド）を入れる**: https://cli.github.com/ （macOS なら `brew install gh`）
2. **GitHub にログインする**: `gh auth login`（ブラウザが開くので、画面のとおりに進める）
3. **GitHub にリポジトリを作ってつなぐ**: `gh repo create <フォルダ名> --private --source . --remote origin`
4. **送る**: `gridhub push`（盤面の「GitHub に送る」ボタンと同じ。2回目からは、送っていないセーブだけが送られる）

- `gridhub push` は、いまのブランチをリモートに送るだけです（中で `git push` を走らせます）。**force push はしません**（GitHub のほうが先に進んでいたら、送らずに止まって知らせます）。
- **コミットしたら自動で push**（初めはオフ。盤面の冒険のことばでは「町でセーブしたら GitHub に送る」）: `gridhub remote --auto-push on` か、盤面の GitHub の欄の切り替えをオンにすると、セーブポイントや結合テストでコミットするたびに、そのまま push します。push できなくても進行は止めません（盤面と `gridhub status` に理由が出るので、直してから `gridhub push` か「push」ボタンで送り直します）。force push はしません。
- gh を使わないなら、github.com で空のリポジトリを作り、`git remote add origin https://github.com/<あなた>/<リポジトリ>.git` でつないでから `gridhub push` でもかまいません。

変更をレビューしてもらう（PR を出す）には、次の作業をブランチで進め、終わったら送ります。

```sh
git switch -c memo-search          # 作業用のブランチ
gridhub party --tactic bold        # 進める（セーブポイントに着くたびにコミットされる）
gridhub push                       # このブランチを GitHub に送る
```

GitHub のリポジトリのページに出る「Compare & pull request」を押して、PR を作ります（`gh` コマンドがあれば `gh pr create`）。PR の説明には `gridhub status` の最後の行（`記録: seq 42 / Git: commit a1b2c3d`）を貼っておくと、レビューする人が同じ時点の盤面を `gridhub load 42` で開けます。

迷ったら: `git status`（いま何が変わっているか）・`git log --oneline`（コミットの一覧）・`git stash list`（stash の一覧）。消してしまったように見えても、GridHub は変更を stash に残してから戻すので、`git stash apply <stash>` で取り出せます。

---

## 作戦（`--tactic`）

人間はエージェントに作戦を出します。作戦で変わるのは、エージェントの動き方と1回の出撃の長さ（利用料）です。ルール（宣言の重さ・セーブ）は変わりません。

| 作戦 | `--tactic` | エージェントの動き方 | 出撃が止まるとき |
| --- | --- | --- | --- |
| いのちだいじに | `careful` | 1マスずつ `gridhub step` で確かめる。全部のテストが通るまで宣言しない | 1つのタスクを抜けたら・宣言に2回失敗したら |
| バッチリがんばれ（既定） | `balanced` | 小さく変えて `step` を回す。全部通ったら宣言 | 同上 |
| ガンガンいこうぜ | `bold` | 次の町まで、タスクを続けて進んでよい | 町でセーブしたら・結合テストで待機になったら・宣言に2回失敗したら |

いつも同じ作戦なら `.masume/party.json` に `"tactic": "careful"` と書きます。

---

## 記録（セーブデータ）と、過去に戻る

- 進み具合は `.masume/log.jsonl`（セーブデータ。盤面では「冒険の書」）に追記だけされます。各行は前の行のハッシュを含みます（ハッシュの鎖）。
- いまの記録は、記録の番号（seq）と Git のコミットで言います: `記録: seq 42 / Git: commit a1b2c3d`（`gridhub status` の最後の行。`gridhub brief` と盤面の見出しにも出ます）。seq は盤面の時点、commit はそのとき判定が見ていたコードの時点です。メモ・コミットメッセージ・PR・Linear のコメントには、この1行を貼れば「その時点」を指せます。
- `gridhub verify` は、鎖・地図・テストの出力の改ざんを見つけます。`gridhub repair` は、壊れた所から後ろを退避して鎖を直します。
- `gridhub load <seq>` か `gridhub load <commit>` で、その時点の盤面に戻れます。commit で指すと、そのコミットがセーブデータに初めて記録された時点（セーブポイントの看板の `commit a1b2c3d` なら、そこでコミットした時点）に戻ります。戻したことも記録されます。コードは Git で戻します（`git checkout a1b2c3d`、stash は `git stash apply <stash>`）。
- `gridhub log` で、何が起きたかを最初から読めます（盤面のログと同じ文。時刻はこの機械のローカル時刻）。`--tail` で最後の 20 件、`--tail 100` で 100 件、`--json` で生のイベント。

---

## どの LLM からでも（MCP）

`gridhub mcp` は、GridHub を LLM の道具にする MCP サーバー（標準入出力）です。道具の名前は互換のため `masume_*` のままです。

```sh
# Claude Code
claude mcp add gridhub -- node /path/to/gridhub/bin/gridhub.js mcp --dir /path/to/project
# Codex（~/.codex/config.toml）
#   [mcp_servers.gridhub]
#   command = "node"
#   args = ["/path/to/gridhub/bin/gridhub.js", "mcp", "--dir", "/path/to/project"]
```

| 道具 | すること |
| --- | --- |
| `masume_brief` | 作業指示を読む |
| `masume_step` | いまのタスクのテストだけを走らせる |
| `masume_check` | 判定する（累積） |
| `masume_note` | メモを書く |
| `masume_status` / `masume_log` / `masume_verify` | 盤面・ログ・改ざんの検証 |
| `masume_stamp` | 承認（人間） |
| `masume_quest` | 作りたいものから地図を作る |

道具の説明も、ことばの設定（`gridhub words`）に従います。セーブデータに書き込む道具（`masume_step`・`masume_check`・`masume_note`・`masume_stamp`・`masume_quest`）は、クライアントで承認が要ることがあります。無人で走らせるときは、その道具だけを承認しておきます（Claude Code なら `.claude/settings.json` の `permissions.allow` に `"mcp__gridhub__masume_step"` など）。

よそのプロジェクトでエージェントが GridHub のルールを守れるように、`gridhub init` が `AGENTS.md`・`CLAUDE.md`・`.gitignore` を置きます（`gridhub quest` は自動でやります）。

---

## 盤面

- 縦の5mm方眼ノート（B5）の見開きです。キャラクターごとの色の道が、ページの上から下へ、景色のあいだを曲がりながら下ります。駒が次のページへ進むと、ノートがめくれます。
- ノートは縦です。横長の画面では見開き、**縦長の画面（スマホや、縦に置いたタブレット・モニター）では1ページずつ**縦に見せます。画面の向きを変えると切り替わります。
- 札・吹き出し・ニュースの切り抜きは重ならないように置かれ、字は切れません（長い字は短くして、全文はマウスを乗せると出ます）。
- 道のマスはテスト1件ずつで、テストの名前は拡大すると読めます。タスクの札には `POST /api/memos` のような題と `テスト 3/5`、セーブポイントの看板には `commit a1b2c3d` が書いてあります。
- **ことばは1つのボタンで切り替えられます**（見出しの右上）。「🗡 冒険のことば」はゲームの言い方（モンスター・ダンジョン・町・ハンコ・全滅）で、はじめての人向け。「⌨ 開発のことば」は開発の言い方（テスト・タスク・コミット・承認・リグレッション）で、エンジニア向け。どちらでも、1つの文の中に2つの言い方を並べません（もう一方は、マウスを乗せたときの補足にだけ出ます）。選んだほうはブラウザに残り、URL の `?words=dev` / `?words=game` でも指定できます。はじめの画面（`gridhub app`・Mac のアプリ）にも同じボタンがあります。
- 右の欄: メンバー（起動の回数・テストの数・最初の判定で合格した数）、ログ、テスト一覧（成否つき）。冒険のことばでは、なかま・冒険の書・モンスター図鑑になります。見出しの「一覧」は、マスを Linear 風の表にしたものです。
- 道には、開発に関係する**イベントのマス**もあります。進行には影響しません（テストも罰もない）。駒が通ると、合流の前には別の担当との会話（それぞれの最新のメモから）、セーブポイントでは住人との雑談（通したテストの数・コミット）、ほかではニュース（「速報: 伝令 が S2 を完了した」と、作っている製品の分野の話題 `quest.news`）が起きます。どれもセーブデータと地図に本当にあることからだけ作ります。
- 「ノートに書き出す」で、ノート全体（すべてのページ）を1目 = 5mm の実寸の SVG にして保存できます。印刷すると、そのまま方眼ノートのすごろくになります。
- 盤面はネットが無くても手元の書体ですぐ描かれます（Google Fonts の手書きの書体は、届いたら差し替わります）。
- 盤面の出撃の窓でも、Codex の箱のソケットを開ける（`--allow-listen`）を選べます。

| 前（第10章: タスク1つ = 1マスの表） | 後（第11章: テスト1件 = 1マスの世界地図） |
| --- | --- |
| ![第10章の盤面](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board-ch10.png) | ![第11章の盤面](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board.png) |

| ページをめくる | エンディング |
| --- | --- |
| ![ページをめくる](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board-flip.png) | ![エンディング](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board-ending.png) |

縦長の画面（ここでは縦に置いたタブレット、1024×1366）では、ノートを1ページずつ見せます。

![縦長の画面では1ページずつ](https://raw.githubusercontent.com/M2AI-jp/gridhub/main/docs/board-portrait.png)

スクリーンショットの撮り方は [docs/shots/README.md](https://github.com/M2AI-jp/gridhub/blob/main/docs/shots/README.md) にあります（写真は GitHub から読み込みます）。

---

## Codex の箱のソケット（`--allow-listen`）

判定（E2E）がテストの中で `127.0.0.1` にサーバーを立てるとき、Codex の箱（`-s workspace-write` のサンドボックス）は既定でその listen まで止めます。

```sh
gridhub party --agent codex --allow-listen          # その出撃だけ、Codex の箱のソケットを開ける
gridhub quest "<願い>" --gm codex --allow-listen    # GM の箱も開け、生まれた冒険の party.json に "allow_listen": true を残す
gridhub init --agent codex --allow-listen           # よそのプロジェクトの party.json に "allow_listen": true を書く
```

- ゲームはローカルのままで、インターネットが要るわけではありません。既定は閉じたままです。
- **注意**: 開けるのに使う Codex の設定（`sandbox_workspace_write.network_access`）は localhost だけに絞れないので、開けている出撃中のエージェントはインターネットにも出られます。

---

## Linear と Jira（オプション）

GridHub だけで遊べます。チームが Linear や Jira を使っていれば、盤面の状態をそちらにも映せます。テストのある task の説明には、テストのチェックリスト（`- [x] title が空なら 400`）が付きます。

```sh
gridhub export linear --format csv --out linear.csv                            # Linear 形式で書き出す
gridhub import linear export.csv --out quests/mine.map.json                    # Linear の CSV から地図の下書き
LINEAR_API_KEY=lin_… gridhub linear push --team ENG                            # Linear 本体と同期する
JIRA_BASE_URL=https://example.atlassian.net JIRA_EMAIL=you@example.com JIRA_API_TOKEN=… gridhub jira push --project ENG
```

---

## コマンド

| コマンド | すること |
| --- | --- |
| `gridhub quest "<作りたいもの>" [--gm claude\|codex]` | 作りたいものから GM の LLM が地図と E2E テストを書き、プロジェクトを始める（`git init` も） |
| `gridhub serve [--port 5005] [--no-open]` | 盤面を開く（ターミナルから打てば、ブラウザも開く） |
| `gridhub app [--port 0]` | はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアル）を開く。Mac のアプリはこれを起こす |
| `gridhub party [--agent claude\|codex] [--tactic careful\|balanced\|bold] [--parallel N]` | 担当ごとにエージェントを起動し、結合テストを走らせる |
| `gridhub brief <id>` | 作業指示 |
| `gridhub step <id>` | いまのタスクのテストだけを走らせる（何度でも。レベルも位置も変わらない） |
| `gridhub check <id\|gate>` | 判定（セーブポイントから今までの累積テスト） |
| `gridhub note <id> "<text>"` | メモ（2回以上失敗したテストを通した直後のメモは引き継ぎになる） |
| `gridhub stamp <node> --as <human>` | 承認 |
| `gridhub words [game\|dev]` | ことばを見る・変える（冒険のことば / 開発のことば。どのコマンドにも `--words game\|dev` を付けられる） |
| `gridhub status` / `gridhub log [--tail [N]]` | 盤面の要約 / ログ（読める文。`--json` で生のイベント） |
| `gridhub verify` / `gridhub repair` | 改ざんの検証 / 修復 |
| `gridhub load <seq\|commit>` | 過去の時点の盤面に戻る（記録の番号か Git のコミットで指す） |
| `gridhub remote [--auto-push on\|off]` / `gridhub push` | GitHub につなぐ手順と、push していないコミットの数（コミットしたら自動で push する設定） / いまのブランチを push する（force push はしない） |
| `gridhub new <map>` / `gridhub validate <map>` / `gridhub amend <map>` | 地図からセーブデータをつくる / 検査 / 改訂（通過したマスは変えられない） |
| `gridhub seal <node…\|--all>` | テストのファイルのハッシュを記録する（GM） |
| `gridhub init` | よそのプロジェクトに支度をする |
| `gridhub mcp` | MCP サーバー |
| `gridhub export\|import linear`、`gridhub linear\|jira push\|pull` | Linear・Jira（オプション） |

`gridhub <command> --help` で各コマンドの説明が出ます。`masume <command>` も同じように動きます。

---

## GM（地図を描く人）へ

LLM に「`docs/GM_GUIDE.md` を読んで GM になってください。『（作りたいもの）のようなアプリを作りたい』」と頼めば、地図と判定を作ります（`gridhub quest` は、これを自動でやります）。
GM は地図を描いてテストを書くだけで、実装しません。担当は実装するだけで、テストを書きません。この分離があるから、エージェントの「できました」をそのまま信用できます。

---

## このリポジトリ自体も、GridHub で作った

`quests/masume.map.json` がこのリポジトリ自身の地図で、`.masume/` がその冒険の書です。GM（Claude）が地図と判定（`tests/e2e/`）を先に書いて封印し、キャラクター（Codex・Claude）が1マスずつ実装しました。

| キャラクター | 担当 |
| --- | --- |
| 書記 | 冒険の書・ルール・CLI（`src/engine`） |
| 賢者クロード | 盤面（`web/`） |
| 絵師 | 駒とモンスターの絵（`web/assets`） |
| 伝令 | 盤面のサーバーと MCP（`src/server`・`src/mcp`） |
| 語り部 | 願いから冒険（`src/quest`） |
| 軍師 | 出撃と作戦（`src/party`） |
| 地図職人 | チュートリアル・Linear・Jira（`src/linear`・`src/jira`） |
| 勇者 | 遊んで確かめて、ハンコ（人間。GM が代理で押したこともある） |

`examples/` には、本物の願いから本物のエージェントがあがった冒険が残っています（`examples/omikuji`・`examples/kakeibo`・`examples/memo`）。`demos/mcp-tutorial` は、本物の Codex が MCP の道具だけで1マス進めた記録です。

### 章の記録

| 章 | できたこと |
| --- | --- |
| 第1章 | 冒険の書・宣言判定・盤面・ハンコ。自分自身を、自分のルールで完成させる（旧名マスメのころ） |
| 第2章 | 願いから冒険（`gridhub quest`）と出撃（`gridhub party`）。Linear との同期（`gridhub linear push`） |
| 第3章 | MCP（`gridhub mcp`）・Jira（`gridhub jira push`）・支度（`gridhub init`）・ノートに書き出す |
| 第4章 | 5人のレビュアーによる総点検の修理 |
| 第5章 | Codex の箱のソケットを開ける（`gridhub party --agent codex --allow-listen`） |
| 第6章 | その名前を `--network` から `--allow-listen` に改め、目的（`127.0.0.1` にサーバー）・ローカルのまま・インターネットの注意を説明する |
| 第7章 | 盤面だけで遊ぶ通し稽古（`examples/kakeibo`）。盤面の出撃の窓から箱のソケット（allow-listen）を開ける |
| 第8章 | 最終確認: すべての冒険の書・すべての判定・チュートリアルを、書いてあるとおりに確かめ直す |
| 第9章 | 手書きの方眼ノートの盤面（筆記具の描き分け・貼った物・ペンで描いていく） |
| 第10章 | 外の字を待たない: ネットが無くても盤面がすぐ描かれる（Google Fonts は届いたら差し替え） |
| 第11章 | **GridHub**: テスト1件が1マス・`gridhub step`・Git のセーブと墓・作戦・伝承と技・エンディング・縦の方眼ノートの世界地図 |
| 第12章 | 仕上げ: 瓦版は作っている製品の話題・札と吹き出しが重ならない・盤面から GitHub につなぐ（`gridhub remote`・`gridhub push`・「GitHub に送る」ボタン）・縦長の画面では1ページずつ |
| 第13章 | 町でセーブしたら GitHub に送る設定（`gridhub remote --auto-push on`・盤面の切り替え。初めはオフ）・最大レベルは「Lv9（最大）」と出す |
| 第14章 | リリースの支度: `LICENSE`（MIT）・版 0.3.0 とリリースノート（[CHANGELOG.md](CHANGELOG.md)）・Node.js 22 以上 |
| 第15章 | 名前をそろえる: 使う人の目に入る旧名を GridHub に（チュートリアル「はじめての GridHub」は `gridhub` コマンドで遊ぶ・MCP の資料の名前・支度の説明・絵帳） |
| 第16章 | **Mac のアプリ**（`sh mac/build.sh` → `GridHub.app`）: はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアル）・盤面の「手で進める」（縄張りの中だけのファイル・歩く・宣言判定）・閉じたら止まる命綱。新しい仲間の大工（`mac/`）。最後に王様の城（ユーザーが自分の Mac のアプリでハンコを押す） |

章ごとの経緯（GM の判定の誤り・全滅・やり直しを含む）は、冒険の書（`gridhub log`）と [docs/CONTRACTS.md](docs/CONTRACTS.md) に残っています。

### 判定を手元で走らせる

```sh
node --test tests/e2e/[ABDEMPQS]*.test.mjs tests/e2e/G[0-9]*.test.mjs   # すべてのマスとゲートの判定を1回ずつ
node --test tests/e2e/GOAL16.test.mjs                                   # いまのあがり（GOAL16）: 第1章〜第16章の全部の判定をまとめて＋冒険の書・アプリの中身の名前・Mac のアプリの手順の確認
```

盤面の判定はヘッドレスの Chrome を使います。見つからなければ `MASUME_CHROME=/path/to/chrome` を渡します。
Linux のコンテナで root として走らせるときは、Chrome の箱（サンドボックス）が起動しないので、`--no-sandbox` を足す小さなスクリプトを渡します。

```sh
printf '#!/bin/sh\nexec /path/to/chrome --no-sandbox --disable-dev-shm-usage "$@"\n' > /tmp/chrome && chmod +x /tmp/chrome
MASUME_CHROME=/tmp/chrome node --test tests/e2e/[ABDEMPQS]*.test.mjs tests/e2e/G[0-9]*.test.mjs
```

## ファイル

```
bin/gridhub.js           CLI の受付係（bin/masume.js は別名）
src/engine/              冒険の書・ルール・Git のセーブ（書記）
src/server/ src/mcp/     盤面のサーバー・MCP（伝令）
src/quest/               願いから冒険（語り部）
src/party/               出撃と作戦（軍師）
src/linear/ src/jira/    Linear・Jira（地図職人）
web/                     盤面（賢者クロード）、web/assets/ は絵（絵師）、web/start.html ははじめの画面
mac/                     Mac のアプリ（大工）: GridHub.swift・Info.plist・build.sh（sh mac/build.sh）・アイコン
quests/                  地図: masume（このリポジトリ自身）・kotozuke・tutorial
tests/e2e/               判定（GM が書いて封印）
docs/                    GAME_DESIGN / RULEBOOK / CONTRACTS / GM_GUIDE / SAVE_FORMAT
CHANGELOG.md             リリースノート（版ごとの変わったところ）
LICENSE                  MIT License
```

GridHub は、GitHub から git clone したフォルダで `node` で動きます。Mac のアプリ（`sh mac/build.sh`）に入るのは、動くのに要るもの（`bin/`・`src/`・`web/`・`docs/*.md`・`quests/tutorial/`・README・LICENSE・CHANGELOG・`package.json`）だけで、このリポジトリ自身の冒険の書（`.masume/`）・判定・examples・demos・docs の写真は入りません。

ライセンス: MIT（[LICENSE](LICENSE)）。変わったところは [CHANGELOG.md](CHANGELOG.md)。
