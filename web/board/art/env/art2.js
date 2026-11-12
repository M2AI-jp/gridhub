// 見本 v4 の絵（手で描いた格子）。監査の指摘: 暗く深く、地面に草の島、物を重ねる、判子を使い回さない。光は左上。
export const PAL = {
  // 空（灰青）
  a: '#6481a6', b: '#7090b4', c: '#7e9cbe', d: '#8eaac8', e: '#a2bad4',
  // 雲
  W: '#e8eef4', V: '#c6d2e1', U: '#a0b2c9', T: '#8aa0bc',
  // 雪山
  S: '#e6ecf4', Q: '#b4c2d8', O: '#c2cde0', N: '#8b9cbc', M: '#6e80a2',
  // 針葉樹
  0: '#101c18', 1: '#1a2b25', 2: '#23382e', 3: '#2e4939', 4: '#43634b', 5: '#5a7c5c',
  // 広葉樹（f は穴。ほぼ黒）
  f: '#0a1407', g: '#15280c', h: '#213e15', i: '#2f571e', j: '#43792a', k: '#5e9937', l: '#81b54b',
  // 幹（左が明るい）
  m: '#22180f', n: '#3a2a1a', o: '#56402a', p: '#735a3a',
  // 地面
  A: '#272414', B: '#36321e', C: '#433f29', D: '#4e4930', E: '#5a5439', F: '#686145', G: '#787053',
  // 草（暗い根元 → 明るい先）
  q: '#16220f', r: '#203216', s: '#2d461d', t: '#3d5a28', u: '#4f6c33', v: '#66843f',
  // 屋根（暗い赤茶、溝はほぼ黒）
  6: '#1c0a06', 7: '#3a160c', 8: '#562312', 9: '#70321a', '!': '#8a4624',
  // 石の壁
  H: '#322e28', I: '#48433a', J: '#615a4a', K: '#7a725e', L: '#948b73', P: '#aca389',
  // 木材
  w: '#1e140c', x: '#3a2816', y: '#563c22', z: '#725232',
  // 鎧戸・窓
  R: '#15271a', X: '#233f2a', Y: '#35573a', Z: '#0d0f17',
  // 落ち影
  '#': '#1f1d0e', '%': '#2b2817',
};

// 雪山（48 幅を2種、交互に）。左の面が雪の光、右の面が青い陰
export const RANGE_A = [
  '..........S.....................................',
  '.........SSQ....................................',
  '........SSSQQ...................S...............',
  '.......OSSQQN..................SSQ..............',
  '......OOSOQNN.................SSSQQ.............',
  '.....OOSOOQNNN...............OSSQQN.............',
  '....OOOSOONQNNN.............OOSOQNNN............',
  '...OOOOOSONNQNNN...........OOOSOOQNNN...........',
  '..OOOOOOOONNNNNNNN.......OOOOOOSONNNNNNN........',
  '.OOOOOOOOONNNNNNNNNN...OOOOOOOOONNNNNNNNNNN.....',
  'OOOOOOOOOONNNNNNNNNNNOOOOOOOOOOOONNNNNNNNNNNNNOO',
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
];
export const RANGE_B = [
  '................................................',
  '....................S...........................',
  '...................SSQ..........................',
  '..................SSSQQ................S........',
  '.................OSSQQN...............SSQ.......',
  '................OOSOQNNN.............SSSQQ......',
  '...............OOOSOQNNN............OSSQQN......',
  '..............OOOOSONQNNN..........OOSOQNNN.....',
  '....OO.......OOOOOOONNNNNN........OOOSOONNNN....',
  '..OOOONN....OOOOOOOOONNNNNNN....OOOOOOONNNNNNN..',
  'OOOOOOONNNNOOOOOOOOOOOONNNNNNNNOOOOOOOOOONNNNNNN',
  'MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM',
];

