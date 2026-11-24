// ============================================================
//  World — сборка города + запросы коллайдеров, навигация.
// ============================================================

import * as THREE from 'three';
import { TextureFactory } from './textures.js';
import { CityGenerator } from './city.js';
import { CITY } from '../config/constants.js';

export class World {
  constructor(engine) {
    this.engine = engine;
    const maxAniso = Math.min(8, engine.renderer.capabilities.getMaxAnisotropy());
    this.tex = new TextureFactory(maxAniso);
    this.city = new CityGenerator(this.tex);
    engine.scene.add(this.city.group);

    this.nodes = this.city.nodes;
    this.parkedSpawns = this.city.parkedSpawns;
    this.pickupSpots = this.city.pickupSpots;
    this.pedRings = this.city.pedRings;
    this.blockRects = this.city.blockRects;
    this.playerSpawn = this.city.playerSpawn;
    this.playerCarSpawn = this.city.playerCarSpawn;
  }

  queryColliders(x, z) { return this.city.queryColliders(x, z); }

  // Маршевый рейкаст по AABB зданий (для пуль и LOS полиции)
  raycastBuildings(ox, oz, dx, dz, maxT) {
    const step = 1.4;
    for (let t = step; t < maxT; t += step) {
      const px = ox + dx * t, pz = oz + dz * t;
      const list = this.city.queryColliders(px, pz);
      for (const c of list) {
        if (px >= c.x0 && px <= c.x1 && pz >= c.z0 && pz <= c.z1) return t;
      }
    }
    return Infinity;
  }

  randomNode() {
    const i = 1 + Math.floor(Math.random() * (CITY.N - 1));
    const j = 1 + Math.floor(Math.random() * (CITY.N - 1));
    return this.nodes[i][j];
  }

  // Узел в кольце расстояний от точки
  nodeNearRing(x, z, rMin, rMax) {
    for (let tries = 0; tries < 40; tries++) {
      const n = this.randomNode();
      const d = Math.hypot(n.x - x, n.z - z);
      if (d >= rMin && d <= rMax) return n;
    }
    return this.randomNode();
  }

  // Тротуарное кольцо около точки
  ringNear(x, z, rMin, rMax) {
    for (let tries = 0; tries < 40; tries++) {
      const r = this.pedRings[(Math.random() * this.pedRings.length) | 0];
      const c = r.corners[0];
      const d = Math.hypot(c.x - x, c.z - z);
      if (d >= rMin && d <= rMax) return r;
    }
    return this.pedRings[(Math.random() * this.pedRings.length) | 0];
  }

  update(dt, t) { this.city.update(dt, t); }
}
