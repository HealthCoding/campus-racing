// 상징 건물 밤 조명(?time=night 일 때만). 사용자 2026-11-23 'B 또렷하게' — main.js 의 기본이 b, ?landmark=a 은은하게, ?landmark=0 끔. 연세대임을 알아보게 하는 돌 건물 몇 동을 땅에서 올려 비춘다.
// 건물마다 셰이더를 따로 만들지 않는다: 밤 재질 한 벌(night-materials.js)에 '상징 건물 상자 목록'을 uniform 배열로 더하고,
// 조각마다 그 상자 안의 벽이면 따뜻한 업라이트(바닥이 가장 밝고 위로 갈수록 흐려지는, 등 간격마다의 부드러운 원뿔)를 더한다.
// 상자 = 캠퍼스 obstacles 의 바닥 윤곽(중심 · 폭 · 깊이 · 회전, 미터) + 장면에 세운 건물의 높이. 좌표는 장면과 같은 미터.
export const LANDMARK_IDS = ['underwood', 'appenzeller', 'stimson', 'luce-wing', 'library', 'auditorium'];

// a = 은은하게(바닥 쪽 3~10 m 만, 넓은 원뿔), b = 또렷하게(지붕선 · 탑까지, 좁고 센 원뿔 + 꼭대기 테두리)
const LOOKS = {
  a: { strength: 1.9, reach: 13, top: 0, spacing: 6.5, widen: .48 },
  b: { strength: 2.1, reach: -1, top: .9, spacing: 5.5, widen: .30 },
};

export function createLandmarkLighting(THREE, { scene, campus, mode, ids = LANDMARK_IDS }) {
  const look = LOOKS[mode]; if (!look) return null;
  const boxes = [], sizes = [], found = [];
  const box = new THREE.Box3();
  for (const id of ids) {
    const o = campus.obstacles.find(b => b.id === id), root = scene.getObjectByName(`building-${id}`);
    if (!o || !root) continue;
    box.setFromObject(root);
    boxes.push(new THREE.Vector4(o.x, o.z, Math.cos(o.rotation), Math.sin(o.rotation)));
    sizes.push(new THREE.Vector4(o.w / 2, o.d / 2, box.min.y, box.max.y - box.min.y));
    found.push({ id, name: o.name, height: +(box.max.y - box.min.y).toFixed(1) });
  }
  if (!found.length) return null;
  const n = found.length;
  return {
    found,
    key: `/landmark-${mode}-${n}`,
    uniforms: {
      uLandmarkBox: { value: boxes }, uLandmarkSize: { value: sizes },
      uLandmarkLook: { value: new THREE.Vector4(look.strength, look.reach, look.top, look.spacing) },
      uLandmarkWiden: { value: look.widen },
    },
    head: `
  #define CAMPUS_LANDMARKS
  #define LANDMARK_COUNT ${n}
  uniform vec4 uLandmarkBox[LANDMARK_COUNT];   // 중심 x, z, cos, sin(회전)
  uniform vec4 uLandmarkSize[LANDMARK_COUNT];  // 반폭, 반깊이, 바닥 높이, 건물 높이
  uniform vec4 uLandmarkLook;                  // 세기, 닿는 높이(m, 음수 = 건물 전체), 꼭대기 테두리, 등 간격(m)
  uniform float uLandmarkWiden;                // 높이 1 m 마다 원뿔이 넓어지는 정도
`,
    // LAMP_LIGHT 뒤에 붙는다(그 안의 wn = 월드 법선을 쓴다).
    light: `
  if (uNightSurface == 0 || uNightSurface == 2) {
    float flood = 0.;
    for (int i = 0; i < LANDMARK_COUNT; i++) {
      vec4 B = uLandmarkBox[i], S = uLandmarkSize[i];
      vec2 d = vNightPosition.xz - B.xy;
      vec2 l = vec2(B.z * d.x - B.w * d.y, B.w * d.x + B.z * d.y);
      vec2 outside = abs(l) - S.xy;
      float h = vNightPosition.y - S.z;
      if (max(outside.x, outside.y) > 3. || h < -1.5 || h > S.w + 1.) continue;
      vec2 nl = vec2(B.z * wn.x - B.w * wn.z, B.w * wn.x + B.z * wn.z);
      // 벽을 따라 잰 자리 → 가장 가까운 등까지의 거리. 원뿔은 위로 갈수록 넓어지고 흐려진다.
      float t = abs(nl.x) > abs(nl.y) ? l.y : l.x;
      float gap = abs(fract(t / uLandmarkLook.w + .5) - .5) * uLandmarkLook.w;
      float width = .55 + max(h, 0.) * uLandmarkWiden;
      float cone = mix(.22, 1., exp(-1.8 * gap * gap / (width * width)));
      float reach = uLandmarkLook.y < 0. ? S.w * 1.02 : min(uLandmarkLook.y, S.w);
      float fall = pow(clamp(1. - h / reach, 0., 1.), uLandmarkLook.y < 0. ? .7 : 1.6);
      float wall = (1. - smoothstep(.45, .85, abs(wn.y))) * smoothstep(-.8, .3, h);
      // 꼭대기(지붕선 · 탑 끝) 테두리 — b 만
      float crown = uLandmarkLook.z * exp(-pow((S.w - h) / 2.2, 2.)) * (1. - smoothstep(.6, .95, abs(wn.y)));
      // 등이 놓인 벽 밑 바닥의 작은 빛 웅덩이
      float pool = smoothstep(.55, .85, wn.y) * (1. - smoothstep(0., 2.6, max(outside.x, outside.y))) * (1. - smoothstep(.5, 2., abs(h))) * .55 * cone;
      flood = max(flood, wall * cone * fall + crown + pool);
    }
    // 밝은 마감(흰 판 · 유리 커튼월)은 하얗게 날아가지 않게 덜 받는다 — 돌 · 벽돌 벽의 결이 남는 쪽으로.
    float albedo = dot(material.diffuseColor, vec3(.2126, .7152, .0722));
    float tame = mix(1., .45, smoothstep(.25, .7, albedo)) * (uNightSurface == 2 ? .45 : 1.);
    reflectedLight.indirectDiffuse += material.diffuseColor * vec3(1., .63, .33) * (uLandmarkLook.x * flood * tame);
  }
`,
  };
}
