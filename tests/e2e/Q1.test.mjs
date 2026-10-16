// Q1「願いから地図を生む」— CONTRACTS §14 の masume quest（偽の GM で判定する）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmp, masume, masumeEnv, view, readLog, fakeGm } from '../helpers2.mjs';

const WISH = 'メモアプリのようなアプリを作りたい';
const quest = (args, env = {}) => masumeEnv(['quest', ...args], { cwd: tmp('masume-cwd-'), env });

test('願いから地図が生まれ、冒険が始まる', async () => {
  const root = join(tmp('masume-quest-'), 'memo'); // まだ無いフォルダ
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(r.code, 0, r.all);
  assert.match(r.all, /ふっかつのじゅもん/);
  assert.match(r.all, /masume party/);
  assert.match(r.all, /masume serve/);
  assert.match(readFileSync(join(root, 'WISH.md'), 'utf8'), new RegExp(WISH));
  assert.ok(existsSync(join(root, 'quest.map.json')));
  assert.match(readFileSync(join(root, 'quest.log'), 'utf8'), /偽のGM/);
  assert.equal(masume(['validate', join(root, 'quest.map.json')]).code, 0);
  const v = view(root);
  assert.equal(v.quest.id, 'MEMO');
  assert.equal(v.nodes.T1.sealed, true, 'GM が書いた判定ファイルは自動で封印');
  const log = readLog(root);
  assert.equal(log[0].type, 'genesis');
  const wish = log.find((e) => e.type === 'wish');
  assert.deepEqual(wish.data, { text: WISH, gm: 'cmd', model: null });
  assert.equal(masume(['verify', '--dir', root]).code, 0);

  // GM へのプロンプトと環境変数
  const prompt = readFileSync(join(root, 'gm-prompt-1.txt'), 'utf8');
  for (const w of [WISH, 'GM の仕事は2つだけです', 'quest.map.json', 'cartographer', 'E_GATE_MEMBERS', 'アプリそのものは実装しない']) assert.ok(prompt.includes(w), `プロンプトに「${w}」`);
  const env = JSON.parse(readFileSync(join(root, 'gm-env-1.json'), 'utf8'));
  assert.equal(env.MASUME_WISH, WISH);
  assert.equal(env.MASUME_DIR, root);
  assert.match(env.MASUME_BIN, /bin\/masume\.js$/);
  assert.equal(readFileSync(env.MASUME_PROMPT_FILE, 'utf8'), prompt);

  // もう冒険がある所では始めない
  const again = await quest([WISH, '--dir', root, '--gm', fakeGm('good')]);
  assert.equal(again.code, 2, again.all);
  assert.match(again.all, /E_EXISTS/);
});

test('GM の地図が壊れていたら、エラーを見せて直させる', async () => {
  const root = tmp('masume-quest-');
  const r = await quest([WISH, '--dir', root, '--gm', fakeGm('bad-then-good')]);
  assert.equal(r.code, 0, r.all);
  const prompts = readdirSync(root).filter((f) => f.startsWith('gm-prompt-')).sort();
  assert.equal(prompts.length, 2, 'GM は2回呼ばれる');
  const second = readFileSync(join(root, prompts[1]), 'utf8');
  assert.match(second, /E_GOAL/);
  assert.match(second, /quest\.map\.json を直して/);
  assert.equal(view(root).quest.goal, 'FIN');

  const root2 = tmp('masume-quest-');
  const bad = await quest([WISH, '--dir', root2, '--gm', fakeGm('bad'), '--retries', '1']);
  assert.equal(bad.code, 1, bad.all);
  assert.match(bad.all, /E_INVALID_MAP/);
  assert.equal(readdirSync(root2).filter((f) => f.startsWith('gm-prompt-')).length, 2, '最初の1回 + 直し1回');
  assert.ok(!existsSync(join(root2, '.masume', 'log.jsonl')), '壊れた地図では始まらない');
});

test('GM が失敗したら E_GM', async () => {
  const fail = await quest([WISH, '--dir', tmp('masume-quest-'), '--gm', fakeGm('fail')]);
  assert.equal(fail.code, 2, fail.all);
  assert.match(fail.all, /E_GM/);
  const nothing = await quest([WISH, '--dir', tmp('masume-quest-'), '--gm', fakeGm('nothing'), '--retries', '0']);
  assert.equal(nothing.code, 2, nothing.all);
  assert.match(nothing.all, /E_GM/);
});

test('--dry-run と MASUME_GM_OVERRIDE', async () => {
  const root = tmp('masume-quest-');
  const d = await quest([WISH, '--dir', root, '--gm', 'claude', '--dry-run']);
  assert.equal(d.code, 0, d.all);
  assert.match(d.all, /claude -p --model sonnet --permission-mode bypassPermissions/);
  assert.ok(d.all.includes(WISH), 'プロンプトの先頭が見える');
  assert.deepEqual(readdirSync(root), [], 'dry-run は何も書かない');
  const dx = await quest([WISH, '--dir', root, '--gm', 'codex', '--model', 'gpt-5', '--dry-run']);
  assert.ok(dx.all.includes(`codex exec -C ${root} -s workspace-write --skip-git-repo-check -m gpt-5 -`), dx.all);

  const o = await quest([WISH, '--dir', root, '--gm', 'claude'], { MASUME_GM_OVERRIDE: fakeGm('good') });
  assert.equal(o.code, 0, o.all);
  assert.equal(readLog(root).find((e) => e.type === 'wish').data.gm, 'cmd', '上書きの GM が使われた');
});
