// 遊ぶ人の置き場所（CONTRACTS §68.1・§79）。最近のフォルダ（recent.json）と勇者の手帳（hero.json）を置く。
// 起動役（src/server/app.js）と勇者の手帳（hero.js）が同じ場所を使う。
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/** GRIDHUB_APP_HOME → macOS は ~/Library/Application Support/GridHub、ほかは XDG（~/.config/gridhub） */
export function appHome(env = process.env) {
  if (env.GRIDHUB_APP_HOME) return resolve(env.GRIDHUB_APP_HOME);
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'GridHub');
  return join(env.XDG_CONFIG_HOME ? resolve(env.XDG_CONFIG_HOME) : join(homedir(), '.config'), 'gridhub');
}
