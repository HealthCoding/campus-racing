// 주소에서 후처리를 고를 때만 불러온다. r170은 일반 렌더 대상에 선형 HDR로 쓰고,
// 마지막 OutputPass가 renderer의 노출 · ACES · sRGB를 화면에 한 번 적용한다.
import { HalfFloatType, Vector2, WebGLRenderTarget } from '../../bts/vendor/three.module.js';
import { EffectComposer } from '../vendor/three-addons/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/three-addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/three-addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../vendor/three-addons/postprocessing/ShaderPass.js';
import { OutputPass } from '../vendor/three-addons/postprocessing/OutputPass.js';

const GRADE = {
  name: 'CampusColorGrade',
  uniforms: { tDiffuse: { value: null }, night: { value: false } },
  vertexShader: `varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse;
    uniform bool night;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(.2126, .7152, .0722));
      if (night) {
        float light = smoothstep(.025, .38, luma);
        c *= mix(vec3(.94, .97, 1.055), vec3(1.055, 1.01, .945), light) * mix(.94, 1.055, light);
      } else {
        c *= mix(vec3(.96, .99, 1.045), vec3(1.035, 1.005, .965), smoothstep(.018, .55, luma));
      }
      vec2 edge = (vUv - .5) * 2.;
      c *= 1. - .12 * smoothstep(.36, 1.65, dot(edge, edge));
      float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056, .00583715)))) - .5;
      c += grain * (.00030 + .0020 * min(luma, 1.));
      gl_FragColor = vec4(max(c, 0.), 1.);
    }`,
};

// UnrealBloomPass.setSize는 받은 폭·높이를 안에서 다시 절반으로 줄인다.
class RoadBloomPass extends UnrealBloomPass {
  setSize(width, height) {
    const scale = this.lowResolution ? .5 : 1;
    super.setSize(Math.max(1, width * scale), Math.max(1, height * scale));
  }
}

export function createPost(renderer, scene, camera) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, resolveDepthBuffer: false });
  const composer = new EffectComposer(renderer, target);
  // 배율의 반올림까지 renderer와 같게, 실제 그리기 버퍼의 픽셀 크기를 직접 쓴다.
  composer.setPixelRatio(1);
  const sceneTarget = composer.readBuffer;
  // RenderPass와 블룸은 교환하지 않고, 보정·출력 둘이 교환하여 매 화면 이 대상들로 돌아온다.
  composer.writeBuffer.depthBuffer = false;

  const bloom = new RoadBloomPass(new Vector2(32, 32), .32, .40, 1.05);
  bloom.highPassUniforms.smoothWidth.value = .12;
  // 안전판(보조): 장면에 NaN · Inf 픽셀이 하나만 생겨도 블룸의 축소 단계가 그것을 화면의 1/3 쯤 되는 검은 네모로 번지게 한다(2026-11-24 '검정 판').
  // 뿌리는 night-materials.js 의 SAFE_BUMP 에서 고쳤다. 이것은 다른 곳에서 또 생겨도 그 픽셀 하나로 그치게 한다 — 문턱 거르기에서 유한하지 않은 값을 0 으로(비트로 본다).
  // finiteOnly 를 끄면 원래대로 번진다(검증/flash-probe.mjs 가 꺼서 장면의 NaN 을 센다).
  const highPass = bloom.materialHighPassFilter;
  highPass.uniforms.finiteOnly = { value: true };
  highPass.fragmentShader = highPass.fragmentShader
    .replace('void main() {', 'uniform bool finiteOnly;\nvoid main() {')
    .replace('vec4 texel = texture2D( tDiffuse, vUv );', 'vec4 texel = texture2D( tDiffuse, vUv );\n'
      + 'if ( finiteOnly && any( equal( floatBitsToUint( texel.rgb ) & uvec3( 0x7f800000u ), uvec3( 0x7f800000u ) ) ) ) texel = vec4( 0. );');
  bloom.blendMaterial.depthTest = false;
  bloom.blendMaterial.depthWrite = false;
  for (const t of [bloom.renderTargetBright, ...bloom.renderTargetsHorizontal, ...bloom.renderTargetsVertical]) t.depthBuffer = false;
  const grade = new ShaderPass(GRADE);
  const output = new OutputPass();
  for (const pass of [grade, output]) { pass.material.depthTest = false; pass.material.depthWrite = false; }
  for (const pass of [new RenderPass(scene, camera), bloom, grade, output]) composer.addPass(pass);

  const gl = renderer.getContext();
  // r170 WebGLTextures에서 OculusBrowser는 resolve 직후 MSAA 색 버퍼를 폐기한다.
  // 그 위에 블룸을 더할 수 없으므로 그 기기에서는 처음부터 단일 표본에 그린다.
  const discardsResolvedColor = /OculusBrowser/.test(globalThis.navigator?.userAgent || '');
  const supported = discardsResolvedColor ? [] : gl.getInternalformatParameter(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES);
  const samples = Array.from(supported || []).filter(n => n <= 4).reduce((a, b) => Math.max(a, b), 0);
  const pixels = new Vector2();
  return {
    setNight(enabled) { grade.uniforms.night.value = enabled; },
    resize(lowResolution) {
      const nextSamples = lowResolution ? 0 : samples;
      if (sceneTarget.samples !== nextSamples) {
        sceneTarget.dispose();
        sceneTarget.samples = nextSamples;
      }
      bloom.lowResolution = lowResolution;
      renderer.getDrawingBufferSize(pixels);
      composer.setSize(Math.max(1, pixels.x), Math.max(1, pixels.y));
    },
    render() { composer.render(0); },
    dispose() {
      // r170의 UnrealBloomPass.dispose는 high-pass 재질을 남긴다.
      bloom.materialHighPassFilter.dispose();
      bloom.dispose(); grade.dispose(); output.dispose(); composer.dispose();
    },
  };
}
