// 小鬼の荒くれ（骨の棍棒を肩に担ぐ）。手で置いた格子（原本は src/goblin.src.mjs、make.mjs が書き出す）。左向き、光は左上。
export default {
  id: 'goblin', w: 28, h: 30, ax: 12, ay: 29,
  pal: {
    '1': '#3a2e22',
    '2': '#6e5e48',
    '3': '#a08c6c',
    '4': '#c8b894',
    '5': '#ece4c8',
    a: '#241014',
    b: '#3e1a1c',
    c: '#5a2c28',
    d: '#7a4030',
    e: '#9c5e3e',
    f: '#c88e60',
    g: '#f0c898',
    h: '#1c1612',
    i: '#362c24',
    j: '#56483a',
    k: '#7a6852',
    l: '#a48e70',
    H: '#24140c',
    I: '#56341e',
    J: '#8a5e36',
    w: '#a89878',
    x: '#e8e0c4',
    y: '#f4e070',
    Y: '#d07a28',
    M: '#3a0c10',
  },
  frames: {
    idle0: [
      '......................1111..', // 0
      '.....................155431.', // 1
      '....................15453231', // 2
      '...................114332321', // 3
      '.................1144322221.', // 4
      '....cdfdc....db11443311111..', // 5
      '...cegffdc.efca443322.......', // 6
      '..cfgegfedeeba4332211.......', // 7
      '.cefdfeeddcba222211ed.......', // 8
      '.dgfgeddcba221111cfgfeca....', // 9
      'dayYacdccbb11cdedcgfgdca....', // 10
      'edbbcedcbbcdeedccdfedeca....', // 11
      'dacdddcbacdeedcbacdcdcba....', // 12
      '.axMMMxabcdefedcadfecba.....', // 13
      'bfewdwdcaHdeedcHaegdcba.....', // 14
      '.bccccbabcHddcHbacedcba.....', // 15
      '....bdfgfexHHHxbabdedcba....', // 16
      '....aegfedddxccbbacegedca...', // 17
      '.....afeddcdwccbbabgecdca...', // 18
      '.....adeddccacbbba.cfddcba..', // 19
      '......acdcccbcbba..bdfedca..', // 20
      '......HJJIJIIxIIH..cfgeeca..', // 21
      '...bdechlkhlkhkjhdc.dcecea..', // 22
      '.cefgechkjikjijhcfgexaxax...', // 23
      '.cdfdca.jihjihi.cdfdca......', // 24
      '.cedcba.h..h..h.cedcba......', // 25
      '.cecdba.........cecdba......', // 26
      'cegfedcba......cegfedccba...', // 27
      'xeafaecca......xeafaeccba...', // 28
      '.xaxaaaa.......xaxaaaaa.....', // 29
    ],
    idle1: [
      '............................', // 0
      '......................1111..', // 1
      '.....................155431.', // 2
      '....................15453231', // 3
      '...................114332321', // 4
      '.................1144322221.', // 5
      '....cdfdc....db11443311111..', // 6
      '...cegffdc.efca443322.......', // 7
      '..cfgegfedeeba4332211.......', // 8
      '.cefdfeeddcba222211ed.......', // 9
      '.dgfgeddcba221111cfgfeca....', // 10
      'dayYacdccbb11cdedcgfgdca....', // 11
      'edbbcedcbbcdeedccdfedeca....', // 12
      'dacdddcbacdeedcbacdcdcba....', // 13
      '.axMMMxabcdefedcadfecba.....', // 14
      'bfewdwdcaHdeedcHaegdcba.....', // 15
      '.bccccbabcHddcHbacedcba.....', // 16
      '....bdfgfexHHHxbabdedcba....', // 17
      '....aegfedddxccbbacegedca...', // 18
      '.....afeddcdwccbbabgecdca...', // 19
      '.....adeddccacbbba.cfddcba..', // 20
      '......HJJIJIIxIIH..bdfedca..', // 21
      '...bdechlkhlkhkjhdc.fgeeca..', // 22
      '.cefgechkjikjijhcfgedcecea..', // 23
      '.cdfdca.jihjihi.cdfdxaxax...', // 24
      '.cedcba.h..h..h.cedcba......', // 25
      '.cecdba.........cecdba......', // 26
      'cegfedcba......cegfedccba...', // 27
      'xeafaecca......xeafaeccba...', // 28
      '.xaxaaaa.......xaxaaaaa.....', // 29
    ],
    hit: [
      '.......................1111.', // 0
      '......................155431', // 1
      '.....................1545321', // 2
      '....................11433231', // 3
      '..................1144322221', // 4
      '.....cdfdc....db11443311111.', // 5
      '....cegffdc.efca443322......', // 6
      '...cfgegfedeeba4332211......', // 7
      '..cefdfeeddcba222211ed......', // 8
      '.cgfgedcccba221111cfgfeca...', // 9
      '.dbaabcdccbb11cdedcgfgdca...', // 10
      '.edcbcedcbbcdeedccdfedeca...', // 11
      'adacddcbaacdeedcbacdcdcba...', // 12
      '.axMMMxabbcdefedcadfecba....', // 13
      '.aMMMMMabaHdeedcHaegdcba....', // 14
      '.bxMMxdcabcHddcHbacedcba....', // 15
      '.bfeddcbafexHHHxbabdedcba...', // 16
      '..bccbagfedddxccbbacegedca..', // 17
      '......afeddcdwccbbabgecdca..', // 18
      '......adeddccacbbba.cfddcba.', // 19
      '.......acdcccbcbba..bdfedca.', // 20
      '.......HJJIJIIxIIH..cfgeeca.', // 21
      '...bdechlkhlkhkjhdc..dcecea.', // 22
      '.cefgechkjikjijhcfg.exaxax..', // 23
      '.cdfdca.jihjihi.cdfdca......', // 24
      '.cedcba.h..h..h.cedcba......', // 25
      '.cecdba.........cecdba......', // 26
      'cegfedcba......cegfedccba...', // 27
      'xeafaecca......xeafaeccba...', // 28
      '.xaxaaaa.......xaxaaaaa.....', // 29
    ],
  },
};
