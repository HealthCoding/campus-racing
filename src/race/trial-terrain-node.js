// Node 전용: 바닥 bake 파일(bts/assets/…ground-bake)에서 fingerprint 의 건물 entries 를 꺼낸다(검증/course-signs.test.mjs 와 같은 읽기). 브라우저는 이 파일을 부르지 않는다.
//   const rows = readBakeEntries();  → terrainFromEntries(rows)(src/race/trial-terrain.js). 서버는 이 rows 를 JSON 으로 실어 두면 bake(2.5 MB)를 안 읽어도 된다.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { YONSEI } from '../../bts/src/campuses/yonsei/index.js';

export function readBakeEntries(url = YONSEI.ground.bake.url) {
  const raw = gunzipSync(readFileSync(new URL(url)));
  return JSON.parse(raw.toString('utf8', 12, 12 + raw.readUInt32LE(8))).fingerprint.entries;
}
