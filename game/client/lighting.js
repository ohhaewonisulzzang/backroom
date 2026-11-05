import { CONFIG, TS, T } from '../../shared/config.js';
import { castRay, hasLOS } from '../../shared/physics.js';

/**
 * 조명 3단 구성 (Level 0 = 형광등으로 밝은 공간)
 *  1. 형광등 라이트맵  : 레벨 생성 시 계산된 타일 밝기. 어두운 구역만 어둡다. 깜빡이는 등은 매 프레임 갱신.
 *  2. 손전등          : 어두운 구역에서 앞을 비춘다 (밝은 곳에서는 거의 티 안 남).
 *  3. 시야 안개(LOS)  : 벽에 가려 안 보이는 곳은 어둡게. 타일 단위 가시성을 매 프레임 계산하고
 *                      0.15초 정도에 걸쳐 부드럽게 나타나고/사라지게 한다 (뚝뚝 끊기지 않도록).
 *                      엔티티도 그 타일의 가시성 값만큼 서서히 나타난다.
 */
export class LightSystem {
  setLevel(level) {
    this.level = level;
    this.map = level.map;
    const { w, h } = this.map;
    this.vis = new Float32Array(w * h);          // 0(안 보임) ~ 1(보임), 시간에 따라 부드럽게 변함
    this.visTarget = new Uint8Array(w * h);
    this.fogTex = document.createElement('canvas');
    this.fogTex.width = w; this.fogTex.height = h;
    this.fogCtx = this.fogTex.getContext('2d');
    this.fogImg = this.fogCtx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) { this.fogImg.data[i * 4] = 8; this.fogImg.data[i * 4 + 1] = 6; this.fogImg.data[i * 4 + 2] = 1; }

