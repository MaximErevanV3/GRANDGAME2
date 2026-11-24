// ============================================================
//  Weapons — пистолет игрока: хитскан, трассеры, вспышки,
//  кровь, урон машинам, перезарядка, прицел. Плюс трассеры
//  стрельбы полиции.
// ============================================================

import * as THREE from 'three';
import { WEAPON, TUNE } from '../config/constants.js';
import { clamp, dist2, pointSegDist, rand } from '../core/math.js';

const TRACERS = 24;

export class Weapons {
  constructor(game) {
    this.game = game;
    this.cd = 0;
    this.mag = WEAPON.mag;
    this.reloading = 0;

    // пул трассеров
    this.tracers = [];
    const geo = new THREE.PlaneGeometry(0.1, 1);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(2.4, 1.7, 0.8),
        transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
        toneMapped: false, side: THREE.DoubleSide
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 4;
      game.engine.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }

    this._crosshair = null;
  }

  reset() {
    this.mag = WEAPON.mag;
    this.reloading = 0;
    this.cd = 0;
  }

  update(dt) {
    const g = this.game;
    if (g.state !== 'playing') return;

    this.cd -= dt;
    const p = g.player;

    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.mag = WEAPON.mag;
    } else if (g.input.justPressed('reload') && this.mag < WEAPON.mag && p.ammoRes > 0) {
      this.startReload();
    }

    if (g.input.isDown('fire') && this.cd <= 0 && this.mag > 0 && this.reloading <= 0) {
      this.shoot();
    }
    if (this.mag === 0 && this.reloading <= 0 && p.ammoRes > 0) this.startReload();

    // трассеры затухают
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.mesh.material.opacity = clamp(t.life / 0.09, 0, 1) * 0.9;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
  }

  startReload() {
    const p = this.game.player;
    if (p.ammoRes <= 0) return;
    this.reloading = WEAPON.reload;
    this.game.audio.reload();
  }

  shoot() {
    const g = this.game;
    const p = g.player;
    this.cd = WEAPON.rate;
    this.mag--;
    p.stats.shots++;

    const aim = g.getAimPoint();

    // позиция ствола
    let mx, mz, my;
    if (p.mode === 'car' && p.car) {
      const car = p.car;
      const rx = Math.cos(car.heading), rz = -Math.sin(car.heading);
      mx = car.x + rx * 1.1;
      mz = car.z + rz * 1.1;
      my = 1.15;
    } else {
      mx = p.ped.x + Math.sin(p.ped.heading) * 0.45;
      mz = p.ped.z + Math.cos(p.ped.heading) * 0.45;
      my = 1.2;
    }

    let dx = aim.x - mx, dz = aim.z - mz;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) {
      dx = Math.sin(p.ped.heading);
      dz = Math.cos(p.ped.heading);
    } else {
      dx /= len; dz /= len;
    }

    const ex = mx + dx * WEAPON.range;
    const ez = mz + dz * WEAPON.range;

    // ---- хитскан ----
    let bestT = g.world.raycastBuildings(mx, mz, dx, dz, WEAPON.range);
    let hitType = bestT < WEAPON.range ? 'wall' : 'none';
    if (bestT === Infinity) bestT = WEAPON.range;

    // пешеходы
    for (const ped of g.peds.list) {
      if (!ped.alive || ped === p.ped) continue;
      const d = pointSegDist(ped.x, ped.z, mx, mz, ex, ez);
      if (d < 0.55) {
        const t = ((ped.x - mx) * dx + (ped.z - mz) * dz);
        if (t > 0 && t < bestT) { bestT = t; hitType = 'ped'; }
      }
    }

    // машины
    for (const car of g.cars) {
      if (car.wrecked || car === p.car) continue;
      const d = pointSegDist(car.x, car.z, mx, mz, ex, ez);
      if (d < 1.75) {
        const t = ((car.x - mx) * dx + (car.z - mz) * dz);
        if (t > 0 && t < bestT) { bestT = t; hitType = 'car'; }
      }
    }

    const hx = mx + dx * bestT;
    const hz = mz + dz * bestT;

    // ---- эффекты ----
    g.particles.glow.spawnMuzzle(mx, my, mz, dx, dz);
    this.spawnTracer(mx, my, mz, hx, 1.05, hz);
    g.audio.shot(1);
    g.onNoise(mx, mz, 45, true);

    if (hitType === 'ped') {
      // ищем жертву заново (ближайшая к точке)
      let victim = null, vd = Infinity;
      for (const ped of g.peds.list) {
        if (!ped.alive || ped === p.ped) continue;
        const d = dist2(ped.x, ped.z, hx, hz);
        if (d < vd) { vd = d; victim = ped; }
      }
      if (victim && vd < 1.2) {
        victim.kill(dx, dz);
        g.peds.bloodBurst(victim.x, victim.z);
        g.onPedKilled(victim, true);
      }
    } else if (hitType === 'car') {
      let victim = null, vd = Infinity;
      for (const car of g.cars) {
        if (car.wrecked || car === p.car) continue;
        const d = dist2(car.x, car.z, hx, hz);
        if (d < vd) { vd = d; victim = car; }
      }
      if (victim && vd < 4) {
        victim.lastDamager = 'player';
        victim.applyDamage(WEAPON.dmgCar, g);
        g.particles.glow.spawnSparks(hx, 0.9, hz, 5);
        if (victim.ai === 'police') g.addHeat(4, true);
      }
    } else if (hitType === 'wall') {
      g.particles.spawnDust(hx, 1.0, hz);
      g.decals.bullet(hx - dx * 0.3, hz - dz * 0.3);
    }
  }

  spawnTracer(x1, y1, z1, x2, y2, z2) {
    const t = this.tracers.find((tr) => tr.life <= 0) || this.tracers[0];
    const dx = x2 - x1, dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const m = t.mesh;
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
    m.rotation.y = Math.atan2(dx, dz);
    m.scale.set(1, 1, len);
    m.visible = true;
    t.life = 0.09;
    m.material.opacity = 0.9;
  }

  enemyTracer(x1, y1, z1, x2, y2, z2) {
    this.spawnTracer(x1, y1, z1, x2, y2, z2);
  }
}
