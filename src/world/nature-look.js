// 잔디 · 나무 · 관목을 더 실감 나게 보는 후보(시안 — 주소 ?nature=a|b|c). 인자가 없으면 이 파일은 불러오지도 않는다(campus.js).
// 2026-11-24 사용자: "주변 잔디나 나무들같은것도 좀 더 실감나게 바꿔보고 싶어" → 같은 자리 그림으로 견줄 후보 셋.
//   a 결만 입히기   셰이더 계산만: 나무마다 다른 색 · 밝기, 수관의 위아래 명암 · 잎 뭉치 결 · 매끈한 면, 줄기 결,
//                  잔디의 큰 얼룩 · 깎은 줄 · 나무 밑 그늘(나무 자리로 굽는 작은 그늘 지도 하나 — 그림 파일 아님)
//   b a + 모양      수관 · 잎덩이 · 관목을 울퉁불퉁한 잎 뭉치로(꼭짓점 흔들기), 나무마다 작은 잎덩이 하나를 더함,
//                  길 가까운 잔디에만 풀포기 · 낙엽(길가 띠 안, 멀어지면 줄어 사라진다)
//   c b + 움직임 · 밤빛  바람에 수관 · 풀이 살랑임(움직임 줄이기면 멈춤), 밤에 가로등 빛이 수관 아래 · 옆에 닿고(잎 사이로 얼룩지게) 길가 풀 끝이 빛남
// 지키는 것: 주행 · 판정은 그대로(보이는 것만). 원본 InstancedMesh 의 인스턴스 행렬 · 순서는 건드리지 않는다(campus.js 의 숨기기 순서 대응이 그대로 맞는다).
//   더한 메시(잎덩이 · 풀포기 · 낙엽)는 이 파일이 따로 숨긴다(hide · restore). 밤 재질(night-materials.js)은 이 셰이더 위에 그대로 얹힌다.
// 좌표: 바닥 묶음(scenery.group)은 BTS 월드 단위(1 m = 0.5). 셰이더의 vNatWorld 는 장면의 미터.

export const NATURE_LEVELS = Object.freeze({ a: 1, b: 2, c: 3 });

