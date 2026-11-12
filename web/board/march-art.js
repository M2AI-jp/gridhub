// 進軍のドット絵（CONTRACTS §80）。描き下ろした絵（art/index.js に載せたもの）を先に使い、
// 載っていない職業・敵は、頭・胴・腕・脚・武器を組み立てる前の絵で描く。盤面の担当
import { CREW as ART_CREW, BUSTS as ART_BUSTS, MOBS as ART_MOBS, STRONG as ART_STRONG, BOSSES as ART_BOSSES, ALIAS as ART_ALIAS } from './art/index.js';
import { paint } from './art/sprite.js';
const SKIN = { S: '#ffe0bd', s: '#f6bd8e', d: '#cf8a62', r: '#ff9b8e', m: '#a8483a' };
const INK = '#1c1430';

export const CREW = {
  hero: {
    pal: { ...SKIN, H: '#ff6a3c', h: '#d83a2a', k: '#8e1f2a', I: '#3a2a80', C: '#7a5ae6', c: '#5a3cc0', e: '#3a2488', A: '#ffd84a', a: '#d89a20', P: '#3a3468', p: '#28244c', B: '#a0623a', b: '#6c3c28', M: '#f4f8ff', n: '#b4c4dc', o: '#6c7c9c', G: '#ffd84a', g: '#c88a20', W: '#ffffff', K: INK },
    back: [
      '....................',
      '.......hH..hH.......',
      '...h..hHHhHHHh.h....',
      '...hhhHHHHHHHHHh....',
      '..khHHHHHHHHHHHHh...',
      '.kkHHHHHHHHHHHHHHh..',
      '.khHHHHHHHHHHHHHHh..',
      '.khHHHHHHHHHHHHHHh..',
      'kkhHHHHHHHHHHHHHhh..',
      '.khHHHhhhhhhhhhhh...',
      'kkhHhhhhh...........',
      '.khhhkk.............',
      '.kkhk...............',
      '..kk................',
    ],
    front: [
      '',
      '',
      '',
      '',
      '.......HHHHHHHH.....',
      '.....hHHHHHHHHHHH...',
      '....hHHHHHHHHHHHHh..',
      '....hHHHhHHHhHHhHh..',
      '....hHHh.hHh.hH.hh..',
      '....kHh...h...h..h..',
      '....kh..............',
      '....k...............',
    ],
    eye: 'I',
    torso: [
      '..cCCCCCCc..',
      '.cCCAACCCCc.',
      '.cCCCAACCCc.',
      '.eCCCCAACCc.',
      '.eCCCCCAACc.',
      '.ecCCCCCCCc.',
      '.GGGGGGGGGG.',
      '.ecCCCCCCCc.',
      '.eecCCCCcee.',
      '.eeccCCcce..',
    ],
    tail: {
      idle: ['..ee', '.ecc', '.ecC', 'ecCC', 'ecCC', 'ecCC', 'ecCC', 'ecCC', 'eccC', 'eecC', '.ecc', '.eec', '..ee'],
      run: [
        ['..........eecc', '.......eecccCC', '....eeccCCCCCC', '..eecCCCCCCCC.', '.eccCCCCCCcc..', 'eecCCCCccee...', '.eeccceee.....', '...eee........'],
        ['.........eecc.', '......eecccCCC', '...eeeccCCCCC.', '.eeecCCCCCcc..', 'eecCCCCCcee...', '..eeccceee....', '....eee.......', '..............'],
      ],
    },
    legs: 'pants',
    sleeve: ['C', 'c'],
    // 剣
    weapon: {
      kind: 'blade',
      straight: [
        '..W..',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMn.',
        '.WMo.',
        '.WMo.',
        '.WMo.',
        'GGGGg',
        'GAAag',
        '..b..',
        '..b..',
        '.GGg.',
      ],
      grip: [2, 14],
    },
  },
  sage: {
    pal: { ...SKIN, H: '#f4f6ff', h: '#c4cce8', k: '#8088b4', I: '#2f6fe0', C: '#4a8cff', c: '#2a60d8', e: '#1c3a98', A: '#ffd84a', a: '#c88a20', P: '#1c3a98', p: '#14286c', B: '#2a60d8', b: '#1c3a98', M: '#9ee8ff', n: '#4ab8ff', o: '#1c70c8', G: '#a0683a', g: '#6c3c28', W: '#ffffff', K: INK, T: '#3a78f0', t: '#2450c0', u: '#16348c' },
    back: [
      '..........tt........',
      '.........tTTt.......',
      '........tTTTt.......',
      '.......tTTTAtu......',
      '......tTTTTTtu......',
      '.....tTTTTTTTtu.....',
      '....tTTAATTTTTtu....',
      '...tTTTTTTTTTATtu...',
      '..hhhTTTTTTTTTTtu...',
      '.hhHHhhhhhhhhhhhh...',
      '.hHHHH..............',
      '.hHHHH..............',
      '.hHHHh..............',
      '.hHHHh..............',
      '..hHHh..............',
      '..hhh...............',
    ],
    front: [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '....uuuuuuuuuuuuu...',
      '...AAAAAAAAAAAAAAAA.',
      '...aaaaaaaaaaaaaaaa.',
      '....hHHHHHHHHh......',
      '....hHHh.hHh........',
    ],
    eye: 'I',
    faceDy: 4,
    torso: [
      '..cCCCCCCc..',
      '.cCCCCAACCc.',
      '.cCCCCAACCc.',
      '.eCCCCAACCc.',
      '.eCCCCAACCc.',
      '.ecCCCAACCc.',
      '.eccCCAACCc.',
      '.eecCCAACCc.',
      '.eecCCAACcc.',
      '.eeccCAAcce.',
    ],
    beard: [
      '.......WWWW.',
      '......WWWWWW',
      '......WWWWWW',
      '.......WWWW.',
      '.......WWW..',
      '........W...',
    ],
    legs: 'robe',
    sleeve: ['C', 'c'],
    weapon: {
      kind: 'staff',
      straight: [
        '..oMo..',
        '.oMWMo.',
        '.nMWMn.',
        '.oMMMo.',
        '..ono..',
        '.GG.GG.',
        '..GGG..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
      ],
      grip: [3, 13],
    },
  },
  scribe: {
    pal: { ...SKIN, H: '#5a3a2a', h: '#3c2418', k: '#241410', I: '#7a4a20', C: '#ffd84a', c: '#e0a020', e: '#a86a14', A: '#ffffff', a: '#d8d4c8', P: '#3c2a5c', p: '#281c44', B: '#7a4a28', b: '#4c2c1c', M: '#ffffff', n: '#d8e4f0', o: '#98a8c0', G: '#30304c', g: '#18182c', W: '#ffffff', K: INK, L: '#d8e8ff' },
    back: [
      '....................',
      '......hhHHHHHHh.....',
      '....hhHHHHHHHHHHh...',
      '...hHHHHHHHHHHHHHh..',
      '..hHHHHHHHHHHHHHHHh.',
      '..hHHHHHHHHHHHHHHHh.',
      '.khHHHHHHHHHHHHHHHh.',
      '.khHHHHHHHHHHHHHHHh.',
      '.khHHHHHHHHHHHHHHHh.',
      '.khHHh..............',
      '.khHHh..............',
      '.khHHh..............',
      'kkhHHh..............',
      'kkhHHh..............',
      'kkhHh...............',
      '.khHh...............',
      '.kkHh...............',
      '.AAa................',
      '.khh................',
      '.kh.................',
    ],
    front: [
      '',
      '',
      '',
      '',
      '.....HHHHHHHHHHH....',
      '....hHHHHHHHHHHHHh..',
      '....hHHHHHHHHHHHHh..',
      '....hHHHHhhhHHHHHh..',
      '....hHh.......hHHh..',
      '....kh.........hHh..',
      '....k...........h...',
    ],
    eye: 'I',
    glasses: true,
    torso: [
      '..AAAAAAAA..',
      '.cAAcCCcAAc.',
      '.cCCCGGCCCc.',
      '.eCCCCCCCCc.',
      '.eCCCCCCCCc.',
      '.ecCCCCCCCc.',
      '.eeCCCCCCCc.',
      '.eecCCCCCcc.',
      '.eecCCCCCce.',
      '.eeccccccee.',
    ],
    legs: 'skirt',
    sleeve: ['C', 'c'],
    // 大きな羽ペン
    weapon: {
      kind: 'quill',
      straight: [
        '....n...',
        '...WMn..',
        '..WWMnn.',
        '..WWMnn.',
        '.WWWMnn.',
        '.WW.Mnnn',
        '.WWWMnno',
        '.WWWMnn.',
        '..WWMno.',
        '.WW.Mnn.',
        '..WWMno.',
        '...WMn..',
        '...WMo..',
        '....Mo..',
        '....Mo..',
        '...GGG..',
        '....GG..',
        '....gg..',
        '....g...',
      ],
      grip: [4, 14],
    },
    item: ['eeeeeeee', 'cAAAaAAc', 'cAAAaAAc', 'cAAAaAAc', 'eeeeeeee'],
  },
  herald: {
    pal: { ...SKIN, H: '#ffcf5a', h: '#e09a28', k: '#a0621c', I: '#1e8a4a', C: '#46c868', c: '#2a9a4c', e: '#176a38', A: '#fff4d0', a: '#d8c49a', P: '#c8a878', p: '#98784c', B: '#7a4a28', b: '#4c2c1c', M: '#fff8e8', n: '#e4d4b0', o: '#c8342c', G: '#a0683a', g: '#6c3c28', W: '#ffffff', K: INK, F: '#ff5a4a', f: '#c82c30' },
    back: [
      '.................F..',
      '................FFf.',
      '...............FFf..',
      '.......cccccc.FFf...',
      '.....cCCCCCCCFFf....',
      '....cCCCCCCCCCCc....',
      '...eCCCCCCCCCCCCc...',
      '...eCCCCCCCCCCCCc...',
      '..eeeeeeeeeeeeeeee..',
      '.khHHHHHHHHHHHHHh...',
      'kkhHHHhhh...........',
      '.khHHh..............',
      '..khh...............',
    ],
    front: [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '...eeeccccccccccccc.',
      '....eeeeeeeeeeeeeee.',
      '....hHHHHHHHHHHHh...',
      '....hHHh.hHHh.hHh...',
      '....kHh...h....h....',
      '....kh..............',
    ],
    eye: 'I',
    faceDy: 3,
    torso: [
      '.ooooooooooo',
      '.ooooooooooo',
      '.cCCCCCCCCc.',
      '.eCCCCnnCCc.',
      '.eCCCnCCnCc.',
      '.ecCCCnnCCc.',
      '.GGGGGGGGGG.',
      '.ecCCCCCCCc.',
      '.eecCCCCcee.',
      '.eeccccccc..',
    ],
    tail: {
      dy: 0,
      idle: ['oo', 'oo', 'oo', 'oo', '.o'],
      run: [['.......ooo', '...oooooo.', '.ooooo....', 'oo........'], ['.......ooo', '...ooooo..', 'oooooo....', '...oo.....']],
    },
    legs: 'shorts',
    sleeve: ['C', 'c'],
    // 封書
    weapon: {
      kind: 'letter',
      fixed: true,
      straight: [
        'MMMMMMMMn',
        'nMMMMMMnn',
        'MnnMMnnMn',
        'MMMnoMMMn',
        'MMMMMMMMn',
        'nnnnnnnnn',
      ],
      grip: [0, 3],
    },
  },
  cartographer: {
    pal: { ...SKIN, H: '#3c2a22', h: '#281a16', k: '#160e0c', I: '#a0501c', C: '#ff9040', c: '#d8622a', e: '#98401c', A: '#ffe8b0', a: '#d4b078', P: '#5c4a38', p: '#40322a', B: '#7a4a28', b: '#4c2c1c', M: '#fff0c8', n: '#e4c88c', o: '#a87a44', G: '#a0683a', g: '#6c3c28', W: '#ffffff', K: INK, T: '#b47a44', t: '#8c5630', u: '#623a20', L: '#9ee8ff', l: '#3a88b8' },
    back: [
      '....................',
      '.......tTTTTTt......',
      '......tTTTTTTTTt....',
      '.....tTTTTTTTTTTt...',
      '....uTTTTTTTTTTTTt..',
      '....uTTTTTTTTTTTTt..',
      '....uTTTTTTTTTTTTt..',
      '...uutttttttttttttt.',
      '.uuuuuuuuuuuuuuuuuuu',
      '.khHHHHHHHHHHHh.....',
      '.khHHHh.............',
      '.khHHh..............',
      '..kkh...............',
    ],
    front: [
      '',
      '',
      '',
      '',
      '',
      '.......KKKKKKKKK....',
      '......KLLlKKKLLlK...',
      '......KLLlKKKLLlK...',
      '.......KKKKKKKKK....',
      '....hHHHHHHHHHHHh...',
      '....hHh.hHHh.hHh....',
      '....kh...h....h.....',
      '....k...............',
    ],
    eye: 'I',
    faceDy: 3,
    torso: [
      '..AAAAAAAA..',
      '.cCCAAAACCc.',
      '.cCCCaaCCCc.',
      '.eCggCCggCc.',
      '.eCggCCggCc.',
      '.ecCCCCCCCc.',
      '.GGGGGGGGGG.',
      '.ecCCggCCCc.',
      '.eecCggCcee.',
      '.eeccccccc..',
    ],
    legs: 'pants',
    sleeve: ['C', 'c'],
    // 丸めた地図
    weapon: {
      kind: 'scroll',
      straight: [
        '.oMMo.',
        '.oMMo.',
        '.nMMn.',
        '.nMMn.',
        '.nMno.',
        '.nMMn.',
        'gGGGGg',
        '.nMMn.',
        '.nMMn.',
        '.nMMn.',
        '.nMno.',
        '.nMMn.',
        'gGGGGg',
        '.nMMn.',
        '.oMMo.',
      ],
      grip: [3, 11],
    },
    item: ['.GGGG.', 'GMMoMG', 'GMoMMG', 'GMMMMG', '.GGGG.'],
  },
  painter: {
    pal: { ...SKIN, H: '#9a5cff', h: '#6a3ad0', k: '#42248c', I: '#d82c88', C: '#ff72b4', c: '#d8488c', e: '#982c64', A: '#fff4e0', a: '#dcc8b0', P: '#3a3468', p: '#28244c', B: '#e8e4ec', b: '#a8a0b8', M: '#ff4a7c', n: '#ffd84a', o: '#3ac8ff', G: '#a0683a', g: '#6c3c28', W: '#ffffff', K: INK, T: '#ff4a7c', t: '#d02c5c', u: '#8e1c44' },
    back: [
      '....................',
      '.........t..........',
      '.......tTTTTTt......',
      '....tTTTTTTTTTTTt...',
      '..tTTTTTTTTTTTTTTTt.',
      '.tTTTTTTTTTTTTTTTTTt',
      '.uTTTTTTTTTTTTTTTTTt',
      '..uuuttttttttttttt..',
      '..khHHHHHHHHHHHHh...',
      '.khHHHHHHHHHHHHHHh..',
      '.khHHH..............',
      '.khHHh..............',
      '.khHHh..............',
      '..khh...............',
    ],
    front: [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '....hHHHHHHHHHHHh...',
      '....hHHHHhHHHhHHh...',
      '....hHh.hH..hH..h...',
      '....kh..............',
    ],
    eye: 'I',
    faceDy: 3,
    torso: [
      '..cCCCCCCc..',
      '.AAAAAAAAAA.',
      '.AAAAAAAMAA.',
      '.aAAnAAAAAA.',
      '.aAAAAAoAAA.',
      '.aAMAAAAAAA.',
      '.aAAAAnAAAA.',
      '.aaAAAAAAoA.',
      '.aaAoAAAAAA.',
      '.aaaAAAAAa..',
    ],
    legs: 'pants',
    sleeve: ['C', 'c'],
    // 大きな筆
    weapon: {
      kind: 'brush',
      straight: [
        '...M...',
        '..MMM..',
        '..MMM..',
        '.MMMMM.',
        '.MMMMt.',
        '.MMMMt.',
        '.MMMtt.',
        '.nnnnn.',
        '.nAnnn.',
        '..GGG..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
        '...GG..',
        '...gg..',
      ],
      grip: [3, 13],
    },
    item: ['.GGGGGG.', 'GMGnGoGG', 'GGGGGGGg', '.ggggg..'],
  },
};

