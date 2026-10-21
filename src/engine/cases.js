// テスト1件ずつの成否を、判定の出力から読む（CONTRACTS §40）。
// 出力は `=== <nodeId>: <run> ===` の区切りごとに、そのマスの判定の出力になっている。

const DURATION = /\s+\(\d+(?:\.\d+)?\s*m?s\)$/u;
const DIRECTIVE = /\s+#\s*(.*)$/u;
const SPEC = [['✔', true], ['✖', false], ['﹣', null]];
const OTHER = [['✓', true], ['PASS', true], ['ok', true], ['✗', false], ['FAIL', false], ['NG', false], ['ng', false]];

function cleanName(text) {
  let name = text;
  let skipped = false;
  const directive = DIRECTIVE.exec(name);
  if (directive) {
    if (/^(SKIP|TODO)\b/iu.test(directive[1])) skipped = true;
    name = name.slice(0, directive.index);
  }
  name = name.replace(DURATION, '').trim();
  return { name, skipped };
}

function readLine(line) {
  const indent = /^[ \t]*/u.exec(line)[0].length;
  const body = line.slice(indent).replace(/\s+$/u, '');
  if (!body) return null;
  let match = /^(not ok|ok)\s+\d+(?:\s+-)?(?:\s+(.*))?$/u.exec(body);
  if (match) {
    const { name, skipped } = cleanName(match[2] ?? '');
    if (!name) return null;
    return { name, ok: skipped ? null : match[1] === 'ok', indent };
  }
  for (const [mark, ok] of [...SPEC, ...OTHER]) {
    if (!body.startsWith(mark) || !/^[ \t]/u.test(body.slice(mark.length))) continue;
    const { name, skipped } = cleanName(body.slice(mark.length));
    if (!name) return null;
    return { name, ok: skipped ? null : ok, indent };
  }
  return null;
}

/** 1つのマスの出力から、結果の行を出てきた順に読む */
export function readResults(text) {
  const results = [];
  for (const line of text.split(/\r\n|\n|\r/u)) {
    const body = line.trim();
    if (/^✖\s*failing tests:?$/u.test(body)) break;
    const result = readLine(line);
    if (result) results.push(result);
  }
  return results;
}

/** 出力を区切りごとに分ける。nodes は走らせた順のマスID（見出しの照合に使う） */
export function splitSections(output, nodes) {
  const text = typeof output === 'string' ? output : Buffer.from(output).toString('utf8');
  const lines = text.split('\n');
  const sections = [];
  let current = null;
  let next = 0;
  for (const line of lines) {
    const node = nodes[next];
    if (node !== undefined && line.startsWith(`=== ${node}: `)) {
      current = { node, lines: [] };
      sections.push(current);
      next++;
      continue;
    }
    current?.lines.push(line);
  }
  return sections.map(({ node, lines: body }) => {
    let code = null;
    for (let i = body.length - 1; i >= 0; i--) {
      const match = /^\(exit (-?\d+), \d+ms\)$/u.exec(body[i]);
      if (match) {
        code = Number(match[1]);
        body = body.slice(0, i);
        break;
      }
    }
    return { node, text: body.join('\n'), code };
  });
}

function uniqueInOrder(results) {
  const order = [];
  const last = new Map();
  for (const result of results) {
    if (!last.has(result.name)) order.push(result.name);
    last.set(result.name, result.ok);
  }
  return order.map((name) => ({ name, ok: last.get(name) }));
}

/** 1つのマスの結果を、地図の cases（無ければ null）と結びつける */
export function assignCases(results, cases, code) {
  const shallow = results.length ? Math.min(...results.map(({ indent }) => indent)) : 0;
  const top = uniqueInOrder(results.filter(({ indent }) => indent === shallow));
  if (!Array.isArray(cases) || cases.length === 0) {
    if (top.length) return top;
    return [{ name: '判定', ok: code === null ? null : code === 0 }];
  }
  const byName = new Map();
  for (const result of results) byName.set(result.name, result.ok);
  const named = cases.map((name) => name.trim());
  if (named.some((name) => byName.has(name))) {
    return cases.map((name, index) => ({ name, ok: byName.has(named[index]) ? byName.get(named[index]) : null }));
  }
  return cases.map((name, index) => ({ name, ok: top[index]?.ok ?? null }));
}

/** 判定の出力全体から {nodeId: [{name, ok}]} を作る。map は cases を引く地図 */
export function casesOf(output, ran, map) {
  const out = {};
  for (const section of splitSections(output, ran)) {
    out[section.node] = assignCases(readResults(section.text), map?.nodes?.[section.node]?.check?.cases, section.code);
  }
  return out;
}
