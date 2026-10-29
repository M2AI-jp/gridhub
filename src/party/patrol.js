// 軍師の巡回（CONTRACTS §13）。ビューを読む → ボス戦 → 候補を出撃 → 帰還を記録、をあがるか止まるまで繰り返す。
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  MasumeError, buildView, outputFile, recordLine, recordReturn, recordSortie,
} from '../engine/index.js';
import { launch } from './agents.js';
import { startBoss } from './boss.js';
import { buildPrompt, sq } from './prompt.js';
import { DEFAULT_TACTIC, TACTICS } from './tactics.js';

const ACTOR = 'party';
const LOST_AFTER = 2; // 進めずに帰還したことが続いたら迷子
const BOSS_TRIES = 3;
const BOSS_RETRY = new Set(['E_CONFLICT', 'E_DONE', 'E_PARTY_INCOMPLETE']); // 読み直せば解ける（ほかの指揮役が先に動いた等）
const BUSY_LIMIT = 5; // E_BUSY が続いても出撃中に見えないキャラクターは、今回の巡回では諦める

/** 判定ファイル（seal）を持つ cmd のマスで、まだ封印されていない（CONTRACTS §26.3） */
export const needsSeal = (node) => node?.check?.kind === 'cmd' && (node.check.seal?.length ?? 0) > 0 && node.sealed === false;

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
  constructor({ root, bin, env, agent, parallel, rounds, only = null, timeoutMs, tactic = TACTICS[DEFAULT_TACTIC], out = console.log }) {
    this.tactic = tactic;
    Object.assign(this, { root, bin, env, agent, parallel, rounds, only, timeoutMs });
    this.out = out;
    this.active = new Map(); // characterId → { seq, handle, promise, node, name }
    this.misses = new Map(); // characterId → 進めずに帰還した連続回数
    this.lost = new Set();
    this.bossTries = new Map();
    this.bossBlocked = new Map(); // gateId → 理由
    this.busyHits = new Map(); // characterId → E_BUSY を受けた回数（ほかの指揮役がすでに出撃させている）
    this.fight = null; // いま動いているボス戦
    this.unlaunchable = null; // エージェントを起動できなかった理由 { file, code, why }。分かったら迷子にせず、理由を出して止まる
    this.promptCount = 0;
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
    // ボス戦の判定（とその子孫）も止める
    this.fight?.stop({ force: again });
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

  /** @returns {boolean} 出撃させたら true。ほかの指揮役がすでに出撃させていた（E_BUSY）ときは false */
  startSortie(view, c) {
    const prompt = buildPrompt({ root: this.root, bin: this.bin, view, characterId: c.id, tactic: this.tactic });
    // プロンプトのファイルは、sortie を記録する前に書く（書けなくて、帰還のない出撃が残らないように。§26.5）
    const promptFile = join(this.promptDir, `${c.id.replace(/[^A-Za-z0-9_.-]/gu, '_')}-${++this.promptCount}.md`);
    try {
      writeFileSync(promptFile, prompt);
    } catch (error) {
      rmSync(promptFile, { force: true });
      throw new MasumeError('E_PROMPT', `プロンプトのファイルを書けません（${promptFile}）: ${error.code ?? error.message}`);
    }
    let event;
    try {
      event = recordSortie(this.root, c.id, { actor: ACTOR, agent: this.agent.name, model: this.agent.model });
    } catch (error) {
      rmSync(promptFile, { force: true });
      if (error.code !== 'E_BUSY') throw error;
      // ほかの指揮役がすでに出撃させている。そのキャラクターは外して、自分の出撃は続ける（§26.2）
      this.busyHits.set(c.id, (this.busyHits.get(c.id) ?? 0) + 1);
      this.say(`${c.id}（${c.name}）はほかの指揮役がすでに出撃させているので、出撃させません`);
      return false;
    }
    this.busyHits.delete(c.id);
    this.launched++;
    const env = {
      ...this.env,
      MASUME_DIR: this.root,
      MASUME_BIN: this.bin,
      MASUME_CHARACTER: c.id,
      MASUME_NODE: c.at,
      MASUME_PROMPT_FILE: promptFile,
      MASUME_ACTOR: c.id,
    };
    // 入れ子の判定（node --test）が何も走らずに通ってしまわないように
    delete env.NODE_TEST_CONTEXT;
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
    return true;
  }

  async finishSortie(c, entry, { code, output, launchError = null }) {
    let event;
    try {
      event = recordReturn(this.root, c.id, { actor: ACTOR, sortie: entry.seq, code, log: output });
    } catch (error) {
      if (error.code !== 'E_USAGE') throw error;
      // 誰かが先に帰還を記録した（GM が return したなど）。こちらは記録せず、巡回は続ける
      this.say(`帰還 ${c.id}（${c.name}） seq ${entry.seq} はもう帰還が記録されています（code ${code}）`);
      return null;
    }
    this.returned++;
    const { node_before: before, node_after: after, advanced } = event.data;
    // 起動できない（コマンドが無い・sh が 127 で終わった）のはキャラクターのせいではない。迷子に数えず、巡回を止める
    if (launchError) this.unlaunchable ??= launchError;
    else if (code === 127) this.unlaunchable ??= { file: this.agent.file, code: null, why: `終了コード 127（コマンドが見つかりません）: ${this.agent.display}` };
    if (advanced) this.misses.set(c.id, 0);
    else if (!this.unlaunchable) {
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
    // ボス戦は子プロセスで起こす。中断のときは、判定のシェルとその子孫まで止められるように（§26.4）
    const fight = startBoss({ bin: this.bin, root: this.root, env: this.env, gate: gate.id });
    this.fight = fight;
    let outcome;
    try {
      outcome = await Promise.race([fight.done, this.interruptSignal.then(() => null)]);
      if (outcome === null) await fight.stop(); // 中断。止め終わるまで待つ
    } finally {
      await fight.stop(); // 例外で抜けるときも、判定を残さない（終わっていれば何もしない）
      this.fight = null;
    }
    if (outcome === null || outcome.stopped) return;

    if (outcome.error) {
      const { code, message, exitCode } = outcome.error;
      if (code === 'E_CURSED' || exitCode === 3) throw new MasumeError('E_CURSED', message, 3);
      const tries = (this.bossTries.get(gate.id) ?? 0) + 1;
      this.bossTries.set(gate.id, tries);
      this.say(`ボス戦に入れませんでした（${gate.id}）: [${code ?? 'ERROR'}] ${message}`);
      if (!BOSS_RETRY.has(code) || tries >= BOSS_TRIES) this.bossBlocked.set(gate.id, message);
      return;
    }
    this.bossTries.delete(gate.id);
    for (const event of outcome.result?.events ?? []) {
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
      // 例外で抜けるときも、出撃中のエージェントとボス戦の判定を残さない
      for (const { handle } of this.active.values()) handle.stop('interrupt');
      await Promise.allSettled([this.fight?.stop(), ...[...this.active.values()].map((e) => e.promise)]);
      rmSync(this.promptDir, { recursive: true, force: true });
    }
  }

  async loop() {
    const first = await this.view();
    this.out(`出撃準備: ${first.quest.title}（エージェント ${this.agent.display}／同時 ${this.parallel}人／上限 ${this.rounds}回${this.only ? `／対象 ${[...this.only].join(',')}` : ''}／作戦: ${this.tactic.name}）`);
    for (;;) {
      if (this.fatal) throw this.fatal;
      if (this.interrupted) return this.finishInterrupted();
      const view = await this.view();

      if (view.finished) {
        await Promise.allSettled([...this.active.values()].map((e) => e.promise));
        if (this.fatal) throw this.fatal;
        this.out(`あがり！ ${view.quest.title} を最後まで走りきりました（${recordLine(view.head)}）`);
        return 0;
      }

      // 2. 揃ったゲートは、パーティ自身がボス戦をする。判定が封印されていないゲートには入らない
      const unsealed = new Set();
      const gates = [];
      for (const n of Object.values(view.nodes)) {
        if (n.type !== 'gate' || n.state !== 'ready' || this.bossBlocked.has(n.id)) continue;
        if (needsSeal(n)) unsealed.add(n.id);
        else gates.push(n);
      }
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
        if (c.sortie || (this.busyHits.get(c.id) ?? 0) >= BUSY_LIMIT) {
          foreign.push(c);
          continue;
        }
        if (this.only && !this.only.has(c.id)) continue;
        if (this.lost.has(c.id)) continue;
        // 未封印のマスには出撃させない。止まるときの理由に出す（§26.3）
        if (needsSeal(view.nodes[c.at])) {
          unsealed.add(c.at);
          continue;
        }
        candidates.push(c);
      }

      // エージェントを起動できないと分かったら、これ以上は出撃させず、出撃中の帰還を待って理由を出して止まる
      if (this.unlaunchable) {
        await Promise.allSettled([...this.active.values()].map((e) => e.promise));
        if (this.fatal) throw this.fatal;
        return this.stop(view, { stamps, foreign, unsealed, exhausted: false, unlaunchable: this.unlaunchable });
      }

      // 5. 出撃中が parallel 未満の間、1人ずつ出撃させる
      const wanted = candidates.length > 0;
      let retry = false;
      while (!this.interrupted && candidates.length && this.active.size < this.parallel && this.launched < this.rounds) {
        // ほかの指揮役にすでに出撃させられていたら、そのキャラクターだけ外して続ける
        if (!this.startSortie(view, candidates.shift())) retry = true;
      }

      if (this.active.size > 0) {
        await Promise.race([...[...this.active.values()].map((e) => e.promise), this.interruptSignal]);
        continue;
      }
      if (this.interrupted) return this.finishInterrupted();
      if (retry) continue; // 外したキャラクターの出撃中の記録を、読み直して確かめる

      // 4. 候補もなく、出撃中もいない → 止まる
      return this.stop(view, { stamps, foreign, unsealed, exhausted: wanted && this.launched >= this.rounds });
    }
  }

  async finishInterrupted() {
    this.say('中断します。出撃中のエージェントを止めて、帰還を記録します');
    await Promise.allSettled([...this.active.values()].map((e) => e.promise));
    this.say(`中断しました（出撃 ${this.launched}回・帰還 ${this.returned}回）`);
    return 130;
  }

  stop(view, { stamps, foreign, unsealed, exhausted, unlaunchable = null }) {
    const reasons = [];
    if (unlaunchable) {
      const hint = unlaunchable.code === 'ENOENT'
        ? `${unlaunchable.file === 'claude' ? 'Claude Code' : unlaunchable.file === 'codex' ? 'Codex CLI' : unlaunchable.file} を入れてログインしてから、もう一度 gridhub party を打ってください（別のエージェントなら --agent claude|codex|cmd:<command>）`
        : 'コマンドを確かめてから、もう一度 gridhub party を打ってください';
      reasons.push(`エージェントを起動できません: ${unlaunchable.why}。${hint}`);
    }
    if (stamps.length) {
      reasons.push(`ハンコ待ち: ${[...new Set(stamps)].join('、')}`);
    }
    if (unsealed.size) {
      reasons.push(`未封印: ${[...unsealed].join('、')}（判定ファイルがまだ封印されていないので、出撃させません）`);
    }
    if (this.lost.size) {
      reasons.push(`迷子: ${[...this.lost].join('、')}（${LOST_AFTER}回続けて進めなかった）`);
    }
    if (exhausted) reasons.push(`巡回の上限: --rounds ${this.rounds} を使い切りました`);
    for (const [gate, why] of this.bossBlocked) reasons.push(`ボス戦に入れません: ${gate}（${why}）`);
    for (const c of foreign) {
      const seq = c.sortie?.seq;
      reasons.push(seq === undefined
        ? `ほかの指揮役が出撃させています: ${c.id}`
        : `出撃中の記録が残っています: ${c.id}（seq ${seq}）。止まっているなら node ${sq(this.bin)} return ${c.id} --sortie ${seq} --code 130 --dir ${sq(this.root)}`);
    }
    if (!reasons.length) reasons.push('進められるキャラクターがいません');
    this.say(`止まります（出撃 ${this.launched}回・帰還 ${this.returned}回）`);
    for (const r of reasons) this.out(`  ${r}`);
    for (const id of new Set(stamps)) {
      const node = view.nodes[id];
      const by = node.check?.by ?? '<humanId>';
      this.out(`  ハンコは: node ${sq(this.bin)} stamp ${id} --as ${by} --dir ${sq(this.root)}`);
    }
    if (unsealed.size) {
      const ids = [...unsealed].join(' ');
      this.out(`  封印の案内（GM の仕事です）: gridhub seal ${ids} — node ${sq(this.bin)} seal ${ids} --dir ${sq(this.root)}`);
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
