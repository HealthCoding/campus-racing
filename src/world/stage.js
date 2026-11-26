// 렌더러 · 장면 · 카메라 · 조명 · 그림자 · 하늘 (약속: docs/구조와_계약.md 3.3). 장면 전체가 미터.
//
// 렌더러 설정은 Beat the School src/main.js 와 같다(sRGB 출력, ACES 톤 매핑, PCFSoft 그림자, autoUpdate = false).
// 색 · 광량 · 노출은 bts/src/time-of-day.js 의 TIME_PRESETS(노을)와 bts/src/campuses/yonsei/index.js 의 scene(낮)에서 가져온다.
// time-of-day.js 의 createTimeOfDay 는 DOM 요소(#quality-select)를 요구하므로 쓰지 않고 값만 읽는다.
//
// 레이싱용으로 바꾼 것: 카메라가 지면 가까이에서 멀리 보므로
//   - camera.far 를 캠퍼스 대각선(약 1.5 km)보다 길게 잡아 캠퍼스 안의 건물은 절대 잘리지 않게 하고,
//   - 안개는 '공기 원근' 정도로만(먼 건물이 하늘색에 녹아들게), 안개 끝(far)은 camera.far 보다 앞에 둔다,
//   - 하늘은 카메라를 따라다니는 그라데이션 돔(지평선 띠는 안개색과 같아 먼 것이 이음매 없이 녹는다),
//   - 그림자는 카트 둘레의 고정 상자. 일정 거리 이상 움직였을 때만 다시 굽고, 텍셀 격자에 맞춰 떨림을 막는다.
import { createRenderQuality } from '../../bts/src/render-performance.js?v=sn109';
import { createPacer } from './pacer.js';
import { NIGHT } from './night-tune.js';
import { TIME_PRESETS } from '../../bts/src/time-of-day.js?v=time75';
import { YONSEI } from '../../bts/src/campuses/yonsei/index.js';

const M = 1 / YONSEI.geo.worldUnitsPerMeter;   // 2 m / 월드 단위
const SCENE = YONSEI.scene;
// time-of-day.js 의 DAY_SUN(내보내지 않는 값) — 낮의 태양 방향(월드 단위 오프셋, 방향만 쓴다).
const DAY_SUN = [-150, 260, 110];

export const LOOKS = Object.freeze({
  day: Object.freeze({ background: SCENE.background, fog: SCENE.fog.color, sky: SCENE.hemisphere.sky, ground: SCENE.hemisphere.ground,
    hemisphere: SCENE.hemisphere.intensity, sun: SCENE.sun.color, sunIntensity: SCENE.sun.intensity, sunOffset: DAY_SUN,
    exposure: 1.05, floorTint: [1, 1, 1],
    // 원본 낮은 단색 하늘. 낮게 보는 화면에서 단조로워 같은 색을 지평선 띠로 두고 위로 갈수록 조금 짙게(이 프로젝트에서 정한 값).
    dome: Object.freeze({ fog: SCENE.fog.color, horizon: '#c7d8e1', mid: '#aac5d6', zenith: '#7e9fc0', glow: '#fff2db', glowStrength: .18 }) }),
  golden: TIME_PRESETS.golden,
  // 반구광 · 달빛 · 노출 · 안개 거리(fogNear · fogFar)는 night-tune.js 의 look 에서 온다
  night: Object.freeze({ background: '#28252d', fog: '#28252d', sky: '#a0b9d6', ground: '#636779',
    sun: '#c3d7ff', sunOffset: [-170, 220, -85], floorTint: [.56, .61, .70], ...NIGHT.look,
    dome: Object.freeze({ fog: '#28252d', horizon: '#222838', mid: '#171f35', zenith: '#0c1121',
      glow: '#ab804c', glowStrength: .27 }) }),
});

// 미터 기준 거리(이 프로젝트에서 정한 값).
export const VIEW = Object.freeze({
  fov: 70, near: .25, far: 2600,          // 캠퍼스 바닥 범위 대각선 ≈ 1.5 km → 캠퍼스 안은 잘리지 않는다
  fogNear: 140, fogFar: 1500,             // 1.5 km 에서 완전히 안개색(= 하늘 지평선 띠). far 보다 앞
  shadowHalf: 125,                        // 그림자 상자 반폭(m) → 250 m 정사각형
  shadowMove: 30,                         // 이만큼 움직이면 다시 굽는다(m)
  sunDistance: 450,                       // 그림자 카메라를 놓는 태양 쪽 거리(m)
});

