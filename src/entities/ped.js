// ============================================================
//  Ped — пешеход: ходьба по тротуарам, паника, «рэгдолл», кровь.
//  Игрок пешком — тоже Ped (isPlayer).
// ============================================================

import * as THREE from 'three';
import { PED } from '../config/constants.js';
import { pick, clamp, damp } from '../core/math.js';

const CLOTHES = [0x4a6a8a, 0x8a4a5a, 0x6a8a4a, 0x8a7a4a, 0x5a4a8a, 0x3f5875, 0x74584f, 0x2f4f4f];
const PANTS_COLOR = 0x1f232a;
const SKIN = 0xd6a886;

const legGeo = new THREE.BoxGeometry(0.16, 0.52, 0.16);
legGeo.translate(0, -0.26, 0);
const armGeo = new THREE.BoxGeometry(0.11, 0.44, 0.13);
armGeo.translate(0, -0.2, 0);
const torsoGeo = new THREE.BoxGeometry(0.44, 0.6, 0.26);
const headGeo = new THREE.SphereGeometry(0.145, 8, 6);

const pantsMat = new THREE.MeshStandardMaterial({ color: PANTS_COLOR, roughness: 0.9 });
const skinMat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.7 });

export class Ped {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.isPlayer = !!opts.isPlayer;

    const clothColor = this.isPlayer ? 0x1d2b38 : pick(CLOTHES);
    this.clothMat = new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.85 });

    this.torso = new THREE.Mesh(torsoGeo, this.clothMat);
    this.torso.position.y = 0.86;
    this.torso.castShadow = true;
    this.head = new THREE.Mesh(headGeo, skinMat);
    this.head.position.y = 1.3;

    this.legL = new THREE.Mesh(legGeo, pantsMat);
    this.legL.position.set(-0.11, 0.54, 0);
    this.legR = new THREE.Mesh(legGeo, pantsMat);
    this.legR.position.set(0.11, 0.54, 0);
    this.armL = new THREE.Mesh(armGeo, this.clothMat);
    this.armL.position.set(-0.28, 1.06, 0);
    this.armR = new THREE.Mesh(armGeo, this.clothMat);
    this.armR.position.set(0.28, 1.06, 0);

    this.group = new THREE.Group();
    this.group.add(this.torso, this.head, this.legL, this.legR, this.armL, this.armR);
    scene.add(this.group);

    // --- состояние ---
    this.x = opts.x || 0;
    this.z = opts.z || 0;
    this.heading = opts.heading || 0;
    this.state = 'walk';        // walk | flee | dead
    this.wp = null;             // {x,z} точка маршрута
    this.fleeDir = { x: 0, z: 1 };
    this.fleeT = 0;
    this.phase = 0;
    this.curSpeed = 0;
    this.deadT = 0;
    this._sync();
  }

  setPos(x, z, heading) {
    this.x = x; this.z = z;
    if (heading !== undefined) this.heading = heading;
    this._sync();
  }

  setWaypoint(wp) { this.wp = wp; this.state = 'walk'; }

  fleeFrom(x, z) {
    if (this.state === 'dead') return;
    const dx = this.x - x, dz = this.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.fleeDir = { x: dx / d, z: dz / d };
    this.state = 'flee';
    this.fleeT = 3 + Math.random() * 4;
  }

  stumble(dx, dz) {
    this.x += dx * 0.6;
    this.z += dz * 0.6;
    this.fleeFrom(this.x - dx, this.z - dz);
  }

  // Управление игроком
  moveDir(dx, dz, speed) {
    this.heading = Math.atan2(dx, dz);
    const step = speed;
    this.x += dx * step;
    this.z += dz * step;
    this.curSpeed = speed;
  }

  idle() { this.curSpeed = 0; }

  kill(dirX = 0, dirZ = 1) {
    if (this.state === 'dead') return false;
    this.state = 'dead';
    this.deadT = 0;
    this.x += dirX * 1.1;
    this.z += dirZ * 1.1;
    this.curSpeed = 0;
    return true;
  }

  get alive() { return this.state !== 'dead'; }

  update(dt, mgr) {
    if (this.state === 'dead') {
      this.deadT += dt;
      // падение
      const fall = clamp(this.deadT / 0.28, 0, 1);
      this.group.rotation.x = -Math.PI / 2 * fall;
      this.group.position.y = 0.55 * (1 - fall) + 0.12 * fall;
      if (this.deadT > PED.deadFade) {
        this.group.position.y -= dt * 0.3;
        if (this.group.position.y < -1.6 && mgr) mgr.remove(this);
      }
      this.group.position.x = this.x;
      this.group.position.z = this.z;
      return;
    }

    if (!this.isPlayer) {
      let sp = 0;
      if (this.state === 'flee') {
        sp = PED.flee;
        this.fleeT -= dt;
        // лёгкий дрейф направления паники
        const a = Math.atan2(this.fleeDir.x, this.fleeDir.z) + (Math.random() - 0.5) * dt * 2;
        this.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
        this.heading = a;
        if (this.fleeT <= 0 && mgr) mgr.retarget(this);
      } else if (this.wp) {
        const dx = this.wp.x - this.x, dz = this.wp.z - this.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.7) {
          if (mgr) mgr.nextCorner(this);
        } else {
          sp = PED.walk;
          this.heading = Math.atan2(dx, dz);
          const step = Math.min(sp * dt, d);
          this.x += (dx / d) * step;
          this.z += (dz / d) * step;
        }
      }
      this.curSpeed = sp;
      if (sp > 0) this.phase += sp * dt * 2.6;
    }

    // анимация ног/рук
    const amp = this.curSpeed > 3 ? 0.62 : 0.5;
    const s = Math.sin(this.phase) * amp * clamp(this.curSpeed / 2, 0, 1);
    this.legL.rotation.x = s;
    this.legR.rotation.x = -s;
    this.armL.rotation.x = -s * 0.7;
    this.armR.rotation.x = s * 0.7;

    this._sync();
  }

  _sync() {
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    if (this.state !== 'dead') this.group.rotation.y = this.heading;
  }

  dispose() {
    this.scene.remove(this.group);
    this.clothMat.dispose();
  }
}
