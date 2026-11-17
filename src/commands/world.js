import { resolve } from 'node:path';
import { gameRoot, parseArgs, usage } from '../engine/cli.js';
import { writeWorldOverlay } from '../engine/world.js';
import { t } from '../engine/words.js';
import { startWorld } from '../server/world.js';

export async function run(argv, ctx) {
  const command = parseArgs(argv, ctx, { overlay: 'boolean', out: 'string', port: 'string', codecity: 'string', lifeline: 'boolean' });
  const { options, args, cwd, env } = command;
  if (args.length || (options.out !== undefined && !options.overlay)) usage(t('world.usage'));
  const port = options.port ?? '0';
  if (!/^\d+$/u.test(port) || Number(port) > 65535) usage(t('world.port.invalid'));
  const root = gameRoot(command);
  if (options.overlay) {
    if (options.out === '') usage(t('world.usage'));
    const out = options.out === undefined ? resolve(root, '.masume/world-overlay.json') : resolve(cwd, options.out);
    const overlay = writeWorldOverlay(root, out, { env, words: options.words });
    console.log(options.json ? JSON.stringify(overlay) : t('world.written', out));
    return 0;
  }

  const session = startWorld({ root, port: Number(port), codecity: options.codecity && resolve(cwd, options.codecity), env, words: options.words });
  let stopped = false, release;
  const stopping = new Promise(res => { release = res; });
  const shutdown = () => {
    stopped = true;
    release();
    void session.stop();
  };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, shutdown);
  const input = process.stdin;
  if (options.lifeline) {
    for (const event of ['end', 'close', 'error']) input.on(event, shutdown);
    input.resume();
    if (input.readableEnded || input.destroyed) shutdown();
  }
  try {
    const url = await Promise.race([session.ready, stopping]);
    if (stopped) return 0;
    console.log(options.json ? JSON.stringify({ ok: true, url }) : t('world.url', url));
    const result = await Promise.race([session.exited, stopping]);
    if (!stopped && result?.error) throw result.error;
    return 0;
  } catch (error) {
    if (stopped) return 0;
    throw error;
  } finally {
    await session.stop();
    for (const signal of signals) process.off(signal, shutdown);
    if (options.lifeline) {
      for (const event of ['end', 'close', 'error']) input.off(event, shutdown);
      input.pause();
      input.unref?.();
    }
  }
}
