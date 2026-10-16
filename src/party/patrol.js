// 軍師の巡回（CONTRACTS §13）。ビューを読む → ボス戦 → 候補を出撃 → 帰還を記録、をあがるか止まるまで繰り返す。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MasumeError, buildView, check, outputFile, recordReturn, recordSortie,
} from '../engine/index.js';
import { launch } from './agents.js';
import { buildPrompt } from './prompt.js';

const ACTOR = 'party';
const LOST_AFTER = 2; // 進めずに帰還したことが続いたら迷子
const BOSS_TRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clock = () => new Date().toTimeString().slice(0, 8);

export class Party {
  /**
   * @param {object} o
   * @param {string} o.root ゲームのルート
   * @param {string} o.bin bin/masume.js の絶対パス
   * @param {NodeJS.ProcessEnv} o.env
   * @param {{name:string, model:string|null, file:string, args:string[], display:string}} o.agent
   * @param {number} o.parallel 同時に出撃させる人数
   * @param {number} o.rounds 出撃の上限
   * @param {Set<string>|null} o.only
   * @param {number} o.timeoutMs 1回の出撃のタイムアウト
   * @param {(line:string)=>void} [o.out]
   */
  constructor({ root, bin, env, agent, parallel, rounds, only = null, timeoutMs, out = console.log }) {
    Object.assign(this, { root, bin, env, agent, parallel, rounds, only, timeoutMs });
    this.out = out;
    this.active = new Map(); // characterId → { seq, handle, promise, node, name }
    this.misses = new Map(); // characterId → 進めずに帰還した連続回数
    this.lost = new Set();
    this.bossTries = new Map();
    this.bossBlocked = new Map(); // gateId → 理由
    this.launched = 0;
    this.returned = 0;
    this.interrupted = false;
    this.fatal = null;
    this.promptDir = null;
    this.wake = null;
    this.interruptSignal = new Promise((resolve) => {
      this.wake = resolve;
    });
  }

  say(text) {
    this.out(`[${clock()}] 軍師: ${text}`);
  }

  // ---- 外から呼ぶ ----

  /** SIGINT / SIGTERM。出撃中のエージェントを止める。2回目は即 SIGKILL。 */
  interrupt() {
    const again = this.interrupted;
    this.interrupted = true;
    this.wake();
    for (const { handle } of this.active.values()) handle.stop('interrupt', { force: again });
  }

  // ---- ビュー ----

  async view() {
    // 他のプロセスが追記している最中に読むと、一瞬だけ壊れて見えることがある。少し待ってやり直す。
    for (let i = 0; ; i++) {
      const view = buildView(this.root);
      if (view.integrity.ok) return view;
      if (i >= 5) {
        throw new MasumeError('E_CURSED', `冒険の書は呪われています（seq ${view.integrity.errors[0].seq}）。verify / repair で確認してください`, 3);
      }
      await sleep(150);
    }
  }

  // ---- 1回の出撃 ----

  startSortie(view, c) {
    const prompt = buildPrompt({ root: this.root, bin: this.bin, view, characterId: c.id });
    const event = recordSortie(this.root, c.id, { actor: ACTOR, agent: this.agent.name, model: this.agent.model });
    this.launched++;
    const promptFile = join(this.promptDir, `sortie-${String(event.seq).padStart(6, '0')}-${c.id}.md`);
    writeFileSync(promptFile, prompt);
    const env = {
      ...this.env,
      MASUME_DIR: this.root,
      MASUME_BIN: this.bin,
      MASUME_CHARACTER: c.id,
      MASUME_NODE: c.at,
      MASUME_PROMPT_FILE: promptFile,
      MASUME_ACTOR: c.id,
    };
    const handle = launch({ agent: this.agent, root: this.root, env, prompt, timeoutMs: this.timeoutMs });
    const entry = { seq: event.seq, handle, node: c.at, name: c.name };
    entry.promise = handle.done
      .then((result) => this.finishSortie(c, entry, result))
      .catch((error) => {
        this.fatal ??= error;
      })
      .finally(() => {
        this.active.delete(c.id);
        rmSync(promptFile, { force: true });
      });
    this.active.set(c.id, entry);
    const title = view.nodes[c.at]?.title ?? '';
    this.say(`出撃 ${c.id}（${c.name}） @ ${c.at}「${title}」 [${this.agent.name}${this.agent.model ? ` ${this.agent.model}` : ''}] seq ${event.seq}`);
    if (this.interrupted) handle.stop('interrupt');
  }

