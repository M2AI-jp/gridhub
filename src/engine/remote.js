// GitHub への導線（第12章）: リモート（GitHub など）への push と、つなぐための手引き。
// ユーザーの言葉:「Github知らない人でもGitとかGithubで管理できるようになってるといい」。
// push の結果は冒険の書に `pushed` として、自動 push の設定は `git_settings` として残す（ビューは冒険の書だけから作る）。
// 生きた Git の状態（リモート・ahead・behind）と gh の状態は、ビューではなく gitStatus / ghStatus / gitGuide で返す。
import { execFile, spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { MasumeError } from './errors.js';
import { gitRunner } from './save.js';
import { appendEventsLocked, defaultActor, inspectLog, requireHealthy, withLock } from './store.js';

/** URL から、ユーザー名・パスワード・トークン（user:token@）を消す（記録や画面に出さない） */
export function safeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/iu, '$1');
}

/**
 * いまの Git の状態（Git を呼ぶ。ビューには入れない）。
 * { inside, root, branch, head, remote: {name, url} | null, upstream, ahead, behind, error? }
 * behind は、最後に fetch した時点のリモートとの差（ここでは fetch しない）。
 */
export function gitStatus(root) {
  const none = { inside: false, root: null, branch: null, head: null, remote: null, upstream: null, ahead: 0, behind: 0 };
  const git = gitRunner(resolve(root));
  let info;
  try {
    info = git(['rev-parse', '--is-inside-work-tree', '--show-toplevel'], { allowFail: true });
  } catch (error) {
    return { ...none, error: error.message };
  }
  const [inside, top] = info.out.split('\n');
  if (info.code !== 0 || inside?.trim() !== 'true' || !top) return none;
  const run = gitRunner(top.trim());
  const ask = (args) => {
    const r = run(args, { allowFail: true });
    return r.code === 0 ? r.out.trim() : null;
  };
  const branch = ask(['symbolic-ref', '--short', '-q', 'HEAD']);
  const head = ask(['rev-parse', '--verify', '-q', 'HEAD']);
  const upstream = branch ? ask(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']) : null;
  const remotes = (ask(['remote']) ?? '').split('\n').filter(Boolean);
  const upstreamRemote = upstream ? remotes.find((name) => upstream.startsWith(`${name}/`)) ?? null : null;
  const name = upstreamRemote ?? (remotes.includes('origin') ? 'origin' : remotes[0] ?? null);
  const remote = name ? { name, url: safeUrl(ask(['config', '--get', `remote.${name}.url`])) } : null;
  let ahead = 0;
  let behind = 0;
  if (head) {
    const tracking = upstream ?? (remote && branch && ask(['rev-parse', '--verify', '-q', `refs/remotes/${remote.name}/${branch}`]) ? `${remote.name}/${branch}` : null);
    if (tracking) {
      const counts = (ask(['rev-list', '--left-right', '--count', `HEAD...${tracking}`]) ?? '0 0').split(/\s+/u).map(Number);
      [ahead, behind] = [counts[0] || 0, counts[1] || 0];
    } else {
      ahead = Number(ask(['rev-list', '--count', 'HEAD'])) || 0; // まだ一度も送っていない
    }
  }
  return { inside: true, root: top.trim(), branch, head, remote, upstream, ahead, behind };
}

/** GitHub CLI（gh）が入っているか、ログインしているか。MASUME_GH で gh の場所を差し替えられる（判定用） */
const GH_AUTH = ['auth', 'status', '--hostname', 'github.com'];
const ghEnv = () => ({ ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' });
function ghAuthOf(ok, text) {
  const user = text.match(/account\s+([A-Za-z0-9-]+)/u)?.[1] ?? text.match(/Logged in to \S+ as ([A-Za-z0-9-]+)/u)?.[1] ?? null;
  return { installed: true, authed: ok, user: ok ? user : null };
}

export function ghStatus() {
  const bin = process.env.MASUME_GH || 'gh';
  const version = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  if (version.error || version.status !== 0) return { installed: false, authed: false, user: null };
  const auth = spawnSync(bin, GH_AUTH, { encoding: 'utf8', timeout: 10_000, env: ghEnv() });
  return ghAuthOf(!auth.error && auth.status === 0, `${auth.stdout ?? ''}\n${auth.stderr ?? ''}`);
}

/** ghStatus の非同期版（盤面のサーバーを止めない） */
export async function ghStatusAsync() {
  const bin = process.env.MASUME_GH || 'gh';
  const run = (args, timeout) => new Promise((done) => {
    execFile(bin, args, { encoding: 'utf8', timeout, env: ghEnv() }, (error, stdout, stderr) => done({ error, text: `${stdout ?? ''}\n${stderr ?? ''}` }));
  });
  const version = await run(['--version'], 5_000);
  if (version.error) return { installed: false, authed: false, user: null };
  const auth = await run(GH_AUTH, 10_000);
  return ghAuthOf(!auth.error, auth.text);
}

/** GitHub のリポジトリ名にしてよい形（フォルダ名から） */
function repoName(root) {
  const name = basename(root ?? '').replace(/[^A-Za-z0-9._-]+/gu, '-').replace(/^[-.]+|[-.]+$/gu, '');
  return name || 'my-gridhub-project';
}

/**
 * GitHub を知らない人のための手引き。上から順に、まだ済んでいない最初の手順が `next`。
 * status は gitStatus、gh は ghStatus、root はゲームのルート。
 * 戻り値: { steps: [{id, done, title, command, note}], next }
 */
export function gitGuide(status, gh, root) {
  const name = repoName(status.root ?? root);
  const steps = [
    {
      id: 'repo', done: status.inside, title: 'このフォルダを Git で管理する',
      command: 'git init', note: 'gridhub quest で始めた冒険では、もう済んでいます',
    },
    {
      id: 'commit', done: status.head !== null, title: '最初のコミット（セーブ）をつくる',
      command: 'git add -A && git commit -m "はじめのセーブ"', note: '町に着くと GridHub がコミットします',
    },
    {
      // もうリモートにつながっていれば（SSH や GitHub 以外のリモートでも）、ログインの手順は要らない
      id: 'login', done: gh.authed || status.remote !== null, title: 'GitHub にログインする',
      command: gh.installed ? 'gh auth login' : null,
      note: gh.installed ? 'ブラウザが開くので、GitHub のアカウントでログインします'
        : 'GitHub CLI（gh）を https://cli.github.com/ から入れると、gh auth login でブラウザからログインできます（gh を使わず、GitHub のサイトでリポジトリをつくってもかまいません）',
    },
    {
      id: 'remote', done: status.remote !== null, title: 'GitHub にリポジトリをつくって、つなぐ',
      command: gh.authed ? `gh repo create ${name} --private --source . --remote origin`
        : `git remote add origin https://github.com/<あなたのユーザー名>/${name}.git`,
      note: gh.authed ? '非公開（private）のリポジトリをつくって、このフォルダとつなぎます'
        : 'GitHub のサイトの「New repository」で空のリポジトリをつくり、その URL でつなぎます',
    },
    {
      id: 'push', done: status.remote !== null && status.upstream !== null && status.ahead === 0,
      title: 'GitHub に送る（push）', command: 'gridhub push',
      note: status.ahead > 0 ? `まだ送っていないコミットが ${status.ahead} 件あります` : '町でセーブしたら、ここで送ります（自動で送る設定もできます: gridhub push --auto on）',
    },
  ];
  return { steps, next: steps.find((step) => !step.done)?.id ?? null };
}

/** 冒険の書の自動 push の設定（最新の git_settings。無ければ false） */
export function autoPushOf(events) {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === 'git_settings') return events[i].data?.auto_push === true;
  }
  return false;
}

/** 送る前の確かめと、git push の引数。送れないなら fail に理由 */
function pushPlan(root) {
  const status = gitStatus(root);
  const fail = (error) => ({ ok: false, remote: status.remote?.name ?? null, branch: status.branch, commit: status.head, error });
  if (status.error) return { fail: fail(status.error) };
  if (!status.inside) return { fail: fail('ゲームのルートが Git の作業ツリーの中ではありません（gridhub push --guide で手引きを見る）') };
  if (!status.branch) return { fail: fail('ブランチの上にいません（detached HEAD）。git switch <ブランチ> で戻ってから送ってください') };
  if (!status.head) return { fail: fail('まだコミットがありません') };
  if (!status.remote) return { fail: fail('リモート（GitHub など）がつながっていません（gridhub push --guide で、つなぎ方を見る）') };
  const upstreamBranch = status.upstream?.slice(status.remote.name.length + 1);
  // force はしない。フックは走らせない（町のセーブと同じ）。資格情報を聞かれて止まらないようにする
  const args = ['-c', 'core.hooksPath=/dev/null', ...(status.upstream
    ? ['push', status.remote.name, `${status.branch}:${upstreamBranch}`]
    : ['push', '-u', status.remote.name, status.branch])];
  return { status, args, fail };
}

function pushEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', GCM_INTERACTIVE: 'never' };
  for (const key of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[key];
  return env;
}

function pushOutcome({ status, fail }, code, text) {
  if (code === 0) return { ok: true, remote: status.remote.name, branch: status.branch, commit: status.head };
  return fail(/rejected|non-fast-forward|fetch first/iu.test(text)
    ? 'リモートに、手元に無いコミットがあります。git pull で取り込んでから、もう一度送ってください'
    : /Authentication failed|could not read Username|Permission denied|403|terminal prompts disabled/iu.test(text)
      ? 'リモートにログインできていません（gh auth login でログインしてください）'
      : `git push に失敗しました: ${String(text).trim().split('\n').at(-1) ?? ''}`);
}

function recordPush(root, actor, auto, result) {
  const data = {
    remote: result.remote, branch: result.branch, commit: result.commit, ok: result.ok, auto,
    ...(result.ok ? {} : { error: result.error }),
  };
  const event = withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    return appendEventsLocked(root, [{ type: 'pushed', data }], { actor, previous: snapshot.events.at(-1) })[0];
  });
  return { exitCode: result.ok ? 0 : 1, event };
}

