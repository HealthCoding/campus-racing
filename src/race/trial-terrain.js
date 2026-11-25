// 다시 계산(서버 · Node 시험)이 쓰는 지형 — 바닥 bake 의 fingerprint 에 든 건물 entries 로 주행 계산의 지형을 짓는다.
//   const { heightAt } = terrainFromEntries(rows);   rows = fingerprint.entries 그대로([id, x, z, w, d, rotation, x0, y0, z0, x1, y1, z1] — 월드 단위)
// 2026-11-24(결정적 수학): 게임 · 서버와 같은 src/race/sim-terrain.js 로 짓는다(bts 의 지형 코드를 옮기고 초월 함수만 엔진과 무관한 것으로).
//   브라우저도 이제 주행에는 같은 자료(src/race/terrain-data.js)를 쓴다 — 3D 모델의 경계 상자로 지은 entries 는 화면의 땅에만 쓴다.
// src/track/dev-terrain.js(추정 지형)는 쓰지 않는다.
import { YONSEI } from '../../bts/src/campuses/yonsei/index.js';
import { simTerrain } from './sim-terrain.js';

export function terrainFromEntries(rows) {
  const t = simTerrain({ worldUnitsPerMeter: YONSEI.geo.worldUnitsPerMeter, entries: rows });
  return { heightAt: t.heightAt, entries: rows.length };
}
