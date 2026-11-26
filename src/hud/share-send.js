// 공유 판의 '보낼 곳' 단추 — 카카오톡 · Instagram(2026-11-26 사용자가 시안/공유단추_고르기.html 에서 고름: 배치 '가 두 줄' · 카카오톡 '다 카톡용 가로 그림', Instagram 은 같은 날 '디엠 창 바로 열기').
//   share.js 가 부른다. 순수 함수는 검증/share-send.test.mjs, 화면은 검증/share-card.mjs(가짜 SDK).
//   이 모듈을 불러오는 것만으로는 밖에 아무 요청도 가지 않는다 — 카카오 SDK 는 카카오톡 단추를 처음 누를 때 loadKakao() 가 넣는다.
import { KAKAO_JS_KEY } from '../shared/kakao-key.js';
import { OFFICIAL_URL } from '../shared/official.js';

// ================================================================ 카카오톡
// 카카오 JavaScript SDK 2.8.5(2026-11-11 판). 주소 · integrity 는 https://developers.kakao.com/docs/ko/javascript/download 의 'SRI 태그' 그대로 옮겼다.
//   판을 올릴 때는 그 페이지에서 새 판의 두 값을 함께 옮긴다(integrity 가 다르면 브라우저가 SDK 를 막는다 — 카카오톡 단추만 '못 보냈어요').
export const KAKAO_SDK = Object.freeze({ src: 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js', integrity: 'sha384-v6JKY3z4FUkWq21oZDHZe74YvuPk/WUrVLrDHTBojHXClOSa3iXy7sCXPY1jkFbj' });
// 카톡용 가로 그림(feed 의 imageWidth · imageHeight 와 같은 값 — 카카오는 이 비율 밖을 잘라 보인다)
export const KAKAO_IMAGE = Object.freeze([800, 400]);
export const KAKAO_BUTTON = '게임 하러 가기';
const LOAD_WAIT = 15000, UPLOAD_WAIT = 20000;

// 키가 있을 때만 카카오톡 단추를 그린다(키는 src/shared/kakao-key.js 한 줄 — 주소 · 저장소로는 못 바꾼다)
export const kakaoOn = (key = KAKAO_JS_KEY) => typeof key === 'string' && key.trim() !== '';

// 보낼 곳 줄(윗줄): 카카오톡(키가 있을 때) · Instagram(늘) · 공유(파일 공유가 될 때). 아랫줄은 늘 이미지 저장 · 링크 복사
export function sendList({ kakao = false, share = false } = {}) { return [...(kakao ? ['kakao'] : []), 'insta', ...(share ? ['share'] : [])]; }
export const KEEP = Object.freeze(['save', 'copy']);

// 카카오톡 메시지(feed 기본 템플릿 — https://developers.kakao.com/docs/ko/message-template/default · JS 이름은 Kakao.Share 레퍼런스의 DefaultFeedSettings):
//   제목 = 링크 문구 첫 줄(headline) · 설명 = 코스 이름 · 차 이름 · 그림 800×400 · 단추 하나 '게임 하러 가기' · 링크 = 게임의 공식 주소(KAKAO_HOME)
//   링크는 어디서 열었든 늘 공식 주소다 — 카카오는 개발자 앱의 '웹 도메인'에 등록한 주소만 열어 주고, 로컬 개발 주소를 남에게 보내면 안 된다(2026-11-26)
//   headline 은 share.js 의 것을 받는다(이 모듈이 share.js 를 다시 불러오지 않게)
export const KAKAO_HOME = new URL(OFFICIAL_URL).href;
export function kakaoTemplate(d, imageUrl, headline) {
  const link = { mobileWebUrl: KAKAO_HOME, webUrl: KAKAO_HOME };
  return {
    objectType: 'feed',
    content: { title: headline(d), description: [d.course, d.car].filter(Boolean).join(' · '), imageUrl, imageWidth: KAKAO_IMAGE[0], imageHeight: KAKAO_IMAGE[1], link },
    buttons: [{ title: KAKAO_BUTTON, link }],
  };
}
// uploadImage 가 돌려준 값에서 그림 주소(문서 예: response.infos.original.url · 레퍼런스의 ImageInfos 는 original.url)
export const uploadedUrl = res => res?.infos?.original?.url || res?.original?.url || null;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export const timeout = (job, ms, what) => Promise.race([job, sleep(ms).then(() => { throw new Error(what + ' — ' + ms / 1000 + '초 넘음'); })]);

// SDK 넣기(한 번만 — 실패하면 다음 누름에 다시). 이미 페이지에 Kakao 가 있으면 그것을 쓴다.
//   ※ 진짜 SDK(2.x)는 받은 직후에는 Kakao.init · isInitialized 만 있고, Kakao.Share 는 init 을 부른 뒤에 생긴다 — 받았는지는 init 이 있는지로 본다
//     (2026-11-26 진짜 SDK 로 눌러 보고 고침: Share 가 있는지로 봤더니 늘 '비어 있음'으로 실패했다. 가짜 SDK 시험은 Share 를 처음부터 줘서 못 잡았다).
let sdkJob = null;
export function loadKakao(doc = globalThis.document) {
  const have = globalThis.Kakao; if (typeof have?.init === 'function') return Promise.resolve(have);
  sdkJob ||= timeout(new Promise((resolve, reject) => {
    const s = doc.createElement('script');
    s.src = KAKAO_SDK.src; s.integrity = KAKAO_SDK.integrity; s.crossOrigin = 'anonymous'; s.async = true; s.dataset.kakaoSdk = '';
    s.onload = () => typeof globalThis.Kakao?.init === 'function' ? resolve(globalThis.Kakao) : reject(new Error('카카오 SDK 가 비어 있음'));
    s.onerror = () => reject(new Error('카카오 SDK 를 못 불러옴'));
    doc.head.append(s);
  }), LOAD_WAIT, '카카오 SDK').catch(error => { sdkJob = null; doc.querySelectorAll('script[data-kakao-sdk]').forEach(s => s.remove()); throw error; });
  return sdkJob;
}
export async function kakaoClient(key = KAKAO_JS_KEY) {
  const K = await loadKakao();
  if (!K.isInitialized()) K.init(key);
  if (typeof K.Share?.uploadImage !== 'function' || typeof K.Share?.sendDefault !== 'function') throw new Error('카카오 SDK 에 공유 기능이 없음');   /* Share 는 init 뒤에 생긴다 */
  return K;
}
// 그림 한 장을 카카오에 올리고 주소를 받는다(uploadImage 의 file 은 FileList — DataTransfer 로 만든다. 못 만드는 브라우저는 배열)
export async function uploadKakao(K, blob, name) {
  const file = new File([blob], name, { type: 'image/jpeg' });
  let files = [file]; try { const dt = new DataTransfer(); dt.items.add(file); files = dt.files; } catch {}
  const url = uploadedUrl(await timeout(K.Share.uploadImage({ file: files }), UPLOAD_WAIT, '카카오 그림 올리기'));
  if (!url) throw new Error('카카오가 그림 주소를 안 줌');
  return url;
}

// ================================================================ Instagram
// 웹에서 Instagram 디엠 · 스토리로 바로 보내는 공식 길은 없다. 휴대폰은 Instagram 앱의 '보낼 사람 고르기' 창을 바로 연다(2026-11-26 사용자 "디엠 창 바로 열기").
//   ※ instagram://sharesheet?text= 는 Meta 문서에 없는 비공식 길이다 — 앱이 바뀌면 언제든 안 열리거나 글이 안 채워질 수 있다. 글(문구 + 주소)만 가고 카드 그림은 안 간다.
//   안드로이드 크롬은 크롬의 intent: 꼴(https://developer.chrome.com/docs/android/intents)로 Instagram 앱(com.instagram.android)을 집어 연다.
export function instaDmUrl(text, android = false) {
  const path = 'sharesheet?text=' + encodeURIComponent(text);
  return android ? 'intent://' + path + '#Intent;scheme=instagram;package=com.instagram.android;end' : 'instagram://' + path;
}
export const isAndroid = (ua = globalThis.navigator?.userAgent || '') => /Android/i.test(ua);
// PC(터치가 아닌 기기): Instagram 웹의 메시지함
export const INSTA_INBOX = 'https://www.instagram.com/direct/inbox/';
// 어느 길로 갈지: 터치 기기 = 앱의 보낼 사람 고르기 창, 아니면 메시지함 새 탭 + 이미지 저장 + 문구 복사
export const instaWay = ({ touch = false } = {}) => touch ? 'app' : 'web';
