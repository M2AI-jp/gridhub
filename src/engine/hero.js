// 勇者の手帳（CONTRACTS §79）: 遊ぶ人（勇者）の積み上げ。冒険をまたいで残る。
// 中身はすべて冒険の書（いくつもの冒険の log.jsonl）から導く。シールのレア度もイベントのハッシュで決まる（ハッシュの鎖がサイコロ）。
// 手帳のファイル（<home>/hero.json）が覚えるのは、遊ぶ人の手の跡だけ: どの冒険を見たか・どのシール袋を開けたか・どこまで読んだか。
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { chronicle } from './chronicle.js';
import { logFile } from './paths.js';
import { inspectLog } from './store.js';

const BOOK = 'hero.json';
const RECENT = 'recent.json';
const QUEST_MAX = 40; // 手帳がまとめる冒険の数（新しく見たものから）
const BAG_PREVIEW = 120; // 1回に返す未開封のシール袋の数
export const OPEN_MAX = 5000; // 1回に開けられるシール袋の数（「ぜんぶ」）
const PASTE_MAX = 200; // 1つの冒険のノートに貼れるシールの数
// ノートの1ページ（web/board/world.js の PAGE と同じ。目の数）
const PAGE_W = 36;
const PAGE_H = 51;

// ---- シール（§79.2） ----
export const RARITIES = ['normal', 'kira', 'holo', 'gold'];
export const RARITY_JA = { normal: 'ノーマル', kira: 'キラ', holo: 'ホロ', gold: '金' };
// 盤面の道のモンスター（web/board/draw.js の SPECIES と同じ並び。テストの名前で決まる）
export const SPECIES = ['slime', 'bat', 'mushroom', 'ghost', 'snake', 'golem'];
export const SPECIES_JA = {
  slime: 'スライム', bat: 'こうもり', mushroom: 'おばけきのこ', ghost: 'ゴースト', snake: 'へび', golem: 'ゴーレム',
  dragon: 'ドラゴン', maou: '魔王',
};
// 出来事のシール（どれも本当の開発の節目）。レア度は決まっている
export const ITEMS = {
  map: { name: '冒険の地図', rarity: 'normal', how: '冒険をはじめる' },
  inn: { name: '宿屋のスタンプ', rarity: 'normal', how: '町でセーブする（git commit）' },
  medal: { name: 'ちいさなメダル', rarity: 'kira', how: 'ダンジョンを一発で抜ける' },
  potion: { name: 'やくそう', rarity: 'kira', how: '復活したテストを倒し直す（リグレッションを直す）' },
  crown: { name: '王様のハンコ', rarity: 'kira', how: '王様の城でハンコを押す' },
  flag: { name: 'GitHub の旗', rarity: 'kira', how: 'GitHub に送る（push）' },
  lantern: { name: 'お題のランタン', rarity: 'kira', how: '今日のお題を3つこなす' },
  sword: { name: 'はがねのつるぎ', rarity: 'holo', how: '1回の判定で5体以上まとめて倒す' },
  scroll: { name: '技の巻物', rarity: 'holo', how: '強敵を倒したあとに日誌を書く（技）' },
  chest: { name: '宝箱', rarity: 'holo', how: '判定のほころびを見つけて直してもらう' },
  bell: { name: '皆勤の鐘', rarity: 'holo', how: '何日も続けてテストを倒す（3・7・14・30日…）' },
  shield: { name: '無傷の盾', rarity: 'gold', how: '一度も倒れずに章をあがる' },
};
// 交換所（§79.16）: 同じシールが KEEP + TRADE_N 枚あれば、TRADE_N 枚を1つ上のレア度1枚と換える（KEEP 枚はシール帳に残る）
export const TRADE_N = 5;
// シール帳の列（§79.19）: 1列そろえるとコンプの判と経験値
export const SET_XP = 200;
const KEEP = 1;
// ノートの模様（§79.30）: 勇者ランクで使えるようになる
export const THEMES = [
  { id: 'note', name: '方眼ノート', rank: 1 },
  { id: 'kraft', name: 'クラフト紙', rank: 3 },
  { id: 'sakura', name: 'さくら色の方眼', rank: 5 },
  { id: 'night', name: '夜の机', rank: 8 },
  { id: 'blueprint', name: '青写真', rank: 12 },
  { id: 'gold', name: '金の方眼', rank: 24 },
];

// シールのいわれ（§79.28）: 図鑑のひとこと。どれも開発の話
export const LORE = {
  slime: 'いちばん多い、ふつうのテスト。1つの値を確かめれば倒せる。小さく進む勇者の友。',
  bat: 'すばやく飛び回る。非同期の待ち合わせ（await）を忘れると取り逃がす。',
  mushroom: '放っておくと増える。直し忘れたテストは、復活して胞子をまく。',
  ghost: '見えたり消えたり。たまにだけ落ちるテスト（flaky）の化身。時刻と順番を疑え。',
  snake: '長くのびる。空・最大・ちょうど境目——入力の長さを確かめると、しっぽをつかめる。',
  golem: 'かたくて重い。ファイルやサーバーを使うテストは、ゆっくりだが確実に倒す。',
  dragon: '結合ゲートの主。モジュールどうしが初めてつながる所に棲む。仲間がそろうまで眠っている。',
  maou: '章のあがりの E2E。全員がそろわないと、城の扉は開かない。',
  map: 'すべての冒険は、願いを地図にするところから始まる。',
  inn: 'セーブは commit。こまめに泊まれば、負けても失うものは小さい。',
  medal: '一発で出口を抜けた証。全部通してから宣言した。',
  potion: '復活したテストを倒し直した。リグレッションに気づける勇者の薬。',
  crown: '人間にしか決められないことを、王様が決めた印。',
  flag: 'GitHub に旗を立てた。セーブが、仲間の手元にも届く。',
  lantern: '今日のお題を照らした灯り。毎日の小さな一歩。',
  sword: '1回の判定で5体以上。まとめて切り開いた一太刀。',
  scroll: '強敵のあとに書いた日誌。次の代に受け継がれる技。',
  chest: '判定のほころびを見つけて、直してもらった。テストを書き換えずに報告した勇者だけが開けられる。',
  bell: '何日も続けた皆勤の鐘。毎日少しずつが、いちばん強い。',
  shield: '一度も倒れずに章をあがった。無傷の盾。',
};
const ITEM_ORDER = ['map', 'inn', 'medal', 'potion', 'crown', 'flag', 'lantern', 'sword', 'scroll', 'chest', 'bell', 'shield'];

