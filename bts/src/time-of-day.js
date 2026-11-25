// Time of day (user decision 2026-10-23, 시안/저녁분위기_시안.html): 낮 / 노을 / 해질녘, default 노을 (user 10-23: 노을 is brighter on phones; was 해질녘).
// 낮 keeps each campus package's own scene colours; 노을 and 해질녘 are shared presets (evening-light-shots.mjs
// goldenLight / duskLight as the starting point, dusk lifted a step so buildings still read on a phone in daylight).
// The choice is a settings row (injected next to 화면 품질), saved in localStorage; ?time=day|golden|dusk forces one.
// 노을·해질녘 draw a sky dome that follows the camera (warm glow at the horizon, brighter toward the sun, blue overhead);
// 낮 hides it and keeps the flat campus colour. ?sky=flat keeps the earlier flat evening sky (comparison only).
export const TIME_KEY = 'beat-school-time';
export const TIME_DEFAULT = 'golden';
// Sun offset from the camera target (main.js updateLighting). Day = the original fixed offset.
const DAY_SUN = [-150, 260, 110];
// background/fog = flat sky (?sky=flat); dome = gradient sky by elevation: fog colour below the horizon, `horizon` just above it,
// `mid` around 6-8 degrees, `zenith` overhead, plus `glow` toward the sun's bearing. With the dome on, fog = dome.fog.
export const TIME_PRESETS = Object.freeze({
  golden: Object.freeze({ background: '#f2c9a2', fog: '#efc6a2', sky: '#ffe2c2', ground: '#6a6460', hemisphere: 1.4,
    sun: '#ffbe85', sunIntensity: 3.2, sunOffset: [-310, 85, 125], exposure: 1.15, floorTint: [1, .9, .82],
    dome: Object.freeze({ fog: '#efc0a2', horizon: '#ffab70', mid: '#f1c8ab', zenith: '#a3b5d3', glow: '#ffc488', glowStrength: .45 }) }),
  dusk: Object.freeze({ background: '#8f9ec9', fog: '#97a5ca', sky: '#cad3ee', ground: '#686a7e', hemisphere: 1.65,
    sun: '#ffb58c', sunIntensity: 2.5, sunOffset: [-320, 95, 120], exposure: 1.28, floorTint: [.86, .88, 1],
    dome: Object.freeze({ fog: '#b2a5c3', horizon: '#f0a68a', mid: '#bea6c4', zenith: '#6f87c2', glow: '#ffae78', glowStrength: .5 }) }),
});
const SKY_VERTEX = `varying vec3 vDir;
void main(){ vDir=position; gl_Position=projectionMatrix*viewMatrix*vec4(cameraPosition+position*1000.,1.); gl_Position.z=gl_Position.w; }`;
const SKY_FRAGMENT = `uniform vec3 fogColor,horizon,mid,zenith,glow; uniform vec2 sunDir; uniform float glowStrength; varying vec3 vDir;
void main(){
 vec3 d=normalize(vDir); float h=d.y;
 vec3 c=mix(horizon,mid,smoothstep(.04,.15,h)); c=mix(c,zenith,smoothstep(.12,.6,h));
 float s=max(dot(normalize(d.xz+1e-5),sunDir),0.); c+=glow*glowStrength*s*s*s*(1.-smoothstep(0.,.4,max(h,0.)));
 c=mix(c,fogColor,1.-smoothstep(-.01,.07,h));
 c+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-.5)/255.;
 gl_FragColor=vec4(c,1.);
 #include <colorspace_fragment>
}`;
const OPTIONS = [['day', '낮'], ['golden', '노을'], ['dusk', '해질녘']];
const valid = mode => OPTIONS.some(([id]) => id === mode);

export function createTimeOfDay({ THREE, scene, renderer, hemi, sun, floor, SCENE, onChange }) {
  const day = { background: SCENE.background, fog: SCENE.fog.color, sky: SCENE.hemisphere.sky, ground: SCENE.hemisphere.ground,
    hemisphere: SCENE.hemisphere.intensity, sun: SCENE.sun.color, sunIntensity: SCENE.sun.intensity, sunOffset: DAY_SUN,
    exposure: renderer.toneMappingExposure, floorTint: [1, 1, 1] };
  const floorBase = new THREE.Color(SCENE.floor.color);
  // Live offset main.js reads every lighting update (mutated in place).
  const sunOffset = [...DAY_SUN];
  const forced = new URLSearchParams(globalThis.location?.search ?? '').get('time');
  let mode = TIME_DEFAULT;
  try { const saved = localStorage.getItem(TIME_KEY); if (valid(saved)) mode = saved; } catch {}
  if (valid(forced)) mode = forced;
  const flatSky = new URLSearchParams(globalThis.location?.search ?? '').get('sky') === 'flat';
  // Sky dome: ~500 triangles, drawn first, no depth write, outside fog and shadows, never picked (main.js raycasts its own meshes).
  const skyUniforms = { fogColor: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, mid: { value: new THREE.Color() },
    zenith: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, glowStrength: { value: 0 }, sunDir: { value: new THREE.Vector2(1, 0) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), new THREE.ShaderMaterial({ uniforms: skyUniforms,
    vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.name = 'time-sky'; sky.frustumCulled = false; sky.renderOrder = -1; sky.visible = false; scene.add(sky);

  function apply(next) {
    mode = valid(next) ? next : TIME_DEFAULT;
    const p = mode === 'day' ? day : TIME_PRESETS[mode];
    scene.background.set(p.background); scene.fog.color.set(p.fog);
    hemi.color.set(p.sky); hemi.groundColor.set(p.ground); hemi.intensity = p.hemisphere;
    sun.color.set(p.sun); sun.intensity = p.sunIntensity;
    sunOffset.splice(0, 3, ...p.sunOffset);
    renderer.toneMappingExposure = p.exposure;
    floor.material.color.copy(floorBase).multiply(new THREE.Color(...p.floorTint));
    const dome = mode !== 'day' && !flatSky ? p.dome : null;
    sky.visible = Boolean(dome);
    if (dome) {
      scene.fog.color.set(dome.fog); scene.background.set(dome.fog);
      for (const key of ['horizon', 'mid', 'zenith', 'glow']) skyUniforms[key].value.set(dome[key]);
      skyUniforms.fogColor.value.set(dome.fog); skyUniforms.glowStrength.value = dome.glowStrength;
      skyUniforms.sunDir.value.set(p.sunOffset[0], p.sunOffset[2]).normalize();
    }
    if (document.documentElement?.dataset) document.documentElement.dataset.time = mode;
  }
  apply(mode);

  // Settings row, same shape as 화면 품질 (a label + select), placed right after it.
  const row = document.createElement('label');
  row.className = 'quality-control time-control'; row.setAttribute('for', 'time-select');
  const select = document.createElement('select');
  select.id = 'time-select';
  for (const [id, name] of OPTIONS) { const option = document.createElement('option'); option.value = id; option.textContent = name; select.append(option); }
  select.value = mode;
  row.append('시간대', select);
  // optional calls: the game-check DOM stub has no closest/after
  document.getElementById('quality-select').closest?.('.quality-control')?.after?.(row);
  select.addEventListener?.('change', event => {
    apply(event.target.value);
    try { localStorage.setItem(TIME_KEY, mode); } catch {}
    onChange?.(mode);
  });

  return { get mode() { return mode; }, sunOffset, set(next) { apply(next); onChange?.(mode); } };
}