// 雲（左上が光）
export const CLOUDS = [
  ['......WWW...........', '...WWWWWWVV..WW.....', '.WWWWWVVVVVVWWWVV...', 'WVVVVVVUUUVVVVVUUUU.', '.UUUUUUUUUUUUUUUUTT.', '...TTTTT...TTTT.....'],
  ['...WWW......', '.WWWWVV.WW..', 'WWVVVVVVVVV.', 'VVVUUUVVUUUU', '.UUUTTUUUTT.'],
  ['..WWW.......WW..', '.WWWVVW...WWWV..', 'WWVVVVVVWWVVVVV.', 'VVUUUUVVVVUUUUUU', '.TTTUUUTTTUUTTT.'],
];

// 針葉樹（段ごとに左上の明るい筆跡、右下は暗い。先は少し曲がる）。3 種
export const PINE_A = [
  '.....4......',
  '....424.....',
  '....5321....',
  '...44321....',
  '....3221....',
  '...554321...',
  '..44333211..',
  '...33221....',
  '..5544321...',
  '.44433322111',
  '..33222110..',
  '.554433221..',
  '444333222110',
  '.22211100000',
];
export const PINE_B = [
  '.......4........',
  '......53........',
  '......4321......',
  '.....54431......',
  '......3221......',
  '.....55432......',
  '....4443321.....',
  '.....33211......',
  '....5554322.....',
  '...444333221....',
  '....3332211.....',
  '...55444332211..',
  '..444433332221..',
  '...33322211110..',
  '..5544443332211.',
  '.44443333222111.',
  '..2222111100000.',
];
export const PINE_C = [
  '...4....',
  '..52....',
  '..4321..',
  '.54321..',
  '..3221..',
  '.554321.',
  '44333211',
  '.2211000',
];

// 広葉樹の葉（横長。上の行が光、下の行が暗い）と穴
export const LEAVES = {
  hi: ['kllk.', 'jkkkj'],
  mid: ['jkkj.', 'ijjji'],
  lo: ['ijji.', 'hiiih'],
  deep: ['hiih.', 'ghhhg'],
  hole: ['ff', 'f.'],
};
// 幹（左が明るい）
export const TRUNK = [
  '...mpon....',
  '...mpon....',
  '..mppoon...',
  '..mppoon...',
  '..mppoonm..',
  '.mmppoonnm.',
  'mmppoo.onnm',
];

// 草の房（葉が上へ立つ）
export const TUFT = {
  far: [['.u.', 'tst'], ['u..u', 'tsts'], ['tu.', 'ssr']],
  mid: [['..v..', '.uvu.', 'tutut', 'rsrsr'], ['v...v', 'uv.uv', 'ttutt', 'rrsrr'], ['.v.', 'uuv', 'stt', 'rrr']],
  near: [
    ['....v...', '.v.u..v.', '.uvuv.uv', 'tuutuutu', 'sttsttst', 'rrsrrrrr'],
    ['..v...v.', '.uv.uvv.', 'tuutuuuu', 'sttsttts', 'qrrrrrrq'],
    ['.v..', 'uv.v', 'tuuu', 'sttt', 'rrrr'],
  ],
};
// 土のむら・轍・道
export const DIRT = {
  dark: [['CCCC..', '.CCCCC'], ['CCC'], ['.CCCCCC', 'CCCCC..']],
  light: [['EEEEE.', '..EEEE'], ['EEE'], ['.EEEEEEE', 'EEEEE...']],
  rut: [['BBBBBBBB'], ['BBBBB.', '.BBBBB'], ['BBBBBBBBBBBB'], ['ABBBA']],
  path: [['FFFFFFF', '.FFFFF.'], ['GGG'], ['FFFF', '.FFF'], ['.GGGG.', 'FFFFFF']],
};

