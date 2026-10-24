// GitHub につなぐ導線（CONTRACTS §56）。ユーザーの言葉:「Github知らない人でもGitとかGithubで管理できるようになってるといい」。
// Git の様子はビュー（冒険の書）には入れない（§52.3）。ここで読み、gridhub remote・gridhub push・窓口が使う。
// push はするが、force push はしない。フックは走らせない。冒険の書には書かない。
import { execFile, spawnSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { MasumeError } from './errors.js';
import { gitRunner } from './save.js';

/** URL から、ユーザー名・パスワード・トークン（user:token@）を消す（画面や記録に出さない） */
export function safeUrl(url) {
  if (typeof url !== 'string' || !url) return null;
  return url.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/iu, '$1');
}

/**
 * いまの Git の様子（Git を呼ぶ）: { inside, branch, head, remote: {name, url, github} | null, upstream, ahead, behind, root }
 * remote は上流のリモート、無ければ origin、無ければ最初のリモート。ahead・behind は上流と比べた数（上流が無ければ null。fetch はしない）。
 */
export function gitStatus(root) {
  const none = { inside: false, branch: null, head: null, remote: null, upstream: null, ahead: null, behind: null, root: null };
  let info;
  try {
    info = gitRunner(resolve(root))(['rev-parse', '--is-inside-work-tree', '--show-toplevel'], { allowFail: true });
  } catch {
    return none; // git が無い
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
  // 上流のリモート名は、いちばん長く一致するもの（リモート名に / が入っていてもよいように）
  const upstreamRemote = upstream
    ? remotes.filter((name) => upstream.startsWith(`${name}/`)).sort((a, b) => b.length - a.length)[0] ?? null : null;
  const name = upstreamRemote ?? (remotes.includes('origin') ? 'origin' : remotes[0] ?? null);
  const url = name ? safeUrl(ask(['config', '--get', `remote.${name}.url`])) : null;
  const remote = name ? { name, url, github: typeof url === 'string' && url.includes('github.com') } : null;
  let ahead = null;
  let behind = null;
  if (upstream && head) {
    const counts = ask(['rev-list', '--left-right', '--count', 'HEAD...@{u}'])?.split(/\s+/u).map(Number);
    if (counts?.length === 2 && counts.every(Number.isInteger)) [ahead, behind] = counts;
  }
  return { inside: true, branch, head, remote, upstream, ahead, behind, root: top.trim() };
}

const GH_AUTH = ['auth', 'status', '--hostname', 'github.com'];
const ghBin = () => process.env.MASUME_GH || 'gh';
const ghEnv = () => ({ ...process.env, GH_PROMPT_DISABLED: '1', NO_COLOR: '1' });

/** gh（MASUME_GH、既定 gh）があるか、ログインしているか: { installed, authenticated: true | false | null } */
export function ghStatus() {
  const version = spawnSync(ghBin(), ['--version'], { encoding: 'utf8', timeout: 5_000, env: ghEnv() });
  if (version.error || version.status !== 0) return { installed: false, authenticated: null };
  const auth = spawnSync(ghBin(), GH_AUTH, { encoding: 'utf8', timeout: 10_000, env: ghEnv() });
  return { installed: true, authenticated: !auth.error && auth.status === 0 };
}

/** ghStatus の非同期版（gh auth status はネットワークを使うことがあるので、盤面のサーバーを止めない） */
export async function ghStatusAsync() {
  const run = (args, timeout) => new Promise((done) => {
    execFile(ghBin(), args, { encoding: 'utf8', timeout, env: ghEnv() }, (error) => done(!error));
  });
  if (!await run(['--version'], 5_000)) return { installed: false, authenticated: null };
  return { installed: true, authenticated: await run(GH_AUTH, 10_000) };
}

/** シェルにそのまま貼れる形（安全な字だけならそのまま、ほかは単一引用符で包む） */
const word = (text) => (/^[A-Za-z0-9_.@%+=:,/-]+$/u.test(text) ? text : `'${String(text).replace(/'/gu, `'\\''`)}'`);

/** GitHub を知らない人のための手引き（§56.1）。git・gh・login・repo・push の順 */
export function gitSteps(status, gh, root) {
  const folder = basename(resolve(root)) || 'my-gridhub-project';
  return [
    {
      id: 'git', done: status.inside, command: 'git init',
      text: status.inside ? 'このフォルダは Git で管理されています' : 'このフォルダを Git で管理します（gridhub quest で始めた冒険では済んでいます）',
    },
    {
      id: 'gh', done: gh.installed, command: null,
      text: gh.installed ? 'GitHub CLI（gh）が入っています' : 'GitHub CLI（gh）を https://cli.github.com/ から入れます（ブラウザで GitHub にログインできるようになります）',
    },
    {
      id: 'login', done: gh.authenticated === true, command: 'gh auth login',
      text: gh.authenticated === true ? 'GitHub にログインしています' : 'GitHub にログインします（ブラウザが開きます）',
    },
    {
      id: 'repo', done: status.remote !== null, command: `gh repo create ${word(folder)} --private --source . --remote origin`,
      text: status.remote !== null ? `リモート ${status.remote.name} につながっています` : 'GitHub に非公開のリポジトリをつくって、このフォルダとつなぎます',
    },
    {
      id: 'push', done: status.upstream !== null && status.ahead === 0, command: 'gridhub push',
      text: status.upstream === null ? 'GitHub にまだ一度も送っていません。送ります'
        : status.ahead === 0 ? 'GitHub に送っていないセーブはありません' : `GitHub に送っていないセーブが ${status.ahead} 件あります。送ります`,
    },
  ];
}

/** gridhub remote --json の中身（§56.1）。gh を渡さなければ、ここで調べる */
export function remoteInfo(root, gh = ghStatus()) {
  const { root: _top, ...status } = gitStatus(root);
  return { ...status, gh, steps: gitSteps(status, gh, root) };
}

/** remoteInfo の非同期版（窓口用） */
export async function remoteInfoAsync(root) {
  return remoteInfo(root, await ghStatusAsync());
}

/**
 * いまのブランチをリモートに送る（§56.2）。上流があればそこへ、無ければ -u <remote> <branch>。force はしない。フックは走らせない。
 * Git の外 E_NO_GIT/2、リモートが無い E_NO_REMOTE/2、HEAD が切り離されている E_USAGE/2 を投げる。
 * 戻り値: { ok, remote, branch, commit, ahead, output }（送れなければ ok: false）。冒険の書には書かない。
 */
export function push(root) {
  const status = gitStatus(root);
  if (!status.inside) throw new MasumeError('E_NO_GIT', 'ここは Git の作業ツリーではありません（まず git init。gridhub remote で手引きを見る）');
  if (!status.branch) throw new MasumeError('E_USAGE', 'HEAD がブランチから切り離されています。git switch <ブランチ> で戻ってから送ってください');
  if (!status.remote) {
    const repo = gitSteps(status, { installed: false, authenticated: null }, root).find((step) => step.id === 'repo');
    throw new MasumeError('E_NO_REMOTE', `リモート（GitHub など）がつながっていません。つなぐには: ${repo.command}（くわしくは gridhub remote）`);
  }
  const target = status.upstream ? status.upstream.slice(status.remote.name.length + 1) : status.branch;
  const args = ['-c', 'core.hooksPath=/dev/null', 'push', ...(status.upstream ? [] : ['-u']), status.remote.name, `${status.branch}:${target}`];
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' };
  for (const key of ['GIT_INDEX_FILE', 'GIT_DIR', 'GIT_WORK_TREE', 'GIT_PREFIX']) delete env[key];
  const r = spawnSync('git', args, { cwd: status.root, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`.trim();
  const after = gitStatus(root);
  return {
    ok: !r.error && r.status === 0, remote: status.remote.name, branch: status.branch, commit: status.head,
    ahead: after.ahead, output,
  };
}
