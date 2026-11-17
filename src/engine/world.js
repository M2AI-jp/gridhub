// 世界への重ね書き（CONTRACTS §83 / overlay v1）。進み具合の正本はログと凍結地図だけ。
import {
  linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync,
  renameSync, rmSync, unwatchFile, watchFile, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { MasumeError } from './errors.js';
import { inspectLog, requireHealthy } from './store.js';
import { buildView } from './view.js';
import { chronicle } from './chronicle.js';
import { globToRegExp } from './save.js';
import { resolveWords, t } from './words.js';

export const WORLD_LIMITS = Object.freeze({ bytes: 1_000_000, markers: 2000, people: 100, label: 60, lines: 6, line: 80 });
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const worldError = message => new MasumeError('E_WORLD', message);
const relativePath = p => typeof p === 'string' && p.length > 0 && !/^(?:\/|[a-z][a-z\d+.-]*:)/iu.test(p)
  && !/[\\\0\r\n]/u.test(p) && !p.split('/').some(part => ['..', '.', ''].includes(part));
const inside = (root, file) => {
  const rel = relative(root, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith(sep));
};

function projectName(root) {
  try {
    const name = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).name;
    if (typeof name === 'string' && name.trim()) return name;
  } catch { /* package.json が無ければフォルダの名前 */ }
  return basename(resolve(root));
}

/** 初回だけ種を決める。同時に開いても、完成した設定を1つだけ置く。壊れた設定は直さない。 */
export function worldSeed(root) {
  const file = join(root, '.masume', 'world.json');
  const read = () => {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || Array.isArray(value) || typeof value.seed !== 'string' || !value.seed.trim()) {
      throw worldError(t('world.seed.invalid'));
    }
    return value.seed;
  };
  try { return read(); } catch (error) {
    if (error.code !== 'ENOENT') throw worldError(t('world.seed.read', error.message));
  }
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(temp, json({ seed: projectName(root) }), { flag: 'wx' });
    try { linkSync(temp, file); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    return read();
  } catch (error) {
    throw worldError(t('world.seed.read', error.message));
  } finally {
    rmSync(temp, { force: true });
  }
}

export function readAdventure(root) {
  const dir = resolve(root);
  const snapshot = inspectLog(dir);
  requireHealthy(snapshot);
  return { dir, view: buildView(dir, snapshot), map: chronicle(dir, snapshot.events).state.map };
}

