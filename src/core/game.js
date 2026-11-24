// ============================================================
//  Game — оркестратор: состояния, игрок (пешком/в машине),
//  угон, розыск, урон, взрывы, связи всех систем.
// ============================================================

import { Engine } from './engine.js';
import { Input } from './input.js';
import { bus } from './events.js';
import { World } from '../world/world.js';
import { initWheels, Car } from '../entities/car.js';
import { Ped } from '../entities/ped.js';
import { PickupSystem } from '../entities/pickup.js';
import { CameraSystem } from '../systems/camera.js';
import { Particles, RainFX } from '../systems/particles.js';
import { DecalSystem } from '../systems/decals.js';
import { TrafficSystem } from '../systems/traffic.js';
import { PedSystem } from '../systems/peds.js';
import { PoliceSystem } from '../systems/police.js';
import { Weapons } from '../systems/weapons.js';
import { Hud } from '../ui/hud.js';
import { Menu } from '../ui/menu.js';
import { AudioFX } from '../audio/audio.js';
import { settings } from '../config/settings.js';
import { TUNE, WANTED, PLAYER, WEAPON, QUALITY } from '../config/constants.js';
import { clamp, dist2, angleDelta } from '../core/math.js';

export class Game {
  constructor(container) {
    this.state = 'menu';
    this.time = 0;
    this.fps = 60; this._fpsAcc = 0; this._fpsN = 0;

    this.engine = new Engine(container);
    this.input = new Input();
    this.audio = new AudioFX();

    initWheels(this.engine.scene);
    this.world = new World(this.engine);

    // системы
    this.cameraSys = new CameraSystem(this.engine.camera);
    this.particles = new Particles(this.engine.scene, this.preset.particles, this.world.tex);
    this.rain = new RainFX(this.engine.scene, this.preset.rain, this.world.tex.rain);
    this.decals = new DecalSystem(this.engine.scene, this.world.tex.splat);
    this.hud = new Hud(this);
    this.traffic = new TrafficSystem(this);
    this.peds = new PedSystem(this);
    this.police = new PoliceSystem(this);
    this.weapons = new Weapons(this);
    this.pickups = new PickupSystem(this);
    this.menu = new Menu(this);

    // машины
    this.cars = [];
    for (const s of this.world.parkedSpawns) {
      this.addCar(new Car(this.engine.scene, s.type, s.x, s.z, s.heading, { ai: 'parked' }));
    }

    // игрок
    this.player = {
      mode: 'foot',
      car: null,
      ped: null,
      health: PLAYER.health,
      heat: 0,
      wanted: 0,
      ammoRes: WEAPON.startAmmo,
      bustT: 0,
      stats: { time: 0, peds: 0, cops: 0, shots: 0, maxWanted: 0 }
    };
    this._lastCrimeT = -99;
    this._toastQueue = [];

    bus.on('toast', (msg) => this.toast(msg));

    this.toMenu();
    this.engine.start((dt) => this.update(dt));
  }

  get preset() { return QUALITY[settings.quality] || QUALITY.high; }

  addCar(car) {
    car.setupTextures(this.world.tex.glow);
    this.cars.push(car);
    return car;
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    if (this.player.car === car) this.player.car = null;
    car.dispose();
  }

  // ================== СОСТОЯНИЯ ==================
  setState(s) { this.state = s; }

  toMenu() {
    this.setState('menu');
    this.menu.show('main');
    this.hud.setVisible(false);
    this.audio.stopEngine();
    this.audio.siren(false);
    document.body.classList.remove('playing');
  }

