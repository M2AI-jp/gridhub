import { MasumeError } from './errors.js';
import { latestMargin } from './margins.js';
import { inspectLog, requireHealthy } from './store.js';
import { buildView } from './view.js';

export function brief(root, characterId) {
  const view = buildView(root);
  requireHealthy(view.integrity);
  const character = view.characters.find(({ id }) => id === characterId);
  if (!character) throw new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${characterId}`);
  const current = character.at === null ? null : view.nodes[character.at];
  const visibleIds = character.path.slice(character.pos + 1, character.pos + 1 + character.vision);
  const notes = inspectLog(root).events
    .filter((event) => event.seq <= view.head.seq
      && event.type === 'note' && event.data.character === characterId)
    .slice(-5).reverse().map(({ seq, ts, data }) => ({ seq, ts, text: data.text }));
  return {
    seq: view.head.seq,
    commit: view.head.commit,
    character: {
      id: character.id, name: character.name, kind: character.kind,
      module: character.module ?? null, territory: character.territory ?? [],
      level: character.level, xp: character.xp, xp_next: character.xp_next, max_level: character.max_level,
      vision: character.vision, status: character.status,
    },
    current: current === null ? null : {
      id: current.id, type: current.type, title: current.title,
      detail: current.detail ?? null, check: current.check ?? null,
      sealed: current.sealed, seal_broken: current.seal_broken,
      rollback_to: current.rollback_to ?? null,
    },
    visible: visibleIds.map((id) => ({
      id, type: view.nodes[id].type, title: view.nodes[id].title,
    })),
    fog: Math.max(0, character.path.length - character.pos - 1 - visibleIds.length),
    party: view.characters.filter(({ id }) => id !== characterId)
      .map(({ id, name, at, status, level }) => ({ id, name, at, status, level })),
    waiting_for: current?.type === 'gate' && character.status === 'waiting'
      ? current.members.filter((id) => {
        const member = view.characters.find((c) => c.id === id);
        return member.at !== current.id || member.status !== 'waiting';
      }) : [],
    sortie: character.sortie,
    generation: character.generation,
    cases: current?.cases ?? [],
    next_case: character.square === null ? null : current.cases[character.square]?.name ?? null,
    square: character.square,
    skills: character.skills,
    medals: character.medals,
    grave: character.grave && { ...character.grave, command: `git stash apply ${character.grave.stash}` },
    save: view.quest.save ?? null,
    margin: latestMargin(view.margins, characterId),
    notes,
    rules: rulesFor(current),
  };
}

/** 守ること。ダンジョン（判定のあるマス）・ハンコのマス・ゲートで待っているとき・あがりで、言うことが違う */
function rulesFor(node) {
  const common = ['現在のマスだけをやる', '自分の縄張りの中だけを編集する', '判定ファイルと地図を変更しない'];
  if (node === null) return ['あがり。この地図でやることは、もうない'];
  if (node.type === 'gate') return ['仲間がそろうとボス戦（結合テスト）が自動で始まる。待っているあいだ、縄張りのファイルを変えない', ...common.slice(1)];
  if (node.type === 'task' && node.check?.kind === 'stamp') {
    return [...common, 'ファイルの中身を自分の目で確かめてからハンコを押す（ハンコは判定ではなく、人間の判断の記録）', '日誌で進行を冒険の書に記録する'];
  }
  return [
    '1マスずつ: いちばん手前の落ちているテストだけを通して、gridhub step で確かめる',
    ...common,
    '判定コマンドを自分で走らせ、結果を確認する',
    '宣言判定と日誌で進行を冒険の書に記録する',
  ];
}
