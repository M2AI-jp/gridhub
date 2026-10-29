import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MasumeError } from './errors.js';
import { findRoot, logFile } from './paths.js';
import { inspectLog, outputFile, requireHealthy } from './store.js';
import { buildView } from './view.js';

export function usage(message) {
  throw new MasumeError('E_USAGE', message);
}

export function parseArgs(argv, ctx, extra = {}) {
  const types = { dir: 'string', as: 'string', json: 'boolean', ...extra };
  const options = {};
  const args = [];
  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    if (argument === '--') {
      args.push(...argv.slice(i + 1));
      break;
    }
    if (!argument.startsWith('--')) {
      args.push(argument);
      continue;
    }
    const equal = argument.indexOf('=');
    const key = argument.slice(2, equal === -1 ? undefined : equal);
    if (!Object.hasOwn(types, key)) usage(`知らないオプションです: --${key}`);
    if (types[key] === 'boolean') {
      if (equal !== -1) usage(`--${key} に値は指定できません`);
      options[key] = true;
    } else if (types[key] === 'maybe') {
      // 値があってもなくてもよい（--tail / --tail 20 / --tail=20）。無ければ true
      if (equal !== -1) options[key] = argument.slice(equal + 1);
      else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) options[key] = argv[++i];
      else options[key] = true;
    } else {
      const value = equal === -1 ? argv[++i] : argument.slice(equal + 1);
      if (value === undefined || (equal === -1 && value.startsWith('--'))) usage(`--${key} の値が必要です`);
      options[key] = value;
    }
  }
  if (options.dir === '' || options.as === '') usage('--dir と --as に空文字は指定できません');
  const cwd = ctx.cwd ?? process.cwd();
  const env = ctx.env ?? process.env;
  return {
    args, options, cwd, env,
    actor: options.as ?? (env.MASUME_ACTOR || 'gm'),
    // --as か MASUME_ACTOR で「だれとして」が決まっているか。無ければ、キャラクターIDを取るコマンドはそのIDとして記録する（actorFor）
    actorGiven: options.as !== undefined || Boolean(env.MASUME_ACTOR),
  };
}

/**
 * だれとして記録するか。--as > MASUME_ACTOR > コマンドに渡したキャラクターID（step・check・note）。
 * 人が `gridhub step engine` と打ったら engine の記録になる（gm にならない）。
 */
export function actorFor(command, characterId) {
  return command.actorGiven ? command.actor : characterId;
}

export function gameRoot(command, { creating = false, optional = false } = {}) {
  const { cwd, env, options } = command;
  const root = options.dir !== undefined ? resolve(cwd, options.dir)
    : creating ? resolve(cwd)
      : env.MASUME_DIR ? resolve(cwd, env.MASUME_DIR) : findRoot(cwd);
  if (!root && !optional) throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません');
  return root;
}

export function guardExistingGame(command) {
  const root = gameRoot(command, { optional: true });
  if (root && existsSync(logFile(root))) requireHealthy(inspectLog(root));
}

export function printValidation(result) {
  for (const { code, path, message } of [...result.errors, ...result.warnings]) {
    console.log(`[${code}] ${path}: ${message}`);
  }
  if (result.ok) console.log('地図は正常です');
}

export function printCorruption(errors) {
  if (errors.length > 0) {
    console.error(`冒険の書は呪われています（seq ${errors[0].seq}）。読めたイベントだけを表示します`);
  }
}

function printFailureOutput(root, seq, node) {
  const file = outputFile(root, seq);
  if (!file) return;
  const output = readFileSync(file, 'utf8');
  // 累積判定では最後の区間が失敗したマス。前の成功出力を混ぜない。
  const heading = `=== ${node}: `;
  const boundary = output.lastIndexOf(`\n${heading}`);
  const failed = boundary >= 0 ? output.slice(boundary + 1) : output;
  console.log(failed.replace(/\r?\n$/u, '').split(/\r\n|\n|\r/u).slice(-40).join('\n'));
}

/** 判定の結果行に使う、名前と題（盤面のログと同じ言い方。ID も残す） */
function namesOf(root) {
  let view = null;
  try {
    view = buildView(root);
  } catch {
    view = null;
  }
  const who = (id) => {
    const c = view?.characters.find((x) => x.id === id);
    return c ? `${c.name}（${id}）` : String(id);
  };
  const where = (id) => {
    const title = view?.nodes?.[id]?.title;
    return title ? `${id}「${title}」` : String(id);
  };
  return { who, where };
}

export function printCheckResult(root, result) {
  const { who, where } = namesOf(root);
  for (const { seq, type, data } of result.events) {
    switch (type) {
      case 'check_passed':
        console.log(`判定成功: ${who(data.character)}が ${where(data.node)}を突破しました`);
        break;
      case 'check_failed':
        console.log(`判定失敗: ${who(data.character)}が ${where(data.failed)}の判定で負けました`);
        printFailureOutput(root, seq, data.failed);
        break;
      case 'stamped':
        console.log(`判定成功: ${who(data.by)}が ${where(data.node)}にハンコを押しました`);
        break;
      case 'gate_cleared':
        console.log(`結合ゲート突破: ${where(data.gate)}を ${data.members.map(who).join('、')}が突破しました`);
        break;
      case 'gate_failed':
        console.log(`${data.blamed.length === data.members.length ? '全滅' : '差し戻し'}: `
          + `${where(data.gate)}の判定失敗（責任: ${data.blamed.map(who).join('、')}）`);
        printFailureOutput(root, seq, data.gate);
        break;
    }
  }
}
