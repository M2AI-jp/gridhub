// 余白のマス（CONTRACTS §53）。開発に関係する、良い余白: 別の担当との会話・町の住人との雑談・瓦版。
// 進みを止めない（判定も罰もない）。出来事は冒険の書と地図に本当にあることからだけ作る。
import { commitOfEvent } from './store.js';

const NPC = '宿屋の主人';
const EXTRAS = 20; // 瓦版に載せる号外の数

/** 再生（replay）の before / after で、駒が進んだイベントと、号外になるイベントを覚える */
export function marginTracker() {
  let positions = null;
  const moves = []; // {character, from, to, path, event}
  const extras = []; // {event, node, title}
  return {
    moves,
    extras,
    before(state) {
      positions = Object.fromEntries(Object.entries(state.characters).map(([id, character]) => [id, character.pos]));
    },
    after(state, event) {
      for (const [id, character] of Object.entries(state.characters)) {
        const from = positions?.[id];
        if (from === undefined || character.pos <= from) continue;
        const path = state.map.characters.find((definition) => definition.id === id)?.path ?? [];
        moves.push({ character: id, from, to: character.pos, path, event });
      }
      if (event.type === 'check_passed' || event.type === 'gate_cleared') {
        const node = event.data?.gate ?? event.data?.node;
        extras.push({ event, node, title: state.map.nodes[node]?.title ?? '' });
      }
    },
  };
}

/** 余白を置く所（§53.2）: 各キャラクターの道で、task か camp のすぐ後（道の最後と gate の後には置かない） */
function slots(map) {
  const out = [];
  for (const character of map.characters) {
    character.path.forEach((id, index) => {
      const node = map.nodes[id];
      const next = map.nodes[character.path[index + 1]];
      if (!next || !['task', 'camp'].includes(node?.type)) return;
      const kind = node.type === 'camp' ? 'npc' : next.type === 'gate' ? 'talk' : 'news';
      out.push({ character, index, after: id, next: character.path[index + 1], kind });
    });
  }
  return out;
}

const okCount = (list) => (Array.isArray(list) ? list.filter((c) => c?.ok === true).length : 0);
const testsOf = (data, node) => {
  const list = data?.cases?.[node];
  return Array.isArray(list) ? `（テスト ${okCount(list)}/${list.length}）` : '';
};
/** 日誌の1行目（80字を超えたら79字と …） */
const firstLine = (text) => {
  const line = String(text ?? '').trim().split(/\r?\n/u)[0].trim();
  const chars = Array.from(line);
  return chars.length > 80 ? `${chars.slice(0, 79).join('')}…` : line;
};

/**
 * ビューの margins と news（§53.4）。
 * map は今の地図、state は再生の最後、events は再生した冒険の書、tracker は marginTracker()。
 */
