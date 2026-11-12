// 沼の濁り・広がり（頭骨と剣を呑んだ粘体）。手で置いた格子（原本は src/ooze2.src.mjs、make.mjs が書き出す）。左向き、光は左上。
export default {
  id: 'ooze2', w: 28, h: 17, ax: 13, ay: 16,
  pal: {
    a: '#0a1618',
    b: '#10282a',
    c: '#173a38',
    d: '#21514a',
    e: '#33705f',
    f: '#589a7e',
    g: '#a2d0b0',
    h: '#eefae8',
    z: '#bff3ee',
    k: '#4a6450',
    l: '#7c9474',
    m: '#b8c8a4',
    G: '#d8e870',
    n: '#3a2418',
    o: '#5e3c24',
    r: '#2a1e1a',
    s: '#6a4430',
    t: '#9a6a44',
    u: '#c8c0b0',
    q: '#2e4a48',
    p: '#6a8e88',
  },
  frames: {
    idle0: [
      '........zzzz.......tr.......', // 0
      '......zzghgfzz.....on.......', // 1
      '.....zfhhgfeedzz...on.......', // 2
      '....zfgfeedddddfzrutssr.....', // 3
      '...zefeddmmmlkcdcdcpqa......', // 4
      '...cdedcmmmllkkcdcbpqca.....', // 5
      '....bcbcmbbllkcbccdpqda.....', // 6
      '.....c.clGGlkkcccdcpqcez....', // 7
      '.....d.blblkkcclkcfpqcea....', // 8
      '.......blalakcdckcbpqcdez...', // 9
      '.....bccckakkcccdccqbgdeez..', // 10
      '...bdcdccckkcccdcbcdbfceeez.', // 11
      '..zdeeedccccbcdccbccccddeba.', // 12
      '.zdffffeedddddfccccddddefebz', // 13
      'bdeffeeddccccccbbbbcccddeedb', // 14
      'bdedcbacedcbacdedcbacdeddcba', // 15
      '.abba..abba..abbba..abbbba..', // 16
    ],
    idle1: [
      '............................', // 0
      '........zzzz.......tr.......', // 1
      '......zzghgfzz.....on.......', // 2
      '.....zfhhgfeedzz...on.......', // 3
      '....zfgfeedddddfzrutssr.....', // 4
      '...zefeddmmmlkcdcdcpqa......', // 5
      '...cdedcmmmllkkcdcbpqca.....', // 6
      '....bcbcmbbllkcbccdpqda.....', // 7
      '.....c.clGGlkkcccdcpqcez....', // 8
      '.....d.blblkkcclkcfpqcea....', // 9
      '.......blalakcdckcbpqcdez...', // 10
      '.....bccckakkcccdccqbgdeez..', // 11
      '..zbdcdccckkcccdcbcdbfceeez.', // 12
      '.zdffffeedddddfccccddddefebz', // 13
      'bdeffeeddccccccbbbbcccddeedb', // 14
      'bdedcbacedcbacdedcbacdeddcba', // 15
      '.abba..abba..abbba..abbbba..', // 16
    ],
    hit: [
      '.........zzzz.......tr......', // 0
      '...ge..zzghgfzz.....on......', // 1
      '...ec.zfhhgfeedzz...on......', // 2
      '.....zfgfeedddddfzrutssr....', // 3
      '.f..zefeddmmmlkcdcdcpqa.....', // 4
      '....cdedcmmmllkkcdcbpqca....', // 5
      '.....bcbcmbbllkcbccdpqda....', // 6
      '......c.clhhlkkcccdcpqcez...', // 7
      '......d.blblkkcclkcfpqcea...', // 8
      '........blalakcdckcbpqcdez..', // 9
      '......bccckakkcccdccqbgdeez.', // 10
      '...bdcdccckkcccdcbcdbfceeez.', // 11
      '..zdeeedccccbcdccbccccddeba.', // 12
      '.zdffffeedddddfccccddddefebz', // 13
      'bdeffeeddccccccbbbbcccddeedb', // 14
      'bdedcbacedcbacdedcbacdeddcba', // 15
      '.abba..abba..abbba..abbbba..', // 16
    ],
  },
};
