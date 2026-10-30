// ことば（CONTRACTS §75・§76）。CLI・窓口・MCP・盤面の字に、2つの言い方がある。
//   game … 冒険のことば（モンスター・ダンジョン・町・ハンコ・全滅）。はじめての人向け。既定
//   dev  … 開発のことば（テスト・タスク・コミット・承認・リグレッション）。エンジニア向け
// 1つの文の中に2つの言い方を並べない。地図に書かれた字（マスの題・説明・テストの名前・キャラクターの名前）はそのまま。
//
// 決め方（上が優先）: --words game|dev > 環境変数 GRIDHUB_WORDS > <root>/.masume/words.json の words > game
// 盤面（web/board/words.js）は、URL の ?words= > ブラウザに残した選択 > GET /api/words（この設定）> game。
// 盤面で切り替えると POST /api/words でこの設定にも書くので、CLI と盤面の言い方がそろう。
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MasumeError } from './errors.js';

export const WORDS = ['game', 'dev'];
export const WORDS_JA = { game: '冒険のことば', dev: '開発のことば' };

let current = 'game';

/** いまの言い方（'game' | 'dev'） */
export const wordsMode = () => current;
export const isDev = () => current === 'dev';

/** 言い方を決める（知らない値は無視して game） */
export function useWords(mode) {
  current = WORDS.includes(mode) ? mode : 'game';
  return current;
}

/** 冒険ごとの設定（<root>/.masume/words.json の {words}）。無い・読めない・知らない値なら null */
export function wordsSetting(root) {
  if (!root) return null;
  try {
    const value = JSON.parse(readFileSync(join(root, '.masume', 'words.json'), 'utf8'));
    return WORDS.includes(value?.words) ? value.words : null;
  } catch {
    return null;
  }
}