  newRun() {
    const p = this.player;
    // полиция прочь
    this.police.reset();

    // предыдущую машину игрока оставляем где стоит
    if (p.car) { p.car.driver = null; p.car.ai = null; p.car = null; }

    // новая машина и пешеход
    const s = this.world.playerCarSpawn;
    p.car = this.addCar(new Car(this.engine.scene, 'compact', s.x, s.z, s.heading, { color: 0x39d6ff }));
    p.car.ai = null;

    const ps = this.world.playerSpawn;
    if (!p.ped) p.ped = new Ped(this.engine.scene, { isPlayer: true });
    p.ped.group.visible = true;
    p.ped.setPos(ps.x, ps.z, 0);
    p.mode = 'foot';

    p.health = PLAYER.health;
    p.heat = 0; p.wanted = 0; p.bustT = 0;
    p.ammoRes = WEAPON.startAmmo;
    p.stats = { time: 0, peds: 0, cops: 0, shots: 0, maxWanted: 0 };
    this._lastCrimeT = -99;
    this.weapons.reset();

    this.setState('playing');
    this.menu.show(null);
    this.hud.setVisible(true);
    document.body.classList.add('playing');
    this.cameraSys.snap(this.playerTarget());
    this.toast('Добро пожаловать в GRAND CITY. F — сесть в машину');
  }

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.menu.show('pause');
    document.body.classList.remove('playing');
    this.audio.pause(true);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.setState('playing');
    this.menu.show(null);
    document.body.classList.add('playing');
    this.audio.pause(false);
  }

  wasted() {
    if (this.state === 'over') return;
    this.setState('over');
    this.menu.showOver('ПОТРАЧЕНО', this.player.stats);
    document.body.classList.remove('playing');
    this.audio.stopEngine();
    this.cameraSys.shake(0.8);
  }

  busted() {
    if (this.state === 'over') return;
    this.setState('over');
    this.menu.showOver('ПОЙМАН', this.player.stats);
    document.body.classList.remove('playing');
    this.audio.stopEngine();
  }

  // ================== ИГРОК ==================
  playerTarget() {
    const p = this.player;
    if (p.mode === 'car' && p.car) {
      return { x: p.car.x, z: p.car.z, heading: p.car.heading, speed: Math.abs(p.car.vLong) };
    }
    if (p.ped) return { x: p.ped.x, z: p.ped.z, heading: p.ped.heading, speed: p.ped.curSpeed };
    return { x: 0, z: 0, heading: 0, speed: 0 };
  }

  playerDamage(d) {
    if (this.state !== 'playing') return;
    this.player.health -= d;
    this.hud.flashDamage(clamp(d / 30, 0.25, 1));
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.wasted();
    }
  }

  addHeat(n, quiet) {
    const p = this.player;
    if (n > 0) this._lastCrimeT = this.time;
    const prev = p.wanted;
    p.heat = clamp(p.heat + n, 0, WANTED.max * WANTED.perStar);
    p.wanted = Math.min(WANTED.max, Math.floor(p.heat / WANTED.perStar));
    p.stats.maxWanted = Math.max(p.stats.maxWanted, p.wanted);
    if (!quiet && p.wanted > prev) {
      this.toast(`РОЗЫСК: ${'★'.repeat(p.wanted)}`);
      this.audio.siren(true);
    } else if (p.wanted === 0 && prev > 0) {
      this.toast('ТЫ ОТ НИХ УШЁЛ');
      this.audio.siren(false);
    }
  }

  decayHeat(dt) {
    const p = this.player;
    if (p.heat <= 0) return;
    const prev = p.wanted;
    p.heat = Math.max(0, p.heat - WANTED.decayRate * dt);
    p.wanted = Math.min(WANTED.max, Math.floor(p.heat / WANTED.perStar));
    if (p.wanted === 0 && prev > 0) {
      this.toast('ТЫ ОТ НИХ УШЁЛ');
      this.audio.siren(false);
    }
  }

  onNoise(x, z, r, gun) {
    if (this.state !== 'playing') return;
    this.peds.panic(x, z, r);
    this.traffic.panicNear(x, z, r);
    if (gun) this.police.hearShot(x, z);
  }

  onPedKilled(ped, byPlayer) {
    if (!byPlayer) return;
    this.player.stats.peds++;
    this.addHeat(WANTED.pedKill);
  }

  onCarIgnited(car) {
    if (car === this.player.car) this.toast('МАШИНА ГОРИТ — БЕГИ!');
  }

  explosion(x, z, srcCar) {
    this.audio.explosion();
    this.cameraSys.shake(1.1);
    this.particles.glow.spawnExplosion(x, 1, z);
    this.decals.splat(x, z, 8, 0.05, 0.05, 0.06, 0.75);

    const byPlayer = srcCar && srcCar.lastDamager === 'player';

    // пешеходы
    for (const ped of this.peds.list) {
      if (!ped.alive) continue;
      if (dist2(ped.x, ped.z, x, z) < 6.5 * 6.5) {
        const d = Math.hypot(ped.x - x, ped.z - z) || 1;
        ped.kill((ped.x - x) / d, (ped.z - z) / d);
        this.peds.bloodBurst(ped.x, ped.z);
        this.onPedKilled(ped, byPlayer);
      }
    }

    // машины (цепная детонация)
    for (const car of this.cars) {
      if (car === srcCar || car.wrecked || car.burning) continue;
      if (dist2(car.x, car.z, x, z) < 7 * 7) {
        car.lastDamager = srcCar ? srcCar.lastDamager : null;
        car.applyDamage(65, this);
      }
    }

    // игрок
    const p = this.player;
    if (p.mode === 'car' && p.car === srcCar) {
      this.playerDamage(PLAYER.explosionDmg);
    } else if (p.mode === 'car' && p.car) {
      if (dist2(p.car.x, p.car.z, x, z) < 7 * 7) {
        p.car.lastDamager = null;
        p.car.applyDamage(55, this);
        this.playerDamage(22);
      }
    } else if (p.ped) {
      const d2 = dist2(p.ped.x, p.ped.z, x, z);
      if (d2 < 6.5 * 6.5) {
        this.playerDamage(PLAYER.explosionDmg * (1 - Math.sqrt(d2) / 7));
      }
    }
  }

  // ================== МАШИНА: СЕСТЬ / ВЫЙТИ / УГНАТЬ ==================
  enterExitCar() {
    const p = this.player;
    if (this.state !== 'playing') return;

    if (p.mode === 'car' && p.car) {
      const car = p.car;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const rx = fz, rz = -fx;
      let placed = false;
      for (const side of [1, -1]) {
        const px = car.x + rx * side * (car.cfg.w / 2 + 1.2);
        const pz = car.z + rz * side * (car.cfg.w / 2 + 1.2);
        // не в стену и не в другую машину
        let blocked = false;
        for (const c of this.world.queryColliders(px, pz)) {
          if (px > c.x0 - 0.5 && px < c.x1 + 0.5 && pz > c.z0 - 0.5 && pz < c.z1 + 0.5) { blocked = true; break; }
        }
        if (!blocked) {
          for (const other of this.cars) {
            if (other !== car && dist2(other.x, other.z, px, pz) < 2.2 * 2.2) { blocked = true; break; }
          }
        }
        if (!blocked) {
          p.ped.group.visible = true;
          p.ped.setPos(px, pz, car.heading);
          placed = true;
          break;
        }
      }
      if (!placed) return;

      car.driver = null;
      car.controls.throttle = 0; car.controls.steer = 0; car.controls.handbrake = true;
      car.disablePlayerLights();
      p.mode = 'foot';
      p.car = null;
      this.audio.stopEngine();
      return;
    }

    // сесть/угнать
    const ped = p.ped;
    let best = null, bestD = PLAYER.enterDist * PLAYER.enterDist;
    for (const car of this.cars) {
      if (car.wrecked || car.burning) continue;
      const d = dist2(car.x, car.z, ped.x, ped.z);
      if (d < bestD) { bestD = d; best = car; }
    }
    if (!best) return;

    if (best.ai === 'traffic' && best.driver === 'ai') {
      // вышвыриваем водителя
      this.peds.spawnFleeing(best.x, best.z);
      this.addHeat(WANTED.steal);
      this.toast(`УГНАНО: ${best.cfg.ru}`);
    } else if (best.ai === 'police') {
      this.addHeat(WANTED.stealPolice);
      this.toast('УГНАНА ПОЛИЦЕЙСКАЯ МАШИНА!');
    } else if (best.ai === 'parked') {
      this.toast(`ВЗЯТО: ${best.cfg.ru}`);
    }
    best.ai = null;
    best.driver = 'player';
    best.controls.handbrake = false;
    best.enablePlayerLights(this.engine.scene);
    p.car = best;
    p.mode = 'car';
    p.ped.group.visible = false;
    this.audio.startEngine();
  }

  getAimPoint() {
    const m = this.input.mouse;
    return this.engine.screenToGround(m.ndcX, m.ndcY, 1.1);
  }

  toast(msg) {
    this.hud.toast(msg);
  }

  // ================== ОБНОВЛЕНИЕ ==================
  updatePlayerFoot(dt) {
    const p = this.player;
    const mv = this.input.moveVector();
    const ped = p.ped;

    if (mv.x !== 0 || mv.z !== 0) {
      // ось камеры: «вверх экрана» = куда смотрит камера
      const yaw = this.cameraSys.yaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = fz, rz = -fx;
      let dx = rx * mv.x + fx * mv.z;
      let dz = rz * mv.x + fz * mv.z;
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      ped.moveDir(dx * PLAYER.footSpeed * dt, dz * PLAYER.footSpeed * dt, PLAYER.footSpeed);
    } else {
      ped.idle();
    }

    // стены
    for (const c of this.world.queryColliders(ped.x, ped.z)) {
      const cx = clamp(ped.x, c.x0, c.x1), cz = clamp(ped.z, c.z0, c.z1);
      let dx = ped.x - cx, dz = ped.z - cz;
      const d = Math.hypot(dx, dz);
      if (d < 0.45 && d > 1e-4) {
        ped.x += (dx / d) * (0.45 - d);
        ped.z += (dz / d) * (0.45 - d);
      }
    }

    // машины: толчок или сбивание
    for (const car of this.cars) {
      const dx = ped.x - car.x, dz = ped.z - car.z;
      if (Math.abs(dx) > 3.4 || Math.abs(dz) > 3.4) continue;
      const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
      const lf = dx * fx + dz * fz;
      const lr = dx * fz - dz * fx;
      const hw = car.cfg.w / 2 + 0.45, hl = car.cfg.l / 2 + 0.45;
      if (Math.abs(lf) < hl && Math.abs(lr) < hw) {
        const sp = car.speed;
        if (sp > TUNE.killSpeed) {
          this.playerDamage(sp * 5);
          const s = sp || 1;
          ped.x += fx * 1.2; ped.z += fz * 1.2;
          this.hud.flashDamage(0.8);
        } else {
          // выталкивание вбок
          const push = (lr > 0 ? 1 : -1) * (hw - Math.abs(lr) + 0.05);
          const rx = fz, rz = -fx;
          ped.x += rx * push; ped.z += rz * push;
        }
      }
    }
  }

  updatePlayerCar(dt) {
    const p = this.player;
    const car = p.car;
    if (!car || car.wrecked) {
      // машина сгорела под игроком
      if (car && car.wrecked) { p.mode = 'foot'; p.car = null; this.audio.stopEngine(); }
      return;
    }

    const inp = this.input;
    car.controls.throttle = inp.isDown('up') ? 1 : (inp.isDown('down') ? -1 : 0);
    car.controls.steer = (inp.isDown('right') ? 1 : 0) - (inp.isDown('left') ? 1 : 0);
    car.controls.handbrake = inp.isDown('brake');
    car.controls.brake = false;

    car.integrate(dt);
    const impact = car.collideWorld(this.world, dt);
    if (impact > 3) {
      car.applyDamage((impact - 3) * 2.6, this);
      this.cameraSys.shake(clamp(impact * 0.045, 0.1, 0.9));
      this.audio.impact(impact);
      this.hud.flashDamage(clamp(impact / 40, 0.12, 0.5));
    }

    if (inp.justPressed('lights')) {
      car.lightsOn = !car.lightsOn;
      car.syncLights();
    }
  }

  resolveCarPairs() {
    const cars = this.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      const ra = (a.cfg.l + a.cfg.w) / 4 + 0.28;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        const rb = (b.cfg.l + b.cfg.w) / 4 + 0.28;
        const dx = b.x - a.x, dz = b.z - a.z;
        const rr = ra + rb;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d = Math.hypot(dx, dz);
        if (d >= rr || d < 1e-5) continue;

        const nx = dx / d, nz = dz / d;
        const overlap = rr - d;
        const aFixed = a.wrecked, bFixed = b.wrecked;
        if (!aFixed && !bFixed) {
          a.x -= nx * overlap / 2; a.z -= nz * overlap / 2;
          b.x += nx * overlap / 2; b.z += nz * overlap / 2;
        } else if (!aFixed) {
          a.x -= nx * overlap; a.z -= nz * overlap;
        } else if (!bFixed) {
          b.x += nx * overlap; b.z += nz * overlap;
        } else continue;

        const va = a.worldVel(), vb = b.worldVel();
        const rvx = vb.x - va.x, rvz = vb.z - va.z;
        const vn = rvx * nx + rvz * nz;
        if (vn < 0) {
          const invA = aFixed ? 0 : 1, invB = bFixed ? 0 : 1;
          const invSum = invA + invB;
          if (invSum > 0) {
            const jimp = -(1 + TUNE.restitutionCar) * vn / invSum;
            if (invA) {
              const nv = a.worldVel(); nv.x -= nx * jimp; nv.z -= nz * jimp; a.setWorldVel(nv.x, nv.z);
            }
            if (invB) {
              const nv = b.worldVel(); nv.x += nx * jimp; nv.z += nz * jimp; b.setWorldVel(nv.x, nv.z);
            }
            const force = -vn;
            if (force > 5) {
              const dmg = (force - 5) * 2.4;
              if (invA) a.applyDamage(dmg, this);
              if (invB) b.applyDamage(dmg, this);
              this.particles.glow.spawnSparks((a.x + b.x) / 2, 0.7, (a.z + b.z) / 2, 8);
              // контакт с игроком
              const playerIn = (this.player.car === a || this.player.car === b);
              if (playerIn) {
                this.cameraSys.shake(clamp(force * 0.03, 0.08, 0.7));
                this.audio.impact(force);
                const other = this.player.car === a ? b : a;
                if (other.ai === 'police' && force > 6) this.addHeat(WANTED.ramCop);
              } else if (dist2(a.x, a.z, this.playerTarget().x, this.playerTarget().z) < 45 * 45) {
                this.audio.impact(force * 0.5);
              }
            }
          }
        }
      }
    }
  }

  update(dt) {
    const st = this.state;
    this.input.capture = st === 'playing';

    // FPS
    this._fpsAcc += dt; this._fpsN++;
    if (this._fpsAcc >= 0.5) {
      this.fps = Math.round(this._fpsN / this._fpsAcc);
      this._fpsAcc = 0; this._fpsN = 0;
    }

    if (st === 'menu') {
      const pt0 = this.playerTarget();
      this.world.update(dt, this.engine.time);
      this.traffic.update(dt);
      this.peds.update(dt);
      this.particles.update(dt, this.engine.pxScale);
      this.decals.update(dt, this.engine.time);
      this.rain.update(dt, pt0.x, pt0.z, this.engine.pxScale);
      this.cameraSys.update(dt, this);
      this.input.endFrame();
      return;
    }

    if (st === 'paused') {
      this.input.endFrame();
      return;
    }

    if (st === 'over') {
      // мир живёт в замедлении
      const sdt = dt * 0.35;
      const pt0 = this.playerTarget();
      this.world.update(sdt, this.engine.time);
      this.traffic.update(sdt);
      this.peds.update(sdt);
      this.particles.update(sdt, this.engine.pxScale);
      this.decals.update(sdt, this.engine.time);
      this.rain.update(sdt, pt0.x, pt0.z, this.engine.pxScale);
      this.cameraSys.update(sdt, this);
      this.input.endFrame();
      return;
    }

    // ===== ИГРА =====
    this.time += dt;
    this.player.stats.time = this.time;

    if (this.input.justPressed('pause')) { this.pause(); this.input.endFrame(); return; }
    if (this.input.justPressed('enter')) this.enterExitCar();

    if (this.player.mode === 'car') this.updatePlayerCar(dt);
    else this.updatePlayerFoot(dt);

    this.traffic.update(dt);
    this.peds.update(dt);
    this.police.update(dt);
    this.weapons.update(dt);
    this.pickups.update(dt, this.engine.time);

    this.resolveCarPairs();
    for (const car of this.cars) car.update(dt, this);
    if (this.player.ped) this.player.ped.update(dt, null);

    const pt = this.playerTarget();
    this.particles.update(dt, this.engine.pxScale);
    this.decals.update(dt, this.engine.time);
    this.rain.update(dt, pt.x, pt.z, this.engine.pxScale);
    this.world.update(dt, this.engine.time);
    this.cameraSys.update(dt, this);
    this.hud.update(dt, this);

    this.engine.updateShadowRig(pt.x, pt.z);
    this.audio.update(dt, this);

    this.input.endFrame();
  }

  applySettings() {
    this.engine.applyQuality();
    const p = this.preset;
    this.particles.setCaps(p.particles);
    this.rain.setCount(p.rain);
    this.audio.setVolume(settings.volume);
    this.audio.rain(settings.rain && p.rain > 0);
    this.rain.setVisible(settings.rain);
  }
}
