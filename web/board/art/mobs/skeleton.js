// 骸骨の兵（へこんだ鉄の帽子・刃こぼれの剣・木の小盾）。手で置いた格子。左向き、光は左上。
export default {
  id: 'skeleton', w: 25, h: 32, ax: 10, ay: 31,
  pal: {
    A: '#160f1c',
    b: '#3e3848',
    c: '#6e6672',
    d: '#a8987c',
    e: '#d8c8a0',
    f: '#f8f0d4',
    s: '#2e3a58',
    t: '#6a7ca0',
    u: '#c4d2ec',
    h: '#3c1e12',
    i: '#80482a',
    j: '#c08048',
    R: '#b02a1c',
    y: '#ffd040',
  },
  frames: {
    idle0: [
      '......tuut...........uA..', // 0
      '.....tuuutsAuA......utA..', // 1
      '....tuuttttstsA.....utsA.', // 2
      '.uuutttttttstssA.....ssA.', // 3
      '.AssssssssssssA.....utsA.', // 4
      '..dffeeddccbA.......utsA.', // 5
      '..edAAeedccbA.......utsA.', // 6
      '..dbRyddccbbA........ssA.', // 7
      '.dbAfeedccbA........utsA.', // 8
      '.fcfcfdccbA.........utsA.', // 9
      '.AAAAAAcbA.......uttttsA.', // 10
      '..ececdcbA.......AefedA..', // 11
      '..bddcbA.cb.......cddbA..', // 12
      '.....efffeddcedA...ecA...', // 13
      '....ecAffeecAcAdcA.ecA...', // 14
      '...ecA.dAAAAAcA.dcAdcA...', // 15
      '..ecA..ffeddbcA..effcA...', // 16
      '..jjjh.dAAAAAcA..cbbA....', // 17
      '.jhjiiheeddcbcA..........', // 18
      'jjjhiihA....dbA..........', // 19
      'jjiutihA....dbA..........', // 20
      'iiitshhAjyiiihhA.........', // 21
      'iihhhhhARRhfecA..........', // 22
      '.hhhhhA.RRhAecA..........', // 23
      '..AAAA.fcRA..dcA.........', // 24
      '......ecA.....dcA........', // 25
      '....ffdA......edcA.......', // 26
      '....ecA........dbA.......', // 27
      '...jjihA.......ihhA......', // 28
      '...iihA........ihhA......', // 29
      '.jiiihhA.....iihhhA......', // 30
      '.AAAAAAA.....AAAAAA......', // 31
    ],
    idle1: [
      '.....................uA..', // 0
      '......tuut..........utA..', // 1
      '.....tuuutsAuA......utsA.', // 2
      '....tuuttttstsA......ssA.', // 3
      '.uuutttttttstssA....utsA.', // 4
      '.AssssssssssssA.....utsA.', // 5
      '..dffeeddccbA.......utsA.', // 6
      '..edAAeedccbA........ssA.', // 7
      '..dbRyddccbbA.......utsA.', // 8
      '.dbAfeedccbA........utsA.', // 9
      '.fcfcfdccbA......uttttsA.', // 10
      '..ececdcbA.......AefedA..', // 11
      '..bddcbA.cb.......cddbA..', // 12
      '.....efffeddcedA...ecA...', // 13
      '....ecAffeecAcAdcA.ecA...', // 14
      '...ecA.dAAAAAcA.dcAdcA...', // 15
      '..ecA..ffeddbcA..effcA...', // 16
      '..jjjh.dAAAAAcA..cbbA....', // 17
      '.jhjiiheeddcbcA..........', // 18
      'jjjhiihA....dbA..........', // 19
      'jjiutihA....dbA..........', // 20
      'iiitshhAjyiiihhA.........', // 21
      'iihhhhhARRhfecA..........', // 22
      '.hhhhhA.RRhAecA..........', // 23
      '..AAAA.fcRA..dcA.........', // 24
      '......ecA.....dcA........', // 25
      '....ffdA......edcA.......', // 26
      '....ecA........dbA.......', // 27
      '...jjihA.......ihhA......', // 28
      '...iihA........ihhA......', // 29
      '.jiiihhA.....iihhhA......', // 30
      '.AAAAAAA.....AAAAAA......', // 31
    ],
    hit: [
      '........tuut..........uA.', // 0
      '.......tuuutsAuA.....utA.', // 1
      '......tuuttttstsA....utsA', // 2
      '...uuutttttttstssA....ssA', // 3
      '...AssssssssssssA....utsA', // 4
      '...dffeeddccbA.......utsA', // 5
      '...edAReedccbA.......utsA', // 6
      '...dbyyddccbbA........ssA', // 7
      '..dbAfeedccbA........utsA', // 8
      '..fcfcfdccbA.........utsA', // 9
      '..AAAAAAcbA.......uttttsA', // 10
      '...AAAAAcbA.......AefedA.', // 11
      '...ececdbAcb.......cddbA.', // 12
      '...bddcbAfeddcedA...ecA..', // 13
      '.....ecAffeecAcAdcA.ecA..', // 14
      '....ecA.dAAAAAcA.dcAdcA..', // 15
      '...ecA..ffeddbcA..effcA..', // 16
      '...jjjh.dAAAAAcA..cbbA...', // 17
      '..jhjiiheeddcbcA.........', // 18
      '.jjjhiihA....dbA.........', // 19
      '.jjiutihA....dbA.........', // 20
      '.iiitshhAjyiiihhA........', // 21
      '.iihhhhhARRhfecA.........', // 22
      '..hhhhhA.RRhAecA.........', // 23
      '...AAAA.fcRA..dcA........', // 24
      '.......ecA.....dcA.......', // 25
      '.....ffdA......edcA......', // 26
      '.....ecA........dbA......', // 27
      '...jjihA.......ihhA......', // 28
      '...iihA........ihhA......', // 29
      '.jiiihhA.....iihhhA......', // 30
      '.AAAAAAA.....AAAAAA......', // 31
    ],
  },
};
