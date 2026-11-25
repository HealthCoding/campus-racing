// 길이·반지름은 모델 로컬 미터, 박자는 초당 맥동 수. 카메라나 주행 상태를 참조하지 않는다.
export const BOOST_IGNITION_TIME = .064;   // 세단 섬광·디젤 매연이 먼저 보이는 시간(초)

function style(id, family, shape, length, radius, hz, rim, tip, core) {
  return { id, family, shape, length, radius, hz, rim, tip, core };
}

const styles = [
  style('racekart',          'gasoline', 'backfire', 1.00, .21, 5.1, '#ff981e', '#f45116', '#ffefaf'),
  style('formula_real',      'gasoline', 'diamonds', 2.90, .16, 8.5, '#73ceff', '#3b73f4', '#f2fcff'),
  style('sedan',             'gasoline', 'oval',     2.06, .23, 3.7, '#ffa142', '#f8541a', '#fff1b8'),
  style('gt',                'gasoline', 'v8',       3.10, .30, 3.4, '#ffac42', '#e63c1c', '#fff0b6'),
  style('supercar_real',     'gasoline', 'blue',     2.84, .18, 6.5, '#3fafff', '#a451ff', '#d3eeff'),
  style('truck_real',        'diesel',   'diesel',   1.25, .28, 3.1, '#ff902b', '#b2441e', '#ffdd8d'),
  style('garbagetruck_real', 'diesel',   'hopper',   1.87, .36, 2.2, '#e58936', '#b64a22', '#ffd28b'),
  style('golfcart_real',     'electric', 'arc',      1.30, .11, 4.8, '#34bfff', '#3671ec', '#d0faff'),
  style('forklift_real',     'electric', 'scrape',   2.14, .16, 3.9, '#ffd33d', '#fd9919', '#fff3a6'),
  style('shoppingcart_real', 'cart',     'casters',   .50, .025, 5.2, '#ffd8a1', '#f48743', '#fffbea'),
  style('minibus_real',      'diesel',   'diesel',   1.29, .31, 2.7, '#f88f30', '#ab4726', '#ffe29b'),   // 7.1 m 마을버스 — 트럭보다 굵고 느리게
  style('taxi_real',         'gasoline', 'oval',     1.64, .19, 4.1, '#ffaa40', '#ef581a', '#fff3b5'),
  style('eagle_statue',      'gasoline', 'pipe',     1.52, .19, 2.8, '#e6a657', '#b34f2e', '#ffe6ba'),
  // 타 보기용 두 바퀴(?try=bike). 자전거는 엔진이 없어 불꽃 없는 갈래 — 뒷바퀴가 노면을 긁는 따뜻한 흰 불티(지게차의 긁힘 모양을 빌린다).
  //   스쿠터는 작은 가솔린 — 레이싱 카트처럼 가운데 단관에서 톡톡 끊기는 주황(머플러는 오른쪽이어도 불꽃은 가운데 · 뒤).
  style('bicycle_real',      'electric', 'scrape',    .95, .10, 4.6, '#fff0c8', '#ffb04a', '#fffbee'),
  // 레이싱 오토바이(타 보기): 꼬리 밑 가운데 관 둘(좌우 짝 ±2.8 cm)에서 곧장 뒤로 — 스쿠터의 톡톡보다 길고 곧은 푸른 속심의 불꽃(세단의 'oval' 모양).
  style('racebike_real',     'gasoline', 'oval',     1.62, .085, 7.4, '#ffb347', '#ff5a1f', '#e9f4ff'),
];

const byId = new Map(styles.map(s => [s.id, s]));
const legacy = style('', 'legacy', 'twin', 1.7, .165, 0, '#ff9b36', '#ff501b', '#ffefb3');
export function getBoostLook() {
  const value = new URLSearchParams(globalThis.location?.search).get('boostLook');
  return value === 'now' || value === 'a' || value === 'c' ? value : 'b';
}

export function boostStyleOf(id, look) {
  return look === 'now' ? legacy : byId.get(id) ?? legacy;
}

// manifest의 두 배기 마디가 단관 하나의 양 끝인 차, 뒤 조향인 지게차까지 실제 출원점을 정한다.
// 3차(2026-11-24): 모든 출원점은 차체 폭 안(|x| ≤ 폭/2 − 0.05 m), 차의 뒤쪽이다 — 뒤에서 봤을 때 옆 구간에서 나오지 않게.
export const BOOST_SIDE_MARGIN = .05;
export function boostOrigins(def, spec) {
  const ex = def.exhausts?.length ? def.exhausts : [[.2, .25, -.95], [-.2, .25, -.95]];
  // 4차(2026-11-24): 뒤에서 봤을 때 좌우 대칭 — 출원점은 가운데 하나이거나 좌우 짝이다.
  // 레이싱 카트의 실제 배기는 오른쪽에 붙어 있지만, 부스터는 뒤 범퍼 밑 가운데 단관 하나에서 곧장 뒤로 낸다.
  if (spec.shape === 'backfire') {
    const length = def.size?.length || 1.82, y = ex.reduce((sum, e) => sum + e[1], 0) / ex.length;
    return [[0, y - .02, -length / 2 + .01]];
  }
  if (spec.shape === 'v8') {
    // GT 의 manifest 배기 마디는 문 아래 옆구리다. 뒤 범퍼 밑 두 관에서 곧장 뒤로 낸다.
    const width = def.size?.width || 2, length = def.size?.length || 4.6;
    return [1, -1].map(s => [s * width * .225, ex[0][1] + .03, -length / 2 + .03]);
  }
  if (spec.shape === 'pipe') return [[0, ex[0][1], ex[0][2]]];   // 단관 하나는 가운데
  if (spec.family === 'electric' || spec.family === 'cart') {
    const w = def.wheels;
    if (w?.FL && w?.RL) {
      const rear = w.FL[2] < w.RL[2] ? [w.FL, w.FR] : [w.RL, w.RR];
      // 뒷바퀴(지게차는 뒤 조향 바퀴) 바로 뒤, 바퀴와 같은 x — 바퀴 바깥으로 내밀지 않는다.
      const inside = (def.size?.width || 2) / 2 - BOOST_SIDE_MARGIN;
      return rear.map(([x, y, z]) => {
        const at = Math.sign(x) * Math.min(Math.abs(x), inside);
        if (spec.shape === 'scrape') return [at, y * .63, z - y * .78];
        return [at, spec.shape === 'arc' ? y : .055, z - y * (spec.shape === 'arc' ? 1.05 : .42)];
      });
    }
  }
  return ex;
}
