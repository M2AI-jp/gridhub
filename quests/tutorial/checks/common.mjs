// 判定の共有処理。A1〜A3 は node:test のテスト1件ずつ（= 1マス）から、G1・GOAL は runCheck から使う。
import { readFileSync } from 'node:fs';

class CheckFailure extends Error {
  constructor(character, message) {
    super(message);
    this.character = character;
  }
}

/** 条件が満たされなければ、だれの責任か（character）と直し方（message）を添えて落とす */
export function expect(condition, character, message) {
  if (!condition) throw new CheckFailure(character, message);
}

function readText(path, character) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    const reason = error.code === 'ENOENT'
      ? 'がありません。現在の指令書に沿って作ってください。'
      : 'を読めません。通常のファイルとして保存し、読み取り権限を確認してください。';
    throw new CheckFailure(character, `${path} ${reason}`);
  }
}

function readObject(path, character) {
  const text = readText(path, character);
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new CheckFailure(character, `${path} の JSON を読めません。キーと文字列を半角の二重引用符で囲み、カンマや括弧を確認してください。`);
  }
  expect(value !== null && typeof value === 'object' && !Array.isArray(value),
    character, `${path} は { ... } の形の JSON オブジェクトにしてください。`);
  return value;
}

export function validName(name) {
  return typeof name === 'string' && name.length > 0
    && name === name.trim() && !/[\r\n\u2028\u2029]/u.test(name);
}

export function greetingFor(name) {
  return `こんにちは、${name}！`;
}

/** ai/hello.txt の本文（テキストエディターが付ける末尾の改行を1つだけ許す） */
export function readGreetingText() {
  return readText('ai/hello.txt', 'apprentice').replace(/\r?\n$/u, '');
}

/** あいさつ「こんにちは、<名前>！」の名前。形が違えば落とす */
export function greetingName(greeting) {
  const match = /^こんにちは、(.*)！$/u.exec(greeting);
  expect(match !== null && match[0] === greeting && validName(match[1]),
    'apprentice', 'ai/hello.txt は「こんにちは、GridHub！」のような一行にしてください。名前は空にせず、前後の空白や改行を除いてください。');
  return match[1];
}

export function readGreeting() {
  const greeting = readGreetingText();
  greetingName(greeting);
  return greeting;
}

export function readCardObject() {
  return readObject('ai/card.json', 'apprentice');
}

export function readCard() {
  const card = readCardObject();
  expect(validName(card.name), 'apprentice',
    'ai/card.json の name は、前後に空白も改行もない空でない文字列にしてください。');
  const greeting = readGreeting();
  expect(card.message === greetingFor(card.name), 'apprentice',
    'ai/card.json の message を「こんにちは、<name の値>！」にしてください。最後は全角の「！」です。');
  expect(card.message === greeting, 'apprentice',
    'ai/card.json の message と ai/hello.txt の本文が違います。同じあいさつにそろえてください。');
  return card;
}

export function readJoinedCard() {
  const request = readObject('human/request.json', 'player');
  expect(validName(request.name), 'player',
    'human/request.json の name は、前後に空白も改行もない空でない文字列にしてください。');
  const card = readCard();
  expect(card.name === request.name, 'apprentice',
    'ai/card.json の name が human/request.json の name と違います。カードとあいさつを、勇者が決めた名前にそろえてください。');
  return card;
}

export function requireReady(card) {
  expect(card.ready === true, 'apprentice',
    'ai/card.json に "ready": true を追加してください。true は二重引用符で囲まない真偽値です。');
}

/** ゲート（G1・GOAL）の判定: 合格か、不合格の理由と責任（MASUME_BLAME）を出す */
export function runCheck(label, check, { gate = false } = {}) {
  try {
    check();
    console.log(`合格: ${label}`);
  } catch (error) {
    if (error instanceof CheckFailure) {
      console.error(`不合格: ${error.message}`);
      if (gate) console.error(`MASUME_BLAME: ${error.character}`);
    } else {
      console.error('判定を実行できませんでした。判定ファイルを変更せず、次のエラーを GM に伝えてください。');
      console.error(error.message);
    }
    process.exitCode = 1;
  }
}
