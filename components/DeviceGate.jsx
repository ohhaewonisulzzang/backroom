'use client';

import { useEffect, useState } from 'react';
import BackroomsGame from './BackroomsGame.jsx';
import MobileGuide from './MobileGuide.jsx';

/**
 * 휴대폰·태블릿이면 게임 대신 안내 사이트(MobileGuide)를 보여 준다. 게임은 컴퓨터에서만.
 *  판단: iPhone/iPad/Android 등 모바일 UA, 데스크톱 UA 로 위장하는 iPadOS(Macintosh + 멀티 터치),
 *  또는 주 입력이 손가락이고 마우스·터치패드가 전혀 없는 기기.
 *  터치 화면 노트북(윈도우)은 마우스·터치패드가 있어 컴퓨터로 통과한다.
 */
export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod|iPad|Android|Tablet|Mobile|Silk|Kindle|PlayBook|Windows Phone|IEMobile|Opera Mini/i.test(ua)) return true;
  if (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return true;
  const mm = q => typeof matchMedia === 'function' && matchMedia(q).matches;
  return mm('(pointer: coarse)') && !mm('(any-pointer: fine)');
}

export default function DeviceGate() {
  const [mobile, setMobile] = useState(null);    // null = 아직 모름 (서버 렌더링 중에는 아무것도 그리지 않는다)
  useEffect(() => { setMobile(isMobileDevice()); }, []);
  if (mobile === null) return null;
  return mobile ? <MobileGuide /> : <BackroomsGame />;
}
