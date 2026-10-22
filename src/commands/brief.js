import { brief } from '../engine/brief.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  if (command.args.length !== 1) usage('つかいかた: brief <characterId> [--json]');
  const root = gameRoot(command);
  const report = brief(root, command.args[0]);
  if (command.options.json) {
    console.log(JSON.stringify(report));
    return 0;
  }
  const statuses = { working: '作業中', waiting: 'ゲートで待機中', done: 'あがり' };
  const c = report.character;
  console.log(`指令書: ${c.name}（${c.id} / ${c.kind}）`);
  console.log(`${c.name}（${c.id}）… ${report.generation}代目 / ちいさなメダル ${report.medals}`);
  console.log(`Lv${c.level} / 経験値 ${c.xp}/${c.xp_next} / 視界 ${c.vision}マス先 / ${statuses[c.status]}`);
  console.log(`担当: ${c.module ?? '指定なし'}`);
  console.log(`縄張り: ${c.territory.join('、') || '指定なし'}`);
  if (report.sortie) console.log(`出撃中: ${report.sortie.agent}（seq ${report.sortie.seq} から）`);
  if (report.current) {
    const node = report.current;
    console.log(`現在のマス: ${node.id}「${node.title}」（${node.type}）`);
    if (node.detail) console.log(node.detail);
    if (node.check?.kind === 'cmd') console.log(`判定: ${node.check.run}`);
    if (node.check?.kind === 'stamp') console.log(`判定: ${node.check.by} のハンコ`);
    console.log(`封印: ${node.seal_broken ? '封印が破れています' : node.sealed ? '封印済み' : '未封印'}`);
    if (node.rollback_to) console.log(`失敗時の戻り先: ${node.rollback_to}`);
    if (node.type === 'task' && node.check?.kind === 'cmd') {
      const mark = { true: '✔', false: '✖', null: '・' };
      console.log(`テスト ${report.cases.filter((t) => t.ok === true).length}/${report.cases.length}`);
      for (const t of report.cases) console.log(`  ${mark[t.ok]} ${t.name}`);
      if (report.cases.length === 0) console.log('  ？ まだ一度も歩いていない（中の分からないダンジョン）');
      console.log(report.next_case !== null ? `いま戦うテスト: ${report.next_case}`
        : report.cases.length ? '全部倒した。出口で宣言する' : 'いま戦うテスト: まず歩いて、テストを見る');
    }
  } else console.log('現在のマス: あがり');
  if (report.skills.length === 0) console.log('技（受け継いだもの）: まだない');
  else {
    console.log('技（受け継いだもの）:');
    for (const skill of report.skills) console.log(`  ・${skill.text}（${skill.node} の「${skill.case}」を倒して / seq ${skill.seq}）`);
  }
  if (report.grave) console.log(`墓: ${report.grave.command}（${report.grave.node} で負けたときの変更）`);
  if (report.save === 'git') console.log('セーブ: 町に着くと、縄張りの変更が Git にコミットされる');
  console.log('視界に入っている先のマス:');
  for (const node of report.visible) console.log(`  ${node.id}「${node.title}」（${node.type}）`);
  console.log(`霧の中: ${report.fog}マス`);
  console.log('仲間:');
  for (const member of report.party) {
    console.log(`  ${member.name}（${member.id}）: ${member.at ?? 'あがり'} / ${statuses[member.status]} / Lv${member.level}`);
  }
  if (c.status === 'waiting') {
    console.log(report.waiting_for.length
      ? `待っている仲間: ${report.waiting_for.map((id) => report.party.find((p) => p.id === id)?.name ?? id).join('、')}`
      : '仲間が全員揃っています');
  }
  console.log('自分の日誌（新しい順）:');
  for (const note of report.notes) console.log(`  seq ${note.seq} ${note.ts}: ${note.text}`);
  console.log('歩き方:');
  console.log(`  歩く（何度でも・記録される・罰なし）: gridhub step ${c.id}`);
  console.log(`  宣言（一発勝負）: gridhub check ${c.id}`);
  console.log(`  日誌: gridhub note ${c.id} "…"`);
  console.log('守ること:');
  for (const rule of report.rules) console.log(`  ${rule}`);
  console.log(recordLine(root, report));
  return 0;
}