export function buildMargins({ map, state, events, tracker }) {
  const nameOf = (id) => map.characters.find((c) => c.id === id)?.name ?? id;
  const titleOf = (id) => map.nodes[id]?.title ?? '';
  const quests = Array.isArray(map.quest.news) ? map.quest.news : [];

  // seq ごとの「その記録までに見えていたコミット」（§52.3 と同じ規則）
  const commitAt = new Map();
  let latest = null;
  for (const event of events) {
    latest = commitOfEvent(event) ?? latest;
    commitAt.set(event.seq, latest);
  }
  const notes = new Map(); // キャラクターID → [{seq, text}]（古い順）
  for (const event of events) {
    if (event.type !== 'note' || typeof event.data?.character !== 'string') continue;
    if (!notes.has(event.data.character)) notes.set(event.data.character, []);
    notes.get(event.data.character).push({ seq: event.seq, text: event.data.text });
  }
  const noteBefore = (id, seq) => {
    const list = notes.get(id) ?? [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i].seq <= seq) return list[i];
    return null;
  };

  let newsIndex = 0;
  const margins = slots(map).map(({ character, index, after, next, kind }) => {
    const name = character.name;
    let title;
    let partner = null;
    if (kind === 'news') title = '瓦版';
    else if (kind === 'npc') title = `${titleOf(after)} の住人`;
    else {
      partner = map.characters.find((c) => c.id !== character.id && c.path.includes(next)) ?? null;
      title = partner ? `${name} と ${partner.name}` : name;
    }
    const k = kind === 'news' ? newsIndex++ : null;
    const margin = { id: `m-${after}`, road: character.id, after, kind, title, lines: [], seq: null, commit: null };

    // 起きる（§53.3）: 今の位置が X より先。出典は、位置が X 以下から X より先へ移った最後のイベント
    if ((state.characters[character.id]?.pos ?? 0) <= index) return margin;
    const move = tracker.moves.findLast((m) => {
      if (m.character !== character.id) return false;
      const at = m.path.indexOf(after);
      return at !== -1 && m.from <= at && m.to > at;
    });
    if (!move) return margin;
    const source = move.event;
    margin.seq = source.seq;
    margin.commit = commitAt.get(source.seq) ?? null;

    if (kind === 'news') {
      margin.lines.push({ who: null, text: `号外: ${name} が ${after}「${titleOf(after)}」を抜けた${testsOf(source.data, after)}` });
      if (quests.length > 0) margin.lines.push({ who: null, text: quests[k % quests.length] });
    } else if (kind === 'npc') {
      const cases = source.data?.cases;
      const passed = cases && typeof cases === 'object'
        ? Object.values(cases).reduce((sum, list) => sum + okCount(list), 0)
        : Array.isArray(source.data?.ran) ? source.data.ran.length : 0;
      margin.lines.push({ who: NPC, text: `${name}さん、おつかれさま。テスト ${passed} 件、通ってきたね` });
      const saved = events.find((e) => e.seq > source.seq && e.type === 'saved' && e.data?.node === after
        && typeof e.data.commit === 'string' && e.data.commit && (e.data.characters ?? []).includes(character.id));
      if (saved) {
        margin.lines.push({ who: NPC, text: `セーブは commit ${saved.data.commit.slice(0, 7)}。変えたファイルは ${(saved.data.files ?? []).length} 件` });
        margin.commit = saved.data.commit;
      }
    } else {
      for (const who of [character.id, partner?.id].filter(Boolean)) {
        const note = noteBefore(who, source.seq);
        if (note) margin.lines.push({ who, text: firstLine(note.text) });
      }
      if (margin.lines.length === 0) {
        margin.lines.push({
          who: null,
          text: partner ? `${name} と ${partner.name} が ${titleOf(next)} の前で顔を合わせた` : `${name} が ${titleOf(next)} の前に着いた`,
        });
      }
    }
    return margin;
  });

  // 瓦版（§53.4）: 地図の話題、そのあとに号外を新しい順に
  const extras = tracker.extras.slice(-EXTRAS).reverse().map(({ event, node, title }) => {
    const data = event.data ?? {};
    const text = event.type === 'gate_cleared'
      ? `号外: ${(data.members ?? []).map(nameOf).join('、')} が ${node}「${map.nodes[node]?.title ?? title}」を突破した`
      : `号外: ${nameOf(data.character)} が ${node}「${map.nodes[node]?.title ?? title}」を抜けた${testsOf(data, node)}`;
    return { text, kind: 'extra', seq: event.seq };
  });
  const news = [...quests.map((text) => ({ text, kind: 'domain', seq: null })), ...extras];
  return { margins, news };
}

/** 起きた余白のうち、いちばん新しいもの。characterId を渡せば、その人の道か、その人が話している余白だけ */
export function latestMargin(margins, characterId = null) {
  let found = null;
  for (const margin of margins ?? []) {
    if (margin.seq === null) continue;
    if (characterId !== null && margin.road !== characterId && !margin.lines.some(({ who }) => who === characterId)) continue;
    if (found === null || margin.seq >= found.seq) found = margin;
  }
  return found;
}

/** 余白を短い字に（指令書・status・MCP 向け）。1行目は見出し、あとは1行ずつ */
export function marginText(margin, nameOf = (id) => id) {
  const kinds = { talk: '会話', npc: '町の住人', news: '瓦版' };
  return [
    `${kinds[margin.kind] ?? margin.kind}「${margin.title}」（${margin.after} のあと・seq ${margin.seq}）`,
    ...margin.lines.map(({ who, text }) => `${who === null ? '' : `${nameOf(who)}: `}${text}`),
  ];
}
