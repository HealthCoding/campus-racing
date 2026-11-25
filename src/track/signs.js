// 길가 장소 표지판 — 이름 붙은 코너 · 구간(course-b.sections.js) 앞에 남색 판 · 흰 글씨(캠퍼스 안내판 느낌). 사용자 2026-11-23 '장소 이름 표시 = A 길가 표지판'.
//   const signs = createCourseSigns(THREE, { sections, course, parts, campus, pit, night });  scene.add(signs.group)
// 땅 위: 방호벽 바깥에 두 다리로 선 판(판의 안쪽 끝이 길 가장자리에서 0.8 m 밖). 공중 길(데크): 방호벽 위 기둥에서 길 위로 팔을 뻗어 판을 단다(머리 위 5.1 m).
// 자리는 가로등(lamps.js 의 placeNightLamps) · 건물 · 다른 층의 길 · 피트레인 · 점프대 둘레 · 나무 · 시설물을 피해 sign.s 에서 조금씩 앞뒤로, 그래도 안 되면 반대쪽으로 옮긴다.
// 여섯 판과 골조를 글자 지도 하나에 묶는다. 밤에는 글씨와 남색 반사면을 밝힌다.
// 글꼴: "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif 700(시스템 글꼴 — 외부 요청 없음).
import { createLocator } from './track.js';
import { placeNightLamps } from '../world/lamps.js';

export const SIGN = { width: 5.0, height: 1.56, groundLift: 1.6, inset: 0.8, overheadClear: 5.1, yaw: 0.21 };
const FONT = '"Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
const SHIFTS = [0, -2, -4, -6, -8, -10, -12, -14, 2, 4, 6, 8];

function insideBox(x, z, b, margin) {
  const dx = x - b.x, dz = z - b.z, c = Math.cos(b.rotation), s = Math.sin(b.rotation);
  return Math.abs(c * dx - s * dz) <= b.w / 2 + margin && Math.abs(s * dx + c * dz) <= b.d / 2 + margin;
}

