/**
 * 언어 (한국어 / English).
 *
 * 원문은 코드에 쓰인 한국어 그대로 두고, 화면에 보여 줄 때 t('한국어') 로 감싼다.
 * 영어일 때는 shared/lang/en-*.js 사전에서 같은 한국어 문장을 찾아 영어로 바꾸고, 사전에 없으면 한국어를 그대로 보여 준다.
 *
 *   t('설정')                              → 'Settings'
 *   t('{name} 님이 죽었다', { name })      → '{name} died' 에 name 을 끼워 넣는다 (사전의 키도 {name} 이 들어간 원문)
 *
 * 주의: t() 는 "보여 주는 순간" 에 불러야 한다. 모듈 맨 위 상수에서 부르면 그때 언어로 굳어 버린다.
 * 서버는 항상 한국어(ko) — 서버가 보낸 문장은 클라이언트가 보여 줄 때 t() 로 바꾼다.
 */
import UI from './lang/en-ui.js';
import CLIENT from './lang/en-client.js';
import STORY from './lang/en-story.js';
import SHARED from './lang/en-shared.js';

export const LANGS = [['ko', '한국어'], ['en', 'English']];
const STORE = 'backrooms.lang';
const EN = { ...SHARED, ...STORY, ...CLIENT, ...UI };

function initial() {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved === 'ko' || saved === 'en') return saved;
    return /^ko\b/i.test(navigator.language || '') ? 'ko' : 'en';
  } catch { return 'ko'; }
}
let lang = typeof window === 'undefined' ? 'ko' : initial();
const listeners = new Set();
if (typeof document !== 'undefined') document.documentElement.lang = lang;

export const getLang = () => lang;
export function setLang(l) {
  if ((l !== 'ko' && l !== 'en') || l === lang) return;
  lang = l;
  try { localStorage.setItem(STORE, l); } catch { /* 저장 불가 */ }
  if (typeof document !== 'undefined') document.documentElement.lang = l;
  for (const fn of listeners) fn(l);
}
/** 언어가 바뀌면 fn(lang). 해제 함수를 돌려준다 */
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** 한국어 원문 → 지금 언어. vars 가 있으면 {이름} 자리에 값을 넣는다 */
export function t(ko, vars) {
  if (ko == null) return '';
  let s = lang === 'en' ? (EN[ko] ?? ko) : String(ko);
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  return s;
}
/** 영어 사전에 없는 원문인지 (개발용) */
export const hasEn = ko => Object.prototype.hasOwnProperty.call(EN, ko);
