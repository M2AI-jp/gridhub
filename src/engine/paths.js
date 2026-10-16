import { existsSync } from 'node:fs';
import { dirname, isAbsolute, normalize, relative, resolve, sep, win32 } from 'node:path';

export function logFile(root) {
  return resolve(root, '.masume', 'log.jsonl');
}

export function findRoot(startDir) {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(logFile(current))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

// 地図の seal はゲームルート、map_file/output は .masume からの相対パス。
export function containedFile(base, file) {
  if (typeof file !== 'string' || !file || file.includes('\0')
    || isAbsolute(file) || win32.isAbsolute(file)) return null;
  const normalized = normalize(file);
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) return null;
  const target = resolve(base, file);
  const rel = relative(resolve(base), target);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null;
  return target;
}