/** check.run の文字列を実行せず、リテラルのファイル引数だけを読む。 */
export function runPaths(run = '') {
  const tokens = String(run).match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s;&|<>]+/gu) || [];
  const skip = new Set(['--test-name-pattern', '--test-skip-pattern', '-e', '--eval', '-p', '--print']);
  const paths = [];
  for (let i = 0; i < tokens.length; i++) {
    let token = tokens[i];
    if (skip.has(token)) { i++; continue; }
    if (token.startsWith('-') || /^[A-Za-z_]\w*=/u.test(token)) continue;
    token = token.replace(/^(['"])(.*)\1$/su, '$2').replace(/^\.\//u, '');
    if (relativePath(token) && /\.[a-z\d]+$/iu.test(token)) paths.push(token);
  }
  return paths;
}

function existingFile(dir, path) {
  if (!relativePath(path)) return false;
  try {
    const real = realpathSync(join(dir, path));
    return inside(realpathSync(dir), real) && lstatSync(real).isFile();
  } catch { return false; }
}

function representativeFiles(dir, groups) {
  const patterns = groups.map(g => ({ id: g.id, patterns: g.paths.map(globToRegExp) }));
  const files = new Set(), visited = new Set();
  // 地区の先勝ちを保つ。シンボリックリンク・記録・依存パッケージには降りない。
  const scan = path => {
    if (visited.has(path) || path.split('/').some(p => ['.git', '.masume', 'node_modules', '.cache'].includes(p))) return;
    visited.add(path);
    let stat;
    try { stat = lstatSync(join(dir, path)); } catch { return; }
    if (stat.isSymbolicLink()) return;
    if (stat.isFile()) { files.add(path); return; }
    if (!stat.isDirectory()) return;
    for (const entry of readdirSync(join(dir, path))) scan(path ? `${path}/${entry}` : entry);
  };
  for (const group of groups) for (const glob of group.paths) {
    const at = glob.search(/[*?{]/u);
    const prefix = at === -1 ? glob : glob.slice(0, at);
    const root = at === -1 ? prefix : prefix.endsWith('/') ? prefix.slice(0, -1) : dirname(prefix);
    scan(root === '.' ? '' : root);
  }
  const result = new Map();
  for (const path of [...files].sort()) {
    const owner = patterns.find(g => g.patterns.some(p => p.test(path)))?.id;
    if (owner && !result.has(owner)) result.set(owner, path);
  }
  return result;
}

function taskState(node) {
  const cases = node.cases || [];
  if (cases.some(c => c.ok === false)) return 'failed';
  if (cases.length && cases.every(c => c.ok === true)) return 'passed';
  if (node.state === 'cleared') return 'passed';
  return 'unverified';
}
const testsOf = node => node.tests ?? {
  pass: (node.cases || []).filter(c => c.ok === true).length, total: (node.cases || []).length,
};

/** 上限は Unicode コードポイントと、実際に書く UTF-8 のバイト数で数える。診断は別ファイルへ。 */
export function boundOverlay(raw, initialDiagnostics = []) {
  const overlay = structuredClone(raw);
  const diagnostics = [...initialDiagnostics];
  const omitted = (id, reason) => diagnostics.push({ id, reason });
  const clip = (value, max, id) => {
    const text = String(value).replace(/[\r\n\0]/gu, ' ');
    const points = [...text];
    if (points.length <= max) return text;
    omitted(id, t('world.limit.text', max));
    return points.slice(0, max - 1).join('') + '…';
  };
  const content = (item, id, key = 'label') => {
    item[key] = clip(item[key], WORLD_LIMITS.label, id);
    if (item.lines) {
      if (item.lines.length > WORLD_LIMITS.lines) omitted(id, t('world.limit.lines'));
      item.lines = item.lines.slice(0, WORLD_LIMITS.lines).map(line => clip(line, WORLD_LIMITS.line, id));
    }
  };
  for (const g of overlay.groups) content(g, `group:${g.id}`);
  if (overlay.title) {
    overlay.title.text = clip(overlay.title.text, WORLD_LIMITS.label, 'title');
    overlay.title.sub = clip(overlay.title.sub, WORLD_LIMITS.line, 'title');
  }
  for (const key of ['markers', 'people']) {
    for (const item of overlay[key].slice(WORLD_LIMITS[key])) omitted(item.id, t('world.limit.count', key, WORLD_LIMITS[key]));
    overlay[key] = overlay[key].slice(0, WORLD_LIMITS[key]);
    for (const item of overlay[key]) content(item, item.id, key === 'people' ? 'name' : 'label');
  }
  if (overlay.goal) content(overlay.goal, overlay.goal.id);
  const groups = new Map(raw.people.map(p => [p.id, p._group]));
  for (const person of overlay.people) delete person._group;
  const references = () => {
    const ids = new Set(overlay.markers.map(m => m.id));
    for (const p of overlay.people) if (p.at.marker && !ids.has(p.at.marker)) p.at = { group: groups.get(p.id) };
  };
  references();
  // seed と groups は町の配置を決める。大きくても削って先勝ちの意味を変えない。
  const fixed = { ...overlay, markers: [], people: [] };
  delete fixed.title;
  delete fixed.goal;
  if (Buffer.byteLength(json(fixed)) > WORLD_LIMITS.bytes) throw worldError(t('world.limit.base'));
  let bytes = Buffer.byteLength(json(overlay));
  while (bytes > WORLD_LIMITS.bytes) {
    // 余分な大きさに応じて末尾を落とし、大きな入力でも再シリアライズの回数を抑える。
    const key = overlay.markers.length ? 'markers' : overlay.people.length ? 'people' : null;
    if (key) {
      const remove = Math.max(1, Math.floor(overlay[key].length * (bytes - WORLD_LIMITS.bytes) / bytes));
      for (const item of overlay[key].splice(-remove)) omitted(item.id, t('world.limit.bytes'));
      references();
    } else if (overlay.goal) {
      omitted(overlay.goal.id, t('world.limit.bytes'));
      delete overlay.goal;
    } else if (overlay.title) {
      omitted('title', t('world.limit.bytes'));
      delete overlay.title;
    } else throw worldError(t('world.limit.base'));
    bytes = Buffer.byteLength(json(overlay));
  }
  return { overlay, diagnostics };
}

export function adventureOverlay({ dir, map, view }, { seed = worldSeed(dir) } = {}) {
  const groups = map.characters.map(c => ({ id: c.id, label: c.name, paths: (c.territory || []).map(p => p.replace(/^\.\//u, '')) }));
  for (const group of groups) if (!group.paths.every(relativePath)) throw worldError(t('world.group.invalid', group.id));
  const reps = representativeFiles(dir, groups);
  const tasks = Object.values(view.nodes).filter(n => n.type === 'task').sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  const used = new Set(map.characters.map(c => c.id));
  const unique = wanted => {
    let id = wanted;
    while (used.has(id)) id = `marker-${id}`;
    used.add(id);
    return id;
  };
  // 通過した task の ID も予約する。記録が進んでも、ほかの物の ID は変わらない。
  const taskIds = new Map(tasks.map(n => [n.id, unique(n.id)]));
  const markers = [], diagnostics = [];
  for (const node of tasks) {
    const state = taskState(node);
    if (state === 'passed') continue;
    const id = taskIds.get(node.id);
    const path = reps.get(node.owner) || runPaths(node.check?.run).find(p => existingFile(dir, p));
    const at = node.check?.kind === 'stamp' ? { landmark: 'town_hall' } : path ? { path } : null;
    if (!at) {
      diagnostics.push({ id, reason: t('world.unplaced') });
      continue;
    }
    const tests = testsOf(node), cases = node.cases || [];
    const first = cases.find(c => c.ok === false) || cases.find(c => c.ok !== true);
    const lines = [t('brief.tests', tests.pass, tests.total)];
    if (node.check?.kind === 'stamp') lines.push(t('brief.check.stamp', node.check.by));
    else if (first) lines.push(t('step.next', first.name));
    else if (!tests.total) lines.push(t('brief.tests.unknown').trim());
    markers.push({ id, kind: 'record', state, at, label: `${node.id} ${node.title}`, lines });
  }
  for (const c of map.characters) {
    const own = tasks.filter(n => n.owner === c.id);
    markers.push({
      id: unique(`board-${c.id}`), kind: 'board', at: { group: c.id }, label: t('world.board', c.name),
      lines: [t('world.passed', own.filter(n => taskState(n) === 'passed').length, own.length),
        t('brief.tests', own.reduce((s, n) => s + testsOf(n).pass, 0), own.reduce((s, n) => s + testsOf(n).total, 0))],
    });
  }
  const markerIds = new Set(markers.map(m => m.id));
  const people = view.characters.map((c, look) => {
    const node = view.nodes[c.at], current = taskIds.get(c.at);
    const lines = [node ? t('brief.current', node.id, node.title, t(node.type === 'gate' ? 'gate' : node.type === 'camp' ? 'town' : 'dungeon')) : t('brief.current.done')];
    if (node?.type === 'task') {
      const next = node.cases?.[c.square];
      lines.push(next ? t('step.next', next.name) : node.cases?.length ? t('brief.next.all') : t('brief.tests.unknown').trim());
    } else lines.push(t(`status.${c.status}`));
    return { id: c.id, name: c.name, at: markerIds.has(current) ? { marker: current } : { group: c.id }, look, lines, _group: c.id };
  });
  const goal = view.nodes[map.quest.goal], tests = testsOf(goal);
  return boundOverlay({
    version: 1, source: { tool: 'gridhub', name: 'GridHub', seq: view.head.seq }, seed, groups,
    title: { text: map.quest.title, sub: t('brief.tests', view.bestiary.defeated, view.bestiary.total) },
    markers, people,
    goal: { id: unique('goal'), at: { landmark: 'town_hall' }, look: 'castle', label: t('goal'),
      lines: [`${map.quest.goal}: ${goal.title}`, t('brief.tests', tests.pass, tests.total)] },
  }, diagnostics);
}

// 存在しない出力先でも、親ディレクトリのリンクを解いて正本との重なりを調べる。
function physicalPath(file) {
  try { return realpathSync(file); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return join(physicalPath(dirname(file)), basename(file));
  }
}

function writeAtomic(file, value) {
  const text = json(value);
  try { if (readFileSync(file, 'utf8') === text) return; } catch { /* 初回 */ }
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, text, { flag: 'wx' });
    renameSync(temp, file);
  } finally { rmSync(temp, { force: true }); }
}

export function writeWorldOverlay(root, out = join(root, '.masume', 'world-overlay.json'), options = {}) {
  try {
    const target = resolve(out), physical = physicalPath(target);
    const records = physicalPath(resolve(root, '.masume'));
    if (inside(records, physical) && physical !== join(records, 'world-overlay.json')) throw worldError(t('world.out.invalid'));
    resolveWords({ root, env: options.env, flag: options.words });
    const { overlay, diagnostics } = adventureOverlay(readAdventure(root));
    writeAtomic(join(root, '.masume', 'world-overlay.diagnostics.json'), diagnostics);
    writeAtomic(target, overlay);
    return overlay;
  } catch (error) {
    if (error instanceof MasumeError) throw error;
    throw worldError(t('world.write.failed', error.message));
  }
}

/** rename によるログの置換にも追随。壊れた記録では直前の正常な overlay を保持する。 */
export function watchWorldOverlay(root, out, { onError = () => {}, ...options } = {}) {
  const update = () => {
    try { writeWorldOverlay(root, out, options); } catch (error) { onError(error); }
  };
  const files = ['log.jsonl', 'words.json', 'world.json'].map(name => join(root, '.masume', name));
  for (const file of files) watchFile(file, { interval: 250, persistent: false }, update);
  update(); // 初回の書き出しから監視登録までの変更も拾う
  return () => { for (const file of files) unwatchFile(file, update); };
}