// 순수 계산(Node 시험에서도 쓴다): 표지판마다 { id, name, s, side, mount, shift, origin, out, along, half, base }
export function placeCourseSigns({ sections, course, parts, campus, pit = null, locator = null, lamps = null }) {
  const loc = locator || createLocator(course), found = [];
  const lampList = lamps || placeNightLamps({ course, parts, campus, pit }).lamps;
  const trees = (campus.trees || []).filter(t => !t.hidden), furniture = (campus.furniture || []).filter(f => !f.hidden);
  const W = SIGN.width, placed = [], rejected = [];
  function attempt(sec, s, side, overheadOnly) {
    const sideName = side > 0 ? 'right' : 'left';
    if (parts.openAt(s, sideName)) return null;   // 난간 없는 쪽(떨어지는 가장자리)에는 안 세운다
    if (parts.ramps.some(r => s >= r.at - 4 && s <= r.at + r.length + 14)) return null;   // 점프대 · 날아가는 길 근처는 비운다
    // 같은 쪽 가로등과 겹치지 않게. 땅 위 판은 바로 앞(12 m 안)의 가로등 기둥이 20~30 m 에서 읽는 글씨를 가리므로 그 구간도 비운다.
    const ahead = l => ((s - l.s) % parts.length + parts.length) % parts.length;   // 표지판보다 몇 m 앞(다가오는 쪽)에 선 등인가
    if (lampList.some(l => l.side === side && (Math.abs(l.s - s) < 2.2 || (!overheadOnly && parts.deckLift(s) <= 0.2 && ahead(l) < 12)))) return null;
    const frame = parts.pointAt(s), half = side > 0 ? frame.right : frame.left, deck = parts.deckLift(s);
    const fx = Math.sin(frame.heading), fz = Math.cos(frame.heading), rx = -fz, rz = fx;   // 앞 · 오른쪽(x 동, z 남)
    const ox = side * rx, oz = side * rz;                                                   // 바깥쪽
    const mount = deck > 0.2 || overheadOnly ? 'overhead' : 'ground';
    let origin, ax, az, samples;
    if (mount === 'ground') {
      // 판의 가로축 a: 바깥쪽에서 길 쪽으로 yaw 만큼 돌려 앞면이 다가오는 차를 조금 더 보게
      const c = Math.cos(SIGN.yaw), sn = Math.sin(SIGN.yaw);
      ax = ox * c - fx * sn; az = oz * c - fz * sn;
      origin = { x: frame.x + ox * (half + SIGN.inset), z: frame.z + oz * (half + SIGN.inset) };
      samples = [0, 0.14, 0.5, 0.86, 1].map(t => ({ x: origin.x + ax * W * t, z: origin.z + az * W * t }));
      if (samples.some(p => loc.cellsAt(p.x, p.z, 0.7, found) > 0)) return null;           // 어느 층의 길 위도 아니게(방호벽 자리 포함)
      if (samples.some(p => parts.clearAt(p.x, p.z))) return null;                         // 공중 구간 둘레 · 점프해 날아가는 길
    } else {
      // 머리 위: 방호벽 위 기둥(바깥 +0.31 m)에서 길 쪽으로 판을 단다. 판은 길을 가로지른다(돌리지 않음).
      ax = -ox; az = -oz;
      origin = { x: frame.x + ox * (half + 0.31), z: frame.z + oz * (half + 0.31) };
      samples = [0, 0.5, 1].map(t => ({ x: origin.x + ax * (0.4 + W * t), z: origin.z + az * (0.4 + W * t) })).concat([origin]);
    }
    if (samples.some(p => parts.othersAt(p.x, p.z, s, 1.0).length)) return null;           // 다른 구간의 길(위아래 층) 위 · 옆이 아니게
    if (pit && samples.some(p => pit.contains(p.x, p.z, 0.7) || pit.beyond(p.x, p.z, 0.7))) return null;
    if (campus.obstacles.some(b => samples.some(p => insideBox(p.x, p.z, b, 0.6)))) return null;
    if (mount === 'ground') {
      if (furniture.some(f => samples.some(p => Math.hypot(p.x - f.x, p.z - f.z) < (f.kind === 'light' ? 1.6 : 1.0)))) return null;
      if (trees.some(t => samples.some(p => Math.hypot(p.x - t.x, p.z - t.z) < 0.5 + 0.35 * t.crown))) return null;
    }
    const base = mount === 'ground' ? null : deck > 0.2 ? campus.heightAt(frame.x, frame.z) + deck : campus.heightAt(origin.x, origin.z);   // 머리 위 판의 기둥 밑
    return { id: sec.id, name: sec.name, s, side: sideName, mount, origin, ax, az, fx, fz, half, deck, base };
  }
  for (const sec of sections) {
    if (!sec.sign) continue;
    const want = sec.sign.side === 'left' ? -1 : 1;
    let got = null;
    // 땅 위 두 다리 판(원하는 쪽 → 반대쪽) → 안 되면 머리 위 판(길 양옆이 다 막힌 곳 — 출발 직선처럼 피트레인과 다른 길 사이)
    for (const overheadOnly of [false, true]) {
      for (const side of [want, -want]) { for (const d of SHIFTS) { got = attempt(sec, ((sec.sign.s + d) % parts.length + parts.length) % parts.length, side, overheadOnly); if (got) { got.shift = d; break; } } if (got) break; }
      if (got) break;
    }
    if (got) placed.push(got); else rejected.push(sec.id);
  }
  return { signs: placed, rejected };
}

