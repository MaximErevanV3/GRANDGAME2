// ============================================================
//  CameraSystem — камера в стиле GTA2: вращается за машиной,
//  отдаляется на скорости, тряска при ударах, орбита в меню.
// ============================================================

import { settings } from '../config/settings.js';
import { clamp, damp, lerpAngle } from '../core/math.js';

const PITCH = 1.08; // ~62 градуса сверху

export class CameraSystem {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.dist = 16;
    this.trauma = 0;
    this.menuT = 0.6;
  }

  snap(t) {
    this.yaw = t.heading;
    this.dist = 16;
    const fx = Math.sin(t.heading), fz = Math.cos(t.heading);
    this.camera.position.set(t.x - fx * 10, 14, t.z - fz * 10);
    this.camera.lookAt(t.x, 1, t.z);
  }

  shake(n) {
    if (settings.shake) this.trauma = Math.min(1, this.trauma + n);
  }

  update(dt, game) {
    if (game.state === 'menu') {
      this.menuT += dt * 0.04;
      const R = 96;
      const a = this.menuT;
      this.camera.position.set(Math.sin(a) * R, 64, Math.cos(a) * R);
      this.camera.lookAt(0, 4, 0);
      this.yaw = a;
      return;
    }

    const t = game.playerTarget();
    this.yaw = lerpAngle(this.yaw, t.heading, 3.2, dt);

    const targetDist = game.player.mode === 'car'
      ? 14.5 + clamp(t.speed / 40, 0, 1) * 9.5
      : 11.5;
    this.dist = damp(this.dist, targetDist, 2.0, dt);

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const back = this.dist * Math.cos(PITCH);
    const height = this.dist * Math.sin(PITCH);

    let px = t.x - fx * back, pz = t.z - fz * back;

    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.7;
      px += (Math.random() * 2 - 1) * s;
      pz += (Math.random() * 2 - 1) * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
    }

    this.camera.position.set(px, height, pz);
    this.camera.lookAt(t.x + fx * 6.5, 1.4, t.z + fz * 6.5);
  }
}
