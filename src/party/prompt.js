// 出撃するエージェントに渡すプロンプト（日本語）。CONTRACTS §13「プロンプトに必ず入れること」。
import { spawnSync } from 'node:child_process';
import { brief } from '../engine/index.js';
import { DEFAULT_TACTIC, TACTICS } from './tactics.js';

/** `masume brief <id>` のテキスト全文。CLI が使えなければ JSON から最低限を組み立てる。 */
function briefText(root, bin, id, report) {
  const r = spawnSync(process.execPath, [bin, 'brief', id, '--dir', root], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1', MASUME_DIR: '' },
    timeout: 30_000,
  });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trimEnd();
  const c = report.character;
  const lines = [`指令書: ${c.name}（${c.id}）`, `縄張り: ${c.territory.join('、') || '指定なし'}`];
  if (report.current) {
    lines.push(`現在のマス: ${report.current.id}「${report.current.title}」（${report.current.type}）`);
    if (report.current.detail) lines.push(report.current.detail);
    if (report.current.check?.kind === 'cmd') lines.push(`判定: ${report.current.check.run}`);
  }
  lines.push(`記録: seq ${report.seq}`);
  return lines.join('\n');
}

/** シェルの単一引用符（CONTRACTS §26.6）。パスに $ " ` や空白があっても、そのまま貼って動く。 */
export const sq = (text) => `'${String(text).replace(/'/gu, `'\\''`)}'`;
// 安全な文字だけなら、そのまま。それ以外（キャラクターIDに変わった文字があるとき）は引用符で包む。
const word = (text) => (/^[A-Za-z0-9_.@%+=:,/-]+$/u.test(text) ? text : sq(text));

export function buildPrompt({ root, bin, view, characterId, tactic = TACTICS[DEFAULT_TACTIC] }) {
  const report = brief(root, characterId);
  const { character, current } = report;
  const text = briefText(root, bin, characterId, report);
  const territory = character.territory.length
    ? character.territory.join('、')
    : '指定なし（現在のマスの実装に必要な範囲だけ）';
  const node = current ? view.nodes[current.id] : null;
  const seals = node?.check?.seal ?? [];
  const run = current?.check?.kind === 'cmd' ? current.check.run : null;
  const q = view.quest;
  const id = characterId;
  const who = word(id);
  const declare = `node ${sq(bin)} check ${who} --as ${who} --no-boss --dir ${sq(root)}`;
  const note = `node ${sq(bin)} note ${who} '<申し送り>' --as ${who} --dir ${sq(root)}`;
  const briefAgain = `node ${sq(bin)} brief ${who} --dir ${sq(root)}`;
  const walk = `node ${sq(bin)} step ${who} --as ${who} --dir ${sq(root)}`;
  // 伝承（§45.2）: この出撃が何回目か = これまでの出撃の数 + 1
  const generation = (view.characters.find((c) => c.id === id)?.sorties ?? 0) + 1;

  const lines = [
    `あなたは「GridHub（旧名マスメ）」（テスト1件が1マスの、5mm方眼すごろく式の開発進行ゲーム）の冒険に参加しているキャラクター「${character.name}」（ID: ${id}）です。`,
    `伝承: あなたは ${character.name} の ${generation}代目。指令書の技と日誌は先代から受け継いだもの。苦労して分かったことは、次の代のために日誌に書く。`,
    `作戦: ${tactic.name}（${tactic.id}）— ${tactic.moves}`,
    `歩く（何度でも・記録される・罰なし）: ${walk}`,
    '1マスずつ: いちばん手前の落ちているテスト（いま戦うテスト）だけを通す。通したら、歩いて確かめる。',
    '',
    `冒険: ${q.title}${q.pitch ? ` — ${q.pitch}` : ''}`,
    `作業場所（ゲームのルート。ここで作業する）: ${root}`,
    '',
    'GridHub では、作るものを「ダンジョン」（タスク）に分け、ダンジョンの中のマスはテスト1件ずつ（モンスター）です。ダンジョンを抜けられるのは、封印された判定（E2Eテスト）に宣言で通ったときだけで、「できました」という自己申告では進めません。',
    tactic.id === 'bold'
      ? `あなたの仕事は、いまのマス${current ? `（${current.id}「${current.title}」）` : ''}から次の町まで、ダンジョンを1つずつ実装して宣言判定に通し、町に着いたら止まって報告することです。指令書に出ていない先のマス（霧の向こう）は、着いてから指令書を読み直して進めます。`
      : `あなたの仕事は、いまのマス${current ? `（${current.id}「${current.title}」）` : ''}の1つだけを実装して宣言判定に通し、そこで止まって報告することです。先のマスには手を出しません。`,
    '',
    '## 指令書',
    '',
    `次は \`masume brief ${id}\` の出力です。現在のマス・判定・視界・仲間・自分の前の日誌が書いてあります。`,
    '',
    text,
    '',
    '## 守ること',
    '',
    '- 現在のマスだけをやる。指令書に出ていない先のマス（霧の向こう）の内容は実装しない。',
    `- 自分の縄張りの中だけを編集する。縄張り: ${territory}。縄張りの外のファイルを作らない・編集しない。必要なら最終報告の「GMへの依頼」に書く。`,
    `- 封印された判定ファイル${seals.length ? `（${seals.join('、')}）` : ''}と、地図（*.map.json）と、冒険の書（.masume/）は編集しない。封印を破ると記録され、判定できなくなる。`,
    '- 判定のほうがおかしい（契約や指令書どおりに作っても通らない）と思ったら、判定を直さず、宣言もせずに、そこで止まって報告する。',
    '- git の書き込み操作（commit / push / reset / checkout / stash など）をしない。',
    '- GridHub のコマンドは brief / step / check / note だけを使う。new / seal / amend / load / repair / stamp / party / quest などは使わない。',
    '- 判定を通すために、テストの意図を回避する実装（テスト環境の検出、出力の決め打ち）をしない。',
    '- 外部パッケージを勝手に増やさない。本物の外部サービスや課金・秘密の鍵を使わない。',
    '',
    '## 進め方',
    '',
    '1. 上の指令書の「現在のマス」と「いま戦うテスト」を読む。いちばん手前の落ちているテスト（いま戦うテスト）だけを通すように、小さく実装する。',
    `2. 歩く（今のダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する。何度でもよく、罰はない）:\n\n       ${walk}\n\n   倒したら、次の落ちているテストへ。全部のテストが通るまで、1と2をくり返す。${run ? `判定コマンドそのもの（${run}）を素振りで走らせてもよい（記録されない）。` : ''}`,
    `3. 全部のテストが通ったら、宣言判定（公式の判定。一発勝負。記録される。歩いて全部通ってからにする）:\n\n       ${declare}\n\n   - 通ると「判定成功」と出て、ダンジョンを抜けて次のマスへ進む。\n   - 落ちるとレベルが下がり、前のマスに巻き戻されることがある（累積判定: 宿屋より後の自分のマスの判定をまとめて走らせる）。失敗の出力を読み、\`${briefAgain}\` で現在のマスを確かめ直して、直してから素振りをやり直す。\n   - 結合ゲート（ボス戦）に着いたら「待機」になる。ボス戦は軍師（パーティ）がやるので、あなたは何もしなくてよい。`,
    `4. 日誌（次の自分への申し送りを短く。何を作ったか、次のマスで気をつけること。\`<申し送り>\` を書き換える。単一引用符 ' で囲んであるので、文の中に ' を入れたいときは '\\'' と書く）:\n\n       ${note}`,
    '',
    `## 作戦: ${tactic.name}（${tactic.id}）`,
    '',
    `- 動き方: ${tactic.moves}`,
    '- 作戦はルールを変えない（宣言は一発勝負、町でセーブ、はどの作戦でも同じ）。',
    '',
    '## 止まる条件',
    '',
    ...tactic.stops.map((line) => `- ${line}`),
    ...(tactic.id === 'bold' ? [] : ['- 結合ゲートに着いて待機になったら、そこで止まる。']),
    '- 判定や契約がおかしくて進めないと分かったら、そこで止まる。',
    '',
    '止まったら、次の形で短く報告して終わる:',
    '',
    `    ## 報告書 ${character.name} <マスID>`,
    '    - 変更したファイル:',
    '    - 判定の結果（最後の数行）:',
    '    - 申し送り（次のマスの自分へ）:',
    '    - GMへの依頼（契約の不足・縄張りの外で必要なこと）:',
    '',
  ];
  return lines.join('\n');
}
