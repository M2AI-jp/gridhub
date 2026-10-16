export function parseArguments(args) {
  const options = { seed: null, json: false, history: false, help: false };
  const seen = new Set();

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!['--seed', '--json', '--history', '--help'].includes(argument)) {
      throw new Error('未知のオプションまたは位置引数です。--help で使い方を確認してください。');
    }
    if (seen.has(argument)) {
      throw new Error(`${argument} は重複して指定できません。`);
    }
    seen.add(argument);

    if (argument === '--seed') {
      const seed = args[index + 1];
      if (seed === undefined || seed === '' || seed.startsWith('--')) {
        throw new Error('--seed には空でなく、-- で始まらない文字列が必要です。');
      }
      options.seed = seed;
      index += 1;
    } else {
      options[argument.slice(2)] = true;
    }
  }

  if (options.help && args.length !== 1) {
    throw new Error('--help は単独で指定してください。');
  }
  if (options.history && options.seed !== null) {
    throw new Error('--history と --seed は併用できません。');
  }

  return options;
}
