import { root, join, existsSync, readFileSync, writeFileSync } from '../lib/harness.mjs';
export function fixture(dir) {
  const configPath = join(dir, 'responses.json');
  const log = join(dir, 'calls.jsonl');
  const file = join(dir, '台帳.json');
  return {
    env: { KAKEIBO_FILE: file, KAKEIBO_STORE_CLI: join(root, 'checks/fixtures/store.mjs'), KAKEIBO_TALLY_CLI: join(root, 'checks/fixtures/tally.mjs'), KAKEIBO_FAKE_CONFIG: configPath, KAKEIBO_FAKE_LOG: log },
    file,
    set(config) { writeFileSync(configPath, JSON.stringify(config)); writeFileSync(log, ''); },
    calls() { return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []; },
  };
}
export const response = value => ({ stdout: JSON.stringify(value) + '\n' });