function atlas(names) {
  // 맨 아래 흰 칸은 정점 색으로 칠하는 금속 부품에 쓴다.
  const width = 640, row = 200, height = row * names.length + 16;
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const ink = c.getContext('2d');
  ink.fillStyle = '#fff'; ink.fillRect(0, 0, width, height);
  for (const [i, name] of names.entries()) {
    const top = row * i;
    const enamel = ink.createLinearGradient(0, top, 0, top + row);
    enamel.addColorStop(0, '#124980'); enamel.addColorStop(1, '#073562');
    ink.fillStyle = enamel; ink.fillRect(0, top, width, row);
    // 가장자리 금속과 겹치지 않는 짧은 반사띠. 작은 고정 핀은 빛을 내지 않는다.
    ink.fillStyle = '#e8c36b'; ink.fillRect(23, top + 14, 38, 5);
    for (const x of [17, width - 17]) for (const y of [26, row - 21]) {
      ink.beginPath(); ink.arc(x, top + y, 2.6, 0, 2 * Math.PI); ink.fillStyle = '#66849a'; ink.fill();
    }
    ink.font = `700 100px ${FONT}`;
    const measured = ink.measureText(name).width, margin = measured > 700 ? 24 : 41;
    const size = Math.min(106, 100 * (width - 2 * margin) / measured);
    ink.font = `700 ${size}px ${FONT}`; ink.textAlign = 'center';
    const glyph = ink.measureText(name);
    const baseline = top + row * 0.53 + (glyph.actualBoundingBoxAscent - glyph.actualBoundingBoxDescent) / 2;
    ink.fillStyle = '#f7f8f3'; ink.fillText(name, width / 2, baseline);
  }
  return { ink: c, height, row };
}

