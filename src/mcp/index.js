// 伝令の MCP サーバー（CONTRACTS §19）。標準入出力で、1行に1つの JSON-RPC 2.0 メッセージを読み書きする。
// stdout はプロトコル専用。ログは stderr に出す。
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { checkArguments, findTool, listTools } from './tools.js';
import { killAll, runCli } from './runner.js';

const DEFAULT_PROTOCOL = '2025-06-18';

const ERR = { parse: -32700, request: -32600, method: -32601, params: -32602, internal: -32603 };

const DOCS = [
  ['RULEBOOK.md', 'GridHub ルールブック', 'ゲームのルール（マス・キャラクター・判定・ゲート・ハンコ）'],
  ['GM_GUIDE.md', 'GridHub GM ガイド', '地図（冒険）をつくる GM のための手引き'],
  ['CONTRACTS.md', 'GridHub 契約書', 'モジュール間の約束（CLI・API・MCP）'],
];

const INSTRUCTIONS = [
  'GridHub は、5mm方眼のすごろくで開発を進めるゲームです。あなたは盤上のキャラクターの1人として、いまのマスだけを実装します。',
  '1. masume_brief で指令書（いまのマス・縄張り・判定コマンド）を読む。',
  '2. 縄張りの中だけを実装し、判定を素振りする。判定ファイルや地図は編集しない。',
  '3. masume_check で宣言判定し、通ったら masume_note で次の自分への申し送りを書く。',
  '冒険の書がまだ無いときは、masume_quest に作りたいものの願いを渡して冒険をはじめる。ルールは資料 masume://docs/RULEBOOK.md にある。',
].join('\n');

class RpcError extends Error {
  constructor(code, message) {
    super(message);
    this.rpcCode = code;
  }
}

const idKey = (id) => `${typeof id}:${id}`;
const reply = (id, result) => ({ jsonrpc: '2.0', id, result });
const fail = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const textResult = (text, isError) => ({ content: [{ type: 'text', text: text === '' ? '（出力なし）' : text }], isError });

/**
 * MCP サーバーを標準入出力につなぐ。入力が閉じて、返事待ちの仕事が片づいたら解決する。
 * @param {{root: string, bin: string, repo: string, cwd: string, env: object, version?: string, input?: NodeJS.ReadableStream, output?: NodeJS.WritableStream, log?: (msg: string) => void}} options
 */
