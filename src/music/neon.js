// 배경음악 '네온 질주' — 2026-11-24 사용자가 고른 곡(2차 후보 E). 새로 쓴 곡 — 기존 게임 · 곡의 가락 · 후렴 · 화음 진행 · 편곡 · 음색을 따오지 않았다. 연주: src/music.js
// G 장조 · 174 BPM · 도입 4 + 벌스 8 + 빌드 4 + 후렴 8 + 벌스′(종이 맞받음) 8 + 빌드 4 + 후렴 8 + 쉬어 가기 4 + 후렴″ 8 = 56마디(끝나면 벌스로 — 후렴 끝 D → G).
// 후크(후렴 첫 마디): 높은 미-레-미를 빠르게 찍고 솔로 뚝 떨어졌다가 '도-시-도'로 되감아 오른다(2 2 2 3 3 2 2 칸). 같은 꼴을 한 단씩 내려 세 마디 잇달아(시퀀스), 후렴마다 다섯 번.
// 소리: 조금씩 어긋난 톱니 셋의 두꺼운 리드(오른쪽을 13ms 늦춰 넓게, 붙은 음은 미끄러져 들어감, 떨림은 긴 음에만) · 엇박 옥타브 베이스(거르개가 세게 열렸다 닫힘) · 16분 아르페지오 · 끊어 치는 화음 · 킥마다 숨는 베이스와 화음.
// 자료의 꼴(마디 · 가락 줄 · 무늬 글자)은 src/music.js 의 parseLine · parseHits · compileSections 머리말.
const HOOK = [
  'E6/2! D6/2 E6/2 G5/3 C6/3 B5/2 C6/2', 'D6/2! C6/2 D6/2 F#5/3 A5/3 G5/2 A5/2', 'B5/2! A5/2 B5/2 D5/3 G5/3 F#5/2 G5/2', 'G5/2 A5/2 B5/2 E6/6 D6/4',
  'E6/2! D6/2 E6/2 G5/3 C6/3 B5/2 C6/2', 'D6/2! C6/2 D6/2 F#5/3 A5/3 G5/2 A5/2', 'B5/2! A5/2 B5/2 D6/3 E6/3 D6/2 B5/2', 'A5/4 F#5/4 D6/8',
];
const VERSE = [
  'D5/2 G5/2 r/1 G5/1 A5/2 B5/3 A5/3 G5/2', 'E5/2 G5/2 B5/4 r/4 A5/2 G5/2', 'E5/2 G5/2 r/1 G5/1 A5/2 C6/3 B5/3 A5/2', 'F#5/4 A5/4 D6/4 C6/2 A5/2',
  'D5/2 G5/2 r/1 G5/1 A5/2 B5/3 A5/3 G5/2', 'E5/2 G5/2 B5/4 r/2 D6/2 B5/2 G5/2', 'C6/3 B5/3 A5/2 G5/4 E5/4', 'F#5/2 G5/2 A5/4 r/8',
];
const chorus = (name, more = {}) => ({ name, bars: 8, chords: 'C D G Em | C D G D', crash: [0, 4], lead: HOOK, bass: 'off', chord: 'chorus', arp: 'a16', drums: { main: 'chorus', fill4: 'cfill', fill8: 'roll' }, ...more });
const verse = (name, more = {}) => ({ name, bars: 8, chords: 'G Em C D | G Em C D', crash: [0], lead: VERSE, bass: 'off', chord: 'verse', arp: null, drums: { main: 'verse', fill4: 'vfill', fill8: 'roll' }, ...more });
const build = name => ({ name, bars: 4, chords: 'Am Bm C D', lead: 'E5/8 A5/8 | F#5/8 B5/8 | G5/8 C6/8 | A5/4 D6/4! r/8', bass: ['eighths', 'eighths', 'eighths', 'stop'], chord: ['hold', 'hold', 'push8', 'stop'], arp: ['a16', 'a16', 'a16', 'a8stop'], drums: ['build1', 'build2', 'build3', 'stop'] });
export default {
  id: 'neon', name: '네온 질주', key: 'G', mode: 'major', bpm: 174, swing: 0, loopFrom: 'verse', hook: { section: 'chorus', bar: 0 },
  sound: {
    lead: 'supersaw', bass: 'euro', chord: 'stab1', arp: 'pluck', drums: 'euro', counter: 'bell', glide: true, wide: true, leadLp: 8000, pump: 0.4, arpLp: 4200,
    bassLow: 36, chordLow: 59, powerLow: 40, reverb: 0.24, room: 0.9, gain: 1, delay: { beats: 0.75, fb: 0.3, level: 0.45 }, leadDelay: 0.14, leadRev: 0.2, vibrato: 14,
    mix: { kick: 0.95, snare: 0.5, clap: 0.5, hat: 0.3, crash: 0.16, tom: 0.5, bass: 0.34, lead: 0.24, chord: 0.15, brass: 0.12, bell: 0.14, pad: 0.1, arp: 0.2 },
  },
  sections: [
    { name: 'intro', bars: 4, chords: 'C D Em D', lead: 'r/16 | r/16 | r/16 | r/8 D5/2 E5/2 F#5/2 A5/2', bass: [null, null, 'off', 'off'], chord: [null, null, 'verse', 'push8'], arp: 'a16', drums: ['introK', 'introK', 'introKH', 'roll'] },
    verse('verse'),
    build('build'),
    chorus('chorus'),
    verse("verse'", { arp: 'a8', counter: 'r/16 | r/8 B6/2 G6/2 E6/4 | r/16 | r/16 | r/16 | r/16 | r/16 | r/8 A6/2 F#6/2 D6/4' }),
    build("build'"),
    chorus("chorus'"),
    { name: 'break', bars: 4, chords: 'Em C G D', lead: 'B5/4 r/12 | G5/4 r/12 | D6/4 r/12 | A5/4 D6/4 A5/4 F#5/4',
      counter: 'r/4 E6/2 G6/2 B6/8 | r/4 C6/2 E6/2 G6/8 | r/4 B5/2 D6/2 G6/8 | r/16', bass: ['whole', 'whole', 'eighths', 'stop'], chord: ['pad', 'pad', 'push8', 'stop'], chordFlavor: 'pad', arp: ['a8', 'a8', 'a16', 'a8stop'], drums: ['half', 'half', 'build3', 'stop'] },
    chorus("chorus''", { crash: [0, 2, 4, 6], double: -12, drums: { main: 'chorus2', fill4: 'cfill', fill8: 'roll' } }),
  ],
  patterns: {
    bass: {
      off: 'r/2 R/2 r/2 8/2 r/2 R/2 r/2 8/2',
      eighths: 'R/2 R/2 R/2 R/2 R/2 R/2 R/2 R/2',
      stop: 'R/2 R/2 R/2 R/2 r/8',
      whole: 'R/12 5/4',
      root: 'R/6 5/2 R/4 8/4',
      end: 'R/16',
    },
    chord: {
      verse: 'x--x--x---------',
      chorus: 'x-.x-.x-....x-..',
      hold: 'x-------x-------',
      push8: 'x-x-x-x-x-x-x-x-',
      stop: 'X-X-X-X-........',
      pad: 'x---------------',
      padHold: 'x-------x-------',
      ring: 'X---------------',
    },
    arp: {
      a16: { hits: 'xxxxxxxxxxxxxxxx', low: 67, span: 19, order: 'updown' },
      a8: { hits: 'x.x.x.x.x.x.x.x.', low: 67, span: 19, order: 'up' },
      a8stop: { hits: 'x.x.x.x.........', low: 67, span: 19, order: 'up' },
    },
    drums: {
      introK: { k: 'x...x...x...x...' },
      introKH: { k: 'x...x...x...x...', oh: '..x...x...x...x.' },
      verse: { k: 'x...x...x...x...', cp: '....x.......x...', oh: '..x...x...x...x.' },
      vfill: { k: 'x...x...x...x...', cp: '....x.......x...', s: '............xoxo', oh: '..x...x...x.....' },
      chorus: { k: 'x...x...x...x...', s: '....x.......x...', cp: '....x.......x...', h: 'o...o...o...o...', oh: '..x...x...x...x.' },
      chorus2: { k: 'x...x...x...x...', s: '....x.......x...', cp: '....x.......x...', h: 'o.o.o.o.o.o.o.o.', oh: '..x...x...x...x.', t: '..............1.' },
      cfill: { k: 'x...x...x...x...', s: '....x.......xxxx', oh: '..x...x...x.....' },
      roll: { k: 'x...x...x.......', s: '....x...xoxoxxXX' },
      build1: { k: 'x...x...x...x...', s: '....x.......x...', oh: '..x...x...x...x.' },
      build2: { k: 'x...x...x...x...', s: 'x...x...x.x.x.x.', oh: '..x...x...x...x.' },
      build3: { k: 'x...x...x...x...', s: 'x.x.x.x.xxxxxxxx' },
      stop: { k: 'x.x.x.x.........', s: 'X.X.X.X.........' },
      half: { k: 'x.......x.......', cp: '........x.......', oh: '..x...x...x...x.' },
      lobby: { k: 'x.......x.......', oh: '..x...x...x...x.', cp: '............x...' },
      end: { k: 'x...............' },
    },
  },
  // 시작 화면: 후렴을 130 BPM 으로 — 종이 후크를 부르고, 8분 아르페지오 · 넓게 깔린 화음 · 킥 둘. 4.5 kHz 위만 거른다
  lobby: { from: 'chorus', bpm: 130, lp: 4500, leadFlavor: 'bell', chordFlavor: 'pad', chord: 'padHold', bass: 'root', bassFlavor: 'pop', arp: 'a8', drums: 'lobby', double: 0, vel: { lead: 0.95 } },
  // 마지막 바퀴: 반음 올리고(G → A♭) 3% 빠르게(174 → 179.2), 닫힌 하이햇 16분을 늘 깔고 손뼉을 2 · 4 박에
  final: { bpm: 1.03, transpose: 1, dense: true, add: { h: 'oooooooooooooooo', cp: '....x.......x...' } },
  outro: [
    { name: 'outro', bars: 3, chords: 'C D G', crash: [2],
      lead: 'E6/2! D6/2 E6/2 G5/3 C6/3 B5/2 C6/2 | D6/2 C6/2 D6/2 F#5/3 A5/3 G5/2 A5/2 | G5/16!',
      bass: ['off', 'off', 'end'], chord: ['chorus', 'push8', 'ring'], arp: ['a16', 'a16', null], drums: ['chorus', 'roll', 'end'] },
  ],
};
