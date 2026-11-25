import { createNightLamps } from './lamps.js';
import { createNightMaterials } from './night-materials.js';
import { NIGHT } from './night-tune.js';

// r170의 SpotLight.map은 그림자를 끈 상태에서도 광원의 투영 행렬을 갱신한다.
// 수평 가장자리는 스폿의 penumbra, 수직 배광은 평지에서 광선이 닿는 거리로 정한다.
// tune: 전조등 값(night-tune.js 의 beam). 안 주면 지금 값.
//   high 가 0 이면 하향등(near ~ far 사이의 노면만), 0 보다 크면 수평 위(lift rad 까지)로도 비춘다 — 멀리 선 방호벽 · 앞차 · 표지판이 보인다(상향등).
export function createPlayerHeadlights(THREE, tune = NIGHT.beam) {
  const height = .38, aim = 14, angle = tune.angle;
  const pitch = Math.atan(height / aim);
  const rows = 512, samples = new Uint8Array(rows * 4);
  for (let i = 0; i < rows; i++) {
    const up = Math.atan((2 * (i + .5) / rows - 1) * Math.tan(angle));
    const distance = height / Math.tan(pitch - up);
    const near = THREE.MathUtils.smoothstep(distance, tune.near[0], tune.near[1]);
    const far = 1 - THREE.MathUtils.smoothstep(distance, tune.far[0], tune.far[1]);
    let level = near * far;
    if (tune.high > 0) {
      const above = up - pitch;   // 수평 위로 몇 rad(음수 = 노면을 향한다)
      level = above < 0 ? near * Math.max(far, tune.high) : tune.high * (1 - THREE.MathUtils.smoothstep(above, tune.lift, tune.lift * 1.8));
    }
    samples.fill(Math.round(255 * level), i * 4, i * 4 + 3);
    samples[i * 4 + 3] = 255;
  }
  const beam = new THREE.SpotLight(0xffefd9, tune.intensity, tune.distance, angle, tune.penumbra, tune.decay);
  beam.name = 'player-headlights';
  beam.map = new THREE.DataTexture(samples, 1, rows);
  beam.map.name = 'low-beam-profile';
  beam.map.minFilter = beam.map.magFilter = THREE.LinearFilter;
  beam.map.needsUpdate = true;
  const follow = function follow({ headlightMount }) {
    // 바퀴가 놓인 경사만 따른다. 가감속 때 현가장치가 흔들려도 가까운 바닥을 훑지 않는다.
    const z = headlightMount.bumperZ + .08;
    beam.position.set(0, height, z);
    beam.target.position.set(0, 0, z + aim);
    headlightMount.frame.add(beam, beam.target);
    follow.forward = z;   // 차 가운데에서 전조등까지(m) — 노면 위 자국의 자리에 쓴다
  };
  follow.forward = 0;
  return follow;
}

// 캠퍼스·트랙을 세운 뒤 한 번 호출한다. 뒤늦게 들어오는 피트와 차량도 같은 지도를 쓴다.
// landmarks: 상징 건물 밤 조명(landmarks.js 의 createLandmarkLighting 결과, 시안). 없으면 지금 그대로.
// tune: 밤 밝기를 다른 조정값으로 볼 때(night-tune.js 의 nightTune() — 주소 ?night=old). 없으면 지금 값.
export function createNightDrive(THREE, scene, courseWorld, { landmarks = null, tune = null } = {}) {
  const lamps = createNightLamps(THREE, courseWorld, tune ? { poolAlong: tune.road.poolAlong } : undefined);
  scene.add(lamps.group);
  const materials = createNightMaterials(THREE, { lightMap: lamps.map, landmarks, tune });
  materials.apply(scene);
  const follow = createPlayerHeadlights(THREE, tune?.beam);
  // 화면마다: 내 차의 자세(x · y · z · heading)를 주면 노면 위 전조등 자국이 따라간다(조정값에 자국이 없으면 아무 일도 안 한다)
  const aim = pose => materials.aim(pose.x + Math.sin(pose.heading) * follow.forward, pose.y, pose.z + Math.cos(pose.heading) * follow.forward, pose.heading);

  return { lamps, apply: materials.apply, follow, aim };
}
