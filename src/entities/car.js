// ============================================================
//  Car — физика в стиле GTA2 (продольная/боковая скорость,
//  дрифт с ручника, столкновения, урон, взрывы) + рендер.
//  Колёса всех машин — один глобальный InstancedMesh.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR_TYPES, TUNE, QUALITY } from '../config/constants.js';
import { settings } from '../config/settings.js';
import { clamp, damp } from '../core/math.js';

// ---------- Общие геометрии кузовов (кэш по типу) ----------
const geoCache = new Map();

function buildCarGeo(type) {
  const c = CAR_TYPES[type];
  const w = c.w, l = c.l;

  // Кузов: шасси + кабина + бамперы, вершинные цвета для тонировки
  const chassis = new THREE.BoxGeometry(w, 0.5, l);
  chassis.translate(0, 0.55, 0);
  colorize(chassis, 1, 1, 1);
  const cabin = new THREE.BoxGeometry(w * 0.82, 0.46, l * 0.4);
  cabin.translate(0, 1.02, -l * 0.08);
  colorize(cabin, 0.2, 0.22, 0.26);
  const bumpF = new THREE.BoxGeometry(w * 0.98, 0.26, 0.32);
  bumpF.translate(0, 0.42, l / 2 + 0.02);
  colorize(bumpF, 0.3, 0.32, 0.36);
  const bumpR = bumpF.clone();
  bumpR.translate(0, 0, -(l + 0.04));
  const body = mergeGeometries([chassis, cabin, bumpF, bumpR], false);

  // Свет: фары (белые) + габариты (красные) — HDR-цвета для bloom
  const hl = new THREE.BoxGeometry(0.36, 0.18, 0.1);
  hl.translate(-w * 0.32, 0.62, l / 2 + 0.04); colorize(hl, 2.6, 2.4, 1.9);
  const hr = hl.clone(); hr.translate(w * 0.64, 0, 0);
  const tl = new THREE.BoxGeometry(0.34, 0.16, 0.1);
  tl.translate(-w * 0.32, 0.62, -l / 2 - 0.04); colorize(tl, 1.6, 0.18, 0.12);
  const tr = tl.clone(); tr.translate(w * 0.64, 0, 0);
  const glow = mergeGeometries([hl, hr, tl, tr], false);

  return { body, glow };
}

function colorize(g, r, gr, b) {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = r; arr[i * 3 + 1] = gr; arr[i * 3 + 2] = b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

// ---------- Глобальное поле колёс (InstancedMesh) ----------
const WHEEL_MAX = 240;
const _wheelDummy = new THREE.Object3D();

class WheelField {
  constructor(scene) {
    const geo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10);
    geo.rotateZ(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.9 });
    this.mesh = new THREE.InstancedMesh(geo, mat, WHEEL_MAX);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    scene.add(this.mesh);
    this.next = 0;
  }
  register() {
    const idx = this.next;
    this.next += 4;
    this.mesh.count = Math.min(this.next, WHEEL_MAX);
    return idx;
  }
  unregister() { /* слоты не возвращаем — кольца хватает */ }
  write(idx, x, y, z, yaw, steer, spin, front) {
    for (let k = 0; k < 4; k++) {
      const d = _wheelDummy;
      d.position.set(x, y, z);
      d.rotation.set(0, 0, 0);
      d.quaternion.identity();
      const q = new THREE.Quaternion();
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (front && k < 2 ? steer : 0));
      d.quaternion.copy(q);
      d.rotateX(spin);
      d.updateMatrix();
      this.mesh.setMatrixAt(idx + k, d.matrix);
    }
  }
}

let wheelField = null;
export function initWheels(scene) { wheelField = new WheelField(scene); }

