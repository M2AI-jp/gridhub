export const COLUMNS = [
  'ID', 'Title', 'Description', 'Status', 'Assignee',
  'Project', 'Milestone', 'Labels', 'Estimate',
];

const STATUSES = {
  cleared: 'Done',
  current: 'In Progress',
  waiting: 'In Review',
  ready: 'In Review',
  stale: 'Todo',
  open: 'Todo',
  fog: 'Backlog',
};

export function exportIssues(view) {
  const characters = new Map(view.characters.map((character) => [character.id, character]));
  return Object.entries(view.nodes)
    .filter(([, node]) => node.type === 'task' || node.type === 'gate')
    .map(([id, node]) => {
      const gate = node.type === 'gate';
      const owner = characters.get(node.owner);
      const milestone = gate ? id
        : owner.path.slice(owner.path.indexOf(id)).find((next) => view.nodes[next].type === 'gate');
      const judgment = node.check.kind === 'stamp'
        ? `${characters.get(node.check.by).name}のハンコ`
        : `\`${node.check.run}\``;
      return {
        ID: id,
        Title: node.title,
        Description: `${node.detail ?? ''}\n\n判定: ${judgment}`,
        Status: STATUSES[node.state],
        Assignee: gate ? node.members.map((member) => characters.get(member).name).join(' & ') : owner.name,
        Project: view.quest.title,
        Milestone: view.nodes[milestone].title,
        Labels: [...(node.labels ?? []), gate ? 'gate' : owner.id, ...(node.state === 'stale' ? ['要再検証'] : [])],
        Estimate: node.estimate ?? '',
      };
    });
}

function quoteCell(value) {
  const text = String(value);
  return /[",\r\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function issuesCsv(issues) {
  const rows = [COLUMNS, ...issues.map((issue) => COLUMNS.map((column) =>
    column === 'Labels' ? issue.Labels.join(',') : issue[column]))];
  return `${rows.map((row) => row.map(quoteCell).join(',')).join('\n')}\n`;
}