/**
 * リモートへ送り、結果を冒険の書に `pushed {remote, branch, commit, ok, auto, error?}` として残す。
 * 戻り値: { exitCode, event }（送れなければ exitCode 1。記録はする）
 */
export function push(root, { actor = defaultActor(), auto = false } = {}) {
  root = resolve(root);
  requireHealthy(inspectLog(root));
  const plan = pushPlan(root);
  if (plan.args === undefined) return recordPush(root, actor, auto, plan.fail);
  const r = spawnSync('git', plan.args, { cwd: plan.status.root, env: pushEnv(), encoding: 'utf8', timeout: 120_000 });
  const code = r.error ? -1 : r.status;
  return recordPush(root, actor, auto, pushOutcome(plan, code, r.error ? r.error.message : `${r.stderr ?? ''}\n${r.stdout ?? ''}`));
}

/** push の非同期版（盤面のサーバーを止めない） */
export async function pushAsync(root, { actor = defaultActor(), auto = false } = {}) {
  root = resolve(root);
  requireHealthy(inspectLog(root));
  const plan = pushPlan(root);
  if (plan.args === undefined) return recordPush(root, actor, auto, plan.fail);
  const { code, text } = await new Promise((done) => {
    execFile('git', plan.args, { cwd: plan.status.root, env: pushEnv(), encoding: 'utf8', timeout: 120_000 }, (error, stdout, stderr) => {
      done({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, text: `${stderr ?? ''}\n${stdout ?? ''}${error && typeof error.code !== 'number' ? `\n${error.message}` : ''}` });
    });
  });
  return recordPush(root, actor, auto, pushOutcome(plan, code, text));
}

