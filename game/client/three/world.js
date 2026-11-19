import * as THREE from 'three';
import { CEIL_H } from './units.js';
import { wallFaces } from './world-data.js';
import { makeMaterials, makeLightTexture } from './materials.js';

const TM = 1.5;            // 타일 한 칸 (m) = 48px / PX_PER_M
const BASE_H = 0.1;        // 걸레받이 높이 (m)

/** 사각형 면들을 한 BufferGeometry 로 모은다 (재질마다 하나 → draw call 이 적다) */
class QuadBuilder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; }
  /** a,b,c,d: [x,y,z] 둘레 순서, n: 법선, uvs: [[u,v] x4]. 앞면이 n 쪽을 보도록 감기 방향을 맞춘다 */
  quad(a, b, c, d, n, uvs) {
    const i = this.pos.length / 3;
    for (const [p, t] of [[a, uvs[0]], [b, uvs[1]], [c, uvs[2]], [d, uvs[3]]]) { this.pos.push(...p); this.nor.push(...n); this.uv.push(...t); }
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    else this.idx.push(i, i + 2, i + 1, i, i + 3, i + 2);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * 벽 면 하나의 양 끝 (바닥 칸 tx,ty 의 side 쪽 경계), 안쪽(바닥 쪽) 법선.
 * 반환: { x0, z0, x1, z1, n: [nx, 0, nz] }
 */
function faceEdge(tx, ty, side) {
  const x0 = tx * TM, z0 = ty * TM, x1 = x0 + TM, z1 = z0 + TM;
  if (side === 'N') return { x0, z0, x1, z1: z0, n: [0, 0, 1] };
  if (side === 'S') return { x0: x1, z0: z1, x1: x0, z1, n: [0, 0, -1] };
  if (side === 'E') return { x0: x1, z0, x1, z1, n: [-1, 0, 0] };
  return { x0, z0: z1, x1: x0, z1: z0, n: [1, 0, 0] };   // W
}

/**
 * Level 0 을 3D 로 짓는다: 바닥(카펫)·천장(석고)·벽(벽지)·걸레받이.
 * 반환: { group, lightTex, materials, dispose() }
 */
export function buildWorld(level, quality) {
  const map = level.map;
  const lightTex = makeLightTexture(level);
  const mats = makeMaterials(quality, lightTex, level);
  const floor = new QuadBuilder(), ceil = new QuadBuilder(), wall = new QuadBuilder(), base = new QuadBuilder();
  const full = [[0, 0], [1, 0], [1, 1], [0, 1]];
  for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) {
    if (map.isSolid(tx, ty)) continue;
    const x0 = tx * TM, z0 = ty * TM, x1 = x0 + TM, z1 = z0 + TM;
    const uv = [[tx, ty], [tx + 1, ty], [tx + 1, ty + 1], [tx, ty + 1]];   // 칸 단위 (텍스처 1장 = 1칸, 반복)
    floor.quad([x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1], [0, 1, 0], uv);
    ceil.quad([x0, CEIL_H, z0], [x1, CEIL_H, z0], [x1, CEIL_H, z1], [x0, CEIL_H, z1], [0, -1, 0], uv);
  }
  for (const f of wallFaces(map)) {
    const e = faceEdge(f.tx, f.ty, f.side), [nx, , nz] = e.n;
    // 벽지: u 0..1 = 1.5m 폭, v 0(바닥)..1(천장)
    wall.quad([e.x0, 0, e.z0], [e.x1, 0, e.z1], [e.x1, CEIL_H, e.z1], [e.x0, CEIL_H, e.z0], e.n, [[0, 0], [1, 0], [1, 1], [0, 1]]);
    // 걸레받이: 벽에서 1.2cm 띄운 띠
    const o = 0.012, bx0 = e.x0 + nx * o, bz0 = e.z0 + nz * o, bx1 = e.x1 + nx * o, bz1 = e.z1 + nz * o;
    base.quad([bx0, 0, bz0], [bx1, 0, bz1], [bx1, BASE_H, bz1], [bx0, BASE_H, bz0], e.n, full);
  }
  const group = new THREE.Group();
  group.name = 'world';
  for (const [b, m, name] of [[floor, mats.carpet, 'floor'], [ceil, mats.ceiling, 'ceiling'], [wall, mats.wall, 'walls'], [base, mats.baseboard, 'baseboard']]) {
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.name = name;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  return {
    group, lightTex, materials: mats,
    dispose() {
      for (const c of group.children) c.geometry.dispose();
      mats.dispose(); lightTex.dispose();
    },
  };
}
