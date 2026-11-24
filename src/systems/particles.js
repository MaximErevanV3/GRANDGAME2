// ============================================================
//  Частицы: дым, искры, кровь, огонь, вспышки, взрывы + дождь.
//  Points + шейдер, вся симуляция на CPU (кольцевые буферы).
// ============================================================

import * as THREE from 'three';
import { rand } from '../core/math.js';

const VERT = `
  attribute float aSize;
  attribute vec4 aCol;
  varying vec4 vCol;
  uniform float uScale;
  void main() {
    vCol = aCol;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;

const FRAG = `
  uniform sampler2D map;
  varying vec4 vCol;
  void main() {
    vec4 tex = texture2D(map, gl_PointCoord);
    gl_FragColor = vec4(vCol.rgb * tex.rgb, vCol.a * tex.a);
    if (gl_FragColor.a < 0.01) discard;
  }`;

class ParticleFX {
  constructor(scene, cap, texture, additive) {
    this.cap = cap;
    this.cursor = 0;

    this.pos = new Float32Array(cap * 3);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.size = new Float32Array(cap);
    this.growth = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    this.baseCol = new Float32Array(cap * 3);

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(new Float32Array(cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(new Float32Array(cap * 4), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('aSize', this.aSize);
    geo.setAttribute('aCol', this.aCol);
    geo.setDrawRange(0, cap);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture }, uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  setCap(n) { this.points.geometry.setDrawRange(0, Math.min(n, this.cap)); }

  spawn(x, y, z, vx, vy, vz, life, size, growth, r, g, b, a, grav, drag) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.size[i] = size; this.growth[i] = growth;
    this.grav[i] = grav; this.drag[i] = drag;
    this.a0[i] = a;
    this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
  }

  update(dt, pxScale) {
    this.mat.uniforms.uScale.value = pxScale || 300;
    const col = this.aCol.array;
    const sz = this.aSize.array;
    let any = false;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { col[i * 4 + 3] = 0; continue; }
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { col[i * 4 + 3] = 0; continue; }

      const dragF = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dragF;
      this.vel[i * 3 + 1] = (this.vel[i * 3 + 1] - this.grav[i] * dt) * dragF;
      this.vel[i * 3 + 2] *= dragF;

      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.05) this.pos[i * 3 + 1] = 0.05;

      this.size[i] += this.growth[i] * dt;

      const k = this.life[i] / this.maxLife[i];
      col[i * 4] = this.baseCol[i * 3];
      col[i * 4 + 1] = this.baseCol[i * 3 + 1];
      col[i * 4 + 2] = this.baseCol[i * 3 + 2];
      col[i * 4 + 3] = this.a0[i] * k * k;
      sz[i] = this.size[i];
    }
    if (any || this._ever) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this._ever = any;
    }
  }
}

// ============================================================
export class Particles {
  constructor(scene, cap, tex) {
    this.smoke = new ParticleFX(scene, cap, tex.smoke, false);
    this.glow = new ParticleFX(scene, Math.floor(cap * 0.7), tex.glow, true);

    // делегаты: позволяют звать и particles.smoke.spawnSmoke(...), и particles.spawnSmoke(...)
    this.smoke.spawnSmoke = this.spawnSmoke.bind(this);
    this.smoke.spawnDust = this.spawnDust.bind(this);
    this.smoke.spawnBlood = this.spawnBlood.bind(this);
    this.glow.spawnSparks = this.spawnSparks.bind(this);
    this.glow.spawnFire = this.spawnFire.bind(this);
    this.glow.spawnMuzzle = this.spawnMuzzle.bind(this);
    this.glow.spawnExplosion = this.spawnExplosion.bind(this);
  }

  setCaps(n) { this.smoke.setCap(n); this.glow.setCap(n * 0.7 | 0); }

  update(dt, pxScale) {
    this.smoke.update(dt, pxScale);
    this.glow.update(dt, pxScale);
  }

  // --- дым ---
  spawnSmoke(x, y, z, dark = 0.5) {
    const c = 0.55 - dark * 0.3;
    this.smoke.spawn(x, y, z, rand(-0.4, 0.4), rand(0.7, 1.6), rand(-0.4, 0.4),
      rand(1.0, 1.9), rand(0.9, 1.4), 1.2, c, c, c + 0.03, 0.3, 0, 0.8);
  }

  spawnDust(x, y, z) {
    this.smoke.spawn(x, y, z, rand(-1.5, 1.5), rand(1, 2.5), rand(-1.5, 1.5),
      rand(0.4, 0.7), 0.35, 1.6, 0.45, 0.4, 0.34, 0.5, 0, 1.2);
  }

  // --- кровь ---
  spawnBlood(x, y, z, dx = 0, dz = 0) {
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn(
        x, y, z,
        dx * rand(1, 4) + rand(-2.2, 2.2), rand(0.5, 3.2), dz * rand(1, 4) + rand(-2.2, 2.2),
        rand(0.3, 0.55), rand(0.16, 0.3), 0.08,
        0.5, 0.03, 0.03, 0.9, 9.5, 0.4);
    }
  }

  // --- свечение (аддитив) ---
  spawnSparks(x, y, z, n = 6) {
    for (let i = 0; i < n; i++) {
      this.glow.spawn(x, y, z,
        rand(-6, 6), rand(1, 6), rand(-6, 6),
        rand(0.25, 0.6), rand(0.12, 0.2), -0.05,
        1.9, 1.2, 0.5, 1, 12, 0.2);
    }
  }

  spawnFire(x, y, z) {
    this.glow.spawn(x, y, z, rand(-0.6, 0.6), rand(1.8, 3), rand(-0.6, 0.6),
      rand(0.3, 0.6), rand(0.35, 0.6), 1.2, 1.8, 0.75, 0.25, 0.85, -1.5, 1.2);
  }

  spawnMuzzle(x, y, z, dx = 0, dz = 0) {
    this.glow.spawn(x + dx * 0.5, y, z + dz * 0.5, dx * 2, 0.4, dz * 2,
      0.055, 0.5, 5.5, 2.6, 2.0, 1.1, 1, 0, 1);
  }

  spawnExplosion(x, y, z) {
    for (let i = 0; i < 26; i++) {
      const a = rand(0, 6.283), sp = rand(4, 14);
      this.glow.spawn(x, y, z, Math.cos(a) * sp, rand(2, 8), Math.sin(a) * sp,
        rand(0.5, 0.9), rand(1.0, 1.6), 2.6, 1.9, rand(0.55, 0.9), 0.2, 1, -1.2, 1.6);
    }
    this.spawnSparks(x, y + 0.5, z, 18);
    for (let i = 0; i < 10; i++) {
      this.smoke.spawn(x + rand(-1.5, 1.5), y + rand(0, 2), z + rand(-1.5, 1.5),
        rand(-1, 1), rand(2, 4), rand(-1, 1),
        rand(1.6, 2.6), rand(1.8, 2.6), 2.2, 0.16, 0.15, 0.17, 0.42, 0, 0.7);
    }
  }
}

// ============================================================
//  Дождь — рециркулирующие частицы вокруг игрока.
// ============================================================
export class RainFX {
  constructor(scene, count, tex) {
    this.count = count;
    this.pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.pos[i * 3] = rand(-30, 30);
      this.pos[i * 3 + 1] = rand(0, 22);
      this.pos[i * 3 + 2] = rand(-30, 30);
    }

    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);

    const size = new Float32Array(count).fill(1.1);
    const col = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      col[i * 4] = 0.6; col[i * 4 + 1] = 0.72; col[i * 4 + 2] = 0.95; col[i * 4 + 3] = 0.33;
    }
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
    geo.setDrawRange(0, count);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, uScale: { value: 300 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    scene.add(this.points);
    this._pxScale = 300;
  }

  setVisible(v) { this.points.visible = v; }
  setCount(n) { this.points.geometry.setDrawRange(0, Math.min(n, this.count)); }

  update(dt, px, pz, pxScale) {
    this.mat.uniforms.uScale.value = pxScale || this._pxScale;
    this._pxScale = pxScale || this._pxScale;
    const p = this.pos;
    for (let i = 0; i < this.count; i++) {
      p[i * 3 + 1] -= 24 * dt;
      p[i * 3] += 3 * dt;
      if (p[i * 3 + 1] < 0.05 || Math.abs(p[i * 3] - px) > 32 || Math.abs(p[i * 3 + 2] - pz) > 32) {
        p[i * 3] = px + rand(-30, 30);
        p[i * 3 + 1] = rand(16, 24);
        p[i * 3 + 2] = pz + rand(-30, 30);
      }
    }
    this.aPos.needsUpdate = true;
  }
}
