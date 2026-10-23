// 作戦（CONTRACTS §45）。作戦はルール（宣言の重さ・セーブ）を変えない。変わるのは、エージェントの動き方と1回の出撃の長さ。
import { MasumeError } from '../engine/index.js';

export const TACTICS = {
  careful: {
    id: 'careful',
    name: 'いのちだいじに',
    moves: '1マスずつ step で確かめる。全部のテストが通るまで宣言（check）しない。',
    stops: ['1つのダンジョンを抜けたら（宣言判定が「判定成功」になったら）、日誌を書いて、そこで止まる。次のダンジョンには進まない。', '宣言判定に2回失敗したら、そこで止まる。なぜ落ちたかを報告する。'],
  },
  balanced: {
    id: 'balanced',
    name: 'バッチリがんばれ',
    moves: '小さく変えて step を回す。全部のテストが通ったら宣言（check）する。',
    stops: ['現在のマスを1つ突破したら（宣言判定が「判定成功」になったら）、日誌を書いて、そこで止まる。次のマスには進まない。', '宣言判定に2回失敗したら、そこで止まる。なぜ落ちたかを報告する。'],
  },
  bold: {
    id: 'bold',
    name: 'ガンガンいこうぜ',
    moves: '次の町まで、ダンジョンを続けて進んでよい（ダンジョンごとに step で確かめ、全部通ったら宣言して、指令書を読み直して次へ）。',
    stops: ['町に着いたら（セーブしたら）、日誌を書いて、そこで止まる。', '結合ゲートに着いて待機になったら、そこで止まる。', '宣言判定に2回失敗したら、そこで止まる。なぜ落ちたかを報告する。'],
  },
};

export const DEFAULT_TACTIC = 'balanced';

/** id か日本語の名前を id に直す。知らない値は null */
export function tacticId(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (Object.hasOwn(TACTICS, text)) return text;
  return Object.values(TACTICS).find(({ name }) => name === text)?.id ?? null;
}

/** --tactic > party.json の tactic > balanced。不正な値は E_USAGE */
export function chooseTactic(option, config = {}) {
  if (option !== undefined) {
    const id = tacticId(option);
    if (!id) throw new MasumeError('E_USAGE', `--tactic は careful（いのちだいじに）/ balanced（バッチリがんばれ）/ bold（ガンガンいこうぜ）のどれかです（${option}）`);
    return TACTICS[id];
  }
  if (config && Object.hasOwn(config, 'tactic')) {
    const id = tacticId(config.tactic);
    if (!id) throw new MasumeError('E_USAGE', `party.json の tactic は careful / balanced / bold のどれかです（${JSON.stringify(config.tactic)}）`);
    return TACTICS[id];
  }
  return TACTICS[DEFAULT_TACTIC];
}
