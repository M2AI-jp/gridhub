# マスメ — 5mm方眼すごろくで、開発を進める

小学生のころ、5mm方眼ノートにマス目を引いて、すごろく兼RPGを作って遊んだ。
**マスメ**は、それを開発の進行管理に持ち込むゲームです。

- Linear や Jira の「文字だけのタスク」を、**盤面・駒・セーブデータ**のあるすごろくにする。
- キャラクター1人 = **完成させるべきモジュール1つ**を担当するエージェント（または人間）。
- それぞれが一方通行の道を進み、要所の**結合ゲート（結合E2E＝ボス戦）**で合流し、また解散する。
- 駒が進むのは**判定（E2Eテスト）に通ったときだけ**。失敗するとレベルが下がり、所定の位置まで戻される。
- 進み具合は**冒険の書**（追記専用・ハッシュの鎖のセーブデータ）に残り、**ふっかつのじゅもん**で、どの時点の盤面でも指せる。

人間にも LLM にも、「いまどこにいて、次に何をして、どこで合流するか」が同じ盤面で見える。
コンテキストが切れても、`masume brief` を読めば誰でも再開できる。

![盤面](docs/board.png)

## 遊び方

Node.js 20 以上だけで動きます（外部パッケージなし）。

```sh
git clone … && cd masume
npm link            # masume コマンドを使えるようにする（または node bin/masume.js を使う）
```

### 5分のチュートリアル

```sh
cp -r quests/tutorial ~/masume-tutorial && cd ~/masume-tutorial
masume new tutorial.map.json      # 冒険の書をつくる（判定ファイルは自動で封印される）
masume serve                      # 盤面（5mm方眼ノート）を開く → http://127.0.0.1:5005/
masume brief apprentice           # 指令書: いまのマス・判定・見えている先・仲間
# …作業する…
masume check apprentice           # 宣言判定（E2E を走らせて、通れば進む・落ちれば戻る）
masume stamp <マスID> --as <人間のID>   # 人間のマスはハンコで進む（盤面のボタンでも押せる）
```

キャラクターIDやマスは `quests/tutorial/README.md` を見てください。

### 「xxxのようなアプリを作りたい」から始める

LLM（Claude / Codex など）に、こう頼みます。

```
docs/GM_GUIDE.md を読んで GM になってください。
「（作りたいアプリ）のようなアプリを作りたい」。地図（*.map.json）と、最初のマスの判定（E2E）を作って、
masume validate → masume new → masume serve まで進めてください。
```

GM は地図を描いて判定を書くだけで、実装はしません。実装は各キャラクター（エージェント）に、こう頼みます。

```
あなたは「<名前>」（ID: <id>）。マスメの盤上のキャラクターです。
masume brief <id> を読み、現在のマスだけを実装してください。縄張りの外と判定ファイルは触らない。
判定を自分で走らせて通ったら masume check <id> で宣言判定。終わる前に masume note <id> "申し送り"。
```

コンテキストが尽きたら、新しいセッションに同じ指示を出せば、指令書と日誌から再開できます。

### 既存の Linear から始める

```sh
masume import linear export.csv --out quests/mine.map.json   # 担当者ごとの道、E2E ラベルはゲートに
masume export linear --format csv --out linear.csv            # 盤面の状態を Linear のステータスで書き出す
```

## コマンド

| コマンド | すること |
| --- | --- |
| `masume new <map>` | 地図から冒険の書をつくる |
| `masume validate <map>` | 地図を検査する |
| `masume serve [--port 5005]` | 盤面を開く（ライブ更新・ハンコ・ボス戦のボタン） |
| `masume brief <id>` | 指令書（霧の向こうは見えない） |
| `masume check <id\|gate>` | 宣言判定 |
| `masume stamp <node> --as <human>` | ハンコ |
| `masume status` / `masume log` | 盤面の要約 / 冒険の書 |
| `masume note <id> <text>` | 日誌（次の自分への申し送り） |
| `masume seal <node…\|--all>` | 判定ファイルを封印する（GM） |
| `masume amend <map>` | 地図を改訂する（歴史は書き換えられない） |
| `masume verify [--jumon "…"]` | セーブデータの検証（ふっかつのじゅもんの確認） |
| `masume repair` | 呪われたセーブデータを修復する |
| `masume jumon` | ふっかつのじゅもん |
| `masume load <seq\|じゅもん>` | 過去の状態をロードする |
| `masume export linear` / `masume import linear` | Linear と文通する |

## ルール

[docs/RULEBOOK.md](docs/RULEBOOK.md)。要点だけ:

1. 指令書を読み、**いまのマスだけ**をやる（視界はレベルで広がる）。
2. 判定は E2E だけ。GM が書いて**封印**する。キャラクターは判定を書かない・変えない。
3. 宣言判定は、セーブポイントからいまのマスまでを**まとめて**走らせる（累積判定）。
4. 失敗するとレベル −1、所定の位置まで戻され、その間のマスは**消しゴム**で消える。
5. 結合ゲートでは仲間が全員そろうとボス戦。負けると全滅（`MASUME_BLAME` があれば責任者だけ差し戻し）。
6. 人間のマスはハンコ。
7. 冒険の書は追記だけ。改ざんは「呪い」として見つかり、**ふっかつのじゅもん**で状態を指せる。

## このリポジトリ自体も、マスメで作った

`quests/masume.map.json` がマスメ自身の地図で、`.masume/` がその冒険の書です。

| キャラクター | 担当 | 中の人 |
| --- | --- | --- |
| 賢者クロード | 盤面UI（5mm方眼ノート）とゲームの外側のUX、GM | Claude |
| 書記 | 冒険の書・ルールエンジン・CLI（`src/engine`） | Codex |
| 伝令 | 盤面を配るローカルサーバー（`src/server`） | Codex |
| 地図職人 | ことづけの地図・チュートリアル・Linear 連携 | Codex |
| 絵師 | 駒と道具の絵（`web/assets`） | Codex |
| 勇者（あなた） | 遊んで確かめて、最後のハンコ | 人間 |

GM（クロード）は地図とすべての判定（`tests/e2e/`）を先に書いて封印し、Codex のキャラクターたちが1マスずつ実装しました。
最後のマス **H1「盤面で遊んでハンコを押す」** はあなたのハンコ待ちです。押すと、あがりのボス戦（全判定）が始まります。

```sh
masume serve        # このリポジトリで。盤面の H1 を開いて「ハンコを押す」
masume status
```

## ファイル

```
bin/masume.js            CLI の受付係
src/engine/              冒険の書・ルール（書記）
src/server/              盤面サーバー（伝令）
src/linear/              Linear 連携（地図職人）
web/                     盤面（賢者クロード）、web/assets/ は絵（絵師）
quests/                  地図: masume（自分自身）・kotozuke（ことづけ）・tutorial
tests/e2e/               判定（GM が書いて封印）
docs/                    RULEBOOK / SAVE_FORMAT / CONTRACTS / GM_GUIDE
```
