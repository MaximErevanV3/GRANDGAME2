// ============================================================
//  CityGenerator — процедурный ночной город 8x8 кварталов.
//  Дороги, тротуары, башни с окнами, парки, парковки, площадь,
//  фонари, неон, деревья, зебры. Всё мержится в минимум draw-call'ов.
// ============================================================

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, NEON_PALETTE } from '../config/constants.js';
import { rand, randi, pick, clamp } from '../core/math.js';

const Y = {
  ground: 0,
  road: 0.012,
  inter: 0.014,
  cross: 0.02,
  floor: 0.016,   // парки/парковки/площади
  pool: 0.022,    // световые лужи
  sidewalk: 0.07  // половина высоты бордюра
};

function planeUV(g, su, sv) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
}

// UV бокса: стены тайлятся фасадом (плитка 12.8 м), крыша — тёмной полосой
function boxUV(g, w, h, d, phaseU, phaseV) {
  const uv = g.attributes.uv;
  const T = 12.8;
  for (let i = 0; i < 24; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    if (i >= 8 && i < 16) {          // верх/низ — «крыша»
      uv.setXY(i, u * (w / T), 0.05 + v * 0.02);
    } else if (i < 8) {              // +-X: ширина = d
      uv.setXY(i, u * (d / T) + phaseU, v * (h / T) + phaseV);
    } else {                         // +-Z: ширина = w
      uv.setXY(i, u * (w / T) + phaseU, v * (h / T) + phaseV);
    }
  }
}

function addColorAttr(g, r, gg, b) {
  const arr = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) {
    arr[i * 3] = r; arr[i * 3 + 1] = gg; arr[i * 3 + 2] = b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}

function flatQuad(size, x, z, y, r, g, b) {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, y, z);
  addColorAttr(geo, r, g, b);
  return geo;
}

export class CityGenerator {
  constructor(tex) {
    this.tex = tex;

    // --- данные мира ---
    this.colliders = [];
    this.hash = new Map();
    this.blockRects = [];      // {x0,z0,x1,z1,type} — миникарта
    this.parkedSpawns = [];
    this.pickupSpots = [];
    this.pedRings = [];        // {corners:[{x,z}x4]} тротуарные кольца
    this.nodes = [];           // 9x9 перекрёстки
    this.lampPts = [];
    this.treePts = [];
    this.neonFlicker = { t: 0, dip: 0 };

    // --- буферы геометрий ---
    this._road = [];
    this._inter = [];
    this._cross = [];
    this._sidewalk = [];
    this._bld = [[], [], [], []];
    this._floor = { park: [], lot: [], plaza: [] };
    this._pool = [];
    this._neon = [];
    this._antenna = [];
    this._beacon = [];
    this._ac = [];
    this._fountain = null;

    this.group = new THREE.Group();
    this._generate();
  }

  // ================== ГЕНЕРАЦИЯ ==================
  _generate() {
    this._ground();
    this._roads();

    for (let i = 0; i < CITY.N; i++) {
      for (let j = 0; j < CITY.N; j++) {
        this._cell(i, j);
      }
    }

    this._staticMeshes();
    this._lampMeshes();
    this._treeMeshes();
    this._fountainMesh();
    this._nodeGraph();
  }

