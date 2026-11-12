// 木の柵 50×16。板の杭は幅 6、8〜9 おき、頭は丸・傾き・欠け、高さは不揃い、陰の側は2列暗く、1 ドットの縦の木目が杭ごとに2本。
// 古びた灰色がかった木（橙茶の敵が溶けないように彩度を落とした）。横木2本は杭の間に見える。足もとと間に草、暗い影。
export default {
  id: "fence",
  w: 50,
  h: 16,
  ax: 25,
  ay: 15,
  pal: {
    a: "#776d5c",
    b: "#5f5648",
    c: "#4a4238",
    e: "#342e26",
    f: "#1d1915",
    k: "#433c31",
    l: "#2f2a23",
    m: "#1b1814",
    q: "#18200f",
    r: "#222e18",
    s: "#2e3f20",
    t: "#3d4f2a",
    u: "#55663f",
    v: "#6f8058",
    "#": "#1f1d0e",
    "%": "#2b2817"
  },
  frames: {
    base: [
      ".........ab.......................................",
      ".........abbe................ce............ab.....",
      "...ab....abceef............abeef...........abbe...",
      "..abee...bbeeef.....ab....abceef...........abeeef.",
      ".abceef..bbeeef....abee...bbeeef.....ab....bbeeef.",
      "kbeceefkkbbeeefkkkabcfefkkbbeeefkkkkaeeekkkbbeeefk",
      "lbeceefllbbeeeflllbbcfefllbbeeeflllabeeefllbbeeefl",
      "mbeceefmmbbeeefmmmbecfefmmbbeeefmmmbbeeefmmbbeeefm",
      ".becfef..bbceef...becfef..bbeeef...beeeef..beceef.",
      ".becfef..beceef...beceef..bbeeef...beeeef..beceef.",
      "kbbcfefkkbeceefkkkbeceefkkbbeeefkkkbeceefkkbeceefk",
      "lbbcfefllbeceeflllbeceefllbbcfeflllbeceefllbeceefl",
      "mbvcfefmmbeceevmvmbecvevmmbbcfefmvmbeceefmmbeceefm",
      ".vucvef.vbeceeutu.bbcutu.vbbcfefvu.veceefv.bbceev.",
      "utsutsfutveefutstsceutstsuteeffutsutseffutvceefuut",
      "%rsrr%#srs%###rsr%###rsr%r%#####rsrr%###srs%##rsr%"
    ]
  }
};
