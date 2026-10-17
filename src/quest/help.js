// quest / init の --help の文面と、「箱のソケット:」の知らせ（CONTRACTS §32）。
// --allow-listen の名前と説明は、「ネットワークって何？ これはローカルのゲームなのに」と誤解されないように書く。

/** `--help` / `-h` が引数にあるか。`--` より後ろは願いなどの値なので見ない */
export function wantsHelp(argv) {
  for (const arg of argv) {
    if (arg === '--') return false;
    if (arg === '--help' || arg === '-h') return true;
  }
  return false;
}

/** --allow-listen の説明（§32.2 の4つ: 127.0.0.1・ローカル・設定の名前とインターネット・codex にだけ効く）。extra は command ごとの追記 */
const listenHelp = (extra) => [
  '  --allow-listen',
  '      判定（E2E）が 127.0.0.1 にサーバーを立てられるように、Codex の箱（サンドボックス）のソケットを開けます。',
  '      ゲームはローカルのままで、インターネットは要りません。',
  '      ただし Codex の設定 sandbox_workspace_write.network_access は localhost だけに絞れないので、',
  '      開けているあいだは、その箱の中のエージェントはインターネットにも出られます。',
  '      codex にだけ効きます（claude と cmd:<command> は変わりません）。',
  ...extra,
];

export function questHelp() {
  return [
    '使い方: masume quest "<願い>" [--gm claude|codex|cmd:<command>] [--model M] [--dir D] [--force] [--retries N] [--allow-listen] [--dry-run] [--json]',
    '',
    '願い（例: 「メモアプリのようなアプリを作りたい」）から、GM の LLM に地図と最初の判定を書かせて、新しい冒険をつくります。',
    '',
    'オプション:',
    '  --gm claude|codex|cmd:<command>',
    '      GM にする LLM（既定 claude）。環境変数 MASUME_GM_OVERRIDE があればそれが優先されます。',
    '  --model M      GM に使うモデル名（claude の既定は sonnet）',
    '  --dir D        冒険をつくるフォルダ（既定は今のフォルダ。無ければ作ります）',
    '  --force        すでに冒険の書があっても作り直す（無いときは E_EXISTS で止まります）',
    '  --retries N    GM の地図に指摘があったとき、GM に直させる回数（既定 2）',
    ...listenHelp([
      '      GM が codex のとき、GM の箱を開けます（GM が判定を素振りするときも、手元でサーバーを立てられます）。',
      '      生まれた冒険の .masume/party.json にも "allow_listen": true を書くので、出撃（masume party）の箱も開けたまま始まります。',
    ]),
    '  --dry-run      GM を呼ばず、起動するコマンドとプロンプトの先頭だけを見せる（何も書きません）',
    '  --json         結果を JSON で出す（知らせは stderr）',
    '  -h, --help     この説明を出して終わる（何も書かず、GM も呼びません）',
  ].join('\n');
}

export function initHelp() {
  return [
    '使い方: masume init [--dir D] [--agent claude|codex [--allow-listen]] [--force] [--json]',
    '',
    'よそのプロジェクトに、マスメの支度（AGENTS.md・CLAUDE.md・.gitignore。--agent があれば .masume/party.json も）をします。',
    '',
    'オプション:',
    '  --dir D        支度をするフォルダ（既定は今のフォルダ）',
    '  --agent claude|codex',
    '      masume party が出撃させるエージェントを .masume/party.json に書く（冒険の書があるときだけ）',
    ...listenHelp([
      '      --agent といっしょに使います（--agent が無いと E_USAGE）。',
      '      .masume/party.json に "allow_listen": true を書くので、masume party は出撃の箱を開けて始まります。',
    ]),
    '  --force        すでにある AGENTS.md・CLAUDE.md を書き直す',
    '  --json         結果を JSON で出す',
    '  -h, --help     この説明を出して終わる（何も書きません）',
  ].join('\n');
}

/**
 * 「箱のソケット:」の知らせ（§32.3）。--allow-listen を頼まれたときだけ1行を返す（頼まれていなければ null）。
 * gmKind は実際に呼ぶ GM（MASUME_GM_OVERRIDE を含む）。codex でなければ「効かない」ことを知らせる。
 */
export function listenNotice({ allowListen, gmKind }) {
  if (allowListen !== true) return null;
  if (gmKind === 'codex') {
    return '箱のソケット: GM の箱のソケットを開けます。判定が 127.0.0.1 にサーバーを立てられますが、ゲームはローカルのままです。開けているあいだ、GM はインターネットにも出られます';
  }
  return `箱のソケット: --allow-listen は codex にだけ効きます（この GM は ${gmKind === 'cmd' ? 'cmd:' : gmKind} なので、GM のコマンドは変わりません）`;
}