// ほかの職業は、形を借りて色を変える
const variant = (base, pal) => ({ ...CREW[base], pal: { ...CREW[base].pal, ...pal } });
CREW.mage = variant('sage', { H: '#ffb0d0', h: '#e070a0', k: '#a04070', I: '#c02c60', T: '#d83c6c', t: '#a82450', u: '#70183c', M: '#ffb0ff', n: '#e860d0', o: '#a03ca0' });
CREW.priest = variant('painter', { H: '#ffe08a', h: '#d8a840', k: '#a0702c', I: '#2c8c78', T: '#ffffff', t: '#d8dce8', u: '#a0a8c0', A: '#ffffff', a: '#d8dce8', M: '#ffd84a', n: '#f4f4f4', o: '#60d8c0' });
CREW.warrior = variant('hero', { H: '#5a4034', h: '#3c2820', k: '#241410', I: '#3c5c8c', A: '#d8dce8', a: '#98a0b4' });
CREW.merchant = variant('cartographer', { T: '#46a058', t: '#2c7c44', u: '#1c5430' });
CREW.villager = variant('herald', { F: '#d8c49a', f: '#a8905c', o: '#a07050' });

// 地図で決めた色（C・c・e を差しかえる）
export const RAMPS = {
  blue: ['#4a8cff', '#2a60d8', '#1c3a98'],
  yellow: ['#ffd84a', '#e0a020', '#a86a14'],
  green: ['#46c868', '#2a9a4c', '#176a38'],
  orange: ['#ff9040', '#d8622a', '#98401c'],
  pink: ['#ff72b4', '#d8488c', '#982c64'],
  purple: ['#7a5ae6', '#5a3cc0', '#3a2488'],
  mint: ['#5ae0c0', '#2cb098', '#1c7c70'],
  gray: ['#a8acb8', '#7c8090', '#54586a'],
};