const SKY_VERTEX = `varying vec3 vDir;
void main(){ vDir=position; gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+position*1000.,1.); gl_Position.z=gl_Position.w; }`;
const SKY_FRAGMENT = `uniform vec3 fogColor,horizon,mid,zenith,glow; uniform vec2 sunDir; uniform float glowStrength; varying vec3 vDir;
void main(){
 vec3 d=normalize(vDir); float h=d.y;
 vec3 c=mix(horizon,mid,smoothstep(.03,.16,h)); c=mix(c,zenith,smoothstep(.14,.65,h));
 float s=max(dot(normalize(d.xz+1e-5),sunDir),0.); c+=glow*glowStrength*s*s*s*(1.-smoothstep(0.,.4,max(h,0.)));
 c=mix(c,fogColor,1.-smoothstep(-.01,.05,h));
 c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;

// 휴대폰 자동 화질의 '한 번 올리기' 천장: 배율 2, 그리는 화소 360만 이하(아이패드처럼 큰 화면은 덜 올라간다).
export const MOBILE_LIFT = Object.freeze({ ratio: 2, pixels: 3600000 });
export const isMobile = () => innerWidth < 760 || (globalThis.navigator?.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);

const NIGHT_SKY = `uniform vec3 fogColor, horizon, mid, zenith, glow;
uniform float glowStrength;
varying vec3 vDir;
float cellHash(vec2 cell) {
  vec3 p = fract(cell.xyx * vec3(.1031, .1030, .0973));
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y, azimuth = atan(d.x, d.z) * .159154943 + .5;
  vec3 c = mix(horizon, mid, smoothstep(.015, .21, h));
  c = mix(c, zenith, smoothstep(.18, .62, h));
  // 언더우드 앞 정원 → 정문 축(SPACE_LANDMARKS). 신촌 시가지가 있는 남남서 하늘이 가장 따뜻하다.
  float city = max(dot(normalize(d.xz + 1.e-6), vec2(-.249, .9685)), 0.);
  city *= city; city *= city;
  float haze = (1. - smoothstep(.022, .135, h)) * (.15 + .85 * city);
  c = mix(fogColor, c + glow * glowStrength * haze, smoothstep(-.009, .022, h));
  // 방위에 고정한 별. 미분으로 각 점의 가장자리를 걸러 카메라가 돌 때 튀는 것을 줄인다.
  vec2 starUV = vec2(azimuth * 800., h * 280.);
  vec2 cell = floor(starUV);
  float seed = cellHash(cell);
  float magnitude = cellHash(cell + vec2(51., 11.));
  float radius = .054 + .060 * magnitude;
  vec2 centre = .25 + .5 * vec2(cellHash(cell + 7.), cellHash(cell + 19.));
  float width = clamp(length(fwidth(starUV)) * .45, .025, .3);
  float star = 1. - smoothstep(max(0., radius - width), radius + width, length(fract(starUV) - centre));
  c += vec3(.13, .15, .19) * (.18 + .82 * magnitude * magnitude)
    * star * step(.993, seed) * smoothstep(.075, .25, h);
  gl_FragColor = vec4(c, 1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// nightLook: 밤 조명을 다른 조정값으로 볼 때(night-tune.js 의 look — 주소 ?night=old). 없으면 LOOKS.night 그대로.
export function createStage(THREE, canvas, { quality = 'auto', look = 'day', createPost = null, dayFx = false, nightLook = null } = {}) {
  const size = () => ({ w: Math.max(1, canvas.clientWidth || innerWidth), h: Math.max(1, canvas.clientHeight || innerHeight) });
  let { w, h } = size();
  // 휴대폰 화질(2026-11-25 사용자 '화질 추천대로' — 시안/모바일조작_시안.html 의 화질 A): 휴대폰도 PC 와 같은 예산표를 쓴다.
  //   자동 = 배율 1.5 · MSAA 4 로 시작 → 느리면 0.25씩 0.75 까지(가장 낮은 0.75 에서는 MSAA 도 끔) · 넉넉하면 한 번만 2 로(MOBILE_LIFT, pacer.js 의 lift)
  //   가볍게(smooth) = 배율 1 · MSAA 끔 · 블룸 반 해상도(그 전의 휴대폰 값) · 선명하게(high) = 배율 2 · MSAA 4 · 그림자 2048.
  //   그 전에는 휴대폰 예산(bts render-performance 의 mobile)이 배율 1 · MSAA 끔이라, 화면 배율 3 인 아이폰에서 흐리고 들쭉날쭉했다.
  //   예산표는 bts/src/render-performance.js 의 것(Beat the School 에서 복사한 파일 — 고치지 않는다)에서 PC 쪽을 빌린다(mobile: false).
  const mobile = isMobile();
  const q = createRenderQuality({ width: w, height: h, devicePixelRatio, mobile: false, mode: quality });
  // 느리면 해상도를 한 단계씩 내린다(품질 auto 에서만 — pacer.js). 휴대폰은 넉넉하면 한 번 올린다. 화면 배율은 늘 pacer.ratio 로 적용한다.
  const lift = () => Math.min(Math.max(.5, devicePixelRatio || 1), MOBILE_LIFT.ratio, Math.sqrt(MOBILE_LIFT.pixels / Math.max(1, w * h)));
  const pacer = createPacer({ ceiling: () => q.ratio, floor: mobile ? 0.75 : 1, lift: mobile ? lift : null });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SCENE.background);
  scene.fog = new THREE.Fog(SCENE.fog.color, VIEW.fogNear, VIEW.fogFar);
  const camera = new THREE.PerspectiveCamera(VIEW.fov, w / h, VIEW.near, VIEW.far);
  camera.position.set(0, 2, 10);

  // 데스크톱 차고는 기본 프레임버퍼에 직접 그린다. 코스의 MSAA는 post의 장면 대상에서 따로 조절한다.
  const directAA = !((look === 'night' || dayFx) && (q.mode === 'smooth' || mobile));
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: directAA, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pacer.ratio); renderer.setSize(w, h, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.info.autoReset = false;

  const hemi = new THREE.HemisphereLight(SCENE.hemisphere.sky, SCENE.hemisphere.ground, SCENE.hemisphere.intensity); scene.add(hemi);
  const sun = new THREE.DirectionalLight(SCENE.sun.color, SCENE.sun.intensity); sun.castShadow = true;
  const shadowSize = () => q.profile.shadowSize;
  sun.shadow.mapSize.set(shadowSize(), shadowSize());
  Object.assign(sun.shadow.camera, { left: -VIEW.shadowHalf, right: VIEW.shadowHalf, top: VIEW.shadowHalf, bottom: -VIEW.shadowHalf, near: 1, far: VIEW.sunDistance * 2 });
  sun.shadow.camera.updateProjectionMatrix();
  // 원본 bias −.00012, normalBias .04 월드 단위 → 미터로 normalBias ×2.
  sun.shadow.bias = -.00012; sun.shadow.normalBias = .04 * M;
  scene.add(sun, sun.target);

  // 바깥 배경 바닥(원본 6000×6000 월드 단위, y −.22).
  const floorBase = new THREE.Color(SCENE.floor.color);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6000 * M, 6000 * M), new THREE.MeshStandardMaterial({ color: SCENE.floor.color, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = SCENE.floor.y * M; floor.receiveShadow = true; floor.name = 'backdrop-floor'; scene.add(floor);

  const skyUniforms = { fogColor: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
    zenith: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, glowStrength: { value: 0 }, sunDir: { value: new THREE.Vector2(1, 0) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), new THREE.ShaderMaterial({ uniforms: skyUniforms,
    vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.name = 'sky-dome'; sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);

  const sunDir = new THREE.Vector3();
  let lookName = 'day', post = null;
  // 후처리(밤 화면)의 MSAA · 블룸 해상도: '가볍게'와, 휴대폰이 가장 낮은 배율(0.75)까지 내려갔을 때만 가벼운 쪽
  function resizePost() { if (post) post.resize(q.mode === 'smooth' || (mobile && pacer.ratio < 0.76)); }
  function setLook(name) {
    lookName = LOOKS[name] ? name : 'day';
    const night = lookName === 'night';
    const p = night && nightLook ? { ...LOOKS.night, ...nightLook } : LOOKS[lookName], dome = p.dome;
    const fragment = night ? NIGHT_SKY : SKY_FRAGMENT;
    if (fragment !== sky.material.fragmentShader) {
      sky.material.fragmentShader = fragment; sky.material.needsUpdate = true;
    }
    sky.renderOrder = night ? 1000 : -1; // 별을 계산하기 전에 불투명한 건물·땅으로 가려진 픽셀은 깊이 검사에서 버린다.
    scene.fog.near = night ? p.fogNear : VIEW.fogNear;
    scene.fog.far = night ? p.fogFar : VIEW.fogFar;
    if (createPost && (night || (dayFx && lookName === 'day'))) {
      post ||= createPost(renderer, scene, camera);
      post.setNight(night);
      resizePost();
    } else if (post) {
      post.dispose(); post = null;
    }
    hemi.color.set(p.sky); hemi.groundColor.set(p.ground); hemi.intensity = p.hemisphere;
    sun.color.set(p.sun); sun.intensity = p.sunIntensity;
    sunDir.set(...p.sunOffset).normalize();
    renderer.toneMappingExposure = p.exposure;
    floor.material.color.copy(floorBase).multiply(new THREE.Color(...p.floorTint));
    scene.fog.color.set(dome.fog); scene.background.set(dome.fog);
    for (const key of ['horizon', 'mid', 'zenith', 'glow']) skyUniforms[key].value.set(dome[key]);
    skyUniforms.fogColor.value.set(dome.fog); skyUniforms.glowStrength.value = dome.glowStrength;
    skyUniforms.sunDir.value.set(p.sunOffset[0], p.sunOffset[2]).normalize();
    placeShadow(true);
  }

  // 그림자: 상자 중심(target)을 텍셀 격자에 맞춰 놓고, 그 중심에서 VIEW.shadowMove 이상 벗어날 때만 다시 굽는다.
  const centre = new THREE.Vector3(), wanted = new THREE.Vector3(), basis = new THREE.Matrix4(), right = new THREE.Vector3(), up = new THREE.Vector3(), back = new THREE.Vector3();
  let hasCentre = false, shadowUpdates = 0;
  function placeShadow(force = false) {
    if (!hasCentre && !force) return false;
    const texel = (2 * VIEW.shadowHalf) / sun.shadow.mapSize.x;
    // 그림자 카메라와 같은 방향 기저(lookAt(태양 → 중심), up = +y)에서 가로 · 세로를 텍셀 단위로 반올림한다.
    basis.lookAt(sunDir, new THREE.Vector3(0, 0, 0), sun.shadow.camera.up); basis.extractBasis(right, up, back);
    const u = wanted.dot(right), v = wanted.dot(up), d = wanted.dot(back);
    centre.set(0, 0, 0).addScaledVector(right, Math.round(u / texel) * texel).addScaledVector(up, Math.round(v / texel) * texel).addScaledVector(back, d);
    sun.target.position.copy(centre); sun.position.copy(centre).addScaledVector(sunDir, VIEW.sunDistance);
    sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
    renderer.shadowMap.needsUpdate = true; shadowUpdates++;
    return true;
  }
  function followShadow(x, y, z) {
    if (hasCentre && Math.hypot(x - wanted.x, y - wanted.y, z - wanted.z) < VIEW.shadowMove) return false;
    wanted.set(x, y, z); hasCentre = true; return placeShadow(true);
  }
  function invalidateShadow() { renderer.shadowMap.needsUpdate = true; }

  function resize() {
    ({ w, h } = size());
    const before = shadowSize();
    q.resize(w, h, devicePixelRatio);
    renderer.setPixelRatio(pacer.ratio); renderer.setSize(w, h, false);
    resizePost();
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (shadowSize() !== before) applyShadowSize();
  }
  function applyShadowSize() {
    sun.shadow.mapSize.set(shadowSize(), shadowSize()); sun.shadow.map?.dispose(); sun.shadow.map = null; placeShadow();
    renderer.shadowMap.needsUpdate = true;
  }
  function setQuality(mode) { if (q.setMode(mode)) { pacer.reset(); resize(); applyShadowSize(); } return q.mode; }
  // 화면마다 부른다(now = rAF 의 시각, active = 달리는 중인가). 느린 채로 가면 배율을 내리고 true 를 준다.
  function pace(now, active = true) { if (q.mode !== 'auto' || !pacer.sample(now, active)) return false; renderer.setPixelRatio(pacer.ratio); renderer.setSize(w, h, false); resizePost(); return true; }

  let lastShadowPass = false, snaps = [];
  function render() {
    lastShadowPass = renderer.shadowMap.needsUpdate;
    renderer.info.reset();
    if (post) post.render(); else renderer.render(scene, camera);
    if (snaps.length) { const waiting = snaps; snaps = []; const shot = copyCanvas(); for (const done of waiting) done(shot); }
  }
  // 공유 카드(src/hud/share.js)의 사진. preserveDrawingBuffer 를 켜지 않는다 — 그린 바로 그 틱 안에서(브라우저가 화면에 넘기기 전) 2D 캔버스로 베낀다.
  //   후처리(post)를 쓰는 화질도 마지막 출력이 같은 캔버스라 똑같다. 긴 변은 SNAP_MAX 까지 줄인다.
  const SNAP_MAX = 1920;
  function copyCanvas(w = canvas.width, h = canvas.height, max = SNAP_MAX) {
    const k = Math.min(1, max / Math.max(w, h)), out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(w * k)); out.height = Math.max(1, Math.round(h * k));
    out.getContext('2d').drawImage(canvas, 0, 0, w, h, 0, 0, out.width, out.height);
    return out;
  }
  // 다음 render() 가 그린 장면 한 장(2D 캔버스)을 준다
  function snap() { return new Promise(resolve => snaps.push(resolve)); }
  // 다른 장면(쇼룸)을 w × h 로 한 번 그려 2D 캔버스로 베끼고, 화면의 크기 · 노출을 되돌려 지금 장면을 다시 그린다(한 틱 안 — 화면에는 안 비친다).
  //   렌더 타깃이 아니라 화면 캔버스에 그리는 까닭: 렌더 타깃에는 톤 매핑 · sRGB 출력이 안 걸려 쇼룸과 색이 달라진다.
  function shoot(other, view, sw, sh, { exposure = null } = {}) {
    const ratio = renderer.getPixelRatio(), keepExposure = renderer.toneMappingExposure, keepShadow = renderer.shadowMap.needsUpdate;
    try {
      renderer.setPixelRatio(1); renderer.setSize(sw, sh, false);
      if (exposure != null) renderer.toneMappingExposure = exposure;
      renderer.render(other, view);
      return copyCanvas(sw, sh, Infinity);
    } finally {
      renderer.toneMappingExposure = keepExposure; renderer.shadowMap.needsUpdate = keepShadow;
      renderer.setPixelRatio(ratio); renderer.setSize(w, h, false); render();   // 후처리의 대상들은 건드리지 않았다(크기가 그대로라 다시 짓지 않는다)
    }
  }
  setLook(look);
  wanted.set(0, 0, 0);

  return {
    renderer, scene, camera, sun, hemi, sky, floor,
    resize, followShadow, invalidateShadow, render, setLook, setQuality, pace, snap, shoot,
    get look() { return lookName; }, get quality() { return q.mode; },
    info() { const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles, pixelRatio: renderer.getPixelRatio(), shadowPass: lastShadowPass, shadowUpdates, shadowSize: sun.shadow.mapSize.x, ceiling: q.ratio, drops: pacer.drops, lifted: pacer.lifted, quality: q.mode, mobile, frameMs: pacer.average, restored: pacer.restored, kept: pacer.kept, raised: pacer.raised }; },
    dispose() { post?.dispose(); renderer.dispose(); sky.geometry.dispose(); sky.material.dispose(); floor.geometry.dispose(); floor.material.dispose(); sun.shadow.map?.dispose(); },
  };
}
