// gridhub me — 勇者の手帳（CONTRACTS §76.6）。ランク・続いた日数・今日のお題・シール帳・称号を、ターミナルで見る。
// 読むだけ（シール袋は盤面の「手帳」で開ける。開ける楽しみはとっておく）。
import { resolve } from 'node:path';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { heroJournal } from '../engine/hero.js';
import { appHome } from '../engine/home.js';

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
  const { rank, streak, daily, album, bags, achievements, totals } = journal;
  const done = achievements.filter((a) => a.done);
  console.log(`勇者の手帳 — ランク ${rank.level}「${rank.title}」${journal.epithet ? `（称号「${journal.epithet.name}」）` : ''}`);
  console.log(`  経験値 ${rank.xp}  ${bar(rank.into, rank.need)} 次のランクまで ${rank.next - rank.xp}`);
  console.log(`  倒したテスト ${totals.defeats} / ダンジョン ${totals.clears} / 結合ゲート ${totals.gates} / あがり ${totals.goals} / メダル ${totals.medals}`);
  const fire = streak.current > 0 ? `${streak.current}日つづけて${streak.today ? '' : '（今日はまだ。1件倒すと続く）'}` : '今日から始めよう';
  console.log(`  スタンプカード: ${fire}（いちばん長く ${streak.best}日）`);
  const r = journal.records;
  if (r.day.best) console.log(`  自己ベスト: 1日に ${r.day.best.n}件（${r.day.best.date}）・1回の判定で ${r.combo.best}体・今日 ${r.day.today}件`);
  console.log('');
  console.log(`今日のお題（${daily.date}）${daily.done ? ' — ぜんぶこなした！' : ''}`);
  for (const m of daily.missions) console.log(`  ${m.done ? '☑' : '☐'} ${m.text}  ${m.now}/${m.goal}`);
  if (!daily.done) console.log(`  3つこなすと「${daily.reward}」のシールと 経験値 ${daily.xp}`);
  console.log('');
  console.log(`シール帳 ${album.owned}/${album.total}${bags.count ? `  — 未開封のシール袋 ${bags.count}（盤面の「手帳」で開けられる）` : ''}`);
  console.log(`称号 ${done.length}/${achievements.length}`);
  const latest = done.filter((a) => a.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 3);
  for (const a of latest) console.log(`  ★ ${a.name} — ${a.desc}`);
  const close = achievements.filter((a) => !a.done && a.now > 0).sort((a, b) => b.now / b.goal - a.now / a.goal).slice(0, 3);
  for (const a of close) console.log(`  ☆ ${a.name} — ${a.desc}  ${a.now}/${a.goal}`);
  if (journal.current?.since && !journal.current.since.first && journal.current.since.defeats > 0) {
    console.log('');
    console.log(`この冒険で前に見てから: テスト ${journal.current.since.defeats} 件・シール袋 ${journal.current.since.bags}`);
  }
  return 0;
}
