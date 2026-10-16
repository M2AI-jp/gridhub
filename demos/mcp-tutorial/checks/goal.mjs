import { readJoinedCard, requireReady, runCheck } from './common.mjs';

runCheck('お願いどおりのあいさつカードが完成しました。あがりです！',
  () => requireReady(readJoinedCard()), { gate: true });
