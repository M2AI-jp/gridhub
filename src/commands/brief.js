import { brief } from '../engine/brief.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { marginText } from '../engine/margins.js';
import { recordLine } from '../engine/record.js';
import { t } from '../engine/words.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  if (command.args.length !== 1) usage('つかいかた: brief <characterId> [--json]');
  const report = brief(gameRoot(command), command.args[0]);
  if (command.options.json) {
    console.log(JSON.stringify(report));
    return 0;
  }
  const status = (s) => t(`status.${s}`);
  const c = report.character;
  console.log(t('brief.head', c.name, c.id, c.kind));
  console.log(t('brief.gen', c.name, c.id, report.generation, report.medals));
  console.log(t('brief.level', c.max_level ? t('level.max', c.level) : t('level.xp', c.level, c.xp, c.xp_next), c.vision, status(c.status)));
  console.log(t('brief.module', c.module ?? t('brief.none')));
  console.log(t('brief.territory', c.territory.join('、') || t('brief.none')));
  if (report.sortie) console.log(t('brief.sortie', report.sortie.agent, report.sortie.seq));
  if (report.current) {
    const node = report.current;
    console.log(t('brief.current', node.id, node.title, node.type));
    if (node.detail) console.log(node.detail);
    if (node.check?.kind === 'cmd') console.log(t('brief.check', node.check.run));
    if (node.check?.kind === 'stamp') console.log(t('brief.check.stamp', node.check.by));
    console.log(t('brief.seal', node.seal_broken ? t('seal.broken') : node.sealed ? t('seal.ok') : t('seal.none')));
    if (node.rollback_to) console.log(t('brief.rollback', node.rollback_to));
    if (node.type === 'task' && node.check?.kind === 'cmd') {
      const mark = { true: '✔', false: '✖', null: '・' };
      console.log(t('brief.tests', report.cases.filter((x) => x.ok === true).length, report.cases.length));
      for (const x of report.cases) console.log(`  ${mark[x.ok]} ${x.name}`);
      if (report.cases.length === 0) console.log(t('brief.tests.unknown'));
      console.log(report.next_case !== null ? t('brief.next', report.next_case)
        : report.cases.length ? t('brief.next.all') : t('brief.next.first'));
    }
  } else console.log(t('brief.current.done'));
  if (report.skills.length === 0) console.log(t('brief.skills.none'));
  else {
    console.log(t('brief.skills'));
    for (const skill of report.skills) console.log(t('brief.skill', skill.text, skill.node, skill.case, skill.seq));
  }
  if (report.grave) console.log(t('brief.grave', report.grave.command, report.grave.node));
  if (report.save === 'git') console.log(t('brief.save'));
  if (report.margin) {
    const nameOf = (id) => (id === c.id ? c.name : report.party.find((p) => p.id === id)?.name ?? id);
    const [heading, ...lines] = marginText(report.margin, nameOf);
    // 瓦版の1行目は本人がマスを抜けた号外（本人はもう知っている）。指令書には製品の分野の話題だけを見せる
    const shown = report.margin.kind === 'news' ? lines.slice(1) : lines;
    if (shown.length > 0) {
      console.log(t('brief.margin', heading));
      for (const line of shown) console.log(`  ${line}`);
    }
  }
  console.log(t('brief.visible'));
  for (const node of report.visible) console.log(`  ${node.id}「${node.title}」（${node.type}）`);
  console.log(t('brief.fog', report.fog));
  console.log(t('brief.party'));
  for (const member of report.party) {
    console.log(`  ${member.name}（${member.id}）: ${member.at ?? t('goal')} / ${status(member.status)} / Lv${member.level}`);
  }
  if (c.status === 'waiting') {
    console.log(report.waiting_for.length
      ? t('brief.waiting', report.waiting_for.map((id) => report.party.find((p) => p.id === id)?.name ?? id).join('、'))
      : t('brief.ready'));
  }
  console.log(t('brief.notes'));
  for (const note of report.notes) console.log(`  seq ${note.seq} ${note.ts}: ${note.text}`);
  console.log(t('brief.how'));
  console.log(t('brief.how.step', c.id));
  console.log(t('brief.how.check', c.id));
  console.log(t('brief.how.note', c.id));
  console.log(t('brief.rules'));
  for (const rule of report.rules) console.log(`  ${rule}`);
  console.log(recordLine(report));
  return 0;
}
