#!/usr/bin/env node
// 旧名 masume の受付係（別名）。中身は bin/gridhub.js と同じ。ctx.bin はこのファイル（実際に起動したもの）。
import { fileURLToPath } from 'node:url';
import { main } from './gridhub.js';

process.exitCode = await main(fileURLToPath(import.meta.url));
