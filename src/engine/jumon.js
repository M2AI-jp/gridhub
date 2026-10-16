export const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわがぎぐげござじずぜぞだぢづでどばびぶべぼ';

export function jumonOf(hashHex) {
  const n = BigInt(`0x${hashHex.slice(0, 18)}`);
  const letters = Array.from({ length: 12 }, (_, i) =>
    KANA[Number((n >> BigInt(66 - 6 * i)) & 63n)]);
  return [0, 3, 6, 9].map((i) => letters.slice(i, i + 3).join('')).join(' ');
}

export function normalizeJumon(value) {
  return value.replace(/\s/gu, '').replace(/[ァ-ヶ]/gu,
    (character) => String.fromCodePoint(character.codePointAt(0) - 0x60));
}

export function findJumon(events, value) {
  const wanted = normalizeJumon(value);
  if (Array.from(wanted).length !== 12) return null;
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (/^[0-9a-f]{64}$/u.test(event.hash)
      && normalizeJumon(jumonOf(event.hash)) === wanted) return { seq: event.seq };
  }
  return null;
}

export function headOf(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    const { seq, hash } = events[i];
    if (Number.isSafeInteger(seq) && /^[0-9a-f]{64}$/u.test(hash)) {
      return { seq, hash, jumon: jumonOf(hash) };
    }
  }
  return null;
}
