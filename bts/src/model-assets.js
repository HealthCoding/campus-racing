import { GLTFLoader } from '../vendor/model-assets/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/model-assets/meshopt_decoder.module.js';

// Playable models load from the lossless packed copies (scripts/pack-campus-models.mjs);
// ?assets=legacy loads the untouched originals for side-by-side comparison.
const LEGACY_ASSETS = new URLSearchParams(globalThis.location?.search ?? '').get('assets') === 'legacy';
export const MODEL_MANIFEST_URL = new URL('../assets/campus-models/manifest.json', import.meta.url).href;
export const PLAYABLE_MANIFEST_URL = new URL(LEGACY_ASSETS ? '../assets/campus-replacements/manifest.json' : '../assets/campus-packed/manifest-primary.json', import.meta.url).href;
export const ADDITION_MANIFEST_URL = new URL(LEGACY_ASSETS ? '../assets/campus-additions/manifest.json' : '../assets/campus-packed/manifest-additions.json', import.meta.url).href;
export const ADDITION_MODEL_IDS = Object.freeze(['oesol','widang','daewooAnnex','billingsley','scienceCenter','yueokgyeom','medicine','nursing','dentistry','millennium']);

// Same platform test GLTFLoader (r170) uses to pick ImageBitmapLoader over TextureLoader.
function usesImageBitmaps() {
  if (typeof createImageBitmap === 'undefined') return false;
  const ua = globalThis.navigator?.userAgent ?? '';
  const safari = /^((?!chrome|android).)*safari/i.test(ua), firefox = ua.includes('Firefox');
  const safariVersion = safari ? parseInt(ua.match(/Version\/(\d+)/)?.[1] ?? '-1', 10) : -1;
  const firefoxVersion = firefox ? parseInt(ua.match(/Firefox\/([0-9]+)\./)?.[1] ?? '-1', 10) : -1;
  return !((safari && safariVersion < 17) || (firefox && firefoxVersion < 98));
}

// iPhone / iPad WebKit (Safari, Chrome iOS, Instagram / Kakao in-app views; iPadOS reports a Mac with touch points).
// ImageBitmap textures there come out silently black once the web / GPU process runs short of memory
// (WebKit bug 232357) - the last ones decoded and uploaded, i.e. a baked campus's ground tiles. <img> textures there.
function iosWebKit() {
  const nav = globalThis.navigator; if (!nav) return false;
  return /iP(hone|ad|od)/.test(nav.userAgent ?? '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

/** Packed models share a few texture files by URL. Safari does not merge concurrent requests for one URL,
 * so one load per URL is shared across all models of a cache (same ImageBitmapLoader decode GLTFLoader would do;
 * on iOS the same sharing with <img> elements, returned as the Texture a TextureLoader gives). */
function sharedTextureManager(THREE) {
  const ios = iosWebKit(), bitmaps = !ios && usesImageBitmaps() && Boolean(THREE.ImageBitmapLoader);
  if (!THREE.LoadingManager || (!bitmaps && !(ios && THREE.ImageLoader))) return undefined;
  const manager = new THREE.LoadingManager(), inner = bitmaps ? new THREE.ImageBitmapLoader(manager) : new THREE.ImageLoader(manager), pending = new Map();
  inner.setCrossOrigin('anonymous');
  manager.addHandler(/\.(png|webp|jpe?g)$/i, {
    isImageBitmapLoader: bitmaps,
    load(url, onLoad, _onProgress, onError) {
      // GLTFLoader joins "<model dir>/../textures/x" without normalizing; key on the resolved URL.
      const key = new URL(url, globalThis.location?.href).href;
      if (!pending.has(key)) pending.set(key, new Promise((resolve, reject) => inner.load(key, resolve, undefined, reject)));
      pending.get(key).then(image => {
        if (bitmaps) return onLoad(image);
        const texture = new THREE.Texture(image); texture.needsUpdate = true; onLoad(texture);
      }, onError);
    },
  });
  return manager;
}

/** Templates are read-only by contract. Clones own their Object3D trees only;
 * geometry/material/texture belong to this cache until its final dispose().
 * Dispose baked destruction geometries/material clones before disposing cache.
 * Abort/failure waits for in-flight parsers, then releases all acquired resources.
 */
export async function loadCampusModels(THREE, { concurrency = 4, ...options } = {}) {
  const cache = openModelCache(THREE, options);
  try {
    const manifest = await cache.manifest;
    let cursor = 0;
    async function worker() {
      while (!cache.failed) {
        const item = manifest.models[cursor++]; if (!item) break;
        await cache.load(item);
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, Math.min(4, Math.floor(concurrency) || 1)) }, worker));
    return cache.finish();
  } catch (error) { cache.release(); throw error; }
}