  async finishSortie(c, entry, { code, output }) {
    const event = recordReturn(this.root, c.id, { actor: ACTOR, sortie: entry.seq, code, log: output });
    this.returned++;
    const { node_before: before, node_after: after, advanced } = event.data;
    if (advanced) this.misses.set(c.id, 0);
    else {
      const n = (this.misses.get(c.id) ?? 0) + 1;
      this.misses.set(c.id, n);
      if (n >= LOST_AFTER) this.lost.add(c.id);
    }
    const reason = code === 124 ? '（時間切れ）' : code === 130 ? '（中断）' : code === 127 ? '（起動できない）' : '';
    this.say(`帰還 ${c.id}（${c.name}） ${before} → ${after ?? 'あがり'} ${advanced ? '進んだ' : '進めなかった'} code ${code}${reason} seq ${event.seq}`);
    if (!advanced && this.lost.has(c.id)) this.say(`${c.id}（${c.name}）は ${LOST_AFTER} 回続けて進めなかったので、迷子として出撃をやめます`);
    return event;
  }

  // ---- ボス戦 ----

  async boss(gate) {
    this.say(`ボス戦: ${gate.id}「${gate.title}」（メンバー: ${gate.members.join('、')}）`);
    let result;
    try {
      const fight = check(this.root, gate.id, { actor: ACTOR });
      fight.catch(() => {}); // 中断で待つのをやめたあとの失敗を、未処理にしない
      result = await Promise.race([fight, this.interruptSignal.then(() => null)]);
    } catch (error) {
      if (error.code === 'E_CURSED') throw error;
      const tries = (this.bossTries.get(gate.id) ?? 0) + 1;
      this.bossTries.set(gate.id, tries);
      this.say(`ボス戦に入れませんでした（${gate.id}）: [${error.code ?? 'ERROR'}] ${error.message}`);
      if (tries >= BOSS_TRIES || error.code !== 'E_CONFLICT') this.bossBlocked.set(gate.id, error.message);
      return;
    }
    if (result === null) return; // 中断
    for (const event of result.events) {
      const d = event.data;
      if (event.type === 'gate_cleared') this.say(`結合ゲート突破: ${d.gate} を ${d.members.join('、')} が突破しました`);
      else if (event.type === 'gate_failed') {
        this.say(`${d.blamed.length === d.members.length ? '全滅' : '差し戻し'}: ${d.gate} の判定失敗（責任: ${d.blamed.join('、')}）`);
        this.showOutput(event.seq, d.gate);
      }
    }
  }

  showOutput(seq, node) {
    try {
      const file = outputFile(this.root, seq);
      if (!file) return;
      const text = readTail(file, node);
      for (const line of text) this.out(`    ${line}`);
    } catch {
      // 出力が読めなくても巡回は止めない
    }
  }

  // ---- 本体 ----

  /** @returns {Promise<number>} 終了コード（0 あがり / 2 止まった / 130 中断） */
  async run() {
    this.promptDir = mkdtempSync(join(tmpdir(), 'masume-party-'));
    try {
      return await this.loop();
    } finally {
      // 例外で抜けるときも、出撃中のエージェントを残さない
      for (const { handle } of this.active.values()) handle.stop('interrupt');
      await Promise.allSettled([...this.active.values()].map((e) => e.promise));
      rmSync(this.promptDir, { recursive: true, force: true });
    }
  }

