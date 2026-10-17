// masume party — 軍師。キャラクターごとにエージェントを出撃させ、ボス戦を指揮する（CONTRACTS §13）。
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MasumeError, buildView, findRoot, logFile } from '../engine/index.js';
import { resolveAgent } from '../party/agents.js';
import { Party, needsSeal } from '../party/patrol.js';
import { buildPrompt } from '../party/prompt.js';

const DEFAULTS = { agent: 'claude', parallel: 3, rounds: 40 };
const OPTIONS = {
  dir: 'string', agent: 'string', model: 'string', parallel: 'string',
  rounds: 'string', only: 'string', 'dry-run': 'boolean', network: 'boolean', 'no-network': 'boolean',
};

function usage(message) {
  throw new MasumeError('E_USAGE', message);
}

function parseOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) usage(`つかいかた: party [--agent claude|codex|cmd:<command>] [--model M] [--parallel N] [--rounds R] [--only id,id] [--network | --no-network] [--dry-run] [--dir D]（余計な引数: ${arg}）`);
    const eq = arg.indexOf('=');
    const key = arg.slice(2, eq === -1 ? undefined : eq);
    if (!Object.hasOwn(OPTIONS, key)) usage(`知らないオプションです: --${key}`);
    if (OPTIONS[key] === 'boolean') {
      if (eq !== -1) usage(`--${key} に値は指定できません`);
      options[key] = true;
    } else {
      const value = eq === -1 ? argv[++i] : arg.slice(eq + 1);
      if (value === undefined || (eq === -1 && value.startsWith('--'))) usage(`--${key} の値が必要です`);
      options[key] = value;
    }
  }
  return options;
}

function positive(name, value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) usage(`${name} は 1 以上の整数で指定してください（${value}）`);
  return n;
}

function readConfig(root) {
  const file = join(root, '.masume', 'party.json');
  if (!existsSync(file)) return {};
  let config;
  try {
    config = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    usage(`.masume/party.json を読めません: ${error.message}`);
  }
  if (config === null || typeof config !== 'object' || Array.isArray(config)) usage('.masume/party.json はオブジェクトで書いてください');
  if (Object.hasOwn(config, 'network') && typeof config.network !== 'boolean') usage('party.json の network は true か false で書いてください');
  return config;
}

function timeoutSeconds(env) {
  if (env.MASUME_SORTIE_TIMEOUT === undefined || env.MASUME_SORTIE_TIMEOUT === '') return 3600;
  const seconds = Number(env.MASUME_SORTIE_TIMEOUT);
  if (!Number.isFinite(seconds) || seconds <= 0) usage('MASUME_SORTIE_TIMEOUT は正の秒数で指定してください');
  return seconds;
}

// 標準出力が詰まらないうちに終わる（子プロセスが残っていても待たない）
function exitAfterFlush(code) {
  process.exitCode = code;
  let left = 2;
  const done = () => {
    if (--left === 0) process.exit(code);
  };
  // 出力先が閉じていてコールバックが来なくても、終わる
  setTimeout(() => process.exit(code), 1000).unref();
  process.stdout.write('', done);
  process.stderr.write('', done);
}

// 出力先が閉じても（`| head` など。EPIPE）落ちない。出撃中のエージェントの帰還を記録するまで終わらない（§26.1）
function survive(stream) {
  stream.on('error', () => {});
}

export async function run(argv, ctx) {
  survive(process.stdout);
  survive(process.stderr);
  const options = parseOptions(argv);
  const cwd = ctx.cwd ?? process.cwd();
  const env = ctx.env ?? process.env;
  const root = options.dir !== undefined ? resolve(cwd, options.dir)
    : env.MASUME_DIR ? resolve(cwd, env.MASUME_DIR) : findRoot(cwd);
  if (!root || !existsSync(logFile(root))) throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません');

  const config = readConfig(root);
  const agentName = env.MASUME_AGENT_OVERRIDE || options.agent || config.agent || DEFAULTS.agent;
  const model = options.model ?? config.model ?? null;
  const parallel = options.parallel !== undefined ? positive('--parallel', options.parallel)
    : config.parallel !== undefined ? positive('party.json の parallel', config.parallel) : DEFAULTS.parallel;
  const rounds = options.rounds !== undefined ? positive('--rounds', options.rounds) : DEFAULTS.rounds;
  if (options.network && options['no-network']) usage('--network と --no-network は一緒に指定できません');
  const network = options.network ? true : options['no-network'] ? false : (config.network ?? false); // §30.1
  const agent = resolveAgent(agentName, model, root, { network });
  const timeoutMs = timeoutSeconds(env) * 1000;

  const view = buildView(root);
  if (!view.integrity.ok) {
    throw new MasumeError('E_CURSED', `冒険の書は呪われています（seq ${view.integrity.errors[0].seq}）。verify / repair で確認してください`, 3);
  }
  let only = null;
  if (options.only !== undefined) {
    only = new Set(options.only.split(',').map((s) => s.trim()).filter(Boolean));
    if (only.size === 0) usage('--only にはキャラクターIDをカンマ区切りで指定してください');
    for (const id of only) {
      if (!view.characters.some((c) => c.id === id)) throw new MasumeError('E_UNKNOWN', `キャラクターが見つかりません: ${id}`);
    }
  }

  if (options['dry-run']) return dryRun({ root, bin: ctx.bin, view, agent, only });

  const party = new Party({ root, bin: ctx.bin, env, agent, parallel, rounds, only, timeoutMs });
  const onSignal = () => party.interrupt();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, onSignal);
  let code;
  try {
    code = await party.run();
  } finally {
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.off(signal, onSignal);
  }
  // 中断のときは、ボス戦の判定など手放せない子が残っていても、ここで終わる
  if (code === 130) exitAfterFlush(130);
  return code;
}

function dryRun({ root, bin, view, agent, only }) {
  if (view.finished) {
    console.log('あがり！ もう出撃するキャラクターはいません');
    return 0;
  }
  let planned = 0;
  for (const c of view.characters) {
    if (c.kind !== 'agent' || c.status !== 'working' || c.at === null || c.sortie) continue;
    if (view.nodes[c.at]?.check?.kind === 'stamp') continue;
    if (only && !only.has(c.id)) continue;
    if (needsSeal(view.nodes[c.at])) {
      console.log(`未封印: ${c.at}（${c.id} は出撃させません）`);
      continue;
    }
    planned++;
    console.log(`出撃予定: ${c.id} ${agent.display}`);
    const prompt = buildPrompt({ root, bin, view, characterId: c.id });
    for (const line of prompt.split('\n').slice(0, 8)) console.log(`    ${line}`);
    console.log('    …');
  }
  if (planned === 0) console.log('出撃予定のキャラクターはいません');
  return 0;
}