// Fetch mode for a model file: manifests always revalidate; a model.gltf whose URL carries a content hash
// (?v=<sha> or a hashed file name) uses the normal HTTP cache rules, so an immutable response is reused.
// With today's max-age=0 headers both modes revalidate the same way.
const HASHED_URL = /(?:[?&]v=[0-9a-f]{16,}(?:&|$))|(?:[-.][0-9a-f]{16,}\.gltf(?:$|\?))/i;
export function modelFetchCache(url) { return HASHED_URL.test(String(url)) ? 'default' : 'no-cache'; }

/** One model cache (one manifest): fetch + validate the manifest, load items one by one (in any order, from any
 * scheduler), then finish() trims superseded wrappers and returns the template map (same object loadCampusModels returns).
 * Templates become available (createScene) as soon as each one has loaded. */
function openModelCache(THREE, {
  onProgress, onModel, signal, manifestURL = MODEL_MANIFEST_URL,
  fetchImpl = globalThis.fetch, loaderFactory, expectedIds, expectedCount = 29,
} = {}) {
  const textureManager = loaderFactory ? undefined : sharedTextureManager(THREE);
  loaderFactory ??= () => new GLTFLoader(textureManager).setMeshoptDecoder(MeshoptDecoder);
  const requiredIds=expectedIds===undefined?null:Array.isArray(expectedIds)?[...expectedIds]:[];
  if(requiredIds&&(!requiredIds.length||requiredIds.some(id=>typeof id!=='string'||!id)||new Set(requiredIds).size!==requiredIds.length))throw new Error('캠퍼스 모델 ID 목록이 올바르지 않아요.');
  const templates = new Map(), geometries = new Set(), materials = new Set();
  const textures = new Set(), images = new Set(), canonical = new Map();
  let dead = false, error = null, loaded = 0;
  const abortError = () => Object.assign(new Error('캠퍼스 모델 로딩을 취소했어요.'), { name: 'AbortError' });
  const remember = object => {
    if (!object) return;
    if (object.isBufferGeometry) geometries.add(object);
    if (object.isTexture) { textures.add(object); if (object.source?.data) images.add(object.source.data); }
    if (object.isMaterial) {
      materials.add(object);
      for (const v of Object.values(object)) if (v?.isTexture) remember(v);
    }
    if (object.isObject3D) object.traverse(o => {
      remember(o.geometry); for (const m of Array.isArray(o.material) ? o.material : [o.material]) remember(m);
    });
  };
  function release() {
    if (dead) return; dead = true;
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const t of textures) t.dispose();
    for (const im of images) im.close?.();
    templates.clear(); geometries.clear(); materials.clear(); textures.clear(); images.clear(); canonical.clear();
  }
  async function json(url, cache = 'no-cache') {
    const response = await fetchImpl(url, { signal, cache });
    if (!response.ok) throw new Error(`모델 자료를 불러오지 못했어요: ${url} (${response.status})`);
    return response.json();
  }
  const manifestPromise = json(manifestURL).then(manifest => {
    expectedCount=requiredIds?.length??expectedCount;
    if (!Array.isArray(manifest.models) || manifest.models.length !== expectedCount || new Set(manifest.models.map(m => m.id)).size !== expectedCount
      ||manifest.models.some(m=>typeof m.id!=='string'||typeof m.url!=='string'||!m.url)
      ||requiredIds&&requiredIds.some(id=>!manifest.models.some(model=>model.id===id)))
      throw new Error('캠퍼스 모델 목록이 올바르지 않아요.');
    return manifest;
  });
  function intern(gltf, definition, base) {
    gltf.scene.traverse(o => {
      for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
        if (!mat) continue;
        for (const [slot, texture] of Object.entries(mat)) {
          if (!texture?.isTexture) continue;
          const index = gltf.parser?.associations.get(texture)?.textures;
          const td = definition.textures?.[index], im = definition.images?.[td?.source];
          if (!im?.uri) continue;
          const key = JSON.stringify([new URL(im.uri, base).href, texture.colorSpace,
            texture.wrapS, texture.wrapT, texture.magFilter, texture.minFilter, texture.flipY,
            texture.premultiplyAlpha, texture.generateMipmaps, texture.anisotropy, texture.channel,
            texture.offset.toArray(), texture.repeat.toArray(), texture.center.toArray(), texture.rotation]);
          if (canonical.has(key)) mat[slot] = canonical.get(key);
          else canonical.set(key, texture);
        }
      }
    });
  }
  // A rejected parser may have already allocated geometry or textures. Observe
  // existing dependency promises, without requesting new dependencies after failure.
  async function rememberParser(parser) {
    if (!parser) return;
    const pending = [];
    for (const [type, list] of [['mesh', parser.json.meshes], ['material', parser.json.materials], ['texture', parser.json.textures]])
      (list ?? []).forEach((_, i) => { const p = parser.cache.get(`${type}:${i}`); if (p) pending.push(p); });
    for (const result of await Promise.allSettled(pending)) if (result.status === 'fulfilled') remember(result.value);
    for (const record of Object.values(parser.primitiveCache ?? {})) {
      try { remember(await record.promise); } catch { /* failed primitive owns nothing */ }
    }
  }
  // Same steps as the former per-item worker body; the first error stops further items of every scheduler.
  async function load(item) {
    if (error) return;
    if (signal?.aborted) { error = abortError(); return; }
    let parser;
    try {
      const url = new URL(item.url, manifestURL).href, base = new URL('./', url).href;
      const definition = await json(url, modelFetchCache(url)), loader = loaderFactory();
      loader.register?.(p => { parser = p; return { name: 'CampusAssetOwnership' }; });
      const gltf = await loader.parseAsync(JSON.stringify(definition), base);
      remember(gltf.scene);
      if (signal?.aborted) throw abortError();
      intern(gltf, definition, base);
      templates.set(item.id, gltf.scene); loaded++;
      const manifest = await manifestPromise;
      onProgress?.({ loaded, total: manifest.models.length, id: item.id });
      onModel?.(item.id);
    } catch (e) { error ??= e; }
    finally { await rememberParser(parser); }
  }
  // Clones made before finish() reference template materials/textures only, which finish() keeps.
  templates.createScene = id => {
    if (dead) throw new Error('정리된 캠퍼스 모델 캐시는 사용할 수 없어요.');
    const template = templates.get(id); if (!template) throw new Error(`건물 모델이 없어요: ${id}`);
    return template.clone(true);
  };
  templates.dispose = release;
  async function finish() {
    const manifest = await manifestPromise;
    if (error || signal?.aborted) { release(); throw error ?? abortError(); }
    // Release superseded texture wrappers and decoded image bitmaps only when no
    // surviving material references them (same image can serve different samplers).
    const liveGeometries = new Set(), liveMaterials = new Set();
    for (const scene of templates.values()) scene.traverse(o => {
      if (o.geometry) liveGeometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) liveMaterials.add(m);
    });
    // GLTFLoader can clone base materials for mesh flags; cached base wrappers
    // are not part of any template and must not keep duplicate textures alive.
    for (const g of geometries) if (!liveGeometries.has(g)) { g.dispose(); geometries.delete(g); }
    for (const m of materials) if (!liveMaterials.has(m)) { m.dispose(); materials.delete(m); }
    const liveTextures = new Set(), liveImages = new Set();
    for (const m of materials) for (const t of Object.values(m)) if (t?.isTexture) { liveTextures.add(t); if (t.source?.data) liveImages.add(t.source.data); }
    for (const t of textures) if (!liveTextures.has(t)) { t.dispose(); textures.delete(t); }
    for (const im of images) if (!liveImages.has(im)) { im.close?.(); images.delete(im); }
    templates.metrics = Object.freeze({ ...manifest.totals, sharedTextures: textures.size, geometries: geometries.size, materials: materials.size });
    return templates;
  }
  return { manifest: manifestPromise, load, finish, release, templates, get failed() { return Boolean(error) || dead; }, get error() { return error; } };
}