// ---- 手前の大きな家（領域の文字 → 手で描いた質感で埋める）
// 瓦（4×3。帯ごとに2ずらす）。溝はほぼ黒
export const ROOF_TILE = ['8998', '7887', '6776'];
// 石の壁（光の面 / 陰の面）
export const STONE = ['LLLKHLLK', 'KKKJHKKJ', 'HHHHHHHH', 'LKHLLLLK', 'KJHKKKKJ', 'HHHHHHHH'];
export const STONE_SHADE = ['JJJIHJJI', 'IIIHHIIH', 'HHHHHHHH', 'JIHJJJJI', 'IHHIIIIH', 'HHHHHHHH'];
// 鎧戸つきの窓（10×10）
export const WINDOW = [
  'HHHHHHHHHH',
  'YXYZZZZYXY',
  'XRXZJZZXRX',
  'YXYZZZZYXY',
  'XRXZZZZXRX',
  'YXYZZZZYXY',
  'XRXZZZZXRX',
  'YXYZZZZYXY',
  'HHHHHHHHHH',
  'PLLLLLLLLK',
];
export const WINDOW_SMALL = ['HHHHHH', 'HZZZZH', 'HZJZZH', 'HZZZZH', 'HHHHHH', 'KKKKKJ'];
// 板の扉（10×16、上は丸い）
export const DOOR = [
  '...wwww...',
  '.wwzyxww..',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wHHHHHHHHw',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wzyxzy!zyw',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wHHHHHHHHw',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wzyxzyxzyw',
  'wwwwwwwwww',
];
export const CHIMNEY = ['HHHHHHHH', 'LLKHLLKH', 'KJHKKJHH', 'HHHHHHHH', 'LKHLLKJH', 'KJHKJJIH', 'HHHHHHHH', 'LLKHLLKH', 'KJHKKJHH'];