export function createCourseSigns(THREE, { sections, course, parts, campus, pit = null, night = false, lamps = null }) {
  const { signs, rejected } = placeCourseSigns({ sections, course, parts, campus, pit, lamps });
  const group = new THREE.Group(); group.name = 'course-signs';
  if (!signs.length) return { group, signs, rejected, dispose() {} };
  const A = atlas(signs.map(p => p.name));
  const map = new THREE.CanvasTexture(A.ink); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.67, metalness: 0.14 });
  // 색 지도를 한 번 읽어 흰 시트와 노란 반사띠를 가른다. 무광 골조는 앞면과 다른 정점 색을 쓴다.
  const reflective = night ? `
    if (vColor.r > 0.99) {
      vec3 c = diffuseColor.rgb;
      float ink = clamp((2.0 * c.r - c.b) * 1.035, 0.0, 1.0);
      vec3 sheet = mix(vec3(0.00806, 0.02197, 0.04843), vec3(0.35344), ink);
      totalEmissiveRadiance += mix(sheet, vec3(0.11760, 0.07793, 0.02602), smoothstep(0.10, 0.50, c.r - c.b));
    } else {
      totalEmissiveRadiance += mix(vec3(0.00347, 0.00578, 0.00880), vec3(0.01212, 0.02197, 0.03536), step(0.5, vMapUv.x));
    }` : 'totalEmissiveRadiance += 0.13 * diffuseColor.rgb * smoothstep(0.55, 0.88, diffuseColor.r);';
  material.customProgramCacheKey = () => night ? 'course-sign-night' : 'course-sign-day';
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n' + reflective);
  };
  const pos = [], uv = [], colors = [], index = [];
  const metal = new THREE.Color(0x83929b), socket = new THREE.Color(0x596771);
  const edge = new THREE.Color(0xa5acaf), front = new THREE.Color(0xffffff);
  const W = SIGN.width, H = SIGN.height;
  signs.forEach((p, row) => {
    let nx = -p.az, nz = p.ax;
    if (nx * p.fx + nz * p.fz > 0) { nx = -nx; nz = -nz; }
    const dir = Math.sign(p.ax * nz - p.az * nx);
    const overhead = p.mount === 'overhead', start = overhead ? 0.4 : 0;
    const cx = p.origin.x + p.ax * (start + W / 2), cz = p.origin.z + p.az * (start + W / 2);
    const legs = [-0.36 * W, 0.36 * W];
    const ground = legs.map(x => campus.heightAt(cx + nz * x, cz - nx * x));
    const y0 = overhead ? p.base + SIGN.overheadClear : Math.max(...ground) + SIGN.groundLift;
    // x 는 글을 읽는 쪽의 오른쪽, z 는 판 앞. 면마다 정점을 나눠 접힌 모서리의 법선을 살린다.
    function face(points, col, printed = false) {
      const base = pos.length / 3;
      for (const [x, y, z] of points) {
        pos.push(cx + nz * x + nx * z, y0 + y, cz - nx * x + nz * z);
        colors.push(col.r, col.g, col.b);
        if (printed) uv.push(x / W + 0.5, 1 - ((row + 1) * A.row - 3 - (A.row - 6) * y / H) / A.height);
        else uv.push(col === metal ? 0.75 : 0.25, 8 / A.height);
      }
      for (let i = 1; i < points.length - 1; i++) index.push(base, base + i, base + i + 1);
    }
    function plate(outline, zRear, zFront, col, printed = false) {
      const rear = outline.map(([x, y]) => [x, y, zRear]), nose = outline.map(([x, y]) => [x, y, zFront]);
      if (printed) {
        // 접어 두른 테두리(2.8 cm). 옆으로 스치는 빛도 받게 바깥과 안쪽의 깊이를 다르게 둔다.
        const inset = nose.map(([x, y, z]) => [x * (1 - 0.056 / W), y * (1 - 0.056 / H) + 0.028, z + 0.024]);
        face(inset, front, true);
        for (let i = 0; i < nose.length; i++) {
          const j = (i + 1) % nose.length; face([nose[i], nose[j], inset[j], inset[i]], col);
        }
      } else face(nose, col);
      face([...rear].reverse(), col);
      for (let i = 0; i < rear.length; i++) {
        const j = (i + 1) % rear.length; face([rear[i], rear[j], nose[j], nose[i]], col);
      }
    }
    function bar(x, y, width, height, z, depth, col) {
      const l = x - width / 2, r = x + width / 2, t = y + height;
      plate([[l, y], [r, y], [r, t], [l, t]], z - depth / 2, z + depth / 2, col);
    }
    function post(x, foot, top, z, radius) {
      // 기둥은 위로 조금 좁아진다. 팔각 강관의 면이 가로등을 서로 다르게 받는다.
      const ring = (y, r) => Array.from({ length: 8 }, (_, i) => {
        const a = (i + 0.5) * Math.PI / 4;
        return [x + r * Math.cos(a), y, z + r * Math.sin(a)];
      });
      const base = ring(foot, radius), cap = ring(top, radius * 0.85);
      for (let i = 0; i < 8; i++) {
        const j = (i + 1) % 8; face([base[i], cap[i], cap[j], base[j]], metal);
      }
      face(cap.reverse(), metal);
    }
    if (overhead) {
      const foot = -SIGN.overheadClear, mast = -dir * (W / 2 + start);
      const mastZ = -0.22, top = H + 0.12;
      post(mast, foot, top, mastZ, 0.139);
      bar(mast, foot - 0.02, 0.31, 0.21, mastZ, 0.30, socket);
      bar(mast, top - 0.67, 0.25, 0.15, mastZ, 0.26, socket);
      bar(mast + dir * (W + 0.16) / 2, top - 0.19, W + 0.16, 0.18, mastZ, 0.17, metal);
      // 팔뿌리의 삼각 보강판. 매다는 날개 두 개가 판 뒷면에 닿는다.
      const brace = [[mast, top - 0.95], [mast + dir * 1.1, top - 0.18], [mast, top - 0.18]];
      plate(dir > 0 ? brace : brace.reverse(), mastZ - 0.06, mastZ + 0.06, socket);
      for (const x of legs) bar(x, H * 0.68, 0.11, H * 0.32 + 0.07, -0.13, 0.15, socket);
    } else {
      legs.forEach((x, i) => {
        const foot = ground[i] - y0;
        post(x, foot - 0.08, H * 0.84, -0.18, 0.085);
        bar(x, foot - 0.08, 0.24, 0.21, -0.18, 0.24, socket);
      });
      for (const y of [0.24, H - 0.28]) bar(0, y, W - 0.35, 0.09, -0.105, 0.10, socket);
    }
    // 잘라 접은 알루미늄 판의 옆면과 뒤까지 하나의 외피로 잇는다.
    const l = -W / 2, r = W / 2, k = 0.085;
    plate([[l + k, 0], [r - k, 0], [r, k], [r, H - k], [r - k, H], [l + k, H], [l, H - k], [l, k]], -0.09, 0.015, edge, true);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(index);
  geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material); mesh.name = 'course-sign-faces';
  mesh.renderOrder = -0.5;
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  return { group, signs, rejected, dispose() { group.removeFromParent(); geo.dispose(); material.dispose(); map.dispose(); } };
}