// 소음은 계산 대신 작은 소음 그림 두 장(코드로 굽는다 — 파일 아님)을 읽는다: 조각마다 해시 여덟 번보다 싸다.
//   natN2(p) 잔디 · 줄기용 2D 값 소음(128², 이어짐, 밉맵 — 먼 곳의 자글거림을 걸러 준다). p 한 칸 ≈ 한 덩이.
//   natN(p)  잎용 3D 값 소음(64² 칸마다 무작위 값, 두 채널에 z 이웃 칸 — 한 번 읽기). 밉맵이 없으니 잔결은 멀면 지운다.
const NOISE_COMMON = `
  uniform sampler2D uNatNoise;
  uniform sampler2D uNatCells;
  float natHash3(vec3 p) { p = fract(p * .1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
  float natN(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
    vec2 rg = textureLod(uNatCells, (i.xy + vec2(37., 17.) * i.z + f.xy + .5) * .015625, 0.).rg;
    return mix(rg.r, rg.g, f.z);
  }
`;
const NOISE = NOISE_COMMON + `
  float natN2(vec2 p) { return texture2D(uNatNoise, p * .0625).r; }
`;
const NOISE_VERTEX = NOISE_COMMON;
const HEAD = `
  uniform float uNatTime;
  varying vec3 vNatWorld;
  varying vec3 vNatLocal;
  varying float vNatSeed;
`;
// 꼭짓점: 인스턴스마다 씨앗(자리로), 잎 뭉치 흔들기(NAT_LUMPY = 반지름에 대한 비율), 바람(NAT_WIND = 흔들림 폭).
const VERTEX = `
  vNatLocal = position;
  vec3 natOrigin = vec3(0.);
  #ifdef USE_INSTANCING
    natOrigin = instanceMatrix[3].xyz;
  #endif
  vNatSeed = natHash3(floor(natOrigin * 7.31) + .5);
  #ifdef NAT_LUMPY
    {
      vec3 dir = normalize(position);
      float lump = natN(dir * 2.1 + vNatSeed * 17.) * .62 + natN(dir * 5.3 + vNatSeed * 9.) * .38;
      float edge = natN(dir * 11. + vNatSeed * 5.);
      transformed += dir * NAT_LUMPY * ((lump - .45) * 1.15 + (edge - .5) * .45);
    }
  #endif
  #ifdef NAT_WIND
    {
      float phase = natOrigin.x * .21 + natOrigin.z * .17 + vNatSeed * 6.2832;
      float gust = .65 + .35 * sin(uNatTime * .37 + natOrigin.x * .013);
      float lift = clamp(position.y * NAT_WIND_LIFT + NAT_WIND_BASE, 0., 1.5);
      vec2 sway = vec2(sin(uNatTime * 1.13 + phase), cos(uNatTime * .91 + phase * 1.3)) * NAT_WIND * gust * lift;
      float flutter = sin(uNatTime * 5.7 + dot(position, vec3(9.1, 7.3, 8.7)) + phase) * NAT_WIND * .35 * lift;
      transformed.xz += sway;
      transformed += normalize(position + vec3(1e-4)) * flutter * NAT_FLUTTER;
    }
  #endif
  {
    vec4 natW = vec4(transformed, 1.);
    #ifdef USE_INSTANCING
      natW = instanceMatrix * natW;
    #endif
    vNatWorld = (modelMatrix * natW).xyz;
  }
  #ifdef NAT_FADE
    // 멀어지면 줄어 사라진다(자잘한 것이 멀리서 자글거리지 않게 · 그리는 값도 준다)
    {
      float natFar = 1. - smoothstep(NAT_FADE * .6, NAT_FADE, distance(vNatWorld, cameraPosition));
      transformed *= natFar;
      vec4 natW = vec4(transformed, 1.);
      #ifdef USE_INSTANCING
        natW = instanceMatrix * natW;
      #endif
      vNatWorld = (modelMatrix * natW).xyz;
    }
  #endif
`;
const COLOR = `
  float natDist = distance(vNatWorld, cameraPosition);
  #ifdef NAT_FOLIAGE
    {
      float s2 = fract(vNatSeed * 7.13 + .31), s3 = fract(vNatSeed * 13.7 + .71);
      // 나무마다: 푸른 녹음 ~ 누런 녹음, 밝기도 조금씩
      diffuseColor.rgb *= mix(vec3(.80, .97, .88), vec3(1.16, 1.06, .78), s2) * (.80 + .40 * s3);
      // 수관 안쪽 · 아래는 어둡고 위는 밝게(하늘을 덜 보는 쪽)
      float up = clamp(vNatLocal.y * .5 + .5, 0., 1.);
      float ao = mix(NAT_AO_LOW, 1.12, smoothstep(.05, .95, up));
      float clump = natN(vNatWorld * .85 + vNatSeed * 31.);
      float fine = mix(natN(vNatWorld * 2.9), .5, smoothstep(14., 45., natDist));
      float pocket = smoothstep(.36, .12, clump);
      diffuseColor.rgb *= ao * (.70 + .58 * (clump * .65 + fine * .35)) * (1. - .30 * pocket);
    }
  #endif
  #ifdef NAT_TRUNK
    {
      float ang = atan(vNatLocal.z, vNatLocal.x);
      float bark = natN2(vec2(ang * 3.2 + vNatSeed * 23., vNatLocal.y * 4.5)) * .6 + natN2(vec2(ang * 9., vNatLocal.y * 26. + vNatSeed * 7.)) * .4;
      diffuseColor.rgb *= (.72 + .2 * vNatSeed) * (.68 + .62 * bark);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.72, .82, .62), smoothstep(-.25, -.48, vNatLocal.y) * .6);
    }
  #endif
  #if defined(NAT_GRASS) || defined(NAT_GROUND)
    {
      vec2 g = vNatWorld.xz;
      float big = natN2(g * .043) * .65 + natN2(g * .11 + 7.) * .35;
      float mid = natN2(g * .41 + 3.1);
      float fine = natN2(g * 2.6);
      float patchy = natN2(g * 1.7 + 11.);
      diffuseColor.rgb *= mix(vec3(.80, 1.0, .86), vec3(1.20, 1.07, .74), smoothstep(.34, .80, big));
      diffuseColor.rgb *= (.80 + .34 * mid) * (.92 + .16 * patchy) + .18 * (fine - .5);
      #ifdef NAT_STRIPES
        // 깎은 줄(3 m 폭) — 아주 옅게, 멀리서는 지운다
        float band = sin(dot(g, vec2(.80, .60)) * 1.0472);
        diffuseColor.rgb *= 1. + (.07 * smoothstep(-.25, .25, band) - .035) * (1. - smoothstep(60., 140., natDist));
      #endif
      // 나무 밑 그늘(수관이 하늘을 가린 만큼) — 밑은 흙빛이 조금 돈다
      float shade = texture2D(uNatCanopy, (g - uNatCanopyBounds.xy) * uNatCanopyBounds.zw).r;
      diffuseColor.rgb *= 1. - NAT_SHADE * shade;
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.02, .90, .70), .45 * shade);
    }
  #endif
  #ifdef NAT_BLADES
    // 풀포기 · 낙엽: 인스턴스 색 위에 밑은 어둡게(땅에 붙은 쪽)
    diffuseColor.rgb *= mix(.55, 1.05, clamp(vNatLocal.y * 4.5, 0., 1.));
  #endif
`;
// 잎 · 풀 면은 숨은 결을 조금 드러낸다: 매끈한 둥근 면에 실제 깎인 면(흔든 꼭짓점)을 조금 섞는다.
const NORMAL = `
  #if defined(NAT_BLADES) && defined(DOUBLE_SIDED)
    normal *= faceDirection;   // 잎 뒷면도 위를 보는 법선 그대로(뒤집으면 잎 절반이 까맣다)
  #endif
  #ifdef NAT_BUMP
    {
      // 잎 결: 잎 뭉치 높이(소음)로 법선을 흔든다(three 의 perturbNormalArb 와 같은 식). 멀면 흐리게.
      float natFade = 1. - smoothstep(22., 70., distance(vNatWorld, cameraPosition));
      // 높이는 사인 겹(매끈해서 미분이 칸 무늬를 안 만든다)을 소음으로 비틀어 골프공처럼 고르지 않게. 비스듬히 보는 가장자리는 뺀다(점무늬).
      vec2 natWarp = vec2(natN(vNatWorld * .55), natN(vNatWorld * .55 + 19.)) - .5;
      vec3 natP = vNatWorld * 2.3 + vec3(natWarp.x, natWarp.y, -natWarp.x) * 4.5;
      float natH = (sin(dot(natP, vec3(1.7, 1.1, -.8))) * sin(dot(natP, vec3(-.9, 1.6, 1.3))) + .45 * sin(dot(natP, vec3(2.9, -2.2, 1.9)))) * (.3 + 1.4 * natN(vNatWorld * 1.1 + 7.));
      natFade *= smoothstep(.15, .5, abs(dot(normal, normalize(vViewPosition))));
      vec3 natSx = dFdx(-vViewPosition), natSy = dFdy(-vViewPosition);
      vec3 natR1 = cross(natSy, normal), natR2 = cross(normal, natSx);
      float natDet = dot(natSx, natR1);
      vec3 natGrad = sign(natDet) * (dFdx(natH) * natR1 + dFdy(natH) * natR2);
      normal = normalize(abs(natDet) * normal - natGrad * (NAT_BUMP * natFade));
    }
  #endif
  #ifdef NAT_FACETS
    {
      vec3 natFlat = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
      normal = normalize(mix(normal, natFlat * (dot(natFlat, normal) < 0. ? -1. : 1.), NAT_FACETS));
    }
  #endif
`;
const LIGHT = `
  #ifdef NAT_FOLIAGE
    #if NUM_DIR_LIGHTS > 0
      {
        // 해(달)를 등진 잎 가장자리로 빛이 스민다
        vec3 natL = directionalLights[0].direction;
        float natBack = pow(clamp(dot(-geometryViewDir, natL), 0., 1.), 3.);
        float natRim = pow(1. - clamp(dot(geometryNormal, geometryViewDir), 0., 1.), 2.);
        float natWrap = clamp(dot(geometryNormal, natL) * .5 + .5, 0., 1.);
        reflectedLight.indirectDiffuse += material.diffuseColor * directionalLights[0].color * vec3(1.0, 1.08, .55)
          * (RECIPROCAL_PI * (.9 * natBack * (.3 + natRim) + .22 * natWrap * natRim));
      }
    #endif
  #endif
  #if defined(NAT_NIGHT_GLOW) && defined(CAMPUS_LAMP_MAP)
    {
      // 가로등 빛 지도(lamps.js)를 높이 창만 넓혀 다시 읽는다: 수관은 노면보다 3 ~ 10 m 위라 밤 재질의 웅덩이 창 밖이다
      vec4 natLs = texture2D(uLampMap, (vNatWorld.xz - uLampBounds.xy) * uLampBounds.zw);
      vec2 natFloors = uLampHeight.x + uLampHeight.y * natLs.ga / max(natLs.rb, vec2(1. / 255.));
      vec2 natAbove = vNatWorld.y - natFloors;
      vec2 natWin = smoothstep(vec2(-2.), vec2(.5), natAbove) * (1. - smoothstep(vec2(8.5), vec2(12.5), natAbove));
      float natPool = min(1., dot(natLs.rb, natWin));
      vec3 natWn = inverseTransformDirection(geometryNormal, viewMatrix);
      vec3 natWarm = vec3(1., .47, .18);
      #ifdef NAT_FOLIAGE
        float natDapple = smoothstep(.40, .78, natN(vNatWorld * 1.25 + 4.));
        float natSide = .30 + .70 * clamp(.55 - .65 * natWn.y, 0., 1.);
        reflectedLight.indirectDiffuse += material.diffuseColor * natWarm * (NAT_NIGHT_GLOW * natPool * natSide * (.25 + .75 * natDapple));
      #endif
      #ifdef NAT_BLADES
        float natTip = smoothstep(.05, .28, vNatLocal.y);
        reflectedLight.indirectDiffuse += material.diffuseColor * natWarm * (NAT_NIGHT_GLOW * natPool * natTip);
      #endif
    }
  #endif
`;