// 柵（杭は太く、3 段の陰影、高さ不揃い、根元に影）
export const POST = [
  ['.zy.', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyxw'],
  ['zyy.', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyxw'],
  ['.zyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyyx', 'zyxw'],
];
export const RAIL = ['zzyyzzyyzzyyzzyy', 'xxxxwxxxxxwxxxxx'];

// 井戸（石の筒と屋根）
export const WELL = [
  '...wxxxxxxxxw...',
  '..wyzzzzzzzzyw..',
  '.wxxxxxxxxxxxxw.',
  '...z........x...',
  '...z...ww...x...',
  '...z...yx...x...',
  '.LLKHLLKHLLKHL..',
  'LLKKHKKJHKKJHKI.',
  'KJHHHHHHHHHHHHH.',
  'LKHLLKHLLKHLLKHI',
  'KJHKKJHKKJHKKJHH',
  'HHHHHHHHHHHHHHHH',
];

// 手前の大きな家の領域（R 屋根 / E 屋根の光る縁 / B 破風の暗い縁 / b 横の屋根 / e 軒下の影 / P 正面の壁 / G 横の壁（陰）/ S 土台 / C 煙突 / W・D・w 窓と扉の左上）
export const HOUSE_MASK = [
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '......................CCCCCCCC......................................................................',
  '..........ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB.......................',
  '.........ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB......................',
  '.........ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB......................',
  '........ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB.....................',
  '........ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB.....................',
  '.......ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB....................',
  '.......ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB....................',
  '......ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB...................',
  '......ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB...................',
  '.....ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB..................',
  '.....ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB..................',
  '....ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB.................',
  '....ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB.................',
  '...ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBB................',
  '...ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbbbbb.',
  '..ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbbbb.',
  '..ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbbbb.',
  '.ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbbb.',
  '.ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbbb.',
  'ERRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRBBbbbbbbbbbbbb.',
  '.eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.',
  '.eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPWPPPPPPPPPPPPPPPPPPPPPWPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPWPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGwGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPDPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '..PPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPGGGGGGGGGGGG.',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
  '.SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS.',
];

// 不揃いな石積み（16×12。段の高さと継ぎ目をずらす。左上が光）
export const STONE_IRR = [
  'PLLLKHLLLLLKHPLK',
  'LKKKJHKKKKKJHLKJ',
  'KJJJIHJJJJJIHKJI',
  'HHHHHHHHHHHHHHHH',
  'LLKHPLLLLKHLLLLK',
  'KKJHLKKKKJHKKKKJ',
  'HHHHHHHHHHHHHHHH',
  'LLLLKHLLKHPLLLLK',
  'KKKKJHKKJHLKKKKJ',
  'JJJJIHJJIHKJJJJI',
  'HHHHHHHHHHHHHHHH',
  'KHPLLLLKHLLKHPLL',
];
export const STONE_IRR_SHADE = STONE_IRR.map((r) => r.replace(/[PLKJIH]/g, (c) => ({ P: 'K', L: 'J', K: 'I', J: 'I', I: 'H', H: 'H' })[c]));

// 雪山の峰（高さの違う 4 種を重ねて 1 本の稜線にする。根元の線は無い）
export const PEAKS = [
  [
    '..........S.............',
    '.........SSQ............',
    '........SSSQQ...........',
    '.......SSOSQQ...........',
    '......OSSOQQNN..........',
    '.....OOSOSQQNNN.........',
    '....OOSOOOQNQNNN........',
    '...OOOOSOONQNNNNN.......',
    '..OOOOOOONNNQNNNNNN.....',
    '.OOOOOOOONNNNNNNNNNNN...',
    'OOOOOOOOONNNNNNNNNNNNNN.',
    'OOOOOOOONNNNNNNNNNNNNNNN',
    'OOOOOOONNNNNNNNNNNNNNNNN',
  ],
  [
    '........S.........',
    '.......SSQ........',
    '......OSQQN.......',
    '.....OOSOQNN......',
    '....OOOOQNNNN.....',
    '...OOOOONNNNNN....',
    '..OOOOOONNNNNNNN..',
    '.OOOOOONNNNNNNNNN.',
    'OOOOOONNNNNNNNNNNN',
  ],
  [
    '........S.....................',
    '.......SSQ..........S.........',
    '......SSSQQ........SSQ........',
    '.....OSSOQQN......OSSQQ.......',
    '....OOSOOQNNN....OOSOQQN......',
    '...OOOSOONQNNN..OOOSOQNNN.....',
    '..OOOOOSONNQNNNOOOOSONQNNN....',
    '.OOOOOOOONNNNNNOOOOOONNNNNNN..',
    'OOOOOOOOONNNNNOOOOOOONNNNNNNN.',
    'OOOOOOOONNNNNNOOOOOONNNNNNNNNN',
    'OOOOOOONNNNNNOOOOOONNNNNNNNNNN',
  ],
  [
    '......O.......',
    '.....OON......',
    '....OOONN.....',
    '...OOOONNN....',
    '..OOOOONNNN...',
    '.OOOOONNNNNN..',
    'OOOOONNNNNNNN.',
  ],
];
// 鎧戸（横の板が 2 行おきに光る）と、ガラスの光は左上に 1 ドット
export const WINDOW2 = [
  'HHHHHHHHHH',
  'YYYZZZZYYY',
  'XXXZJZZXXX',
  'RRRZZZZRRR',
  'YYYZZZZYYY',
  'XXXZZZZXXX',
  'RRRZZZZRRR',
  'YYYZZZZYYY',
  'HHHHHHHHHH',
  'PLLLLLLLLK',
];
// 大きなもこもこ雲（山の上に低く。左上が光、下は平らにしない）
export const CLOUD_BIG = [
  '...........WWW................',
  '........WWWWWWVV....WWW.......',
  '......WWWWWWWVVVV.WWWWWVV.....',
  '...WWWWWWVVVVVVVVWWWVVVVVV....',
  '..WWWWWVVVVVVUUVVVVVVVUUUVV...',
  '.WWVVVVVVUUUUUUUVVVUUUUUUUUV..',
  'VVVVVUUUUUUUTTUUUUUUUTTUUUUUU.',
  '.UUUUUUTTTT..TTTUUUTT..TTTUU..',
  '...TTTTT.......TTTT.....TT....',
];
// 横に流れる不揃いな草のかたまり（地面の房の 1/3 をこれに）
export const TUFT_FLOW = [
  ['..u.t...', 'tsutsst.', 'rrsrrsrr'],
  ['.t..u.t..', 'stsuttsts', 'rrrsrrrsr'],
  ['u..t..', 'tstuts', 'rsrrrr'],
];
