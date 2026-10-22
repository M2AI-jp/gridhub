# 盤面のスクリーンショット（第11章）

`docs/shots/shot.mjs` は、盤面（`web/index.html`）にビューの JSON を渡して、ヘッドレス Chrome でスクリーンショットを撮る道具です。
盤面のファイルは変えず、`?fixture=shot` として渡したビューを描きます。

## 撮るもの

| ファイル | 中身 |
| --- | --- |
| `<name>-spread.png` | 見開き（はじめに開く見開き。作業中の駒がいちばん多いページ） |
| `<name>-flip.png` | ページをめくっている途中（葉を 68° で止めて撮る） |
| `<name>-zoom.png` | 作業中の駒のまわりを拡大（モンスターのマス・札の字が読める大きさ） |
| `<name>-narrow.png` | スマホの幅（390×844。1ページずつ） |
| `<name>-ending.png` | エンディング（ビューに `ending` があるときだけ） |

## 使い方

```sh
# Chrome（判定と同じ。root で動かすときは --no-sandbox を足す包みのスクリプトを MASUME_CHROME に）
export MASUME_CHROME=/path/to/chrome

# 見本で撮る
node docs/shots/shot.mjs web/fixtures/demo-state.json /tmp/shots
node docs/shots/shot.mjs web/fixtures/end-state.json /tmp/shots --name end

# 本物の冒険で撮る（ビューは gridhub status --json の出力）
node bin/gridhub.js status --json --dir examples/memo > /tmp/memo-view.json
node docs/shots/shot.mjs /tmp/memo-view.json /tmp/shots --name memo --width 1600 --height 1000
```

オプション: `--only spread,flip,zoom,narrow,ending`（撮るものを絞る）、`--spread <ページ番号>`（見開きを指定して撮る）、`--width`・`--height`（見開きの画面の大きさ。既定 1600×1000）、`--name`（ファイル名の頭。既定 `board`）、`--fonts <フォルダ>`（下の手書きの字）。

## 手書きの字（Google Fonts）

盤面は Google Fonts の3つの字（Klee One・Yusei Magic・Yomogi）を使いますが、判定の Chrome は外のホストを引けません（`tests/helpers.mjs` の `--host-resolver-rules`）。
字なしでも撮れますが（手元の書体で描く）、手書きの字で撮りたいときは、字を手元のフォルダに置いて `--fonts` で渡します。**字のファイルはリポジトリに入れません**（スクラッチのフォルダに置く）。

```sh
mkdir -p /tmp/fonts/f && cd /tmp/fonts
curl -sS -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' \
  'https://fonts.googleapis.com/css2?family=Klee+One:wght@400;600&family=Yomogi&family=Yusei+Magic&display=swap' -o g.css
grep -o 'https://fonts.gstatic.com/[^)]*' g.css | sort -u > urls.txt
node -e "
const fs=require('fs'),c=require('crypto'),cp=require('child_process');
let css=fs.readFileSync('g.css','utf8');
for (const u of fs.readFileSync('urls.txt','utf8').trim().split('\n')) {
  const n=c.createHash('md5').update(u).digest('hex').slice(0,16)+'.woff2';
  cp.execFileSync('curl',['-sS',u,'-o','f/'+n]);
  css=css.split(u).join('/fonts/f/'+n);
}
fs.writeFileSync('local.css',css);"
node docs/shots/shot.mjs web/fixtures/demo-state.json /tmp/shots --fonts /tmp/fonts
```

`--fonts` を渡すと、道具は `index.html` の Google Fonts の `<link>` の行き先を `/fonts/local.css` に差し替えて配ります（配るときだけ。ファイルは変えない）。
