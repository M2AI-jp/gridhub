// A2「あいさつをカードに写す」の判定。テスト1件 = 1マス（地図の check.cases と同じ名前）。
import { test } from 'node:test';
import { expect, greetingFor, readCardObject, readGreeting, validName } from './common.mjs';

test('ai/card.json が { ... } の JSON', () => {
  readCardObject();
});

test('name が空でない文字列', () => {
  expect(validName(readCardObject().name), 'apprentice',
    'ai/card.json の name は、前後に空白も改行もない空でない文字列にしてください。');
});

test('message が「こんにちは、<name>！」', () => {
  const card = readCardObject();
  expect(card.message === greetingFor(card.name), 'apprentice',
    'ai/card.json の message を「こんにちは、<name の値>！」にしてください。最後は全角の「！」です。');
});

test('message が ai/hello.txt のあいさつと同じ', () => {
  expect(readCardObject().message === readGreeting(), 'apprentice',
    'ai/card.json の message と ai/hello.txt の本文が違います。同じあいさつにそろえてください。');
});
