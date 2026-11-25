// 생성물 — 손으로 고치지 않는다. 만든 도구: node 도구/build-campus-moves.mjs (코스 D)
// 길 폭 14 m(2026-11-24)로 새로 통로에 먹힌 캠퍼스 물건을 새 길가로 옮기는 표 — x · z 에 서 있던 것을 toX · toZ 로(미터). 옮기지 못한 것은 kept(숨긴다 · 까닭 why).
// 세는 것: tree 옮김 1 · 숨김 0 / shrub 옮김 3 · 숨김 1 / furniture:light 옮김 1 · 숨김 0. 지도 자료 © OpenStreetMap contributors (ODbL).
export default {"version":1,"course":"D","moves":[{"kind":"tree","x":-243.814,"z":-122.581,"s":1770,"push":1.539,"toX":-244.079,"toZ":-124.097},
{"kind":"shrub","x":-182.5,"z":-115.57,"s":1711,"push":1.325,"toX":-181.84,"toZ":-116.718},
{"kind":"shrub","x":-143.093,"z":-90.603,"s":1666,"push":0.92,"toX":-143,"toZ":-89.688},
{"kind":"shrub","x":-314.408,"z":318.989,"s":2316,"push":1.014,"toX":-314.397,"toZ":317.975},
{"kind":"furniture","item":"light","x":-83.037,"z":-6.283,"s":831,"push":1.506,"toX":-81.922,"toZ":-5.27}],"kept":[{"kind":"shrub","x":169.342,"z":-80.799,"s":1275,"push":-2.694,"why":"road"}]};
