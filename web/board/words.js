// 盤面のことば（CONTRACTS §74.3・§75）。盤面の担当。
//
// 盤面の字には2つの言い方がある。1つのボタン（#words-toggle）で切り替え、選んだほうを localStorage と URL（?words=）に残す。
//   game … 冒険のことば。日本の RPG・すごろくでなじみのある言い方（モンスター・ダンジョン・町・ハンコ・全滅）。はじめての人向け。既定
//   dev  … 開発のことば。テスト・タスク・コミット・承認・リグレッション。エンジニア向け
// 1つの文の中で2つの言い方を「町 = commit」のように並べない。もう一方の言い方は、マウスを乗せたときの補足（title）にだけ出す。
//
// 使い方:
//   t('key')            … いまの言い方の字（関数なら t('key', 引数…) で呼ぶ）
//   applyWords(root)    … 静的な HTML の [data-t] [data-t-title] [data-t-aria] [data-t-placeholder] を書き換える
//   <… data-say="game"> / <… data-say="dev"> … 2つの言い方を HTML に両方書き、CSS（board.css）で片方だけ見せる
//   wordsFor(app)       … アプリの中（?home=）では、指令書やマスの説明の CLI の言い方をボタンの名前に言い換える

const KEY = 'gridhub.words';
export const MODES = ['game', 'dev'];

function initialMode() {
  try {
    const q = new URLSearchParams(location.search).get('words');
    if (MODES.includes(q)) return q;
  } catch {
    /* URL が読めない所（書き出した SVG など）では既定 */
  }
  try {
    const s = localStorage.getItem(KEY);
    if (MODES.includes(s)) return s;
  } catch {
    /* localStorage が使えなければ既定 */
  }
  return 'game';
}

let mode = initialMode();
const listeners = new Set();

/** いまの言い方（'game' | 'dev'） */
export const wordsMode = () => mode;
export const isDev = () => mode === 'dev';

/** <html data-words="…"> を合わせる（CSS の data-mode の出し分けが効く） */
export function syncWordsAttr() {
  if (typeof document !== 'undefined') document.documentElement.dataset.words = mode;
}

/** 言い方を変える。localStorage と URL に残し、登録された描き直しを呼ぶ */
export function setWordsMode(next) {
  if (!MODES.includes(next) || next === mode) return false;
  mode = next;
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    /* 残せなくても切り替えは効く */
  }
  try {
    const url = new URL(location.href);
    if (mode === 'game') url.searchParams.delete('words');
    else url.searchParams.set('words', mode);
    history.replaceState(null, '', url);
  } catch {
    /* URL を書けなくてもよい */
  }
  syncWordsAttr();
  applyWords(document);
  renderToggle();
  for (const fn of listeners) {
    try {
      fn(mode);
    } catch (err) {
      console.warn(err);
    }
  }
  return true;
}

