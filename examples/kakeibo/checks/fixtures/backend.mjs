// Fixed-response test double: records invocations, never stores or aggregates expenses.
import { readFileSync, appendFileSync } from 'node:fs';
const config = JSON.parse(readFileSync(process.env.KAKEIBO_FAKE_CONFIG, 'utf8'));
const name = process.argv[2];
const response = config[name];
let input = '';
for await (const chunk of process.stdin) input += chunk;
appendFileSync(process.env.KAKEIBO_FAKE_LOG, JSON.stringify({ name, args: process.argv.slice(3), input, file: process.env.KAKEIBO_FILE }) + '\n');
process.stdout.write(response.stdout ?? '');
process.stderr.write(response.stderr ?? '');
process.exitCode = response.status ?? 0;
