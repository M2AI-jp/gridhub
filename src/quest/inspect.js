// GM が書いた quest.map.json の検査。地図の検査そのものは engine の validateMap に任せ、
// 語り部は「パーティが止まらずに進めるか」（最初のマスの判定が封印できるか）だけを足して見る。
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';
import { validateMap } from '../engine/index.js';

export const MAP_FILE = 'quest.map.json';

const line = ({ code, path, message }) => `[${code}] ${path}: ${message}`;

/** ルートの中の相対パスか（封印するファイルとして使えるか） */
function insideRoot(file) {
  if (typeof file !== 'string' || !file || file.includes('\0') || isAbsolute(file)) return false;
  const normalized = normalize(file);
  return normalized !== '..' && !normalized.startsWith(`..${sep}`) && normalized !== '.';
}

/**
 * root/quest.map.json を調べる。
 *  - missing: ファイルが無い
 *  - errors:  始められない理由（validateMap のエラー、JSON が読めない、封印の場所が不正）。行は `[CODE] path: message`
 *  - warnings: 始められるが、パーティが止まりやすい理由（各エージェントの最初の task の判定ファイルが無い）
 *  - map: 読めた地図
 */
export function inspectMap(root) {
  const file = join(root, MAP_FILE);
  if (!existsSync(file) || !statSync(file).isFile()) return { missing: true, errors: [], warnings: [], map: null };

  let map;
  try {
    map = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return { missing: false, errors: [`[E_FORMAT] $: ${MAP_FILE} を JSON として読めません（${error.message}）`], warnings: [], map: null };
  }

  const result = validateMap(map);
  const errors = result.errors.map(line);
  if (!result.ok) return { missing: false, errors, warnings: [], map };

  const warnings = [];
  for (const [id, node] of Object.entries(map.nodes)) {
    const seals = node.check?.seal ?? [];
    seals.forEach((entry, index) => {
      if (!insideRoot(entry)) {
        errors.push(`[E_SEAL_PATH] nodes.${id}.check.seal[${index}]: 「${entry}」はルートからの相対パスで、ルートの外に出ない場所にしてください`);
      }
    });
  }
  if (errors.length > 0) return { missing: false, errors, warnings, map };

  for (const character of map.characters) {
    if (character.kind !== 'agent') continue;
    const first = character.path.find((id) => map.nodes[id]?.type === 'task');
    if (!first) continue;
    const node = map.nodes[first];
    if (node.check?.kind !== 'cmd') continue;
    const missing = (node.check.seal ?? []).filter((entry) => !existsSync(join(root, entry)));
    for (const entry of missing) {
      warnings.push(`[W_SEAL_FILE] nodes.${first}.check.seal: ${entry} がありません（${character.id} の道の最初の task の判定ファイルは必ず書いてください）`);
    }
  }
  return { missing: false, errors, warnings, map };
}