/** 言い方が変わったときに呼ばれる描き直しを登録する */
export function onWords(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---- 辞書 ----
// 1つの key に { game, dev }。字か、引数を受ける関数。dev が無ければ game と同じ

const T = {
  // 切り替えのボタン
  'toggle.game': { game: '🗡 冒険のことば', dev: '🗡 冒険のことば' },
  'toggle.dev': { game: '⌨ 開発のことば', dev: '⌨ 開発のことば' },
  'toggle.title': {
    game: 'いまは「冒険のことば」（モンスター・ダンジョン・町）。押すと「開発のことば」（テスト・タスク・コミット）に切り替わります',
    dev: 'いまは「開発のことば」（テスト・タスク・コミット）。押すと「冒険のことば」（モンスター・ダンジョン・町）に切り替わります',
  },

  // 見出し
  tagline: { game: 'テストが通ったぶんだけ、駒が進む開発すごろく', dev: 'テスト1件 = 1マス。E2E テストで進み具合を見るボード' },
  'tab.board': { game: '盤面', dev: '盤面' },
  'tab.list': { game: '台帳', dev: '一覧' },
  'tab.rules': { game: 'あそびかた', dev: '使い方' },
  'record.title': {
    game: 'いまの記録の番号（seq）と、そのときの Git のコミット。「記録: seq N / Git: commit xxxxxxx」で、その時点の盤面を指せます',
    dev: 'いまの記録の番号（seq）と、その記録が見ていた Git のコミット。gridhub load <seq> か gridhub load <commit> でこの時点の盤面に戻せます',
  },
  'record.copy': { game: '写す', dev: 'コピー' },
  'record.copy.title': {
    game: '「記録: seq N / Git: commit xxxxxxx」を写します（日誌や連絡に貼ると、この時点を指せます）',
    dev: '「記録: seq N / Git: commit xxxxxxx」をコピーします（コミットメッセージ・PR・日誌でこの時点を指す）',
  },
  'integrity.ok': { game: 'セーブ正常', dev: '整合性 OK' },
  'integrity.ok.title': { game: '冒険の書（セーブデータ）は壊れていません', dev: 'ハッシュの鎖は正常です' },
  'integrity.bad': { game: '呪われています', dev: '整合性エラー' },
  'live.live': { game: 'ライブ', dev: 'ライブ' },
  'live.lobby': { game: '入口', dev: '入口' },
  'live.fixture': { game: (name) => `見本: ${name}`, dev: (name) => `デモ: ${name}` },
  'live.fixture.none': { game: '見本: —', dev: 'デモ: —' },
  'live.off': { game: '盤面サーバーに届きません', dev: 'サーバーに届きません' },
  'live.reconnect': { game: '再接続中…', dev: '再接続中…' },
  'live.unreadable': { game: (status) => `読み込めません（${status}）`, dev: (status) => `読み込めません（HTTP ${status}）` },
  'sound.off': { game: '♪ 音なし', dev: '♪ 音なし' },
  'sound.on': { game: '♪ 音あり', dev: '♪ 音あり' },
  'home.link': { game: '← はじめの画面', dev: '← はじめの画面' },
  'home.title': { game: 'はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアル）にもどる', dev: 'はじめの画面（フォルダを選ぶ・最近のフォルダ・チュートリアル）にもどる' },

  // ノートのまわり
  'page.prev': { game: '◀ まえ', dev: '◀ 前' },
  'page.next': { game: 'つぎ ▶', dev: '次 ▶' },
  'zoom.fit': { game: '全体', dev: '全体' },
  export: { game: 'ノートに書き出す', dev: 'SVG に書き出す' },
  'export.title': { game: '盤面のすべてのページを、1目 = 5mm の方眼ノート（SVG）にして保存します。印刷すると、そのまま紙のすごろくになります', dev: '盤面全体を 1目 = 5mm 実寸の SVG にして保存する（印刷用）' },
  'legend.monster': { game: 'モンスター = テスト1件', dev: 'マス = テスト1件' },
  'legend.monster.title': { game: '道の上のマス1つがモンスター1体。テストが通ると倒せます', dev: '道の上のマス1つがテスト1件。通ると斜線' },
  'legend.slain': { game: '倒した', dev: '通った' },
  'legend.slain.title': { game: '通ったテスト（倒したモンスター）', dev: '通ったテスト' },
  'legend.revived': { game: '復活', dev: '再び落ちた' },
  'legend.revived.title': { game: '一度倒したモンスターが、あとの変更でよみがえった（前に通ったテストが落ちた）', dev: '一度通ったテストが、あとの変更で落ちた（リグレッション）' },
  'legend.hanamaru': { game: 'はなまる', dev: '判定合格' },
  'legend.hanamaru.title': { game: 'ダンジョンの出口で宣言判定に通った', dev: 'タスクの判定（累積テスト）に合格した' },
  'legend.town': { game: '町 = セーブ', dev: '町 = commit' },
  'legend.town.title': { game: '町に着くと宿屋に泊まってセーブします（Git のコミット）', dev: '町に着くと、担当ファイルの変更を git commit する' },
  'legend.fog': { game: '霧', dev: '霧（視界の外）' },
  'legend.fog.title': { game: '視界の外。まだ見えないマスです', dev: '視界の外。エージェントの指示には出ない' },

  // 盤面（SVG）の字
  'board.hint1': { game: '上から下へ。マス1つ ＝ モンスター1体', dev: '上から下へ。マス1つ ＝ テスト1件' },
  'board.hint2': { game: '倒すと赤い斜線。出口で宣言判定', dev: '通ると赤い斜線。出口で check（累積判定）' },
  'board.legend.head': { game: 'このノートの読み方', dev: 'このノートの読み方' },
  'board.legend.monster': { game: 'モンスター1体 ＝ テスト1件', dev: 'マス1つ ＝ テスト1件' },
  'board.legend.slain': { game: '倒した（テストが通った）', dev: '通ったテスト（斜線）' },
  'board.legend.revived': { game: '復活（前に倒したモンスターがよみがえった）', dev: '再び落ちた（リグレッション）' },
  'board.legend.card': { game: 'ダンジョンの出口 ＝ 宣言判定', dev: 'タスクの札 ＝ 判定（累積テスト）' },
  'board.legend.town': { game: '町 ＝ 宿屋でセーブ', dev: '町 ＝ git commit' },
  'board.legend.gate': { game: '中ボスの砦 ＝ 仲間とのボス戦', dev: '結合テスト（ゲート）' },
  'board.legend.goal': { game: '魔王の城 ＝ 章のあがり', dev: '最終結合テスト ＝ 章の完了' },
  'board.legend.king': { game: '王様の城 ＝ 人間のハンコ', dev: '承認 ＝ 人間の判断' },
  'board.ending': { game: 'エンディング', dev: 'エンディング' },
  'board.goal.preview': { game: (page) => `魔王の城 ↓p.${page}`, dev: (page) => `最終結合テスト ↓p.${page}` },
  'board.goal.kind': { game: '魔王の城・章のあがり', dev: '最終結合テスト（E2E）' },
  'board.gate.kind': { game: '中ボスの砦', dev: '結合テスト' },
  'board.gate.beaten': { game: '撃破！', dev: '合格！' },
  'board.goal.beaten': { game: 'あがり！', dev: '完了！' },
  'board.gate.ready': { game: 'そろった！ ボス戦へ', dev: '全員到達。結合テスト可' },
  'board.gate.waiting': { game: (n, all) => `待機 ${n}/${all}`, dev: (n, all) => `到達 ${n}/${all}` },
  'board.tests.unknown': { game: 'テスト ？', dev: 'テスト ？' },
  'board.stamp': { game: 'ハンコ', dev: '承認' },
  'board.camp.kind': { game: '町', dev: '町' },
  'board.camp.saved': { game: 'セーブ済み', dev: 'コミット済み' },
  'board.camp.unsaved': { game: 'セーブ前', dev: '未コミット' },
  'board.camp.stayed': { game: '泊まった', dev: 'コミット' },
  'board.medal.title': { game: '一発で出口を抜けた（ちいさなメダル）', dev: '最初の判定で合格した' },
  'board.seal.broken': { game: '封印が破れている（判定ファイルが書き換えられた）', dev: '判定ファイルが変更されている（封印時のハッシュと違う）' },
  'board.seal.ok': { game: '判定は封印済み', dev: '判定ファイルのハッシュを記録済み' },
  'board.seal.none': { game: '未封印（GM の封印待ち）', dev: 'ハッシュ未記録（GM の封印待ち）' },
  'board.sq.unknown': { game: 'まだ戦っていないテスト（中の分からないダンジョン）', dev: '未実行のテスト（cases が無いタスク）' },
  'board.sq.name': { game: (i, n, name) => `モンスター ${i}/${n}: ${name}`, dev: (i, n, name) => `テスト ${i}/${n}: ${name}` },
  'board.sq.ok': { game: '✔ 倒した', dev: '✔ 通った' },
  'board.sq.ng': { game: '✖ まだ倒せていない', dev: '✖ 落ちている' },
  'board.sq.none': { game: '・ まだ戦っていない', dev: '・ 未実行' },
  'board.sq.strong': { game: '・強敵', dev: '・2回以上失敗' },
  'board.sq.revived': { game: (n) => `・復活 ${n}`, dev: (n) => `・再び落ちた ${n}` },
  'board.margin.pending': { game: '（まだ起きていない。駒が通ると起きる）', dev: '（まだ起きていない。駒が通ると起きる）' },

  // 駒のふきだし
  'say.unknown': { game: '？ まだ戦っていない', dev: '？ 未実行' },
  'say.all': { game: '✔ 全部倒した → 宣言判定', dev: '✔ 全部通った → check' },
  'say.stamp': { game: '㊞ ハンコ待ち', dev: '㊞ 承認待ち' },

  // 状態
  'status.fog': { game: '霧の中', dev: '未着手' },
  'status.open': { game: '見えている', dev: '予定' },
  'status.current': { game: '作業中', dev: '作業中' },
  'status.waiting': { game: '待機中', dev: '結合待ち' },
  'status.ready': { game: '全員そろった', dev: '全員到達' },
  'status.cleared': { game: '突破', dev: '完了' },
  'status.stale': { game: '消された（やり直し）', dev: '要再検証' },
  'char.working': { game: '作業中', dev: '作業中' },
  'char.waiting': { game: '待機中', dev: '結合待ち' },
  'char.done': { game: 'あがり', dev: '完了' },
  'linear.In Progress': { game: '進行中', dev: '進行中' },
  'linear.In Review': { game: '結合待ち', dev: '結合待ち' },
  'linear.Todo': { game: 'これから', dev: 'これから' },
  'linear.Backlog': { game: '霧の中', dev: '未着手' },
  'linear.Done': { game: '完了', dev: '完了' },
  'margin.talk': { game: '会話', dev: '会話' },
  'margin.npc': { game: '町の住人', dev: '住人' },
  'margin.news': { game: '瓦版', dev: 'ニュース' },
  human: { game: '人間', dev: '人間' },
  agent: { game: 'エージェント', dev: 'エージェント' },

  // なかま
  'party.head': { game: 'なかま', dev: 'メンバー' },
  'party.count': { game: (n) => `${n}人`, dev: (n) => `${n}人` },
  'party.gen': { game: (n) => `${n}代目`, dev: (n) => `起動 ${n}回目` },
  'party.gen.title': { game: '出撃1回が1代。先代の技と日誌を受け継ぐ', dev: 'エージェントを起動した回数。前回までのメモと引き継ぎを読む' },
  'party.max': { game: '（最大）', dev: '（最大）' },
  'party.medal.title': { game: 'ちいさなメダル（一発で出口を抜けた数）', dev: '最初の判定で合格したタスクの数' },
  'party.strong': { game: (n) => `強${n}`, dev: (n) => `苦戦${n}` },
  'party.strong.title': { game: '強敵を倒した数（2回以上負けてから倒したテスト）', dev: '2回以上失敗してから通したテストの数' },
  'party.skill': { game: (n) => `技${n}`, dev: (n) => `引継${n}` },
  'party.skill.title': { game: '技（先代から受け継いだもの）', dev: '引き継ぎメモ（苦戦したテストを通した直後のメモ）' },
  'party.fight.unknown': { game: '？ まだ戦っていない', dev: '？ 未実行' },
  'party.fight.all': { game: '全部倒した → 宣言判定', dev: '全部通った → check' },
  'party.fight.all.cli': { game: '全部倒した → gridhub check', dev: '全部通った → gridhub check' },
  'party.fight.title': { game: 'いま戦うテスト', dev: '次に通すテスト' },
  'party.sortie': { game: (who) => `⏳ 出撃中（${who}）`, dev: (who) => `⏳ 実行中（${who}）` },
  'party.progress': { game: (p) => `道のり ${p}%`, dev: (p) => `進み具合 ${p}%` },
  'party.sheet.aria': { game: (name) => `${name}のキャラクターシートを開く`, dev: (name) => `${name}の詳細を開く` },
  'track.aria': { game: '道のり（すごろくの帯）', dev: '進み具合（マスごと）' },

  // モンスター図鑑
  'bestiary.head': { game: 'モンスター図鑑', dev: 'テスト一覧' },
  'bestiary.meta': { game: (d, n, p) => `倒したテスト ${d}/${n}（${p}%）`, dev: (d, n, p) => `通ったテスト ${d}/${n}（${p}%）` },
  'bestiary.revived': { game: (n) => `復活 ${n}`, dev: (n) => `再び落ちた ${n}` },
  'bestiary.strong': { game: (n) => `強敵 ${n}`, dev: (n) => `苦戦 ${n}` },

  // 冒険の書（ログ）・瓦版
  'log.head': { game: '冒険の書', dev: 'ログ' },
  'log.count': { game: (n) => `${n}件`, dev: (n) => `${n}件` },
  'news.head': { game: '瓦版', dev: 'ニュース' },
  'news.sub': { game: '製品のまわりの話と、冒険の号外', dev: '製品分野の話題と、進行の速報' },

  // マスの詳細
  'node.kind.goal': { game: '魔王の城（章のあがり）。全員でいどむ最後のボス戦', dev: '最終結合テスト（章の完了）。全員がそろうと走る E2E' },
  'node.kind.gate': { game: '中ボスの砦。仲間がそろうとボス戦（結合テスト）', dev: '結合テスト。担当が全員そろうと走る' },
  'node.kind.camp': { game: '町。着くと宿屋に泊まってセーブ', dev: 'セーブポイント。着くと担当ファイルを git commit' },
  'node.kind.king': { game: '王様の城。人間のハンコで進む', dev: '承認。人間が確かめて通す' },
  'node.kind.task': { game: 'ダンジョン。モンスターを全部倒したら、出口で宣言判定', dev: 'タスク。テストが全部通ったら、累積判定（check）で完了' },
  'node.seal.broken': { game: '封印が破れています（GM が封印し直すか、元に戻す）', dev: '判定ファイルが変更されています（GM が再封印するか、元に戻す）' },
  'node.seal.ok': { game: '封印済み', dev: 'ハッシュ記録済み' },
  'node.seal.none': { game: '未封印（GM の封印待ち）', dev: 'ハッシュ未記録（GM の封印待ち）' },
  'node.stamp.btn': { game: (who) => `${who}のハンコを押す`, dev: (who) => `${who}として承認する` },
  'node.stamp.hint': { game: (title) => `押すと「${title}」が突破になり、次のマスへ進みます。`, dev: (title) => `押すと「${title}」が完了になり、次のマスへ進みます。` },
  'node.demo.note': { game: '（見本の盤面なので記録はされません）', dev: '（デモの盤面なので記録されません）' },
  'node.battle.btn': { game: 'ボス戦を始める', dev: '結合テストを走らせる' },
  'node.battle.hint': { game: '結合テスト', dev: '結合テスト' },
  'node.output': { game: '出力', dev: '出力' },
  'node.members': { game: 'メンバー', dev: 'メンバー' },
  'node.owner': { game: '担当', dev: '担当' },
  'node.check': { game: '判定', dev: 'テスト' },
  'node.check.none': { game: '（判定なし。着いたら宿屋に泊まる）', dev: '（テストなし。着いたらコミット）' },
  'node.check.stamp': { game: (who) => `${who} のハンコ`, dev: (who) => `${who} の承認` },
  'node.seal': { game: '封印', dev: '改変チェック' },
  'node.rollback': { game: '負けたら', dev: '失敗時' },
  'node.rollback.here': { game: 'このマスでやり直し', dev: 'このタスクからやり直し' },
  'node.rollback.camp': { game: '最後の町の次まで戻る', dev: '直前のセーブポイントの次まで戻る' },
  'node.rollback.to': { game: (id) => `${id} まで戻る`, dev: (id) => `${id} まで戻る` },
  'node.rollback.lv': { game: '（Lv−1）', dev: '（Lv−1）' },
  'node.xp': { game: '経験値', dev: '経験値' },
  'node.milestone': { game: 'マイルストーン', dev: 'マイルストーン' },
  'node.estimate': { game: '見積もり', dev: '見積もり' },
  'node.labels': { game: 'ラベル', dev: 'ラベル' },
  'node.record': { game: '記録', dev: '記録' },
  'node.record.text': { game: (c, f) => `突破 ${c} 回・失敗 ${f} 回`, dev: (c, f) => `合格 ${c} 回・失敗 ${f} 回` },
  'node.record.first': { game: '・一発で抜けた ◎', dev: '・最初の判定で合格 ◎' },
  'node.record.notfirst': { game: '・最初の宣言は失敗', dev: '・最初の判定は失敗' },
  'node.save': { game: 'セーブ', dev: 'コミット' },
  'node.tests.head': { game: 'テスト（モンスター）', dev: 'テスト' },
  'node.tests.unknown': { game: 'まだ一度も判定を走らせていません。中の分からないダンジョン（？のマス）です。', dev: 'まだテストを実行していません（cases が無いので、？のマスが1つ）。' },
  'node.tests.sub': { game: '1件 = 1マス = モンスター1体', dev: '1件 = 1マス' },
  'node.case.revived': { game: (n) => `復活${n}`, dev: (n) => `再失敗${n}` },
  'node.case.revived.title': { game: '一度倒したあとで、よみがえった（前に通ったテストが落ちた）', dev: '一度通ったあとで落ちた（リグレッション）' },
  'node.case.strong': { game: '強敵', dev: '苦戦' },
  'node.case.strong.title': { game: '2回以上負けてから倒した', dev: '2回以上失敗してから通した' },
  'node.case.losses': { game: (n) => `負け ${n}`, dev: (n) => `失敗 ${n}` },
  'node.log.head': { game: 'このマスの記録', dev: 'このマスのログ' },

  // キャラクターシート
  'sheet.head': { game: 'キャラクターシート', dev: '担当の詳細' },
  'sheet.hand': { game: '手で進める', dev: '手動で進める' },
  'sheet.hand.hint': {
    game: 'エージェントを出撃させずに、あなたがこの役を演じます（指令書を読む・縄張りのファイルを書く・歩く・宣言判定）。',
    dev: 'エージェントを起動せずに、あなたがこの担当の作業をします（指示を読む・担当ファイルを書く・テストを走らせる・判定する）。',
  },
  'sheet.module': { game: '担当モジュール', dev: '担当モジュール' },
  'sheet.at': { game: 'いまの場所', dev: '現在のマス' },
  'sheet.done': { game: 'あがり', dev: '完了' },
  'sheet.vision': { game: '視界', dev: '視界' },
  'sheet.vision.n': { game: (n) => `${n}マス先まで`, dev: (n) => `${n}マス先まで` },
  'sheet.vision.0': { game: '現在のマスだけ', dev: '現在のマスだけ' },
  'sheet.checkpoint': { game: 'セーブポイント', dev: 'セーブポイント' },
  'sheet.start': { game: 'ふりだし', dev: '開始' },
  'sheet.territory': { game: '縄張り', dev: '担当ファイル' },
  'sheet.results': { game: '戦績', dev: '成績' },
  'sheet.results.text': { game: (c, f) => `突破 ${c} ・ 失敗 ${f}`, dev: (c, f) => `合格 ${c} ・ 失敗 ${f}` },
  'sheet.medals': { game: (n) => ` ・ メダル ◎${n}`, dev: (n) => ` ・ 最初の判定で合格 ${n}` },
  'sheet.strong': { game: (n) => ` ・ 強敵 ${n}`, dev: (n) => ` ・ 苦戦 ${n}` },
  'sheet.revived': { game: (n) => ` ・ 復活 ${n}`, dev: (n) => ` ・ 再び落ちた ${n}` },
  'sheet.treasures': { game: (n) => ` ・ 宝箱 ${n}`, dev: (n) => ` ・ 判定の直し ${n}` },
  'sheet.traps': { game: (n) => ` ・ 罠 ${n}`, dev: (n) => ` ・ 判定の改変 ${n}` },
  'sheet.gen': { game: '代', dev: '起動' },
  'sheet.gen.text': { game: (n) => `${n}代目（出撃1回が1代。先代の技と日誌を受け継ぐ）`, dev: (n) => `${n}回目（起動のたびに、前回までのメモと引き継ぎを読む）` },
  'sheet.lastsave': { game: '最後のセーブ', dev: '最後のコミット' },
  'sheet.grave': { game: '墓', dev: 'stash' },
  'sheet.note': { game: '日誌', dev: 'メモ' },
  'sheet.sorties': { game: '出撃の記録', dev: '起動の記録' },
  'sheet.sorties.count': { game: (n) => `${n}回`, dev: (n) => `${n}回` },
  'sheet.sortie.open': { game: ' → 出撃中…', dev: ' → 実行中…' },
  'sheet.return': { game: '帰還', dev: '終了' },
  'sheet.skills': { game: '技（閃き）', dev: '引き継ぎメモ' },
  'sheet.skills.sub': { game: '先代から受け継いだもの', dev: '苦戦したテストを通した直後のメモ。次の起動にも渡る' },
  'sheet.cli': {
    game: (id) => `このキャラクターを動かすエージェントへの最初の指示: <code>gridhub brief ${id}</code> を読んで、いちばん手前の落ちているテストだけを通し、<code>gridhub step ${id}</code> で歩く（何度でも）。全部倒したら <code>gridhub check ${id}</code> で宣言（一発勝負）。`,
    dev: (id) => `この担当を動かすエージェントへの最初の指示: <code>gridhub brief ${id}</code> を読んで、最初に落ちているテストだけを通し、<code>gridhub step ${id}</code> で確かめる（何度でも）。全部通ったら <code>gridhub check ${id}</code> で判定（累積。失敗すると Lv−1）。`,
  },
  'sheet.terminal': { game: 'ターミナルでは', dev: 'ターミナルでは' },
  'sheet.path': { game: '道のり', dev: 'マスの並び' },

  // 台帳
  'ledger.head': { game: '台帳', dev: '一覧' },
  'ledger.sub': { game: 'Linear でいうと、こう見える', dev: 'Linear のステータスで見る' },
  'ledger.lead': {
    game: 'マスの状態は、そのまま Linear のステータスになります（gridhub export linear で書き出せます）。行を押すと盤面のマスを開きます。',
    dev: 'マスの状態は、そのまま Linear のステータスになります（gridhub export linear で書き出せます）。行をクリックすると盤面のマスを開きます。',
  },
  'ledger.id': { game: 'ID', dev: 'ID' },
  'ledger.title': { game: 'タイトル', dev: 'タイトル' },
  'ledger.milestone': { game: 'マイルストーン（次のボス戦）', dev: 'マイルストーン（次の結合テスト）' },
  'ledger.assignee': { game: '担当', dev: '担当' },
  'ledger.estimate': { game: '見積', dev: '見積' },
  'ledger.gate': { game: 'ボス戦', dev: '結合' },
  'ledger.stale': { game: 'やり直し', dev: '要再検証' },
  'ledger.broken': { game: '封印破れ', dev: '判定が改変' },

  // 余白のマス
  'margin.kind': { game: '寄り道', dev: 'イベント' },
  'margin.lead': { game: (road, after) => `寄り道のマス（${road} の道、${after} のあと）。判定も罰もなく、進みは止めません`, dev: (road, after) => `イベントのマス（${road} の道、${after} のあと）。判定はなく、進行には影響しません` },
  'margin.seen': { game: '起きた', dev: '起きた' },
  'margin.unseen': { game: 'まだ起きていない', dev: 'まだ起きていない' },
  'margin.hint': { game: 'この道の駒が通ると、ここで起きたことが読めます。', dev: 'この道の駒が通ると、ここで起きたことが読めます。' },
  'margin.source': { game: '出典', dev: '出典' },

  // 手で進める
  'hand.title': { game: '手で進める', dev: '手動で進める' },
  'hand.title.for': { game: (name) => `手で進める: ${name}`, dev: (name) => `手動で進める: ${name}` },
  'hand.step': { game: '歩く（モンスターと戦う）', dev: 'テストを走らせる（step）' },
  'hand.check': { game: '宣言判定（出口にいどむ）', dev: '判定する（check・累積）' },
  'hand.stamp': { game: 'ハンコを押す', dev: '承認する' },
  'hand.battle': { game: 'ボス戦を始める', dev: '結合テストを走らせる' },
  'hand.who': { game: (name, role, lv) => `${name}（${role}）・Lv${lv}`, dev: (name, role, lv) => `${name}（${role}）・Lv${lv}` },
  'hand.role.human': { game: '人間', dev: '人間' },
  'hand.role.agent': { game: 'エージェントの役', dev: 'エージェントの担当' },
  'hand.done': { game: 'あがりました。もう進むマスはありません。', dev: '完了しています。もう進むマスはありません。' },
  'hand.waiting': { game: (names) => `仲間を待っています: ${names}`, dev: (names) => `ほかの担当を待っています: ${names}` },
  'hand.ready': { game: '仲間がそろいました。ボス戦（結合テスト）を始められます。', dev: '全員がそろいました。結合テストを走らせられます。' },
  'hand.run': { game: '判定: ', dev: 'テスト: ' },
  'hand.territory': { game: '縄張り: ', dev: '担当ファイル: ' },
  'hand.territory.none': { game: '（ありません）', dev: '（ありません）' },
  'hand.files': { game: '縄張りのファイル', dev: '担当ファイル' },
  'hand.files.empty': { game: 'まだありません。下の欄で書いて保存すると作れます。', dev: 'まだありません。下の欄で書いて保存すると作れます。' },
  'hand.sample': { game: (path) => `見本を写す: ${path}`, dev: (path) => `見本を写す: ${path}` },
  'hand.review': { game: '読むだけのファイル', dev: '読み取り専用のファイル' },
  'hand.review.hint': { game: '指令書と判定に書かれた、仲間のファイルです。押すと下の欄に出します（書けません）。', dev: '指示とテストに書かれた、ほかの担当のファイルです。押すと下の欄に出ます（編集はできません）。' },
  'hand.review.title': { game: (owner, size) => `${owner} の縄張り・${size} バイト`, dev: (owner, size) => `${owner} の担当・${size} バイト` },
  'hand.file.title': { game: (size) => `${size} バイト`, dev: (size) => `${size} バイト` },
  'hand.path': { game: 'ファイル（縄張りの中の相対パス）', dev: 'ファイル（担当範囲の中の相対パス）' },
  'hand.readonly': { game: '読むだけ（書けません）', dev: '読み取り専用（編集できません）' },
  'hand.content': { game: 'ファイルの中身', dev: 'ファイルの中身' },
  'hand.save': { game: '保存', dev: '保存' },
  'hand.msg.unreachable': { game: 'サーバーに届きません', dev: 'サーバーに届きません' },
  'hand.msg.readfail': { game: (why) => `読めませんでした: ${why}`, dev: (why) => `読めませんでした: ${why}` },
  'hand.msg.fail': { game: (why) => `できませんでした: ${why}`, dev: (why) => `できませんでした: ${why}` },
  'hand.msg.sample': { game: '見本を書き込み欄に写しました。中身を確かめて「保存」を押してください。', dev: '見本を書き込み欄に入れました。中身を確かめて「保存」を押してください。' },
  'hand.msg.nopath': { game: (ex) => `ファイルのパスを書いてください${ex ? `（例: ${ex}）` : ''}`, dev: (ex) => `ファイルのパスを書いてください${ex ? `（例: ${ex}）` : ''}` },
  'hand.msg.saved': { game: (path, bytes) => `保存しました: ${path}（${bytes} バイト）`, dev: (path, bytes) => `保存しました: ${path}（${bytes} バイト）` },
  'hand.msg.step.ok': { game: (node) => `歩きました（${node}）。モンスターを全部倒しました。「宣言判定」で出口を抜けられます。`, dev: (node) => `テストを走らせました（${node}）。全部通っています。「判定する」で次のマスへ進めます。` },
  'hand.msg.step.ng': { game: (node, won, all) => `歩きました（${node}）。まだ倒せていないモンスターがいます${all ? `（${won}/${all}）` : ''}。`, dev: (node, won, all) => `テストを走らせました（${node}）。まだ落ちているテストがあります${all ? `（${won}/${all}）` : ''}。` },
  'hand.msg.check.ok': { game: (ready) => `判定成功！ 出口を抜けて、次のマスへ進みました。${ready ? `仲間がそろいました。${ready} のボス戦を始めます。` : ''}`, dev: (ready) => `判定に合格。次のマスへ進みました。${ready ? `全員がそろいました。${ready} の結合テストを走らせます。` : ''}` },
  'hand.msg.check.ng': { game: '全滅…… レベルが1つ下がり、町まで戻されました。盤面のこのマスの記録の「出力」で原因を見て直し、「歩く」で確かめてから、もう一度宣言判定してください。', dev: '判定に失敗。レベルが1つ下がり、直前のセーブポイントの次に戻されました。このマスのログの「出力」で原因を見て直し、「テストを走らせる」で確かめてから、もう一度判定してください。' },
  'hand.msg.stamp': { game: (node, ready) => `ハンコを押しました（${node}）。${ready ? `仲間がそろいました。${ready} のボス戦を始めます。` : ''}`, dev: (node, ready) => `承認しました（${node}）。${ready ? `全員がそろいました。${ready} の結合テストを走らせます。` : ''}` },
  'hand.msg.battle': { game: (gate) => `${gate} のボス戦（結合テスト）を始めました。結果は盤面に出ます。`, dev: (gate) => `${gate} の結合テストを走らせました。結果は盤面に出ます。` },
  'toast.ready': { game: (gate) => `仲間がそろいました。${gate} のボス戦を始めます…`, dev: (gate) => `全員がそろいました。${gate} の結合テストを走らせます…` },
  'toast.battle': { game: (gate) => `${gate} のボス戦が始まりました（結合テストを実行中）`, dev: (gate) => `${gate} の結合テストを実行中` },

  // 出撃
  'sortie.open': { game: '出撃させる', dev: 'エージェントを起動' },
  'sortie.title': { game: '出撃させる', dev: 'エージェントを起動する' },
  'sortie.tactic': { game: '作戦', dev: '作戦（tactic）' },
  'sortie.who': { game: 'だれを', dev: '担当' },
  'sortie.cancel': { game: 'やめる', dev: 'キャンセル' },
  'sortie.go': { game: '出撃！', dev: '起動する' },
  'sortie.none': { game: 'いま作業中のエージェントがいません（全員が砦で待機中か、あがり）。', dev: 'いま作業中のエージェントがいません（全員が結合待ちか、完了）。' },
  'sortie.busy': { game: '出撃中', dev: '実行中' },
  'sortie.demo': { game: '見本の盤面なので出撃はできません（gridhub serve で開くと、本物のエージェントを出撃させられます）', dev: 'デモの盤面ではエージェントを起動できません（gridhub serve で開くと起動できます）' },
  'sortie.choose': { game: '出撃させるキャラクターを選んでください', dev: '起動する担当を選んでください' },
  'sortie.went': { game: (agent, tactic) => `パーティが出撃しました（${agent}・作戦: ${tactic}）`, dev: (agent, tactic) => `エージェントを起動しました（${agent}・作戦: ${tactic}）` },
  'sortie.back': { game: (last) => `パーティが帰ってきました: ${last}`, dev: (last) => `エージェントが終了しました: ${last}` },
  'sortie.idle': { game: '出撃していません', dev: '起動していません' },
  'sortie.running': { game: (last) => `⚔ 出撃中… ${last}`, dev: (last) => `⚙ 実行中… ${last}` },
  'sortie.outside': { game: (n) => `⏳ 出撃中のエージェント ${n}人`, dev: (n) => `⏳ 実行中のエージェント ${n}` },
  'sortie.stop': { game: '止める', dev: '止める' },

  // GitHub
  'git.aria': { game: 'GitHub に送る（町のセーブを GitHub に置く）', dev: 'GitHub に push する（町でのコミットを origin に置く）' },
  'git.outside': { game: 'ここはまだ Git で管理されていません', dev: 'ここは Git の作業ツリーではありません' },
  'git.guide': { game: 'GitHub につなぐ手引き（上から順に）', dev: 'GitHub につなぐ手順（上から順に）' },
  'git.branch': { game: (b) => `ブランチ ${b}`, dev: (b) => `ブランチ ${b}` },
  'git.ahead': { game: (n) => `GitHub に送っていないセーブ: ${n}`, dev: (n) => `push していないコミット: ${n}` },
  'git.synced': { game: 'GitHub に送っていないセーブ: 0', dev: 'push していないコミット: 0' },
  'git.noupstream': { game: 'まだ一度も送っていない', dev: 'まだ一度も push していない' },
  'git.push': { game: 'GitHub に送る', dev: 'push' },
  'git.pushing': { game: '送っています…', dev: 'push 中…' },
  'git.push.title.synced': { game: 'GitHub と同じです（送るものはありません）', dev: 'origin と同じです（push するものはありません）' },
  'git.push.title': { game: '町でセーブしたコミットを GitHub に送ります（git push。force push はしません）', dev: 'git push（--force はしない）' },
  'git.auto': { game: '町でセーブしたら GitHub に送る', dev: 'コミットしたら自動で push' },
  'git.auto.toast': { game: (on) => `町でセーブしたら GitHub に送る: ${on ? 'オン' : 'オフ'}`, dev: (on) => `コミットしたら自動で push: ${on ? 'オン' : 'オフ'}` },
  'git.last.ok': { game: (c) => `GitHub に送った（commit ${c}）`, dev: (c) => `push 済み（commit ${c}）` },
  'git.last.ng': { game: (e) => `GitHub に送れなかった: ${e}`, dev: (e) => `push に失敗: ${e}` },
  'git.pushed': { game: (remote, branch, c) => `GitHub に送った: ${remote} ${branch}${c ? `（commit ${c}）` : ''}`, dev: (remote, branch, c) => `push した: ${remote} ${branch}${c ? `（commit ${c}）` : ''}` },

  // 盤面の知らせ
  'fx.revived': { game: '復活！', dev: '再び落ちた！' },
  'fx.strong': { game: '強敵を倒した！', dev: '苦戦したテストが通った！' },
  'curse.head': { game: '☠ 冒険の書が呪われています', dev: '☠ セーブデータ（冒険の書）の整合性エラー' },
  'curse.body1': { game: ' で呪いの場所を確かめ、', dev: ' で壊れた場所を確かめ、' },
  'curse.body2': { game: ' で直してください（直すと、この知らせは消えます）。', dev: ' で直してください（直すと、この知らせは消えます）。' },
  'curse.unreadable': { game: '冒険の書の中身が読めません', dev: 'セーブデータの中身が読めません' },
  'curse.unreadable.head': { game: '冒険の書の先頭から読めません', dev: 'セーブデータの先頭から読めません' },
  'finish.toast': { game: 'あがり！ 全員そろってゴールしました', dev: '完了！ 最終結合テストに合格しました' },
  'demo.readonly': { game: '見本の盤面なので記録はされません（gridhub serve で開くと本物のハンコが押せます）', dev: 'デモの盤面なので記録されません（gridhub serve で開くと操作できます）' },
  'post.unreachable': { game: 'サーバーに届きません（gridhub serve が動いているか確かめてください）', dev: 'サーバーに届きません（gridhub serve が動いているか確かめてください）' },
  'post.fail': { game: (why) => `できませんでした: ${why}`, dev: (why) => `できませんでした: ${why}` },
  'notice.help': { game: 'gridhub serve が動いているか確かめてください。つながれば、ひとりでに盤面が出ます。', dev: 'gridhub serve が動いているか確かめてください。つながれば、自動で盤面が出ます。' },
  'notice.off': { game: '盤面サーバーに届きません', dev: 'サーバーに届きません' },
  'notice.unreadable': { game: '盤面を読み込めません', dev: '盤面を読み込めません' },
  'copy.done': { game: (text) => `写しました: ${text}`, dev: (text) => `コピーしました: ${text}` },
  'copy.back': { game: (seq) => `（この時点に戻る: gridhub load ${seq}）`, dev: (seq) => `（この時点に戻る: gridhub load ${seq}）` },
  'export.done': { game: (name, pages) => `ノートに書き出しました: ${name}（${pages}ページ・1目 = 5mm の実寸）`, dev: (name, pages) => `SVG に書き出しました: ${name}（${pages}ページ・1目 = 5mm 実寸）` },
  'load.fail': { game: (why) => `盤面を読み込めませんでした: ${why}`, dev: (why) => `盤面を読み込めませんでした: ${why}` },
  'fixture.badname': { game: '見本の名前には英数字・-・_ だけが使えます', dev: 'デモの名前には英数字・-・_ だけが使えます' },
  'script.badname': { game: '台本の名前には英数字・-・_ だけが使えます（台本なしで見本を出します）', dev: '台本の名前には英数字・-・_ だけが使えます（台本なしでデモを出します）' },
  'ending.kicker': { game: 'エンディング', dev: 'エンディング' },
  'ending.stamp': { game: 'あがり', dev: 'あがり' },
  'ending.close': { game: '盤面にもどる', dev: '盤面にもどる' },
  'ending.tests': { game: 'テスト', dev: 'テスト' },
  'ending.medals': { game: 'メダル', dev: '最初の判定で合格' },
  'ending.strong': { game: '強敵', dev: '苦戦' },
  'ending.revived': { game: '復活', dev: '再び落ちた' },
  'ending.treasures': { game: '宝箱', dev: '判定の直し' },
  'ending.skills': { game: '技', dev: '引き継ぎ' },
  'ending.sorties': { game: '出撃', dev: '起動' },

  // 入口
  'lobby.phase.running': { game: 'GM が地図を描いています…', dev: 'GM（LLM）が地図とテストを書いています…' },
  'lobby.phase.done': { game: '地図ができました', dev: '地図ができました' },
  'lobby.phase.failed': { game: (code, why) => `GM が地図を描けませんでした（終了コード ${code}）${why ? `: ${why}` : ''}`, dev: (code, why) => `GM が地図を書けませんでした（終了コード ${code}）${why ? `: ${why}` : ''}` },

  // はじめの画面
  'start.unreachable': { game: 'GridHub に届きません。アプリを開き直してください', dev: 'GridHub に届きません。アプリを開き直してください' },
  'start.openfail': { game: 'ひらけませんでした', dev: '開けませんでした' },
  'start.nopath': { game: 'フォルダの場所を書いてください', dev: 'フォルダの場所を書いてください' },
  'start.hasgame': { game: '冒険の書あり', dev: 'セーブデータあり' },
  'start.nogame': { game: 'まだ冒険の書なし（入口）', dev: 'セーブデータなし（入口）' },
  'start.missing': { game: '・見つかりません', dev: '・見つかりません' },
  'start.forget': { game: '外す', dev: '外す' },
  'start.forget.title': { game: '最近のフォルダから外す（フォルダは消しません）', dev: '最近のフォルダから外す（フォルダは消しません）' },
  'start.claude.found': { game: 'claude（Claude Code）: 見つかりました。冒険づくり（GM）と出撃に使います。', dev: 'claude（Claude Code）: 見つかりました。地図づくり（GM）とエージェントの起動に使います。' },
  'start.claude.none1': { game: 'claude（Claude Code）が見つかりません。冒険づくり（GM）と出撃に使います。入れるには、ターミナルで ', dev: 'claude（Claude Code）が見つかりません。地図づくり（GM）とエージェントの起動に使います。入れるには、ターミナルで ' },
  'start.claude.none2': { game: '。チュートリアルは claude なしで遊べます。', dev: '。チュートリアルは claude なしで遊べます。' },
};

/** いまの言い方の字。関数の項目は引数つきで呼ぶ。知らない key はそのまま返す */
export function t(key, ...args) {
  const entry = Object.hasOwn(T, key) ? T[key] : null;
  if (!entry) return key;
  const value = entry[mode] ?? entry.game;
  return typeof value === 'function' ? value(...args) : value;
}

export const statusJa = (state) => (Object.hasOwn(T, `status.${state}`) ? t(`status.${state}`) : state);
export const charStatusJa = (status) => (Object.hasOwn(T, `char.${status}`) ? t(`char.${status}`) : status);
export const linearJa = (status) => (Object.hasOwn(T, `linear.${status}`) ? t(`linear.${status}`) : status);
export const marginJa = (kind) => (Object.hasOwn(T, `margin.${kind}`) ? t(`margin.${kind}`) : kind);

/** 静的な HTML の字を、いまの言い方にする。data-t は textContent、data-t-title は title、data-t-aria は aria-label、data-t-placeholder は placeholder */
export function applyWords(root = document) {
  if (!root?.querySelectorAll) return;
  for (const el of root.querySelectorAll('[data-t]')) el.textContent = t(el.dataset.t);
  for (const el of root.querySelectorAll('[data-t-title]')) el.title = t(el.dataset.tTitle);
  for (const el of root.querySelectorAll('[data-t-aria]')) el.setAttribute('aria-label', t(el.dataset.tAria));
  for (const el of root.querySelectorAll('[data-t-placeholder]')) el.placeholder = t(el.dataset.tPlaceholder);
}

/** 切り替えのボタン（#words-toggle）の字と状態 */
export function renderToggle() {
  const btn = typeof document !== 'undefined' ? document.querySelector('#words-toggle') : null;
  if (!btn) return;
  // 字は「印 + 名前」。狭い画面では名前を隠して印だけにする（board.css の .wt-label）
  const [icon, ...rest] = t(mode === 'dev' ? 'toggle.dev' : 'toggle.game').split(' ');
  const mark = document.createElement('span');
  mark.className = 'wt-icon';
  mark.textContent = icon;
  const label = document.createElement('span');
  label.className = 'wt-label';
  label.textContent = ` ${rest.join(' ')}`;
  btn.replaceChildren(mark, label);
  btn.title = t('toggle.title');
  btn.setAttribute('aria-pressed', String(mode === 'dev'));
  btn.dataset.words = mode;
}

/** 切り替えのボタンを生かし、最初の字を入れる。盤面もはじめの画面も、読み込みのはじめに1回呼ぶ */
export function initWords() {
  syncWordsAttr();
  applyWords(document);
  renderToggle();
  const btn = document.querySelector('#words-toggle');
  if (btn && !btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => setWordsMode(mode === 'dev' ? 'game' : 'dev'));
  }
}

// ---- アプリの中の言い方（CONTRACTS §74.3） ----
// はじめの画面から開いた盤面（?home=）では、遊び方の指示に出てくる CLI（gridhub check apprentice --as apprentice など）を、
// 盤面のボタンの名前に言い換える。引数の無い「gridhub check」は、作るものの名前のことがあるので、そのままにする。
const BUTTON_KEY = { stamp: 'hand.stamp', check: 'hand.check', step: 'hand.step', brief: 'hand.title' };
const CLI = /\s*\b(?:gridhub|masume)\s+(stamp|check|step|brief)(?:\s+(?:--?[A-Za-z][\w-]*|[\w<>][\w.<>-]*))+\s*/gu;

/** ボタンの名前（かっこ書きの説明は外す）: 「宣言判定（出口にいどむ）」→「宣言判定」 */
const buttonName = (key) => t(key).replace(/[（(].*$/u, '');

export function appWords(text) {
  return String(text ?? '').replace(CLI, (_, command) => `「${buttonName(BUTTON_KEY[command])}」`);
}

/** アプリの中なら言い換え、外ならそのまま */
export const wordsFor = (app) => (app ? appWords : (text) => String(text ?? ''));