/** シール帳の枠（並びも決まっている）: 道のモンスター 6種×4、ドラゴン（中ボス）ホロ・金、魔王 金、出来事 12 */
export const ALBUM = [
  ...SPECIES.flatMap((species) => RARITIES.map((rarity) => ({ slot: `${species}:${rarity}`, kind: 'monster', species, rarity }))),
  { slot: 'dragon:holo', kind: 'boss', species: 'dragon', rarity: 'holo' },
  { slot: 'dragon:gold', kind: 'boss', species: 'dragon', rarity: 'gold' },
  { slot: 'maou:gold', kind: 'maou', species: 'maou', rarity: 'gold' },
  ...ITEM_ORDER.map((item) => ({ slot: item, kind: 'item', item, rarity: ITEMS[item].rarity })),
];

/** テストの名前から、道のモンスターの種類（盤面の speciesOf と同じ） */
export function speciesOf(name, i = 0) {
  let h = 0;
  for (const ch of String(name ?? i)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SPECIES[h % SPECIES.length];
}

/** ハッシュの鎖のサイコロ: 0 以上 1 未満 */
function dice(...parts) {
  return parseInt(createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8), 16) / 0x100000000;
}

/** 道のモンスターのレア度: 金 2%・ホロ 8%・キラ 25%・ノーマル 65%。強敵はキラ以上 */
function monsterRarity(roll, strong) {
  const rarity = roll < 0.02 ? 'gold' : roll < 0.10 ? 'holo' : roll < 0.35 ? 'kira' : 'normal';
  return strong && rarity === 'normal' ? 'kira' : rarity;
}

const short = (text, n = 48) => {
  const chars = [...String(text ?? '').replace(/\s+/gu, ' ').trim()];
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('');
};

// ---- 勇者ランク（§79.3） ----
export const XP = {
  defeat: 10, strong: 20, cure: 20, clear: 30, medal: 20, gate: 100, goal: 300, stamp: 20, note: 5, skill: 30,
  treasure: 30, save: 10, push: 10, quest: 20, combo: 30, daily: 50, streak: 100,
};
const TITLES = [
  [1, '見習い勇者'], [3, '駆け出しの勇者'], [5, '一人前の勇者'], [8, '歴戦の勇者'], [12, '名のある勇者'],
  [17, '英雄'], [24, '伝説の勇者'], [32, '神話の勇者'],
];
/** ランク L から L+1 に上がるのに要る経験値 */
const toNext = (level) => 50 + 50 * level;

export function rankOf(xp) {
  let level = 1;
  let floor = 0;
  while (xp >= floor + toNext(level)) {
    floor += toNext(level);
    level++;
  }
  const title = TITLES.filter(([from]) => level >= from).at(-1)[1];
  const next = floor + toNext(level);
  return { level, title, xp, floor, next, into: xp - floor, need: next - floor };
}

// ---- 今日のお題（§79.5） ----
const MISSIONS = {
  defeat3: { text: 'テストを3件倒す', key: 'defeats', goal: 3 },
  defeat8: { text: 'テストを8件倒す', key: 'defeats', goal: 8 },
  clear1: { text: 'ダンジョンを1つ抜ける（宣言判定に通る）', key: 'clears', goal: 1 },
  clear2: { text: 'ダンジョンを2つ抜ける', key: 'clears', goal: 2 },
  medal1: { text: '一発で出口を抜ける（ちいさなメダル）', key: 'medals', goal: 1 },
  note1: { text: '日誌を1つ書く（次の自分への申し送り）', key: 'notes', goal: 1 },
  sortie1: { text: 'エージェントを出撃させる', key: 'sorties', goal: 1 },
  step5: { text: '5回歩く（step で小さく確かめる）', key: 'steps', goal: 5 },
};
const MISSION_SLOTS = [['defeat3', 'defeat8', 'step5'], ['clear1', 'clear2', 'medal1'], ['note1', 'sortie1', 'step5']];

/** その日のお題3つ（日付で決まる。同じ日なら誰が見ても同じ） */
export function missionsOf(date) {
  const picked = [];
  MISSION_SLOTS.forEach((slot, i) => {
    const choices = slot.filter((id) => !picked.includes(id));
    picked.push(choices[Math.floor(dice('お題', date, i) * choices.length)]);
  });
  return picked.map((id) => ({ id, ...MISSIONS[id] }));
}

// ---- 称号（§79.4） ----
export const ACHIEVEMENTS = [
  ['first-blood', 'はじめの一歩', 'テストを1件倒す', 'defeats', 1],
  ['defeat-10', '十人斬り', 'テストを10件倒す', 'defeats', 10],
  ['defeat-100', '百人斬り', 'テストを100件倒す', 'defeats', 100],
  ['defeat-1000', '千人斬り', 'テストを1000件倒す', 'defeats', 1000],
  ['clear-1', 'ダンジョン踏破', 'ダンジョンを1つ抜ける', 'clears', 1],
  ['clear-50', '迷宮の主', 'ダンジョンを50抜ける', 'clears', 50],
  ['medal-1', '一発合格', 'ダンジョンを一発で抜ける', 'medals', 1],
  ['medal-10', 'メダル集め', 'ちいさなメダルを10枚', 'medals', 10],
  ['medal-50', 'メダル王', 'ちいさなメダルを50枚', 'medals', 50],
  ['strong-1', '強敵ハンター', '2回以上負けたテストを倒す', 'strongs', 1],
  ['comeback', '大逆転', '5回以上負けたテストを倒す', 'comebacks', 1],
  ['skill-1', '閃き', '技を1つ覚える（強敵のあとの日誌）', 'skills', 1],
  ['skill-10', '伝承者', '技を10覚える', 'skills', 10],
  ['cure-1', '見逃さない', '復活したテストを倒し直す', 'cures', 1],
  ['combo-1', 'まとめ斬り', '1回の判定で5体以上まとめて倒す', 'combos', 1],
  ['gate-1', '連携技', '結合ゲートを突破する', 'gates', 1],
  ['gate-10', 'ボスラッシュ', '結合ゲートを10突破する', 'gates', 10],
  ['goal-1', '魔王討伐', '章をあがる（魔王の城）', 'goals', 1],
  ['goal-5', '魔王キラー', '章を5つあがる', 'goals', 5],
  ['flawless', '無傷の勇者', '一度も倒れずに章をあがる', 'flawless', 1],
  ['stamp-5', '王様の信頼', 'ハンコを5回押す', 'stamps', 5],
  ['note-20', '筆まめ', '日誌を20書く', 'notes', 20],
  ['treasure-1', '宝さがし', '判定のほころびを見つける（宝箱）', 'treasures', 1],
  ['save-10', 'こまめなセーブ', '町で10回セーブする（git commit）', 'saves', 10],
  ['push-1', 'GitHub デビュー', 'GitHub に送る', 'pushes', 1],
  ['sortie-50', '大軍師', 'エージェントを50回出撃させる', 'sorties', 50],
  ['quest-3', '冒険家', '3つの冒険をはじめる', 'quests', 3],
  ['night', '夜ふかしの勇者', '0時〜4時台にテストを倒す', 'night', 1],
  ['dawn', '早起きの勇者', '5時〜7時台にテストを倒す', 'dawn', 1],
  ['weekend', '週末の勇者', '土日にテストを倒す', 'weekend', 1],
  ['streak-3', '三日坊主じゃない', '3日続けてテストを倒す', 'streak', 3],
  ['streak-7', '一週間皆勤', '7日続けてテストを倒す', 'streak', 7],
  ['streak-30', 'ひと月皆勤', '30日続けてテストを倒す', 'streak', 30],
  ['daily-1', 'お題クリア', '今日のお題を3つ全部こなす', 'dailies', 1],
  ['daily-10', 'お題の達人', '今日のお題を10日こなす', 'dailies', 10],
  ['kira-10', 'キラキラ', 'キラ以上のシールを10枚開ける', 'kira', 10],
  ['gold-1', '金のシール', '金のシールを開ける', 'gold', 1],
  ['bags-100', '開封の達人', 'シール袋を100開ける', 'opened', 100],
  ['trade-1', '交換所デビュー', '交換所でシールを換える', 'trades', 1],
  ['paste-5', 'ノートを飾る', 'シールをノートに5枚貼る', 'pastes', 5],
  ['set-1', '列コンプ', 'シール帳の列を1つそろえる', 'sets', 1],
  ['title-1', '名乗りを上げる', '手に入れた称号を名乗る', 'titled', 1],
  ['album-half', 'シール帳 はんぶん', 'シール帳を半分うめる', 'album', Math.ceil(ALBUM.length / 2)],
  ['album-full', 'シール帳 コンプリート', 'シール帳をぜんぶうめる', 'album', ALBUM.length],
].map(([id, name, desc, counter, goal]) => ({ id, name, desc, counter, goal }));
// シールを開けて増える数え方（開けた時点で達成する）
const OPENED_COUNTERS = new Set(['kira', 'gold', 'album', 'opened', 'trades', 'pastes', 'sets', 'titled']);

