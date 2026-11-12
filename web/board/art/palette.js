// 世界の色（CONTRACTS §80.13）。design/pixel-lab/palette-gen.mjs が焼き付けた。手で直してよい。
// 各 ramp は 暗 → 明。暗いほど青紫へ、明るいほど黄へ色相がずれている（hue shift）。
// 絵はここにある色だけで描く（design/pixel-lab/lint.mjs が確かめる）。
export const RAMPS = {
  "ink":["#191428","#211b32","#332c47","#3e3a4c"],
  "skin":["#654245","#9b5f55","#c8805d","#eaa46e","#fec797","#fee3c6"],
  "tan":["#49282c","#79403a","#a45d40","#c47d4e","#d89c6f","#ddb592"],
  "deep":["#30171b","#572a29","#7b4230","#965c3d","#a77656","#ab8b71"],
  "blush":["#a97776","#efa8a7"],
  "red":["#4f152b","#902039","#cb3734","#f85e2f","#fd9769","#feb98f"],
  "brown":["#291316","#502925","#73422e","#8f5d3e","#a17859","#a88c74"],
  "black":["#10101b","#25273c","#3a3d5a","#55506b","#675f71"],
  "silver":["#5f636b","#87909e","#adbacc","#cde2ed","#ebfcff"],
  "blonde":["#81584b","#ba7e48","#dbae49","#fad47b","#fff1cf"],
  "rose":["#583451","#904a77","#c76394","#f680a6","#fdb2b9","#ffd2cd"],
  "teal":["#0e3944","#09646e","#148f90","#3cb7a9","#7ed5bb","#b1e6ca"],
  "wood":["#2e1819","#58312a","#7e4e36","#9c6d49","#b18a67","#ba9f85"],
  "leather":["#2c1117","#5c2624","#844227","#9c6241","#a27d62"],
  "steel":["#292e36","#515b69","#7a899b","#a1b6c8","#c6dee9","#e6f9fd"],
  "gold":["#6d3e3a","#a65c35","#ce851c","#e9af32","#ffd371","#ffedc1"],
  "cream":["#8d7c77","#b79f8c","#d5c4a2","#f1e2c3","#fff8e7"],
  "cloth":["#4b4d52","#7c7f89","#abb0be","#d5dee9","#f8fcff"],
  "team_blue":["#152049","#264189","#3763c3","#2e8ded","#29b6f5","#66cee7"],
  "team_yellow":["#683a27","#9d5b13","#bf870f","#dfaf03","#f8d163","#feeaaf"],
  "team_green":["#003632","#00624c","#138e54","#52b459","#8cd07a","#b8df9e"],
  "team_orange":["#532025","#8f3629","#c45514","#ea7b15","#ffa354","#fec48d"],
  "team_pink":["#4b2140","#863564","#c04b7e","#f06a8e","#fd9ca2","#ffbfb7"],
  "team_purple":["#23163d","#4a2f76","#714bab","#a066cc","#ce83cf","#e39fc7"],
  "team_mint":["#003539","#086360","#0e927e","#49bb95","#8adaae","#bcecc6"],
  "team_gray":["#2d2c37","#555365","#7d7a93","#a79fba","#cfc0d5","#e9d8e4"],
  "grass":["#012b28","#03523f","#077c40","#5f9c36","#89ba53","#b1d279","#cee19e"],
  "leaf":["#001617","#00342c","#035434","#366e3c","#5d8251","#7a8e68"],
  "moss":["#1d3421","#425f30","#74843d","#9aa665","#b5bd91"],
  "dirt":["#2d191a","#57342e","#7d533e","#9c7253","#b39072","#bda68f"],
  "sand":["#795b55","#a4785f","#c59968","#dfb97d","#f3d5a0","#fde9c3"],
  "stone":["#21242a","#454b55","#697380","#8b9aa6","#acbcc4","#c6d4d6"],
  "rock":["#231719","#4c3535","#74564f","#97776a","#b19688","#bfada1"],
  "clay":["#44222b","#77393c","#a65446","#cb7453","#df9771","#e3b292"],
  "snow":["#7f8791","#9babbd","#b6cee3","#d0edfa","#f5feff"],
  "ice":["#425967","#598ba1","#73bbd2","#9de4ec","#cefdf8"],
  "water":["#041c32","#093f64","#0f6593","#1e8abc","#37b0d2","#68cfdd","#98e1de"],
  "lava":["#763830","#b84b35","#f36436","#fca075","#feceac","#feebd7"],
  "ember":["#1a0003","#450004","#651800","#673b22"],
  "crystal":["#312450","#5f4593","#8f67d1","#bd8bff","#dbbcfd","#efdcfe"],
  "cyan":["#214e61","#0d7b95","#09a8bc","#27d3d9","#7df3e5","#cefeee"],
  "sky_day":["#597590","#5f93c0","#64b1e9","#81ccfd","#b0e0fd","#ceedff"],
  "sky_dusk":["#4a3a5b","#785289","#a869ac","#d881bb","#f9a0b7","#febfb9"],
  "sky_night":["#060718","#121533","#1e234c","#25345f","#294567","#345165"],
  "fire":["#8f4f41","#dd673f","#fe9d70","#fed5b7","#fff7ee"],
  "magic":["#366c7d","#20afc9","#44ecfb","#e5fffd"],
  "heal":["#578e73","#6dc87a","#a7f28c","#eeffe3"],
  "danger":["#622537","#bc3143","#f75e4c","#f99c7d"],
  "white":["#ffffff"],
};

/** 'grass:3' → '#..'。'#rrggbb' はそのまま。'team:2' は team を渡したときだけ */
export function color(ref, team = 'gray') {
  if (ref === null || ref === undefined || ref === '.') return null;
  if (ref[0] === '#') return ref;
  const [name, i] = ref.split(':');
  const key = name === 'team' ? `team_${team}` : name;
  const r = RAMPS[key] ?? RAMPS.team_gray;
  const n = Number(i ?? 0);
  return r[Math.max(0, Math.min(r.length - 1, n < 0 ? r.length + n : n))];
}
export const TEAMS = ['blue', 'yellow', 'green', 'orange', 'pink', 'purple', 'mint', 'gray'];
