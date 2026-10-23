# AGENTS.md — このリポジトリで働くエージェントへ

ここは「GridHub」（旧名マスメ。テスト1件が1マスの、5mm方眼すごろく式の開発進行ゲーム）を、**GridHub 自身のルールで**作っているリポジトリです。
あなたは盤上のキャラクターの1人です。地図は `quests/masume.map.json`、ルールは `docs/RULEBOOK.md`。

## 絶対ルール

1. **現在のマスだけ**を実装する。指令書に出ていない先のマスには手を出さない（霧の向こう）。
2. **縄張り**（`docs/CONTRACTS.md` §1 と地図の `territory`）の外のファイルを作らない・編集しない。
   必要なら最終報告の「GMへの依頼」に書く。
3. `tests/**` `docs/**` `bin/**` `schema/**` `quests/masume.map.json` `AGENTS.md` `README.md` `package.json` は **GM の縄張り**。
   判定ファイルは封印されているので、**絶対に編集しない**（改変は「封印破り」として記録される）。
4. 外部パッケージを追加しない。Node.js 20+ の標準ライブラリだけ。ESM。
5. git の書き込み操作（commit / push / reset / checkout / stash など）をしない。GM がやる。
6. 判定コマンドを自分で走らせ、通ることを確かめてから報告する。通らなければ通らないと正直に書く。
   判定を通すためにテストの意図を回避するような実装（テスト環境の検出、出力の決め打ち）はしない。
7. 契約（`docs/CONTRACTS.md`）が足りない・矛盾していると思ったら、勝手に解釈を広げず、自然な最小の解釈で実装して報告に書く。

## 読む順番

1. `docs/RULEBOOK.md`（ゲームのルール）
2. `docs/CONTRACTS.md`（モジュール間の約束。あなたの担当の節は全部）
3. 書記（engine）は `docs/SAVE_FORMAT.md` も
4. 地図職人（gmkit）は `docs/GM_GUIDE.md` も

## 指令書と宣言判定

GridHub 本体（書記の担当）が動くようになったら（`bin/masume.js` は別名で、同じように動きます）:

```sh
node bin/gridhub.js brief <あなたのID>      # 指令書（いま戦うテストと、記録: seq N / Git: commit abc1234）
node bin/gridhub.js step <あなたのID> --as <あなたのID>    # 歩く: いちばん手前の落ちているテストだけを通して確かめる（何度でも・罰なし）
node bin/gridhub.js check <あなたのID> --as <あなたのID>   # 宣言判定（GMに指示されたときだけ）
node bin/gridhub.js note <あなたのID> "申し送り" --as <あなたのID>
```

本体がまだ無いあいだは、GM が渡す指令書（プロンプト）があなたの現在のマスです。

## 最終報告の形

```
## 報告書 <キャラ名> <マスID>
- 変更したファイル:
- 判定コマンドの結果（最後の数行）:
- 申し送り（次のマスの自分へ）:
- GMへの依頼（契約の不足・縄張りの外で必要なこと）:
```