export function serveMcp({ root, bin, repo, cwd, env, version = '0.1.0', input = process.stdin, output = process.stdout, log = (m) => process.stderr.write(`${m}\n`) }) {
  const inflight = new Map(); // リクエストID → { run, cancelled }
  const pending = new Set(); // 返事待ちの仕事
  let questRunning = false;
  let closed = false;

  const send = (message) => {
    if (closed) return;
    output.write(`${JSON.stringify(message)}\n`);
  };

  async function readDoc(uri) {
    const doc = DOCS.find(([file]) => uri === `masume://docs/${file}`);
    if (!doc) throw new RpcError(ERR.params, `知らない資料です: ${uri}`);
    try {
      return await readFile(join(repo, 'docs', doc[0]), 'utf8');
    } catch (error) {
      throw new RpcError(ERR.internal, `資料を読めませんでした: ${error.message}`);
    }
  }

  async function callTool(params, key) {
    if (typeof params?.name !== 'string') throw new RpcError(ERR.params, 'name が必要です');
    const tool = findTool(params.name);
    if (!tool) return textResult(`知らない道具です: ${params.name}（tools/list で一覧を見てください）`, true);
    let args;
    try {
      args = checkArguments(tool, params.arguments);
    } catch (error) {
      return textResult(`${tool.name}: ${error.message}`, true);
    }
    if (tool.exclusive === 'quest') {
      if (questRunning) return textResult('すでに冒険をつくっている最中です。終わるまで待ってください', true);
      questRunning = true;
    }
    const [command, ...rest] = tool.argv(args);
    const run = runCli({ bin, args: [command, `--dir=${root}`, ...rest], cwd, env });
    if (key !== undefined && inflight.has(key)) inflight.get(key).run = run;
    try {
      const result = await run.result;
      const ok = result.code === 0;
      // JSON を頼まれた成功の返事は、stdout だけを返す（JSON として読めるように）
      const text = ok && tool.jsonOutput?.(args) ? result.stdout.trimEnd() : result.output.trimEnd();
      return textResult(text, !ok);
    } finally {
      if (tool.exclusive === 'quest') questRunning = false;
    }
  }

  /** 1リクエストを処理して返事（またはなし）を返す。 */
  async function dispatch(message) {
    // 相手からの返事（result / error だけで method が無いもの）には何も返さない
    if (message && typeof message === 'object' && !Array.isArray(message) && message.method === undefined && ('result' in message || 'error' in message)) return null;
    if (message === null || typeof message !== 'object' || Array.isArray(message) || typeof message.method !== 'string') {
      return fail(message && typeof message === 'object' && 'id' in message ? message.id ?? null : null, ERR.request, 'JSON-RPC のリクエストではありません');
    }
    const { id, method, params } = message;
    const isNotification = id === undefined;
    if (isNotification) {
      if (method === 'notifications/cancelled' && params && params.requestId !== undefined) {
        const entry = inflight.get(idKey(params.requestId));
        if (entry) {
          entry.cancelled = true;
          entry.run?.kill('SIGTERM');
        }
      }
      return null;
    }
    const key = idKey(id);
    inflight.set(key, { run: null, cancelled: false });
    try {
      let result;
      switch (method) {
        case 'initialize':
          result = {
            protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : DEFAULT_PROTOCOL,
            capabilities: { tools: {}, resources: {} },
            serverInfo: { name: 'masume', version },
            instructions: INSTRUCTIONS,
          };
          break;
        case 'ping':
          result = {};
          break;
        case 'tools/list':
          result = { tools: listTools() };
          break;
        case 'tools/call':
          result = await callTool(params, key);
          break;
        case 'resources/list':
          result = { resources: DOCS.map(([file, name, description]) => ({ uri: `masume://docs/${file}`, name, description, mimeType: 'text/markdown' })) };
          break;
        case 'resources/templates/list':
          result = { resourceTemplates: [] };
          break;
        case 'resources/read': {
          if (typeof params?.uri !== 'string') throw new RpcError(ERR.params, 'uri が必要です');
          const text = await readDoc(params.uri);
          result = { contents: [{ uri: params.uri, mimeType: 'text/markdown', text }] };
          break;
        }
        default:
          throw new RpcError(ERR.method, `知らないメソッドです: ${method}`);
      }
      // 取り消された依頼には返事をしない（MCP の約束）
      return inflight.get(key)?.cancelled ? null : reply(id, result);
    } catch (error) {
      if (inflight.get(key)?.cancelled) return null;
      if (error instanceof RpcError) return fail(id, error.rpcCode, error.message);
      log(`gridhub mcp: ${method} の処理で想定外のエラー: ${error?.stack ?? error}`);
      return fail(id, ERR.internal, `内部エラー: ${error?.message ?? error}`);
    } finally {
      inflight.delete(key);
    }
  }

  async function handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send(fail(null, ERR.parse, 'JSON として読めません'));
      return;
    }
    if (Array.isArray(message)) {
      if (message.length === 0) return send(fail(null, ERR.request, '空のバッチです'));
      const replies = (await Promise.all(message.map(dispatch))).filter((r) => r !== null);
      if (replies.length > 0) send(replies);
      return;
    }
    const response = await dispatch(message);
    if (response !== null) send(response);
  }

  const rl = createInterface({ input, crlfDelay: Infinity });
  rl.on('line', (line) => {
    const text = line.trim();
    if (!text) return;
    const work = handleLine(text).catch((error) => log(`gridhub mcp: ${error?.stack ?? error}`));
    pending.add(work);
    work.finally(() => pending.delete(work));
  });

  return new Promise((resolve) => {
    const shutdown = (signal) => {
      closed = true;
      killAll(signal === 'SIGINT' || signal === 'SIGHUP' ? 'SIGINT' : 'SIGTERM');
      rl.close();
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('SIGHUP', onSignal);
      // 子が止まるのを少し待ってから抜ける
      setTimeout(resolve, 200, 0);
    };
    const onSignal = (signal) => shutdown(signal);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP', onSignal);
    output.on?.('error', () => shutdown('SIGTERM')); // 相手が先に閉じた（EPIPE）
    rl.once('close', async () => {
      if (closed) return;
      // 入力が閉じても、頼まれた仕事は片づけてから抜ける
      while (pending.size > 0) await Promise.allSettled([...pending]);
      closed = true;
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('SIGHUP', onSignal);
      resolve(0);
    });
  });
}