/** 冒険ごとの設定を書く（盤面の切り替えと gridhub words が使う）。書いたあとの設定を返す */
export function setWordsSetting(root, mode) {
  if (!WORDS.includes(mode)) throw new MasumeError('E_USAGE', `ことばは game か dev です: ${mode}`);
  const dir = join(root, '.masume');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'words.json');
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify({ words: mode }, null, 2)}\n`);
  renameSync(temp, file);
  return { words: mode };
}

/**
 * 言い方を決めて使う: flag（--words）> env.GRIDHUB_WORDS > 冒険の設定 > game。
 * 決まった言い方と、何で決まったか（'flag' | 'env' | 'file' | 'default'）を返す
 */
export function resolveWords({ root = null, env = process.env, flag = null } = {}) {
  let source = 'default';
  let mode = 'game';
  const file = wordsSetting(root);
  if (file) [mode, source] = [file, 'file'];
  if (WORDS.includes(env?.GRIDHUB_WORDS)) [mode, source] = [env.GRIDHUB_WORDS, 'env'];
  if (WORDS.includes(flag)) [mode, source] = [flag, 'flag'];
  useWords(mode);
  return { words: mode, source };
}

// ---- 辞書 ----
// key ごとに { game, dev }。字か、引数を受ける関数。dev が無ければ game と同じ。
// 既定（game）の字のうち、判定（tests/e2e）が見ているものは変えない（§76.5）。

const T = {
  // 役（受付係の --help と、知らせの主語）
  'role.engine': { game: '書記', dev: 'engine' },
  'role.server': { game: '伝令', dev: 'server' },
  'role.party': { game: '軍師', dev: 'party' },
  'role.quest': { game: '語り部', dev: 'quest' },
  'role.linear': { game: '地図職人', dev: 'linear/jira' },
  'role.mac': { game: '大工', dev: 'mac' },

  // もの
  book: { game: '冒険の書', dev: 'セーブデータ' },
  brief: { game: '指令書', dev: '作業指示' },
  territory: { game: '縄張り', dev: '担当ファイル' },
  note: { game: '日誌', dev: 'メモ' },
  skill: { game: '技', dev: '引き継ぎメモ' },
  stamp: { game: 'ハンコ', dev: '承認' },
  party: { game: '仲間', dev: 'ほかの担当' },
  town: { game: '町', dev: 'セーブポイント' },
  grave: { game: '墓', dev: 'stash' },
  dungeon: { game: 'ダンジョン', dev: 'タスク' },
  monster: { game: 'モンスター', dev: 'テスト' },
  gate: { game: '結合ゲート', dev: '結合テスト' },
  boss: { game: 'ボス戦', dev: '結合テスト' },
  goal: { game: 'あがり', dev: '完了' },
  start: { game: 'ふりだし', dev: '開始' },
  wish: { game: '願い', dev: '作りたいもの' },
  sortie: { game: '出撃', dev: '起動' },
  seal: { game: '封印', dev: 'ハッシュ記録' },
  news: { game: '瓦版', dev: 'ニュース' },

  // 状態
  'status.working': { game: '作業中', dev: '作業中' },
  'status.waiting': { game: 'ゲートで待機中', dev: '結合待ち' },
  'status.done': { game: 'あがり', dev: '完了' },
  'seal.ok': { game: '封印済み', dev: 'ハッシュ記録済み' },
  'seal.none': { game: '未封印', dev: 'ハッシュ未記録' },
  'seal.broken': { game: '封印が破れています', dev: '判定ファイルが変更されています' },
  'level.max': { game: (lv) => `Lv${lv}（最大）`, dev: (lv) => `Lv${lv}（最大）` },
  'level.xp': { game: (lv, xp, next) => `Lv${lv} / 経験値 ${xp}/${next}`, dev: (lv, xp, next) => `Lv${lv} / 経験値 ${xp}/${next}` },

  // 冒険の書（ログ）の文（view.js）。盤面の「冒険の書／ログ」の欄と gridhub log に出る
  'log.genesis': { game: '冒険の書がひらかれた', dev: 'セーブデータを作った' },
  'log.sealed': { game: (node) => `${node} の判定ファイルが封印された`, dev: (node) => `${node} の判定ファイルのハッシュを記録した` },
  'log.seal_broken': { game: (node) => `${node} の封印が破れていた`, dev: (node) => `${node} の判定ファイルが変更されていた` },
  'log.seal_broken.by': { game: (name, node) => `${name} が ${node} の封印破りを見つけた`, dev: (name, node) => `${name} が ${node} の判定ファイルの変更を見つけた` },
  'log.check_passed': { game: (name, node) => `${name} が ${node} の判定に成功した`, dev: (name, node) => `${name} が ${node} の判定に合格した` },
  'log.check_failed': { game: (name, node, failed) => `${name} が ${node} を判定し、${failed} で失敗した`, dev: (name, node, failed) => `${name} が ${node} を判定し、${failed} で失敗した` },
  'log.gate_cleared': { game: (node) => `${node} の結合ゲート突破。仲間が解散した`, dev: (node) => `${node} の結合テストに合格。担当は次のタスクへ` },
  'log.gate_failed': { game: (node, all, names) => `${node} のボス戦で${all ? '全滅' : '差し戻し'}: ${names}`, dev: (node, all, names) => `${node} の結合テストに失敗${all ? '（全員やり直し）' : '（やり直し）'}: ${names}` },
  'log.stamped.self': { game: (name, node) => `${name} が ${node} にハンコを押した`, dev: (name, node) => `${name} が ${node} を承認した` },
  'log.stamped.by': { game: (by, name, node) => `${by} が ${name} の ${node} にハンコを押した`, dev: (by, name, node) => `${by} が ${name} の ${node} を承認した` },
  'log.note': { game: (name, text) => `${name} の日誌: ${text}`, dev: (name, text) => `${name} のメモ: ${text}` },
  'log.amended': { game: (v) => `地図が第${v}版に改訂された`, dev: (v) => `地図が第${v}版に改訂された` },
  'log.loaded': { game: (seq) => `冒険の書の seq ${seq} の状態をロードした`, dev: (seq) => `seq ${seq} の状態に戻した` },
  'log.wish': { game: (text) => `願い: ${text}`, dev: (text) => `作りたいもの: ${text}` },
  'log.sortie': { game: (name, agent) => `${name} が出撃した（${agent}）`, dev: (name, agent) => `${name} のエージェントを起動した（${agent}）` },
  'log.stepped': { game: (name, node, ok, all) => `${name} が ${node} を歩いた（テスト ${ok}/${all}）`, dev: (name, node, ok, all) => `${name} が ${node} のテストを走らせた（${ok}/${all}）` },
  'log.saved': { game: (names, node, commit) => `${names} が ${node} でセーブした（commit ${commit}）`, dev: (names, node, commit) => `${names} が ${node} でコミットした（commit ${commit}）` },
  'log.saved.failed': { game: (why) => `セーブできなかった: ${why}`, dev: (why) => `コミットできなかった: ${why}` },
  'log.pushed': { game: (remote, branch, commit) => `GitHub に送った: ${remote} ${branch}（commit ${commit}）`, dev: (remote, branch, commit) => `push した: ${remote} ${branch}（commit ${commit}）` },
  'log.pushed.failed': { game: (why) => `GitHub に送れなかった: ${why}`, dev: (why) => `push に失敗した: ${why}` },
  'log.restored': { game: (name, commit, stash) => `${name} の縄張りを commit ${commit} に戻した（墓: ${stash ? `stash ${stash}` : 'なし'}）`, dev: (name, commit, stash) => `${name} の担当ファイルを commit ${commit} に戻した（stash: ${stash ?? 'なし'}）` },
  'log.restored.failed': { game: (name, why) => `${name} の縄張りを戻せなかった: ${why}`, dev: (name, why) => `${name} の担当ファイルを戻せなかった: ${why}` },
  'log.returned': { game: (name, before, after, ok) => `${name} が帰還した（${before} → ${after ?? 'あがり'}、${ok ? '進んだ' : '進めなかった'}）`, dev: (name, before, after, ok) => `${name} のエージェントが終了した（${before} → ${after ?? '完了'}、${ok ? '進んだ' : '進めなかった'}）` },
  'log.other': { game: (type) => `イベントが記録された（${type}）`, dev: (type) => `イベントが記録された（${type}）` },

  // 判定の結果（engine/cli.js printCheckResult）
  'check.passed': { game: (who, node) => `判定成功: ${who}が ${node}を突破しました`, dev: (who, node) => `判定成功: ${who}が ${node}を完了しました` },
  'check.failed': { game: (who, failed) => `判定失敗: ${who}が ${failed}の判定で負けました`, dev: (who, failed) => `判定失敗: ${who}が ${failed}のテストで落ちました` },
  'check.stamped': { game: (by, node) => `判定成功: ${by}が ${node}にハンコを押しました`, dev: (by, node) => `判定成功: ${by}が ${node}を承認しました` },
  'check.gate_cleared': { game: (gate, members) => `結合ゲート突破: ${gate}を ${members}が突破しました`, dev: (gate, members) => `結合テスト合格: ${gate}を ${members}が通しました` },
  'check.gate_failed': { game: (all, gate, blamed) => `${all ? '全滅' : '差し戻し'}: ${gate}の判定失敗（責任: ${blamed}）`, dev: (all, gate, blamed) => `結合テスト失敗${all ? '（全員やり直し）' : '（やり直し）'}: ${gate}（責任: ${blamed}）` },
  'check.output': { game: '--- 判定の出力（末尾） ---', dev: '--- テストの出力（末尾） ---' },

  // 歩く（commands/step.js）
  'step.walked': { game: (who, node, ok, all) => `歩いた: ${who} ${node} テスト ${ok}/${all}`, dev: (who, node, ok, all) => `テストを走らせた: ${who} ${node} テスト ${ok}/${all}` },
  'step.next': { game: (name) => `いちばん手前のモンスター: ${name}`, dev: (name) => `次に通すテスト: ${name}` },
  'step.all': { game: (who) => `全部倒した。出口で宣言する: gridhub check ${who}`, dev: (who) => `全部通った。判定する: gridhub check ${who}` },

  // 指令書（commands/brief.js）
  'brief.head': { game: (name, id, kind) => `指令書: ${name}（${id} / ${kind}）`, dev: (name, id, kind) => `作業指示: ${name}（${id} / ${kind}）` },
  'brief.gen': { game: (name, id, gen, medals) => `${name}（${id}）… ${gen}代目 / ちいさなメダル ${medals}`, dev: (name, id, gen, medals) => `${name}（${id}）… 起動 ${gen}回目 / 最初の判定で合格 ${medals}` },
  'brief.level': { game: (lv, vision, status) => `${lv} / 視界 ${vision}マス先 / ${status}`, dev: (lv, vision, status) => `${lv} / 視界 ${vision}マス先 / ${status}` },
  'brief.module': { game: (m) => `担当: ${m}`, dev: (m) => `担当: ${m}` },
  'brief.territory': { game: (list) => `縄張り: ${list}`, dev: (list) => `担当ファイル: ${list}` },
  'brief.none': { game: '指定なし', dev: '指定なし' },
  'brief.sortie': { game: (agent, seq) => `出撃中: ${agent}（seq ${seq} から）`, dev: (agent, seq) => `起動中: ${agent}（seq ${seq} から）` },
  'brief.current': { game: (id, title, type) => `現在のマス: ${id}「${title}」（${type}）`, dev: (id, title, type) => `現在のマス: ${id}「${title}」（${type}）` },
  'brief.current.done': { game: '現在のマス: あがり', dev: '現在のマス: 完了' },
  'brief.check': { game: (run) => `判定: ${run}`, dev: (run) => `テスト: ${run}` },
  'brief.check.stamp': { game: (by) => `判定: ${by} のハンコ（判定コマンドは無い。人間が中身を確かめて押す）`, dev: (by) => `承認: ${by}（テストは無い。人間が中身を確かめて承認する）` },
  'brief.seal': { game: (text) => `封印: ${text}`, dev: (text) => `判定ファイル: ${text}` },
  'brief.rollback': { game: (to) => `失敗時の戻り先: ${to}`, dev: (to) => `失敗時の戻り先: ${to}` },
  'brief.tests': { game: (ok, all) => `テスト ${ok}/${all}`, dev: (ok, all) => `テスト ${ok}/${all}` },
  'brief.tests.unknown': { game: '  ？ まだ一度も歩いていない（中の分からないダンジョン）', dev: '  ？ まだテストを走らせていない（cases が無いタスク）' },
  'brief.next': { game: (name) => `いま戦うテスト: ${name}`, dev: (name) => `次に通すテスト: ${name}` },
  'brief.next.all': { game: '全部倒した。出口で宣言する', dev: '全部通った。判定する' },
  'brief.next.first': { game: 'いま戦うテスト: まず歩いて、テストを見る', dev: '次に通すテスト: まずテストを走らせて、名前を見る' },
  'brief.skills.none': { game: '技（受け継いだもの）: まだない', dev: '引き継ぎメモ: まだない' },
  'brief.skills': { game: '技（受け継いだもの）:', dev: '引き継ぎメモ:' },
  'brief.skill': { game: (text, node, kase, seq) => `  ・${text}（${node} の「${kase}」を倒して / seq ${seq}）`, dev: (text, node, kase, seq) => `  ・${text}（${node} の「${kase}」を通して / seq ${seq}）` },
  'brief.grave': { game: (cmd, node) => `墓: ${cmd}（${node} で負けたときの変更）`, dev: (cmd, node) => `stash: ${cmd}（${node} の判定に失敗したときの変更）` },
  'brief.save': { game: 'セーブ: 町に着くと、縄張りの変更が Git にコミットされる', dev: 'セーブ: セーブポイントに着くと、担当ファイルの変更が自動でコミットされる' },
  'brief.margin': { game: (head) => `道の余白（いちばん新しい出来事）: ${head}`, dev: (head) => `イベント（いちばん新しいもの）: ${head}` },
  'brief.visible': { game: '視界に入っている先のマス:', dev: '視界に入っている先のマス:' },
  'brief.visible.none': { game: (fog) => `視界に入っている先のマス: （なし${fog > 0 ? '。この先は霧' : '。この先にマスはない'}）`, dev: (fog) => `視界に入っている先のマス: （なし${fog > 0 ? '。この先は視界の外' : '。この先にマスはない'}）` },
  'brief.fog': { game: (n) => `霧の中: ${n}マス`, dev: (n) => `視界の外: ${n}マス` },
  'brief.party': { game: '仲間:', dev: 'ほかの担当:' },
  'brief.waiting': { game: (names) => `待っている仲間: ${names}`, dev: (names) => `待っている担当: ${names}` },
  'brief.ready': { game: '仲間が全員揃っています', dev: '全員がそろっています' },
  'brief.notes': { game: '自分の日誌（新しい順）:', dev: '自分のメモ（新しい順）:' },
  'brief.notes.none': { game: '自分の日誌（新しい順）: （まだない）', dev: '自分のメモ（新しい順）: （まだない）' },
  'brief.how': { game: '歩き方:', dev: '進め方:' },
  'brief.how.step': { game: (id) => `  歩く（何度でも・記録される・罰なし）: gridhub step ${id}`, dev: (id) => `  テストを走らせる（何度でも・記録される）: gridhub step ${id}` },
  'brief.how.check': { game: (id) => `  宣言（一発勝負）: gridhub check ${id}`, dev: (id) => `  判定する（累積。失敗すると Lv−1）: gridhub check ${id}` },
  'brief.how.note': { game: (id) => `  日誌: gridhub note ${id} "…"`, dev: (id) => `  メモ: gridhub note ${id} "…"` },
  'brief.how.other': { game: '進み方:', dev: '進め方:' },
  'brief.how.stamp': { game: (node, by) => `  ハンコ（中身を確かめてから）: gridhub stamp ${node} --as ${by}（盤面の「ハンコを押す」でも同じ）`, dev: (node, by) => `  承認（中身を確かめてから）: gridhub stamp ${node} --as ${by}（盤面の「承認する」でも同じ）` },
  'brief.how.gate': { game: (gate) => `  仲間がそろうとボス戦（結合テスト）が自動で始まる。手で始めるなら: gridhub check ${gate}`, dev: (gate) => `  担当がそろうと結合テストが自動で始まる。手で始めるなら: gridhub check ${gate}` },
  'brief.how.done': { game: '進み方: あがり。この地図でやることは、もうない', dev: '進め方: 完了。この地図でやることは、もうない' },
  'brief.rules': { game: '守ること:', dev: '守ること:' },
  'rule.step': { game: '1マスずつ: いちばん手前の落ちているテストだけを通して、gridhub step で確かめる', dev: '1件ずつ: 最初に落ちているテストだけを通して、gridhub step で確かめる' },
  'rule.current': { game: '現在のマスだけをやる', dev: '現在のタスクだけをやる' },
  'rule.territory': { game: '自分の縄張りの中だけを編集する', dev: '自分の担当ファイルの中だけを編集する' },
  'rule.seal': { game: '判定ファイルと地図を変更しない', dev: 'テストのファイルと地図を変更しない' },
  'rule.run': { game: '判定コマンドを自分で走らせ、結果を確認する', dev: 'テストを自分で走らせ、結果を確認する' },
  'rule.record': { game: '宣言判定と日誌で進行を冒険の書に記録する', dev: '判定とメモで進み具合をセーブデータに記録する' },
  'rule.done': { game: 'あがり。この地図でやることは、もうない', dev: '完了。この地図でやることは、もうない' },
  'rule.gate': { game: '仲間がそろうとボス戦（結合テスト）が自動で始まる。待っているあいだ、縄張りのファイルを変えない', dev: '担当がそろうと結合テストが自動で始まる。待っているあいだ、担当ファイルを変えない' },
  'rule.stamp.check': { game: 'ファイルの中身を自分の目で確かめてからハンコを押す（ハンコは判定ではなく、人間の判断の記録）', dev: 'ファイルの中身を自分の目で確かめてから承認する（承認はテストではなく、人間の判断の記録）' },
  'rule.stamp.record': { game: '日誌で進行を冒険の書に記録する', dev: 'メモで進み具合をセーブデータに記録する' },

  // status
  'status.title': { game: (title, v) => `${title}（地図の版 ${v}）`, dev: (title, v) => `${title}（地図の版 ${v}）` },
  'status.line': { game: (name, where, level, clears, fails) => `${name}: ${where} / ${level} / 成功 ${clears}・失敗 ${fails}`, dev: (name, where, level, clears, fails) => `${name}: ${where} / ${level} / 合格 ${clears}・失敗 ${fails}` },
  'status.margin': { game: (road, head) => `道の余白: ${road} の道で ${head}`, dev: (road, head) => `イベント: ${road} の道で ${head}` },
  'status.push.ok': { game: (remote, branch, commit) => `GitHub: 送った（${remote} ${branch}・commit ${commit}）`, dev: (remote, branch, commit) => `GitHub: push 済み（${remote} ${branch}・commit ${commit}）` },
  'status.push.ng': { game: (why) => `GitHub: 送れなかった（${why}）。gridhub push でもう一度送れる`, dev: (why) => `GitHub: push に失敗（${why}）。gridhub push でもう一度` },
  'status.level.max': { game: (lv) => `Lv${lv}（最大）`, dev: (lv) => `Lv${lv}（最大）` },
  'status.level.xp': { game: (lv, xp, next) => `Lv${lv} 経験値 ${xp}/${next}`, dev: (lv, xp, next) => `Lv${lv} 経験値 ${xp}/${next}` },

  // 余白のマス（engine/margins.js）。盤面の吹き出しと指令書に出る
  'margin.npc': { game: '宿屋の主人', dev: '宿の人' },
  'margin.title.news': { game: '瓦版', dev: 'ニュース' },
  'margin.title.npc': { game: (title) => `${title} の住人`, dev: (title) => `${title} の人` },
  'margin.extra.cleared': { game: (name, node, title, tests) => `号外: ${name} が ${node}「${title}」を抜けた${tests}`, dev: (name, node, title, tests) => `速報: ${name} が ${node}「${title}」を完了した${tests}` },
  'margin.extra.gate': { game: (names, node, title) => `号外: ${names} が ${node}「${title}」を突破した`, dev: (names, node, title) => `速報: ${names} が ${node}「${title}」の結合テストに合格した` },
  'margin.npc.hello': { game: (name, passed) => `${name}さん、おつかれさま。テスト ${passed} 件、通ってきたね`, dev: (name, passed) => `${name}さん、おつかれさま。テスト ${passed} 件、通ってきたね` },
  'margin.npc.saved': { game: (commit, files) => `セーブは commit ${commit}。変えたファイルは ${files} 件`, dev: (commit, files) => `コミットは ${commit}。変えたファイルは ${files} 件` },
  'margin.talk.met': { game: (a, b, title) => `${a} と ${b} が ${title} の前で顔を合わせた`, dev: (a, b, title) => `${a} と ${b} が ${title} の前で顔を合わせた` },
  'margin.talk.arrived': { game: (a, title) => `${a} が ${title} の前に着いた`, dev: (a, title) => `${a} が ${title} の前に着いた` },
  'margin.kind.talk': { game: '会話', dev: '会話' },
  'margin.kind.npc': { game: '町の住人', dev: '住人' },
  'margin.kind.news': { game: '瓦版', dev: 'ニュース' },

  // エンディング（engine/chronicle.js）
  'ending.1': { game: (ok, all, goal, title) => `テスト ${ok}/${all} が通った。魔王の城 ${goal}「${title}」、陥落。`, dev: (ok, all, goal, title) => `テスト ${ok}/${all} が通った。最終結合テスト ${goal}「${title}」に合格。` },
  'ending.2.clean': { game: (party) => `${party} は、一度も倒れずにここまで来た。`, dev: (party) => `${party} は、判定に一度も落ちずにここまで来た。` },
  'ending.2.fell': { game: (party, n) => `${party} は ${n} 度倒れ、そのたびに町から立ち上がった。`, dev: (party, n) => `${party} は判定に ${n} 度落ち、そのたびにセーブポイントからやり直した。` },
  'ending.3.medals': { game: (n) => `一発で抜けたダンジョンは ${n}。ちいさなメダルが、袋の中で鳴っている。`, dev: (n) => `最初の判定で合格したタスクは ${n}。` },
  'ending.3.none': { game: '一発で抜けたダンジョンはなかった。それでも、出口はすべて越えた。', dev: '最初の判定で合格したタスクはなかった。それでも、すべてのタスクを終えた。' },
  'ending.4': { game: (n, skills) => `何度も負けた強敵を ${n} 体倒した。${skills > 0 ? `その手ごたえは ${skills} つの技になり、次の代へ渡る。` : 'その手ごたえは、まだ日誌に書かれていない。'}`, dev: (n, skills) => `2回以上失敗したテストを ${n} 件通した。${skills > 0 ? `その知見は ${skills} 件の引き継ぎメモになり、次の起動に渡る。` : 'その知見は、まだメモに書かれていない。'}` },
  'ending.5': { game: (n) => `倒したはずのテストが ${n} 度よみがえった。気づいて、もう一度倒した。`, dev: (n) => `一度通ったテストが ${n} 度落ちた（リグレッション）。気づいて、もう一度通した。` },
  'ending.6': { game: (n) => `判定のほころびを見つけて、宝箱を ${n} つ開けた。`, dev: (n) => `テストの不具合を見つけて報告し、${n} 件が直された。` },
  'ending.7': { game: (n) => `封印に手をかけた跡が ${n} つ。冒険の書は、それも覚えている。`, dev: (n) => `テストのファイルを変えた跡が ${n} 件。セーブデータは、それも覚えている。` },
  'ending.8.sorties': { game: (n) => `出撃 ${n} 回。代は替わっても、日誌と技は受け継がれた。`, dev: (n) => `エージェントの起動 ${n} 回。起動が替わっても、メモと引き継ぎは受け継がれた。` },
  'ending.8.none': { game: 'この章は、出撃なしで歩ききった。', dev: 'この章は、エージェントを起動せずに進めきった。' },
  'ending.9': { game: (title) => `――『${title}』、ひとつの章が幕を閉じる。次のページは、まだ白い。`, dev: (title) => `――『${title}』、ひとつの章が終わった。次のページは、まだ白い。` },

  // 受付係（bin/gridhub.js）
  'cli.tagline': { game: 'GridHub — テスト1件が1マス。5mm方眼ノートのすごろくで開発を進めるゲーム（旧名 マスメ。masume は別名）', dev: 'GridHub — テスト1件が1マス。E2E テストで進み具合を管理する開発ボード（旧名 マスメ。masume は別名）' },
  'cli.usage': { game: 'つかいかた: gridhub <command> [options]   共通: --dir <冒険の書のある場所> --as <あなたのID> --json --words game|dev', dev: '使い方: gridhub <command> [options]   共通: --dir <セーブデータのある場所> --as <あなたのID> --json --words game|dev' },
  'cli.version': { game: '版: gridhub --version（`gridhub 0.3.0 (rules 1)` の rules は、冒険の書と地図の形式の版。同じ rules なら、ほかの版の gridhub でも同じ冒険の書を読める）', dev: '版: gridhub --version（`gridhub 0.3.0 (rules 1)` の rules は、セーブデータと地図の形式の版。同じ rules なら、ほかの版の gridhub でも同じセーブデータを読める）' },
  'cli.rulebook': { game: 'ルールブック: docs/RULEBOOK.md', dev: 'ルールブック: docs/RULEBOOK.md（開発のことばで読むなら README.md）' },
  'cli.words.hint': { game: 'ことば: 冒険のことば（いま）。開発の言い方で読むなら gridhub words dev（--words dev・環境変数 GRIDHUB_WORDS でも）', dev: 'ことば: 開発のことば（いま）。ゲームの言い方で読むなら gridhub words game（--words game・環境変数 GRIDHUB_WORDS でも）' },
  'cli.help.usage': { game: 'つかいかた', dev: '使い方' },
  'cli.help.options': { game: 'オプション:', dev: 'オプション:' },
  'cli.help.this': { game: '  -h, --help     この説明を出す', dev: '  -h, --help     この説明を出す' },
  'cli.help.foot': { game: '一覧: gridhub --help / ルールブック: docs/RULEBOOK.md', dev: '一覧: gridhub --help / README.md' },
  'cli.help.words': { game: '  --words game|dev  字を冒険のことば（game）か開発のことば（dev）で出す。省略すると gridhub words の設定', dev: '  --words game|dev  字を冒険のことば（game）か開発のことば（dev）で出す。省略すると gridhub words の設定' },
  'cli.unknown': { game: (cmd) => `「${cmd}」というコマンドはありません。`, dev: (cmd) => `「${cmd}」というコマンドはありません。` },
  'cli.notyet': { game: (cmd, who) => `「${cmd}」はまだ誰も踏んでいないマスです（src/commands/${cmd}.js 担当: ${who}）`, dev: (cmd, who) => `「${cmd}」はまだ実装されていません（src/commands/${cmd}.js 担当: ${who}）` },
  'cli.common.dir': { game: '  --dir <場所>   冒険の書（.masume/）のあるフォルダ。省略すると、今いる場所から上へ探す（環境変数 MASUME_DIR も見る）', dev: '  --dir <場所>   セーブデータ（.masume/）のあるフォルダ。省略すると、今いる場所から上へ探す（環境変数 MASUME_DIR も見る）' },
  'cli.common.as': { game: '  --as <ID>      だれとして記録するか（キャラクターID）。省略すると環境変数 MASUME_ACTOR。それも無ければ、\n                 step・check・note はコマンドに渡したキャラクターID、それ以外（seal・amend・load など）は gm', dev: '  --as <ID>      だれとして記録するか（担当の ID）。省略すると環境変数 MASUME_ACTOR。それも無ければ、\n                 step・check・note はコマンドに渡した担当の ID、それ以外（seal・amend・load など）は gm' },
  'cli.common.json': { game: '  --json         結果を JSON で出す', dev: '  --json         結果を JSON で出す' },

  // words コマンド
  'words.now': { game: (mode, source) => `ことば: ${WORDS_JA[mode]}（${mode}。${source}）`, dev: (mode, source) => `ことば: ${WORDS_JA[mode]}（${mode}。${source}）` },
  'words.source.flag': { game: '--words で指定', dev: '--words で指定' },
  'words.source.env': { game: '環境変数 GRIDHUB_WORDS', dev: '環境変数 GRIDHUB_WORDS' },
  'words.source.file': { game: 'この冒険の設定 .masume/words.json', dev: 'このプロジェクトの設定 .masume/words.json' },
  'words.source.default': { game: '既定', dev: '既定' },
  'words.set': { game: (mode) => `この冒険のことばを ${WORDS_JA[mode]}（${mode}）にしました。盤面・CLI・MCP の字が変わります`, dev: (mode) => `このプロジェクトのことばを ${WORDS_JA[mode]}（${mode}）にしました。盤面・CLI・MCP の字が変わります` },
  'words.help': {
    game: [
      'つかいかた: gridhub words [game|dev]',
      '',
      'ことばを見る・変える。GridHub の字には2つの言い方がある:',
      '  game  冒険のことば … モンスター・ダンジョン・町・ハンコ・全滅（はじめての人向け。既定）',
      '  dev   開発のことば … テスト・タスク・コミット・承認・リグレッション（エンジニア向け）',
      '引数なしで、いまの言い方と、何で決まっているかを出す。',
      '引数をつけると、この冒険の設定（.masume/words.json）に書く。盤面の右上のボタンで切り替えても同じ所に書かれる。',
      '1回だけ変えるなら、どのコマンドにも --words game|dev を足す。環境変数 GRIDHUB_WORDS でも決められる。',
    ].join('\n'),
    dev: [
      '使い方: gridhub words [game|dev]',
      '',
      'ことばを見る・変える。GridHub の字には2つの言い方がある:',
      '  game  冒険のことば … モンスター・ダンジョン・町・ハンコ・全滅（はじめての人向け。既定）',
      '  dev   開発のことば … テスト・タスク・コミット・承認・リグレッション（エンジニア向け）',
      '引数なしで、いまの言い方と、何で決まっているかを出す。',
      '引数をつけると、このプロジェクトの設定（.masume/words.json）に書く。盤面の右上のボタンで切り替えても同じ所に書かれる。',
      '1回だけ変えるなら、どのコマンドにも --words game|dev を足す。環境変数 GRIDHUB_WORDS でも決められる。',
    ].join('\n'),
  },

  // ほかのコマンドの知らせ
  'new.done': { game: '冒険の書をひらきました', dev: 'セーブデータを作りました' },
  'note.done': { game: (id, seq) => `${id} の日誌を記録しました（seq ${seq}）`, dev: (id, seq) => `${id} のメモを記録しました（seq ${seq}）` },
  'verify.cursed': { game: (seq) => `冒険の書は呪われています（seq ${seq}）`, dev: (seq) => `セーブデータに整合性エラーがあります（seq ${seq}）` },
  'verify.ok': { game: '冒険の書は正常です', dev: 'セーブデータは正常です' },
  'verify.head': { game: (record, hash) => `${record}（鎖の先頭 ${hash}）`, dev: (record, hash) => `${record}（鎖の先頭 ${hash}）` },
  'repair.none': { game: '冒険の書は正常です。修復は不要です', dev: 'セーブデータは正常です。修復は不要です' },
  'repair.done': { game: (kept, moved, file) => `冒険の書を修復しました。${kept}件を残し、${moved}行を ${file} に退避しました`, dev: (kept, moved, file) => `セーブデータを修復しました。${kept}件を残し、${moved}行を ${file} に退避しました` },
  'load.done': { game: (seq) => `seq ${seq} の状態をロードしました（コードは Git で戻す: git checkout <commit>）`, dev: (seq) => `seq ${seq} の状態に戻しました（コードは Git で戻す: git checkout <commit>）` },
  'seal.done': { game: (n) => `${n}マスの判定ファイルを封印しました`, dev: (n) => `${n}マスの判定ファイルのハッシュを記録しました` },
  'seal.pending': { game: (ids) => `保留: ${ids}`, dev: (ids) => `保留: ${ids}` },
  'amend.done': { game: (v) => `地図を第${v}版に改訂しました`, dev: (v) => `地図を第${v}版に改訂しました` },
  'stamp.done': { game: (by, node) => `${by} が ${node} にハンコを押しました`, dev: (by, node) => `${by} が ${node} を承認しました` },
  'remote.auto': { game: (on) => `町でセーブしたら GitHub に送る: ${on ? 'オン' : 'オフ'}`, dev: (on) => `コミットしたら自動で push: ${on ? 'オン' : 'オフ'}` },
  'remote.auto.hint': { game: (on) => `町でセーブしたら GitHub に送る: ${on ? 'オン' : 'オフ'}（gridhub remote --auto-push on|off）`, dev: (on) => `コミットしたら自動で push: ${on ? 'オン' : 'オフ'}（gridhub remote --auto-push on|off）` },
  'remote.ahead.none': { game: 'GitHub に送っていないセーブ: まだ一度も送っていない', dev: 'push していないコミット: まだ一度も push していない' },
  'remote.ahead': { game: (n, behind) => `GitHub に送っていないセーブ: ${n}${behind ? `（リモートにだけあるコミット: ${behind}）` : ''}`, dev: (n, behind) => `push していないコミット: ${n}${behind ? `（リモートにだけあるコミット: ${behind}）` : ''}` },
  'remote.nogame': { game: '冒険の書が見つかりません（設定は冒険ごとに書きます）', dev: 'セーブデータが見つかりません（設定はプロジェクトごとに書きます）' },
  'push.ok': { game: (remote, branch, commit) => `GitHub に送った: ${remote} ${branch}（commit ${commit}）`, dev: (remote, branch, commit) => `push した: ${remote} ${branch}（commit ${commit}）` },
  'push.ng': { game: (remote, branch) => `送れませんでした: ${remote} ${branch}（相手が先に進んでいるなら git pull で取り込んでから、もう一度。ログインしていないなら gh auth login）`, dev: (remote, branch) => `push できませんでした: ${remote} ${branch}（リモートが先に進んでいるなら git pull で取り込んでから、もう一度。ログインしていないなら gh auth login）` },
  'serve.board': { game: (url) => `盤面: ${url}`, dev: (url) => `盤面: ${url}` },
  'serve.lobby': { game: '冒険の書はまだありません。盤面の入口で願いを書いて、冒険をはじめてください。', dev: 'セーブデータはまだありません。盤面の入口で作りたいものを書いて、始めてください。' },
  'serve.open.ok': { game: 'ブラウザで開きます（開かなければ、上の URL をブラウザに貼ってください。--no-open で開かずに済ませられます）', dev: 'ブラウザで開きます（開かなければ、上の URL をブラウザに貼ってください。--no-open で開かずに済ませられます）' },
  'serve.open.ng': { game: '（ブラウザを開けませんでした。上の URL をブラウザで開いてください）', dev: '（ブラウザを開けませんでした。上の URL をブラウザで開いてください）' },
  'serve.open.hint': { game: '上の URL をブラウザで開いてください（--open で、gridhub が開きます）', dev: '上の URL をブラウザで開いてください（--open で、gridhub が開きます）' },

  // エラー文（engine）。[E_…] の後ろの説明
  'err.nogame': { game: '冒険の書が見つかりません', dev: 'セーブデータ（.masume/）が見つかりません' },
  'err.cursed': { game: (seq, code) => `冒険の書は呪われています（seq ${seq}${code ? `: ${code}` : ''}）。verify / repair で確認してください`, dev: (seq, code) => `セーブデータに整合性エラーがあります（seq ${seq}${code ? `: ${code}` : ''}）。verify / repair で確認してください` },
  'err.cursed.genesis': { game: '冒険の書は呪われています（seq 0）。genesis が壊れているため修復できません', dev: 'セーブデータに整合性エラーがあります（seq 0）。genesis が壊れているため修復できません' },
  'err.exists': { game: '冒険の書はすでにあります。作り直す場合は --force を指定してください', dev: 'セーブデータはすでにあります。作り直す場合は --force を指定してください' },
  'err.exists.short': { game: '冒険の書はすでにあります', dev: 'セーブデータはすでにあります' },
  'err.done.char': { game: (id) => `${id} はもうあがっています`, dev: (id) => `${id} はもう完了しています` },
  'err.done.node': { game: (node) => `${node} はもう突破しています`, dev: (node) => `${node} はもう完了しています` },
  'err.party_incomplete': { game: (node, names) => `${node} の仲間が揃っていません: ${names}`, dev: (node, names) => `${node} の担当が揃っていません: ${names}` },
  'err.needs_stamp': { game: (node) => `${node} は人間のハンコが必要です`, dev: (node) => `${node} は人間の承認が必要です` },
  'err.unsealed': { game: (id) => `${id} は未封印です。GM に封印を依頼してください`, dev: (id) => `${id} の判定ファイルはハッシュ未記録です。GM に封印（gridhub seal）を依頼してください` },
  'err.seal_broken': { game: (node) => `${node} の封印が破れています`, dev: (node) => `${node} の判定ファイルが変更されています` },
  'err.stamp': { game: (label, why) => `${label} にハンコを押せません: ${why}`, dev: (label, why) => `${label} を承認できません: ${why}` },
  'err.stamp.nonode': { game: 'そのマスは地図にありません', dev: 'そのマスは地図にありません' },
  'err.stamp.notstamp': { game: 'ハンコのマスではありません（判定で進むマス）', dev: '承認のマスではありません（テストで進むマス）' },
  'err.stamp.noas': { game: (by) => `だれが押すかを --as <人間のID> で指定してください（このマスのハンコは ${by}）`, dev: (by) => `だれが承認するかを --as <人間のID> で指定してください（このマスの承認は ${by}）` },
  'err.stamp.wrongas': { game: (by, as) => `このマスのハンコは ${by} が押します（--as ${by}）。${as} ではありません`, dev: (by, as) => `このマスは ${by} が承認します（--as ${by}）。${as} ではありません` },
  'err.stamp.noroad': { game: 'このマスはどの道にもありません', dev: 'このマスはどの道にもありません' },
  'err.stamp.done': { game: 'もう押してあります', dev: 'もう承認してあります' },
  'err.stamp.elsewhere': { game: (owner, at) => `${owner} はいま ${at ?? 'あがり'} にいます`, dev: (owner, at) => `${owner} はいま ${at ?? '完了'} にいます` },
  'err.stamp.waiting': { game: (owner, node) => `${owner} は ${node} で仲間を待っています`, dev: (owner, node) => `${owner} は ${node} でほかの担当を待っています` },
  'err.step.waiting': { game: (id, node) => `${id} は ${node} で仲間を待っています。歩けるのはダンジョン（task）の中だけです`, dev: (id, node) => `${id} は ${node} でほかの担当を待っています。テストを走らせられるのはタスク（task）の中だけです` },
  'err.unknown.char': { game: (id) => `キャラクターが見つかりません: ${id}`, dev: (id) => `担当が見つかりません: ${id}` },
  'err.unknown.target': { game: (id) => `キャラクターまたはゲートが見つかりません: ${id}`, dev: (id) => `担当または結合テストが見つかりません: ${id}` },
  'err.load.commit': { game: (text) => `そのコミットは冒険の書に記録されていません: ${text}`, dev: (text) => `そのコミットはセーブデータに記録されていません: ${text}` },
  'err.load.target': { game: 'ロード先は、いまより前の記録の番号（seq）か、冒険の書に記録された Git のコミットで指定してください', dev: '戻り先は、いまより前の記録の番号（seq）か、セーブデータに記録された Git のコミットで指定してください' },
  'err.restore.none': { game: 'このキャラクターのセーブ（町のコミット）がありません', dev: 'この担当のコミット（セーブポイント）がありません' },
  'err.restore.grave': { game: (left) => `縄張りの変更を墓に入れきれませんでした（${left}）。作業ツリーはそのままです`, dev: (left) => `担当ファイルの変更を stash に入れきれませんでした（${left}）。作業ツリーはそのままです` },
  'err.server.nogame': { game: '冒険の書がまだありません。入口で願いを書いて冒険をはじめてください', dev: 'セーブデータがまだありません。入口で作りたいものを書いて地図を作ってください' },
  'err.server.nogame.short': { game: '冒険の書がまだありません', dev: 'セーブデータがまだありません' },
  'err.server.boss': { game: 'この結合ゲートはボス戦の最中です', dev: 'この結合テストは実行中です' },
  'err.server.cursed': { game: '冒険の書が呪われています', dev: 'セーブデータに整合性エラーがあります' },
  'err.server.nogate': { game: 'その結合ゲートはありません', dev: 'その結合テストはありません' },
  'err.server.incomplete': { game: 'まだ仲間が揃っていません', dev: 'まだ担当が揃っていません' },
  'err.server.exists': { game: 'ここにはもう冒険の書があります', dev: 'ここにはもうセーブデータがあります' },
  'err.server.questing': { game: 'いま冒険をつくっています', dev: 'いま地図を作っています' },
  'err.server.quest.spawn': { game: (why) => `語り部を起こせませんでした: ${why}`, dev: (why) => `gridhub quest を起動できませんでした: ${why}` },
  'err.server.party.busy': { game: 'もう出撃しています', dev: 'もう起動しています' },
  'err.server.party.unknown': { game: (names) => `そんなキャラクターはいません: ${names}`, dev: (names) => `その担当はいません: ${names}` },
  'err.server.party.spawn': { game: (why) => `軍師を起こせませんでした: ${why}`, dev: (why) => `gridhub party を起動できませんでした: ${why}` },
  'err.server.pushing': { game: 'いま GitHub に送っています', dev: 'いま push しています' },
  'err.server.push': { game: (tail) => `GitHub に送れませんでした: ${tail}`, dev: (tail) => `push できませんでした: ${tail}` },
  'err.server.hand.busy': { game: (id) => `${id} はいま判定を走らせています`, dev: (id) => `${id} はいまテストを走らせています` },
};

/** いまの言い方の字。関数の項目は引数つきで呼ぶ。知らない key はそのまま返す */
export function t(key, ...args) {
  const entry = Object.hasOwn(T, key) ? T[key] : null;
  if (!entry) return key;
  const value = entry[current] ?? entry.game;
  return typeof value === 'function' ? value(...args) : value;
}

/** 辞書にある key か（判定・盤面の担当が、字を決め打ちせずに確かめるため） */
export const hasWords = (key) => Object.hasOwn(T, key);
