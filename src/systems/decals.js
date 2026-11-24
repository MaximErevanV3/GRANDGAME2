// ============================================================
//  Декали: следы шин (GPU-затухание) и кляксы (кровь/гарь).
//  Кольцевые буферы в одной геометрии — минимум draw-call'ов.
// ============================================================

import * as THREE from 'three';
import { rand } from '../core/math.js';

const VERT = `
  attribute float aAlpha;
  attribute float aBirth;
  varying float vA;
  varying float vB;
  varying vec2 vUv;
  void main() {
    vA = aAlpha; vB = aBirth; vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SPLAT_VERT = `
  attribute float aAlpha;
  attribute float aBirth;
  attribute vec3 aTint;
  varying float vA;
  varying float vB;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vA = aAlpha; vB = aBirth; vUv = uv; vTint = aTint;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const SKID_FRAG = `
  uniform float uTime;
  varying float vA; varying float vB; varying vec2 vUv;
  void main() {
    float fade = clamp(1.0 - (uTime - vB) / 30.0, 0.0, 1.0);
    float edge = sin(3.14159265 * vUv.x);
    float a = vA * edge * fade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.03, 0.033, 0.04, a);
  }`;

const SPLAT_FRAG = `
  uniform sampler2D map;
  uniform float uTime;
  varying float vA; varying float vB; varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vec4 tex = texture2D(map, vUv);
    float fade = clamp(1.0 - (uTime - vB) / 26.0, 0.0, 1.0);
    float a = tex.a * vA * fade;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vTint * tex.rgb, a);
  }`;

function makeQuadMesh(scene, count, frag, uniforms, vert = VERT) {
  const pos = new Float32Array(count * 4 * 3);
  const uv = new Float32Array(count * 4 * 2);
  const alpha = new Float32Array(count * 4);
  const birth = new Float32Array(count * 4).fill(-999);
  for (let q = 0; q < count; q++) {
    const b = q * 4;
    uv[b * 2] = 0; uv[b * 2 + 1] = 0;
    uv[(b + 1) * 2] = 1; uv[(b + 1) * 2 + 1] = 0;
    uv[(b + 2) * 2] = 1; uv[(b + 2) * 2 + 1] = 1;
    uv[(b + 3) * 2] = 0; uv[(b + 3) * 2 + 1] = 1;
  }
  const index = new Uint32Array(count * 6);
  for (let q = 0; q < count; q++) {
    const b = q * 4, k = q * 6;
    index[k] = b; index[k + 1] = b + 1; index[k + 2] = b + 2;
    index[k + 3] = b; index[k + 4] = b + 2; index[k + 5] = b + 3;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, ...uniforms },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  scene.add(mesh);
  return { mesh, geo, mat, pos };
}

export class DecalSystem {
  constructor(scene, splatTex) {
    // --- следы шин ---
    this.N = 1400;
    const skid = makeQuadMesh(scene, this.N, SKID_FRAG, {});
    this.skidMesh = skid.mesh;
    this.skidGeo = skid.geo;
    this.skidPos = skid.pos;
    this.skidCursor = 0;

    // --- кляксы ---
    this.M = 96;
    const splat = makeQuadMesh(scene, this.M, SPLAT_FRAG, { map: { value: splatTex } }, SPLAT_VERT);
    this.splatMesh = splat.mesh;
    this.splatGeo = splat.geo;
    this.splatPos = splat.pos;
    this.splatCursor = 0;
    // aTint
    const tint = new Float32Array(this.M * 4 * 3);
    this.splatGeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3).setUsage(THREE.DynamicDrawUsage));
    this.tintArr = tint;

    this.actives = []; // растущие кляксы
  }

  // След от колеса: отрезок (x0,z0)-(x1,z1)
  skid(x0, z0, x1, z1, alpha, time) {
    const q = this.skidCursor;
    this.skidCursor = (this.skidCursor + 1) % this.N;

    let dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return;
    dx /= len; dz /= len;
    const lx = -dz * 0.16, lz = dx * 0.16; // полуширина
    const y = 0.028 + (q % 16) * 0.0005;

    const b = q * 4 * 3;
    const P = this.skidPos;
    P[b] = x0 + lx; P[b + 1] = y; P[b + 2] = z0 + lz;
    P[b + 3] = x0 - lx; P[b + 4] = y; P[b + 5] = z0 - lz;
    P[b + 6] = x1 - lx; P[b + 7] = y; P[b + 8] = z1 - lz;
    P[b + 9] = x1 + lx; P[b + 10] = y; P[b + 11] = z1 + lz;

    const al = this.skidGeo.attributes.aAlpha.array;
    const bi = this.skidGeo.attributes.aBirth.array;
    for (let k = 0; k < 4; k++) {
      al[q * 4 + k] = alpha;
      bi[q * 4 + k] = time;
    }
    this.skidGeo.attributes.position.needsUpdate = true;
    this.skidGeo.attributes.aAlpha.needsUpdate = true;
    this.skidGeo.attributes.aBirth.needsUpdate = true;
  }

  // Клякса: кровь (тёмно-красная) или гарь (чёрная)
  splat(x, z, size, r, g, b, alpha) {
    const q = this.splatCursor;
    this.splatCursor = (this.splatCursor + 1) % this.M;
    const t = this.tintArr;
    for (let k = 0; k < 4; k++) {
      t[(q * 4 + k) * 3] = r;
      t[(q * 4 + k) * 3 + 1] = g;
      t[(q * 4 + k) * 3 + 2] = b;
    }
    this.splatGeo.attributes.aTint.needsUpdate = true;
    this.actives.push({ q, x, z, rot: rand(0, 6.28), size, alpha, age: 0 });
    this._writeSplat(this.actives[this.actives.length - 1], 0.08);
  }

  blood(x, z) { this.splat(x, z, rand(1.2, 1.8), 0.42, 0.03, 0.03, 0.85); }
  scorch(x, z) { this.splat(x, z, rand(5, 7), 0.05, 0.05, 0.06, 0.8); }
  bullet(x, z) { this.splat(x, z, rand(0.25, 0.4), 0.06, 0.06, 0.07, 0.7); }

  _writeSplat(s, scale) {
    const h = s.size / 2 * Math.min(1, scale);
    const cosr = Math.cos(s.rot), sinr = Math.sin(s.rot);
    const y = 0.031;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const P = this.splatPos;
    const b = s.q * 4 * 3;
    for (let k = 0; k < 4; k++) {
      const sx = corners[k][0], sz = corners[k][1];
      P[b + k * 3] = s.x + (sx * cosr - sz * sinr) * h;
      P[b + k * 3 + 1] = y;
      P[b + k * 3 + 2] = s.z + (sx * sinr + sz * cosr) * h;
    }
    const al = this.splatGeo.attributes.aAlpha.array;
    const bi = this.splatGeo.attributes.aBirth.array;
    for (let k = 0; k < 4; k++) {
      al[s.q * 4 + k] = s.alpha;
      bi[s.q * 4 + k] = this._time || 0;
    }
    this.splatGeo.attributes.position.needsUpdate = true;
    this.splatGeo.attributes.aAlpha.needsUpdate = true;
    this.splatGeo.attributes.aBirth.needsUpdate = true;
  }

  update(dt, time) {
    this._time = time;
    this.skidMesh.material.uniforms.uTime.value = time;
    this.splatMesh.material.uniforms.uTime.value = time;
    for (let i = this.actives.length - 1; i >= 0; i--) {
      const s = this.actives[i];
      s.age += dt;
      this._writeSplat(s, s.age * 2.4);
      if (s.age > 27) this.actives.splice(i, 1);
    }
  }
}
