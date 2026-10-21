# 試作（第11章の盤面の方向合わせ）

ユーザーと方向を合わせるために描いた試作。**本実装ではない**（`web/board/` の作り直しの手本）。

- `spread.png` … examples/memo を seq 58 まで再生した盤面の見開き（キャラごとに蛇行する道・景色・中ボスと大ボスの城・町・モンスターのマス）
- `page-zoom.png` … 1ページ目の拡大
- `page-flip.png` … マスメ自身の地図（8人・66マス・9ページ）で、ページをめくっている途中

ユーザーの判断:

1. 1本の道に全員の駅を並べる案は不採用。**道はキャラクターごとに分け、合流したりしなかったりする**（今の仕様どおり）。道は直線にせず、山・海・町などの景色を描いて世界観を出す。**ページをめくる演出**。キャラごとの進み具合の**ばらつき**が見えること。
2. 名前は **GridHub**（CLI は `gridhub`、`masume` は別名として残す）。
3. ゲームの中身は `docs/GAME_DESIGN.md`（マス＝テスト1件、町＝Git セーブ、中ボスに負けたら町からやり直し、作戦、伝承、閃き など）。この試作のモンスターのマスは、まだ「テスト1件＝1マス」になっていない（判定の出力から数えた仮の絵）。

動かし方（手元の確認用。`shot.mjs` は `tests/helpers.mjs` の Chrome を使う）:

```sh
node docs/prototype/prep.mjs <status --json の出力> <冒険のルート> view-rpg.json   # 判定の出力からテストを数えてビューに足す
node docs/prototype/shot.mjs view-rpg.json out.png 1440 900                        # 見開きのスクリーンショット
```

`index.html` は `/web/board/sketch.js` と `/fonts/local.css`（Google Fonts の字を手元に置いたもの）を読む。`shot.mjs` の配り方を見ること。
