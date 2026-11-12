// 苔むした石の巨人（門番）。胸に赤く光る核、体に刻んだ赤い符、重い拳。左向き、光は左上。部品ごとに手で置いた格子を組んだもの（色の計算・回転・拡大なし）。
export default {
  id: 'golem', w: 44, h: 46, ax: 22, ay: 45,
  pal: {
    K: '#120a1e',
    a: '#2a1c3c',
    b: '#4a3658',
    c: '#715c70',
    d: '#a48c84',
    e: '#d6bc9a',
    f: '#fff0c8',
    m: '#163a1a',
    n: '#2e6c20',
    o: '#70aa2a',
    p: '#d2ea5a',
    R: '#5c0a16',
    r: '#d8301a',
    y: '#ff9a2c',
    Y: '#fff6b8',
  },
  frames: {
    idle0: [
      '............................................', // 0
      '............................................', // 1
      '............................................', // 2
      '............................mnnm..mnm.......', // 3
      '..........................mnoppnmmnonm......', // 4
      '.........................mnopppomnoonnmm....', // 5
      '........................mnoppoonmnooonnmm...', // 6
      '.......mnnnm...........mnoooonnmnnonnmmmmK..', // 7
      '.....mnoppponm.....mnnmmnoonnmmnoonnmmmmmbK.', // 8
      '....mnopppoonnm..mnoppndnnmmnmmmnnmamnmmbaK.', // 9
      '....noonnnnmmmmKmnoopodeddmmdmmdcmaemmbbbaK.', // 10
      '....dmnmmddcmbbKnoonnndeffeddddddaedcbbbbaK.', // 11
      '...dedmddeeaccbaKonnmmdfffedddddaedccbbbbaK.', // 12
      '..eeffedddaeccbaKnmmmmdeeedddccaedcccbbbaaK.', // 13
      '..ddddcccccccbbaKmdcmmcdddddccaedcccbbbbaaK.', // 14
      '..KKKKKaKKKKKcbaKccccmcdddcccaddcccbbbbbaaK.', // 15
      '...KyYYKbKyYYKbaKcccccbccccccabccbbbbbbaaK..', // 16
      '...caKKbcbKKacbaKccccccbcccbbabbbbbbbbaaaK..', // 17
      '...ddccccccccbbaKKKKKccbbbcbbbbbbbbaaaaaK...', // 18
      '...KKKKKKdcccbaKRrrrRKcbbKKaaacdddcbbbaK....', // 19
      '...bdeedccbbbaKRryyyrRKbbbaK..deercbbbaK....', // 20
      '.mnnbcccbbbaaKKryYYYyrKcbbaK..dffrrbbbaK....', // 21
      'monpnKKKKKKKKcKryYYYyrKcbbaK..decrcrbbaK....', // 22
      'deddmbbaK.ddccKRryyyrRKbbbaK..cdcrrbbbaK....', // 23
      'efedccbbaKdcccbKRrrrRKcbbbaK..ccdRcbbaaK....', // 24
      'deddccbbbacccccbKKrKKccbbbaK..bcdabbbaaK....', // 25
      'cdccccbbbabccccccbrbccbbbbaK..KaaaaaaaKK....', // 26
      'bcccbbbbaaKKaaaaaaaaaaaaaaaaK.cdeedcbbaK....', // 27
      '.KaaaaaaKK..mnoppnnmnnmnmmmK..ddddccbbaK....', // 28
      '.cdeedcaK...mmnonmmnmmmmmmK....cdeenoomcbaK.', // 29
      '.dffdcbaK...mmnmmm.mmmnmmKK...cdeffnmccbbbaK', // 30
      '.drcrcbaK...cdeedcccbbbbaaK...deeeddccbbbbaK', // 31
      '.cdrccbaK...deddccbbbbbaaK....KaaKdddcbbbaaK', // 32
      '.ccrcbbaK...bcccbbbbbaaaKcbbaadeeKdccbbbbaaK', // 33
      '.bcRbbaaK....KaaaaaaaaKKddcbbadccKcccbbbaaaK', // 34
      '.KaaaaaK......ccccbaK..cccbbbaKaaKccbbbbaaaK', // 35
      '.cdenoomcaK...KaaaaaK..KaaaaaKdeeKcbbbbaaaK.', // 36
      'cdeffnmcbbaK..effdcbaK.eedcbbadccKbbbbaaaK..', // 37
      'deeedcccbbaK..eedcbbaK.dedcbbaKKKKKKKKKKK...', // 38
      'KaaKdcabbbaK..ddccbbaK.dccbbbaK.............', // 39
      'deeKdaebbbaK..dcdcbaaK.cdcbbaaK.............', // 40
      'dccKccbbbaaK..cccbbaK..bccbbaK..............', // 41
      'KaaKcbbbbaaK..KaaaaKK..KaaaaKK..............', // 42
      'deeKcbbbaaaK.deffdcbaK.deedcbbaK............', // 43
      'cddKbbbaaaK..cdddcbbaK.cdcccbbaK............', // 44
      'KKKKKKKKKK...KKKKKKKKK.KKKKKKKKK............', // 45
    ],
    idle1: [
      '............................................', // 0
      '............................................', // 1
      '............................................', // 2
      '............................mnnm..mnm.......', // 3
      '..........................mnoppnmmnonm......', // 4
      '.........................mnopppomnoonnmm....', // 5
      '........................mnoppoonmnooonnmm...', // 6
      '.......mnnnm...........mnoooonnmnnonnmmmmK..', // 7
      '.....mnoppponm.....mnnmmnoonnmmnoonnmmmmmbK.', // 8
      '....mnopppoonnm..mnoppndnnmmnmmmnnmamnmmbaK.', // 9
      '....noonnnnmmmmKmnoopodeddmmdmmdcmaemmbbbaK.', // 10
      '....dmnmmddcmbbKnoonnndeffeddddddaedcbbbbaK.', // 11
      '...dedmddeeaccbaKonnmmdfffedddddaedccbbbbaK.', // 12
      '..eeffedddaeccbaKnmmmmdeeedddccaedcccbbbaaK.', // 13
      '..ddddcccccccbbaKmdcmmcdddddccaedcccbbbbaaK.', // 14
      '..KKKKKaKKKKKcbaKccccmcdddcccaddcccbbbbbaaK.', // 15
      '...KyYYKbKyYYKbaKcccccbccccccabccbbbbbbaaK..', // 16
      '...caKKbcbKKacbaKccccccbcccbbabbbbbbbbaaaK..', // 17
      '...ddccccccccbbaKKKKKccbbbcbbbbbbbbaaaaaK...', // 18
      '...KKKKKKdcccbaKryyyrKcbbKKaaacdddcbbbaK....', // 19
      '...bdeedccbbbaKryYYYyrKbbbaK..deeycbbbaK....', // 20
      '.mnnbcccbbbaaKKyYYYYYyKcbbaK..dffyybbbaK....', // 21
      'monpnKKKKKKKKcKyYYYYYyKcbbaK..decycybbaK....', // 22
      'deddmbbaK.ddccKryYYYyrKbbbaK..cdcyybbbaK....', // 23
      'efedccbbaKdcccbKryyyrKcbbbaK..ccdrcbbaaK....', // 24
      'deddccbbbacccccbKKyKKccbbbaK..bcdabbbaaK....', // 25
      'cdccccbbbabccccccbybccbbbbaK..KaaaaaaaKK....', // 26
      'bcccbbbbaaKKaaaaaaaaaaaaaaaaK.cdeedcbbaK....', // 27
      '.KaaaaaaKK..mnoppnnmnnmnmmmK..ddddccbbaK....', // 28
      '.cdeedcaK...mmnonmmnmmmmmmK....cdeenoomcbaK.', // 29
      '.dffdcbaK...mmnmmm.mmmnmmKK...cdeffnmccbbbaK', // 30
      '.dycycbaK...cdeedcccbbbbaaK...deeeddccbbbbaK', // 31
      '.cdyccbaK...deddccbbbbbaaK....KaaKdddcbbbaaK', // 32
      '.ccycbbaK...bcccbbbbbaaaKcbbaadeeKdccbbbbaaK', // 33
      '.bcrbbaaK....KaaaaaaaaKKddcbbadccKcccbbbaaaK', // 34
      '.KaaaaaK......ccccbaK..cccbbbaKaaKccbbbbaaaK', // 35
      '.cdenoomcaK...KaaaaaK..KaaaaaKdeeKcbbbbaaaK.', // 36
      'cdeffnmcbbaK..effdcbaK.eedcbbadccKbbbbaaaK..', // 37
      'deeedcccbbaK..eedcbbaK.dedcbbaKKKKKKKKKKK...', // 38
      'KaaKdcabbbaK..ddccbbaK.dccbbbaK.............', // 39
      'deeKdaebbbaK..dcdcbaaK.cdcbbaaK.............', // 40
      'dccKccbbbaaK..cccbbaK..bccbbaK..............', // 41
      'KaaKcbbbbaaK..KaaaaKK..KaaaaKK..............', // 42
      'deeKcbbbaaaK.deffdcbaK.deedcbbaK............', // 43
      'cddKbbbaaaK..cdddcbbaK.cdcccbbaK............', // 44
      'KKKKKKKKKK...KKKKKKKKK.KKKKKKKKK............', // 45
    ],
    attack: [
      '.............cdeedccbaK.....................', // 0
      '............cdffeddcbbaK....................', // 1
      '...........cdeeedddcbbbaK...................', // 2
      '...........KaaKdddccbbbaK...................', // 3
      '...........deeKdcccbbbaaK...................', // 4
      '...........dccKccbbbbaaaK...mnnm..mnm.......', // 5
      '...........KaaKcbbbbaaaK..mnoppnmmnonm......', // 6
      '...........deeKcbbbaaaKcKmnopppomnoonnmm....', // 7
      '...........cdcKbbbaaKdecmnoppoonmnooonnmm...', // 8
      '.......mnnnmKKKKaaKcdecmnoooonnmnnonnmmmmK..', // 9
      '.....mnoppponm....KcdecmnoonnmmnoonnmmmmmbK.', // 10
      '....mnopppoonnm..mnKcdcdnnmmnmmmnnmamnmmbaK.', // 11
      '....noonnnnmmmmKmnooKcdeddmmdmmdcmaemmbbbaK.', // 12
      '....dmnmmddcmbbKnoonnKdeffeddddddaedcbbbbaK.', // 13
      '...dedmddeeaccbaKonnmmdfffedddddaedccbbbbaK.', // 14
      '..eeffedddaeccbaKnmmmmdeeedddccaedcccbbbaaK.', // 15
      '..ddddcccccccbbaKmdcmmcdddddccaedcccbbbbaaK.', // 16
      '..KKKKKaKKKKKcbaKccccmcdddcccaddcccbbbbbaaK.', // 17
      '...KYYYKbKYYYKbaKcccccbccccccabccbbbbbbaaK..', // 18
      '...caKKbcbKKacbaKccccccbcccbbabbbbbbbbaaaK..', // 19
      '...ddccccccccbbaKKKKKccbbbcbbbbbbbbaaaaaK...', // 20
      '.mnKKKKKKdcccbaKryyyrKcbbKKaaaaaaaaaaaKK....', // 21
      'monbdeedccbbbaKryYYYyrKbbbaK................', // 22
      'deddbcccbbbaaKKyYYYYYyKcbbaK................', // 23
      'efedcKKKKKKKKcKyYYYYYyKcbbaK................', // 24
      'deddccbbbaddccKryYYYyrKbbbaK................', // 25
      'cdccccbbbadcccbKryyyrKcbbbaK................', // 26
      'bcccbbbbaacccccbKKyKKccbbbaK................', // 27
      '.KaaaaaaKKbccccccbybccbbbbaK................', // 28
      '.cdeedcaK..KaaaaaaaaaaaaaaaaK...............', // 29
      '.dffdcbaK...mnoppnnmnnmnmmmK................', // 30
      '.dycycbaK...mmnonmmnmmmmmmK.................', // 31
      '.cdyccbaK...mmnmmm.mmmnmmKK.................', // 32
      '.ccycbbaK...cdeedcccbbbbaaKbaaK.............', // 33
      '.bcrbbaaK...deddccbbbbbaaKcbbaK.............', // 34
      '.KaaaaaK....bcccbbbbbaaaKcbbbaK.............', // 35
      '.cdenoomcaK..KaaaaaaaaKKaaaaaKK.............', // 36
      'cdeffnmcbbaK..effdcbaK.eedcbbaK.............', // 37
      'deeedcccbbaK..eedcbbaK.dedcbbaK.............', // 38
      'KaaKdcabbbaK..ddccbbaK.dccbbbaK.............', // 39
      'deeKdaebbbaK..dcdcbaaK.cdcbbaaK.............', // 40
      'dccKccbbbaaK..cccbbaK..bccbbaK..............', // 41
      'KaaKcbbbbaaK..KaaaaKK..KaaaaKK..............', // 42
      'deeKcbbbaaaK.deffdcbaK.deedcbbaK............', // 43
      'cddKbbbaaaK..cdddcbbaK.cdcccbbaK............', // 44
      'KKKKKKKKKK...KKKKKKKKK.KKKKKKKKK............', // 45
    ],
    hit: [
      '............................................', // 0
      '............................................', // 1
      '............................................', // 2
      '.............................mnnm..mnm......', // 3
      '...........................mnoppnmmnonm.....', // 4
      '..........................mnopppomnoonnmm...', // 5
      '.........mnnnm...........mnoppoonmnooonnmm..', // 6
      '.......mnoppponm........mnoooonnmnnonnmmmmK.', // 7
      '......mnopppoonnm...mnnmmnoonnmmnoonnmmmmmbK', // 8
      '......noonnnnmmmmKmnoppndnnmmnmmmnnmamnmmbaK', // 9
      '......dmnmmddcmbbKnoopodeddmmdmmdcmaemmbbbaK', // 10
      '.....dedmddeeaccbaKonnndeffeddddddaedcbbbbaK', // 11
      '....eeffedddaeccbaKnnmmdfffedddddaedccbbbbaK', // 12
      '....ddddcccccccbbaKmmmmdeeedddccaedcccbbbaaK', // 13
      '....KKKKKaKKKKKcbaKdcmmcdddddccaedcccbbbbaaK', // 14
      '.....KRrrKbKRrrKbaKcccmcdddcccaddcccbbbbbaaK', // 15
      '.....caKKbcbKKacbaKccccbccccccabccbbbbbbaaK.', // 16
      '.....ddccccccccbbaKcccccbcccbbabbbbbbbbaaaK.', // 17
      '.....KKKKKKdcccbaKKKKKccbbbcbbbbbbbbaaaaaK..', // 18
      '.....bdeedccbbbaKRRRRRKcbbKKaacdddcbbbaKK...', // 19
      '......bcccbbbaaKRRrrrRRKbbbaK.deeRcbbbaK....', // 20
      '.mnnm..KKKKKKKKKRryyyrRKcbbaK.dffRRbbbaK....', // 21
      'monpnmm....dddcKRryyyrRKcbbaK.decRcRbbaK....', // 22
      'deddmbbaK..ddccKRRrrrRRKbbbaK.cdcRRbbbaK....', // 23
      'efedccbbaK.dcccbKRRRRRKcbbbaK.ccdRcbbaaK....', // 24
      'deddccbbbaKcccccbKKRKKccbbbaK.bcdabbbaaK....', // 25
      'cdccccbbbaKbccccccbRbccbbbbaK.KaaaaaaaKK....', // 26
      'bcccbbbbaaK.KaaaaaaaaaaaaaaaaKcdeedcbbaK....', // 27
      '.KaaaaaaKK...mnoppnnmnnmnmmmK.ddddccbbaK....', // 28
      '.cdeedcaK....mmnonmmnmmmmmmK...cdeenoomcbaK.', // 29
      '.dffdcbaK....mmnmmm.mmmnmmKK..cdeffnmccbbbaK', // 30
      '.dRcRcbaK....cdeedcccbbbbaaK..deeeddccbbbbaK', // 31
      '.cdRccbaK....deddccbbbbbaaK...KaaKdddcbbbaaK', // 32
      '.ccRcbbaK....bcccbbbbbaaaKbbaadeeKdccbbbbaaK', // 33
      '.bcRbbaaK.....KaaaaaaaaKKdcbbadccKcccbbbaaaK', // 34
      '.KaaaaaK......ccccbaK..cccbbbaKaaKccbbbbaaaK', // 35
      '.cdenoomcaK...KaaaaaK..KaaaaaKdeeKcbbbbaaaK.', // 36
      'cdeffnmcbbaK..effdcbaK.eedcbbadccKbbbbaaaK..', // 37
      'deeedcccbbaK..eedcbbaK.dedcbbaKKKKKKKKKKK...', // 38
      'KaaKdcabbbaK..ddccbbaK.dccbbbaK.............', // 39
      'deeKdaebbbaK..dcdcbaaK.cdcbbaaK.............', // 40
      'dccKccbbbaaK..cccbbaK..bccbbaK..............', // 41
      'KaaKcbbbbaaK..KaaaaKK..KaaaaKK..............', // 42
      'deeKcbbbaaaK.deffdcbaK.deedcbbaK............', // 43
      'cddKbbbaaaK..cdddcbbaK.cdcccbbaK............', // 44
      'KKKKKKKKKK...KKKKKKKKK.KKKKKKKKK............', // 45
    ],
  },
};
