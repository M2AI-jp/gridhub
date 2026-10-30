import { buildView, check } from '../engine/index.js';
import { gameRoot, parseArgs, printCheckResult, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { 'no-boss': 'boolean' });
  const { args, options } = command;
  if (args.length !== 1) usage('つかいかた: check <characterId|gateId> [--no-boss]');
  const root = gameRoot(command);
  // 盤面は1回だけ読む: --as の既定（キャラクターの宣言はそのキャラクターとして記録する。ゲートのボス戦は gm のまま）と、結果の行の名前・題に使う
  const view = buildView(root);
  const isCharacter = !command.actorGiven && view.characters.some(({ id }) => id === args[0]);
  const actor = isCharacter ? args[0] : command.actor;
  let result;
  try {
    result = await check(root, args[0], { actor, boss: !options['no-boss'] });
  } catch (error) {
    if (!options.json && error.code === 'E_PARTY_INCOMPLETE') console.log(error.message);
    throw error;
  }
  if (options.json) console.log(JSON.stringify(result));
  else printCheckResult(root, result, { view });
  return result.exitCode;
}
