// 語り部の本体（CONTRACTS §14）: 願い → GM の LLM が quest.map.json と判定を書く → 検査 → 冒険の書。
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as engine from '../engine/index.js';
import { gmCommand, gmTimeoutSeconds, parseGm, runGm, tail } from './adapter.js';
import { commitBeginning, ensureGitSave, ensureRepository } from './git.js';
import { listenNotice } from './help.js';
import { inspectMap, MAP_FILE } from './inspect.js';
import { buildPrompt, buildRetryPrompt } from './prompt.js';
import { AGENT_KINDS, fileEntry, printSetup, setupProject } from './setup.js';

const { MasumeError } = engine;
const DEFAULT_RETRIES = 2;
const PROMPT_HEAD_LINES = 40;

/** そのまま貼って動くように、シェルの単一引用符で引用する（$ " ` や空白があっても安全） */
const quote = (text) => (/^[\w./:@=+,-]+$/u.test(text) ? text : `'${text.replaceAll("'", "'\\''")}'`);
/** 地図ファイルの「書かれた時刻」の指紋。同じ中身を書き直しても変わる（書き直しは別の inode になることもある） */
const stampOfFile = (file) => {
  try {
    const { mtimeNs, ctimeNs, ino, size } = statSync(file, { bigint: true });
    return `${mtimeNs}:${ctimeNs}:${ino}:${size}`;
  } catch {
    return null;
  }
};

/** 書記が recordWish を用意していればそれを、まだ無ければ §12 の形どおりに appendEvent で記録する */
function recordWish(root, { actor, text, gm, model }) {
  if (typeof engine.recordWish === 'function') return engine.recordWish(root, { actor, text, gm, model });
  return engine.appendEvent(root, 'wish', { text, gm, model }, { actor });
}

function summarize(root, view) {
  const nodes = Object.values(view.nodes);
  const sealable = nodes.filter((n) => (n.check?.seal ?? []).length > 0);
  return {
    quest: view.quest,
    agents: view.characters.filter((c) => c.kind === 'agent').length,
    humans: view.characters.filter((c) => c.kind === 'human').length,
    names: view.characters.map((c) => c.name),
    nodes: nodes.length,
    tasks: nodes.filter((n) => n.type === 'task').length,
    gates: nodes.filter((n) => n.type === 'gate').length,
    camps: nodes.filter((n) => n.type === 'camp').length,
    sealed: sealable.filter((n) => n.sealed).length,
    unsealed: sealable.filter((n) => !n.sealed).map((n) => n.id),
    sealable: sealable.length,
    seq: view.head.seq,
    commit: view.head.commit,
  };
}

/** 冒険の書が生まれたあとの支度（CONTRACTS §21）。失敗しても冒険は始められるので、止めずに知らせる */
function prepareProject(root, { gm, override, allowListen, ctx }) {
  const requested = (gm ?? (override ? '' : 'claude')).trim();
  try {
    return setupProject({ root, agent: AGENT_KINDS.includes(requested) ? requested : undefined, allowListen }, ctx);
  } catch (error) {
    return { root, files: [], error: error.message };
  }
}

function printSummary(say, { root, cwd, bin }, s) {
  const dir = root === cwd ? '' : ` --dir ${quote(root)}`;
  say('冒険がはじまります！');
  say(`「${s.quest.title}」（${s.quest.id}）  ${s.quest.pitch ?? ''}`.trimEnd());
  say(`  キャラクター ${s.agents + s.humans}人（エージェント ${s.agents}・人間 ${s.humans}）: ${s.names.join('、')}`);
  say(`  マス ${s.nodes}（task ${s.tasks}・結合ゲート ${s.gates}・宿屋 ${s.camps}）  あがり: ${s.quest.goal}`);
  say(`  封印した判定: ${s.sealed}/${s.sealable} マス`);
  if (s.unsealed.length > 0) {
    say(`  ※ 判定ファイルがまだ無いマス: ${s.unsealed.join('、')}（キャラクターが着く前に masume seal <マス> で封印してください）`);
  }
  if (s.setup.error) say(`※ 支度（AGENTS.md ほか）に失敗しました: ${s.setup.error}\n  あとで masume init${root === cwd ? '' : ` --dir ${quote(root)}`} を打ってください`);
  else printSetup(say, s.setup);
  if (s.beginning?.commit) say(`  最初のコミット: ${s.beginning.commit.slice(0, 7)} gridhub: 冒険のはじまり`);
  say(engine.recordLine(s));
  say('');
  say('次の一手:');
  say(`  盤面を開く      masume serve${dir}`);
  say(`  パーティ出撃    masume party${dir}`);
  say(`（masume が PATH に無いときは、masume の代わりに node ${quote(bin)} と打ってください）`);
}