const FACE = [
  '.SSSSSSSSSSSS.',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS',
  'SSSSSSSSSSSSSS',
  'sSSSSSSSSSSSSS',
  'sSSSSSSSSSSSSS',
  'sSSSSSSSSSSSSS',
  '.sSSSSSSSSSSSs',
  '.dsSSSSSSSSSs.',
  '...ddssssss...',
];

// 表情（顔の左上からの位置に重ねる）
const EXPR = {
  normal: [[5, 3, ['KKK', 'WIK', 'iIK']], [11, 3, ['KK', 'WK', 'iK']], [4, 6, ['r']], [13, 6, ['r']], [9, 7, ['mm']]],
  blink: [[5, 5, ['KKK']], [11, 5, ['KK']], [4, 6, ['r']], [13, 6, ['r']], [9, 7, ['mm']]],
  happy: [[5, 3, ['.K.', 'K.K']], [11, 3, ['K.', '.K']], [4, 5, ['rr']], [12, 5, ['rr']], [8, 6, ['mmmm', '.mm.']]],
  fierce: [[5, 2, ['K..', 'KKK', 'WIK', 'iIK']], [11, 2, ['.K', 'KK', 'WK', 'iK']], [9, 7, ['mmm']]],
  hurt: [[5, 3, ['K.K', '.K.', 'K.K']], [11, 3, ['K.', '.K', 'K.']], [9, 7, ['mm', 'mm']]],
};