  async loop() {
    const first = await this.view();
    this.say(`出撃準備: ${first.quest.title}（エージェント ${this.agent.display}／同時 ${this.parallel}人／上限 ${this.rounds}回${this.only ? `／対象 ${[...this.only].join(',')}` : ''}）`);
    for (;;) {
      if (this.fatal) throw this.fatal;
      if (this.interrupted) return this.finishInterrupted();
      const view = await this.view();

      if (view.finished) {
        await Promise.allSettled([...this.active.values()].map((e) => e.promise));
        if (this.fatal) throw this.fatal;
        this.out(`あがり！ ${view.quest.title} を最後まで走りきりました（ふっかつのじゅもん: ${view.head.jumon}）`);
        return 0;
      }

      // 2. 揃ったゲートは、パーティ自身がボス戦をする
      const gates = Object.values(view.nodes).filter((n) => n.type === 'gate' && n.state === 'ready' && !this.bossBlocked.has(n.id));
      if (gates.length) {
        await this.boss(gates[0]);
        continue;
      }

      // 3. 候補
      const stamps = [];
      const candidates = [];
      const foreign = [];
      for (const c of view.characters) {
        if (c.status !== 'working' || c.at === null) continue;
        if (view.nodes[c.at]?.check?.kind === 'stamp') {
          stamps.push(c.at);
          continue;
        }
        if (c.kind !== 'agent') continue;
        if (this.active.has(c.id)) continue;
        if (c.sortie) {
          foreign.push(c);
          continue;
        }
        if (this.only && !this.only.has(c.id)) continue;
        if (this.lost.has(c.id)) continue;
        candidates.push(c);
      }

      // 5. 出撃中が parallel 未満の間、1人ずつ出撃させる
      const wanted = candidates.length > 0;
      while (!this.interrupted && candidates.length && this.active.size < this.parallel && this.launched < this.rounds) {
        this.startSortie(view, candidates.shift());
      }

      if (this.active.size > 0) {
        await Promise.race([...[...this.active.values()].map((e) => e.promise), this.interruptSignal]);
        continue;
      }
      if (this.interrupted) return this.finishInterrupted();

      // 4. 候補もなく、出撃中もいない → 止まる
      return this.stop(view, { stamps, foreign, exhausted: wanted && this.launched >= this.rounds });
    }
  }

  async finishInterrupted() {
    this.say('中断します。出撃中のエージェントを止めて、帰還を記録します');
    await Promise.allSettled([...this.active.values()].map((e) => e.promise));
    this.say(`中断しました（出撃 ${this.launched}回・帰還 ${this.returned}回）`);
    return 130;
  }

  stop(view, { stamps, foreign, exhausted }) {
    const reasons = [];
    if (stamps.length) {
      reasons.push(`ハンコ待ち: ${[...new Set(stamps)].join('、')}`);
    }
    if (this.lost.size) {
      reasons.push(`迷子: ${[...this.lost].join('、')}（${LOST_AFTER}回続けて進めなかった）`);
    }
    if (exhausted) reasons.push(`巡回の上限: --rounds ${this.rounds} を使い切りました`);
    for (const [gate, why] of this.bossBlocked) reasons.push(`ボス戦に入れません: ${gate}（${why}）`);
    for (const c of foreign) {
      reasons.push(`出撃中の記録が残っています: ${c.id}（seq ${c.sortie.seq}）。止まっているなら node "${this.bin}" return ${c.id} --sortie ${c.sortie.seq} --code 130 --dir "${this.root}"`);
    }
    if (!reasons.length) reasons.push('進められるキャラクターがいません');
    this.say(`止まります（出撃 ${this.launched}回・帰還 ${this.returned}回）`);
    for (const r of reasons) this.out(`  ${r}`);
    for (const id of new Set(stamps)) {
      const node = view.nodes[id];
      const by = node.check?.by ?? '<humanId>';
      this.out(`  ハンコは: node "${this.bin}" stamp ${id} --as ${by} --dir "${this.root}"`);
    }
    return 2;
  }
}

// 失敗した判定の出力のうち、そのマスの見出し以降の末尾20行
function readTail(file, node) {
  const text = readFileSync(file, 'utf8');
  const boundary = text.lastIndexOf(`\n=== ${node}: `);
  const failed = boundary >= 0 ? text.slice(boundary + 1) : text;
  return failed.replace(/\r?\n$/u, '').split(/\r\n|\n|\r/u).slice(-20);
}
