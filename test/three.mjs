// 3D 화면(three.js)용 순수 함수 테스트 (브라우저·three 없이 돈다)
//   node test/three.mjs
import { toM, yawFromAngle, fpMoveVector, facingPan, shouldUse3D } from '../game/client/three/units.js';

let failed = 0;
const check = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };
const near = (a, b) => Math.abs(a - b) < 1e-9;

// 1) 단위
check(toM(48) === 1.5, '타일 48px = 1.5m');

// 2) yaw: three 카메라(order YXZ)의 앞 방향 (-sin y, -cos y) 이 p.angle 방향 (cos a, sin a) 과 같다
const fwd = a => { const y = yawFromAngle(a); return [-Math.sin(y), -Math.cos(y)]; };
for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 1]) {
  const [x, z] = fwd(a);
  check(near(x, Math.cos(a)) && near(z, Math.sin(a)), `yaw 앞 방향 = angle 방향 (${a})`);
}

// 3) 1인칭 이동: W 는 바라보는 방향, D 는 오른쪽, S 는 뒤
let v = fpMoveVector(0, -1, 0); check(near(v.x, 1) && near(v.y, 0), 'W, angle 0 → +x');
v = fpMoveVector(0, -1, Math.PI / 2); check(near(v.x, 0) && near(v.y, 1), 'W, angle π/2 → +y (화면 아래)');
v = fpMoveVector(1, 0, 0); check(near(v.x, 0) && near(v.y, 1), 'D, angle 0 → 오른쪽(+y)');
v = fpMoveVector(0, 1, 0); check(near(v.x, -1) && near(v.y, 0), 'S → 뒤로');
v = fpMoveVector(0, 0, 1); check(v.x === 0 && v.y === 0, '입력 없으면 0');

// 4) 바라보는 방향 기준 좌우
check(facingPan(0, 10, 0) > 0.99 && facingPan(0, -10, 0) < -0.99 && Math.abs(facingPan(10, 0, 0)) < 1e-9, 'facingPan: 오른쪽 +, 왼쪽 −, 정면 0');
check(Math.abs(facingPan(0, 0, 0)) < 1e-9, 'facingPan: 같은 자리면 0');

// 5) 3D 를 쓸지
check(shouldUse3D(0, {}, true) && !shouldUse3D(1, {}, true) && !shouldUse3D(0, { threeD: false }, true) && !shouldUse3D(0, {}, false), 'shouldUse3D: Level 0 + 설정 켜짐 + WebGL 일 때만');

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exitCode = failed ? 1 : 0;