const LEGS = {
  pants: {
    stand: ['..PPPpPPPp..', '..PPpp.PPp..', '..PPp..PPp..', '..PPp..PPp..', '..PPp..PPp..', '..BBb..BBb..', '..BBbb.BBbb.', '..bbbb.bbbb.'],
    run: [
      ['...PPPpPPp..', '..PPPp.PPPp.', '.PPPp...PPPp', 'PPPp.....PPp', 'BBb......BBb', 'BBb......BBB', 'b........bbb', '............'],
      ['...PPPpPp...', '...PPpPPp...', '...PPpPPp...', '...PPPPPp...', '....PPPp....', '....BBBb....', '....BBBbb...', '....bbbbb...'],
      ['...PPpPPp...', '.PPPp.PPPp..', 'PPPp...PPPp.', 'PPp.....PPp.', 'BBb.....BBb.', 'bBb.....BBBb', 'bb......bbbb', '............'],
      ['....PPPPp...', '....PPpPPp..', '...PPp.PPp..', '...PPp.PPp..', '....Bb.PPp..', '....bb.BBb..', '.......BBBb.', '.......bbbb.'],
    ],
    sit: ['............', '............', '............', '.PPPPPPPPPp.', '.PPPPPPPPPP.', '.pppppppBBBb', '.......BBBBb', '.......bbbbb'],
  },
  shorts: {
    stand: ['..PPPpPPPp..', '..PPpp.PPp..', '..PPp..PPp..', '..SSs..SSs..', '..SSs..SSs..', '..BBb..BBb..', '..BBbb.BBbb.', '..bbbb.bbbb.'],
    run: [
      ['...PPPpPPp..', '..PPPp.PPPp.', '.PSSs...SSSs', 'SSSs.....SSs', 'BBb......BBb', 'BBb......BBB', 'b........bbb', '............'],
      ['...PPPpPp...', '...PPpPPp...', '...SSsSSs...', '...SSSSSs...', '....SSSs....', '....BBBb....', '....BBBbb...', '....bbbbb...'],
      ['...PPpPPp...', '.PPPp.PPPp..', 'SSSs...SSSs.', 'SSs.....SSs.', 'BBb.....BBb.', 'bBb.....BBBb', 'bb......bbbb', '............'],
      ['....PPPPp...', '....PPpPPp..', '...SSs.SSs..', '...SSs.SSs..', '....Bb.SSs..', '....bb.BBb..', '.......BBBb.', '.......bbbb.'],
    ],
    sit: ['............', '............', '............', '.PPPPPSSSSs.', '.PPPPPSSSSS.', '.pppppppBBBb', '.......BBBBb', '.......bbbbb'],
  },
  skirt: {
    stand: ['.ccCCCCCCCc.', '.cCCCCCCCCc.', 'ecCCcCCcCCCc', 'eeccceccccce', '..SSs..SSs..', '..SSs..SSs..', '..BBb..BBb..', '..BBbb.BBbb.'],
    run: [
      ['.ccCCCCCCCc.', '.cCCCCCCCCCc', 'ecCCcCCcCCCc', 'eeccceccccce', '..SSs...SSs.', '.SSs.....SSs', 'BBb......BBb', 'bbb......BBB'],
      ['.ccCCCCCCCc.', '.cCCCCCCCCc.', 'ecCCcCCcCCc.', 'eeccceccccc.', '....SSSs....', '....SSSs....', '....BBBb....', '....BBBbb...'],
      ['.ccCCCCCCCc.', 'ccCCCCCCCCc.', 'cCCCcCCcCCc.', 'eccceccccce.', '...SSs.SSs..', '..SSs...SSs.', '.BBb....BBb.', '.bbb....BBBb'],
      ['.ccCCCCCCCc.', '.cCCCCCCCCc.', 'ecCCcCCcCCc.', 'eeccceccccc.', '....SSs.SSs.', '....Bb..SSs.', '....bb..BBb.', '........BBBb'],
    ],
    sit: ['............', '.cCCCCCCCCc.', 'cCCCCCCCCCCc', 'ecCCcCCcCCCc', 'eeccceccccce', '.......SSSSs', '.......BBBBb', '.......bbbbb'],
  },
  robe: {
    stand: ['.ccCCAACCCc.', '.cCCCAACCCc.', '.eCCCAACCCCc', 'ecCCCAACCCCc', 'eeCCCAACCCCc', 'eecCCAACCCCc', 'eeecccccccce', '...BBb.BBBb.'],
    run: [
      ['.ccCCAACCCc.', '.cCCCAACCCCc', '.eCCCAACCCCc', 'ecCCCAACCCCC', 'eeCCCAACCCCC', 'eecCCAACCcCC', 'eeeccccccccc', '..BBb....BBb'],
      ['.ccCCAACCCc.', '.cCCCAACCCc.', '.eCCCAACCCc.', '.eCCCAACCCCc', 'eeCCCAACCCCc', 'eecCCAACCCCc', 'eeeccccccccc', '....BBBBb...'],
      ['.ccCCAACCCc.', 'ccCCCAACCCc.', 'cCCCCAACCCc.', 'CCCCCAACCCe.', 'CCCCCAACCee.', 'CCcCCAACeee.', 'ccccccccee..', 'BBb.....BBb.'],
      ['.ccCCAACCCc.', '.cCCCAACCCc.', '.eCCCAACCCc.', 'eeCCCAACCCc.', 'eeCCCAACCCCc', 'eecCCAACCCCc', 'eeeccccccccc', '.....BBBBb..'],
    ],
    sit: ['............', '............', '.cCCCAACCCCc', 'ecCCCAACCCCC', 'eeCCCAACCCCC', 'eecCCAACCCCC', 'eeeccccccccc', '.........BBb'],
  },
};

// 腕（肩を [0,0] にする）。S は手
const ARM = {
  down: { g: ['CCc', 'CCc', 'CCc', 'CCc', 'cCc', 'SSs', 'SSs'], hand: [1, 6] },
  front: { g: ['CCCCCCSS', 'CCCCcCSS', 'cccccSSs'], ox: 1, hand: [7, 1] },
  up: { g: ['SSs', 'SSs', 'cCc', 'CCc', 'CCc', 'CCc', 'CCc'], dy: -6, hand: [1, 0] },
  upfront: { g: ['.....SS', '....CSS', '...CCs.', '..CCc..', '.CCc...', 'CCc....'], ox: 5, dy: -5, hand: [5, 0] },
  upback: { g: ['SSs...', 'SSsC..', '..cCC.', '...CCc', '....CC'], dx: -3, dy: -5, hand: [1, 0] },
  downfront: { g: ['CC.....', 'CCc....', '.CCc...', '..CCc..', '...CSS.', '....SSs'], ox: 3, hand: [5, 5] },
  back: { g: ['...CCc', '..CCc.', '.CCc..', 'SSc...', 'SSs...'], dx: -5, hand: [0, 4] },
};

