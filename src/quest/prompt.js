// GM に渡すプロンプトを組み立てる（CONTRACTS §14）。
// 付録の GM ガイド・地図の契約・職業と色は、リポジトリの docs/ から読む（コピーを持たない）。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasumeError } from '../engine/index.js';

function readDoc(repoRoot, name) {
  try {
    return readFileSync(join(repoRoot, 'docs', name), 'utf8').replace(/\s+$/u, '');
  } catch {
    throw new MasumeError('E_DOCS', `GM に渡す手引きを読めません: ${join(repoRoot, 'docs', name)}`);
  }
}

/** Markdown の見出し行（start）から、次の見出し（until。既定は次の # か ##）の手前までを取り出す */
export function extractSection(markdown, start, until = /^#{1,2} /u) {
  const lines = markdown.split(/\r?\n/u);
  const from = lines.findIndex((l) => start.test(l));
  if (from < 0) return null;
  let to = lines.length;
  for (let i = from + 1; i < lines.length; i++) {
    if (until.test(lines[i])) {
      to = i;
      break;
    }
  }
  return lines.slice(from, to).join('\n').replace(/\s+$/u, '');
}

function contractSection(repoRoot, label, start, until) {
  const section = extractSection(readDoc(repoRoot, 'CONTRACTS.md'), start, until);
  if (!section) throw new MasumeError('E_DOCS', `docs/CONTRACTS.md に ${label} が見つかりません`);
  return section;
}