// ============================================================
export class Car {
  constructor(scene, type, x, z, heading, opts = {}) {
    this.scene = scene;
    this.type = type;
    this.cfg = CAR_TYPES[type];
    this.x = x; this.z = z;
    this.heading = heading || 0;
    this.vLong = 0; this.vLat = 0;
    this.steerVis = 0;
    this.wheelSpin = 0;
    this.health = this.cfg.health;
    this.controls = { throttle: 0, steer: 0, brake: 0, handbrake: false };
    this.driver = opts.driver || null;   // 'player' | 'ai' | null
    this.ai = opts.ai || null;           // 'traffic' | 'police' | 'parked'
    this.lightsOn = true;
    this.wrecked = false;
    this.burning = 0;
    this.wreckTime = 0;
    this.lastHitT = 0;

    // --- Меши ---
    if (!geoCache.has(type)) geoCache.set(type, buildCarGeo(type));
    const geos = geoCache.get(type);

    const color = opts.color || this.cfg.colors[(Math.random() * this.cfg.colors.length) | 0];
    this.color = color;
    this.bodyMat = new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.35, metalness: 0.55 });
    this.body = new THREE.Mesh(geos.body, this.bodyMat);
    this.body.castShadow = true;
    this.body.receiveShadow = false;

    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.glow = new THREE.Mesh(geos.glow, this.glowMat);

    this.group = new THREE.Group();
    this.group.add(this.body, this.glow);
    scene.add(this.group);

    // Полоса света фар на асфальте (у всех машин — «фальшивые» фары)
    this.poolMat = new THREE.MeshBasicMaterial({
      map: null, // назначается TextureFactory-глоу через setup
      color: 0xfff2cc, transparent: true, opacity: 0.16,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const poolGeo = new THREE.PlaneGeometry(8, 6.5);
    poolGeo.rotateX(-Math.PI / 2);
    this.lightPool = new THREE.Mesh(poolGeo, this.poolMat);
    this.lightPool.position.set(0, 0.03, this.cfg.l / 2 + 4.2);
    this.lightPool.renderOrder = 3;
    this.group.add(this.lightPool);

    // Полицейская «мигалка»
    if (type === 'police') {
      this.barR = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false })
      );
      this.barB = new THREE.Mesh(
        new THREE.BoxGeometry(0.55, 0.2, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x2030ff, toneMapped: false })
      );
      this.barR.position.set(-0.35, 1.32, -this.cfg.l * 0.08);
      this.barB.position.set(0.35, 1.32, -this.cfg.l * 0.08);
      this.group.add(this.barR, this.barB);
      this.strobe = 0;
      // Цветные лужи-строб на земле
      this.strobeR = this._strobeQuad(0xff2222);
      this.strobeB = this._strobeQuad(0x2244ff);
    }

    // Реальные SpotLight-ы — только у машины игрока
    this.spots = null;

    if (wheelField) this.wheelIdx = wheelField.register();
    this._syncMesh();
  }

  _strobeQuad(color) {
    const m = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const g = new THREE.PlaneGeometry(10, 8);
    g.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, 0.026, -1);
    mesh.renderOrder = 3;
    this.group.add(mesh);
    return mesh;
  }

  setupTextures(glowTex) { this.poolMat.map = glowTex; this.poolMat.needsUpdate = true; }

  enablePlayerLights(scene) {
    if (this.spots) return;
    this.spots = [];
    for (const dx of [-this.cfg.w * 0.32, this.cfg.w * 0.32]) {
      const s = new THREE.SpotLight(0xffeecc, 90, 46, 0.52, 0.55, 1.3);
      s.position.set(dx, 0.8, this.cfg.l / 2);
      const tgt = new THREE.Object3D();
      tgt.position.set(dx * 0.8, 0, this.cfg.l / 2 + 16);
      this.group.add(s, tgt);
      s.target = tgt;
      this.spots.push(s);
    }
    this.syncLights();
  }

  disablePlayerLights() {
    if (!this.spots) return;
    for (const s of this.spots) { this.group.remove(s); this.group.remove(s.target); }
    this.spots = null;
  }

  syncLights() {
    const on = this.lightsOn && !this.wrecked;
    if (this.spots) for (const s of this.spots) s.visible = on;
    this.lightPool.visible = on;
    this.glowMat.color.setScalar(on ? 1 : 0.22);
  }

  // ---------- Физика ----------
  worldVel() {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = fz, rz = -fx;
    return {
      x: this.vLong * fx + this.vLat * rx,
      z: this.vLong * fz + this.vLat * rz
    };
  }

  setWorldVel(vx, vz) {
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = fz, rz = -fx;
    this.vLong = vx * fx + vz * fz;
    this.vLat = vx * rx + vz * rz;
  }

  get speed() { return Math.hypot(this.vLong, this.vLat); }
  get kmh() { return Math.abs(this.vLong) * 3.6; }

  integrate(dt) {
    if (this.wrecked) return;
    const c = this.controls;
    const cfg = this.cfg;

    // Руль (сглаживание)
    this.steerVis = damp(this.steerVis, clamp(c.steer, -1, 1), 9, dt);

    // Продольная динамика
    if (c.throttle > 0) {
      const taper = clamp(1 - this.vLong / cfg.maxSpeed, 0, 1);
      this.vLong += cfg.accel * c.throttle * taper * dt;
    } else if (c.throttle < 0) {
      if (this.vLong > 0.6) this.vLong = Math.max(0, this.vLong - cfg.brake * dt);
      else this.vLong = Math.max(-11, this.vLong - cfg.accel * 0.55 * dt);
    }
    if (c.brake) this.vLong = damp(this.vLong, 0, 4.2, dt);

    // Сопротивление
    this.vLong -= (0.0016 * this.vLong * Math.abs(this.vLong) + 1.15 * Math.sign(this.vLong)) * dt;
    if (Math.abs(this.vLong) < 0.02) this.vLong = 0;

    // Боковое сцепление: ручник = скольжение = дрифт
    const grip = c.handbrake ? TUNE.handbrakeGrip : cfg.grip;
    this.vLat *= Math.exp(-grip * dt);
    if (c.handbrake) this.vLong *= Math.exp(-0.35 * dt);

    // Поворот
    const dir = this.vLong >= 0 ? 1 : -1;
    const speedFactor = clamp(Math.abs(this.vLong) / 5, 0, 1) ** 0.8;
    const boost = c.handbrake ? TUNE.yawBoost : 1;
    let dTheta = this.steerVis * cfg.steer * speedFactor * dir * boost * dt;
    // доворот от скольжения
    dTheta += clamp(this.vLat * 0.05, -0.8, 0.8) * dt;
    this.heading += dTheta;

    // Вращение локальных компонент скорости: мировая скорость инертна,
    // кузов повернулся — появляется боковое скольжение (основа дрифта)
    if (dTheta !== 0) {
      const cd = Math.cos(dTheta), sd = Math.sin(dTheta);
      const nLong = this.vLong * cd + this.vLat * sd;
      const nLat = -this.vLong * sd + this.vLat * cd;
      this.vLong = nLong;
      this.vLat = nLat;
    }

    // Движение
    this.x += (this.vLong * Math.sin(this.heading) + this.vLat * Math.cos(this.heading)) * dt;
    this.z += (this.vLong * Math.cos(this.heading) - this.vLat * Math.sin(this.heading)) * dt;

    this.wheelSpin += (this.vLong / 0.34) * dt;
  }

  // Столкновение со зданиями (капсула из 2 кругов)
  collideWorld(world, dt) {
    if (this.wrecked) return;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const r = this.cfg.w / 2 + 0.42;
    let impact = 0;
    for (const off of [this.cfg.l * 0.31, -this.cfg.l * 0.31]) {
      const px = this.x + fx * off, pz = this.z + fz * off;
      const cols = world.queryColliders(px, pz);
      for (const col of cols) {
        const cx = clamp(px, col.x0, col.x1);
        const cz = clamp(pz, col.z0, col.z1);
        let dx = px - cx, dz = pz - cz;
        const d = Math.hypot(dx, dz);
        if (d >= r || d < 1e-6) continue;
        dx /= d; dz /= d;
        const push = r - d;
        this.x += dx * push; this.z += dz * push;
        const v = this.worldVel();
        const vn = v.x * dx + v.z * dz;
        if (vn < 0) {
          const j = -vn * (1 + TUNE.restitution);
          v.x += dx * j; v.z += dz * j;
          v.x *= 0.92; v.z *= 0.92;
          this.setWorldVel(v.x, v.z);
          impact = Math.max(impact, -vn);
        }
      }
    }
    return impact;
  }

  applyDamage(n, game, silent) {
    if (this.wrecked) return;
    this.health -= n;
    if (this.health <= 30 && !this._smoking) this._smoking = true;
    if (this.health <= 0) {
      this.health = 0;
      this.burning = 0.01; // подожжена, взрыв через мгновение
      if (!silent && game) game.onCarIgnited(this);
    }
  }

  update(dt, game) {
    if (this.burning > 0 && !this.wrecked) {
      this.burning += dt;
      // огонь и дым перед взрывом
      if (game && Math.random() < dt * 22) {
        game.particles.glow.spawnFire(this.x + (Math.random() - 0.5), 0.8, this.z);
      }
      if (this.burning > 0.55) this.explode(game);
    }

    if (this.wrecked) {
      this.wreckTime += dt;
      if (game && Math.random() < dt * 6) {
        game.particles.smoke.spawnSmoke(this.x, 1.0, this.z, 0.25);
      }
      this._syncMesh();
      return;
    }

    if (this._smoking && game && Math.random() < dt * 9) {
      game.particles.smoke.spawnSmoke(this.x, 1.05, this.z, 0.55);
    }

    // --- следы шин и дым при скольжении ---
    if (game && game.decals && game.particles) {
      const slipping = Math.abs(this.vLat) > 2.2 || (this.controls.handbrake && Math.abs(this.vLong) > 4.5);
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const rx = fz, rz = -fx;
      const off = -this.cfg.l * 0.31;
      if (slipping) {
        const alpha = clamp((Math.abs(this.vLat) - 3) / 14 + (this.controls.handbrake ? 0.1 : 0), 0.05, 0.42);
        if (!this._skid) this._skid = [null, null];
        for (let i = 0; i < 2; i++) {
          const side = i === 0 ? -1 : 1;
          const wx = this.x + fx * off + rx * side * (this.cfg.w / 2);
          const wz = this.z + fz * off + rz * side * (this.cfg.w / 2);
          const prev = this._skid[i];
          if (prev) {
            const d = Math.hypot(wx - prev.x, wz - prev.z);
            if (d > 0.32) {
              game.decals.skid(prev.x, prev.z, wx, wz, alpha, game.engine.time);
              this._skid[i] = { x: wx, z: wz };
            }
          } else {
            this._skid[i] = { x: wx, z: wz };
          }
          if (Math.abs(this.vLong) > 5 && Math.random() < dt * 10) {
            game.particles.smoke.spawnSmoke(wx, 0.25, wz, 0.75);
          }
        }
      } else {
        this._skid = [null, null];
      }
    }

    // строб полицейских огней
    if (this.type === 'police') {
      this.strobe += dt;
      const phase = (this.strobe * 4) % 2;
      const on = this.driver === 'ai' || this.driver === 'player';
      this.barR.material.color.setRGB(phase < 1 ? 2.4 : 0.15, 0.1, 0.1);
      this.barB.material.color.setRGB(0.1, 0.1, phase < 1 ? 0.15 : 2.4);
      this.strobeR.material.opacity = phase < 1 && on ? 0.5 : 0;
      this.strobeB.material.opacity = phase >= 1 && on ? 0.5 : 0;
    }

    this._syncMesh();
  }

  explode(game) {
    if (this.wrecked) return;
    this.wrecked = true;
    this.burning = 0;
    this.vLong = 0; this.vLat = 0;
    this.bodyMat.color.setHex(0x141414);
    this.bodyMat.roughness = 0.95; this.bodyMat.metalness = 0.1;
    this.glowMat.color.setScalar(0.05);
    this.lightPool.visible = false;
    this.disablePlayerLights();
    if (this.type === 'police') {
      this.strobeR.material.opacity = 0;
      this.strobeB.material.opacity = 0;
      this.barR.material.color.setRGB(0.1, 0, 0);
      this.barB.material.color.setRGB(0, 0, 0.1);
    }
    if (game) game.explosion(this.x, this.z, this);
  }

  _syncMesh() {
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    if (wheelField) {
      const c = this.cfg;
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      const rx = fz, rz = -fx;
      for (let k = 0; k < 4; k++) {
        const front = k < 2;
        const side = k % 2 === 0 ? -1 : 1;
        const off = front ? c.l * 0.31 : -c.l * 0.31;
        const wx = this.x + fx * off + rx * side * (c.w / 2);
        const wz = this.z + fz * off + rz * side * (c.w / 2);
        const d = _wheelDummy;
        d.position.set(wx, 0.34, wz);
        d.rotation.order = 'YXZ';
        d.rotation.set(this.wheelSpin, this.heading + (front ? this.steerVis * 0.5 : 0), 0);
        d.updateMatrix();
        wheelField.mesh.setMatrixAt(this.wheelIdx + k, d.matrix);
      }
      wheelField.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.scene.remove(this.group);
    this.disablePlayerLights();
    this.bodyMat.dispose();
    this.glowMat.dispose();
    this.poolMat.dispose();
  }
}
