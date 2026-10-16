import { MasumeError, validateMap } from '../engine/index.js';

const JOBS = ['hero', 'warrior', 'mage', 'priest', 'thief', 'merchant',
  'sage', 'scribe', 'herald', 'cartographer', 'painter', 'villager'];
const COLORS = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple', 'mint', 'gray'];
const DONE = new Set(['done', 'canceled', 'cancelled', 'completed', 'duplicate']);

function invalid(message) {
  throw new MasumeError('E_INVALID_MAP', message, 1);
}

/** Read quoted commas, escaped quotes and multiline fields without altering their contents. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let state = 'start';
  const source = text.replace(/^\uFEFF/u, '');
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (state === 'quoted') {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') state = 'closed';
      else cell += char;
      continue;
    }
    if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell);
      cell = '';
      state = 'start';
      if (char !== ',') {
        if (char === '\r' && source[i + 1] === '\n') i++;
        rows.push(row);
        row = [];
      }
    } else if (char === '"' && state === 'start') state = 'quoted';
    else {
      if (char === '"' || state === 'closed') invalid('CSV の引用符の位置が不正です');
      cell += char;
      state = 'plain';
    }
  }
  if (state === 'quoted') invalid('CSV の引用符が閉じられていません');
  if (state !== 'start' || row.length > 0 || cell !== '') {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function placeholder(id) {
  return { kind: 'cmd', run: `echo "TODO(GM): ${id} のE2E判定を書く" && exit 1`, seal: [] };
}

/** Linear の CSV を issue の記録（labels は配列）にする。 */
export function recordsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length === 0) invalid('CSV に列名がありません');
  const headers = rows.shift().map((value) => value.trim().toLowerCase());
  const column = (...names) => headers.findIndex((value) => names.includes(value));
  const columns = {
    id: column('id', 'identifier'), title: column('title'), detail: column('description'),
    status: column('status'), assignee: column('assignee'), labels: column('labels'),
    estimate: column('estimate'), created: column('created', 'created at'), project: column('project'),
  };
  if (columns.id < 0 || columns.title < 0) invalid('CSV には ID（または Identifier）と Title 列が必要です');
  return rows.filter((row) => row.some((cell) => cell !== '')).map((row, index) => {
    if (row.length !== headers.length) invalid(`CSV の ${index + 2} 行目の列数が合いません`);
    const record = Object.fromEntries(Object.entries(columns).map(([key, at]) => [key, at < 0 ? '' : row[at]]));
    record.labels = record.labels.split(',').map((value) => value.trim()).filter(Boolean);
    return record;
  });
}

export function importLinear(text, options = {}) {
  return mapFromRecords(recordsFromCsv(text), options);
}

/**
 * issue の記録 { id, title, detail, status, assignee, labels[], estimate, created, project }（文字列）から
 * 地図の下書きを作る。CSV の import と Linear からの pull が同じ規則を使う。
 */
export function mapFromRecords(records, { questId, title } = {}) {
  const active = records.filter((record) => !DONE.has(record.status.trim().toLowerCase()));
  if (active.length === 0) {
    throw new MasumeError('E_NOTHING', '取り込める issue がありません', 1);
  }
  const characters = [];
  const byName = new Map();
  const ids = new Set();
  const hasNameless = active.some((record) => record.assignee.trim() === '');
  for (const record of active) {
    const name = record.assignee.trim();
    if (byName.has(name)) continue;
    const index = characters.length;
    let base = name === '' ? 'nanashi' : name.toLowerCase().replace(/[^a-z0-9]/gu, '').slice(0, 24);
    if (!/^[a-z]/u.test(base)) base = `c${index + 1}`;
    let id = base;
    for (let suffix = 1; ids.has(id) || (name !== '' && hasNameless && id === 'nanashi'); suffix++) {
      const ending = `-${suffix}`;
      id = `${base.slice(0, 24 - ending.length)}${ending}`;
    }
    ids.add(id);
    const character = {
      id, name: name || '名無し', kind: 'agent',
      job: JOBS[index % JOBS.length], color: COLORS[index % COLORS.length], path: [],
    };
    characters.push(character);
    byName.set(name, character);
  }

  const seen = new Set();
  const issues = active.map((record, index) => {
    const id = record.id.trim();
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/u.test(id)) invalid(`マスIDの形が不正です: ${id}`);
    if (seen.has(id)) invalid(`マスIDが重複しています: ${id}`);
    seen.add(id);
    const created = record.created.trim() === '' ? 0 : Date.parse(record.created);
    if (!Number.isFinite(created)) invalid(`${id} の Created が日時ではありません`);
    const labels = record.labels;
    const fullTitle = record.title.trim() === '' ? id : record.title;
    const titlePoints = [...fullTitle];
    const node = {
      type: 'task', title: titlePoints.slice(0, 80).join(''),
      detail: titlePoints.length > 80
        ? `${fullTitle}${record.detail ? `\n\n${record.detail}` : ''}` : record.detail,
      labels, check: placeholder(id),
    };
    if (record.estimate.trim() !== '') {
      node.estimate = Number(record.estimate);
      if (!Number.isFinite(node.estimate)) invalid(`${id} の Estimate が数値ではありません`);
    }
    return {
      id, node, created, index, owner: byName.get(record.assignee.trim()),
      number: BigInt(id.match(/\d+$/u)?.[0] ?? id.match(/\d+/u)?.[0] ?? '0'),
      wantsGate: labels.some((label) => /^(e2e|gate)$/iu.test(label)),
    };
  }).sort((a, b) => a.created - b.created
    || (a.number < b.number ? -1 : a.number > b.number ? 1 : 0) || a.index - b.index);

  const priorTasks = [];
  const nodes = Object.create(null);
  for (const issue of issues) {
    let members = new Set([issue.owner]);
    if (issue.wantsGate) {
      for (const task of priorTasks) {
        if (task.created < issue.created) members.add(task.owner);
      }
    }
    if (members.size >= 2) issue.node.type = 'gate';
    else {
      members = new Set([issue.owner]);
      priorTasks.push(issue);
    }
    nodes[issue.id] = issue.node;
    for (const character of members) character.path.push(issue.id);
  }
  let goal = 'GOAL';
  for (let suffix = 1; Object.hasOwn(nodes, goal); suffix++) goal = `GOAL-${suffix}`;
  nodes[goal] = { type: 'gate', title: 'あがり', check: placeholder(goal) };
  for (const character of characters) character.path.push(goal);
  const normalizedQuestId = (questId ?? records[0].id.trim().split('-')[0])
    .toUpperCase().replace(/[^A-Z0-9]/gu, '').replace(/^[0-9]+/u, '').slice(0, 10);
  const projectTitle = title ?? (records[0].project || 'インポートした冒険');
  const map = {
    masume: 1,
    quest: {
      id: normalizedQuestId.length >= 2 ? normalizedQuestId : 'QUEST',
      title: [...(projectTitle.trim() === '' ? 'インポートした冒険' : projectTitle)].slice(0, 80).join(''),
      pitch: `完了・取消済みなどの issue を ${records.length - active.length} 件省きました。判定は GM が作成してください。`,
      goal,
    },
    characters, nodes,
  };
  const result = validateMap(map);
  if (!result.ok) {
    invalid(`地図の下書きを検証できません:\n${result.errors.map(({ code, path, message }) => `[${code}] ${path}: ${message}`).join('\n')}`);
  }
  return map;
}
