// ============================================================
//  TrafficSystem — гражданский трафик по графу дорог,
//  полосы, торможение перед препятствиями, паника от стрельбы.
// ============================================================

import { Car } from '../entities/car.js';
import { CITY } from '../config/constants.js';
import { clamp, dist2, angleDelta } from '../core/math.js';

const TYPES = ['compact', 'compact', 'taxi', 'compact', 'sport', 'compact', 'taxi'];

export class TrafficSystem {
  constructor(game) {
    this.game = game;
    this.cars = [];
  }

  get target() { return this.game.preset.traffic; }

  update(dt) {
    const g = this.game;
    const pt = g.playerTarget();

    // чистка
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      if (car.driver !== 'ai') { this.cars.splice(i, 1); continue; } // угнана
      if ((car.wrecked && car.wreckTime > 22) || dist2(car.x, car.z, pt.x, pt.z) > 185 * 185) {
        g.removeCar(car);
        this.cars.splice(i, 1);
      }
    }

    // спавн
    let guard = 0;
    while (this.cars.length < this.target && guard++ < 3) this.spawn(pt);

    for (const car of this.cars) this.drive(car, dt);
  }

  spawn(pt) {
    const g = this.game;
    const node = g.world.nodeNearRing(pt.x, pt.z, 75, 135);
    const from = node;
    const to = node.links[(Math.random() * node.links.length) | 0];
    // полоса справа по ходу движения
    const dx = to.x - from.x, dz = to.z - from.z;
    const len = Math.hypot(dx, dz) || 1;
    const ndx = dx / len, ndz = dz / len;
    const rx = ndz, rz = -ndx;

    const car = new Car(g.engine.scene, TYPES[(Math.random() * TYPES.length) | 0],
      from.x + rx * CITY.LANE, from.z + rz * CITY.LANE, Math.atan2(ndx, ndz), { ai: 'traffic', driver: 'ai' });
    car.prevNode = from;
    car.targetNode = to;
    car.cruise = 9.5 + Math.random() * 4.5;
    car.panicT = 0;
    g.addCar(car);
    this.cars.push(car);
    return car;
  }

  drive(car, dt) {
    const g = this.game;
    if (car.wrecked || car.burning || car.driver !== 'ai') return;

    const t = car.targetNode;
    if (!t) return;

    // цель: узел + полоса
    const dx = t.x - car.x, dz = t.z - car.z;
    const d = Math.hypot(dx, dz) || 1;
    const ndx = dx / d, ndz = dz / d;
    const rx = ndz, rz = -ndx;
    const aimX = t.x + rx * CITY.LANE, aimZ = t.z + rz * CITY.LANE;

    const a = Math.atan2(aimX - car.x, aimZ - car.z);
    const delta = angleDelta(car.heading, a);
    car.controls.steer = clamp(delta * 2.3, -1, 1);

    // паника или обычный режим
    const panicked = car.panicT > g.engine.time;
    let want = panicked ? 24 : car.cruise;

    // препятствие впереди?
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
    const probeX = car.x + fx * 8.5, probeZ = car.z + fz * 8.5;
    for (const other of g.cars) {
      if (other === car) continue;
      if (dist2(other.x, other.z, probeX, probeZ) < 11.5) {
        want = Math.min(want, Math.abs(other.vLong) * 0.5);
      }
    }
    if (g.player.ped && g.player.ped.group.visible && dist2(g.player.ped.x, g.player.ped.z, probeX, probeZ) < 7) {
      want = 0;
    }
    for (const ped of g.peds.list) {
      if (!ped.alive) continue;
      if (dist2(ped.x, ped.z, probeX, probeZ) < 5.5) { want = 0; break; }
    }

    const diff = want - car.vLong;
    car.controls.throttle = diff > 0.5 ? clamp(diff / 4, 0.25, 1) : (diff < -2 ? -0.7 : 0);
    car.controls.handbrake = false;

    // прибыли в узел — дальше
    if (d < 6) {
      const links = t.links.filter((n) => n !== car.prevNode);
      const next = (links.length ? links : t.links)[(Math.random() * (links.length || t.links.length)) | 0];
      car.prevNode = t;
      car.targetNode = next;
    }

    car.integrate(dt);
    const impact = car.collideWorld(g.world, dt);
    if (impact > 4 && dist2(car.x, car.z, g.playerTarget().x, g.playerTarget().z) < 50 * 50) {
      g.audio.impact(impact * 0.5);
    }
  }

  panicNear(x, z, r) {
    const r2 = r * r;
    for (const car of this.cars) {
      if (dist2(car.x, car.z, x, z) < r2) {
        car.panicT = this.game.engine.time + 4;
      }
    }
  }
}
