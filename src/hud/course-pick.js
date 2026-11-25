// 코스 고르기 화면(2026-11-25 사용자가 시안에서 고른 '가 하늘에서' — 시안/코스고르기_고르기.html, 원본 시안/코스고르기_src/mock.js).
//   게임의 진짜 3D 캠퍼스를 위에서 비스듬히 내려다보고, 고른 코스의 선이 빛난다. 글자 층의 틀 · 글꼴 · 단추는 차 고르기 화면(hud.css 의 .hud-g-*)을 그대로 쓴다.
//   ← → (또는 좌우 단추 · 옆으로 밀기)로 넘기고, Enter · Space(이 코스로)로 고르고, Esc(뒤로)로 돌아간다. 고르면 부르는 쪽이 그 코스의 주소로 다시 연다(main.js).
//   이 파일은 처음 열 때 불러온다(첫 방문에 받는 양을 늘리지 않게). 늦게 받는 코스(D)의 자료도 처음 열 때 받는다(courses.js 의 loadCourse).
//   코스의 선 높이 = 캠퍼스 땅 + 그 코스 부품의 띄움(공중 구간 · 점프대) — 지금 코스는 게임이 지은 parts, 다른 코스는 그 자료로 새로 지은 parts(그리기에만 쓴다).
//   화면이 열려 있는 동안은 지금 코스에만 있는 것(노면 · 방호벽 · 가로등과 그 빛 웅덩이 · 표지판 · 부품 · 피트 · 차)을 잠깐 감춘다 — 다른 코스를 볼 때 두 코스가 겹쳐 보이지 않게,
//     그리고 어느 코스를 넘겨 보든 같은 모습이게(지금 코스만 가로등 빛이 둘러 있으면 넘길 때 모양이 바뀐다). 닫으면 그대로 되돌린다.
//     다른 코스의 선은 길 위의 나무에 가리지 않게 실선도 늘 위에 그린다(그 코스의 길은 치워져 있지 않다).
//   움직임: 넘길 때 카메라가 바로 바뀐다(움직이는 연출이 없어 prefers-reduced-motion 에서도 같다).
import { createParts } from '../track/parts.js';
import { loadCourse } from '../track/courses.js';
import { lapText } from './hud.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const two = n => String(n).padStart(2, '0');
const OSM = '©&nbsp;<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
// 비스듬히 내려다보는 각도 · 세로 시야(°)(시안 그대로)
const PITCH = 58 * Math.PI / 180, FOV = 32;

// 타임어택 내 최고(3바퀴 합계 · 초): 그 코스의 유령 저장소(src/ghost.js — 'campus-kart:ghost:<코스>:<등급>[:<차>]:v<판>') 가운데 가장 빠른 것. 차는 가리지 않는다.
//   부품을 뺀 판(:flat) · 조정판으로 고친 판(:tuned)은 넣지 않는다. 저장소를 못 읽으면 null.
export function trialBestOf(courseId, { klass, version, storage } = {}) {
  if (storage === undefined) { try { storage = globalThis.localStorage; } catch { return null; } }
  const head = 'campus-kart:ghost:' + courseId + ':' + klass, tail = ':v' + version; let best = Infinity;
  try {
    for (let i = 0; i < (storage?.length ?? 0); i++) {
      const key = storage.key(i) || '';
      if (!key.startsWith(head) || !key.endsWith(tail)) continue;
      const mid = key.slice(head.length, key.length - tail.length);   // '' 또는 ':<차>'
      if (mid && (!/^:[^:]+$/.test(mid) || mid === ':flat' || mid === ':tuned')) continue;
      const t = JSON.parse(storage.getItem(key) || 'null')?.lapTime;
      if (Number.isFinite(t) && t > 0 && t < best) best = t;
    }
  } catch { return null; }
  return Number.isFinite(best) ? best : null;
}

// 1등(타임어택 표의 맨 위 · 초): 랭킹 서버가 있을 때만 묻는다(src/shared/rank-rules.js 의 GET /api/board). 30초 동안은 받은 값을 다시 쓴다. 못 받으면 null.
const tops = new Map();
export async function boardTopOf(api, courseId, { fetchFn = globalThis.fetch, timeout = 5000 } = {}) {
  if (!api || typeof fetchFn !== 'function') return null;
  const old = tops.get(courseId); if (old && Date.now() - old.at < 30000) return old.value;
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null, timer = setTimeout(() => ctrl?.abort(), timeout);
  try {
    const reply = await fetchFn(api + '/api/board?course=' + encodeURIComponent(courseId) + '&scope=all&limit=1', { signal: ctrl?.signal });
    const data = reply.ok ? await reply.json() : null, ms = data?.ok ? data.rows?.[0]?.lapMs : null;
    const value = Number.isFinite(ms) && ms > 0 ? ms / 1000 : null;
    tops.set(courseId, { at: Date.now(), value }); return value;
  } catch { return null; } finally { clearTimeout(timer); }
}

