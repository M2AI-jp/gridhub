import {
  closeSync, existsSync, fstatSync, fsyncSync, lstatSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { canonical, eventHash, sha256 } from './canonical.js';
import { MasumeError } from './errors.js';
import { headOf } from './jumon.js';
import { containedFile, logFile } from './paths.js';

const ZERO = '0'.repeat(64);
const HASH = /^[0-9a-f]{64}$/u;
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
const utf8 = new TextDecoder('utf-8', { fatal: true });

export const defaultActor = () => process.env.MASUME_ACTOR || 'gm';

function sameFile(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function removeOwnedLock(file, identity) {
  try {
    if (sameFile(lstatSync(file), identity)) unlinkSync(file);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

// 公開 API は同期。待機は最大15秒、50msごと。判定コマンドはこの中で実行しない。
export function withLock(root, actor, operation) {
  const file = resolve(root, '.masume', 'lock');
  const deadline = Date.now() + 15_000;
  let descriptor;
  let identity;
  for (;;) {
    try {
      descriptor = openSync(file, 'wx');
      identity = fstatSync(descriptor);
      break;
    } catch (error) {
      if (error.code === 'ENOENT') throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません');
      if (error.code !== 'EEXIST') throw error;
      try {
        const old = lstatSync(file);
        if (Date.now() - old.mtimeMs >= 30_000) {
          const current = lstatSync(file);
          if (sameFile(old, current) && current.mtimeMs === old.mtimeMs) unlinkSync(file);
        }
      } catch (staleError) {
        if (staleError.code !== 'ENOENT') throw staleError;
      }
      if (Date.now() >= deadline) {
        throw new MasumeError('E_CONFLICT', '書き込みロックを15秒以内に取得できませんでした');
      }
      Atomics.wait(sleepBuffer, 0, 0, 50);
    }
  }
  try {
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, actor, ts: new Date().toISOString() }));
    fsyncSync(descriptor);
    return operation();
  } finally {
    try {
      closeSync(descriptor);
    } finally {
      removeOwnedLock(file, identity);
    }
  }
}

export function writeDurable(file, bytes, flag = 'wx') {
  const descriptor = openSync(file, flag);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function readBytes(root) {
  try {
    return readFileSync(logFile(root));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      throw new MasumeError('E_NO_GAME', '冒険の書が見つかりません');
    }
    throw error;
  }
}

// バイト位置を残し、repair が壊れた文字列を含めてそのまま退避できるようにする。
function parseLines(bytes) {
  const records = [];
  let start = 0;
  while (start < bytes.length) {
    const newline = bytes.indexOf(10, start);
    const end = newline === -1 ? bytes.length : newline + 1;
    const record = { start, end, event: null, error: null };
    try {
      const text = utf8.decode(bytes.subarray(start, newline === -1 ? end : newline));
      const value = JSON.parse(text);
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('イベントはオブジェクトでなければなりません');
      }
      record.event = value;
      if (newline === -1) throw new Error('行末の改行がなく、追記が完了していません');
    } catch (error) {
      record.error = error.message;
    }
    records.push(record);
    start = end;
  }
  return records;
}

export function readMap(root, mapFile) {
  const file = containedFile(resolve(root, '.masume'), mapFile);
  if (!file) throw new Error('地図の保存先が .masume 内の相対パスではありません');
  return JSON.parse(readFileSync(file, 'utf8'));
}

function checkMap(root, event) {
  try {
    const map = readMap(root, event.data?.map_file);
    return sha256(canonical(map)) === event.data?.map_hash;
  } catch {
    return false;
  }
}

function checkOutput(root, event) {
  try {
    const file = containedFile(resolve(root, '.masume'), event.data?.output);
    return file !== null && sha256(readFileSync(file)) === event.data?.output_hash;
  } catch {
    return false;
  }
}

