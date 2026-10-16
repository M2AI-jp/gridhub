import { readFileSync } from 'node:fs';
import { containedFile } from './paths.js';
import { MasumeError } from './errors.js';

const CHARACTER_ID = /^[a-z][a-z0-9-]{0,23}$/u;
const NODE_ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/u;
const QUEST_ID = /^[A-Z][A-Z0-9]{1,9}$/u;
const JOBS = new Set([
  'hero', 'warrior', 'mage', 'priest', 'thief', 'merchant',
  'sage', 'scribe', 'herald', 'cartographer', 'painter', 'villager',
]);
const COLORS = new Set(['yellow', 'pink', 'green', 'blue', 'orange', 'purple', 'mint', 'gray']);
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value) => typeof value === 'string' && value.trim().length > 0;
const isTitle = (value) => isText(value) && Array.from(value).length <= 80;
const isStrings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');

export function validateMap(map) {
  const errors = [];
  const warnings = [];
  const error = (code, path, message) => errors.push({ code, path, message });
  const format = (path, message) => error('E_FORMAT', path, message);
  const result = () => ({ ok: errors.length === 0, errors, warnings });
  const optional = (object, key, predicate, path) => {
    if (Object.hasOwn(object, key) && !predicate(object[key])) format(`${path}.${key}`, '値の型・形が正しくありません');
  };
  if (!isObject(map)) {
    format('$', '地図はオブジェクトで指定してください');
    return result();
  }
  if (map.masume !== 1) format('masume', 'masume は 1 でなければなりません');
  if (!isObject(map.quest)) format('quest', '冒険の情報がありません');
  else {
    if (typeof map.quest.id !== 'string' || !QUEST_ID.test(map.quest.id)) {
      format('quest.id', '冒険IDは英大文字から始まる2〜10文字の英大文字・数字です');
    }
    if (!isTitle(map.quest.title)) format('quest.title', 'タイトルは1〜80文字です');
    optional(map.quest, 'pitch', (v) => typeof v === 'string', 'quest');
  }
  if (!Array.isArray(map.characters) || map.characters.length === 0) {
    format('characters', 'キャラクターを1人以上、配列で指定してください');
  }
  if (!isObject(map.nodes) || Object.keys(map.nodes).length === 0) {
    format('nodes', 'マスを1つ以上、オブジェクトで指定してください');
  }

  const characters = Array.isArray(map.characters) ? map.characters : [];
  const nodes = isObject(map.nodes) ? map.nodes : {};
  const owners = new Map(Object.keys(nodes).map((id) => [id, []]));
  const edges = new Map(Object.keys(nodes).map((id) => [id, new Set()]));
  const characterIds = new Set();
  characters.forEach((character, index) => {
    const path = `characters[${index}]`;
    if (!isObject(character)) {
      format(path, 'キャラクターはオブジェクトで指定してください');
      return;
    }
    if (typeof character.id !== 'string' || !CHARACTER_ID.test(character.id)) {
      error('E_ID', `${path}.id`, 'キャラクターIDの形が正しくありません');
    }
    if (characterIds.has(character.id)) error('E_DUP_CHAR', `${path}.id`, 'キャラクターIDが重複しています');
    characterIds.add(character.id);
    if (!isText(character.name)) format(`${path}.name`, 'キャラクターの名前が必要です');
    if (!['agent', 'human'].includes(character.kind)) format(`${path}.kind`, 'kind は agent または human です');
    for (const [key, known, code, label] of [
      ['job', JOBS, 'W_JOB', '職業'], ['color', COLORS, 'W_COLOR', '色'],
    ]) {
      if (!isText(character[key])) format(`${path}.${key}`, `${label}を文字列で指定してください`);
      else if (!known.has(character[key])) warnings.push({ code, path: `${path}.${key}`, message: `知らない${label}です: ${character[key]}` });
    }
    optional(character, 'agent', (v) => typeof v === 'string', path);
    optional(character, 'module', (v) => typeof v === 'string', path);
    optional(character, 'territory', isStrings, path);
    if (!Array.isArray(character.path) || character.path.length === 0) {
      format(`${path}.path`, '道は1マス以上の配列で指定してください');
      return;
    }
    const seen = new Set();
    character.path.forEach((id, at) => {
      const location = `${path}.path[${at}]`;
      if (typeof id !== 'string' || !NODE_ID.test(id)) error('E_ID', location, 'マスIDの形が正しくありません');
      if (typeof id !== 'string') return;
      if (seen.has(id)) error('E_DUP_IN_PATH', location, '同じ道に同じマスが2回あります');
      else if (owners.has(id)) owners.get(id).push(index);
      seen.add(id);
      if (!Object.hasOwn(nodes, id)) error('E_UNKNOWN_NODE', location, `マスが存在しません: ${String(id)}`);
      const previous = character.path[at - 1];
      if (at > 0 && edges.has(previous) && edges.has(id)) edges.get(previous).add(id);
    });
  });

  for (const [id, node] of Object.entries(nodes)) {
    const path = `nodes.${id}`;
    const members = owners.get(id);
    if (!NODE_ID.test(id)) error('E_ID', path, 'マスIDの形が正しくありません');
    if (members.length === 0) error('E_ORPHAN', path, 'どの道にも含まれていません');
    if (!isObject(node)) {
      format(path, 'マスはオブジェクトで指定してください');
      continue;
    }
    if (!['task', 'camp', 'gate'].includes(node.type)) format(`${path}.type`, 'type は task / camp / gate のいずれかです');
    if (!isTitle(node.title)) format(`${path}.title`, 'タイトルは1〜80文字です');
    optional(node, 'detail', (v) => typeof v === 'string', path);
    optional(node, 'xp', (v) => Number.isInteger(v) && v >= 0 && v <= 10, path);
    optional(node, 'estimate', (v) => typeof v === 'number' && Number.isFinite(v), path);
    optional(node, 'labels', isStrings, path);
    if (['task', 'camp'].includes(node.type) && members.length > 1) {
      error('E_SHARED_TASK', path, 'task / camp を複数の道で共有できません');
    }
    if (node.type === 'gate' && members.length < 2) error('E_GATE_MEMBERS', path, 'ゲートには2人以上のメンバーが必要です');

    const checkError = (message) => error('E_CHECK', `${path}.check`, message);
    if (node.type === 'camp') {
      if (Object.hasOwn(node, 'check')) checkError('宿屋に判定は置けません');
    } else if (['task', 'gate'].includes(node.type)) {
      const check = node.check;
      if (!isObject(check)) checkError('判定をオブジェクトで指定してください');
      else if (check.kind === 'cmd') {
        if (!isText(check.run)) checkError('判定コマンドが必要です');
        if (Object.hasOwn(check, 'seal') && (!Array.isArray(check.seal)
          || !check.seal.every((file) => containedFile('/', file)))) {
          checkError('seal はルート内の相対ファイルパスの配列です');
        }
      } else if (check.kind === 'stamp') {
        if (node.type !== 'task' || !characters.some((c) =>
          isObject(c) && c.id === check.by && c.kind === 'human')) {
          checkError('ハンコは task に限り、by に人間のキャラクターIDが必要です');
        }
      } else checkError('check.kind は cmd または stamp です');
    }
    if (Object.hasOwn(node, 'rollback_to')) {
      const target = node.rollback_to;
      const validTarget = target === '@camp' || target === '@here'
        || (typeof target === 'string' && members.length > 0 && members.every((index) => {
          const route = characters[index].path;
          const to = route.indexOf(target);
          return to >= 0 && to < route.indexOf(id);
        }));
      if (node.type !== 'task' || !validTarget) {
        error('E_ROLLBACK', `${path}.rollback_to`, '戻り先は task の @camp / @here / 同じ道の前のマスです');
      }
    }
  }

  // 全キャラクターの道をまとめ、ゲートをまたぐ順序の矛盾も調べる。
  const indegrees = new Map(Object.keys(nodes).map((id) => [id, 0]));
  for (const successors of edges.values()) {
    for (const next of successors) indegrees.set(next, indegrees.get(next) + 1);
  }
  const queue = [...indegrees].filter(([, degree]) => degree === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    for (const next of edges.get(queue[i])) {
      indegrees.set(next, indegrees.get(next) - 1);
      if (indegrees.get(next) === 0) queue.push(next);
    }
  }
  if (queue.length !== indegrees.size) error('E_CYCLE', 'characters', '道をつないだグラフに閉路があります');

  const goal = isObject(map.quest) ? map.quest.goal : undefined;
  if (typeof goal !== 'string' || !Object.hasOwn(nodes, goal) || nodes[goal]?.type !== 'gate'
    || characters.length === 0 || characters.some((c) => !Array.isArray(c?.path) || c.path.at(-1) !== goal)) {
    error('E_GOAL', 'quest.goal', 'あがりは全キャラクターの道の最後にあるゲートです');
  }
  return result();
}

export function readMapFile(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new MasumeError('E_INVALID_MAP', `地図を読めません: ${file} (${error.message})`, 1);
  }
}