// root = #hud · stage = 게임의 무대(카메라 · 장면) · campus(heightAt) · courses = courses.js 의 COURSES · current = { id, parts } 지금 게임이 지은 코스
//   trialLaps = 타임어택 바퀴 수 · best(id) → 초 | null · top(id) → Promise<초 | null> · game = 검증이 보는 window.__game(freeCamera 를 여기서 켜고 끈다)
//   night = 밤 화면인가(낮에는 빛 대신 진한 파랑 테 — 밝은 땅 위에서 덧그린 빛은 묻힌다) · world() → { objects: [지금 코스에만 있는 3D 묶음], lampMap: 가로등 빛 웅덩이 텍스처 | null }
export function createCoursePick(THREE, { root, stage, campus, courses, current, trialLaps, best = () => null, top = async () => null, game, night = true, world = () => ({}) }) {
  const cam = stage.camera, scene = stage.scene;
  const panel = document.createElement('div'); panel.className = 'hud-cp'; panel.hidden = true;
  panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', '코스 고르기');
  panel.innerHTML = '<div class="hud-g-head"><h1 class="hud-title">코스 고르기</h1><div class="hud-kerb">' + '<i></i>'.repeat(7) + '</div></div><div class="hud-g-count"></div>'
    + '<button type="button" class="hud-g-arrow l" aria-label="앞 코스"></button><button type="button" class="hud-g-arrow r" aria-label="다음 코스"></button>'
    + '<div class="hud-g-plate"><div class="hud-g-name"></div><div class="hud-cp-facts"></div></div>'
    + '<div class="hud-g-acts"><button type="button" class="hud-g-pick">이 코스로<kbd>ENTER</kbd></button><button type="button" class="hud-g-back">뒤로<kbd>ESC</kbd></button></div>'
    + '<p class="hud-osm">' + OSM + '</p>';
  root.append(panel);
  const $ = s => panel.querySelector(s);
  let at = 0, handlers = null, line = null, saved = null, swipeX = null, drawn = -1;
  const built = new Map();   // 코스 id → { parts, lines: Map(굵기 → 그룹) }

  // 코스의 그리기용 묶음: 지금 코스는 게임의 parts, 다른 코스는 자료로 새로 짓는다(늦게 받는 코스는 prepare 가 먼저 받아 둔다)
  function shapeOf(c) {
    if (built.has(c.id)) return built.get(c.id);
    const parts = c.id === current.id ? current.parts : createParts(c.course, c.partsData);
    const shape = { parts, lines: new Map() }; built.set(c.id, shape); return shape;
  }
  const pointAt = (shape, s) => { const p = shape.parts.pointAt(s, 0); return { x: p.x, z: p.z, y: campus.heightAt(p.x, p.z) + shape.parts.deckLift(s) + shape.parts.rampLift(s) }; };
  // 코스 선: 가운데 흰 실선(가려지면 가려짐) + 넓은 파란 빛(늘 보임 — 덧그리기) + 출발점의 흰 막대. 굵기마다 한 번 지어 두고 다시 쓴다.
  function lineOf(c, width) {
    const shape = shapeOf(c), key = width.toFixed(2); if (shape.lines.has(key)) return shape.lines.get(key);
    const length = c.course.length, pts = [];
    for (let s = 0; s < length; s += 4) { const p = pointAt(shape, s); pts.push(new THREE.Vector3(p.x, p.y + 1.2, p.z)); }
    const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal'), group = new THREE.Group(); group.name = 'course-pick-line';
    const away = c.id !== current.id;   // 다른 코스: 그 길 위의 나무가 선을 끊지 않게 실선도 늘 위에
    const core = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, width, 6, true), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false, depthTest: !away }));
    const glow = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, width * 3.2, 8, true), new THREE.MeshBasicMaterial(night
      ? { color: 0x7fb2ff, transparent: true, opacity: .38, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }
      : { color: 0x1d4fbf, transparent: true, opacity: .55, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
    glow.renderOrder = 10; core.renderOrder = 11;
    const s0 = pointAt(shape, 0), s1 = pointAt(shape, 6);
    const flag = new THREE.Mesh(new THREE.BoxGeometry(width * 9, width * 1.4, width * 1.8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false, depthTest: false }));
    flag.position.set(s0.x, s0.y + 2, s0.z); flag.rotation.y = -Math.atan2(s1.z - s0.z, s1.x - s0.x) + Math.PI / 2; flag.renderOrder = 12;
    for (const m of [core, glow, flag]) { m.castShadow = m.receiveShadow = false; m.frustumCulled = false; }
    group.add(glow, core, flag); group.userData.base = s0.y; shape.lines.set(key, group); return group;
  }
  // 지금 코스에만 있는 것 감추기 · 되돌리기. 빛 웅덩이는 텍스처(DataTexture)의 자료를 잠깐 0 으로 바꿔 끈다(재질은 안 건드린다).
  let away = null, zeros = null;
  function setAway(on) {
    if (on && !away) {
      const w = world() || {}; away = { objects: (w.objects || []).filter(o => o && o.visible), map: null };
      for (const o of away.objects) o.visible = false;
      const tex = w.lampMap, data = tex?.image?.data;
      if (data) { if (!zeros || zeros.length !== data.length) zeros = new data.constructor(data.length); away.map = { tex, data }; tex.image.data = zeros; tex.needsUpdate = true; }
      stage.invalidateShadow?.();
    } else if (!on && away) {
      for (const o of away.objects) o.visible = true;
      if (away.map) { away.map.tex.image.data = away.map.data; away.map.tex.needsUpdate = true; }
      away = null; stage.invalidateShadow?.();
    }
  }
  function keepCamera() {
    if (saved) return;
    saved = { fov: cam.fov, near: cam.near, far: cam.far, pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone(), view: cam.view ? { ...cam.view } : null, fog: scene.fog ? { near: scene.fog.near, far: scene.fog.far } : null };
  }
  function restoreCamera() {
    if (!saved) return;
    cam.fov = saved.fov; cam.near = saved.near; cam.far = saved.far; cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.up.copy(saved.up);
    if (saved.view?.enabled) cam.setViewOffset(saved.view.fullWidth, saved.view.fullHeight, saved.view.offsetX, saved.view.offsetY, saved.view.width, saved.view.height); else cam.clearViewOffset();
    cam.updateProjectionMatrix();
    if (scene.fog && saved.fog) { scene.fog.near = saved.fog.near; scene.fog.far = saved.fog.far; }
    saved = null;
  }
  // 하늘에서: 코스의 긴 쪽이 화면의 긴 쪽에 오게 남쪽 · 서쪽 중에서 보는 쪽을 고르고, 비어 있는 가운데(위 제목 밑 ~ 아래 이름표 위)에 맞춘다(시안의 aerial)
  function aerial(c, free, groundY) {
    const W = innerWidth, H = innerHeight; let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of c.course.centre) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, ex = x1 - x0, ez = z1 - z0;
    const fitN = Math.min(free.w / ex, free.h / (ez * Math.sin(PITCH))), fitE = Math.min(free.w / ez, free.h / (ex * Math.sin(PITCH)));
    const east = fitE > fitN * 1.08;   // 서쪽에서 동쪽을 보는 쪽이 크게 들어오면 그쪽(아니면 남쪽에서 북쪽)
    const across = east ? ez : ex, deep = east ? ex : ez;
    const halfV = Math.tan(FOV * Math.PI / 360), halfH = halfV * W / H;
    const dist = Math.max((across / 2) / (halfH * free.w / W), (deep * Math.sin(PITCH) / 2) / (halfV * free.h / H)) * 1.04;
    const fx = east ? -1 : 0, fz = east ? 0 : 1;
    cam.fov = FOV; cam.near = 5; cam.far = 8000;
    cam.position.set(cx + fx * Math.cos(PITCH) * dist, groundY + Math.sin(PITCH) * dist, cz + fz * Math.cos(PITCH) * dist);
    cam.up.set(0, 1, 0); cam.lookAt(cx, groundY, cz);
    cam.setViewOffset(W, H, W / 2 - free.cx, H / 2 - free.cy, W, H); cam.updateProjectionMatrix();
    if (scene.fog) { scene.fog.near = 1e5; scene.fog.far = 2e5; }
  }
  function facts(c) {
    const time = v => Number.isFinite(v) ? lapText(v) : '';
    const v = (x, cls = '') => x ? '<b class="' + cls + '">' + esc(x) + '</b>' : '<b class="none" aria-label="기록 없음">—</b>';
    return [['그랑프리', '<b>' + esc(c.laps?.gp ?? '') + '<small>바퀴</small></b>'], ['타임어택', '<b>' + esc(trialLaps) + '<small>바퀴</small></b>'],
      ['내 최고', v(time(best(c.id)), 'best')], ['1등', v('')]]
      .map(([k, val], i) => '<div' + (i === 3 ? ' class="hud-cp-top"' : '') + '><span>' + k + '</span>' + val + '</div>').join('');
  }
  // 그리기: 글자를 쓰고, 이름표의 실제 자리를 재서 비어 있는 가운데에 코스를 맞춘다
  function draw() {
    const c = courses[at]; if (!c) return; drawn = at;
    $('.hud-g-count').innerHTML = '<b>' + two(at + 1) + '</b> / ' + two(courses.length);
    $('.hud-g-name').innerHTML = '<em>' + two(at + 1) + '</em><b>' + esc(c.name) + '</b><i>' + (c.course.length / 1000).toFixed(2) + ' km</i>';
    $('.hud-cp-facts').innerHTML = facts(c);
    const id = c.id; top(id).then(v => { if (drawn !== at || courses[at]?.id !== id || !Number.isFinite(v)) return; const cell = $('.hud-cp-top b'); if (cell) cell.outerHTML = '<b>' + esc(lapText(v)) + '</b>'; }).catch(() => {});
    place();
  }
  function place() {
    const c = courses[at]; if (!c || panel.hidden) return;
    const W = innerWidth, H = innerHeight, narrow = W <= 700, low = H <= 460;
    const topY = narrow ? 150 : low ? 64 : 110, plate = $('.hud-g-plate').getBoundingClientRect();
    const bottom = plate.top - (narrow ? 18 : 22), side = narrow ? 18 : low ? 86 : 110;
    setAway(true);
    const next = lineOf(c, narrow ? 2.2 : low ? 2.0 : 1.6);
    if (line !== next) { if (line) scene.remove(line); line = next; scene.add(line); }
    aerial(c, { w: W - side * 2, h: Math.max(60, bottom - topY), cx: W / 2, cy: (topY + bottom) / 2 }, line.userData.base);
  }
  function move(step) { if (courses.length < 2) return; at = (at + step + courses.length) % courses.length; draw(); }
  const pick = () => handlers?.onPick?.(courses[at].id), back = () => handlers?.onBack?.();
  // 열려 있는 동안의 키는 여기서 받고 다른 처리기(시작 화면의 Enter = 출발 · 주행 입력)로 넘기지 않는다. 누르고 있는 키의 반복은 고르기 · 뒤로가 아니다.
  function onKey(event) {
    if (panel.hidden || event.metaKey || event.ctrlKey || event.altKey) return;
    const code = event.code || event.key, take = () => { event.preventDefault(); event.stopImmediatePropagation(); };
    if (code === 'ArrowLeft' || code === 'ArrowRight') { take(); move(code === 'ArrowLeft' ? -1 : 1); }
    else if (['Enter', 'NumpadEnter', 'Space', ' '].includes(code)) { take(); if (!event.repeat) pick(); }
    else if (code === 'Escape') { take(); if (!event.repeat) back(); }
    else event.stopImmediatePropagation();
  }
  addEventListener('keydown', onKey, true);
  addEventListener('resize', () => { if (!panel.hidden) place(); });
  $('.hud-g-arrow.l').addEventListener('click', event => { event.currentTarget.blur(); move(-1); });
  $('.hud-g-arrow.r').addEventListener('click', event => { event.currentTarget.blur(); move(1); });
  $('.hud-g-pick').addEventListener('click', pick);
  $('.hud-g-back').addEventListener('click', back);
  panel.addEventListener('pointerdown', event => { swipeX = event.target.closest('button, a') ? null : event.clientX; });
  panel.addEventListener('pointerup', event => { if (swipeX === null) return; const dx = event.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) move(dx < 0 ? 1 : -1); });

  return {
    // 늦게 받는 코스의 자료를 받아 둔다(처음 열 때 한 번 — 받는 동안 시작 화면은 그대로)
    async prepare() { for (const c of courses) if (!c.course) await loadCourse(c.id); },
    // 연다: index = 처음 보일 코스, handlers = { onPick(id), onBack() }
    open(index = 0, h = {}) {
      handlers = h; at = Math.max(0, Math.min(courses.length - 1, index));
      keepCamera(); if (game) game.freeCamera = true;
      panel.hidden = false; draw();
    },
    close() {
      handlers = null; if (panel.hidden) return; panel.hidden = true; drawn = -1;
      if (panel.contains(document.activeElement)) document.activeElement.blur();
      if (line) { scene.remove(line); line = null; }
      setAway(false); restoreCamera(); if (game) game.freeCamera = false;
    },
    get index() { return at; },
    get isOpen() { return !panel.hidden; },
  };
}
