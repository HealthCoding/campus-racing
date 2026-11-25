// 생성물 — 손으로 고치지 않는다. 만든 도구: node 도구/build-campus-moves.mjs (코스 B)
// 길 폭 14 m(2026-11-24)로 새로 통로에 먹힌 캠퍼스 물건을 새 길가로 옮기는 표 — x · z 에 서 있던 것을 toX · toZ 로(미터). 옮기지 못한 것은 kept(숨긴다 · 까닭 why).
// 세는 것: tree 옮김 0 · 숨김 2 / shrub 옮김 3 · 숨김 0 / furniture:bench 옮김 1 · 숨김 0. 지도 자료 © OpenStreetMap contributors (ODbL).
export default {"version":1,"course":"B","moves":[{"kind":"shrub","x":157.752,"z":-315.071,"s":402,"push":1.197,"toX":158.848,"toZ":-314.592},
{"kind":"shrub","x":-84.637,"z":-48.25,"s":1326,"push":1.239,"toX":-85.837,"toZ":-48.56},
{"kind":"shrub","x":-82.992,"z":-54.41,"s":1319,"push":1.318,"toX":-84.271,"toZ":-54.727},
{"kind":"furniture","item":"bench","x":-75.814,"z":34.824,"s":1412,"push":0.878,"toX":-75.277,"toZ":35.519}],"kept":[{"kind":"tree","x":-11.883,"z":-465.423,"s":830,"push":-1.532,"why":"road"},
{"kind":"tree","x":-18.086,"z":-444.239,"s":852,"push":-1.79,"why":"road"}]};