const mix = (a, b, t) => {
  const p = (x) => [1, 3, 5].map((k) => parseInt(x.slice(k, k + 2), 16));
  const [r, g, u] = p(a).map((v, k) => Math.round(v + (p(b)[k] - v) * t));
  return `#${[r, g, u].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};
const blank = (w, h) => Array.from({ length: h }, () => new Array(w).fill(null));

function stamp(buf, grid, dx, dy, pal, map = null) {
  grid.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[map?.[ch] ?? ch];
      if (!c) continue;
      const y = dy + j;
      const x = dx + i;
      if (y >= 0 && y < buf.length && x >= 0 && x < buf[0].length) buf[y][x] = c;
    }
  });
}

// 武器を握りを中心に回す（0=真上、90=真右）。細い線が切れないよう、少し広めに拾う
function stampRotated(buf, grid, grip, deg, hx, hy, pal) {
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const R = Math.max(grid.length, ...grid.map((r) => r.length)) + 2;
  const at = (u, v) => {
    const ch = grid[Math.round(v + grip[1])]?.[Math.round(u + grip[0])];
    return ch && ch !== '.' ? ch : null;
  };
  for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
    const pick = (dx, dy) => at((ox + dx) * cos + (oy + dy) * sin, -(ox + dx) * sin + (oy + dy) * cos);
    const ch = pick(0, 0) ?? pick(0.3, 0.3) ?? pick(-0.3, -0.3);
    if (!ch) continue;
    const x = hx + ox;
    const y = hy + oy;
    if (buf[y] && x >= 0 && x < buf[0].length && pal[ch]) buf[y][x] = pal[ch];
  }
}

function outline(buf, color = INK) {
  const h = buf.length;
  const w = buf[0].length;
  const add = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (buf[y][x]) continue;
    if (buf[y - 1]?.[x] || buf[y + 1]?.[x] || buf[y][x - 1] || buf[y][x + 1]) add.push([x, y]);
  }
  for (const [x, y] of add) buf[y][x] = color;
  return buf;
}

export const SIZE = 72;
export const FOOT = 62;
export const CENTER = 30;

/**
 * ポーズ = 1枚の組み立て図
 * pose: { legs, run, bob, lean, arm, backArm, weapon: 角度|null, behind, expr, tail: 'idle'|0|1, headDx, headDy }
 */
/** 描き下ろしの絵（無ければ null） */
export function artOf(job) {
  const j = job ?? '';
  return (Object.hasOwn(ART_CREW, j) ? ART_CREW[j] : null) ?? (Object.hasOwn(ART_ALIAS, j) && Object.hasOwn(ART_CREW, ART_ALIAS[j]) ? ART_CREW[ART_ALIAS[j]] : null);
}
const TEAM_OK = new Set(['blue', 'yellow', 'green', 'orange', 'pink', 'purple', 'mint', 'gray']);
/** 描き下ろしの 56×56 を、前の絵と同じ置き場所（SIZE×SIZE、足もと CENTER/FOOT）に移す */
function place(buf, art) {
  const out = blank(SIZE, SIZE);
  const dx = CENTER - art.ax;
  const dy = FOOT - art.ay;
  buf.forEach((r, y) => r.forEach((c, x) => {
    if (!c) return;
    const yy = y + dy;
    const xx = x + dx;
    if (yy >= 0 && yy < SIZE && xx >= 0 && xx < SIZE) out[yy][xx] = c;
  }));
  return out;
}
export function compose(job, pose, color = null) {
  const art = artOf(job);
  if (art && pose?.frame && art.frames[pose.frame]) return place(paint(art, pose.frame, TEAM_OK.has(color) ? color : 'gray'), art);
  return legacyCompose(job, pose?.legacy ?? pose, color);
}
function legacyCompose(job, pose, color = null) {
  const c = Object.hasOwn(CREW, job ?? '') ? CREW[job] : CREW.villager;
  const ramp = Object.hasOwn(RAMPS, color ?? '') ? RAMPS[color] : null;
  const pal = { ...c.pal, i: mix(c.pal.I, '#ffffff', 0.45), ...(ramp ? { C: ramp[0], c: ramp[1], e: ramp[2] } : {}) };
  const buf = blank(SIZE, SIZE);
  const bob = pose.bob ?? 0;
  const lean = pose.lean ?? 0;
  const legY = FOOT - 8;
  const torsoX = CENTER - 6 + lean;
  const torsoY = (pose.legs === 'sit' ? FOOT - 15 : FOOT - 17) + bob;
  const headX = torsoX - 4 + (pose.headDx ?? 0);
  const headY = torsoY - 16 + (pose.headDy ?? 0);
  const faceDy = c.faceDy ?? 0;
  const arm = ARM[pose.arm ?? 'down'];
  const ax = torsoX + 4 + (arm.ox ?? 0) + (arm.dx ?? 0);
  const ay = torsoY + 1 + (arm.dy ?? 0);
  const weapon = () => {
    if (pose.weapon === null || pose.weapon === undefined) return;
    stampRotated(buf, c.weapon.straight, c.weapon.grip, c.weapon.fixed ? 0 : pose.weapon, ax + arm.hand[0], ay + arm.hand[1], pal);
  };
  // 奥から順に: 武器(背中) → マント → 奥の腕 → 脚 → 胴 → 頭 → 手前の腕
  if (pose.behind) weapon();
  if (c.tail) {
    const g = pose.tail === 'idle' || pose.tail === undefined ? c.tail.idle : c.tail.run[pose.tail];
    stamp(buf, g, torsoX + 2 - g[0].length + (c.tail.dx ?? 0), torsoY + (c.tail.dy ?? 1), pal);
  }
  const backArm = ARM[pose.backArm ?? 'back'];
  const bax = torsoX + 1 + (backArm.dx ?? 0);
  const bay = torsoY + 2 + (backArm.dy ?? 0);
  stamp(buf, backArm.g, bax, bay, pal, { C: 'c', c: 'e', S: 's', s: 'd' });
  if (c.item) stamp(buf, c.item, bax + (backArm.hand?.[0] ?? 0) - Math.floor(c.item[0].length / 2), bay + (backArm.hand?.[1] ?? 0) - Math.floor(c.item.length / 2), pal);
  const lg = LEGS[c.legs];
  const leg = pose.legs === 'run' ? lg.run[pose.run ?? 0] : pose.legs === 'sit' ? lg.sit : lg.stand;
  stamp(buf, leg, CENTER - 6, legY + (pose.legs === 'run' ? Math.min(0, bob) : 0), pal);
  stamp(buf, c.torso, torsoX, torsoY, pal);
  stamp(buf, c.back, headX, headY, pal);
  stamp(buf, FACE, headX + 4, headY + 7 + faceDy, pal);
  for (const [ex, ey, g] of EXPR[pose.expr ?? 'normal']) stamp(buf, g, headX + 4 + ex, headY + 7 + faceDy + ey, pal);
  if (c.glasses) stamp(buf, ['.GGGG..GGGG', 'GL..G.GL..G', 'GL..GGGL..G', '.GGGG..GGGG'], headX + 8, headY + 9 + faceDy, pal);
  stamp(buf, c.front, headX, headY, pal);
  if (!pose.behind) weapon();
  stamp(buf, arm.g, ax, ay, pal);
  if (c.beard && !pose.noBeard) stamp(buf, c.beard, headX + 6, headY + 15 + faceDy, pal);
  return outline(buf);
}

// 全部のポーズ（frame = 描き下ろしの絵の名前。legacy = 前の絵での組み立て図）
const L = {
  idle0: { legs: 'stand', arm: 'downfront', weapon: 32 },
  idle1: { legs: 'stand', bob: 1, arm: 'downfront', weapon: 32 },
  blink: { legs: 'stand', arm: 'downfront', weapon: 32, expr: 'blink' },
  run0: { legs: 'run', run: 0, bob: 0, lean: 1, arm: 'front', weapon: 68, headDx: 1, tail: 0 },
  run1: { legs: 'run', run: 1, bob: -2, lean: 1, arm: 'front', weapon: 68, headDx: 1, tail: 1 },
  run2: { legs: 'run', run: 2, bob: 0, lean: 1, arm: 'front', weapon: 68, headDx: 1, tail: 0 },
  run3: { legs: 'run', run: 3, bob: -2, lean: 1, arm: 'front', weapon: 68, headDx: 1, tail: 1 },
  wind: { legs: 'stand', lean: -2, arm: 'upback', weapon: -55, behind: true, expr: 'fierce', headDx: -1, tail: 1 },
  strike: { legs: 'run', run: 0, lean: 3, bob: 1, arm: 'front', weapon: 90, expr: 'fierce', headDx: 2, tail: 0 },
  follow: { legs: 'run', run: 0, lean: 2, bob: 1, arm: 'downfront', weapon: 132, expr: 'fierce', headDx: 1, tail: 0 },
  hurt: { legs: 'stand', lean: -3, bob: 1, arm: 'back', backArm: 'back', expr: 'hurt', headDx: -2, headDy: 1, tail: 1 },
  sit0: { legs: 'sit', arm: 'front', expr: 'normal', tail: 'idle' },
  sit1: { legs: 'sit', bob: 1, arm: 'front', expr: 'blink', tail: 'idle' },
  cheer0: { legs: 'stand', arm: 'upfront', backArm: 'back', weapon: 12, expr: 'happy' },
  cheer1: { legs: 'run', run: 1, bob: -3, arm: 'upfront', backArm: 'back', weapon: 12, expr: 'happy', tail: 1 },
};
const P = (frame, legacy) => ({ frame, legacy, ...legacy });
export const POSES = {
  idle0: P('idle0', L.idle0),
  idle1: P('idle1', L.idle1),
  idle2: P('idle2', L.idle0),
  idle3: P('idle3', L.idle1),
  blink: P('blink', L.blink),
  run0: P('run0', L.run0),
  run1: P('run1', L.run1),
  run2: P('run2', L.run2),
  run3: P('run3', L.run3),
  run4: P('run4', L.run0),
  run5: P('run5', L.run1),
  wind: P('wind', L.wind),
  strike: P('strike', L.strike),
  follow: P('follow', L.follow),
  hurt: P('hurt', L.hurt),
  down: P('down', L.hurt),
  sit0: P('sit0', L.sit0),
  sit1: P('sit1', L.sit1),
  cheer0: P('cheer0', L.cheer0),
  cheer1: P('cheer1', L.cheer1),
};
/** その職業が描き下ろしの絵を持っているか（走りのコマ数・倒れの絵を決める） */
export const hasArt = (job) => !!artOf(job);


// 札に出す顔（胸から上）。描き下ろしは 32×32、前の絵は 30×28 を真ん中に置く
export const BUST = { w: 32, h: 32 };
export function bust(job, expr = 'normal', color = null) {
  const j = job ?? '';
  const art = (Object.hasOwn(ART_BUSTS, j) ? ART_BUSTS[j] : null) ?? (Object.hasOwn(ART_ALIAS, j) && Object.hasOwn(ART_BUSTS, ART_ALIAS[j]) ? ART_BUSTS[ART_ALIAS[j]] : null);
  if (art) return paint(art, art.frames[expr] ? expr : 'normal', TEAM_OK.has(color) ? color : 'gray');
  const fig = artOf(job);
  if (fig) {
    const fr = { normal: 'idle0', blink: 'blink', happy: 'cheer0', fierce: 'wind', hurt: 'hurt' }[expr] ?? 'idle0';
    const buf = paint(fig, fig.frames[fr] ? fr : 'idle0');
    const out = blank(BUST.w, BUST.h);
    const dx = Math.floor((BUST.w - fig.w) / 2), dy = BUST.h - fig.h - 1;
    buf.forEach((r, y) => r.forEach((c, x) => { const X = x + dx, Y = y + dy; if (c && X >= 0 && X < BUST.w && Y >= 0 && Y < BUST.h) out[Y][X] = c; }));
    return out;
  }
  const buf = legacyCompose(job, { legs: 'stand', arm: 'down', backArm: 'down', expr, tail: 'idle' }, color);
  const ty = FOOT - 17 - 16 - 8;
  const crop = buf.slice(ty, ty + 28).map((r) => r.slice(CENTER - 15, CENTER + 15));
  const out = blank(BUST.w, BUST.h);
  crop.forEach((r, y) => r.forEach((c, x) => { out[y + 4][x + 1] = c; }));
  return out;
}

// ---- 敵（左を向く）。C c x は色替え、W K は目、m は口
const MOB_GRIDS = {
  slime: {
    frames: [[
      '......xxxxx.......',
      '....xxCCCCCxx.....',
      '...xCWWCCCCCCc....',
      '..xCWWCCCCCCCCc...',
      '..CCCCCCCCCCCCCc..',
      '.xCKWWCKWWCCCCCc..',
      '.CCKKWCKKWCCCCCCc.',
      '.CCCCCCCCCCCCCCCc.',
      '.CCCCmmmmmCCCCCcc.',
      '.cCCCCmmmCCCCCccc.',
      '.ccCCCCCCCCCccccc.',
      '..cccccccccccccc..',
    ], [
      '........xxxx......',
      '.....xxCCCCCxx....',
      '...xCWWCCCCCCCc...',
      '..xCCCCCCCCCCCCc..',
      '.xCKWWCKWWCCCCCCc.',
      '.CCKKWCKKWCCCCCCc.',
      'cCCCCCCCCCCCCCCCcc',
      'cCCCCmmmmmCCCCCccc',
      'ccCCCCCCCCCCCccccc',
      '.ccccccccccccccc..',
    ]],
  },
  mushroom: {
    frames: [[
      '.....xxxxxx.....',
      '...xxCCCCCCxx...',
      '..xCCWWCCCCCCc..',
      '.xCCWWWCCWWCCCc.',
      '.CCCCWCCCWWCCCc.',
      'xCCCCCCCCCCCWWCc',
      'CCWWCCCCCCCCWWCc',
      'cCCCCCCCCCCCCCcc',
      '.ccAAAAAAAAAAcc.',
      '...AKKAAKKAAAa..',
      '...AKWAAKWAAAa..',
      '...AAAAAAAAAAa..',
      '...AAAmmmAAAaa..',
      '....AAAAAAAaa...',
      '...BB.....BB....',
      '..BBB.....BBB...',
    ], [
      '.......xxxxxx...',
      '.....xxCCCCCCxx.',
      '...xCWWCCCCCCCCc',
      '..xCWWWCCWWCCCCc',
      '..CCCWCCCWWCCCCc',
      '.xCCCCCCCCCCWWCc',
      '.CWWCCCCCCCCWWcc',
      '.cCCCCCCCCCCCcc.',
      '..ccAAAAAAAAcc..',
      '...AKKAAKKAAAa..',
      '...AKWAAKWAAAa..',
      '...AAAAAAAAAAa..',
      '...AAAmmmAAAaa..',
      '....AAAAAAAaa...',
      '....BB...BB.....',
      '....BBB..BBB....',
    ]],
  },
  bat: {
    fly: true,
    frames: [[
      'c.....................c.',
      'cc.......x....x......cc.',
      'cCc......Cx..xC.....cCc.',
      'cCCc.....CCCCCC....cCCc.',
      'cCCCc...CWKCWKCC..cCCCc.',
      'cCCCCc..CKKCKKCC.cCCCCc.',
      '.cCCCCccCCCCCCCCcCCCCc..',
      '..cCCCCCCCmWmmCCCCCCc...',
      '...cCcCcCCCCCCCCcCcc....',
      '....c.c.cCCCCCCc.c.c....',
      '.........cCCCCc.........',
    ], [
      '........x....x..........',
      '........Cx..xC..........',
      '........CCCCCC..........',
      '.......CWKCWKCC.........',
      '...cc..CKKCKKCC..cc.....',
      '..cCCc.CCCCCCCC.cCCc....',
      '.cCCCCccCmWmmCCcCCCCc...',
      'cCCCCCCCCCCCCCCCCCCCCc..',
      'cCCcCCcCCCCCCCCcCCcCCc..',
      'cCc.cc.cCCCCCCc.cc.cCc..',
      'c.......cCCCCc.......c..',
    ]],
  },
  skeleton: {
    frames: [[
      '....AAAAAAAA....',
      '...AAAAAAAAAa...',
      '...AKKAAKKAAa...',
      '...AKEAAKEAAa...',
      '...AAAAKAAAAa...',
      '....AmAmAmAa....',
      '.....aaaaaa.....',
      'MM...AaAaAa.....',
      'nMM.AAAAAAAAa...',
      '.nMAAaAaAaAAAa..',
      '..nMA.AAAAa.AAa.',
      '...AA.aAaAa..Aa.',
      '..AA..AAAAa..aa.',
      '......AaaAa.....',
      '.....AA...Aa....',
      '.....Aa...Aa....',
      '.....Aa...Aa....',
      '.....Aa...Aa....',
      '....AAa..AAa....',
    ], [
      '....AAAAAAAA....',
      '...AAAAAAAAAa...',
      '...AKKAAKKAAa...',
      '...AKEAAKEAAa...',
      '...AAAAKAAAAa...',
      '....AmAmAmAa....',
      '.....aaaaaa.....',
      '.....AaAaAa.....',
      '.MMMAAAAAAAAa...',
      'nnMMMAaAaAaAAa..',
      '...AA.AAAAa.AAa.',
      '...AA.aAaAa..Aa.',
      '...A..AAAAa..aa.',
      '......AaaAa.....',
      '....AA....Aa....',
      '....Aa....Aa....',
      '....Aa...Aa.....',
      '....Aa...Aa.....',
      '...AAa..AAa.....',
    ]],
  },
  ghost: {
    fly: true,
    frames: [[
      '.....xxxxxx.....',
      '...xxCCCCCCxx...',
      '..xCCCCCCCCCCc..',
      '.xCCCCCCCCCCCCc.',
      '.CCKKCCKKCCCCCc.',
      '.CKWKCKWKCCCCCc.',
      '.CKKKCKKKCCCCCc.',
      'xCCCCCCCCCCCCCCc',
      'CCCCCmmmCCCCCCCc',
      'CCCCmmmmmCCCCCCc',
      'CCCCCmmmCCCCCCcc',
      'CCCCCCCCCCCCCCcc',
      'CCCCCCCCCCCCCccc',
      'CCcCCCcCCCcCCcc.',
      '.c.cCc.cCc.cCc..',
      '....c...c...c...',
    ], [
      '.....xxxxxx.....',
      '...xxCCCCCCxx...',
      '..xCCCCCCCCCCc..',
      '.xCCCCCCCCCCCCc.',
      '.CCKKCCKKCCCCCc.',
      '.CKWKCKWKCCCCCc.',
      '.CKKKCKKKCCCCCc.',
      'xCCCCCCCCCCCCCCc',
      'CCCCCCmCCCCCCCCc',
      'CCCCCmmmCCCCCCCc',
      'CCCCCCmCCCCCCCcc',
      'CCCCCCCCCCCCCCcc',
      'CCCCCCCCCCCCCccc',
      'cCCCcCCCcCCCcCc.',
      '.cCc.cCc.cCc.c..',
      '..c...c...c.....',
    ]],
  },
  imp: {
    frames: [[
      '..h..........h...',
      '..Hh........hH...',
      '..HHh.xxxx.hHH...',
      '...HCCCCCCCCH....',
      '...CCCCCCCCCCc...',
      '..CKEKCKEKCCCc...',
      '..CCKCCCKCCCCc...',
      '..cCCCCCCCCCCc...',
      '...CTmTmTmCCc....',
      'G...ccccccccc....',
      'Gg.AACCCCCCAAa...',
      'Gg.CAAAAAAAACc.c.',
      'Gg.CCCAAAACCCc.cc',
      'Gg.CC.AAAA.Cc..c.',
      'GCC...CCCCc....c.',
      'Gg....CCcCc..cc..',
      'Gg...CC...Cc.....',
      'Gg...Cc...Cc.....',
      'Gg..CCC..CCC.....',
    ], [
      '..h..........h...',
      '..Hh........hH...',
      '..HHh.xxxx.hHH...',
      '...HCCCCCCCCH....',
      '...CCCCCCCCCCc...',
      '..CKEKCKEKCCCc...',
      '..CCKCCCKCCCCc...',
      '..cCCCCCCCCCCc...',
      '...CTmTmTmCCc....',
      '....ccccccccc....',
      'Gg.AACCCCCCAAa...',
      'GCCCAAAAAAAACc..c',
      'Gg.CCCAAAACCCc.cc',
      'Gg.CC.AAAA.Cc..c.',
      'Gg....CCCCc....c.',
      'Gg....CCcCc.cc...',
      'Gg....CC.Cc......',
      'Gg....Cc.Cc......',
      'Gg...CCC.CCC.....',
    ]],
  },
};

const mirror = (half) => half.map((r) => r + r.split('').reverse().join(''));
const BOSS_GRIDS = {
  golem: mirror([
    '..........qqqqqqqq',
    '........qqrrrrRRRR',
    '.......qrrRRRRRRRR',
    '.......qrRRRRRRRRR',
    '.......qrRRRRRRRRR',
    '.......qrRqqqqRRRR',
    '.......qrRqEEEqRRR',
    '.......qrRqEeEqRRR',
    '.......qrRRqqqRRRR',
    '.......qqrRRRRqqqR',
    '..qqqqq.qqrRRRqKKK',
    '.qRRRRRqqqqqqqqKEK',
    'qRRRRRRRqrRRRRRqKK',
    'qRRRRRRRqrRRRRRRRR',
    'qrRRRRRqrrRRRRRRRR',
    'qrrRRrqrrRRqqRRRRR',
    '.qrrrrqrRRqRRqRRRR',
    '.qrRRrqrRRqRRqRRRR',
    '.qrRRRqrrRRqqRRRRR',
    '.qrRRRqrrRRRRRRRRq',
    '.qrRRrqqrrRRRRRRqq',
    '.qrRrq.qqrrrrrrrqq',
    'qqrrrqq.qrrrRRRRRR',
    'qRRrRRq.qrRRRRRRRR',
    'qRRRRRq.qrRRRRqqqq',
    'qrRRRrq.qrRRRq....',
    '.qqqqq..qrRRRq....',
    '........qrRRRq....',
    '........qrRRRRq...',
    '.......qrRRRRRRq..',
    '.......qqqqqqqqqq.',
  ]),
  demon: mirror([
    '.....H..................',
    '.....HH.................',
    '....HHh.................',
    '....HHh.................',
    '....HHHh................',
    '.....HHh................',
    '.....HHHh.........GG....',
    '......HHHh....G..GGg..G.',
    '......HHHHhdddGGgGGgGGGG',
    '.......HHHHDDDDGGGGGGGGG',
    '........dDDDDDDDDDDDDDDD',
    '.......dDDDDDDDDDDDDDDDD',
    '.......dDDDDDDDDDDDDDDDD',
    '.......dDDEEDDDDDDDDDDDD',
    '.......dDDeEEEDDDDDDDDDD',
    '.......dDDdEEEEDDDDDDDDD',
    '.......ddDDDddDDDDDDDDDD',
    '........dDDDDDDDDDDDDdDD',
    '........ddDTdTdTdTdTdTdT',
    '.........ddddddddddddddd',
    '.....vvvVVdddddddddddddd',
    '...vvVVVVVVVDDDDDDDDDDDD',
    '..vVVVVVVVVDDDDGGGDDDDDD',
    '.vVVVVVVVVDDDDGEEGDDDDDD',
    '.vVVVVVVVDDDDDDGGGDDDDDD',
    'vVVVVVVVDDDdDDDDDDDDDDDD',
    'vVVVVVVDDDdvDDDDDDDDDDDD',
    'vVVVVVVDDdvVdDDDDDDDDDDD',
    'vVVVVVVDDdvVdDDDDDDDDDDD',
    'vVVVVVvDDdvVdDGGGGGGGGGG',
    'vVVVVVvDDdvVdddDDDDDDDDD',
    'vVVVVVvHHHvVVdDDDDDDDDDD',
    'vVVVVVvHhHvVVdDDDDDdDDDD',
    'vVVVVVVvvvVVVdDDDDdDdDDD',
    'vVVVVVVVVVVVVdDDDdvdDDDD',
    'vvVVVVVVVVVVvdDDDdvvdDDD',
    '.vvVVVVVVVVvvdDDdvv.vdDD',
    '..vvvvvvvvvvddddvv...vdd',
  ]),
};
const BOSS_PAL = {
  golem: { R: '#a8a4b8', r: '#74708c', q: '#46425c', E: '#ff5a3c', e: '#ffe08a', K: '#1c1430' },
  demon: { D: '#54347c', d: '#2e1c4c', V: '#c82c48', v: '#7a1630', H: '#e8dcc0', h: '#a8987c', G: '#ffd84a', g: '#c88a20', E: '#ff3c3c', e: '#ffe08a', T: '#ffffff' },
};

// 色替えの組（C c x = 体、A = 骨・お腹、m = 口）
export const MOB_TINT = {
  green: { C: '#7ad85a', c: '#3a9a48', x: '#c8f47a', A: '#fff0d0', a: '#d4b890', m: '#1c5a34', B: '#8c5a34', W: '#ffffff', K: INK, E: '#ff5a3c', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#8c5a34', g: '#5c3820' },
  orange: { C: '#ffa040', c: '#d0602a', x: '#ffd87a', A: '#fff0d0', a: '#c8a878', m: '#7a2c1c', B: '#8c5a34', W: '#ffffff', K: INK, E: '#ff3c3c', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#8c5a34', g: '#5c3820' },
  blue: { C: '#7ac4ff', c: '#3a78d8', x: '#d4f0ff', A: '#f0f8ff', a: '#a8c0d8', m: '#1c3a7a', B: '#4a5c8c', W: '#ffffff', K: INK, E: '#5af0ff', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#4a5c8c', g: '#2c3a5c' },
  purple: { C: '#c084ff', c: '#7a48c8', x: '#ecd4ff', A: '#fff0f8', a: '#c8a8c8', m: '#3c1c6c', B: '#6c4a8c', W: '#ffffff', K: INK, E: '#ff5ae0', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#6c4a8c', g: '#3c2c5c' },
  red: { C: '#ff5a48', c: '#b82c3c', x: '#ffa878', A: '#ffd84a', a: '#c88a20', m: '#5c1420', B: '#5c3030', W: '#ffffff', K: INK, E: '#ffe05a', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#5c3820', g: '#3a2414' },
  ice: { C: '#d8f4ff', c: '#8cc4e4', x: '#ffffff', A: '#ffffff', a: '#b4d0e4', m: '#3a6c9c', B: '#6c8cac', W: '#ffffff', K: INK, E: '#3ac8ff', n: '#a0a8c0', M: '#e8ecf8', T: '#ffffff', H: '#e8dcc0', h: '#a8987c', G: '#6c8cac', g: '#3a5c7c' },
};

const toBuf = (grid, pal) => {
  const w = Math.max(...grid.map((r) => r.length));
  const buf = blank(w + 2, grid.length + 2);
  stamp(buf, grid, 1, 1, pal);
  return outline(buf);
};
/** 描き下ろしの敵: 足の裏の行が下から2行目になるように切る（盤面は img.height - 2 を足もとに合わせる） */
function footed(buf, ay) {
  const out = buf.slice(0, ay + 1);
  out.push(new Array(buf[0].length).fill(null));
  return out;
}
const mobArt = (kind, strong) => (strong && Object.hasOwn(ART_STRONG, kind) ? ART_STRONG[kind] : null) ?? (Object.hasOwn(ART_MOBS, kind) ? ART_MOBS[kind] : null);
/** f = 0〜3 は歩き（待機）の輪、'hit' はのけぞり。strong は強いテストの絵 */
export function mob(kind, tint, f, strong = false) {
  const art = mobArt(kind, strong);
  if (art) {
    let name = f === 'hit' && art.frames.hit ? 'hit' : `move${(Number(f) || 0) % 4}`;
    if (!art.frames[name] && name !== 'hit') name = (Number(f) || 0) % 2 ? 'idle1' : 'idle0';
    return footed(paint(art, art.frames[name] ? name : Object.keys(art.frames)[0], 'gray', art.tints?.[tint] ?? null), art.ay ?? art.h - 1);
  }
  const g = MOB_GRIDS[kind] ?? MOB_GRIDS.slime;
  return toBuf(g.frames[(Number(f) || 0) % g.frames.length] ?? g.frames[0], MOB_TINT[tint] ?? MOB_TINT.green);
}
export const flies = (kind) => (Object.hasOwn(ART_MOBS, kind) ? !!ART_MOBS[kind].fly : !!MOB_GRIDS[kind]?.fly);
/** 描き下ろしの敵か（コマ数・のけぞりの絵を決める） */
export const mobHasArt = (kind) => Object.hasOwn(ART_MOBS, kind);
export function boss(kind, frame = 'idle0') {
  const art = Object.hasOwn(ART_BOSSES, kind) ? ART_BOSSES[kind] : null;
  if (art) return paint(art, art.frames[frame] ? frame : Object.keys(art.frames)[0]);
  return toBuf(BOSS_GRIDS[kind], BOSS_PAL[kind]);
}

/** 組み立てた絵をキャンバスに（ブラウザ用） */
export function toCanvas(buf) {
  const c = document.createElement('canvas');
  c.width = buf[0].length;
  c.height = buf.length;
  const x = c.getContext('2d');
  buf.forEach((row, j) => row.forEach((col, i) => {
    if (!col) return;
    x.fillStyle = col;
    x.fillRect(i, j, 1, 1);
  }));
  return c;
}