// ---- 日付（遊ぶ人の手元の時刻） ----
const pad = (n) => String(n).padStart(2, '0');
export function localDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(y, m - 1, d + n);
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

// ---- 1つの冒険から: 手柄（deeds）とシール（finds） ----
const questCache = new Map(); // root -> { stamp, value }

function eventsOf(root) {
  const snapshot = inspectLog(root);
  return snapshot.ok ? snapshot.events : snapshot.records.slice(0, snapshot.errors[0]?.seq ?? 0).map(({ event }) => event);
}

/**
 * 1つの冒険の手柄とシール。{ key, root, title, quest_id, head, finished, deeds, finds }。冒険の書が無ければ null。
 * key は冒険の書の genesis のハッシュ（同じフォルダでも、作り直した冒険は別の冒険）
 */
export function questLoot(root) {
  const file = logFile(root);
  let info;
  try {
    info = statSync(file);
  } catch {
    return null;
  }
  const stamp = `${info.size}:${info.mtimeMs}`;
  const cached = questCache.get(root);
  if (cached?.stamp === stamp) return cached.value;
  let value = null;
  try {
    value = lootOf(root, eventsOf(root));
  } catch {
    value = null;
  }
  if (questCache.size > 200) questCache.clear();
  questCache.set(root, { stamp, value });
  return value;
}

function lootOf(root, events) {
  if (events[0]?.type !== 'genesis') return null;
  const c = chronicle(root, events);
  const map = c.state.map;
  const key = events[0].hash;
  const bySeq = new Map(events.map((event) => [event.seq, event]));
  const tsOf = (seq) => bySeq.get(seq)?.ts ?? events[0].ts;
  const hashOf = (seq) => bySeq.get(seq)?.hash ?? '';
  const nameOf = (id) => map.characters.find((ch) => ch.id === id)?.name ?? id ?? null;
  const titleOf = (id) => map.nodes[id]?.title ?? '';
  const deeds = [];
  const deed = (seq, kind, extra = {}) => deeds.push({ seq, ts: tsOf(seq), kind, ...extra });
  const goalSeqs = new Map(c.goals.map((g) => [g.seq, g]));

  for (const event of events) {
    const data = event.data ?? {};
    switch (event.type) {
      case 'genesis': deed(event.seq, 'quest'); break;
      case 'check_passed':
        if (map.nodes[data.node]?.type === 'task') deed(event.seq, 'clear', { node: data.node, character: data.character });
        break;
      case 'check_failed': deed(event.seq, 'fail', { node: data.node, character: data.character }); break;
      case 'gate_failed': deed(event.seq, 'fail', { node: data.gate }); break;
      case 'gate_cleared': {
        const goal = goalSeqs.get(event.seq);
        if (goal) deed(event.seq, 'goal', { node: data.gate, flawless: goal.stats.fails === 0, members: data.members ?? [] });
        else deed(event.seq, 'gate', { node: data.gate, members: data.members ?? [] });
        break;
      }
      case 'stamped': deed(event.seq, 'stamp', { node: data.node, character: data.by }); break;
      case 'note': deed(event.seq, 'note', { character: data.character }); break;
      case 'saved': if (data.commit) deed(event.seq, 'save', { node: data.node ?? null, commit: data.commit }); break;
      case 'pushed': if (data.ok === true) deed(event.seq, 'push', { commit: data.commit ?? null }); break;
      case 'sortie': deed(event.seq, 'sortie', { character: data.character }); break;
      case 'stepped': deed(event.seq, 'step', { node: data.node, character: data.character }); break;
    }
  }
  const perSeq = new Map();
  for (const first of c.firsts) {
    deed(first.seq, 'defeat', { node: first.node, case: first.case, character: first.character, strong: first.strong, losses: first.losses });
    perSeq.set(first.seq, (perSeq.get(first.seq) ?? 0) + 1);
  }
  for (const [seq, n] of perSeq) if (n >= 5) deed(seq, 'combo', { n });
  for (const cure of c.cures) deed(cure.seq, 'cure', { node: cure.node, case: cure.case, character: cure.character });
  for (const incident of c.incidents) {
    if (['medal', 'skill', 'treasure', 'trap'].includes(incident.kind)) {
      const event = bySeq.get(incident.seq);
      deed(incident.seq, incident.kind, { character: incident.character, node: event?.data?.node ?? null, text: incident.kind === 'skill' ? event?.data?.text : undefined });
    }
  }
  const ORDER = ['quest', 'step', 'defeat', 'combo', 'cure', 'clear', 'medal', 'fail', 'gate', 'goal', 'stamp', 'note', 'skill', 'treasure', 'trap', 'save', 'push', 'sortie'];
  deeds.sort((a, b) => a.seq - b.seq || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));

  // シール。1つの冒険の中では seq の順（時刻が戻っても順は崩さない）
  const finds = [];
  let last = '';
  const find = (d, sticker) => {
    const ts = d.ts > last ? d.ts : last;
    last = ts;
    finds.push({ id: `${key.slice(0, 16)}:${d.seq}:${finds.length}`, quest: key, seq: d.seq, ts, who: nameOf(d.character), ...sticker });
  };
  for (const d of deeds) {
    switch (d.kind) {
      case 'defeat': {
        const species = speciesOf(d.case);
        const rarity = monsterRarity(dice(hashOf(d.seq), d.node, d.case), d.strong);
        find(d, { kind: 'monster', species, rarity, slot: `${species}:${rarity}`, node: d.node, case: d.case,
          what: `「${short(d.case)}」を倒した${d.strong ? '（強敵）' : ''}`, where: `${d.node}「${short(titleOf(d.node), 28)}」` });
        break;
      }
      case 'gate': {
        const rarity = dice(hashOf(d.seq), 'boss', d.node) < 0.2 ? 'gold' : 'holo';
        find(d, { kind: 'boss', species: 'dragon', rarity, slot: `dragon:${rarity}`, node: d.node,
          what: `結合ゲート ${d.node} を突破した`, where: `「${short(titleOf(d.node), 32)}」` });
        break;
      }
      case 'goal':
        find(d, { kind: 'maou', species: 'maou', rarity: 'gold', slot: 'maou:gold', node: d.node,
          what: `魔王の城 ${d.node} を落とした（章のあがり）`, where: `「${short(titleOf(d.node), 32)}」` });
        if (d.flawless) find(d, item('shield', '一度も倒れずに章をあがった', d.node));
        break;
      case 'quest': find(d, item('map', `冒険『${short(map.quest.title, 32)}』をはじめた`)); break;
      case 'save': find(d, item('inn', `${d.node ?? 'ふりだし'} でセーブした（commit ${String(d.commit).slice(0, 7)}）`, d.node)); break;
      case 'medal': find(d, item('medal', `${d.node} を一発で抜けた`, d.node)); break;
      case 'cure': find(d, item('potion', `復活した「${short(d.case)}」を倒し直した`, d.node)); break;
      case 'stamp': find(d, item('crown', `${d.node} にハンコを押した`, d.node)); break;
      case 'push': find(d, item('flag', `GitHub に送った${d.commit ? `（commit ${String(d.commit).slice(0, 7)}）` : ''}`)); break;
      case 'combo': find(d, item('sword', `1回の判定で ${d.n} 体まとめて倒した`)); break;
      case 'skill': find(d, item('scroll', `技を覚えた: ${short(d.text, 40)}`, d.node)); break;
      case 'treasure': find(d, item('chest', `判定のほころびを見つけた（${d.node ?? '?'}）`, d.node)); break;
    }
  }
  const goal = map.quest.goal;
  return {
    key, root, title: map.quest.title, quest_id: map.quest.id, head: events.at(-1).seq,
    finished: c.state.nodes[goal]?.cleared === true, deeds, finds,
    characters: map.characters.map(({ id, name }) => ({ id, name })),
  };
}