  _ground() {
    const g = new THREE.PlaneGeometry(900, 900);
    g.rotateX(-Math.PI / 2);
    planeUV(g, 112, 112);
    const m = new THREE.MeshStandardMaterial({
      map: this.tex.asphalt, roughness: 0.9, metalness: 0.08
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = Y.ground;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  _roads() {
    // 9 вертикальных и 9 горизонтальных полос, сегменты по 40 м между перекрёстками
    for (let i = 0; i <= CITY.N; i++) {
      const x = -CITY.HALF + i * CITY.CELL;
      for (let j = 0; j < CITY.N; j++) {
        const z = -CITY.HALF + j * CITY.CELL + CITY.CELL / 2;
        this._seg(x, z, 0);
        this._seg(z, x, Math.PI / 2); // горизонтальная
      }
    }
    // перекрёстки
    for (let i = 0; i <= CITY.N; i++) {
      for (let j = 0; j <= CITY.N; j++) {
        const x = -CITY.HALF + i * CITY.CELL;
        const z = -CITY.HALF + j * CITY.CELL;
        const g = new THREE.PlaneGeometry(CITY.ROAD, CITY.ROAD);
        g.rotateX(-Math.PI / 2);
        planeUV(g, 2, 2);
        g.translate(x, Y.inter, z);
        this._inter.push(g);
        this._crosswalks(x, z);
      }
    }
  }

  _seg(x, z, rotY) {
    const g = new THREE.PlaneGeometry(CITY.ROAD, CITY.CELL - CITY.ROAD);
    g.rotateX(-Math.PI / 2);
    if (rotY) g.rotateY(rotY);
    planeUV(g, 1, 5);
    g.translate(x, Y.road, z);
    this._road.push(g);
  }

  _crosswalks(nx, nz) {
    const off = 9.8;
    for (const [dx, dz, rot] of [[0, -off, 0], [0, off, 0], [-off, 0, Math.PI / 2], [off, 0, Math.PI / 2]]) {
      const g = new THREE.PlaneGeometry(14, 2.5);
      g.rotateX(-Math.PI / 2);
      if (rot) g.rotateY(rot);
      g.translate(nx + dx, Y.cross, nz + dz);
      this._cross.push(g);
    }
  }

  // ================== КВАРТАЛЫ ==================
  _cell(i, j) {
    const cx = -CITY.HALF + i * CITY.CELL + CITY.CELL / 2;
    const cz = -CITY.HALF + j * CITY.CELL + CITY.CELL / 2;
    const centrality = clamp(1 - Math.hypot(cx, cz) / 260, 0, 1);

    // Тип квартала
    let type = 'block';
    if (i === 3 && j === 3) type = 'plaza';                 // стартовая площадь
    else if (i >= 3 && i <= 4 && j >= 3 && j <= 4) type = 'tower';
    else {
      const r = Math.random();
      if (r < 0.12) type = 'park';
      else if (r < 0.22) type = 'parking';
    }

    this.blockRects.push({ x0: cx - 20, z0: cz - 20, x1: cx + 20, z1: cz + 20, type });
    this.pedRings.push({
      corners: [
        { x: cx - 18, z: cz - 18 }, { x: cx + 18, z: cz - 18 },
        { x: cx + 18, z: cz + 18 }, { x: cx - 18, z: cz + 18 }
      ]
    });

    this._sidewalkRing(cx, cz);
    this._lampsAtBlock(cx, cz);

    if (type === 'park') this._park(cx, cz);
    else if (type === 'parking') this._parking(cx, cz);
    else if (type === 'plaza') this._plaza(cx, cz);
    else this._buildings(cx, cz, type, centrality);
  }

  _sidewalkRing(cx, cz) {
    const specs = [
      [40, 7, cx, cz - 18.25], [40, 7, cx, cz + 18.25],
      [7, 33, cx - 18.25, cz], [7, 33, cx + 18.25, cz]
    ];
    for (const [w, d, x, z] of specs) {
      const g = new THREE.BoxGeometry(w, 0.14, d);
      const uv = g.attributes.uv;
      for (let vi = 8; vi < 12; vi++) uv.setXY(vi, uv.getX(vi) * (w / 8), uv.getY(vi) * (d / 8));
      g.translate(x, Y.sidewalk, z);
      this._sidewalk.push(g);
    }
  }

  _lampsAtBlock(cx, cz) {
    const c = 18.7;
    for (const [dx, dz] of [[-c, -c], [c, -c], [c, c], [-c, c]]) {
      this.lampPts.push({ x: cx + dx, z: cz + dz });
      this._pool.push(flatQuad(8.5, cx + dx, cz + dz, Y.pool, 0.5, 0.38, 0.22));
    }
  }

  _park(cx, cz) {
    const g = new THREE.PlaneGeometry(CITY.INNER, CITY.INNER);
    g.rotateX(-Math.PI / 2);
    planeUV(g, 4.125, 4.125);
    g.translate(cx, Y.floor, cz);
    this._floor.park.push(g);

    const n = randi(7, 10);
    let tries = 0;
    while (this.treePts.length < n + this.treePts.length && tries < 60) {
      tries++;
      const x = cx + rand(-13, 13), z = cz + rand(-13, 13);
      if (Math.hypot(x - cx, z - cz) < 4.5) continue;
      if (this.treePts.some(t => Math.hypot(t.x - x, t.z - z) < 4)) continue;
      this.treePts.push({ x, z, s: rand(0.75, 1.35) });
      this.addCollider(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    }
    // пара фонарей в парке
    for (const [dx, dz] of [[-9, 9], [9, -9]]) {
      this.lampPts.push({ x: cx + dx, z: cz + dz });
      this._pool.push(flatQuad(8.5, cx + dx, cz + dz, Y.pool, 0.4, 0.5, 0.35));
    }
    this.pickupSpots.push({ x: cx, z: cz + 8, kind: Math.random() < 0.5 ? 'health' : 'ammo' });
  }

  _parking(cx, cz) {
    const g = new THREE.PlaneGeometry(CITY.INNER, CITY.INNER);
    g.rotateX(-Math.PI / 2);
    planeUV(g, 4.125, 4.125);
    g.translate(cx, Y.floor, cz);
    this._floor.lot.push(g);

    for (let k = 0; k < 5; k++) {
      this.parkedSpawns.push({
        x: cx - 11 + k * 5.5, z: cz + rand(-8.5, -6), heading: Math.PI, type: pick(['compact', 'sport', 'taxi'])
      });
    }
    this.lampPts.push({ x: cx, z: cz + 10 });
    this._pool.push(flatQuad(8.5, cx, cz + 10, Y.pool, 0.5, 0.38, 0.22));
    this.pickupSpots.push({ x: cx, z: cz - 10, kind: 'ammo' });
  }

  _plaza(cx, cz) {
    const g = new THREE.PlaneGeometry(CITY.INNER, CITY.INNER);
    g.rotateX(-Math.PI / 2);
    planeUV(g, 4.125, 4.125);
    g.translate(cx, Y.floor, cz);
    this._floor.plaza.push(g);

    // фонтан в центре
    this._fountain = { x: cx, z: cz };
    this.addCollider(cx - 3.6, cz - 3.6, cx + 3.6, cz + 3.6);
    this._pool.push(flatQuad(11, cx, cz, Y.pool, 0.1, 0.4, 0.5)); // голубая лужа от воды

    // припаркованные машины
    this.parkedSpawns.push({ x: cx - 8, z: cz - 10, heading: Math.PI, type: 'compact' });
    this.parkedSpawns.push({ x: cx - 2, z: cz - 10, heading: Math.PI, type: 'sport' });
    this.parkedSpawns.push({ x: cx + 4, z: cz - 10, heading: Math.PI, type: 'taxi' });

    // старт игрока и его машина
    this.playerSpawn = { x: cx - 6, z: cz + 9 };
    this.playerCarSpawn = { x: cx - 6, z: cz + 12.2, heading: 0 };

    this.pickupSpots.push({ x: cx + 8, z: cz + 8, kind: 'health' });
    this.pickupSpots.push({ x: cx - 10, z: cz - 2, kind: 'ammo' });

    for (const [dx, dz] of [[-12, 12], [12, 12]]) {
      this.lampPts.push({ x: cx + dx, z: cz + dz });
      this._pool.push(flatQuad(8.5, cx + dx, cz + dz, Y.pool, 0.5, 0.38, 0.22));
    }
  }

  _buildings(cx, cz, type, centrality) {
    const variant = randi(0, 3);
    const quads = type === 'tower'
      ? [{ x: 0, z: 0, w: rand(23, 28), d: rand(23, 28), h: 24 + centrality * 20 + rand(0, 14) }]
      : [
          { x: -8.2, z: -8.2, w: rand(11, 15), d: rand(11, 15), h: 9 + centrality * 12 + rand(0, 9) },
          { x: 8.2, z: 8.2, w: rand(11, 15), d: rand(11, 15), h: 9 + centrality * 12 + rand(0, 9) },
          { x: 8.2, z: -8.2, w: rand(11, 15), d: rand(11, 15), h: 9 + centrality * 12 + rand(0, 9) },
          { x: -8.2, z: 8.2, w: rand(11, 15), d: rand(11, 15), h: 9 + centrality * 12 + rand(0, 9) }
        ].filter((_, idx) => idx === 0 || Math.random() < 0.85);

    for (const q of quads) {
      const bx = cx + q.x, bz = cz + q.z;
      const g = new THREE.BoxGeometry(q.w, q.h, q.d);
      boxUV(g, q.w, q.h, q.d, randi(0, 3) * 0.25, randi(0, 3) * 0.25);
      g.translate(bx, q.h / 2, bz);
      this._bld[variant].push(g);
      this.addCollider(bx - q.w / 2, bz - q.d / 2, bx + q.w / 2, bz + q.d / 2);

      // крышные детали
      if (Math.random() < 0.6) {
        const ac = new THREE.BoxGeometry(rand(1.6, 2.6), 1.2, rand(1.6, 2.6));
        ac.translate(bx + rand(-q.w / 3, q.w / 3), q.h + 0.6, bz + rand(-q.d / 3, q.d / 3));
        this._ac.push(ac);
      }
      if (q.h > 16 && Math.random() < 0.75) {
        const aH = rand(3, 7);
        const ax = bx + rand(-q.w / 4, q.w / 4);
        const az = bz + rand(-q.d / 4, q.d / 4);
        const ant = new THREE.BoxGeometry(0.16, aH, 0.16);
        ant.translate(ax, q.h + aH / 2, az);
        this._antenna.push(ant);
        const beak = new THREE.PlaneGeometry(1.15, 1.15);
        beak.rotateX(-Math.PI / 2);
        beak.translate(ax, q.h + aH + 0.35, az);
        this._beacon.push(beak);
      }

      this._neonSign(bx, bz, q.w, q.d, q.h);
    }

    // машины у обочины
    if (Math.random() < 0.3) {
      const side = randi(0, 3);
      const off = 22.6;
      const px = side === 0 ? cx - off : side === 1 ? cx + off : cx + rand(-12, 12);
      const pz = side === 2 ? cz - off : side === 3 ? cz + off : cz + rand(-12, 12);
      this.parkedSpawns.push({
        x: px, z: pz,
        heading: side < 2 ? Math.PI / 2 : 0,
        type: pick(['compact', 'sport', 'taxi'])
      });
    }
  }

  _neonSign(bx, bz, w, d, h) {
    if (h < 12 || Math.random() > 0.5) return;
    const texInfo = this.tex.neon;
    const cell = randi(0, texInfo.count - 1);
    const col = cell % texInfo.cols, row = (cell / texInfo.cols) | 0;
    const su = 1 / texInfo.cols, sv = 0.5;

    // сторона к дороге: выбираем по позиции под-здания
    const east = bx > 0 ? -1 : 1; // к внешнему краю клетки
    const facing = Math.random() < 0.5 ? 0 : 1; // 0: +-X, 1: +-Z
    let x, z, rotY;
    if (facing === 0) {
      x = bx + (east > 0 ? -w / 2 - 0.28 : w / 2 + 0.28);
      z = bz;
      rotY = east > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
      x = bx;
      z = bz + (bz > 0 ? d / 2 + 0.28 : -d / 2 - 0.28);
      rotY = bz > 0 ? 0 : Math.PI;
    }
    const y = clamp(rand(8, h - 3), 7, 40);

    const g = new THREE.PlaneGeometry(6, 2.2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, col * su + uv.getX(i) * su, 1 - (row * sv + (1 - uv.getY(i)) * sv));
    }
    g.rotateY(rotY);
    g.translate(x, y, z);
    this._neon.push(g);

    // «мокрое» отражение вывески на тротуаре/дороге
    const pool = new THREE.PlaneGeometry(9, 4);
    pool.rotateX(-Math.PI / 2);
    const color = new THREE.Color(NEON_PALETTE[randi(0, NEON_PALETTE.length - 1)]);
    if (facing === 0) pool.rotateY(Math.PI / 2);
    pool.translate(
      x + (facing === 0 ? (east > 0 ? -5.5 : 5.5) : 0),
      Y.pool,
      z + (facing === 1 ? (bz > 0 ? 5.5 : -5.5) : 0)
    );
    addColorAttr(pool, color.r * 0.32, color.g * 0.32, color.b * 0.32);
    this._pool.push(pool);
  }

  // ================== СТАТИКА ==================
  _staticMeshes() {
    const add = (geos, mat, opts = {}) => {
      if (!geos.length) return null;
      const g = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = !!opts.cast;
      mesh.receiveShadow = opts.receive !== false;
      if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
      if (opts.transparent) { mat.transparent = true; mat.depthWrite = false; }
      this.group.add(mesh);
      return mesh;
    };

    add(this._road, new THREE.MeshStandardMaterial({ map: this.tex.road, roughness: 0.5, metalness: 0.32 }));
    add(this._inter, new THREE.MeshStandardMaterial({ map: this.tex.asphalt, roughness: 0.5, metalness: 0.32 }));
    add(this._cross, new THREE.MeshBasicMaterial({ map: this.tex.crosswalk, transparent: true, depthWrite: false }), { renderOrder: 1, transparent: true });

    add(this._sidewalk, new THREE.MeshStandardMaterial({ map: this.tex.sidewalk, roughness: 0.85, metalness: 0.05 }), { cast: false });

    this.tex.facades.forEach((f, i) => {
      add(this._bld[i], new THREE.MeshStandardMaterial({
        map: f.map, emissiveMap: f.emissive,
        emissive: 0xffffff, emissiveIntensity: 1.05,
        roughness: 0.82, metalness: 0.15
      }), { cast: true });
    });

    add(this._floor.park, new THREE.MeshStandardMaterial({ map: this.tex.grass, roughness: 0.95, metalness: 0 }));
    add(this._floor.lot, new THREE.MeshStandardMaterial({ map: this.tex.parking, roughness: 0.55, metalness: 0.25 }));
    add(this._floor.plaza, new THREE.MeshStandardMaterial({ map: this.tex.plaza, roughness: 0.6, metalness: 0.18 }));

    // световые лужи (аддитивные, вершинный цвет)
    this.poolMat = new THREE.MeshBasicMaterial({
      map: this.tex.glow, vertexColors: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    add(this._pool, this.poolMat, { renderOrder: 2, transparent: true, receive: false });

    // неон
    this.neonMat = new THREE.MeshBasicMaterial({
      map: this.tex.neon.map, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
      toneMapped: false, side: THREE.DoubleSide
    });
    add(this._neon, this.neonMat, { renderOrder: 2, transparent: true, receive: false });

    // антенны, кондиционеры
    add(this._antenna, new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.8 }), { cast: true, receive: false });
    add(this._ac, new THREE.MeshStandardMaterial({ color: 0x2e323b, roughness: 0.8 }), { cast: true, receive: false });

    // маячки на антеннах
    this.beaconMat = new THREE.MeshBasicMaterial({
      map: this.tex.glow, color: 0xff2030, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    add(this._beacon, this.beaconMat, { renderOrder: 2, transparent: true, receive: false });
  }

  _lampMeshes() {
    const n = this.lampPts.length;
    if (!n) return;
    const poleG = new THREE.CylinderGeometry(0.09, 0.13, 7.4, 6);
    poleG.translate(0, 3.7, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.7, metalness: 0.6 });
    const poles = new THREE.InstancedMesh(poleG, poleMat, n);
    const headG = new THREE.SphereGeometry(0.3, 10, 8);
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 1.55, 0.95), toneMapped: false });
    const heads = new THREE.InstancedMesh(headG, headMat, n);

    const m = new THREE.Matrix4();
    this.lampPts.forEach((p, i) => {
      m.makeTranslation(p.x, 0, p.z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(p.x, 7.35, p.z);
      heads.setMatrixAt(i, m);
    });
    poles.castShadow = false;
    heads.castShadow = false;
    this.group.add(poles, heads);
    this.lampHeadsMat = headMat;
  }

  _treeMeshes() {
    const n = this.treePts.length;
    if (!n) return;
    const trunkG = new THREE.CylinderGeometry(0.14, 0.2, 1.8, 6);
    trunkG.translate(0, 0.9, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2016, roughness: 0.9 });
    const trunks = new THREE.InstancedMesh(trunkG, trunkMat, n);

    const crownG = new THREE.IcosahedronGeometry(1.7, 1);
    crownG.scale(1, 0.8, 1);
    crownG.translate(0, 2.6, 0);
    const crownMat = new THREE.MeshStandardMaterial({ color: 0x14401f, roughness: 0.9, flatShading: true });
    const crowns = new THREE.InstancedMesh(crownG, crownMat, n);
    crowns.castShadow = true;

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    this.treePts.forEach((p, i) => {
      v.set(p.x, 0, p.z); s.set(p.s, p.s, p.s);
      m.compose(v, q, s);
      trunks.setMatrixAt(i, m);
      crowns.setMatrixAt(i, m);
    });
    this.group.add(trunks, crowns);
  }

  _fountainMesh() {
    const f = this._fountain;
    if (!f) return;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.7, 0.7, 20),
      new THREE.MeshStandardMaterial({ color: 0x33373f, roughness: 0.7, metalness: 0.2 })
    );
    base.position.set(f.x, 0.35, f.z);
    base.castShadow = true; base.receiveShadow = true;

