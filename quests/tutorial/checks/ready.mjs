// A3「カードに完成の印を付ける」の判定。テスト1件 = 1マス（地図の check.cases と同じ名前）。
import { test } from 'node:test';
import { readCard, requireReady } from './common.mjs';

test('name と message が A2 のまま', () => {
  readCard();
});

test('ready が真偽値の true', () => {
  requireReady(readCard());
});
