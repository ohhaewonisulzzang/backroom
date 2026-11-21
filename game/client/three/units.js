/**
 * 3D 화면 단위·변환 도우미 (three.js 를 불러오지 않는 순수 함수 — node 테스트 가능)
 *
 * 서버 좌표는 px (타일 48px), 3D 는 1 = 1m.
 * 서버가 이동 속도(px/s)를 검사하므로 속도는 그대로 두고, 세상 크기로 체감 속도를 맞춘다:
 *   32px = 1m → 타일 1.5m, 걷기 138px/s = 4.3m/s, 달리기 222 = 6.9m/s, 하울러 추격 198 = 6.2m/s
 * 2D (x, y) → 3D (x/32, 높이, y/32). 2D 의 y 축(아래 방향)이 3D 의 z 축이다.
 */
export const PX_PER_M = 32;
export const CEIL_H = 2.7;          // 천장 높이 (m)
export const EYE_H = 1.6;           // 눈높이: 서 있을 때
export const EYE_CROUCH = 1.0;      // 눈높이: 웅크렸을 때
export const PITCH_MAX = 80 * Math.PI / 180;

/** px → m */
export const toM = px => px / PX_PER_M;

/**
 * p.angle(2D: atan2(dy, dx), y 아래) → three 카메라 rotation.y (order 'YXZ').
 * 그 yaw 의 앞 방향 (-sin y, 0, -cos y) 이 (cos angle, 0, sin angle) 과 같아진다.
 */
export const yawFromAngle = angle => -angle - Math.PI / 2;

/**
 * 1인칭 이동: 입력(ix: A=-1 / D=+1, iy: W=-1 / S=+1)을 바라보는 방향 기준 2D px 방향으로 돌린다.
 * 길이는 입력 길이 그대로.
 */
export function fpMoveVector(ix, iy, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), f = -iy;   // 앞으로 = (c, s), 오른쪽 = (-s, c)
  return { x: c * f - s * ix + 0, y: s * f + c * ix + 0 };
}

/** 소리 나는 쪽이 바라보는 방향의 오른쪽이면 +, 왼쪽이면 − (−1..1) */
export function facingPan(dx, dy, angle) {
  if (dx === 0 && dy === 0) return 0;
  return Math.sin(Math.atan2(dy, dx) - angle);
}

/** 3D 로 지은 레벨 (LEVELS 순번): Level 0 로비, Level 1 거주 구역(콘크리트) */
export const LEVELS_3D = [0, 1];
/** 3D 로 그릴지: 3D 레벨 + 설정 '3D 화면' 켜짐 + WebGL 사용 가능 */
export const shouldUse3D = (levelIndex, settings, webgl) => LEVELS_3D.includes(levelIndex) && settings?.threeD !== false && !!webgl;
