import { buildView } from '../engine/index.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { latestMargin, marginText } from '../engine/margins.js';
import { recordLine } from '../engine/record.js';
import { requireHealthy } from '../engine/store.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: status [--json]');
  const view = buildView(gameRoot(command));
  requireHealthy(view.integrity);
  if (options.json) console.log(JSON.stringify(view));
  else {
    console.log(t('status.title', view.quest.title, view.map_version));
    for (const character of view.characters) {
      // あがった人は「あがり」を1回だけ（場所と状態が同じ語なので。§78.5）
      const where = character.at === null ? [t('goal')]
        : [`${character.at}「${view.nodes[character.at].title}」`, t(`status.${character.status}`)];
      const level = character.max_level ? t('status.level.max', character.level) : t('status.level.xp', character.level, character.xp, character.xp_next);
      console.log(t('status.line', character.name, where.join(' / '), level, character.clears, character.fails));
    }
    const margin = latestMargin(view.margins);
    if (margin) {
      const nameOf = (id) => view.characters.find((c) => c.id === id)?.name ?? id;
      const [heading, ...lines] = marginText(margin, nameOf);
      console.log(t('status.margin', nameOf(margin.road), heading));
      for (const line of lines) console.log(`  ${line}`);
    }
    if (view.push) {
      const p = view.push;
      console.log(p.ok ? t('status.push.ok', p.remote, p.branch, String(p.commit).slice(0, 7)) : t('status.push.ng', p.error));
    }
    if (view.finished) console.log('この章はあがり（エンディングは盤面の「🏁 エンディング」で読める）');
    console.log(recordLine(view.head));
  }
  return 0;
}
