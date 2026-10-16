import { readCard, requireReady, runCheck } from './common.mjs';

runCheck('カードに完成の印が付きました。', () => requireReady(readCard()));
