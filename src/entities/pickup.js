// ============================================================
//  Pickups — аптечки и патроны, светящиеся, с респауном.
// ============================================================

import * as THREE from 'three';
import { PICKUP } from '../config/constants.js';
import { dist2 } from '../core/math.js';

function crossGeometry() {
  const a = new THREE.BoxGeometry(0.55, 0.42, 0.2);
  const b = new THREE.BoxGeometry(0.2, 0.42, 0.55);
  return { a, b };
}

export class PickupSystem {
  constructor(game) {
    this.game = game;
    this.items = [];
    const scene = game.engine.scene;

    const cross = crossGeometry();
    const healthMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 0.5), toneMapped: false });
    const ammoMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 1.4, 0.2), toneMapped: false });
    const boxGeo = new THREE.BoxGeometry(0.42, 0.32, 0.3);

    for (const spot of game.world.pickupSpots) {
      let mesh;
      if (spot.kind === 'health') {
        mesh = new THREE.Group();
        const m1 = new THREE.Mesh(cross.a, healthMat);
        const m2 = new THREE.Mesh(cross.b, healthMat);
        mesh.add(m1, m2);
      } else {
        mesh = new THREE.Mesh(boxGeo, ammoMat);
      }
      mesh.position.set(spot.x, 0.9, spot.z);
      scene.add(mesh);

      // световая лужа под пикапом
      const poolGeo = new THREE.PlaneGeometry(4.5, 4.5);
      poolGeo.rotateX(-Math.PI / 2);
      const poolMat = new THREE.MeshBasicMaterial({
        map: game.world.tex.glow,
        color: spot.kind === 'health' ? 0x1fbb55 : 0xd9c31e,
        transparent: true, opacity: 0.35,
        blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
      });
      const pool = new THREE.Mesh(poolGeo, poolMat);
      pool.position.set(spot.x, 0.028, spot.z);
      pool.renderOrder = 3;
      scene.add(pool);

      this.items.push({ spot, mesh, pool, active: true, timer: 0, t: Math.random() * 10 });
    }
  }

  update(dt, t) {
    const g = this.game;
    const p = g.player;

    for (const it of this.items) {
      it.t += dt;
      // вращение и покачивание
      it.mesh.rotation.y = it.t * 2.2;
      it.mesh.position.y = 0.9 + Math.sin(it.t * 3) * 0.12;

      if (!it.active) {
        it.timer -= dt;
        if (it.timer <= 0) {
          it.active = true;
          it.mesh.visible = true;
          it.pool.visible = true;
        }
        continue;
      }

      if (g.state !== 'playing') continue;

      // подбор (и пешком, и из машины)
      const tx = p.mode === 'car' ? p.car.x : p.ped.x;
      const tz = p.mode === 'car' ? p.car.z : p.ped.z;
      if (dist2(tx, tz, it.spot.x, it.spot.z) < (p.mode === 'car' ? 7.3 : 2.6)) {
        if (it.spot.kind === 'health' && p.health < 100) {
          p.health = Math.min(100, p.health + PICKUP.health);
          g.toast('+25 ЗДОРОВЬЕ');
        } else if (it.spot.kind === 'ammo') {
          p.ammoRes += 24;
          g.toast('+24 ПАТРОНА');
        } else {
          continue; // здоровье полное — не сгораем
        }
        g.audio.pickup();
        it.active = false;
        it.timer = PICKUP.respawn;
        it.mesh.visible = false;
        it.pool.visible = false;
      }
    }
  }
}