    this.waterMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.15, 0.7, 0.95), transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(2.9, 24), this.waterMat);
    water.rotateX(-Math.PI / 2);
    water.position.set(f.x, 0.72, f.z);
    water.renderOrder = 2;

    const jet = new THREE.Mesh(
      new THREE.ConeGeometry(0.5, 2.6, 10),
      this.waterMat
    );
    jet.position.set(f.x, 1.8, f.z);
    this.group.add(base, water, jet);
  }

  // ================== КОЛЛАЙДЕРЫ / ГРАФ ==================
  addCollider(x0, z0, x1, z1) {
    const c = { x0, z0, x1, z1 };
    this.colliders.push(c);
    const H = 28;
    const ix0 = Math.floor((x0 + 300) / H), ix1 = Math.floor((x1 + 300) / H);
    const iz0 = Math.floor((z0 + 300) / H), iz1 = Math.floor((z1 + 300) / H);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = ix * 1000 + iz;
        if (!this.hash.has(k)) this.hash.set(k, []);
        this.hash.get(k).push(c);
      }
    }
  }

  queryColliders(x, z) {
    const H = 28;
    const ix = Math.floor((x + 300) / H), iz = Math.floor((z + 300) / H);
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const arr = this.hash.get((ix + dx) * 1000 + (iz + dz));
        if (arr) for (const c of arr) if (!out.includes(c)) out.push(c);
      }
    }
    return out;
  }

  _nodeGraph() {
    for (let i = 0; i <= CITY.N; i++) {
      this.nodes[i] = [];
      for (let j = 0; j <= CITY.N; j++) {
        this.nodes[i][j] = {
          i, j,
          x: -CITY.HALF + i * CITY.CELL,
          z: -CITY.HALF + j * CITY.CELL,
          links: []
        };
      }
    }
    for (let i = 0; i <= CITY.N; i++) {
      for (let j = 0; j <= CITY.N; j++) {
        const n = this.nodes[i][j];
        if (i > 0) n.links.push(this.nodes[i - 1][j]);
        if (i < CITY.N) n.links.push(this.nodes[i + 1][j]);
        if (j > 0) n.links.push(this.nodes[i][j - 1]);
        if (j < CITY.N) n.links.push(this.nodes[i][j + 1]);
      }
    }
  }

  // Пульсация города: маячки, вода, неон
  update(dt, t) {
    if (this.beaconMat) {
      const p = 0.55 + 0.45 * Math.sin(t * 2.6);
      this.beaconMat.color.setRGB(2.0 * p, 0.25 * p, 0.2 * p);
    }
    if (this.waterMat) {
      const p = 0.7 + 0.3 * Math.sin(t * 1.7);
      this.waterMat.color.setRGB(0.15 * p, 0.7 * p, 0.95 * p);
    }
    if (this.neonMat) {
      const f = this.neonFlicker;
      if (f.dip > 0) f.dip = Math.max(0, f.dip - dt * 3.5);
      else if (Math.random() < dt * 0.25) f.dip = rand(0.3, 0.6);
      const b = 1 - f.dip;
      this.neonMat.color.setRGB(b, b, b);
    }
  }
}
