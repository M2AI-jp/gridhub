// 絵の目録（CONTRACTS §80.13）。ドカポン4の戦闘画面の質で描き直した絵。載っていないものは march-art.js の前の絵で描く。
import { buildPlace } from './places.js';
import ogre from './mobs/ogre.js';
import goblin from './mobs/goblin.js';
import ooze from './mobs/ooze.js';

const tryImport = async (p) => { try { return (await import(p)).default; } catch { return null; } };
const JOBS = ['hero', 'sage', 'scribe', 'herald', 'priest', 'mage', 'cartographer', 'painter', 'villager'];

/** 職業 → 人物（32×28、足もと ax/ay、idle0〜cheer1） */
export const CREW = {};
for (const j of JOBS) { const m = await tryImport(`./chars/${j}.js`); if (m) CREW[j] = m; }
/** 札の顔: 新しい絵の人物は、全身をそのまま札に出す（march-art.js の bust が使う） */
export const BUSTS = {};
const bat = await tryImport('./mobs/bat.js');
const skeleton = await tryImport('./mobs/skeleton.js');
/** 敵の種類 → 絵（地図の種類名に、描き直した敵を当てる） */
export const MOBS = { slime: ooze, mushroom: goblin, imp: goblin, ...(bat ? { bat, ghost: bat } : {}), ...(skeleton ? { skeleton } : {}) };
/** 強いテストの敵は、どの種類でも大鬼 */
export const STRONG = { slime: ogre, mushroom: ogre, imp: ogre, bat: ogre, ghost: ogre, skeleton: ogre };
/** 門番・魔王 */
export const BOSSES = {};
const golem = await tryImport('./mobs/golem.js');
const demon = await tryImport('./mobs/demon.js');
if (golem) BOSSES.golem = golem;
if (demon) BOSSES.demon = demon;
/** 場所（レーンの舞台） */
export const SCENES = Object.fromEntries(['village1', 'village2', 'village3', 'forest1', 'forest2', 'fields1', 'fields2', 'meadow1', 'meadow2'].map((id) => [id, { id, build: (h) => buildPlace(id, h) }]));
/** 職業 → 場所 */
export const SCENE_OF = { sage: 'village1', scribe: 'forest1', herald: 'fields1', priest: 'meadow1', mage: 'village2', cartographer: 'forest2', painter: 'fields2', hero: 'village3', villager: 'meadow2', merchant: 'village2', warrior: 'forest1' };
export const ALIAS = { merchant: 'villager', warrior: 'hero' };
