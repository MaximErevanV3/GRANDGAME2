// ============================================================
//  PedSystem — толпа: спавн вокруг игрока, маршруты по
//  тротуарам, паника, сбивание машинами, кровь и трупы.
// ============================================================

import { Ped } from '../entities/ped.js';
import { PED, TUNE } from '../config/constants.js';
import { dist2 } from '../core/math.js';

export class PedSystem {
  constructor(game) {
    this.game = game;
    this.list = [];
  }

  get target() { return this.game.preset.peds; }

  update(dt) {
    const g = this.game;
    const pt = g.playerTarget();

    // чистка
    for (let i = this.list.length - 1; i >= 0; i--) {
      const ped = this.list[i];
      if (ped === g.player.ped) continue;
      if (ped.state === 'dead' && ped.group.position.y < -1.5) {
        ped.dispose();
        this.list.splice(i, 1);
        continue;
      }
      if (dist2(ped.x, ped.z, pt.x, pt.z) > PED.despawnFar * PED.despawnFar) {
        ped.dispose();
        this.list.splice(i, 1);
      }
    }

    // спавн
    let guard = 0;
    while (this.list.length < this.target && guard++ < 2) this.spawn(pt);

    // обновление + сбивание машинами
    for (const ped of this.list) {
      if (ped === g.player.ped) continue;
      ped.update(dt, this);
      if (ped.alive) this.checkCarHits(ped);
    }
  }

  spawn(pt) {
    const g = this.game;
    const ring = g.world.ringNear(pt.x, pt.z, PED.spawnMin, PED.spawnMax);
    const ci = (Math.random() * 4) | 0;
    const corner = ring.corners[ci];
    if (dist2(corner.x, corner.z, pt.x, pt.z) < 18 * 18) return null;
    const ped = new Ped(g.engine.scene, { x: corner.x, z: corner.z });
    ped.ring = ring;
    ped.cornerIdx = ci;
    ped.setWaypoint(ring.corners[(ci + 1) % 4]);
    this.list.push(ped);
    return ped;
  }

  // следующий угол тротуарного кольца
  nextCorner(ped) {
    if (!ped.ring) return;
    const dir = Math.random() < 0.75 ? 1 : -1; // в основном вперёд
    ped.cornerIdx = (ped.cornerIdx + dir + 4) % 4;
    ped.setWaypoint(ped.ring.corners[ped.cornerIdx]);
  }

  retarget(ped) {
    // после паники — к ближайшему углу какого-нибудь кольца
    const g = this.game;
    ped.ring = g.world.ringNear(ped.x, ped.z, 0, 200);
    let best = 0, bd = Infinity;
    ped.ring.corners.forEach((c, i) => {
      const d = dist2(c.x, c.z, ped.x, ped.z);
      if (d < bd) { bd = d; best = i; }
    });
    ped.cornerIdx = best;
    ped.setWaypoint(ped.ring.corners[best]);
    ped.state = 'walk';
  }

  remove(ped) {
    const i = this.list.indexOf(ped);
    if (i >= 0) this.list.splice(i, 1);
  }

  panic(x, z, r) {
    const r2 = r * r;
    for (const ped of this.list) {
      if (!ped.alive || ped === this.game.player.ped) continue;
      if (dist2(ped.x, ped.z, x, z) < r2) ped.fleeFrom(x, z);
    }
  }

  spawnFleeing(x, z) {
    const ped = new Ped(this.game.engine.scene, { x, z });
    ped.fleeFrom(x, z);
    this.list.push(ped);
    return ped;
  }

  bloodBurst(x, z) {
    const g = this.game;
    g.particles.spawnBlood(x, 1.0, z);
    g.decals.blood(x, z);
  }

  checkCarHits(ped) {
    const g = this.game;
    for (const car of g.cars) {
      const dx = ped.x - car.x, dz = ped.z - car.z;
      if (Math.abs(dx) > 3.6 || Math.abs(dz) > 3.6) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const lf = dx * fx + dz * fz;
      const lr = dx * fz - dz * fx;
      if (Math.abs(lf) > car.cfg.l / 2 + 0.5 || Math.abs(lr) > car.cfg.w / 2 + 0.45) continue;

      const sp = car.speed;
      if (sp > TUNE.killSpeed) {
        const v = car.worldVel();
        const s = sp || 1;
        const byPlayer = car === g.player.car;
        ped.kill(v.x / s, v.z / s);
        this.bloodBurst(ped.x, ped.z);
        g.audio.impact(6);
        car.vLong *= 0.9;
        if (byPlayer) {
          g.cameraSys.shake(0.25);
          g.hud.flashDamage(0.2);
          g.onPedKilled(ped, true);
        }
      } else if (sp > 1.5) {
        const v = car.worldVel();
        const s = sp || 1;
        ped.stumble(v.x / s, v.z / s);
      }
    }
  }

  kill(ped, byPlayer) {
    if (!ped.alive) return;
    ped.kill(0, 1);
    this.bloodBurst(ped.x, ped.z);
    this.game.onPedKilled(ped, byPlayer);
  }
}
