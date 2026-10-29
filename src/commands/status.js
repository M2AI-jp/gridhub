import { buildView } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { latestMargin, marginText } from '../engine/margins.js';
import { recordLine } from '../engine/record.js';
import { requireHealthy } from '../engine/store.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: status [--json]');
  const view = buildView(gameRoot(command));
  requireHealthy(view.integrity);
  if (options.json) console.log(JSON.stringify(view));
  else {
    const statuses = { working: '作業中', waiting: 'ゲートで待機中', done: 'あがり' };
    console.log(`${view.quest.title}（地図の版 ${view.map_version}）`);
    for (const character of view.characters) {
      // あがった人は「あがり」を1回だけ（場所と状態が同じ語なので）
      const where = character.at === null ? ['あがり']
        : [`${character.at}「${view.nodes[character.at].title}」`, statuses[character.status]];
      const level = character.max_level ? `Lv${character.level}（最大）` : `Lv${character.level} 経験値 ${character.xp}/${character.xp_next}`;
      console.log(`${character.name}: ${[...where, level, `成功 ${character.clears}・失敗 ${character.fails}`].join(' / ')}`);
    }
    const margin = latestMargin(view.margins);
    if (margin) {
      const nameOf = (id) => view.characters.find((c) => c.id === id)?.name ?? id;
      const [heading, ...lines] = marginText(margin, nameOf);
      console.log(`道の余白: ${nameOf(margin.road)} の道で ${heading}`);
      for (const line of lines) console.log(`  ${line}`);
    }
    if (view.push) {
      const p = view.push;
      console.log(p.ok
        ? `GitHub: 送った（${p.remote} ${p.branch}・commit ${String(p.commit).slice(0, 7)}）`
        : `GitHub: 送れなかった（${p.error}）。gridhub push でもう一度送れる`);
    }
    if (view.finished) console.log('この章はあがり（エンディングは盤面の「🏁 エンディング」で読める）');
    console.log(recordLine(view.head));
  }
  return 0;
}