// events は読めた行、errors は検証結果。破損時も log/jumon から調査できる。
export function inspectLog(root) {
  const bytes = readBytes(root);
  const records = parseLines(bytes);
  const events = [];
  const errors = [];
  const add = (seq, code, message) => errors.push({ seq, code, message });
  if (records.length === 0) add(0, 'E_GENESIS', '冒険の書の最初のイベントがありません');
  for (let seq = 0; seq < records.length; seq++) {
    const record = records[seq];
    const event = record.event;
    if (event) events.push(event);
    if (record.error) {
      add(seq, 'E_PARSE', `イベント行を読めません: ${record.error}`);
      continue;
    }
    if (event.seq !== seq) {
      add(seq, 'E_SEQ', `seq は ${seq} でなければなりません`);
      continue;
    }
    const expectedPrevious = seq === 0 ? ZERO : records[seq - 1].event?.hash;
    if (event.prev !== expectedPrevious || !HASH.test(event.prev)) {
      add(seq, 'E_PREV', '前のイベントのハッシュと prev が一致しません');
      continue;
    }
    if (!HASH.test(event.hash) || event.hash !== eventHash(event)) {
      add(seq, 'E_HASH', 'イベントのハッシュが一致しません');
      continue;
    }
    if ((seq === 0 && event.type !== 'genesis') || (seq > 0 && event.type === 'genesis')) {
      add(seq, 'E_GENESIS', 'genesis は冒険の書の最初に1回だけ必要です');
      continue;
    }
    if ((event.type === 'genesis' || event.type === 'amended') && !checkMap(root, event)) {
      add(seq, 'E_MAP', '保存された地図がないか、地図のハッシュが一致しません');
    }
    const outputRequired = ['check_passed', 'check_failed', 'gate_cleared', 'gate_failed'].includes(event.type);
    if ((outputRequired || event.data?.output !== undefined || event.data?.output_hash !== undefined)
      && !checkOutput(root, event)) {
      add(seq, 'E_OUTPUT', '判定出力がないか、出力のハッシュが一致しません');
    }
  }
  return { bytes, records, events, ok: errors.length === 0, errors, warnings: [], head: headOf(events) };
}

export function verify(root) {
  const { ok, errors, warnings, head } = inspectLog(root);
  return { ok, errors, warnings, head };
}

export function requireHealthy(snapshot) {
  if (!snapshot.ok) {
    const first = snapshot.errors[0];
    throw new MasumeError('E_CURSED', `冒険の書は呪われています（seq ${first.seq}: ${first.code}）。verify / repair で確認してください`, 3);
  }
  return snapshot;
}

export function readEvents(root, { tolerant = false } = {}) {
  const snapshot = inspectLog(root);
  if (!tolerant) requireHealthy(snapshot);
  return snapshot.events;
}

// 呼び出し側がロックを保持し、その中で読み直した末尾イベントを渡す。
export function appendEventsLocked(root, specifications, { actor, previous = null }) {
  if (specifications.length === 0) return [];
  const events = [];
  let last = previous;
  for (const { type, data } of specifications) {
    if (typeof type !== 'string' || !type || !data || typeof data !== 'object' || Array.isArray(data)) {
      throw new MasumeError('E_USAGE', 'イベントには type と data オブジェクトが必要です');
    }
    if (type === 'genesis' && last !== null) {
      throw new MasumeError('E_USAGE', 'genesis は最初にだけ記録できます');
    }
    const event = {
      seq: last ? last.seq + 1 : 0,
      ts: new Date().toISOString(),
      type,
      actor,
      data: JSON.parse(JSON.stringify(data)),
      prev: last ? last.hash : ZERO,
    };
    event.hash = eventHash(event);
    events.push(event);
    last = event;
  }
  writeDurable(logFile(root), events.map((event) => JSON.stringify(event) + '\n').join(''), 'a');
  return events;
}

export function appendEvent(root, type, data, { actor = defaultActor() } = {}) {
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    return appendEventsLocked(root, [{ type, data }], { actor, previous: snapshot.events.at(-1) })[0];
  });
}

export function repair(root, { actor = defaultActor() } = {}) {
  return withLock(root, actor, () => {
    const snapshot = inspectLog(root);
    if (snapshot.ok) return { kept: snapshot.events.length, moved: 0, file: null };
    const first = snapshot.errors[0].seq;
    if (first === 0) {
      throw new MasumeError('E_CURSED', '冒険の書は呪われています（seq 0）。genesis が壊れているため修復できません', 3);
    }
    const directory = resolve(root, '.masume');
    const timestamp = new Date().toISOString().replace(/[:.]/gu, '-');
    const file = resolve(directory, `log.corrupt-${timestamp}-${randomUUID()}.jsonl`);
    const temporary = resolve(directory, `log.repair-${randomUUID()}.tmp`);
    const boundary = snapshot.records[first].start;
    writeDurable(file, snapshot.bytes.subarray(boundary));
    try {
      writeDurable(temporary, snapshot.bytes.subarray(0, boundary));
      renameSync(temporary, logFile(root));
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    return { kept: first, moved: snapshot.records.length - first, file };
  });
}

export function outputFile(root, seq) {
  if (!Number.isSafeInteger(seq) || seq < 0) return null;
  const event = readEvents(root, { tolerant: true }).find((entry) => entry.seq === seq);
  const file = containedFile(resolve(root, '.masume'), event?.data?.output);
  if (!file) return null;
  try {
    return statSync(file).isFile() ? file : null;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}
