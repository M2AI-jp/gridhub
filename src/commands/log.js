import { buildView, logEntry } from '../engine/view.js';
import { inspectLog } from '../engine/store.js';
import { localTime } from '../engine/record.js';
import { MARK } from '../engine/cases.js';
import { gameRoot, parseArgs, printCorruption, usage } from '../engine/cli.js';

const DEFAULT_TAIL = 20;

/** だれの記録か。文の本人（キャラクター・押した人・仲間）と違うときだけ添える（gm が代わりに書いた日誌、軍師が記録した出撃など） */
function recorder(event) {
  const data = event.data ?? {};
  const subjects = [data.character, data.by, ...(data.members ?? []), ...(data.characters ?? [])].filter((id) => id);
  return event.actor && subjects.length && !subjects.includes(event.actor) ? `（記録: ${event.actor}）` : '';
}

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { tail: 'maybe' });
  const { args, options } = command;
  if (args.length !== 0) usage('つかいかた: log [--tail [N]] [--json]');
  if (options.tail !== undefined && options.tail !== true
    && (!/^\d+$/u.test(options.tail) || !Number.isSafeInteger(Number(options.tail)))) {
    usage('--tail は0以上の整数で指定してください');
  }
  const root = gameRoot(command);
  const snapshot = inspectLog(root);
  printCorruption(snapshot.errors);
  const count = options.tail === undefined ? snapshot.events.length : options.tail === true ? DEFAULT_TAIL : Number(options.tail);
  const events = count === 0 ? [] : snapshot.events.slice(-count);
  if (options.json) {
    console.log(JSON.stringify(events));
    return 0;
  }
  // 人の読める文で（盤面の「冒険の書」と同じ言い方）。時刻はこの機械のローカル時刻。生のイベントは --json
  const view = buildView(root, snapshot); // 読んだ冒険の書をそのまま渡す（二度読まない）
  const names = { characters: view.characters };
  if (events.length < snapshot.events.length) {
    console.log(`（最後の ${events.length} 件。全部は gridhub log、生のイベントは gridhub log --json）`);
  }
  for (const event of events) {
    const entry = logEntry(event, names);
    // 末尾の [type] は、生の型（grep と LLM のため。--json と同じ名前）
    console.log(`${String(event.seq).padStart(4)}  ${localTime(event.ts)}  ${MARK[entry.ok]} ${entry.text}${recorder(event)}  [${event.type}]`);
  }
  return 0;
}
