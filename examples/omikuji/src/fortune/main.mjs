import { createHash, randomInt } from 'node:crypto';

const catalog = [
  { fortune: '大吉', advice: 'やってみたかったことに、一歩踏み出してみましょう。' },
  { fortune: '中吉', advice: '周りの人への感謝を言葉にすると、良い縁が育ちます。' },
  { fortune: '小吉', advice: '小さな目標を一つ決めて、こつこつ取り組みましょう。' },
  { fortune: '吉', advice: 'いつもの作業を丁寧に進めると、新しい発見がありそうです。' },
  { fortune: '末吉', advice: '焦らず準備を整えて、次の機会を待ちましょう。' },
  { fortune: '凶', advice: '無理をせずひと休みして、大切なことから確かめましょう。' },
];

const args = process.argv.slice(2);

if (args.length === 1 && args[0] === '--catalog') {
  process.stdout.write(`${JSON.stringify(catalog)}\n`);
} else if (
  args.length === 2
  && args[0] === '--seed'
  && args[1].length > 0
  && !args[1].startsWith('--')
) {
  const seed = args[1];
  const hash = createHash('sha256').update(seed, 'utf8').digest();
  const entry = catalog[hash.readUInt32BE(0) % 6];
  process.stdout.write(`${JSON.stringify({ ...entry, seed })}\n`);
} else if (args.length === 0) {
  const entry = catalog[randomInt(catalog.length)];
  process.stdout.write(`${JSON.stringify({ ...entry, seed: null })}\n`);
} else {
  process.stderr.write('[E_USAGE] 引数は指定しないか、--catalog または --seed <空でなく--で始まらない文字列> を指定してください。\n');
  process.exitCode = 2;
}
