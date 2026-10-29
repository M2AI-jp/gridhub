import { buildView, stamp } from '../engine/index.js';
import { gameRoot, parseArgs, printCheckResult, usage } from '../engine/cli.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { 'no-boss': 'boolean' });
  const { args, options, actor } = command;
  if (args.length !== 1) usage('つかいかた: stamp <nodeId> --as <humanId>');
  const root = gameRoot(command);
  if (!command.actorGiven) {
    // ハンコは「だれが押したか」の記録なので、--as は省略できない。そのマスの本人を添えて知らせる
    const by = buildView(root).nodes[args[0]]?.check?.by;
    usage(`stamp には --as <人間のID> が要ります（だれがハンコを押したかを記録するため）: gridhub stamp ${args[0]} --as ${by ?? '<人間のID>'}`);
  }
  const result = await stamp(root, args[0], { actor, as: actor, boss: !options['no-boss'] });
  if (options.json) console.log(JSON.stringify(result));
  else printCheckResult(root, result);
  return result.exitCode;
}
