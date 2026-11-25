// Yonsei Sinchon campus package: a thin bundle over the existing data modules and asset folders.
// Nothing here is new data; the engine reads campus-specific values through this object so a second
// campus can supply its own. Import specifiers match campus.js/campus-ground.js so modules are shared.
import { CAMPUS_SPACE, SPACE_PATHS, WORLD_UNITS_PER_METER, GEO_ORIGIN, CORE_IDS } from '../../campus-space.js?v=realism14';
import { EAST_BUILDINGS, createEastBuildingSource } from '../../campus-east.js?v=realism14';
import { HUMANITIES_BUILDINGS } from '../../campus-humanities-data.js?v=humanities28';
import { EXPANSION_BUILDINGS } from '../../campus-expansion-data.js?v=millennium32';
import { EXPANSION_ENVIRONMENT } from '../../campus-expansion-environment.js?v=millennium32';
import { enhanceCampusFacade } from '../../campus-facade-details.js?v=realism14';
import { ENVIRONMENT_PATHS, ENVIRONMENT_AREAS, ENVIRONMENT_CONTEXT_BUILDINGS, ENVIRONMENT_PROVENANCE } from '../../campus-environment-data.js';
import { CAMPUS_HILLS } from '../../campus-hills-data.js';
import { PLAYABLE_MANIFEST_URL, ADDITION_MANIFEST_URL, ADDITION_MODEL_IDS } from '../../model-assets.js?v=sn120';
import { YONSEI_HOSPITALS } from './hospitals.js?v=weapons40';
import { GROUND_BAKE } from './ground-bake.js';

const EAST_IDS = EAST_BUILDINGS.map(b => b.id);

export const YONSEI = Object.freeze({
  id: 'yonsei',
  meta: Object.freeze({ school: '연세대학교', campus: '신촌캠퍼스', short: '연세대 신촌', modelNoun: '연세대' }),
  geo: Object.freeze({ origin: GEO_ORIGIN, worldUnitsPerMeter: WORLD_UNITS_PER_METER }),
  // Placement order is part of the campus: it drives terrain grouping, RNG consumption and progress order.
  placements: Object.freeze([...CAMPUS_SPACE, ...EAST_BUILDINGS, ...HUMANITIES_BUILDINGS, ...EXPANSION_BUILDINGS]),
  approvedCount: CAMPUS_SPACE.length,
  additionalCount: EAST_BUILDINGS.length + HUMANITIES_BUILDINGS.length + EXPANSION_BUILDINGS.length,
  coreIds: CORE_IDS,
  startBuildingId: 'underwood',
  models: Object.freeze({
    // Loaded in order; progress counts continue across manifests (29 approved + 10 additions).
    manifests: Object.freeze([Object.freeze({ url: PLAYABLE_MANIFEST_URL, count: 29 }), Object.freeze({ url: ADDITION_MANIFEST_URL, expectedIds: ADDITION_MODEL_IDS })]),
    primaryManifestURL: new URL('../../../assets/campus-packed/manifest-primary.json', import.meta.url).href,
    additionManifestURL: new URL('../../../assets/campus-packed/manifest-additions.json', import.meta.url).href,
    legacyPrimaryManifestURL: new URL('../../../assets/campus-replacements/manifest.json', import.meta.url).href,
    legacyAdditionManifestURL: new URL('../../../assets/campus-additions/manifest.json', import.meta.url).href,
    primaryCount: 29,
    additionIds: Object.freeze(['oesol', 'widang', 'daewooAnnex', 'billingsley', 'scienceCenter', 'yueokgyeom', 'medicine', 'nursing', 'dentistry', 'millennium']),
    // Buildings built in code instead of loaded from a model file.
    proceduralIds: Object.freeze(EAST_IDS),
    createProceduralSource: (THREE, id) => createEastBuildingSource(THREE, id),
    enhanceFacade: (THREE, id, scene) => enhanceCampusFacade(THREE, id, scene),
  }),
  terrain: Object.freeze({
    // Estimated northward grade; hills are added by the terrain module in the same expression order.
    baseHeight: (x, z) => Math.min(4.5, Math.max(0, (-z - 35) * .025)),
    hills: CAMPUS_HILLS,
    source: 'Photo/context-based relative hills and northward grade; no surveyed elevations',
  }),
  environment: Object.freeze({
    spacePaths: SPACE_PATHS,
    paths: ENVIRONMENT_PATHS,
    areas: ENVIRONMENT_AREAS,
    contextBuildings: ENVIRONMENT_CONTEXT_BUILDINGS,
    provenance: ENVIRONMENT_PROVENANCE,
    // The east-side mapped extension only exists once its buildings are placed.
    extensionFor: entries => entries.some(e => e.id === 'nursing') ? EXPANSION_ENVIRONMENT : { areas: [], paths: [] },
    sourceNote: 'OSM pedestrian centreline + photo-informed furnishing; widths, grade and garden details estimated',
  }),
  ground: Object.freeze({
    seed: 9051,
    skipMappedPath: source => source.source.featureIndex === 4,
    // Keeps the central heritage corridor free of garden trees (not the avenue, not woodland).
    rejectTree: (p, avenue, landcover) => !avenue && landcover !== 'wood' && p.x > -46 && p.x < 2 && p.z < -40 && p.z > -112,
    avenuePathId: 'baekyang-main',
    avenueFurnitureStyle: 'baekyang',
    furnitureStyle: 'garden',
    lightSpacing: path => path.id === 'baekyang-main' ? 11 : 13,
    // Thin only the two rear woodland margins (north is negative Z).
    keepRearTree: t => t.landcover !== 'wood' || t.z >= -110 || t.x >= -65 && t.x <= 20,
    fountainAreaIds: Object.freeze(['area-35']),
    // The ground above pre-computed by scripts/campuses/yonsei/build-ground-bake.mjs (src/engine/ground-bake.js; ?ground=live builds it at load time).
    bake: GROUND_BAKE,
  }),
  // Protected hospitals (src/protected-buildings.js): five Severance models, never destructible, shield reaction.
  // Loaded from their own small cache (assets/hospitals/yonsei), so the 39 campus models and their progress are unchanged.
  protected: Object.freeze({
    manifestURL: new URL('../../../assets/hospitals/yonsei/manifest.json', import.meta.url).href,
    models: YONSEI_HOSPITALS,
  }),
  scene: Object.freeze({
    background: '#b9ced9', fog: Object.freeze({ color: '#b9ced9', near: 700, far: 2200 }),
    hemisphere: Object.freeze({ sky: '#e7eff4', ground: '#707764', intensity: 1.45 }),
    sun: Object.freeze({ color: '#fff2db', intensity: 3.1, position: Object.freeze([-100, 220, 120]), shadowSpan: 185 }),
    floor: Object.freeze({ color: '#758168', y: -.22 }),
  }),
});
export default YONSEI;
