# NOTICE — Campus Racing 이 쓰는 자료와 출처

Campus Racing © 2026 HealthCoding. HealthCoding 이 직접 만든 부분의 이용 조건은 `LICENSE`.
아래 제3자 자료는 각자의 라이선스를 따른다. `LICENSE` 의 조건은 이 자료들에 적용되지 않는다.

이 글과 `LICENSE` 는 게임과 함께 `license.html` 로 배포된다(제작 정보 판의 '전체 이용 조건 · 출처').

## 1. 제3자 자료

### 지도 자료 — OpenStreetMap

- 저작권 표시: **© OpenStreetMap contributors**
- 라이선스: Open Database License (ODbL) 1.0 — https://opendatacommons.org/licenses/odbl/1-0/
- 출처 · 안내: https://www.openstreetmap.org/copyright
- 쓰는 곳: 캠퍼스의 건물 자리 · 윤곽 · 길 · 영역, 코스의 중심선과 길가 물건 자리.
- **지도에서 온 좌표 자료는 ODbL 1.0 으로 이용할 수 있다.** 들어 있는 파일(게임 주소 아래 같은 경로):
  - `src/track/course-b.js` · `src/track/course-d.js` — 코스 중심선 · 폭 · 경계(도로 그래프에서 만든 것)
  - `src/track/course-b.moves.js` · `src/track/course-d.moves.js` — 길가 물건(나무 · 덤불 · 의자)을 옮긴 자리
  - `src/track/course-d.branch.js` — 코스 D 갈래 길의 중심선 · 폭
  - `src/race/terrain-data.js` — 주행 지형에 쓰는 건물 자리(아래 `campus-space.js` 에서 옮긴 값)
  - `bts/src/campus-space.js` · `bts/src/campus-east-data.js` · `bts/src/campus-expansion-data.js` · `bts/src/campus-humanities-data.js` · `bts/src/campuses/yonsei/hospitals.js` — 건물 자리 · 윤곽
  - `bts/src/campus-environment-data.js` · `bts/src/campus-expansion-environment.js` · `bts/src/campus-fountains.js` — 길 · 영역 · 분수 윤곽
  - 같은 파일 안의 코드는 ODbL 이 아니다(`LICENSE` 1 — PolyForm Noncommercial 1.0.0).
- 게임 안 출처 표시: 시작 화면(`© OpenStreetMap` 링크) · 제작 정보 판(`© OpenStreetMap contributors · ODbL 1.0`) · 공유 카드(`지도 © OpenStreetMap contributors`) · `license.html`.

### three.js r170

- 쓰는 곳: 3D 그리기 전부(`bts/vendor/three.module.js`)
- 라이선스: MIT — 전문 `bts/vendor/Three-LICENSE.txt`
- 저작권 표시: Copyright © 2010-2024 three.js authors
- 출처: https://github.com/mrdoob/three.js (npm `three@0.170.0`)
- 코어 안에 **Mapbox Earcut v2.2.4** 의 이식이 들어 있다(다각형 삼각형 나누기 — 파일 머리말 "Port from https://github.com/mapbox/earcut (v2.2.4)"). Earcut 의 라이선스는 ISC — 전문 `src/vendor/earcut-LICENSE.txt`.

### three.js 애드온(examples/jsm 일부)

- 쓰는 곳: 후처리 · 셰이더 · 물체 · 도구(`src/vendor/three-addons/`), 3D 파일 읽기(`bts/vendor/model-assets/GLTFLoader.js` · `BufferGeometryUtils.js`)
- 라이선스: MIT(three.js 와 같음) — 전문 `src/vendor/three-addons/LICENSE.txt`
- 저작권 표시: Copyright © 2010-2024 three.js authors
- 출처: npm `three@0.170.0` 의 `examples/jsm`
- 애드온 안의 이식물(SMAA v2.8 · Bokeh 셰이더 · QuickHull · 노이즈 등)은 각 파일 머리말에 원작이 적혀 있고, three.js 의 MIT 로 three.js 와 함께 배포된다.

### meshoptimizer 디코더 0.18

- 쓰는 곳: 압축된 3D 파일 풀기(`bts/vendor/model-assets/meshopt_decoder.module.js` — WebAssembly 가 파일 안에 들어 있다)
- 라이선스: MIT — 전문 `src/vendor/meshoptimizer-LICENSE.txt`
- 저작권 표시: Copyright (C) 2016-2022, by Arseny Kapoulkine
- 출처: https://github.com/zeux/meshoptimizer (파일 머리말 "Built from meshoptimizer 0.18")

### 글꼴 Saira