function printDryRun({ out, gm, command, root, override, prompt, promptFile, exists, json }) {
  const head = prompt.split('\n').slice(0, PROMPT_HEAD_LINES);
  if (json) {
    out(JSON.stringify({ ok: true, dryRun: true, gm: gm.kind, command: command.display, cwd: root, promptFile, prompt }));
    return;
  }
  out(`[dry-run] GM: ${gm.kind}${override ? '（MASUME_GM_OVERRIDE で上書きされています）' : ''}`);
  out(`  コマンド:  ${command.display}`);
  out(`  cwd:       ${root}`);
  out('  標準入力:  プロンプト（下に先頭を表示）');
  out(`  環境変数:  MASUME_DIR MASUME_BIN MASUME_WISH MASUME_PROMPT_FILE=${promptFile}`);
  if (exists) out('  ※ このフォルダにはすでに冒険の書があります（本番なら E_EXISTS になります）');
  out(`--- プロンプトの先頭 ${head.length} 行（全 ${prompt.split('\n').length} 行・${prompt.length} 文字）---`);
  out(head.join('\n'));
  out('--- 以下略。何も書いていません・GM も起動していません ---');
}

/**
 * opts: { wish, dir, gm, model, force, retries, dryRun, json, actor, allowListen }
 * ctx:  { bin, root（リポジトリ）, cwd, env }
 */
