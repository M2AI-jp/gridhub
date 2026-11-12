// 大蝙蝠（夜の翼）。翼に指の骨、赤い皮膜、茶の毛皮。手で置いた格子。左向き、光は左上。
export default {
  id: 'bat', w: 32, h: 24, ax: 15, ay: 23, fly: true,
  pal: {
    A: '#1c0a14',
    b: '#40201a',
    c: '#6e3a24',
    d: '#a8643a',
    e: '#e4a866',
    f: '#ffe2a8',
    m: '#3e0c20',
    n: '#7c1a30',
    o: '#bc3a3a',
    p: '#f07a56',
    W: '#fff0d8',
    y: '#ffd23c',
  },
  frames: {
    idle0: [
      'A.....W....................W...A', // 0
      '.dddddeA..................AeddbA', // 1
      'AppoooddAA.....A........AAdcbooA', // 2
      '.ApoobboAfA...AdA......AddobobnA', // 3
      '.AooboboAonA..AnbA....AdoonbonbA', // 4
      '.AobobooAonbAAAnbA...AdonnnbnnbA', // 5
      '.AboobooAffedccbbbA.Adonnnmbnmmb', // 6
      'AboonboAefedddccbbA.donnnmmmbmmA', // 7
      'AonnbooAedAAAccbbbA.nnnmmmmmbmA.', // 8
      '.AnmbooAdAWyAdcbbbA.nnmmmmmmbA..', // 9
      '..AmbonAfedddcbbAdfdcAmmmAAAb...', // 10
      '..AbnnnApdccAbbAdeedcbAAA...A...', // 11
      '...AAnnAAAAAAbAbdfedcbA.........', // 12
      '.....AAAWnnWAAbcfeedcbA.........', // 13
      '........AAWAAbcddcdcbbA.........', // 14
      '.............AcdedcbcbA.........', // 15
      '.............AbcdccbbbA.........', // 16
      '.............AbcccbbbA..........', // 17
      '............AdbAmmAcbA..........', // 18
      '...........AecbAmnmAbbA.........', // 19
      '...........AcbAAmmAAcbA.........', // 20
      '..........AdcA...AdcbA..........', // 21
      '.........AeddcA..AdccbA.........', // 22
      '.........WAWAWA..WAWAWA.........', // 23
    ],
    idle1: [
      '................................', // 0
      '.........A.....A................', // 1
      '........AfA...AdA...............', // 2
      '........AonA..AnbA..............', // 3
      '....W...AonbAAAnbA..............', // 4
      '...AedddAffedccbbbA.AA..........', // 5
      '..AdbbpAefedddccbbA.odAA........', // 6
      '.AdpbpbAedAAAccbbbA.noddAA......', // 7
      '.AdobobAdAWyAdcbbbA.nnooddAA....', // 8
      'AdpobooAfedddcbbAdfdcAnoooddAW..', // 9
      'AdoobonApdccAbbAdeedcbAnooooeA..', // 10
      'doonbnnAAAAAAbAbdfedcbAnnoobodA.', // 11
      'donnbnnAWnnWAAbcfeedcbAnnnobondA', // 12
      'AnnmbnnmAAWAAbcddcdcbbAmnnnbnndA', // 13
      '.AmmbnmmmbnmmAcdedcbcbAmmnnbnmnd', // 14
      '..AmbnmmmbnmmAbcdccbbbAmmmnbmmmb', // 15
      '...AbmAAmbmmAAbcccbbbAmmmmmbmAAA', // 16
      '....AA..AbAAAdbAmmAcbAAAmmbAA...', // 17
      '.........A.AecbAmnmAbbA.AAA.....', // 18
      '...........AcbAAmmAAcbA.........', // 19
      '..........AdcA...AdcbA..........', // 20
      '.........AeddcA..AdccbA.........', // 21
      '.........WAWAWA..WAWAWA.........', // 22
      '................................', // 23
    ],
    hit: [
      '...........................W...A', // 0
      '..........................AeddbA', // 1
      '..........A.....A.......AAdcbooA', // 2
      '.........AfA...AdA.....AddobobnA', // 3
      '.........AonA..AnbA...AdoonbonbA', // 4
      '.....W...AonbAAAnbA..AdonnnbnnbA', // 5
      '....AedddAffedccbbbAAdonnnmbnmmb', // 6
      '...AdbbpAefedddccbbAdonnnmmmbmmA', // 7
      '..AdpbpbAeddddAccbbAnnnmmmmmbmA.', // 8
      '..AdobobAdAAAAdcbbbAnnmmmmmmbA..', // 9
      '.AdpobooAfedddcbbAdfdcAmmAAAb...', // 10
      '.AdoobonApdccAbbAdeedcbAA...A...', // 11
      '.doonbnnAWAAWAbAbdfedcbA........', // 12
      '.donnbnnAmnnmAAbcfeedcbA........', // 13
      '.AnnmbnnmAWAAAbcddcdcbbA........', // 14
      '..AmmbnmmmbnmmAcdedcbcbA........', // 15
      '...AmbnmmmbnmmAbcdccbbbA........', // 16
      '....AbmAAmbmmAAbcccbbbA.........', // 17
      '.....AA..AbAAAdbAmmAcbA.........', // 18
      '..........A.AecbAmnmAbbA........', // 19
      '............AcbAAmmAAcbA........', // 20
      '...........AdcA...AdcbA.........', // 21
      '..........AeddcA..AdccbA........', // 22
      '..........WAWAWA..WAWAWA........', // 23
    ],
  },
};