function nightSafeKey(material, tag) {
  const oldKey = material.customProgramCacheKey();
  material.customProgramCacheKey = () => oldKey + tag;
}

export function applyNatureLook(THREE, { level: id, scenery, trees, shrubs, areas = [], obstacles = [], terrain, W }) {
  const level = NATURE_LEVELS[id] || 0, M = 1 / W;
  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  const meshes = new Map(); scenery.group.traverse(o => { if (o.isMesh && o.name && !meshes.has(o.name)) meshes.set(o.name, o); });
  const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)'); } catch { return null; } })();

  // ── 나무 밑 그늘 지도(미터, 1.5 m 칸). 숨긴 나무는 빼고 다시 굽는다.
  const b = scenery.bounds, minX = b.min.x * M, minZ = b.min.z * M, spanX = (b.max.x - b.min.x) * M, spanZ = (b.max.z - b.min.z) * M;
  const cw = Math.min(1024, Math.ceil(spanX / 1.5)), ch = Math.min(1024, Math.ceil(spanZ / 1.5));
  const canopyPixels = new Uint8Array(cw * ch);
  const canopy = new THREE.DataTexture(canopyPixels, cw, ch, THREE.RedFormat, THREE.UnsignedByteType);
  canopy.name = 'nature-canopy-shade'; canopy.magFilter = THREE.LinearFilter; canopy.minFilter = THREE.LinearFilter; canopy.generateMipmaps = false;
  owned.textures.add(canopy);
  function bakeCanopy() {
    canopyPixels.fill(0);
    for (const t of trees) {
      if (t.hidden) continue;
      const R = Math.max(1.2, t.crown * .95), x0 = Math.max(0, Math.floor((t.x - R - minX) / spanX * cw)), x1 = Math.min(cw - 1, Math.ceil((t.x + R - minX) / spanX * cw));
      const z0 = Math.max(0, Math.floor((t.z - R - minZ) / spanZ * ch)), z1 = Math.min(ch - 1, Math.ceil((t.z + R - minZ) / spanZ * ch));
      for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) {
        const px = minX + (i + .5) / cw * spanX, pz = minZ + (j + .5) / ch * spanZ, d = Math.hypot(px - t.x, pz - t.z) / R;
        const v = Math.round(255 * Math.max(0, Math.min(1, (1.1 - d) / .85)) ** 1.4);
        const k = j * cw + i; if (v > canopyPixels[k]) canopyPixels[k] = Math.min(255, canopyPixels[k] * .35 + v);
      }
    }
    canopy.needsUpdate = true;
  }
  bakeCanopy();
  // 소음 그림: 16 칸이 이어지는 값 소음 + 32 칸 겹(0.35), 대비를 조금 늘린다.
  const noisePixels = new Uint8Array(128 * 128);
  {
    const h = (i, j, s) => { let v = Math.imul(i + 31 * s, 374761393) ^ Math.imul(j + 17 * s, 668265263); v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
    const vn = (x, y, cells, s) => { const u = x * cells / 128, v = y * cells / 128, i = Math.floor(u), j = Math.floor(v), fx = u - i, fy = v - j, a = fx * fx * (3 - 2 * fx), c = fy * fy * (3 - 2 * fy);
      const I = (i + 1) % cells, J = (j + 1) % cells; return (1 - c) * ((1 - a) * h(i, j, s) + a * h(I, j, s)) + c * ((1 - a) * h(i, J, s) + a * h(I, J, s)); };
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const v = (vn(x, y, 16, 1) * .65 + vn(x, y, 32, 2) * .35 - .5) * 1.7 + .5;
      noisePixels[y * 128 + x] = Math.round(255 * Math.max(0, Math.min(1, v)));
    }
  }
  // 3D 소음용 칸 값(64², R = 값, G = (x+37, y+17) 칸의 값 — natN 이 z 한 칸 위를 같은 번에 읽는다)
  const cellPixels = new Uint8Array(64 * 64 * 2);
  {
    let r = 4099; const v = new Uint8Array(64 * 64); for (let i = 0; i < v.length; i++) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; v[i] = r >>> 24; }
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { cellPixels[(y * 64 + x) * 2] = v[y * 64 + x]; cellPixels[(y * 64 + x) * 2 + 1] = v[((y + 17) % 64) * 64 + (x + 37) % 64]; }
  }
  const cells = new THREE.DataTexture(cellPixels, 64, 64, THREE.RGFormat, THREE.UnsignedByteType);
  cells.name = 'nature-noise-cells'; cells.wrapS = cells.wrapT = THREE.RepeatWrapping; cells.magFilter = cells.minFilter = THREE.LinearFilter; cells.generateMipmaps = false; cells.needsUpdate = true;
  owned.textures.add(cells);
  const noise = new THREE.DataTexture(noisePixels, 128, 128, THREE.RedFormat, THREE.UnsignedByteType);
  noise.name = 'nature-value-noise'; noise.wrapS = noise.wrapT = THREE.RepeatWrapping; noise.magFilter = THREE.LinearFilter; noise.minFilter = THREE.LinearMipmapLinearFilter; noise.generateMipmaps = true; noise.needsUpdate = true;
  owned.textures.add(noise);
  const uniforms = {
    uNatNoise: { value: noise },
    uNatCells: { value: cells },
    uNatTime: { value: 0 },
    uNatCanopy: { value: canopy },
    uNatCanopyBounds: { value: new THREE.Vector4(minX, minZ, 1 / spanX, 1 / spanZ) },
  };

  // ── 재질에 결을 얹는다(defines 로 종류를 고른다). 밤 재질은 이 위에 감싸 얹는다(이 키를 이어 받는다).
  const patched = new WeakSet();
  function patch(material, defines, { smoothSphere = false } = {}) {
    if (!material || patched.has(material)) return material;
    patched.add(material);
    material.defines = { ...(material.defines || {}), ...defines };
    const oldCompile = material.onBeforeCompile;
    nightSafeKey(material, '/nature-' + id + '-' + Object.keys(defines).join('.'));
    material.onBeforeCompile = function (shader, renderer) {
      oldCompile?.call(this, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + HEAD + NOISE_VERTEX)
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (smoothSphere ? 'objectNormal = normalize(position);\n' : ''))
        .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERTEX);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + HEAD + NOISE + 'uniform sampler2D uNatCanopy;\nuniform vec4 uNatCanopyBounds;\n')
        .replace('#include <color_fragment>', '#include <color_fragment>\n' + COLOR)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + NORMAL)
        .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n' + LIGHT);
    };
    material.needsUpdate = true;
    return material;
  }
  // 그림자에도 같은 모양(흔든 꼭짓점)을 쓴다 — 안 쓰면 안으로 들어간 면이 제 그림자에 덮여 얼룩진다.
  function depthFor(amp) {
    const defines = { NAT_LUMPY: f(amp) };
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    m.defines = { ...defines };
    m.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + HEAD + NOISE_VERTEX).replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERTEX);
    };
    m.customProgramCacheKey = () => 'nature-depth-' + Object.entries(defines).join('.');
    owned.materials.add(m); return m;
  }
  const own = (mesh, extra = {}) => { const m = mesh.material.clone(); owned.materials.add(m); mesh.material = m; Object.assign(m, extra); return m; };
  const sphereGeometry = detail => { const g = new THREE.IcosahedronGeometry(1, detail); g.computeBoundingSphere(); g.boundingSphere.radius *= 1.35; owned.geometries.add(g); return g; };
  const f = v => v.toFixed(3);

  const stats = { level: id, patched: [], trees: trees.length, shrubs: shrubs.length, clumps: 0, tufts: 0, leaves: 0, addedTriangles: 0 };
  const lumpy = level >= 2, windy = level >= 3;
  const foliage = (amp, wind) => ({ NAT_FOLIAGE: '', NAT_AO_LOW: f(.5), NAT_BUMP: f(.07),
    ...(lumpy ? { NAT_LUMPY: f(amp), NAT_FACETS: f(.12) } : {}),
    ...(windy ? { NAT_WIND: f(wind), NAT_WIND_LIFT: f(.5), NAT_WIND_BASE: f(.5), NAT_FLUTTER: f(1), NAT_NIGHT_GLOW: f(4.5) } : {}) });

  const crowns = meshes.get('natural-tree-crowns'), lobes = meshes.get('varied-tree-crown-lobes'), shrubMesh = meshes.get('rounded-low-planting-beds');
  const trunks = meshes.get('natural-tree-trunks');
  const added = (mesh, before) => { const g = mesh.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; stats.addedTriangles += (n - before) * mesh.count; };
  const triCount = g => (g.index ? g.index.count : g.attributes.position.count) / 3;
  if (crowns) {
    const before = triCount(crowns.geometry);
    if (lumpy) { crowns.geometry = sphereGeometry(2); added(crowns, before); }
    patch(own(crowns), foliage(.30, .035), { smoothSphere: true }); stats.patched.push(crowns.name);
    if (lumpy) crowns.customDepthMaterial = depthFor(.30);
    crowns.computeBoundingSphere();
  }
  if (lobes) {
    const before = triCount(lobes.geometry);
    if (lumpy) { lobes.geometry = sphereGeometry(1); added(lobes, before); }
    patch(own(lobes), foliage(.26, .04), { smoothSphere: true }); stats.patched.push(lobes.name);
    if (lumpy) lobes.customDepthMaterial = depthFor(.26);
    lobes.computeBoundingSphere();
  }
  if (shrubMesh) {
    const before = triCount(shrubMesh.geometry);
    if (lumpy) { shrubMesh.geometry = sphereGeometry(1); added(shrubMesh, before); }
    patch(own(shrubMesh), { ...foliage(.22, .02), NAT_AO_LOW: f(.62) }, { smoothSphere: true }); stats.patched.push(shrubMesh.name);
    shrubMesh.computeBoundingSphere();
  }
  if (trunks) { patch(own(trunks), { NAT_TRUNK: '' }); stats.patched.push(trunks.name); }
  for (const [name, defines] of [
    ['mapped-landcover-grass', { NAT_GRASS: '', NAT_STRIPES: '', NAT_SHADE: f(.42) }],
    ['mapped-landcover-park', { NAT_GRASS: '', NAT_SHADE: f(.42) }],
    ['mapped-landcover-wood', { NAT_GROUND: '', NAT_SHADE: f(.30) }],
    ['continuous-estimated-terrain', { NAT_GROUND: '', NAT_SHADE: f(.36) }],
  ]) { const mesh = meshes.get(name); if (!mesh) continue; patch(own(mesh), defines); stats.patched.push(name); }

  // ── b: 길 둘레 나무마다 잎덩이 하나를 수관 둘레에 더한다(수관 인스턴스 행렬에서 자리를 읽는다 — 나무 i ↔ 수관 i). 먼 나무는 안 더한다(삼각형 아끼기).
  const extra = [];   // { mesh, owners(나무 기록) 또는 null, xs, zs (미터), base 행렬, hidden }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), matrix = new THREE.Matrix4(), dummy = new THREE.Object3D();
  let seed = 92821; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  function buildClumps(keep) {
    if (!crowns || crowns.count !== trees.length) return;
    const records = [], owners = [], pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    for (let i = 0; i < trees.length; i++) {
      crowns.getMatrixAt(i, matrix); matrix.decompose(pos, quat, scl);
      if (scl.x === 0 || Math.hypot(pos.x * M - trees[i].x, pos.z * M - trees[i].z) > 1 || !keep(trees[i])) continue;   // 병원 안(이미 숨김) · 순서가 안 맞음 · 먼 나무는 건너뜀
      for (let k = 0; k < 1; k++) {
        const a = rnd() * Math.PI * 2, out = .55 + rnd() * .25, s = .42 + rnd() * .16;
        records.push([pos.x + Math.cos(a) * scl.x * out, pos.y + (rnd() * .7 - .35) * scl.y, pos.z + Math.sin(a) * scl.z * out, scl.x * s, scl.y * (.5 + rnd() * .15), scl.z * s, rnd() * 6]);
        owners.push(trees[i]);
      }
    }
    if (!records.length) return;
    const geometry = sphereGeometry(1), material = patch(own({ material: lobes?.material || crowns.material }), foliage(.30, .045), { smoothSphere: true });
    const mesh = new THREE.InstancedMesh(geometry, material, records.length); mesh.name = 'nature-crown-clumps'; mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = depthFor(.30);
    records.forEach(([x, y, z, sx, sy, sz, r], i) => { dummy.position.set(x, y, z); dummy.rotation.set(0, r, 0); dummy.scale.set(sx, sy, sz); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); scenery.group.add(mesh); mesh.updateMatrixWorld(true);
    extra.push({ mesh, owners, base: mesh.instanceMatrix.array.slice() });
    stats.clumps = records.length; stats.addedTriangles += records.length * triCount(geometry);
  }

  // ── b: 풀포기 · 낙엽 — 길(통로) 둘레 띠 안의 잔디 · 공원 · 숲에만. 길이 어디인지는 처음 숨길 때(hide) 받는 판정으로 안다.
  const greenAreas = areas.filter(a => a.kind === 'grass' || a.kind === 'park' || a.kind === 'wood').map(a => {
    const rings = a.rings.map(r => r.map(p => ({ x: p.x * M, z: p.z * M })));
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity; for (const p of rings[0]) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    return { kind: a.kind, rings, x0, x1, z0, z1 };
  });
  const inRing = (x, z, ring) => { let yes = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], c = ring[j]; if ((a.z > z) !== (c.z > z) && x < (c.x - a.x) * (z - a.z) / (c.z - a.z) + a.x) yes = !yes; } return yes; };
  const greenAt = (x, z) => greenAreas.find(a => x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1 && inRing(x, z, a.rings[0]) && !a.rings.slice(1).some(r => inRing(x, z, r)));
  const boxes = obstacles.map(o => ({ ...o, c: Math.cos(o.rotation || 0), s: Math.sin(o.rotation || 0) }));
  const inBuilding = (x, z) => boxes.some(o => { const dx = x - o.x, dz = z - o.z; return Math.abs(o.c * dx - o.s * dz) <= o.w / 2 + .4 && Math.abs(o.s * dx + o.c * dz) <= o.d / 2 + .4; });
  const groundY = (x, z) => terrain.heightAt(x * W, z * W);   // 월드 단위

  function tuftGeometry() {
    // 풀포기 하나(미터): 가늘게 휜 잎 네 장, 잎마다 세 삼각형(밑 · 허리 · 끝). 법선은 위로(땅처럼 빛을 받게 — c 는 옆으로 조금 섞어 전조등을 받는다).
    const pos = [], nrm = [], idx = [];
    let r = 7; const rn = () => { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; return r / 4294967296; };
    const side = windy ? .45 : 0;
    for (let k = 0; k < 4; k++) {
      const a = rn() * Math.PI * 2, h = .16 + rn() * .2, w = .024 + rn() * .014, lean = .25 + rn() * .45, ox = (rn() - .5) * .12, oz = (rn() - .5) * .12;
      const dx = Math.cos(a), dz = Math.sin(a), px = -dz, pz = dx, base = pos.length / 3;
      const n = new THREE.Vector3(dx * side, 1, dz * side).normalize();
      for (const [t, half] of [[0, w], [.5, w * .7], [1, 0]]) {
        const bend = lean * h * t * t;
        if (half) pos.push(ox + dx * bend - px * half, h * t, oz + dz * bend - pz * half, ox + dx * bend + px * half, h * t, oz + dz * bend + pz * half);
        else pos.push(ox + dx * bend, h * t, oz + dz * bend);
        for (let v = half ? 2 : 1; v > 0; v--) nrm.push(n.x, n.y, n.z);
      }
      idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2, base + 2, base + 3, base + 4);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setIndex(idx);
    g.computeBoundingSphere(); owned.geometries.add(g); return g;
  }
  function leafGeometry() {
    // 낙엽 한 장(미터): 마름모꼴 납작한 두 삼각형, 가운데가 조금 솟는다.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-.05, .004, 0, 0, .012, -.028, .05, .004, 0, 0, .012, .03], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setIndex([0, 3, 1, 1, 3, 2]);
    g.computeBoundingSphere(); owned.geometries.add(g); return g;
  }
  let groundCover = null;
  function placeGroundCover(test) {
    // 길 둘레 칸(4 m): 판정이 참인 칸에서 16 m 안. 그 안의 녹지에 풀포기를 뿌리고, 녹지 경계(포장과 만나는 선)는 더 촘촘히.
    const cell = 4, gx = Math.ceil(spanX / cell), gz = Math.ceil(spanZ / cell), road = new Uint8Array(gx * gz), near = new Uint8Array(gx * gz);
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) if (test(minX + (i + .5) * cell, minZ + (j + .5) * cell)) road[j * gx + i] = 1;
    // near = 길 칸에서 몇 칸 떨어졌나(1 ~ 4, 0 = 멀다). 길 바로 옆일수록 풀포기를 촘촘히(카메라에 보이는 띠).
    const reach = 4;
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) if (road[j * gx + i]) for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
      const a = i + di, c = j + dj, k = c * gx + a, d = Math.max(Math.abs(di), Math.abs(dj));
      if (a >= 0 && c >= 0 && a < gx && c < gz && d > 0 && (!near[k] || d < near[k])) near[k] = d;
    }
    const nearAt = (x, z) => { const i = Math.floor((x - minX) / cell), j = Math.floor((z - minZ) / cell); return i >= 0 && j >= 0 && i < gx && j < gz && (near[j * gx + i] > 0 || road[j * gx + i] === 1); };
    const tufts = [], leaves = [];
    const tryTuft = (x, z) => {
      if (!nearAt(x, z) || test(x, z) || inBuilding(x, z)) return;
      const area = greenAt(x, z); if (!area) return;
      tufts.push([x, z, .75 + rnd() * .6, rnd() * Math.PI * 2, area.kind === 'wood' ? 1 : 0]);
    };
    const perCell = [0, 6, 4, 1, 0];
    for (let j = 0; j < gz; j++) for (let i = 0; i < gx; i++) if (near[j * gx + i] || road[j * gx + i]) {
      for (let k = 0, n = road[j * gx + i] ? 6 : perCell[near[j * gx + i]]; k < n; k++) tryTuft(minX + (i + rnd()) * cell, minZ + (j + rnd()) * cell);
    }
    // 녹지 경계: 0.6 m 마다 경계 위 · 안쪽으로 풀포기(잔디와 길 사이의 칼 같은 선을 흐린다)
    for (const a of greenAreas) {
      if (a.kind === 'wood') continue;
      const ring = a.rings[0];
      for (let n = 0; n < ring.length; n++) {
        const p = ring[n], q = ring[(n + 1) % ring.length], len = Math.hypot(q.x - p.x, q.z - p.z);
        if (len < .2 || !(nearAt(p.x, p.z) || nearAt(q.x, q.z))) continue;
        for (let d = rnd() * .6; d < len; d += .6) {
          const t = d / len, x = p.x + (q.x - p.x) * t, z = p.z + (q.z - p.z) * t, off = (rnd() - .3) * .5;
          const nx = -(q.z - p.z) / len, nz = (q.x - p.x) / len;
          const px = x + nx * off, pz = z + nz * off;
          if (!nearAt(px, pz) || test(px, pz) || inBuilding(px, pz)) continue;
          tufts.push([px, pz, .6 + rnd() * .5, rnd() * Math.PI * 2, 0]);
        }
      }
    }
    buildClumps(t => !t.hidden && nearAt(t.x, t.z));
    // 낙엽: 길 둘레 나무 밑(수관 반지름 안)에 나무마다 열여덟 장
    for (const t of trees) {
      if (t.hidden || !nearAt(t.x, t.z)) continue;
      for (let k = 0; k < 18; k++) {
        const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * t.crown * 1.05, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        if (test(x, z) || inBuilding(x, z)) continue;
        leaves.push([x, z, .8 + rnd() * .7, rnd() * Math.PI * 2]);
      }
    }
    const colour = new THREE.Color();
    const build = (name, geometry, list, colourOf, defines, scaleY = 1) => {
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .92, side: THREE.DoubleSide }); owned.materials.add(material);
      patch(material, defines);
      const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length)); mesh.name = name; mesh.receiveShadow = true; mesh.castShadow = false;
      list.forEach(([x, z, s, r, kind], i) => {
        dummy.position.set(x * W, groundY(x, z) + .004, z * W); dummy.rotation.set(0, r, 0); dummy.scale.set(s * W, s * W * scaleY, s * W); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, colourOf(colour, kind));
      });
      if (!list.length) mesh.count = 0;
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere(); scenery.group.add(mesh); mesh.updateMatrixWorld(true);
      extra.push({ mesh, owners: null, xs: list.map(v => v[0]), zs: list.map(v => v[1]), base: mesh.instanceMatrix.array.slice(), hidden: new Uint8Array(list.length) });
      stats.addedTriangles += list.length * triCount(geometry);
      return mesh;
    };
    const grassTone = (c, kind) => c.setRGB(kind ? .09 : .11, kind ? .13 : .16, kind ? .05 : .05).multiplyScalar(.8 + rnd() * .35).lerp(new THREE.Color(.18, .18, .07), rnd() * .3);   // 잔디 그림(ground-materials grass)의 빛깔 둘레 — 더 밝으면 밤에 볏짚처럼 튄다(11-24 그림)
    const leafTone = c => c.setRGB(.62, .44, .24).lerp(new THREE.Color(.70, .60, .30), rnd()).multiplyScalar(.75 + rnd() * .5);   // 셰이더가 땅에 붙은 쪽을 어둡게 하므로 조금 밝게
    const windTuft = windy ? { NAT_WIND: f(.04), NAT_WIND_LIFT: f(4), NAT_WIND_BASE: f(0), NAT_FLUTTER: f(0), NAT_NIGHT_GLOW: f(.8) } : {};
    groundCover = {
      tufts: build('nature-roadside-tufts', tuftGeometry(), tufts, grassTone, { NAT_BLADES: '', NAT_FADE: f(46), ...windTuft }),
      leaves: build('nature-fallen-leaves', leafGeometry(), leaves, leafTone, { NAT_BLADES: '', NAT_FADE: f(30) }),
    };
    stats.tufts = tufts.length; stats.leaves = leaves.length;
  }

  function sync(test) {
    for (const e of extra) {
      let changed = false;
      if (e.owners) {
        for (let i = 0; i < e.owners.length; i++) {
          const want = e.owners[i].hidden, has = e.mesh.instanceMatrix.array[i * 16] === 0 && e.mesh.instanceMatrix.array[i * 16 + 5] === 0;
          if (want === has) continue;
          if (want) e.mesh.setMatrixAt(i, zero); else e.mesh.instanceMatrix.array.set(e.base.subarray(i * 16, i * 16 + 16), i * 16);
          changed = true;
        }
      } else if (test) {
        for (let i = 0; i < e.xs.length; i++) if (!e.hidden[i] && test(e.xs[i], e.zs[i])) { e.mesh.setMatrixAt(i, zero); e.hidden[i] = 1; changed = true; }
      } else if (e.hidden.some(Boolean)) { e.mesh.instanceMatrix.array.set(e.base); e.hidden.fill(0); changed = true; }
      if (changed) { e.mesh.instanceMatrix.needsUpdate = true; e.mesh.computeBoundingSphere(); }
    }
    bakeCanopy();
  }

  const motion = () => !(reduceMotion?.matches);
  return {
    id, stats,
    // campus.hideGroundInstances 뒤에 불린다(나무 기록의 hidden 이 이미 정해져 있다)
    hide(test) { if (lumpy && !groundCover) { const t0 = performance.now(); placeGroundCover(test); stats.placeMs = Math.round(performance.now() - t0); } sync(test); },
    restore() { sync(null); },
    update(time) { if (windy && motion()) stats.windTime = uniforms.uNatTime.value = time % 3600; },   // stats.windTime: 검증이 바람이 도는지(움직임 줄이기면 멈추는지) 읽는다
    dispose() {
      for (const e of extra) { e.mesh.removeFromParent(); e.mesh.dispose(); }
      for (const g of owned.geometries) g.dispose(); for (const m of owned.materials) m.dispose(); for (const t of owned.textures) t.dispose();
    },
  };
}
