import { NIGHT } from './night-tune.js';

// 세계 좌표는 조립된 장면의 미터 단위. 재질마다 다른 것은 uniform 값뿐이다.
// 인스턴스 · 스키닝 · 피트/발판의 기존 훅도 Three가 계산한 최종 위치/색을 그대로 쓴다.
// barrier = 방호벽 블록(남색 · 밝은 회색이 밤에도 갈리게 노면 칠보다 색을 덜 뺀다 — 2026-11-23 연세 남색)
const SURFACE = { ordinary: 0, road: 1, glass: 2, paint: 3, lens: 4, markings: 5, barrier: 6 };

function grainTexture(THREE) {
  // 큰 얼룩(R)과 미세 골재(G)를 함께 굽는다. 미리 만든 mip으로 먼 노면의 깜빡임을 줄인다.
  const size = 128, pixels = new Uint8Array(size * size * 4);
  function hash(x, y) {
    let h = Math.imul(x + 13, 0x45d9f3b) ^ Math.imul(y + 37, 0x27d4eb2d);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function noise(x, y, cells) {
    const u = x * cells / size, v = y * cells / size, i = Math.floor(u), j = Math.floor(v);
    const fx = u - i, fy = v - j, a = fx * fx * (3 - 2 * fx), b = fy * fy * (3 - 2 * fy);
    const nextX = (i + 1) % cells, nextY = (j + 1) % cells;
    return (1 - b) * ((1 - a) * hash(i, j) + a * hash(nextX, j))
      + b * ((1 - a) * hash(i, nextY) + a * hash(nextX, nextY));
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    pixels[i] = Math.round(255 * (.55 * noise(x, y, 8) + .3 * noise(x, y, 25) + .15 * noise(x, y, 53)));
    pixels[i + 1] = Math.round(255 * hash(x, y));
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = 'asphalt-aggregate';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// 캠퍼스가 한 재질의 창 수백 장을 한 메시에 합치므로 mesh 원점으로는 창을 구분할 수 없다.
// 같은 모서리에서 만나는 삼각형을 묶고, 실제 유리판 중심의 월드 좌표를 칸의 씨앗으로 삼는다.
// 층 전체를 한 장으로 만든 커튼월은 유리판 자체 좌표로 층과 방을 나눈다.
function windowCoordinates(THREE, mesh) {
  const geometry = mesh.geometry, positions = geometry.getAttribute('position');
  if (!positions || geometry.hasAttribute('nightWindowCoord')) return;
  const count = positions.count, parent = new Int32Array(count), welded = new Map();
  function root(i) {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  for (let i = 0; i < count; i++) {
    const key = Math.round(positions.getX(i) * 1e4) + ',' + Math.round(positions.getY(i) * 1e4) + ',' + Math.round(positions.getZ(i) * 1e4);
    const first = welded.get(key);
    parent[i] = first ?? i;
    if (first === undefined) welded.set(key, i);
  }
  const index = geometry.index, length = index?.count ?? count;
  for (let i = 0; i + 2 < length; i += 3) {
    const a = root(index ? index.getX(i) : i);
    parent[root(index ? index.getX(i + 1) : i + 1)] = a;
    parent[root(index ? index.getX(i + 2) : i + 2)] = a;
  }
  const point = new THREE.Vector3(), scale = new THREE.Vector3().setFromMatrixScale(mesh.matrixWorld);
  const bounds = new Map();
  for (let i = 0; i < count; i++) {
    const id = parent[i] = root(i);
    if (!bounds.has(id)) bounds.set(id, new THREE.Box3());
    bounds.get(id).expandByPoint(point.fromBufferAttribute(positions, i));
  }
  const panes = new Map(), size = new THREE.Vector3();
  let building = mesh;
  while (building.parent && !/^(building-|protected-)/.test(building.name)) building = building.parent;
  building.getWorldPosition(point);
  const floorSeed = (Math.imul(Math.round(point.x), 37) ^ Math.imul(Math.round(point.z), 17)) & 1023;
  const meshY = mesh.matrixWorld.elements[13];
  for (const [id, box] of bounds) {
    box.getCenter(point).applyMatrix4(mesh.matrixWorld);
    box.getSize(size);
    const wideX = size.x * scale.x >= size.z * scale.z;
    const metres = Math.hypot(size.x * scale.x, size.z * scale.z);
    const columns = metres <= 4.2 ? 1 : Math.max(2, Math.round(metres / 3.8));
    const rows = Math.max(1, Math.round(size.y * scale.y / 3.6));
    const x = Math.round(point.x * 3), y = Math.round(point.y * 3), z = Math.round(point.z * 3);
    panes.set(id, {
      wideX, left: wideX ? box.min.x : box.min.z, bottom: box.min.y,
      uScale: columns / Math.max(.0001, wideX ? size.x : size.z), vScale: rows / Math.max(.0001, size.y),
      uBase: (Math.imul(x, 37) ^ Math.imul(z, 53) ^ Math.imul(y, 13)) & 1023,
      // Neighbouring bays on the same floor share the decision to close that floor.
      vBase: floorSeed + Math.round((point.y - meshY) / 3.6 - (rows - 1) * .5),
      columns, rows,
    });
  }
  const coordinates = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const p = panes.get(parent[i]);
    const u = (p.wideX ? positions.getX(i) : positions.getZ(i)) - p.left;
    coordinates[i * 3] = p.uBase + Math.max(.002, Math.min(p.columns - .002, u * p.uScale));
    coordinates[i * 3 + 1] = p.vBase + Math.max(.002, Math.min(p.rows - .002, (positions.getY(i) - p.bottom) * p.vScale));
    coordinates[i * 3 + 2] = Number(p.columns > 1 || p.rows > 1);
  }
  geometry.setAttribute('nightWindowCoord', new THREE.BufferAttribute(coordinates, 3));
}

const VARYINGS = `
  varying vec3 vNightPosition;
  varying vec3 vNightCoord;
  uniform int uNightSurface;
`;
const VERTEX = `
  // mvPosition includes morph targets, skinning, batching and instanceMatrix.
  vNightPosition = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz + cameraPosition;
  vNightCoord = vec3(uv.x, 0., 0.);
  #ifdef CAMPUS_LAMP_MAP
    // Some unmerged window meshes share one geometry at different world transforms.
    if (uNightSurface == 2) {
      vNightCoord = nightWindowCoord;
      vNightCoord.x += mod(dot(floor(modelMatrix[3].xz * 3.), vec2(1.,7.)), 251.);
      vNightCoord.y += floor(modelMatrix[3].y / 3.6 + .5);
    }
    // GLB body meshes, kart lenses and work lights all use the vehicle's local +Z.
    if (uNightSurface == 4) vNightCoord.x = dot(normalize(modelViewMatrix[2].xyz), normalize(-mvPosition.xyz));
  #endif
`;
const FRAGMENT = `
  uniform sampler2D uAsphaltGrain;
  #ifdef CAMPUS_LAMP_MAP
    uniform sampler2D uLampMap;
    uniform vec4 uLampBounds; // minX, minZ, 1/width, 1/depth
    uniform vec2 uLampHeight; // floor = offset + normalizedHeight * range
    float roomHash(vec2 cell) {
      vec3 p = fract(vec3(cell.xyx) * vec3(.1031,.1030,.0973));
      p += dot(p, p.yzx + 33.33);
      return fract((p.x + p.y) * p.z);
    }
    vec2 lampReceiver(vec4 sampleValue) {
      vec2 floors = uLampHeight.x + uLampHeight.y * sampleValue.ga / max(sampleValue.rb, vec2(1./255.));
      vec2 above = vNightPosition.y - floors;
      return smoothstep(vec2(-3.), vec2(-.6), above) * (1. - smoothstep(vec2(2.7), vec2(6.), above));
    }
  #endif
`;
const SURFACE_COLOR = `
  float nightAggregate = 0.;
  float nightWear = 0.;
  if (uNightSurface == 1) {
    float mottle = texture2D(uAsphaltGrain, vNightPosition.xz / 36.).r;
    float grit = texture2D(uAsphaltGrain, vNightPosition.zx / 3.7).g;
    nightAggregate = clamp((mottle - .5) * 1.7 + (grit - .5) * .72, -1., 1.);
    float trackWidth = abs(abs(vNightCoord.x - .5 + (mottle - .5) * .035) - .072);
    nightWear = 1. - smoothstep(.014,.066,trackWidth);
    diffuseColor.rgb *= 1. + .09 * nightAggregate - .075 * nightWear;
  }
  #ifdef CAMPUS_LAMP_MAP
    if (uNightSurface == 5) {
      float luma = dot(diffuseColor.rgb, vec3(.2126,.7152,.0722));
      diffuseColor.rgb = .32 * mix(vec3(luma), diffuseColor.rgb, .48);
    }
    if (uNightSurface == 6) {
      // 방호벽: 밝기는 칠과 같게 낮추되 색은 거의 그대로 — 남색 블록이 회색 블록 옆에서 남색으로 읽힌다
      float luma = dot(diffuseColor.rgb, vec3(.2126,.7152,.0722));
      diffuseColor.rgb = .32 * mix(vec3(luma), diffuseColor.rgb, .92);
    }
  #endif
`;
const EMISSION = `
  if (uNightSurface == 2) {
    vec2 cell = floor(vNightCoord.xy);
    float pick = roomHash(cell);
    float floorOpen = step(.12, roomHash(vec2(91., cell.y)));
    float occupied = step(mix(.60, .71, vNightCoord.z), pick) * floorOpen;
    float level = mix(.35, 1., roomHash(cell + vec2(19.,63.)));
    vec3 lamp = roomHash(cell + vec2(47.,13.)) < .70 ? vec3(1.,.64,.35) : vec3(.81,.86,.91);
    // One decision for the entire pane/room. A narrow unlit frame separates bays on large sheets.
    vec2 edge = .5 - abs(fract(vNightCoord.xy) - .5);
    vec2 pixel = min(fwidth(vNightCoord.xy), vec2(.18));
    vec2 frame = smoothstep(vec2(.012) - pixel, vec2(.038) + pixel, edge);
    totalEmissiveRadiance += occupied * (.62 * level) * lamp * frame.x * frame.y;
  }
  #if defined(USE_COLOR) || defined(USE_COLOR_ALPHA)
    if (uNightSurface == 4) {
      bool tail = vColor.r > 3.5 * max(vColor.g, .015) && vColor.b < .13;
      float forward = smoothstep(.06, .42, vNightCoord.x);
      if (!tail) diffuseColor.rgb *= mix(.055, 1., forward);
      totalEmissiveRadiance = vColor.rgb * (tail ? emissive.r : 3.4 * forward);
    }
  #endif
`;
// 범프 맵의 법선(three r170 bumpmap_pars_fragment 의 perturbNormalArb)을 NaN 이 안 나게 바꾼 것 — 밤 재질 모두에 넣는다.
// 2026-11-24 사용자: "언더우드관이랑 그 시작점 사이 구간 주행시에 한 번씩 화면이 번쩍번쩍" · "하얗게 번쩍이는게 아니라 약간 검정 판 느낌".
//   까닭: 화면에서 거의 옆으로 선 면(멀리 있는 처마 · 기둥의 가는 조각 — 대강당 콘크리트에서 잡혔다)은 한 픽셀 묶음 안의 화면 미분 dFdx · dFdy 가
//   평행하거나 0 이라 fDet = 0 → sign(0) = 0 → normalize(0) 이 되고, 이 맥(ANGLE · Metal)에서는 NaN 이다(검증/flash-probe.mjs 의 platform 줄).
//   그 픽셀 하나의 NaN 을 후처리 블룸이 축소 단계마다 번지게 해서 화면의 1/3 쯤이 검은 네모로 한 장 덮였다(?fx=0 에서는 검은 점 하나라 안 보인다).
//   그래서 미분이 기운 경우에는 범프를 빼고 원래 법선을 쓴다(그 조각은 한 픽셀보다 가늘어 범프 결이 보일 일이 없다). 유한한지는 비트로 본다 — 빠른 수학이 isnan 을 지울 수 있다.
export const SAFE_BUMP = `#ifdef USE_BUMPMAP
  uniform sampler2D bumpMap;
  uniform float bumpScale;
  vec2 dHdxy_fwd() {
    vec2 dSTdx = dFdx( vBumpMapUv );
    vec2 dSTdy = dFdy( vBumpMapUv );
    float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
    float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
    float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
    return vec2( dBx, dBy );
  }
  bool nightFinite( vec3 v ) { uvec3 e = floatBitsToUint( v ) & uvec3( 0x7f800000u ); return all( notEqual( e, uvec3( 0x7f800000u ) ) ); }
  vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
    vec3 dx = dFdx( surf_pos.xyz ), dy = dFdy( surf_pos.xyz );
    vec3 vSigmaX = dx * inversesqrt( max( dot( dx, dx ), 1e-30 ) );
    vec3 vSigmaY = dy * inversesqrt( max( dot( dy, dy ), 1e-30 ) );
    vec3 R1 = cross( vSigmaY, surf_norm );
    vec3 R2 = cross( surf_norm, vSigmaX );
    float fDet = dot( vSigmaX, R1 ) * faceDirection;
    vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
    vec3 n = abs( fDet ) * surf_norm - vGrad;
    float len2 = dot( n, n );
    return len2 > 1e-12 && nightFinite( n ) ? n * inversesqrt( len2 ) : surf_norm;
  }
#endif`;

// 밝기 조정값(night-tune.js)이 들어가는 자리: 노면 바탕빛 · 방호벽/연석/차선의 바탕빛 · 노면 위 전조등 자국.
const glsl = value => (+value).toFixed(4);
const BEAM_UNIFORMS = `
  uniform vec4 uNightBeam;  // 전조등 자리 x, z · 앞 방향 x, z(세계 좌표)
  uniform float uNightBeamY;
`;
// 낮게 달린 전조등은 노면을 스치듯 비춰 SpotLight(램버트)만으로는 노면이 거의 밝아지지 않는다 → 위를 보는 면에 자국을 따로 얹는다(서 있는 면은 SpotLight 몫).
const beamLight = beam => !(beam?.road > 0) ? '' : `
  {
    vec2 beamRel = vNightPosition.xz - uNightBeam.xy;
    float beamAlong = dot(beamRel, uNightBeam.zw), beamAcross = dot(beamRel, vec2(uNightBeam.w, -uNightBeam.z));
    float beamWidth = 1.5 + .17 * beamAlong;
    float beamLobe = smoothstep(1.5, 7., beamAlong) * (1. - smoothstep(${glsl(.42 * beam.reach)}, ${glsl(beam.reach)}, beamAlong))
      * exp(-beamAcross * beamAcross / (beamWidth * beamWidth))
      * (1. - smoothstep(1.2, 3.2, abs(vNightPosition.y - uNightBeamY)));
    reflectedLight.indirectDiffuse += material.diffuseColor * vec3(1.,.93,.80) * (${glsl(beam.road)} * beamLobe * max(0., wn.y));
  }
`;
const lampLight = (road, beam) => `
  vec2 lampUv = (vNightPosition.xz - uLampBounds.xy) * uLampBounds.zw;
  vec4 lampSample = texture2D(uLampMap, lampUv);
  vec2 receiver = lampReceiver(lampSample);
  float pool = min(1., dot(lampSample.rb, receiver));
  vec3 lampWarm = vec3(1.,.47,.18); // linear RGB of a #ffb675 fixture
  vec3 wn = inverseTransformDirection(normal, viewMatrix);
  float facing = smoothstep(-.86,-.22,wn.y) * (.34 + .66 * max(0.,wn.y));
  reflectedLight.indirectDiffuse += material.diffuseColor * lampWarm * (4.9 * facing * pool);
  if (uNightSurface == 5 || uNightSurface == 6) reflectedLight.indirectDiffuse += material.diffuseColor * ${glsl(road.edgeFill)}
    * smoothstep(-.86,-.22,wn.y) * (${glsl(road.edgeWall)} + ${glsl(1 - road.edgeWall)} * max(0.,wn.y));
${beamLight(beam)}
  if (uNightSurface == 1) {
    // A faint sky/city return on bare asphalt keeps the gaps between fixtures legible.
    reflectedLight.indirectDiffuse += material.diffuseColor * vec3(.32,.258,.21) * (${glsl(road.fill)} * facing);
    vec3 eye = normalize(cameraPosition - vNightPosition);
    vec2 away = -eye.xz / max(length(eye.xz), .001);
    vec2 stride = away * uLampBounds.zw * 2.1;
    vec4 nearSample = texture2D(uLampMap, lampUv + stride);
    vec4 farSample = texture2D(uLampMap, lampUv + 2. * stride);
    // The brightest part of the pool makes a short grazing reflection towards the viewer.
    vec3 pools = min(vec3(1.), vec3(pool, dot(nearSample.rb, lampReceiver(nearSample)),
      dot(farSample.rb, lampReceiver(farSample))));
    vec3 cores = pools * pools;
    float streak = dot(cores * cores, vec3(.30,.46,.24));
    float grazing = 1. - smoothstep(.10,.75,max(0.,dot(wn,eye)));
    float grain = .90 + .10 * nightAggregate + .10 * nightWear;
    reflectedLight.directSpecular += lampWarm * (.085 * streak * grazing * grain);
  } else if (uNightSurface == 3) {
    // The gradient of the winning fixture gives paint its highlight direction.
    float gx = dot(texture2D(uLampMap, lampUv + vec2(.75 * uLampBounds.z,0.)).rb, receiver) - pool;
    float gz = dot(texture2D(uLampMap, lampUv + vec2(0.,.75 * uLampBounds.w)).rb, receiver) - pool;
    vec2 slope = vec2(gx,gz);
    float reach = 5.8 * sqrt(-log(clamp(pool, .004, 1.)));
    vec2 toLamp = slope * reach / max(length(slope), .004);
    vec3 lightDir = normalize(vec3(toLamp.x,6.8,toLamp.y));
    vec3 eye = normalize(cameraPosition - vNightPosition);
    vec3 halfDir = normalize(lightDir + eye);
    float gloss = max(dot(wn,halfDir), 0.);
    vec3 reflected = reflect(-eye,wn);
    float horizon = 1. - smoothstep(.03,.35,abs(reflected.y-.07));
    float fresnel = .24 + .76 * pow(1.-max(0.,dot(wn,eye)), 3.);
    reflectedLight.indirectSpecular += fresnel * vec3(.018,.028,.052) * (.3 + horizon);
    reflectedLight.directSpecular += lampWarm * pool * .82 * pow(gloss,38.);
  }
`;

function surfaceKind(mesh, material) {
  if (mesh.name === 'track-road') return SURFACE.road;
  if (mesh.name === 'track-barriers' || mesh.name === 'pit-barriers') return SURFACE.barrier;
  if (mesh.name.startsWith('track-') || mesh.name.startsWith('part-') || mesh.name.startsWith('pit-')) return SURFACE.markings;
  for (let object = mesh; object; object = object.parent) {
    // 실사 운전자(torso · head 마디 아래 — 헬멧 껍데기가 glass 재질)는 도장 반사에서 뺀다:
    // 반짝이는 헬멧 윗면이 가로등을 그대로 비춰 블룸에 걸리면 흰 네모처럼 번졌다(2026-11-23, 휴대폰 세로 그림).
    if (object.name === 'torso' || object.name === 'head') return material.name === 'light' ? SURFACE.lens : SURFACE.ordinary;
    if (object.name === 'kart') {
      if (material.name === 'light') return SURFACE.lens;
      if (material.name === 'paint' || material.name === 'glass') return SURFACE.paint;
      return SURFACE.ordinary;
    }
    if (object.name.startsWith('building-') || object.name.startsWith('protected-')) {
      if (material.userData.campusFinish === 'glass' || material.userData.campusFacade?.kind === 'glass'
        || /glass|^(baekyang|union)_blue$/i.test(material.name)) return SURFACE.glass;
      return SURFACE.ordinary;
    }
  }
  return SURFACE.ordinary;
}

// landmarks: 상징 건물 밤 조명(landmarks.js, 시안 — ?landmark=). 없으면 셰이더 · 캐시 키가 지금과 같다.
// tune: 밤 밝기를 다른 조정값으로 볼 때(night-tune.js 의 nightTune() — id · road · beam, 주소 ?night=old). 없으면 지금 값.
export function createNightMaterials(THREE, { lightMap = null, landmarks = null, tune = null } = {}) {
  const grain = grainTexture(THREE), applied = new WeakSet();
  const { road, beam: beamTune } = tune || NIGHT, beam = lightMap && beamTune.road > 0 ? beamTune : null;
  const tuneKey = tune?.id && tune.id !== 'now' ? '/tune-' + tune.id : '', LAMP_LIGHT = lightMap ? lampLight(road, beam) : '';
  const uniforms = { uAsphaltGrain: { value: grain } };
  if (lightMap) {
    uniforms.uLampMap = { value: lightMap.texture };
    uniforms.uLampBounds = { value: new THREE.Vector4(lightMap.minX, lightMap.minZ, 1 / lightMap.widthMeters, 1 / lightMap.depthMeters) };
    uniforms.uLampHeight = { value: new THREE.Vector2(lightMap.minY, lightMap.heightRange) };
    if (landmarks) Object.assign(uniforms, landmarks.uniforms);
    if (beam) { uniforms.uNightBeam = { value: new THREE.Vector4(0, 0, 0, 1) }; uniforms.uNightBeamY = { value: -1e4 }; }
  }
  const lm = lightMap && landmarks ? landmarks : null;
  function patch(material, role) {
    // r170's default key reads this.onBeforeCompile; capture it BEFORE wrapping the hook.
    const oldKey = material.customProgramCacheKey();
    const oldCompile = material.onBeforeCompile;
    material.defaultAttributeValues = { uv: [0, 0], nightWindowCoord: [0, 0, 0], ...material.defaultAttributeValues };
    if (lightMap && role === SURFACE.glass) material.envMap = null;
    material.customProgramCacheKey = () => oldKey + (lightMap ? '/campus-night-2' + tuneKey + (lm ? lm.key : '') : '/campus-asphalt-1');
    material.onBeforeCompile = function(shader, renderer) {
      oldCompile.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms, { uNightSurface: { value: role } });
      const mode = lightMap ? '#define CAMPUS_LAMP_MAP\n' : '';
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + mode + VARYINGS + (lightMap ? 'attribute vec3 nightWindowCoord;\n' : ''))
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <bumpmap_pars_fragment>', SAFE_BUMP)   // 위 SAFE_BUMP — 옆으로 선 면의 범프가 NaN 을 내지 않게
        .replace('#include <common>', '#include <common>\n' + mode + VARYINGS + FRAGMENT + (beam ? BEAM_UNIFORMS : '') + (lm ? lm.head : ''))
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + SURFACE_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n'
          + 'if (uNightSurface == 1) roughnessFactor = clamp(roughnessFactor - .065 + .075 * nightAggregate - .045 * nightWear, .65, .98);');
      if (lightMap) shader.fragmentShader = shader.fragmentShader
        .replace('#include <lights_physical_fragment>', EMISSION + '\n#include <lights_physical_fragment>')
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LAMP_LIGHT + (lm ? lm.light : ''));
    };
    material.needsUpdate = true;
    applied.add(material);
  }
  return {
    apply(root) {
      root.updateWorldMatrix(true, true);
      root.traverse(mesh => {
        if (!mesh.isMesh) return;
        for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
          if (!material?.isMeshStandardMaterial) continue;
          const role = surfaceKind(mesh, material);
          if (!lightMap && role !== SURFACE.road) continue;
          if (role === SURFACE.glass) windowCoordinates(THREE, mesh);
          if (!applied.has(material)) patch(material, role);
        }
      });
    },
    // 노면 위 전조등 자국의 자리: 전조등의 세계 좌표와 차가 보는 방향(조정값에 road 가 있을 때만 쓰인다)
    aim(x, y, z, heading) {
      if (!beam) return;
      uniforms.uNightBeam.value.set(x, z, Math.sin(heading), Math.cos(heading)); uniforms.uNightBeamY.value = y;
    },
    dispose() { grain.dispose(); },
  };
}