/** 町のセーブのあとに自動で送るかどうかを、冒険の書に `git_settings {auto_push}` として残す */
export function setAutoPush(root, autoPush, { actor = defaultActor() } = {}) {
  if (typeof autoPush !== 'boolean') throw new MasumeError('E_USAGE', 'auto_push は true か false です');
  root = resolve(root);
  return withLock(root, actor, () => {
    const snapshot = requireHealthy(inspectLog(root));
    return appendEventsLocked(root, [{ type: 'git_settings', data: { auto_push: autoPush } }],
      { actor, previous: snapshot.events.at(-1) })[0];
  });
}

/**
 * 判定（宣言・ハンコ・ボス戦）の結果に、新しい町のセーブ（コミット）があり、自動 push が有効なら送る。
 * 送れなくても判定の結果は変えない（記録だけ）。ボス戦の中で送った分は、もう一度送らない。
 */
export function pushAfterSaves(root, result, { actor = defaultActor() } = {}) {
  const saved = result.events.filter((e) => e.type === 'saved' && typeof e.data?.commit === 'string' && e.data.changed === true);
  if (saved.length === 0) return result;
  const snapshot = inspectLog(resolve(root));
  if (!snapshot.ok || !autoPushOf(snapshot.events)) return result;
  const lastPush = snapshot.events.findLast((e) => e.type === 'pushed');
  if (lastPush && lastPush.seq > saved.at(-1).seq) return result;
  const pushed = push(root, { actor, auto: true });
  result.events.push(pushed.event);
  return result;
}

/**
 * ビューの git（冒険の書だけから。Git は呼ばない）:
 * { save, auto_push, last_push: {seq, commit, remote, branch, at} | null, push_error: {seq, error, at} | null, unpushed }
 * unpushed は、最後に送れたあとの、町のセーブ（変更があってコミットした saved）の数。
 */
export function gitView(map, events) {
  let autoPush = false;
  let lastPush = null;
  let pushError = null;
  let unpushed = 0;
  for (const event of events) {
    const data = event.data ?? {};
    if (event.type === 'git_settings') autoPush = data.auto_push === true;
    else if (event.type === 'pushed') {
      if (data.ok === true) {
        lastPush = { seq: event.seq, commit: data.commit ?? null, remote: data.remote ?? null, branch: data.branch ?? null, at: event.ts };
        pushError = null;
        unpushed = 0;
      } else pushError = { seq: event.seq, error: String(data.error ?? ''), at: event.ts };
    } else if (event.type === 'saved' && typeof data.commit === 'string' && data.changed === true) unpushed++;
  }
  return { save: map?.quest?.save === 'git', auto_push: autoPush, last_push: lastPush, push_error: pushError, unpushed };
}
