// 밤 화면의 밝기 조정값 — 밤 조명 · 내 차 전조등 · 노면과 길 테두리의 값을 여기 한 곳에 둔다(쓰는 쪽: stage.js · night-drive.js · night-materials.js · lamps.js).
// 2026-11-23 사용자: "너무 어두워서 앞에 길이 잘 안보여" → 같은 자리 그림으로 후보 셋(A 달밤 · B 상향등과 길 테두리 · C 둘 다 조금씩)을 견줘 C 로 정했다.
//   now = 그 값(기본). old = 그 전의 값 — 주소 ?night=old 로 견줘 볼 때만 쓴다.
// 값의 뜻
//   look  밤 조명: 반구광 · 달빛의 세기, 노출, 안개가 시작하는 거리와 다 덮는 거리(m)
//   beam  내 차 전조등. SpotLight 는 서 있는 것(방호벽 · 앞차 · 표지판)을 비춘다 — 낮게 달린 등은 노면을 스치듯 비춰서 SpotLight 만으로는 노면이 거의 안 밝아진다.
//         그래서 노면에는 '전조등 자국'을 재질 안에서 따로 얹는다(road = 그 세기 · reach = 닿는 거리 m. 0 이면 없다).
//         near = 차 앞 몇 m 부터 밝아지는가[시작, 다 밝음] · far = 어디서 꺼지는가[시작, 끝](high 가 0 일 때만 쓴다)
//         high = 수평 위로도 비추는 정도(0 = 하향등 · 1 = 상향등) · lift = 수평 위 몇 rad 까지(그 1.8배에서 다 꺼진다)
//   road  노면 바탕빛의 배율(fill) · 방호벽 · 연석 · 차선의 바탕빛(edgeFill)과 그 가운데 서 있는 면의 몫(edgeWall),
//         가로등 빛 웅덩이가 길을 따라 퍼지는 폭(poolAlong, m — 가로등은 20 m 마다 선다. 넓힐수록 등과 등 사이가 이어진다)
export const NIGHT_TUNES = {
  now: {
    look: { hemisphere: .18, sunIntensity: .27, exposure: 1.02, fogNear: 70, fogFar: 680 },
    beam: { intensity: 28, distance: 90, angle: .32, penumbra: .7, decay: 1, near: [4, 8], far: [24, 29], high: 1, lift: .05, road: .5, reach: 58 },
    road: { fill: 1.35, edgeFill: .24, edgeWall: .8, poolAlong: 5.2 },
  },
  old: {
    look: { hemisphere: .055, sunIntensity: .075, exposure: .94, fogNear: 55, fogFar: 530 },
    beam: { intensity: 219, distance: 30, angle: .26, penumbra: .78, decay: 2, near: [7, 10], far: [24, 29], high: 0, lift: 0, road: 0, reach: 0 },
    road: { fill: 1, edgeFill: .105, edgeWall: .34, poolAlong: 4.2 },
  },
};
export const NIGHT = NIGHT_TUNES.now;

export function nightTune(id) {
  const key = Object.hasOwn(NIGHT_TUNES, id) ? id : 'now';
  return { id: key, ...NIGHT_TUNES[key] };
}