/** Load a campus package's model manifests into one combined cache.
 * manifests: [{url, expectedIds?} | {url, count}] — progress counts continue across manifests.
 * All caches are owned by the returned map and are released together. */
export function loadPackageModels(THREE,options={}){return streamPackageModels(THREE,options).done;}

/** Same combined cache as loadPackageModels, streamed: every manifest list is requested at once, then the manifests load
 * one after another (buildings first, then ground/context) with `concurrency` loaders each, exactly the former order -
 * GLTFLoader creates a model's materials as it parses, and rendered ground/context materials keep their former relative
 * order (draw order of equal-depth surfaces). whenModel(id) resolves as soon as that template has loaded (createScene
 * works from then on), so buildings can be prepared while later manifests still download; done resolves with the
 * finished combined map (identical to loadPackageModels). */
export function streamPackageModels(THREE,{manifests,onProgress,concurrency=4,...options}={}){
  if(!Array.isArray(manifests)||!manifests.length){const done=Promise.reject(new Error('캠퍼스 모델 목록이 없어요.'));return{done,whenModel:()=>done,has:()=>false,createScene(){throw new Error('캠퍼스 모델 목록이 없어요.');}};}
  const total=manifests.reduce((sum,m)=>sum+(m.expectedIds?m.expectedIds.length:m.count),0);
  const waiting=new Map(),ready=new Set();let loaded=0,failure=null,dead=false;
  const settle=id=>{ready.add(id);waiting.get(id)?.resolve();waiting.delete(id);};
  const fail=error=>{failure??=error;for(const w of waiting.values())w.reject(failure);waiting.clear();};
  const caches=manifests.map(manifest=>openModelCache(THREE,{...options,manifestURL:manifest.url,expectedIds:manifest.expectedIds,expectedCount:manifest.count,
    onProgress:p=>{loaded++;onProgress?.({...p,loaded,total});},onModel:settle}));
  const owner=id=>caches.find(cache=>cache.templates.has(id));
  const stream={
    whenModel(id){
      if(ready.has(id))return Promise.resolve();if(failure)return Promise.reject(failure);
      let w=waiting.get(id);if(!w){w={};w.promise=new Promise((resolve,reject)=>{w.resolve=resolve;w.reject=reject;});w.promise.catch(()=>{});waiting.set(id,w);}
      return w.promise;
    },
    has:id=>!dead&&ready.has(id),
    createScene(id){if(dead)throw new Error('정리된 캠퍼스 모델 캐시는 사용할 수 없어요.');const cache=owner(id);if(!cache)throw new Error(`건물 모델이 없어요: ${id}`);return cache.templates.createScene(id);},
  };
  stream.done=(async()=>{
    const combined=new Map();
    function dispose(){if(dead)return;dead=true;for(const cache of caches)cache.release();combined.clear();}
    try{
      const lists=await Promise.all(caches.map(cache=>cache.manifest));
      for(let i=0;i<caches.length&&!caches.some(cache=>cache.failed);i++){
        const cache=caches[i],items=lists[i].models;let cursor=0;
        async function worker(){
          while(!cache.failed){
            const item=items[cursor++];if(!item)break;
            await cache.load(item);
          }
        }
        await Promise.all(Array.from({length:Math.max(1,Math.min(4,Math.floor(concurrency)||1))},worker));
      }
      const finished=[];for(const cache of caches)finished.push(await cache.finish());
      for(const templates of finished)for(const [id,template]of templates){if(combined.has(id))throw new Error(`캠퍼스 모델 ID가 겹쳐요: ${id}`);combined.set(id,template);}
      combined.createScene=id=>{
        if(dead)throw new Error('정리된 캠퍼스 모델 캐시는 사용할 수 없어요.');
        return (finished.find(cache=>cache.has(id))??finished[0]).createScene(id);
      };
      combined.dispose=dispose;
      const metrics={};for(const cache of finished)for(const [key,value]of Object.entries(cache.metrics))if(Number.isFinite(value))metrics[key]=(metrics[key]||0)+value;
      combined.metrics=Object.freeze({...metrics,models:combined.size,approvedModels:finished[0].size,additionModels:finished.slice(1).reduce((sum,cache)=>sum+cache.size,0)});
      return combined;
    }catch(error){dispose();fail(error);throw error;}
  })();
  stream.done.catch(()=>{});
  return stream;
}

/** Load 29 playable templates (including approved replacements) and separate additions (Yonsei). */
export function loadPlayableCampusModels(THREE,{
  additionManifestURL=ADDITION_MANIFEST_URL,primaryManifestURL=PLAYABLE_MANIFEST_URL,...options
}={}){
  // Approved replacements keep the same 29 IDs and never load duplicate buildings.
  return loadPackageModels(THREE,{...options,manifests:[{url:primaryManifestURL,count:29},{url:additionManifestURL,expectedIds:ADDITION_MODEL_IDS}]});
}
