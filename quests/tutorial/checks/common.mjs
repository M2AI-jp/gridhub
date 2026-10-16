import { readFileSync } from 'node:fs';

class CheckFailure extends Error {
  constructor(character, message) {
    super(message);
    this.character = character;
  }
}

function requireThat(condition, character, message) {
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
  requireThat(value !== null && typeof value === 'object' && !Array.isArray(value),
    character, `${path} は { ... } の形の JSON オブジェクトにしてください。`);
  return value;
}

function validName(name) {
  return typeof name === 'string' && name.length > 0
    && name === name.trim() && !/[\r\n\u2028\u2029]/u.test(name);
}

function greetingFor(name) {
  return `こんにちは、${name}！`;
}

export function readGreeting() {
  // テキストエディターが付ける末尾の改行を1つだけ許す。
  const greeting = readText('ai/hello.txt', 'apprentice').replace(/\r?\n$/u, '');
  const match = /^こんにちは、(.*)！$/u.exec(greeting);
  requireThat(match !== null && match[0] === greeting && validName(match[1]),
    'apprentice', 'ai/hello.txt は「こんにちは、マスメ！」のような一行にしてください。名前は空にせず、前後の空白や改行を除いてください。');
  return greeting;
}

export function readCard() {
  const card = readObject('ai/card.json', 'apprentice');
  requireThat(validName(card.name), 'apprentice',
    'ai/card.json の name は、前後に空白も改行もない空でない文字列にしてください。');
  const greeting = readGreeting();
  requireThat(card.message === greetingFor(card.name), 'apprentice',
    'ai/card.json の message を「こんにちは、<name の値>！」にしてください。最後は全角の「！」です。');
  requireThat(card.message === greeting, 'apprentice',
    'ai/card.json の message と ai/hello.txt の本文が違います。同じあいさつにそろえてください。');
  return card;
}

export function readJoinedCard() {
  const request = readObject('human/request.json', 'player');
  requireThat(validName(request.name), 'player',
    'human/request.json の name は、前後に空白も改行もない空でない文字列にしてください。');
  const card = readCard();
  requireThat(card.name === request.name, 'apprentice',
    'ai/card.json の name が human/request.json の name と違います。カードとあいさつを、勇者が決めた名前にそろえてください。');
  return card;
}

export function requireReady(card) {
  requireThat(card.ready === true, 'apprentice',
    'ai/card.json に "ready": true を追加してください。true は二重引用符で囲まない真偽値です。');
}

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
