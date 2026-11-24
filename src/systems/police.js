// ============================================================
//  PoliceSystem — уровень розыска (звёзды), патрули, погоня,
//  стрельба копов, сирена, арест (BUSTED).
// ============================================================

import { Car } from '../entities/car.js';
import { WANTED, PLAYER } from '../config/constants.js';
import { clamp, dist2, angleDelta, rand } from '../core/math.js';

export class PoliceSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
    this.shootT = 0;
  }

  reset() {
    for (const car of this.cars) this.game.removeCar(car);
    this.cars = [];
    this.game.player.wanted = 0;
    this.game.player.heat = 0;
    this.game.audio.siren(false);
  }

  hearShot(x, z) {
    for (const car of this.cars) {
      if (dist2(car.x, car.z, x, z) < 38 * 38) {
        this.game.addHeat(WANTED.shotNearCop, true);
        break;
      }
    }
  }

  anyNear(x, z, r) {
    const r2 = r * r;
    for (const car of this.cars) if (dist2(car.x, car.z, x, z) < r2) return true;
    return false;
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    const pt = g.playerTarget();

    // ---- затухание розыска ----
    if (p.heat > 0 && g.time - g._lastCrimeT > WANTED.decayDelay && !this.anyNear(pt.x, pt.z, WANTED.loseDist)) {
      g.decayHeat(dt);
    }

    const wanted = p.wanted;

    // ---- учёт уничтоженных машин ----
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.wrecked && !car._counted) {
        car._counted = true;
        p.stats.cops++;
        g.addHeat(WANTED.copCarKill);
      }
      if ((car.wrecked && car.wreckTime > 24) || (wanted === 0 && car.leaveT !== undefined && g.time > car.leaveT)) {
        g.removeCar(car);
        this.cars.splice(i, 1);
      } else if (wanted === 0 && car.leaveT === undefined && !car.wrecked) {
        car.leaveT = g.time + 7; // уезжают, когда розыск сбит
      }
    }

    // ---- спавн патрулей ----
    const wantUnits = wanted;
    let guard = 0;
    while (this.cars.length < wantUnits && guard++ < 2) this.spawn(pt);

    // ---- поведение ----
    let nearest = null, nearestD = Infinity;
    for (const car of this.cars) {
      if (car.wrecked) continue;
      this.drive(car, dt, pt);
      const d = dist2(car.x, car.z, pt.x, pt.z);
      if (d < nearestD) { nearestD = d; nearest = car; }
    }

    // ---- сирена ----
    g.audio.siren(this.cars.length > 0 && !nearest?.wrecked, Math.sqrt(nearestD || 1e9));

    // ---- стрельба копов ----
    if (wanted >= 2) {
      this.shootT -= dt;
      if (this.shootT <= 0 && nearest && nearestD < 48 * 48) {
        this.shootT = clamp(1.6 - wanted * 0.15, 0.7, 1.6);
        this.copShoot(nearest, pt);
      }
    }

    // ---- арест ----
    if (p.mode === 'foot' && p.ped) {
      let arresting = false;
      for (const car of this.cars) {
        if (car.wrecked) continue;
        if (car.speed < 3.5 && dist2(car.x, car.z, p.ped.x, p.ped.z) < 7 * 7) { arresting = true; break; }
      }
      if (arresting) {
        p.bustT += dt;
        if (p.bustT > 0.6 && !this._bustWarned) {
          this._bustWarned = true;
          g.toast('СТОЯТЬ! ПОЛИЦИЯ!');
        }
        if (p.bustT >= PLAYER.bustedTime) g.busted();
      } else {
        p.bustT = Math.max(0, p.bustT - dt * 2);
        this._bustWarned = false;
      }
    } else {
      p.bustT = 0;
      this._bustWarned = false;
    }
  }

  spawn(pt) {
    const g = this.game;
    const node = g.world.nodeNearRing(pt.x, pt.z, 85, 140);
    const car = new Car(g.engine.scene, 'police', node.x, node.z, Math.atan2(pt.x - node.x, pt.z - node.z), { ai: 'police', driver: 'ai' });
    car.stuckT = 0;
    car.reverseT = 0;
    g.addCar(car);
    this.cars.push(car);
    return car;
  }

  drive(car, dt, pt) {
    const g = this.game;
    const p = g.player;

    // цель: игрок + упреждение
    const pv = p.mode === 'car' && p.car ? p.car.worldVel() : { x: 0, z: 0 };
    let tx = pt.x + pv.x * 0.55;
    let tz = pt.z + pv.z * 0.55;

    if (car.leaveT !== undefined) {
      // розыск сбит — уезжаем прочь
      const dx = car.x - pt.x, dz = car.z - pt.z;
      const d = Math.hypot(dx, dz) || 1;
      tx = car.x + (dx / d) * 60;
      tz = car.z + (dz / d) * 60;
    }

    const a = Math.atan2(tx - car.x, tz - car.z);
    const delta = angleDelta(car.heading, a);

    // застревание -> задний ход
    if (Math.abs(car.vLong) < 0.9) car.stuckT += dt; else car.stuckT = 0;
    if (car.stuckT > 1.3) { car.reverseT = 1.0; car.stuckT = 0; }

    if (car.reverseT > 0) {
      car.reverseT -= dt;
      car.controls.throttle = -1;
      car.controls.steer = clamp(-delta * 2, -1, 1);
      car.controls.handbrake = false;
    } else {
      car.controls.steer = clamp(delta * 2.6, -1, 1);
      const want = car.leaveT !== undefined ? 20 : 33 + p.wanted * 1.6;
      const d = Math.hypot(tx - car.x, tz - car.z);
      const near = d < 12 && car.leaveT === undefined;
      car.controls.throttle = car.vLong < want ? (near ? 0.45 : 1) : -0.4;
      car.controls.handbrake = Math.abs(delta) > 2.4 && car.speed > 9; // разворот
    }

    car.integrate(dt);
    car.collideWorld(g.world, dt);
  }

  copShoot(car, pt) {
    const g = this.game;
    const p = g.player;

    // линия огня
    const dx = pt.x - car.x, dz = pt.z - car.z;
    const d = Math.hypot(dx, dz) || 1;
    const ndx = dx / d, ndz = dz / d;

    // стена между? (грубо)
    const wallT = g.world.raycastBuildings(car.x, car.z, ndx, ndz, d);
    if (wallT < d - 1.5) return;

    const hitChance = 0.4 + g.player.wanted * 0.07;
    const hit = Math.random() < hitChance;
    const spread = hit ? 0 : rand(-2.2, 2.2);

    const ex = pt.x + (hit ? 0 : spread);
    const ez = pt.z + (hit ? 0 : -spread);

    g.weapons.enemyTracer(car.x, 1.1, car.z, ex, 1.0, ez);
    if (dist2(car.x, car.z, pt.x, pt.z) < 70 * 70) g.audio.shot(0.5);

    if (hit) {
      if (p.mode === 'car' && p.car) {
        p.car.lastDamager = 'police';
        p.car.applyDamage(4, g);
        g.playerDamage(rand(2, 4));
      } else {
        g.playerDamage(rand(5, 9));
      }
    }
  }
}
