// A1「あいさつを一行で書く」の判定。テスト1件 = 1マス（地図の check.cases と同じ名前）。
// 歩く（gridhub step apprentice）はこのファイルだけを走らせ、宣言判定（gridhub check）は A1 から順にまとめて走らせる。
import { test } from 'node:test';
import { expect, greetingName, readGreetingText } from './common.mjs';

test('ai/hello.txt がある', () => {
  readGreetingText();
});

test('「こんにちは、」で始まる', () => {
  expect(readGreetingText().startsWith('こんにちは、'), 'apprentice',
    'ai/hello.txt は「こんにちは、」で始めてください（例: こんにちは、GridHub！）。');
});

test('名前のあとが「！」で終わる', () => {
  greetingName(readGreetingText());
});