    // 라이트맵: 타일 1개 = 1픽셀, 알파 = 어둠 정도. 부드럽게 확대해서 그린다.
    this.lightmap = document.createElement('canvas');
    this.lightmap.width = w; this.lightmap.height = h;
    const g = this.lightmap.getContext('2d'), img = g.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      img.data[i * 4 + 3] = Math.round(Math.pow(1 - level.tileLight[i], 1.1) * 0.97 * 255);
      img.data[i * 4] = 4; img.data[i * 4 + 1] = 3; img.data[i * 4 + 2] = 0;
    }
    g.putImageData(img, 0, 0);

    // 깜빡이는 형광등 상태
    this.flickers = level.lights.filter(l => l.flicker).map(l => ({ l, off: false, t: Math.random() * 3 }));
  }

  /** 깜빡임 진행. 방금 꺼진 등 목록을 돌려준다 (사운드용) */
  updateFlicker(dt) {
    const toggled = [];          // [{ l: 형광등, off: 꺼졌는지 }] — 소리용
    for (const f of this.flickers) {
      f.t -= dt;
      if (f.t > 0) continue;
      f.off = !f.off;
      f.t = f.off ? 0.04 + Math.random() * 0.25 : (Math.random() < 0.3 ? 0.05 : 0.5 + Math.random() * 4);
      toggled.push({ l: f.l, off: f.off });
    }
    return toggled;
  }

  isLightOn(l) {
    if (!l.flicker) return true;
    const f = this.flickers.find(x => x.l === l);
    return !f || !f.off;
  }

  /**
   * 보는 사람 기준 타일 가시성 갱신.
   * 타일 중심 또는 "보는 사람에게 가장 가까운 지점"까지 시야가 트이면 보이는 타일.
   * (벽 타일은 가까운 면만 보이면 보이는 것으로 처리 → 벽이 통째로 깜빡이지 않음)
   */
  updateVisibility(view, dt, explored, instant = false) {
    const map = this.map, { w, h } = map, R = CONFIG.VIEW_RANGE;
    const tgt = this.visTarget;
    tgt.fill(0);
    if (view) {
      const r = Math.ceil(R / TS) + 1, vx = Math.floor(view.x / TS), vy = Math.floor(view.y / TS);
      for (let ty = Math.max(0, vy - r); ty <= Math.min(h - 1, vy + r); ty++) {
        for (let tx = Math.max(0, vx - r); tx <= Math.min(w - 1, vx + r); tx++) {
          const x0 = tx * TS, y0 = ty * TS;
          const nx = Math.min(Math.max(view.x, x0 + 1), x0 + TS - 1), ny = Math.min(Math.max(view.y, y0 + 1), y0 + TS - 1);
          if (Math.hypot(nx - view.x, ny - view.y) > R) continue;
          const i = ty * w + tx;
          const solid = map.tiles[i] === T.WALL;
          const seen = hasLOS(map, view.x, view.y, nx, ny) ||
            (!solid && hasLOS(map, view.x, view.y, x0 + TS / 2, y0 + TS / 2));
          if (seen) { tgt[i] = 1; if (explored) explored[i] = 1; }
        }
      }
    }
    const k = instant ? 1 : 1 - Math.exp(-dt * 12), a = this.fogImg.data, F = CONFIG.FOG_ALPHA * 255;
    for (let i = 0; i < w * h; i++) {
      this.vis[i] += (tgt[i] - this.vis[i]) * k;
      a[i * 4 + 3] = F * (1 - this.vis[i]);
    }
    this.fogCtx.putImageData(this.fogImg, 0, 0);
  }

  /** 월드 좌표의 가시성 (0~1): 엔티티를 서서히 보이게 할 때 사용. 타일 사이를 보간 */
  visibilityAt(x, y) {
    const { w, h } = this.map;
    const fx = x / TS - 0.5, fy = y / TS - 0.5;
    const x0 = Math.max(0, Math.min(w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
    const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const v = this.vis;
    const top = v[y0 * w + x0] * (1 - tx) + v[y0 * w + x1] * tx;
    const bot = v[y1 * w + x0] * (1 - tx) + v[y1 * w + x1] * tx;
    return top * (1 - ty) + bot * ty;
  }

  flashlight(p, intensity) {
    const map = this.map, L = { x: p.x, y: p.y, intensity, cone: null, ambient: null };
    if (p.flashlight) {
      const n = CONFIG.CONE_RAYS, fov = CONFIG.FOV, R = CONFIG.LIGHT_RANGE;
      L.cone = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) {
        const a = p.angle - fov / 2 + (fov * i) / n;
        const d = castRay(map, p.x, p.y, a, R, null);
        L.cone[i * 2] = p.x + Math.cos(a) * d;
        L.cone[i * 2 + 1] = p.y + Math.sin(a) * d;
      }
    }
    const an = CONFIG.AMBIENT_RAYS, ar = CONFIG.AMBIENT_RANGE;
    L.ambient = new Float32Array(an * 2);
    for (let i = 0; i < an; i++) {
      const a = (i / an) * Math.PI * 2;
      const d = castRay(map, p.x, p.y, a, ar, null);
      L.ambient[i * 2] = p.x + Math.cos(a) * d;
      L.ambient[i * 2 + 1] = p.y + Math.sin(a) * d;
    }
    return L;
  }

  /** 어둠 레이어(라이트맵 + 깜빡임 + 손전등)를 lctx 에 그린다 */
  drawDarkness(lctx, W, H, world, flashlights, flares = [], time = 0) {
    const map = this.map;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.clearRect(0, 0, W, H);
    lctx.setTransform(...world);
    lctx.imageSmoothingEnabled = true;
    lctx.drawImage(this.lightmap, 0, 0, map.w, map.h, 0, 0, map.w * TS, map.h * TS);

    // 꺼진 순간의 형광등 → 그 주변이 잠깐 어두워짐
    for (const f of this.flickers) {
      if (!f.off) continue;
      const r = CONFIG.LIGHTS.RADIUS * TS * 0.9;
      const gr = lctx.createRadialGradient(f.l.x, f.l.y, 0, f.l.x, f.l.y, r);
      gr.addColorStop(0, 'rgba(4,3,0,0.6)'); gr.addColorStop(1, 'rgba(4,3,0,0)');
      lctx.fillStyle = gr;
      lctx.fillRect(f.l.x - r, f.l.y - r, r * 2, r * 2);
    }

    lctx.globalCompositeOperation = 'destination-out';
    for (const f of flares) {   // 조명탄: 붉은 불빛이 지글지글 흔들림
      const left = f.until - time, k = Math.min(1, left / 3), r = CONFIG.LIGHT_RANGE * 0.62 * (0.9 + Math.random() * 0.12);
      const gr = lctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      gr.addColorStop(0, `rgba(0,0,0,${0.95 * k})`); gr.addColorStop(0.6, `rgba(0,0,0,${0.6 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.fillStyle = gr; lctx.fillRect(f.x - r, f.y - r, r * 2, r * 2);
    }
    for (const L of flashlights) {
      if (L.cone) {
        const n = L.cone.length / 2 - 1;
        fillPoly(lctx, L.cone, 0, n, L.x, L.y, CONFIG.LIGHT_RANGE, 0.75 * L.intensity, true);
        fillPoly(lctx, L.cone, Math.floor(n * 0.2), Math.ceil(n * 0.8), L.x, L.y, CONFIG.LIGHT_RANGE * 0.9, 0.9 * L.intensity, true);
      }
      fillPoly(lctx, L.ambient, 0, L.ambient.length / 2 - 1, L.x, L.y, CONFIG.AMBIENT_RANGE, 0.75, false);
    }
    lctx.globalCompositeOperation = 'source-over';
  }

  /** 시야 밖 안개: 타일 해상도 가시성 텍스처를 부드럽게 확대해서 그린다 */
  drawFog(fctx, W, H, world) {
    const map = this.map;
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalCompositeOperation = 'source-over';
    fctx.clearRect(0, 0, W, H);
    fctx.fillStyle = `rgba(8,6,1,${CONFIG.FOG_ALPHA})`;
    fctx.fillRect(0, 0, W, H);                       // 맵 바깥
    fctx.setTransform(...world);
    fctx.clearRect(0, 0, map.w * TS, map.h * TS);
    fctx.imageSmoothingEnabled = true;
    fctx.drawImage(this.fogTex, 0, 0, map.w, map.h, 0, 0, map.w * TS, map.h * TS);
  }

  /** 켜진 형광등 아래 따뜻한 빛 웅덩이 (화면 근처만) */
  drawLightPools(ctx, cam, vw, vh, time) {
    ctx.globalCompositeOperation = 'lighter';
    const r = TS * 1.7, tint = this.level.info?.lightTint || '255,244,200';
    for (const l of this.level.lights) {
      if (l.x < cam.x - r || l.x > cam.x + vw + r || l.y < cam.y - r || l.y > cam.y + vh + r) continue;
      if (!this.isLightOn(l)) continue;
      const a = 0.09 + Math.sin(time * 50 + l.x) * 0.006;
      const gr = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      gr.addColorStop(0, `rgba(${tint},${tint === '255,244,200' ? a : a * 2.2})`); gr.addColorStop(1, `rgba(${tint},0)`);
      ctx.fillStyle = gr;
      ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function fillPoly(g, pts, from, to, ox, oy, radius, strength, fromOrigin) {
  const gr = g.createRadialGradient(ox, oy, 0, ox, oy, radius);
  gr.addColorStop(0, `rgba(0,0,0,${strength})`);
  gr.addColorStop(0.55, `rgba(0,0,0,${strength * 0.8})`);
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.beginPath();
  if (fromOrigin) g.moveTo(ox, oy); else g.moveTo(pts[from * 2], pts[from * 2 + 1]);
  for (let i = from; i <= to; i++) g.lineTo(pts[i * 2], pts[i * 2 + 1]);
  g.closePath();
  g.fill();
}