/** 最初の依頼書 */
export function buildPrompt({ wish, root, repoRoot }) {
  const guide = readDoc(repoRoot, 'GM_GUIDE.md');
  const mapContract = contractSection(repoRoot, '§2（地図）', /^## 2\. /u);
  const jobsAndColors = contractSection(repoRoot, '§10（職業と色）', /^## 10\. /u, /^### 駒の絵|^#{1,2} /u);

  return `# 依頼書 — あなたは「GridHub（旧名マスメ）」の GM です

GridHub（旧名マスメ）は、5mm方眼ノートのすごろくで開発を進めるゲームです。テスト1件が1マス、タスクがダンジョン、町が Git のセーブです。
ユーザーの願いから、開発ロードマップ全体の地図（\`quest.map.json\`）と、各マスの判定（E2E テスト）を作ってください。
アプリそのものを作る（実装する）のは、あとで出撃する別のエージェントたちです。あなたは地図と判定だけを書きます。

## 1. ユーザーの願い

<願い>
${wish}
</願い>

## 2. いまの状況

- あなたの作業フォルダ（cwd）が、この冒険のルートです: ${root}
- いまは地図も冒険の書もありません。あなたが書いた \`quest.map.json\` を、あなたが終わったあとに masume が検査し、問題がなければ冒険の書をつくります（判定ファイルの封印もそのときに自動で行われます）。
- 検査で問題が見つかったときは、問題の一覧を添えて、あなたはもう一度呼ばれます。
- ユーザーに質問を返すことはできません（答える人がいません）。GM ガイドの「0. ヒアリング」は、聞かずに自分で決めて、決めたことを \`ASSUMPTIONS.md\` に書く、に読み替えてください。
- 環境変数: \`MASUME_DIR\`（ルート）、\`MASUME_BIN\`（masume の実行ファイル。\`node "$MASUME_BIN" …\` で呼べます）、\`MASUME_WISH\`（願い）、\`MASUME_PROMPT_FILE\`（この依頼書のファイル）。
- この依頼書と GM ガイドが食い違ったら、この依頼書を優先してください。ガイドの「手順 7」の \`masume new\` / \`masume seal\` / \`masume serve\` は、あとで masume が代わりに行うので、あなたはしません。

## 3. やってほしいこと（GM の仕事は2つだけです）

### 3-1. 地図を描く: ルート直下の \`quest.map.json\`

- 契約は付録 B（CONTRACTS §2）のとおりです。付録 A の手引きに従って、あがり（\`quest.goal\`）から逆算して描いてください。
- キャラクター（モジュール）は 3〜7 人、1人あたり task が 2〜6 マス。人間にしかできないこと（契約・決済・本番の鍵・審査・承認）は \`kind: "human"\` の道に分け、\`{"kind":"stamp","by":"<人間のID>"}\` のマスにします。
- キャラクターの \`agent\` は \`"claude"\` などの名前でかまいません。\`job\` は付録 C の12職業、\`color\` は8色から選びます。
- 各エージェントの道の**最初の task**は、ほかのキャラクターの成果を待たずに始められるようにしてください（待ち合わせが起きるのは結合ゲートだけです）。
- モジュールが初めてつながる所に結合ゲートを置き、最後のゲートを \`quest.goal\`（あがり）にします。あがりの判定は、ユーザーの願いが叶ったと言える一場面を、外から確かめるものにします。
- 各 task の \`detail\` には、やることと合格条件に加えて、**判定が叩く入口**（コマンドの形・URL とレスポンス・読むファイル）を具体的に書きます。エージェントは自分の指令書（マスの \`detail\` と判定コマンド）と、封印された判定ファイルを読んで実装します。
- 各キャラクターに、重ならない \`territory\`（縄張りの glob）を書きます。共有ファイル（モジュール間の約束、設定など）は、どのキャラクターの縄張りにも入れません。町（camp）に着くと、そのキャラクターの縄張りの変更が Git にコミットされます（セーブ）。
- \`quest.save: "git"\` を書きます（町 = セーブ = Git のコミット。負けたら縄張りが町のコミットに戻ります）。
- 各 task（と gate）の \`check\` に \`cases\`（テストの名前の配列）を書きます。1件 = 1マス = 1つの変数（値・状態・分岐）に対する小さな作業。ダンジョン1つに2〜6件。名前は変える値と期待を技術の言葉で（例「title が空なら 400」）。判定ファイルの中のテストの名前を、\`cases\` と**同じ**にします（\`node --test\` の \`test('title が空なら 400', …)\` など。エンジンは出力の ✔/✖・ok/not ok からテスト1件ずつの成否を読みます）。
- モジュール間の約束（API の形、ファイルの形式、環境変数など）が必要なら、ルートに \`CONTRACTS.md\` を書き、各マスの \`detail\` から参照してください。

### 3-2. 判定を書いて封印の準備をする: 判定ファイル（E2E）

- 判定ファイルは、ルートからの相対パス（例: \`checks/store-save.test.mjs\`）に書き、そのマスの \`check.seal\` に列挙します。\`check.run\` はルートで \`/bin/sh -c\` に渡されます。
- **できるだけすべての task と gate の分**を書いてください。**少なくとも各エージェントの道の最初の task の分は必ず**書いてください（\`check.seal\` に書いたファイルが無いと、そのマスは封印されず、エージェントが判定を受けられません）。
- 判定は**いまは落ちる**ものにします。まだ何も実装されていないので、通ってしまう判定（空のテスト、常に exit 0）は誤りです。
- 判定は E2E です。単体テストではなく、外から叩きます（CLI を実行して出力を見る、HTTP を叩く、生成物を検査する、など）。
- 本物の外部サービス・本物の鍵は使いません（フェイク、サンドボックス、録画データを使う）。
- 何度走らせても同じ結果になるようにします（一時ディレクトリを使い、後片付けする）。累積判定で何度も再実行されます。
- 判定は Node.js 20 以上の標準ライブラリだけで書き、外部パッケージのインストールを要求しません（\`node checks/xxx.mjs\` や \`node --test checks/xxx.test.mjs\`）。判定の中で \`node --test\` を入れ子に呼ぶときは、環境変数 \`NODE_TEST_CONTEXT\` を外してください（残すと何も走らずに通ってしまいます）。
- 判定が走るとき、環境変数 \`MASUME_ROOT\`（ルート）、\`MASUME_CHARACTER\`、\`MASUME_NODE\` が渡されます。
- 落ちるときは、何が足りないのかが1行で読める出力にします。ゲートの判定は、どのモジュールのせいか分かる箇所で \`MASUME_BLAME: <キャラクターID>\` の行を出します。

### 3-3. 任意の文書

- \`CONTRACTS.md\` — モジュール間の約束（上記）。
- \`ASSUMPTIONS.md\` — 聞かずに決めた前提（誰がどこで使うか、外部サービスは何を使うか、など）。

## 4. やってはいけないこと

- **アプリそのものは実装しない。** 機能のコード、画面、データベースの実体を書かないでください。書いてよいのは、地図・判定ファイル・約束の文書だけです（設定ファイルが要るなら最小限）。
- \`.masume/\` を作らない・触らない。\`masume new\` や \`masume seal\` を自分で実行しない。
- git の書き込み操作（commit / push / reset / checkout / stash など）をしない。
- 外部パッケージのインストールや、外部ネットワークへの通信が必要な判定を書かない。
- 地図を \`quest.map.json\` 以外の場所や名前で置かない。
- ユーザーへの質問や確認で終わらない。必ず \`quest.map.json\` を書いて終わる。

## 5. 終わる前に確かめること

1. \`node "$MASUME_BIN" validate quest.map.json\` を実行し、エラーが出ないことを確かめる（エラーが出たら直す）。
2. 判定ファイルを書いたマスの \`check.run\` を、ルートで1回ずつ走らせてみる。「落ちる」こと、そして落ちる理由が判定自身のバグ（構文エラー、import の失敗など）ではなく「まだ実装がない」ことであることを確かめる（判定のバグでエージェントを全滅させないため）。
3. 最後に、作ったキャラクター・マス・ゲートを数行で報告する。

## 6. よくある地図の間違い（検査で見つかるもの）

- \`E_GATE_MEMBERS\` — ゲートは2人以上の道に出てくる必要がある（キャラクターが1人だけの地図で、あがりのゲートだけは1人でよい）。
- \`E_GOAL\` — \`quest.goal\` は gate で、全キャラクターの道の最後でなければならない。
- \`E_SHARED_TASK\` — task / camp は1つの道にしか置けない（共有できるのは gate だけ）。
- \`E_CYCLE\` — ゲートの順番が道ごとに食い違っている。
- \`E_CHECK\` — task / gate に check が無い、camp に check がある、gate が stamp、stamp の \`by\` が人間でない、\`cases\` が1〜50件の重複しない名前（各1〜120文字）でない、stamp に \`cases\` がある。
- \`E_ORPHAN\` / \`E_UNKNOWN_NODE\` — どの道にも出てこないマス、存在しないマスを道に書いている。

---

# 付録 A — GM ガイド（docs/GM_GUIDE.md の全文）

${guide}

---

# 付録 B — 地図の契約（docs/CONTRACTS.md §2）

${mapContract}

---

# 付録 C — 職業と色（docs/CONTRACTS.md §10 より）

${jobsAndColors}
`;
}

/**
 * 追いプロンプト。GM は前回の記憶を持たないことがあるので、最初の依頼書の全文を付ける。
 * problems: 検査で見つかった問題の行（[CODE] path: message）。missing: 地図が書かれていなかった。
 */
export function buildRetryPrompt({ original, problems, warnings = [], missing = false, attempt }) {
  const lines = [];
  if (missing) {
    lines.push('# 依頼書（やり直し） — quest.map.json が書かれていません', '');
    lines.push(`前回の仕事のあと、ルート直下に \`quest.map.json\` が見つかりませんでした（${attempt}回目のやり直し）。`);
    lines.push('ユーザーへの質問や説明だけで終わらず、いま `quest.map.json` を書いてください。');
  } else if (problems.length > 0) {
    lines.push('# 依頼書（やり直し） — quest.map.json を直してください', '');
    lines.push(`前回の仕事のあと、masume が \`quest.map.json\` を検査したところ、次の問題が見つかりました（${attempt}回目のやり直し）。`);
    lines.push('', '```', ...problems, '```', '');
    lines.push('`quest.map.json` を直して、同じ場所（ルート直下）に書き直してください。');
    lines.push('- いまの `quest.map.json` はルートにあります。読んで、問題の箇所を直してください（最初から書き直さなくてかまいません）。');
    lines.push('- すでに書いた判定ファイルは、地図の都合で変えなくてよいかぎり、そのままにしてください（消さないでください）。');
    lines.push('- 直したら `node "$MASUME_BIN" validate quest.map.json` を実行し、エラーが出ないことを確かめてから終わってください。');
  } else {
    lines.push('# 依頼書（やり直し） — 足りない判定ファイルを書いてください', '');
    lines.push(`\`quest.map.json\` の検査には通りましたが、次の点が残っています（${attempt}回目のやり直し）。`);
  }
  if (warnings.length > 0) {
    lines.push('', problems.length > 0 || missing ? '加えて、次の点も直してください。' : '', '```', ...warnings, '```');
    lines.push('`check.seal` に書いた判定ファイルが無いマスは封印できず、エージェントが判定を受けられません。判定ファイルを書くか、`check.seal` を直してください。');
  }
  lines.push('', '---', '', '以下は、最初にお渡しした依頼書の全文です（そのままお付けします。前回の記憶がなくても読めるようにしてあります）。', '', original);
  return lines.join('\n');
}