function item(name, what, node = null) {
  return { kind: 'item', item: name, rarity: ITEMS[name].rarity, slot: name, node, what };
}

// ---- 手帳のファイル（<home>/hero.json） ----
function emptyBook() {
  return { hero: 1, quests: [], opened: {}, opened_global: [], seen: {}, seen_at: {}, achieved: [], rank: 0, pasted: {}, trades: [], title: null, theme: null };
}

export function readHeroBook(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, BOOK), 'utf8'));
    const book = emptyBook();
    if (Array.isArray(value?.quests)) {
      book.quests = value.quests.filter((q) => typeof q?.dir === 'string' && isAbsolute(q.dir)).slice(0, QUEST_MAX * 2);
    }
    for (const field of ['opened', 'seen']) {
      if (value?.[field] && typeof value[field] === 'object' && !Array.isArray(value[field])) {
        book[field] = Object.fromEntries(Object.entries(value[field]).filter(([, n]) => Number.isInteger(n) && n >= 0));
      }
    }
    if (value?.seen_at && typeof value.seen_at === 'object' && !Array.isArray(value.seen_at)) {
      book.seen_at = Object.fromEntries(Object.entries(value.seen_at).filter(([, at]) => typeof at === 'string'));
    }
    for (const field of ['opened_global', 'achieved']) {
      if (Array.isArray(value?.[field])) book[field] = value[field].filter((id) => typeof id === 'string');
    }
    if (Number.isInteger(value?.rank)) book.rank = value.rank;
    if (Array.isArray(value?.trades)) {
      book.trades = value.trades.filter((t) => t && typeof t.from === 'string' && typeof t.to === 'string' && Number.isInteger(t.n) && t.n > 0 && typeof t.at === 'string');
    }
    if (typeof value?.title === 'string') book.title = value.title;
    if (typeof value?.theme === 'string') book.theme = value.theme;
    if (value?.pasted && typeof value.pasted === 'object' && !Array.isArray(value.pasted)) {
      for (const [key, list] of Object.entries(value.pasted)) {
        if (!Array.isArray(list)) continue;
        const ok = list.filter((p) => p && typeof p.slot === 'string' && Number.isInteger(p.page) && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.r));
        if (ok.length) book.pasted[key] = ok.slice(0, PASTE_MAX);
      }
    }
    return book;
  } catch {
    return emptyBook();
  }
}