- 쓰는 곳: 화면 · 공유 카드의 숫자 · 영문(`src/hud/fonts/Saira-latin.woff2` · `Saira-Italic-latin.woff2`)
- 라이선스: SIL Open Font License 1.1 — 전문 `src/hud/fonts/OFL.txt`
- 저작권 표시: Copyright 2020 The Saira Project Authors
- 출처: https://github.com/Omnibus-Type/Saira

### 카카오 JavaScript SDK 2.8.5

- 쓰는 곳: 공유 판의 카카오톡 단추(키가 있을 때만 보인다). **그 단추를 누를 때만** 카카오 CDN(`https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js`)에서 불러온다 — 이 저장소 · 배포 묶음에는 들어 있지 않다. 주소 · integrity 는 `src/hud/share-send.js`.
- 누르면 카톡용 그림(800×400 — 기록 · 코스 · 차 · 주소, 닉네임 없음)을 카카오 서버에 올린다. 카카오는 올린 그림을 최대 100일 보관한다.
- 저작권: © Kakao Corp. 이용 조건: 카카오디벨로퍼스 이용약관 https://developers.kakao.com/terms/ko/site-terms
- 운영정책: https://developers.kakao.com/terms/ko/site-policies

### 카카오톡 공유 아이콘

- 쓰는 곳: 공유 판의 카카오톡 단추 아이콘(`assets/kakao/kakaotalk_sharing_btn_medium.png`). 카카오디벨로퍼스 '리소스 다운로드'에서 받은 그림을 고치지 않고 그대로 쓴다. 공식 사이트의 묶음에만 있고, 공개 저장소에는 이 그림과 카카오 키를 싣지 않는다.
- 카카오의 그림이고 카카오톡은 카카오의 상표다. `LICENSE` 의 조건은 이 그림에 적용되지 않는다 — 카카오의 이용 조건(운영정책 제3장 상표 사용 가이드)을 따른다.
- 출처: https://developers.kakao.com/tool/resource/talk

## 2. 같은 만든 이의 자료 — Beat the School

- 쓰는 곳: 연세대 신촌 캠퍼스의 3D 건물 · 병원 · 바닥 · 지형과 캠퍼스 코드(`bts/src/` · `bts/assets/`)
- 만든 이: HealthCoding(Beat the School). Beat the School 의 이용 조건을 따른다(`LICENSE` 와 같은 비상업 짜임 — 코드 PolyForm Noncommercial 1.0.0 · 3D · 그림 · 소리 CC BY-NC 4.0).
- `bts/vendor/` 는 여기에 들지 않는다 — 위 1절의 three.js · 애드온 · meshoptimizer 다.
- `bts/src/` 의 캠퍼스 자료 안에 든 지도 부분은 위 OpenStreetMap 조건(ODbL 1.0)을 따른다.
- 건물 모델은 사진을 보고 만들었고, 치수는 측량이 아니라 추정이다.
- 신촌 지형의 높낮이는 측량 · DEM 자료가 아니라 사진과 주변 모습으로 추정한 값이다.

## 3. HealthCoding 이 만든 것

제3자 자료가 아니다 — 이용 조건은 `LICENSE`(코드는 PolyForm Noncommercial 1.0.0, 3D · 그림 · 소리 · 음악은 CC BY-NC 4.0).

- 차량 3D 모델과 독수리상 모델(`assets/vehicles/*.glb` · `eagle_statue.glb`) — 파이썬 스크립트로 Blender 에서 지었다. 배포되는 파일의 glTF `asset.copyright` 에 '© 2026 HealthCoding · Campus Racing' 이 들어 있다.
- 소리(엔진 · 타이어 · 부스터 등) — 소리 파일 없이 Web Audio 로 합성한다(`src/audio.js`).
- 배경음악 '네온 질주' — 새로 쓴 곡을 합성 악기로 직접 연주한다. 음원 · 샘플 파일은 없다(`src/music.js` · `src/music/neon.js`).
- 화면 · 아이콘 · 공유 그림(`assets/icon/` · `assets/og.jpg`). `og.jpg` 는 게임 화면이라 캠퍼스 모습(Beat the School · 지도 자료)이 담겨 있다.

## 4. 배포에 들지 않는 것

- 한글 글꼴: 화면이 'Pretendard' 를 먼저 부르지만 글꼴 파일은 배포하지 않는다(보는 사람의 기기에 있으면 쓰고, 없으면 기기 기본 글꼴).
- 카카오 JavaScript SDK: 묶음에 없다(카카오톡 단추를 누를 때 카카오 CDN 에서 받는다 — 위 1절).
- 원본 지도 스냅샷, 개발용 화면 · 시험 · 도구는 배포하지 않는다.
