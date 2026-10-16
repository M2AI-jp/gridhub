// 語り部の支度（CONTRACTS §21）: よそのプロジェクトでも、エージェントがマスメのルールを守れるように
// AGENTS.md・CLAUDE.md・.gitignore・.masume/party.json を置く。init と quest のあとの両方から呼ばれる。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasumeError } from '../engine/index.js';

export const AGENT_KINDS = ['claude', 'codex'];
const PARALLEL = 3;
const IGNORE_LINES = ['.masume/lock', '.masume/state.json', '.masume/party.log'];
const IGNORE_HEADING = '# マスメ（セーブデータ本体 .masume/log.jsonl は残す）';

const CLAUDE_MD = `このプロジェクトはマスメで進めています。AGENTS.md を読んでください。

@AGENTS.md
`;

/** AGENTS.md の中身。コマンドはそのまま打てるよう、bin の絶対パスを埋める */
export function agentsMd({ bin, rulebook }) {
  const masume = `node "${bin}"`;
  return `# AGENTS.md — このプロジェクトで働くエージェントへ

このプロジェクトは「マスメ」（5mm方眼すごろく式の開発進行ゲーム）で進めています。
あなたは盤上のキャラクターの1人です。進捗は冒険の書（\`.masume/\`）にだけ記録され、進めるのは**判定（E2E）に通ったときだけ**です。
ルールブック: ${rulebook}（迷ったら読む）

以降の \`<ID>\` は、あなたのキャラクターID（依頼文か \`MASUME_CHARACTER\` で渡される）。
コマンドはこのプロジェクトのフォルダで打つ（別の場所なら \`--dir <このフォルダ>\` を足す）。

## 1ターンの流れ

1. 指令書を読む。いまのマス・判定コマンド・縄張り・仲間の位置・前の自分の日誌が出る:

   \`\`\`sh
   ${masume} brief <ID>
   \`\`\`

2. 指令書の「現在のマス」だけを、縄張りの中で実装する。
3. 素振り: 指令書の「判定:」のコマンドを、通るまで何度走らせてもよい（記録されない）。
4. 宣言判定（公式。冒険の書に記録される一発勝負）。素振りが通ってから打つ。GM から「まだ打つな」と言われているときは打たない:

   \`\`\`sh
   ${masume} check <ID> --as <ID>
   \`\`\`

   現在のマスが結合ゲート（gate）やあがりのときは \`--no-boss\` を付ける。ボス戦は仲間がそろってから GM（パーティ）がやる:

   \`\`\`sh
   ${masume} check <ID> --as <ID> --no-boss
   \`\`\`

5. 日誌: 次の自分への申し送りを残す。

   \`\`\`sh
   ${masume} note <ID> "申し送り" --as <ID>
   \`\`\`

宣言判定に落ちるとレベルが下がって戻される。2回落ちたら、そこで止まって報告する。

## 守ること

- **現在のマスだけ**を実装する。指令書に出ていない先のマス（霧の向こう）には手を出さない。
- **縄張り**（指令書の「縄張り」＝地図の \`territory\`）の外のファイルを作らない・編集しない。必要なら報告の「GMへの依頼」に書く。
- **封印**された判定ファイルと地図（\`quest.map.json\`、\`.masume/\` の中）は編集しない。改変は「封印が破れています」と記録され、判定できなくなる。
- git の書き込み操作（commit / push / reset / checkout / stash など）をしない。GM がやる。
- 判定を通すために、テストの意図を回避する実装（テスト環境の検出、出力の決め打ち）をしない。通らないなら通らないと正直に書く。
- 指令書が足りない・矛盾しているときは、解釈を広げず、自然な最小の解釈で実装して報告に書く。

## 最終報告

\`\`\`
## 報告書 <キャラ名> <マスID>
- 変更したファイル:
- 判定コマンドの結果（最後の数行）:
- 申し送り（次のマスの自分へ）:
- GMへの依頼（足りない契約・縄張りの外で必要なこと）:
\`\`\`
`;
}

function writeNew(file, text, force) {
  if (existsSync(file) && !force) return false;
  writeFileSync(file, text);
  return true;
}

/** .gitignore に足りない行だけを足す。足した行を返す（無ければ空） */
function ensureIgnore(file) {
  const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const have = new Set(before.split(/\r?\n/u).map((l) => l.trim()));
  const missing = IGNORE_LINES.filter((l) => !have.has(l));
  if (missing.length === 0) return [];
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lead = before === '' || before.endsWith('\n') ? '' : eol;
  const gap = before.trim() === '' ? '' : eol;
  const heading = have.has(IGNORE_HEADING) ? [] : [IGNORE_HEADING];
  writeFileSync(file, `${before}${lead}${gap}${[...heading, ...missing].join(eol)}${eol}`);
  return missing;
}

/** 既にある party.json のほかの項目（model など）は残して、agent だけ合わせる */
function writePartyJson(file, agent) {
  let current = {};
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed;
  } catch {}
  const next = { ...current, agent, parallel: Number.isInteger(current.parallel) ? current.parallel : PARALLEL };
  writeFileSync(file, `${JSON.stringify(next)}\n`);
}

/**
 * opts: { root, agent, force }   ctx: { bin, root（リポジトリ） }
 * 戻り値: { root, files: [{ file, written, note }] }（file は root からの相対パス）
 */
export function setupProject({ root, agent, force = false }, ctx) {
  if (agent !== undefined && agent !== null && !AGENT_KINDS.includes(agent)) {
    throw new MasumeError('E_USAGE', `--agent は ${AGENT_KINDS.join(' / ')} のどちらかです（受け取った値: ${agent}）`);
  }
  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    throw new MasumeError('E_USAGE', `--dir の場所を作れません: ${root}（${error.message}）`);
  }
  const files = [];

  const rulebook = join(ctx.root, 'docs', 'RULEBOOK.md');
  const wroteAgents = writeNew(join(root, 'AGENTS.md'), agentsMd({ bin: ctx.bin, rulebook }), force);
  files.push({ file: 'AGENTS.md', written: wroteAgents, note: wroteAgents ? '' : '（--force で書き直せます）' });

  const claudeFile = join(root, 'CLAUDE.md');
  const keptClaude = existsSync(claudeFile) && !force;
  const wroteClaude = writeNew(claudeFile, CLAUDE_MD, force);
  const claudeNote = keptClaude && !/^@AGENTS\.md\s*$/mu.test(readFileSync(claudeFile, 'utf8'))
    ? '（Claude Code に AGENTS.md を読ませるなら、CLAUDE.md に @AGENTS.md の行を足してください）'
    : wroteClaude ? '' : '（--force で書き直せます）';
  files.push({ file: 'CLAUDE.md', written: wroteClaude, note: claudeNote });

  const added = ensureIgnore(join(root, '.gitignore'));
  files.push({ file: '.gitignore', written: added.length > 0, note: added.length > 0 ? `（足した行: ${added.join(' ')}）` : '（必要な行はもうあります）' });

  if (agent) {
    if (existsSync(join(root, '.masume', 'log.jsonl'))) {
      writePartyJson(join(root, '.masume', 'party.json'), agent);
      files.push({ file: '.masume/party.json', written: true, note: `（agent: ${agent}, parallel: ${PARALLEL}）` });
    } else {
      files.push({ file: '.masume/party.json', written: false, note: '（冒険の書がまだ無いので書きません）' });
    }
  }
  return { root, files };
}

export function printSetup(say, { files }) {
  for (const { file, written, note } of files) {
    say(written ? `書きました: ${file}${note}` : `${file} はそのまま${note}`);
  }
}
