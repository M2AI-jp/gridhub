import { brief } from '../engine/brief.js';
import { MARK } from '../engine/cases.js';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { marginText } from '../engine/margins.js';
import { localTime, recordLine } from '../engine/record.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx);
  if (command.args.length !== 1) usage('つかいかた: brief <characterId> [--json]');
  const report = brief(gameRoot(command), command.args[0]);
  if (command.options.json) {
    console.log(JSON.stringify(report));
    return 0;
  }
  const statuses = { working: '作業中', waiting: 'ゲートで待機中', done: 'あがり' };
  const c = report.character;
  const node = report.current;
  const kind = node === null ? 'done' : node.type === 'gate' ? 'gate' : node.check?.kind === 'stamp' ? 'stamp' : node.type === 'task' ? 'dungeon' : 'other';
  console.log(`指令書: ${c.name}（${c.id} / ${c.kind}）`);
  console.log(`${c.name}（${c.id}）… ${report.generation}代目 / ちいさなメダル ${report.medals}`);
  console.log(`${c.max_level ? `Lv${c.level}（最大）` : `Lv${c.level} / 経験値 ${c.xp}/${c.xp_next}`} / 視界 ${c.vision}マス先 / ${statuses[c.status]}`);
  console.log(`担当: ${c.module ?? '指定なし'}`);
  console.log(`縄張り: ${c.territory.join('、') || '指定なし'}`);
  if (report.sortie) console.log(`出撃中: ${report.sortie.agent}（seq ${report.sortie.seq} から）`);
  if (node) {
    console.log(`現在のマス: ${node.id}「${node.title}」（${node.type}）`);
    if (node.detail) console.log(node.detail);
    if (node.check?.kind === 'cmd') console.log(`判定: ${node.check.run}`);
    if (node.check?.kind === 'stamp') console.log(`判定: ${node.check.by} のハンコ（判定コマンドは無い。人間が中身を確かめて押す）`);
    console.log(`封印: ${node.seal_broken ? '封印が破れています' : node.sealed ? '封印済み' : '未封印'}`);
    if (node.rollback_to) console.log(`失敗時の戻り先: ${node.rollback_to}`);
    if (kind === 'dungeon' && node.check?.kind === 'cmd') {
      console.log(`テスト ${report.cases.filter((t) => t.ok === true).length}/${report.cases.length}`);
      for (const t of report.cases) console.log(`  ${MARK[t.ok]} ${t.name}`);
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
  if (report.margin) {
    const nameOf = (id) => (id === c.id ? c.name : report.party.find((p) => p.id === id)?.name ?? id);
    const [heading, ...lines] = marginText(report.margin, nameOf);
    // 瓦版の1行目は本人がマスを抜けた号外（本人はもう知っている）。指令書には製品の分野の話題だけを見せる
    const shown = report.margin.kind === 'news' ? lines.slice(1) : lines;
    if (shown.length > 0) {
      console.log(`道の余白（いちばん新しい出来事）: ${heading}`);
      for (const line of shown) console.log(`  ${line}`);
    }
  }
  if (report.visible.length === 0) console.log(`視界に入っている先のマス: （なし${report.fog > 0 ? '。この先は霧' : '。この先にマスはない'}）`);
  else {
    console.log('視界に入っている先のマス:');
    for (const ahead of report.visible) console.log(`  ${ahead.id}「${ahead.title}」（${ahead.type}）`);
  }
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
  if (report.notes.length === 0) console.log('自分の日誌（新しい順）: （まだない）');
  else {
    console.log('自分の日誌（新しい順）:');
    for (const note of report.notes) console.log(`  seq ${note.seq} ${localTime(note.ts)}: ${note.text}`);
  }
  // 進み方は、マスの種類で変わる（ハンコのマスに「歩く」は無い）
  if (kind === 'dungeon') {
    console.log('歩き方:');
    console.log(`  歩く（何度でも・記録される・罰なし）: gridhub step ${c.id}`);
    console.log(`  宣言（一発勝負）: gridhub check ${c.id}`);
    console.log(`  日誌: gridhub note ${c.id} "…"`);
  } else if (kind === 'stamp') {
    console.log('進み方:');
    console.log(`  ハンコ（中身を確かめてから）: gridhub stamp ${node.id} --as ${node.check.by}（盤面の「ハンコを押す」でも同じ）`);
    console.log(`  日誌: gridhub note ${c.id} "…"`);
  } else if (kind === 'gate') {
    console.log('進み方:');
    console.log(`  仲間がそろうとボス戦（結合テスト）が自動で始まる。手で始めるなら: gridhub check ${node.id}`);
    console.log(`  日誌: gridhub note ${c.id} "…"`);
  } else if (kind === 'done') {
    console.log('進み方: あがり。この地図でやることは、もうない');
  }
  console.log('守ること:');
  for (const rule of report.rules) console.log(`  ${rule}`);
  console.log(recordLine(report));
  return 0;
}
