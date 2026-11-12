'use client';

import { useEffect, useState } from 'react';
import BackroomsGame from './BackroomsGame.jsx';
import MobileGuide from './MobileGuide.jsx';

/**
 * 휴대폰이면 게임 대신 안내 사이트(MobileGuide)를 보여 준다. 태블릿·컴퓨터는 게임으로.
 *  휴대폰 판단: iPhone/iPod, "Mobile" 이 붙은 Android, 또는 짧은 변이 500px 미만인 터치 화면.
 *  iPad(데스크톱 UA 로 위장하는 iPadOS 포함)·Android 태블릿은 "Mobile" 이 없고 화면이 커서 통과한다.
 */
export function isPhone() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|Tablet/i.test(ua)) return false;
  if (/iPhone|iPod/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua)) || /Windows Phone|IEMobile|Opera Mini/i.test(ua)) return true;
  const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  return touch && Math.min(window.screen.width, window.screen.height) < 500;
}

export default function DeviceGate() {
  const [phone, setPhone] = useState(null);      // null = 아직 모름 (서버 렌더링 중에는 아무것도 그리지 않는다)
  useEffect(() => { setPhone(isPhone()); }, []);
  if (phone === null) return null;
  return phone ? <MobileGuide /> : <BackroomsGame />;
}
