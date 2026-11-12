// gridhub me — 勇者の手帳（CONTRACTS §79.6）。ランク・続いた日数・今日のお題・シール帳・称号を、ターミナルで見る。
// 読むだけ（シール袋は盤面の「手帳」で開ける。開ける楽しみはとっておく）。
import { resolve } from 'node:path';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { heroJournal } from '../engine/hero.js';
import { appHome } from '../engine/home.js';
import { isDev } from '../engine/words.js';

const bar = (now, all, width = 20) => {
  const n = all > 0 ? Math.round((Math.min(now, all) / all) * width) : 0;
  return `[${'#'.repeat(n)}${'.'.repeat(width - n)}]`;
};

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { home: 'string' });
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: me [--dir D] [--home D] [--json]');
  const home = options.home !== undefined ? resolve(command.cwd, options.home) : appHome(command.env);
  const journal = heroJournal(home, { current: gameRoot(command, { optional: true }) });
  if (options.json) {
    console.log(JSON.stringify(journal));
    return 0;
  }
  const dev = isDev();
  const pair = (game, other) => (dev ? other : game);
  const said = (o, key) => (dev ? o.dev?.[key] ?? o[key] : o[key]);
  const { rank, streak, daily, album, bags, achievements, totals } = journal;
  const done = achievements.filter((a) => a.done);
  console.log(`${pair('勇者の手帳', '手帳')} — ランク ${rank.level}「${said(rank, 'title')}」${journal.epithet ? `（${pair('称号', '実績')}「${said(journal.epithet, 'name')}」）` : ''}`);
  console.log(`  ${pair('経験値', 'XP')} ${rank.xp}  ${bar(rank.into, rank.need)} 次のランクまで ${rank.next - rank.xp}`);
  console.log(dev
    ? `  通ったテスト ${totals.defeats} / タスク ${totals.clears} / 結合テスト ${totals.gates} / 完了した章 ${totals.goals} / 一発合格 ${totals.medals} / 起動 ${totals.sorties}`
    : `  倒したテスト ${totals.defeats} / ダンジョン ${totals.clears} / 結合ゲート ${totals.gates} / あがり ${totals.goals} / メダル ${totals.medals} / 出撃 ${totals.sorties}`);
  const fire = streak.current > 0 ? `${streak.current}日${pair('つづけて', '連続')}${streak.today ? '' : pair('（今日はまだ。1件倒すと続く）', '（今日はまだ。1件通すと続く）')}` : '今日から始めよう';
  console.log(`  ${pair('スタンプカード', '活動カレンダー')}: ${fire}（いちばん長く ${streak.best}日）`);
  const r = journal.records;
  if (r.day.best) console.log(`  自己ベスト: 1日に ${r.day.best.n}件（${r.day.best.date}）・1回の判定で ${r.combo.best}${pair('体', '件')}・今日 ${r.day.today}件`);
  console.log('');
  console.log(`${pair('今日のお題', '今日の目標')}（${daily.date}）${daily.done ? pair(' — ぜんぶこなした！', ' — ぜんぶ達成！') : ''}`);
  for (const m of daily.missions) console.log(`  ${m.done ? '☑' : '☐'} ${said(m, 'text')}  ${m.now}/${m.goal}`);
  if (!daily.done) console.log(`  3つ${pair('こなす', '達成する')}と「${said(daily, 'reward')}」のシールと ${pair('経験値', 'XP')} ${daily.xp}`);
  console.log('');
  console.log(`シール帳 ${album.owned}/${album.total}${bags.count ? `  — 未開封のシール袋 ${bags.count}（盤面の「手帳」で開けられる）` : ''}`);
  console.log(`${pair('称号', '実績')} ${done.length}/${achievements.length}`);
  const latest = done.filter((a) => a.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 3);
  for (const a of latest) console.log(`  ★ ${said(a, 'name')} — ${said(a, 'desc')}`);
  const close = achievements.filter((a) => !a.done && a.now > 0).sort((a, b) => b.now / b.goal - a.now / a.goal).slice(0, 3);
  for (const a of close) console.log(`  ☆ ${said(a, 'name')} — ${said(a, 'desc')}  ${a.now}/${a.goal}`);
  if (journal.current?.since && !journal.current.since.first && journal.current.since.defeats > 0) {
    console.log('');
    console.log(`${pair('この冒険で', 'このプロジェクトで')}前に見てから: テスト ${journal.current.since.defeats} 件・シール袋 ${journal.current.since.bags}`);
  }
  return 0;
}