function writeHeroBook(home, book) {
  mkdirSync(home, { recursive: true });
  const file = join(home, BOOK);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(book, null, 2)}\n`);
  renameSync(temp, file);
}

function recentDirs(home) {
  try {
    const value = JSON.parse(readFileSync(join(home, RECENT), 'utf8'));
    return (Array.isArray(value?.recent) ? value.recent : []).map((item) => item?.dir).filter((dir) => typeof dir === 'string' && isAbsolute(dir));
  } catch {
    return [];
  }
}

/** 手帳がまとめる冒険のフォルダ: いま開いているもの → 手帳が覚えているもの → 最近のフォルダ（冒険の書のあるものだけ） */
export function heroRoots(home, current = []) {
  const seen = new Set();
  const roots = [];
  const book = readHeroBook(home);
  for (const dir of [...current, ...book.quests.map((q) => q.dir), ...recentDirs(home)]) {
    const root = resolve(dir);
    if (seen.has(root)) continue;
    seen.add(root);
    if (existsSync(logFile(root))) roots.push(root);
    if (roots.length >= QUEST_MAX) break;
  }
  return roots;
}

// ---- 手帳（まとめ） ----

/**
 * 勇者の手帳。home: 手帳のファイルを置く場所、current: いま盤面で開いている冒険のフォルダ（無ければ null）。
 * 返すもの: ランク・合計・スタンプカード・今日のお題・シール帳・未開封のシール袋・称号・いまの冒険の「留守のあいだ」
 */
export function heroJournal(home, { current = null, now = new Date() } = {}) {
  return gather(home, { current, now }).journal;
}

/** 手帳のファイル・冒険・まとめ・未開封のシール（全部。古い順）を1度に読む */
function gather(home, { current, now }) {
  const book = readHeroBook(home);
  const roots = heroRoots(home, current ? [current] : []);
  // 同じ冒険（genesis が同じ）を2つの場所から読んだら1つに
  const quests = [];
  const keys = new Set();
  for (const root of roots) {
    const loot = questLoot(root);
    if (!loot || keys.has(loot.key)) continue;
    keys.add(loot.key);
    quests.push(loot);
  }
  const { journal, unopened } = summarize(book, quests, { current: current ? resolve(current) : null, now });
  return { book, quests, journal, unopened };
}

function summarize(book, quests, { current, now }) {
  const today = localDate(now);
  const deeds = quests.flatMap((q) => q.deeds.map((d) => ({ ...d, quest: q.key })));
  deeds.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));

  // 日ごと（スタンプカード・お題）
  const days = new Map();
  const dayOf = (date) => {
    if (!days.has(date)) days.set(date, { defeats: 0, clears: 0, medals: 0, notes: 0, sorties: 0, steps: 0, gates: 0, stamps: 0, played: false, playedAt: null, doneAt: null });
    return days.get(date);
  };
  const COUNT = { defeat: 'defeats', clear: 'clears', medal: 'medals', note: 'notes', sortie: 'sorties', step: 'steps', gate: 'gates', goal: 'gates', stamp: 'stamps' };
  const PLAY = new Set(['defeat', 'clear', 'gate', 'goal', 'stamp']);
  const globals = []; // お題のランタン・皆勤の鐘
  const totals = {
    defeats: 0, clears: 0, medals: 0, gates: 0, goals: 0, stamps: 0, notes: 0, skills: 0, treasures: 0, saves: 0, pushes: 0,
    sorties: 0, steps: 0, quests: 0, cures: 0, combos: 0, strongs: 0, comebacks: 0, night: 0, dawn: 0, weekend: 0,
    flawless: 0, fails: 0, dailies: 0, streak: 0, kira: 0, gold: 0, album: 0, opened: 0, trades: 0, pastes: 0, sets: 0, titled: 0,
  };
  const TOTAL = {
    defeat: 'defeats', clear: 'clears', medal: 'medals', gate: 'gates', goal: 'goals', stamp: 'stamps', note: 'notes', skill: 'skills',
    treasure: 'treasures', save: 'saves', push: 'pushes', sortie: 'sorties', step: 'steps', quest: 'quests', cure: 'cures',
    combo: 'combos', fail: 'fails',
  };
  const achievedAt = new Map();
  const reach = (ts) => {
    for (const a of ACHIEVEMENTS) {
      if (!achievedAt.has(a.id) && !OPENED_COUNTERS.has(a.counter) && totals[a.counter] >= a.goal) achievedAt.set(a.id, ts);
    }
  };
  let xp = 0;
  let streakRun = 0;
  let lastPlayed = null;
  const STREAK_MARKS = [3, 7, 14, 30, 60, 100];
  for (const d of deeds) {
    const date = localDate(d.ts);
    const day = dayOf(date);
    if (COUNT[d.kind]) day[COUNT[d.kind]]++;
    if (TOTAL[d.kind]) totals[TOTAL[d.kind]]++;
    xp += XP[d.kind] ?? 0;
    if (d.kind === 'defeat') {
      if (d.strong) {
        totals.strongs++;
        xp += XP.strong;
      }
      if (d.losses >= 5) totals.comebacks++;
      const t = new Date(d.ts);
      const hour = t.getHours();
      if (hour < 5) totals.night++;
      else if (hour < 8) totals.dawn++;
      if (t.getDay() === 0 || t.getDay() === 6) totals.weekend++;
    }
    if (d.kind === 'goal' && d.flawless) totals.flawless++;
    // その日はじめての手柄で、スタンプカードにハンコ。続いた日数の節目で皆勤の鐘
    if (PLAY.has(d.kind) && !day.played) {
      day.played = true;
      day.playedAt = d.ts;
      streakRun = lastPlayed && addDays(lastPlayed, 1) === date ? streakRun + 1 : 1;
      lastPlayed = date;
      totals.streak = Math.max(totals.streak, streakRun);
      if (STREAK_MARKS.includes(streakRun)) {
        xp += XP.streak;
        globals.push({ id: `streak:${streakRun}:${date}`, quest: null, seq: null, ts: d.ts, who: null, ...item('bell', `${streakRun}日つづけてテストを倒した`) });
      }
    }
    // お題を3つこなした瞬間に、お題のランタン
    if (!day.doneAt && missionsOf(date).every((m) => day[m.key] >= m.goal)) {
      day.doneAt = d.ts;
      totals.dailies++;
      xp += XP.daily;
      globals.push({ id: `daily:${date}`, quest: null, seq: null, ts: d.ts, who: null, ...item('lantern', `${date} のお題を3つこなした`) });
    }
    reach(d.ts);
  }

  // シール（冒険のもの + 日々のもの）。開けたかどうか
  const openedIds = new Set(book.opened_global);
  const all = [];
  for (const q of quests) {
    const n = Math.min(book.opened[q.key] ?? 0, q.finds.length);
    q.finds.forEach((f, i) => all.push({ ...f, title: q.title, opened: i < n, index: i }));
  }
  for (const g of globals) all.push({ ...g, title: null, opened: openedIds.has(g.id), index: null });
  all.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  const opened = all.filter((f) => f.opened);
  const unopened = all.filter((f) => !f.opened);

  // シール帳（開けたものだけが貼られる）
  const owned = new Map();
  for (const f of opened) {
    const slot = owned.get(f.slot) ?? { count: 0, first: null, last: null };
    slot.count++;
    slot.first ??= pick(f);
    slot.last = pick(f);
    owned.set(f.slot, slot);
  }
  // 交換所で換えたシール（古い順に当てる。数が合わない交換は飛ばす）
  const slotInfo = new Map(ALBUM.map((a) => [a.slot, a]));
  let gotKira = opened.filter((f) => f.rarity !== 'normal').length;
  let gotGold = opened.filter((f) => f.rarity === 'gold').length;
  for (const t of book.trades) {
    const from = owned.get(t.from);
    const to = slotInfo.get(t.to);
    if (!from || !to || from.count < t.n + KEEP || upgradeOf(t.from) !== t.to) continue;
    from.count -= t.n;
    totals.trades++;
    const got = pick({
      id: `trade:${t.at}:${t.from}`, kind: to.kind, slot: to.slot, species: to.species ?? null, item: null, rarity: to.rarity,
      what: `交換所で「${SPECIES_JA[slotInfo.get(t.from).species]}（${RARITY_JA[slotInfo.get(t.from).rarity]}）」${t.n}枚と換えた`, ts: t.at, seq: null,
    });
    const slot = owned.get(t.to) ?? { count: 0, first: null, last: null };
    slot.count++;
    slot.first ??= got;
    slot.last = got;
    owned.set(t.to, slot);
    if (to.rarity !== 'normal') gotKira++;
    if (to.rarity === 'gold') gotGold++;
  }
  const ownedCount = (slot) => owned.get(slot)?.count ?? 0;
  // 手に入れた数（交換で手放しても減らない。称号が消えない）
  totals.kira = gotKira;
  totals.gold = gotGold;
  totals.album = ALBUM.filter((a) => ownedCount(a.slot) > 0).length;
  totals.opened = opened.length;
  // ノートに貼ったシール（冒険をまたいで、その枠を持っている数まで）
  const pastedBySlot = new Map();
  const known = new Set(quests.map((q) => q.key));
  for (const [key, list] of Object.entries(book.pasted)) {
    if (!known.has(key)) continue; // 見えなくなった冒険のノートのシールは数えない（はがせないので、貼れる数を減らさない）
    for (const p of list) pastedBySlot.set(p.slot, (pastedBySlot.get(p.slot) ?? 0) + 1);
  }
  const album = ALBUM.map((s) => ({
    ...s, name: s.kind === 'item' ? ITEMS[s.item].name : SPECIES_JA[s.species], rarity_ja: RARITY_JA[s.rarity], lore: LORE[s.kind === 'item' ? s.item : s.species] ?? '',
    how: s.kind === 'item' ? ITEMS[s.item].how : s.kind === 'boss' ? '結合ゲート（中ボス）を突破する' : s.kind === 'maou' ? '章をあがる（魔王の城）' : 'テストを倒す（名前で種類が決まる。レア度はハッシュのサイコロ）',
    count: owned.get(s.slot)?.count ?? 0, first: owned.get(s.slot)?.first ?? null, last: owned.get(s.slot)?.last ?? null,
    pasted: pastedBySlot.get(s.slot) ?? 0, free: Math.max(0, (owned.get(s.slot)?.count ?? 0) - (pastedBySlot.get(s.slot) ?? 0)),
  }));
  for (const a of album) {
    const to = upgradeOf(a.slot);
    a.trade = to ? { to, to_rarity_ja: RARITY_JA[slotInfo.get(to).rarity], n: TRADE_N, keep: KEEP, can: a.free >= TRADE_N + KEEP } : null;
  }
  // 列（種類ごとの4つのレア度・ボス・出来事）をそろえると、コンプの判と経験値
  const sets = [
    ...SPECIES.map((sp) => ({ id: sp, name: SPECIES_JA[sp], slots: album.filter((a) => a.kind === 'monster' && a.species === sp) })),
    { id: 'boss', name: 'ボス', slots: album.filter((a) => a.kind === 'boss' || a.kind === 'maou') },
    { id: 'items', name: '出来事', slots: album.filter((a) => a.kind === 'item') },
  ].map((set) => {
    const owned = set.slots.filter((a) => a.count > 0).length;
    return { id: set.id, name: set.name, owned, total: set.slots.length, done: owned === set.slots.length };
  });
  xp += sets.filter((x) => x.done).length * SET_XP;
  totals.sets = sets.filter((x) => x.done).length;
  totals.pastes = [...pastedBySlot.values()].reduce((n, k) => n + k, 0);
  totals.titled = book.title ? 1 : 0;

  // 称号
  const acked = new Set(book.achieved);
  const achievements = ACHIEVEMENTS.map((a) => {
    const nowValue = Math.min(totals[a.counter] ?? 0, a.goal);
    const done = (totals[a.counter] ?? 0) >= a.goal;
    return { id: a.id, name: a.name, desc: a.desc, goal: a.goal, now: nowValue, done, at: done ? achievedAt.get(a.id) ?? null : null, fresh: done && !acked.has(a.id) };
  });

  // スタンプカード（この90日）と続いた日数
  const played = (date) => days.get(date)?.played === true;
  let streak = 0;
  let cursor = played(today) ? today : addDays(today, -1);
  while (played(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  const calendar = [];
  for (let i = 89; i >= 0; i--) {
    const date = addDays(today, -i);
    const day = days.get(date);
    calendar.push({ date, n: day?.defeats ?? 0, played: day?.played === true, daily: Boolean(day?.doneAt) });
  }

  // 今日のお題
  const todayStats = days.get(today) ?? dayOf(today);
  const missions = missionsOf(today).map((m) => ({ id: m.id, text: m.text, goal: m.goal, now: Math.min(todayStats[m.key] ?? 0, m.goal), done: (todayStats[m.key] ?? 0) >= m.goal }));

  // いまの冒険の「留守のあいだ」（前に読んだ seq より後の手柄）
  let here = null;
  const q = current ? quests.find((x) => resolve(x.root) === current) : null;
  if (q) {
    const seen = book.seen[q.key];
    const fresh = q.deeds.filter((d) => seen === undefined || d.seq > seen);
    const count = (kind) => fresh.filter((d) => d.kind === kind).length;
    const byWho = new Map();
    for (const d of fresh) {
      if (d.kind !== 'defeat') continue;
      const who = q.characters.find((ch) => ch.id === d.character)?.name ?? (d.character || '連携（ボス戦）');
      byWho.set(who, (byWho.get(who) ?? 0) + 1);
    }
    const firstSeen = seen === undefined;
    // 今週のMVP（§79.21）: この7日に、この冒険でいちばんテストを倒した仲間
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const week = new Map();
    for (const d of q.deeds) {
      if (d.kind !== 'defeat' || !d.character || d.ts < weekAgo) continue;
      week.set(d.character, (week.get(d.character) ?? 0) + 1);
    }
    const mvp = [...week].map(([id, n]) => ({ id, name: q.characters.find((ch) => ch.id === id)?.name ?? id, n })).sort((a, b) => b.n - a.n || (a.id < b.id ? -1 : 1));
    const slotOf = new Map(ALBUM.map((a) => [a.slot, a]));
    here = {
      key: q.key, title: q.title, head: q.head, seen: firstSeen ? null : seen, mvp, sortie: lastSortie(q),
      pasted: (book.pasted[q.key] ?? []).filter((p) => slotOf.has(p.slot)).map((p, index) => {
        const a = slotOf.get(p.slot);
        return { index, slot: p.slot, page: p.page, x: p.x, y: p.y, r: p.r, kind: a.kind, species: a.species ?? null, item: a.item ?? null, rarity: a.rarity, name: a.kind === 'item' ? ITEMS[a.item].name : SPECIES_JA[a.species] };
      }),
      since: {
        first: firstSeen,
        from: firstSeen ? null : book.seen_at[q.key] ?? null,
        defeats: count('defeat'), clears: count('clear'), medals: count('medal'), gates: count('gate'), goals: count('goal'),
        fails: count('fail'), stamps: count('stamp'), skills: count('skill'), sorties: count('sortie'),
        bags: unopened.filter((f) => f.quest === q.key && (seen === undefined || f.seq > seen)).length,
        xp: fresh.reduce((sum, d) => sum + (XP[d.kind] ?? 0) + (d.kind === 'defeat' && d.strong ? XP.strong : 0), 0),
        by: [...byWho].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      },
    };
  }

  // 自己ベスト（§79.17）: 1日に倒したテスト（今日を除いた記録も）・1回の判定でまとめて倒した数・続いた日数
  const dayBest = (exclude) => {
    let best = null;
    for (const [date, d] of days) if (date !== exclude && d.defeats > 0 && (!best || d.defeats > best.n)) best = { date, n: d.defeats };
    return best;
  };
  const perEvent = new Map();
  for (const d of deeds) if (d.kind === 'defeat') perEvent.set(`${d.quest}:${d.seq}`, { n: (perEvent.get(`${d.quest}:${d.seq}`)?.n ?? 0) + 1, ts: d.ts });
  const combo = [...perEvent.values()].reduce((a, b) => (b.n > a.n ? b : a), { n: 0, ts: null });
  const records = {
    day: { best: dayBest(null), before: dayBest(today), today: days.get(today)?.defeats ?? 0 },
    combo: { best: combo.n, at: combo.ts },
    streak: totals.streak,
    medals: Math.max(0, ...[...days.values()].map((d) => d.medals)),
  };
  const titled = achievements.find((a) => a.id === book.title && a.done);

  // 次の称号（いちばん近いもの）
  const next = achievements.filter((a) => !a.done && a.now > 0).sort((a, b) => b.now / b.goal - a.now / a.goal || a.goal - b.goal)[0] ?? null;

  const rank = rankOf(xp);
  const journal = {
    ok: true,
    hero: 1,
    today,
    rank,
    rank_seen: book.rank,
    epithet: titled ? { id: titled.id, name: titled.name } : null,
    themes: THEMES.map((t) => ({ ...t, unlocked: rank.level >= t.rank })),
    theme: THEMES.find((t) => t.id === book.theme && rank.level >= t.rank)?.id ?? 'note',
    records,
    totals,
    streak: { current: streak, best: totals.streak, today: played(today) },
    calendar,
    daily: { date: today, missions, done: missions.every((m) => m.done), reward: ITEMS.lantern.name, xp: XP.daily },
    album: { total: ALBUM.length, owned: totals.album, slots: album, sets, set_xp: SET_XP },
    next_achievement: next ? { id: next.id, name: next.name, desc: next.desc, now: next.now, goal: next.goal } : null,
    bags: { count: unopened.length, next: unopened.slice(0, BAG_PREVIEW).map(pick), latest: unopened.slice(-30).map(pick) },
    achievements,
    current: here,
    quests: quests.map((x) => ({ key: x.key, title: x.title, dir: x.root, name: basename(x.root), finished: x.finished, defeats: x.deeds.filter((d) => d.kind === 'defeat').length, bags: unopened.filter((f) => f.quest === x.key).length })),
  };
  return { journal, unopened };
}

/**
 * いまの一連の出撃の戦果（§79.27）: { seq, ts, defeats, clears }。出撃が無ければ null。
 * ダンジョンごとに出撃し直すので、30 分以内に続いた出撃は同じ一連として数える（数がダンジョンごとにふりだしに戻らない）
 */
function lastSortie(q) {
  const sorties = q.deeds.filter((d) => d.kind === 'sortie');
  let i = sorties.length - 1;
  if (i < 0) return null;
  while (i > 0 && new Date(sorties[i].ts) - new Date(sorties[i - 1].ts) < 30 * 60 * 1000) i--;
  const start = sorties[i];
  const after = q.deeds.filter((d) => d.seq > start.seq);
  return { seq: start.seq, ts: start.ts, defeats: after.filter((d) => d.kind === 'defeat').length, clears: after.filter((d) => d.kind === 'clear').length };
}

/** 盤面に出すシール1枚の形 */
function pick(f) {
  return {
    id: f.id, kind: f.kind, slot: f.slot, species: f.species ?? null, item: f.item ?? null, rarity: f.rarity,
    rarity_ja: RARITY_JA[f.rarity],
    name: f.kind === 'item' ? ITEMS[f.item].name : SPECIES_JA[f.species],
    what: f.what, where: f.where ?? null, who: f.who ?? null, title: f.title ?? null, ts: f.ts, seq: f.seq, node: f.node ?? null,
  };
}

/** 手帳が覚える冒険に、いま開いている冒険を足す（新しく見たものが先） */
function remember(book, current) {
  if (!current) return;
  const root = resolve(current);
  const loot = questLoot(root);
  if (!loot) return;
  book.quests = [{ dir: root, key: loot.key, title: loot.title, at: new Date().toISOString() }, ...book.quests.filter((q) => resolve(q.dir) !== root)].slice(0, QUEST_MAX);
}

/**
 * シール袋を開ける（古い順に count 枚）。開けたシールと、開けたあとの手帳を返す。
 * 冒険のシールは「先頭から何枚開けたか」、日々のシールは id で覚える
 */
export function openBags(home, { current = null, count = 1, now = new Date() } = {}) {
  const book = readHeroBook(home);
  remember(book, current);
  const { unopened, journal: before } = gather(home, { current, now });
  const n = Math.max(0, Math.min(Number.isInteger(count) ? count : 1, unopened.length, OPEN_MAX));
  const taken = unopened.slice(0, n);
  for (const f of taken) {
    if (f.index === null) book.opened_global.push(f.id);
    else book.opened[f.quest] = Math.max(book.opened[f.quest] ?? 0, f.index + 1);
  }
  writeHeroBook(home, book);
  const { journal } = gather(home, { current, now });
  // 開ける前にその枠が空で、この中でその枠のいちばん先のものが new
  const had = new Set(before.album.slots.filter((s) => s.count > 0).map((s) => s.slot));
  return { opened: taken.map((f) => {
    const fresh = !had.has(f.slot);
    had.add(f.slot);
    return { ...pick(f), new: fresh };
  }), journal };
}

/** いまの冒険を seq まで（無ければ最後まで）読んだ・称号とランクを見た、と覚える */
export function markSeen(home, { current = null, seq, now = new Date() } = {}) {
  const book = readHeroBook(home);
  remember(book, current);
  const journal = heroJournal(home, { current, now });
  if (journal.current) {
    const head = journal.current.head;
    book.seen[journal.current.key] = Number.isInteger(seq) ? Math.min(seq, head) : head;
    book.seen_at[journal.current.key] = now.toISOString();
  }
  book.achieved = [...new Set([...book.achieved, ...journal.achievements.filter((a) => a.done).map((a) => a.id)])];
  book.rank = journal.rank.level;
  writeHeroBook(home, book);
  return heroJournal(home, { current, now });
}

/**
 * シールをいまの冒険のノートに貼る（§79.11）。page はノートのページ（0 から）、x・y はそのページの中の目、r は傾き（度）。
 * 貼れるのは、開けて持っているシールの数まで（冒険をまたいで数える）
 */
export function pasteSticker(home, { current, slot, page, x, y, r = 0, now = new Date() }) {
  if (!current) throw heroError('E_NO_GAME', '冒険の書がまだありません');
  const book = readHeroBook(home);
  remember(book, current);
  const { journal } = gather(home, { current, now });
  if (!journal.current) throw heroError('E_NO_GAME', '冒険の書がまだありません');
  const s = journal.album.slots.find((a) => a.slot === slot);
  if (!s) throw heroError('E_USAGE', `そのシールはありません: ${slot}`);
  if (s.free < 1) throw heroError('E_HERO', s.count ? `「${s.name}（${s.rarity_ja}）」はもう全部貼ってあります（持っている数 ${s.count}）` : `「${s.name}（${s.rarity_ja}）」はまだ持っていません`);
  if (!Number.isInteger(page) || page < 0 || page > 999) throw heroError('E_USAGE', 'page は 0 以上のページ番号で指定してください');
  if (![x, y, r].every(Number.isFinite) || x < 0 || x > PAGE_W || y < 0 || y > PAGE_H || Math.abs(r) > 30) throw heroError('E_USAGE', 'x・y はページの中、r は -30〜30 で指定してください');
  const key = journal.current.key;
  const list = book.pasted[key] ?? [];
  if (list.length >= PASTE_MAX) throw heroError('E_HERO', `1つのノートに貼れるのは ${PASTE_MAX} 枚までです`);
  const round = (n) => Math.round(n * 100) / 100;
  list.push({ slot, page, x: round(x), y: round(y), r: round(r), at: now.toISOString() });
  book.pasted[key] = list;
  writeHeroBook(home, book);
  return gather(home, { current, now }).journal;
}

/** いまの冒険のノートに貼ったシールをはがす（index は current.pasted の並び） */
export function peelSticker(home, { current, index, now = new Date() }) {
  if (!current) throw heroError('E_NO_GAME', '冒険の書がまだありません');
  const book = readHeroBook(home);
  const { journal } = gather(home, { current, now });
  if (!journal.current) throw heroError('E_NO_GAME', '冒険の書がまだありません');
  const list = book.pasted[journal.current.key] ?? [];
  const shown = list.filter((p) => ALBUM.some((a) => a.slot === p.slot)); // current.pasted と同じ並び
  if (!Number.isInteger(index) || index < 0 || index >= shown.length) throw heroError('E_USAGE', 'はがすシールがありません');
  list.splice(list.indexOf(shown[index]), 1);
  if (list.length) book.pasted[journal.current.key] = list;
  else delete book.pasted[journal.current.key];
  writeHeroBook(home, book);
  return gather(home, { current, now }).journal;
}

function heroError(code, message) {
  return Object.assign(new Error(message), { code });
}

/** 交換所で換えられる先（1つ上のレア度の同じ種類）。無ければ null */
export function upgradeOf(slot) {
  const [species, rarity] = String(slot).split(':');
  if (!rarity) return null;
  const next = RARITIES[RARITIES.indexOf(rarity) + 1];
  if (!next) return null;
  const to = `${species}:${next}`;
  return ALBUM.some((a) => a.slot === to) ? to : null;
}

/** 交換所（§79.16）: そのシールを TRADE_N 枚、1つ上のレア度1枚と換える。換えたシールと手帳を返す */
export function tradeSticker(home, { current = null, slot, now = new Date() }) {
  const book = readHeroBook(home);
  if (current) remember(book, current);
  const before = gather(home, { current, now }).journal;
  const s = before.album.slots.find((a) => a.slot === slot);
  if (!s) throw heroError('E_USAGE', `そのシールはありません: ${slot}`);
  if (!s.trade) throw heroError('E_HERO', `「${s.name}（${s.rarity_ja}）」は交換所で換えられません`);
  if (!s.trade.can) throw heroError('E_HERO', `交換には、貼っていない「${s.name}（${s.rarity_ja}）」が ${TRADE_N + KEEP} 枚要ります（いま ${s.free} 枚）`);
  book.trades.push({ from: slot, to: s.trade.to, n: TRADE_N, at: now.toISOString() });
  writeHeroBook(home, book);
  const journal = gather(home, { current, now }).journal;
  const got = journal.album.slots.find((a) => a.slot === s.trade.to);
  const fresh = !before.album.slots.find((a) => a.slot === s.trade.to)?.count;
  return { got: { ...got.last, new: fresh }, journal };
}

/** 名乗る称号（§79.18）。id は手に入れた称号、null で名乗らない */
export function setTitle(home, { current = null, id, now = new Date() }) {
  const book = readHeroBook(home);
  if (id !== null) {
    const journal = gather(home, { current, now }).journal;
    const a = journal.achievements.find((x) => x.id === id);
    if (!a) throw heroError('E_USAGE', `その称号はありません: ${id}`);
    if (!a.done) throw heroError('E_HERO', `称号「${a.name}」はまだ手に入れていません`);
  }
  book.title = id;
  writeHeroBook(home, book);
  return gather(home, { current, now }).journal;
}

/** ノートの模様（§79.30）。勇者ランクが届いているものだけ */
export function setTheme(home, { current = null, id, now = new Date() }) {
  const t = THEMES.find((x) => x.id === id);
  if (!t) throw heroError('E_USAGE', `その模様はありません: ${id}`);
  const before = gather(home, { current, now }).journal;
  if (before.rank.level < t.rank) throw heroError('E_HERO', `「${t.name}」は勇者ランク ${t.rank} で使えるようになります（いま ${before.rank.level}）`);
  const book = readHeroBook(home);
  book.theme = id;
  writeHeroBook(home, book);
  return gather(home, { current, now }).journal;
}
