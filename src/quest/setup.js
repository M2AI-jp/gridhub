// 語り部の支度（CONTRACTS §21・§46.4）: よそのプロジェクトでも、エージェントが GridHub（旧名マスメ）のルールを守れるように
// AGENTS.md・CLAUDE.md・.gitignore・.masume/party.json を置く。init と quest のあとの両方から呼ばれる。
import { lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { MasumeError } from '../engine/index.js';

export const AGENT_KINDS = ['claude', 'codex'];
const PARALLEL = 3;
const IGNORE_LINES = ['.masume/lock', '.masume/state.json', '.masume/party.log'];
const IGNORE_HEADING = '# マスメ（セーブデータ本体 .masume/log.jsonl は残す）'; // 第15章まで書いていた見出し。前に書いた .gitignore に見出しを2つ並べないために覚えておく
const IGNORE_HEADING_NOW = '# GridHub（旧名マスメ）の一時ファイル（冒険の書 .masume/log.jsonl と判定の出力 .masume/outputs/ は残す）';

const CLAUDE_MD = `このプロジェクトは GridHub（旧名マスメ）で進めています。AGENTS.md を読んでください。

@AGENTS.md
`;

/** シェルの単一引用符で引用する（$ " ` や空白や ' が入っていても、そのまま貼って動く。§27.8） */
export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

/** AGENTS.md の中身。コマンドはそのまま打てるよう、bin の絶対パスを（引用して）埋める */
export function agentsMd({ bin, rulebook }) {
  const masume = `node ${shellQuote(bin)}`;
  return `# AGENTS.md — このプロジェクトで働くエージェントへ

このプロジェクトは「GridHub（旧名マスメ）」（テスト1件が1マスの、5mm方眼すごろく式の開発進行ゲーム）で進めています。
あなたは盤上のキャラクターの1人です。進捗は冒険の書（\`.masume/\`）にだけ記録され、進めるのは**判定（E2E）に通ったときだけ**です。
タスクはダンジョンで、その中のマスはテスト1件ずつ（モンスター）です。町に着くと、縄張りの変更が Git にコミットされます（セーブ）。
ルールブック: ${rulebook}（迷ったら読む）

以降の \`<ID>\` は、あなたのキャラクターID（依頼文か \`MASUME_CHARACTER\` で渡される）。
コマンドはこのプロジェクトのフォルダで打つ（別の場所なら \`--dir <このフォルダ>\` を足す）。

## 1ターンの流れ

1. 指令書を読む。いまのマス・判定コマンド・縄張り・仲間の位置・前の自分の日誌が出る:

   \`\`\`sh
   ${masume} brief <ID>
   \`\`\`

2. 1マスずつ進める: 指令書の「いま戦うテスト」（いちばん手前の落ちているテスト）だけを通すように、縄張りの中で小さく実装する。
3. 歩く: 今のダンジョンの判定だけを走らせ、テスト1件ずつの成否を記録する（何度でも・罰なし）。倒したら次の落ちているテストへ。2と3をくり返す:

   \`\`\`sh
   ${masume} step <ID> --as <ID>
   \`\`\`

   指令書の「判定:」のコマンドを素振りで走らせてもよい（記録されない）。
4. 宣言判定（公式。冒険の書に記録される一発勝負）。歩いて全部のテストが通ってから打つ。GM から「まだ打つな」と言われているときは打たない:

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

宣言判定に落ちるとレベルが下がって町まで戻される（Git でセーブする冒険では、縄張りのファイルも町のコミットに戻り、戻す前の変更は墓 = git stash に残る。指令書に \`git stash apply\` の取り出し方が出る）。2回落ちたら、そこで止まって報告する。

## 守ること

- **現在のマスだけ**を実装する。指令書に出ていない先のマス（霧の向こう）には手を出さない。
- **縄張り**（指令書の「縄張り」＝地図の \`territory\`）の外のファイルを作らない・編集しない。必要なら報告の「GMへの依頼」に書く。
- **封印**された判定ファイルと地図（\`quest.map.json\`、\`.masume/\` の中）は編集しない。改変は「封印が破れています」と記録され、判定できなくなる。
- git の書き込み操作（commit / push / reset / checkout / stash など）をしない。セーブ（コミット）は町に着いたときに GridHub がやる。
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

/**
 * root の中の rel に書いてよいか調べる（§27.7）。
 *  - 書いてよい: { path, exists } … path は実際に書く場所（symlink なら実体。symlink 自体は残す）
 *  - 書かない:   { reason }       … 外を指す・ぶら下がった・ふつうのファイルでない symlink など
 * 実体がルートの中にあるときだけ書く。ルートの外のファイルを、init の書き込みで壊さないため。
 */
function writableTarget(root, rootReal, rel) {
  const file = join(root, rel);
  const inside = (path) => path === rootReal || path.startsWith(`${rootReal}${sep}`);
  const parentInside = () => {
    try {
      return inside(realpathSync(dirname(file)));
    } catch {
      return true; // 親がまだ無い。作るのは自分（ルートの中）
    }
  };
  let info;
  try {
    info = lstatSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') return { reason: `調べられません: ${error.code ?? error.message}` };
    return parentInside() ? { path: file, exists: false } : { reason: 'ルートの外を指すフォルダの中です' };
  }
  if (info.isSymbolicLink()) {
    let real;
    try {
      real = realpathSync(file);
    } catch (error) {
      return { reason: error.code === 'ELOOP' ? 'リンクが輪になっています' : 'リンク先がありません（ぶら下がったリンクです）' };
    }
    if (!inside(real)) return { reason: 'ルートの外を指すリンクです' };
    if (!statSync(real).isFile()) return { reason: 'リンク先がふつうのファイルではありません' };
    return { path: real, exists: true };
  }
  if (!info.isFile()) return { reason: 'ふつうのファイルではありません' };
  return parentInside() ? { path: file, exists: true } : { reason: 'ルートの外を指すフォルダの中です' };
}

/** 既存のファイルは force のときだけ書き直す。新しいファイルは、書く直前に現れた何かを踏まないよう wx で作る */
function writeNew(target, text, force) {
  if (target.exists && !force) return false;
  try {
    if (target.exists) writeFileSync(target.path, text);
    else writeFileSync(target.path, text, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') return false; // 書く直前にだれかが作った。そのまま残す
    throw error;
  }
  return true;
}

/** .gitignore に足りない行だけを足す。足した行を返す（無ければ空）。lines は足したい行（既定は IGNORE_LINES） */
function ensureIgnore(target, lines = IGNORE_LINES) {
  const before = target.exists ? readFileSync(target.path, 'utf8') : '';
  const have = new Set(before.split(/\r?\n/u).map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l));
  if (missing.length === 0) return [];
  const eol = before.includes('\r\n') ? '\r\n' : '\n';
  const lead = before === '' || before.endsWith('\n') ? '' : eol;
  const gap = before.trim() === '' ? '' : eol;
  const heading = have.has(IGNORE_HEADING) || have.has(IGNORE_HEADING_NOW) ? [] : [IGNORE_HEADING_NOW];
  const text = `${before}${lead}${gap}${[...heading, ...missing].join(eol)}${eol}`;
  if (target.exists) writeFileSync(target.path, text);
  else writeFileSync(target.path, text, { flag: 'wx' });
  return missing;
}

/**
 * 既にある party.json のほかの項目（model など）は残して、agent だけ合わせる。
 * allowListen が true のときだけ `"allow_listen": true` も書く（§31.3・§31.4）。false / 未指定なら allow_listen には触らない。
 */
function writePartyJson(target, agent, allowListen) {
  let current = {};
  try {
    const parsed = JSON.parse(readFileSync(target.path, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) current = parsed;
  } catch {}
  const next = { ...current, agent, parallel: Number.isInteger(current.parallel) ? current.parallel : PARALLEL };
  if (allowListen === true) next.allow_listen = true;
  writeFileSync(target.path, `${JSON.stringify(next)}\n`);
}

const sameFile = (a, b) => {
  try {
    const x = statSync(a);
    const y = statSync(b);
    return x.dev === y.dev && x.ino === y.ino;
  } catch {
    return false;
  }
};

/**
 * opts: { root, agent, force, allowListen, ignore }   ctx: { bin, root（リポジトリ） }
 * ignore: .gitignore に IGNORE_LINES のほかに足す行（quest が GM の作業ファイルを足す。§21）
 * allowListen: true なら party.json に `"allow_listen": true` も書く（agent があって、party.json を書くときだけ。§31）
 * 戻り値: { root, files: [{ file, written, note, reason }] }（file は root からの相対パス）
 * reason があるファイルは「書きません」（symlink が外を指す・ぶら下がっている・AGENTS.md と同じ実体 など）
 */
export function setupProject({ root, agent, force = false, allowListen = false, ignore = [] }, ctx) {
  if (agent !== undefined && agent !== null && !AGENT_KINDS.includes(agent)) {
    throw new MasumeError('E_USAGE', `--agent は ${AGENT_KINDS.join(' / ')} のどちらかです（受け取った値: ${agent}）`);
  }
  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    throw new MasumeError('E_USAGE', `--dir の場所を作れません: ${root}（${error.message}）`);
  }
  const rootReal = realpathSync(root);
  const files = [];
  const refuse = (file, reason) => files.push({ file, written: false, note: '', reason });

  const rulebook = join(ctx.root, 'docs', 'RULEBOOK.md');
  const agentsTarget = writableTarget(root, rootReal, 'AGENTS.md');
  if (agentsTarget.reason) refuse('AGENTS.md', agentsTarget.reason);
  else {
    const wrote = writeNew(agentsTarget, agentsMd({ bin: ctx.bin, rulebook }), force);
    files.push({ file: 'AGENTS.md', written: wrote, note: wrote ? '' : '（--force で書き直せます）' });
  }

  const claudeTarget = writableTarget(root, rootReal, 'CLAUDE.md');
  if (claudeTarget.reason) refuse('CLAUDE.md', claudeTarget.reason);
  else if (claudeTarget.exists && sameFile(claudeTarget.path, join(root, 'AGENTS.md'))) {
    // CLAUDE.md が AGENTS.md の別名（symlink など）。書くと AGENTS.md の規則が消えてしまう
    refuse('CLAUDE.md', 'AGENTS.md と同じファイルです。書くと AGENTS.md の規則が消えます');
  } else {
    const kept = claudeTarget.exists && !force;
    const wrote = writeNew(claudeTarget, CLAUDE_MD, force);
    const note = kept && !/^@AGENTS\.md\s*$/mu.test(readFileSync(claudeTarget.path, 'utf8'))
      ? '（Claude Code に AGENTS.md を読ませるなら、CLAUDE.md に @AGENTS.md の行を足してください）'
      : wrote ? '' : '（--force で書き直せます）';
    files.push({ file: 'CLAUDE.md', written: wrote, note });
  }

  const ignoreTarget = writableTarget(root, rootReal, '.gitignore');
  if (ignoreTarget.reason) refuse('.gitignore', ignoreTarget.reason);
  else {
    const added = ensureIgnore(ignoreTarget, [...IGNORE_LINES, ...ignore]);
    files.push({ file: '.gitignore', written: added.length > 0, note: added.length > 0 ? `（足した行: ${added.join(' ')}）` : '（必要な行はもうあります）' });
  }

  if (agent) {
    const partyFile = join('.masume', 'party.json');
    if (!statOk(join(root, '.masume', 'log.jsonl'))) {
      files.push({ file: '.masume/party.json', written: false, note: '（冒険の書がまだ無いので書きません）' });
    } else {
      const partyTarget = writableTarget(root, rootReal, partyFile);
      if (partyTarget.reason) refuse('.masume/party.json', partyTarget.reason);
      else {
        writePartyJson(partyTarget, agent, allowListen);
        files.push({ file: '.masume/party.json', written: true, note: `（agent: ${agent}, parallel: ${PARALLEL}${allowListen === true ? ', allow_listen: true' : ''}）` });
      }
    }
  }
  return { root, files };
}

/** 冒険の書の本体があるか（symlink でも、あれば） */
function statOk(file) {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
}

/** --json 用の1ファイル分（書かなかった理由があれば reason も） */
export const fileEntry = ({ file, written, reason }) => (reason ? { file, written, reason } : { file, written });

export function printSetup(say, { files }) {
  for (const { file, written, note, reason } of files) {
    if (reason) say(`書きません: ${file}（${reason}）`);
    else say(written ? `書きました: ${file}${note}` : `${file} はそのまま${note}`);
  }
}