export async function runQuest(opts, ctx) {
  const env = ctx.env ?? process.env;
  const cwd = ctx.cwd ?? process.cwd();
  const root = resolve(cwd, opts.dir ?? '.');
  const override = (env.MASUME_GM_OVERRIDE ?? '').trim();
  const gm = parseGm(override || opts.gm || 'claude');
  const model = opts.model ?? null;
  const allowListen = opts.allowListen === true;
  const command = gmCommand(gm, { root, model, allowListen });
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const out = (text) => console.log(text);
  const say = opts.json ? (text) => console.error(text) : out;
  const exists = existsSync(join(root, '.masume'));

  if (exists && !opts.force && !opts.dryRun) {
    throw new MasumeError('E_EXISTS', `ここにはもう冒険の書があります（${root}）。新しく始めるなら別の --dir を、作り直すなら --force を指定してください`);
  }

  // 箱のソケットを開ける（または効かない）ことは、GM を呼ぶ前に1行で知らせる（--dry-run でも。§32.3）
  const notice = listenNotice({ allowListen, gmKind: gm.kind });
  if (notice) say(notice);

  const original = buildPrompt({ wish: opts.wish, root, repoRoot: ctx.root });

  if (opts.dryRun) {
    printDryRun({ out, gm, command, root, override, prompt: original, promptFile: join(root, 'quest-prompt-1.txt'), exists, json: opts.json });
    return 0;
  }

  try {
    mkdirSync(root, { recursive: true });
  } catch (error) {
    throw new MasumeError('E_USAGE', `--dir の場所を作れません: ${root}（${error.message}）`);
  }
  // 願い（WISH.md）は冒険が生まれたときに書く。GM が失敗したときに、前の願いを消さないため（§27.6）
  const logFile = join(root, 'quest.log');
  const timeoutSeconds = gmTimeoutSeconds(env.MASUME_GM_TIMEOUT);

  const mapFile = join(root, MAP_FILE);
  let prompt = original;
  let inspection;
  // GM を呼ぶたびに、その間に地図が書き換わったことを確かめる（§27.1）。
  // ただし前の回が「地図は正しいが、警告だけ」（判定ファイルが足りない）だったときは、
  // 直すのは判定ファイルで、地図を書き直さなくてよい（その地図は前の回の GM が書いたもの）
  let mustWriteMap = true;

  for (let round = 0; ; round++) {
    const promptFile = join(root, `quest-prompt-${round + 1}.txt`);
    writeFileSync(promptFile, prompt);
    const gmEnv = {
      ...env,
      MASUME_DIR: root,
      MASUME_BIN: ctx.bin,
      MASUME_WISH: opts.wish,
      MASUME_PROMPT_FILE: promptFile,
    };
    // GM が入れ子で node --test を走らせても、何も走らずに通ってしまわないように
    delete gmEnv.NODE_TEST_CONTEXT;

    say(round === 0
      ? `GM を呼びます（${gm.kind}${model ? ` ${model}` : ''}）。地図ができるまで数分かかることがあります\n  GM の出力: ${logFile}`
      : `GM をもう一度呼びます（${round}回目のやり直し）`);
    const stampBefore = stampOfFile(mapFile);
    const result = await runGm(command, {
      cwd: root, env: gmEnv, prompt, logFile, heading: `GM ${round + 1}回目`, timeoutSeconds,
    });
    if (result.code !== 0) {
      throw new MasumeError('E_GM', `GM が失敗しました（終了コード ${result.code}${result.timedOut ? '・時間切れ' : ''}）: ${command.display}\n`
        + `${tail(result.output) || '（出力なし）'}\nくわしくは ${logFile}`);
    }

    inspection = inspectMap(root);
    // 前から置いてあった地図（や、前の回に書かれた不正な地図）を、GM が書き直さなかったときは「書かれなかった」とみなす
    const untouched = mustWriteMap && stampBefore !== null && stampOfFile(mapFile) === stampBefore;
    const missing = inspection.missing || untouched;

    const problems = missing ? [] : inspection.errors;
    const warnings = missing ? [] : inspection.warnings;
    if (!missing && problems.length === 0 && warnings.length === 0) break;
    mustWriteMap = missing || problems.length > 0;

    if (round >= retries) {
      if (missing) {
        throw new MasumeError('E_GM', `GM は終わりましたが、${MAP_FILE} が書かれていません（GM を ${round + 1} 回呼びました）。くわしくは ${logFile}`);
      }
      if (problems.length > 0) {
        throw new MasumeError('E_INVALID_MAP', `GM が描いた地図を直せませんでした（GM を ${round + 1} 回呼びました）。${MAP_FILE} は残してあります\n${problems.join('\n')}`, 1);
      }
      for (const line of warnings) say(line); // 始められる。止まりやすい所だけ知らせる
      break;
    }
    say(missing ? `${MAP_FILE} が書かれていません` : `地図に ${problems.length + warnings.length} 件の指摘があります。GM に直させます`);
    prompt = buildRetryPrompt({ original, problems, warnings, missing, attempt: round + 1 });
  }

  // Git でセーブする冒険にする（§46.2・§46.3）。地図に quest.save が無ければ足し、Git の外なら git init する
  if (ensureGitSave(mapFile)) say(`${MAP_FILE} に quest.save: "git" を足しました（町 = セーブ = Git のコミット）`);
  const repository = ensureRepository(root);
  if (repository.error) say(`※ ${repository.error}。Git のセーブなしで続けます（町に着いてもコミットされません）`);
  else if (repository.initialized) say('ここは Git の作業ツリーではなかったので、git init しました');
  engine.newGame(root, mapFile, { actor: opts.actor, force: Boolean(opts.force) });
  const wish = recordWish(root, { actor: opts.actor, text: opts.wish, gm: gm.kind, model });
  try {
    writeFileSync(join(root, 'WISH.md'), `# 願い\n\n${opts.wish}\n`);
  } catch (error) {
    say(`※ WISH.md を書けませんでした（${error.message}）。願いは冒険の書に記録してあります`);
  }
  const summary = summarize(root, engine.buildView(root));
  summary.setup = prepareProject(root, { gm: opts.gm, override, allowListen, ctx });
  if (repository.initialized) {
    const beginning = commitBeginning(root);
    summary.beginning = beginning;
    if (beginning.error) say(`※ 最初のコミットができませんでした: ${beginning.error}`);
  }

  if (opts.json) {
    const { setup, ...rest } = summary;
    out(JSON.stringify({
      ok: true, root, ...rest,
      setup: setup.error ? { ok: false, error: setup.error } : { ok: true, files: setup.files.map(fileEntry) },
      files: { map: mapFile, wish: join(root, 'WISH.md'), log: logFile },
      git: { initialized: repository.initialized, error: repository.error ?? null, commit: summary.beginning?.commit ?? null },
    }));
  } else {
    printSummary(say, { root, cwd, bin: ctx.bin }, summary);
  }
  return 0;
}
