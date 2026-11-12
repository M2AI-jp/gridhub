// 大鬼（灰青）。地面のオリーブ褐と系統を分ける。筋肉ごとの左上に最も明るい色を2〜3ドットの塊で置き、平らな中間色はふちで一つおきに暗い色を混ぜて割る。手で置いた格子（原本は src/ogre-b.src.mjs、make.mjs が書き出す）。左向き、光は左上。
export default {
  id: 'ogre', w: 38, h: 42, ax: 18, ay: 41,
  pal: {
    a: '#141216',
    b: '#20253a',
    c: '#333b57',
    d: '#4b5476',
    e: '#6d7898',
    f: '#aab3cc',
    g: '#e6eaf4',
    A: '#080a14',
    W: '#ffffff',
    h: '#2a1810',
    i: '#5a3420',
    j: '#8c5a30',
    r: '#2a2622',
    s: '#57504a',
    t: '#8a8278',
    u: '#c4bcae',
    w: '#a89a80',
    x: '#e8e0c8',
    y: '#f0c040',
    M: '#3a0e14',
  },
  frames: {
    idle0: [
      '............rrrrrrr...................', // 0
      '..........rrtuuttssrr.................', // 1
      '.........rtuuutttsstsr................', // 2
      '........rtuuttstsrsssr................', // 3
      '........rtttstssrssrssr...............', // 4
      '........rtsssrsjijissr................', // 5
      '.........rrsrrrhjihrr.................', // 6
      '...........rrr...hjih.................', // 7
      '...................hjihcdedbA.........', // 8
      '.....................hceWefdbA........', // 9
      '..............ded.....cdecdcbA........', // 10
      '.......deed.dfWgdc.....AAcbcbA........', // 11
      '.....defffdccdfddcfgeed..fgedbA.......', // 12
      '....efWfedccbcddccgWfedcd.cWgdcbA.....', // 13
      '....eeedddccbA...cdcdcbcbbAcfdcdbA....', // 14
      '...dfWfedcbbdeA..bcdeedccA.cdcdcbA....', // 15
      '...baabyabcbcdA..AcdWffedcbbcddcbbA...', // 16
      '..cfdbcedcbbbA....bccdcdcdbbbccbbA....', // 17
      '..dacddccbAbcdfWgdcabccddccbbAAAA.....', // 18
      '...axMMMxA.ceWffeddcbaabbAAAA.........', // 19
      '..AexwdwxdcacdcdedcdcbcbA.............', // 20
      '...bcddcbA.bcdcdcdcdcbbbA.............', // 21
      '...bdWgedcbabbccbbbcbbbbA.............', // 22
      '..cdgfdcbafWgfedcdcdcbbbA.............', // 23
      '..cdedcdbagfedcdcdcbcbbA..............', // 24
      '.cfWdccbcefdcdcdcbcbbbA...............', // 25
      '.cgfdcdbcddcdcdcbcbbbA................', // 26
      'cdedcdbAAcdcdcacbcbbA.................', // 27
      'cdWedcA..AcdcdcbbbbA..................', // 28
      'dfgfedcA..abbbbbbbA...................', // 29
      'cdcdcdbA.hijjiixiiiiih.dcA............', // 30
      'xAxAxabcd.hjjiiiijjihcWgedcA..........', // 31
      '.....dWgedchijiiijih.AcfdcdcbA........', // 32
      '....cfgfdcdbhiihiih....cdcdcdcA.......', // 33
      '....cdcdcdcA.h.h.h......cfdcdccA......', // 34
      '....bcdcdcbA.............cdedcbA......', // 35
      '....bcddcbA...............cdedcA......', // 36
      '....cWddcbA................cdddcA.....', // 37
      '...cdedcdbA................bcddcbA....', // 38
      '.cdeffedcbA................cddeedccbA.', // 39
      'xdaeafdcbA................xdaeafdccbA.', // 40
      '.xAxAAAAA..................xAxAAAAAAA.', // 41
    ],
    idle1: [
      '......................................', // 0
      '............rrrrrrr...................', // 1
      '..........rrtuuttssrr.................', // 2
      '.........rtuuutttsstsr................', // 3
      '........rtuuttstsrsssr................', // 4
      '........rtttstssrssrssr...............', // 5
      '........rtsssrsjijissr................', // 6
      '.........rrsrrrhjihrr.................', // 7
      '...........rrr...hjih.................', // 8
      '...................hjihcdedbA.........', // 9
      '.....................hceWefdbA........', // 10
      '..............ded.....cdecdcbA........', // 11
      '.......deed.dfWgdc.....AAcbcbA........', // 12
      '.....defffdccdfddcfgeed..fgedbA.......', // 13
      '....efWfedccbcddccgWfedcd.cWgdcbA.....', // 14
      '....eeedddccbA...cdcdcbcbbAcfdcdbA....', // 15
      '...dfWfedcbbdeA..bcdeedccA.cdcdcbA....', // 16
      '...baabyabcbcdA..AcdWffedcbbcddcbbA...', // 17
      '..cfdbcedcbbbA....bccdcdcdbbbccbbA....', // 18
      '..dacddccbAbcdfWgdcabccddccbbAAAA.....', // 19
      '...axMMMxA.ceWffeddcbaabbAAAA.........', // 20
      '..AexwdwxdcacdcdedcdcbcbA.............', // 21
      '...bcddcbA.bcdcdcdcdcbbbA.............', // 22
      '...bdWgedcbabbccbbbcbbbbA.............', // 23
      '..cdgfdcbafWgfedcdcdcbbbA.............', // 24
      '..cdedcdbagfedcdcdcbcbbA..............', // 25
      '.cfWdccbcefdcdcdcbcbbbA...............', // 26
      '.cgfdcdbcddcdcdcbcbbbA................', // 27
      'cdedcdbAAcdcdcacbcbbA.................', // 28
      'cdWedcA..AcdcdcbbbbA..................', // 29
      'dfgfedcA.hijjiixiiiiih.dcA............', // 30
      'cdcdcdbA..hjjiiiijjihcWgedcA..........', // 31
      'xAxAxabcddchijiiijih.AcfdcdcbA........', // 32
      '....cfgfdcdbhiihiih....cdcdcdcA.......', // 33
      '....cdcdcdcA.h.h.h......cfdcdccA......', // 34
      '....bcdcdcbA.............cdedcbA......', // 35
      '....bcddcbA...............cdedcA......', // 36
      '....cWddcbA................cdddcA.....', // 37
      '...cdedcdbA................bcddcbA....', // 38
      '.cdeffedcbA................cddeedccbA.', // 39
      'xdaeafdcbA................xdaeafdccbA.', // 40
      '.xAxAAAAA..................xAxAAAAAAA.', // 41
    ],
    hit: [
      '.............rrrrrrr..................', // 0
      '...........rrtuuttssrr................', // 1
      '..........rtuuutttsstsr...............', // 2
      '.........rtuuttstsrsssr...............', // 3
      '.........rtttstssrssrssr..............', // 4
      '.........rtsssrsjijissr...............', // 5
      '..........rrsrrrhjihrr................', // 6
      '............rrr...hjih................', // 7
      '....................hjihcdedbA........', // 8
      '......................hceWefdbA.......', // 9
      '...............ded.....cdecdcbA.......', // 10
      '........deed.dfWgdc.....AAcbcbA.......', // 11
      '......defffdccdfddcfgeed..fgedbA......', // 12
      '.....efWfedccbcddccgWfedcd.cWgdcbA....', // 13
      '.....eeedddccbA...cdcdcbcbbAcfdcdbA...', // 14
      '....dfWfedcbbdeA..bcdeedccA.cdcdcbA...', // 15
      '....baabaabcbcdA..AcdWffedcbbcddcbbA..', // 16
      '...cfdbcedcbbbA....bccdcdcdbbbccbbA...', // 17
      '...dacddccbAbcdfWgdcabccddccbbAAAA....', // 18
      '....axMMMxa.ceWffeddcbaabbAAAA........', // 19
      '...baMMMMadcacdcdedcdcbcbA............', // 20
      '....bxddxca.bcdcdcdcdcbbbA............', // 21
      '....bbccbacbabbccbbbcbbbbA............', // 22
      '...cdgfdcbafWgfedcdcdcbbbA............', // 23
      '...cdedcdbagfedcdcdcbcbbA.............', // 24
      '..cfWdccbcefdcdcdcbcbbbA..............', // 25
      '..cgfdcdbcddcdcdcbcbbbA...............', // 26
      '.cdedcdbAAcdcdcacbcbbA................', // 27
      '.cdWedcA..AcdcdcbbbbA.................', // 28
      '.dfgfedcA..abbbbbbbA..................', // 29
      '.cdcdcdbA.hijjiixiiiiih.dcA...........', // 30
      '.xAxAxabcd.hjjiiiijjihcWgedcA.........', // 31
      '.....dWgedchijiiijih.AcfdcdcbA........', // 32
      '....cfgfdcdbhiihiih....cdcdcdcA.......', // 33
      '....cdcdcdcA.h.h.h......cfdcdccA......', // 34
      '....bcdcdcbA.............cdedcbA......', // 35
      '....bcddcbA...............cdedcA......', // 36
      '....cWddcbA................cdddcA.....', // 37
      '...cdedcdbA................bcddcbA....', // 38
      '.cdeffedcbA................cddeedccbA.', // 39
      'xdaeafdcbA................xdaeafdccbA.', // 40
      '.xAxAAAAA..................xAxAAAAAAA.', // 41
    ],
  },
};
