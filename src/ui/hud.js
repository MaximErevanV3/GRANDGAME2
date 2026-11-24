// ============================================================
//  Hud — DOM-элементы + канвасы: здоровье, патроны, звёзды
//  розыска, спидометр, вращающаяся миникарта, тосты, прицел.
// ============================================================

import { settings } from '../config/settings.js';
import { CITY } from '../config/constants.js';
import { clamp } from '../core/math.js';

export class Hud {
  constructor(game) {
    this.game = game;
    this._vig = 0;
    this._txtT = 0;
    this._lastWanted = -1;
    this._toasts = [];

    const root = document.getElementById('ui-root');
    root.insertAdjacentHTML('beforeend', `
      <div id="hud" class="hidden">
        <div class="hud-tl">
          <div class="hp-wrap">
            <div class="hp-label">ЗДОРОВЬЕ</div>
            <div class="hp-bar"><div id="hp-fill"></div></div>
          </div>
          <div id="ammo" class="ammo"></div>
        </div>
        <div class="hud-tr">
          <div id="stars"></div>
          <div id="fps"></div>
        </div>
        <div class="hud-br">
          <canvas id="minimap" width="176" height="176"></canvas>
          <canvas id="speedo" width="150" height="150"></canvas>
        </div>
        <div id="toasts"></div>
        <div id="vignette"></div>
        <div id="crosshair"><span class="dot"></span></div>
      </div>`);

    this.el = root.querySelector('#hud');
    this.hpFill = this.el.querySelector('#hp-fill');
    this.ammoEl = this.el.querySelector('#ammo');
    this.starsEl = this.el.querySelector('#stars');
    this.fpsEl = this.el.querySelector('#fps');
    this.toastsEl = this.el.querySelector('#toasts');
    this.vigEl = this.el.querySelector('#vignette');
    this.crossEl = this.el.querySelector('#crosshair');
    this.mm = this.el.querySelector('#minimap').getContext('2d');
    this.sp = this.el.querySelector('#speedo').getContext('2d');
    this.speedoCv = this.el.querySelector('#speedo');

    for (let i = 0; i < 5; i++) {
      const s = document.createElement('span');
      s.className = 'star';
      s.textContent = '★';
      this.starsEl.appendChild(s);
    }
    this.stars = [...this.starsEl.children];
  }

  setVisible(v) {
    this.el.classList.toggle('hidden', !v);
  }

  toast(msg) {
    if (this._toasts.length > 4) {
      const old = this._toasts.shift();
      old.el.remove();
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toastsEl.appendChild(el);
    this._toasts.push({ el, t: 0 });
  }

  flashDamage(a) { this._vig = Math.min(1, this._vig + a); }

  update(dt, game) {
    const p = game.player;

    // тосты
    for (let i = this._toasts.length - 1; i >= 0; i--) {
      const t = this._toasts[i];
      t.t += dt;
      if (t.t > 3.4) { t.el.remove(); this._toasts.splice(i, 1); }
      else if (t.t > 2.8) t.el.style.opacity = String(1 - (t.t - 2.8) / 0.6);
    }

    // виньетка урона
    if (this._vig > 0) {
      this._vig = Math.max(0, this._vig - dt * 1.6);
      this.vigEl.style.opacity = String(this._vig);
    }

    // прицел
    const m = game.input.mouse;
    this.crossEl.style.transform = `translate(${m.x - 14}px, ${m.y - 14}px)`;

    // текст — 8 раз в сек
    this._txtT -= dt;
    if (this._txtT <= 0) {
      this._txtT = 0.125;
      const pct = clamp(p.health, 0, 100);
      this.hpFill.style.width = pct + '%';
      this.hpFill.style.background = pct > 50
        ? 'linear-gradient(90deg,#19e68c,#7dffb5)'
        : pct > 25
          ? 'linear-gradient(90deg,#e6c519,#ffe97d)'
          : 'linear-gradient(90deg,#e61919,#ff7d7d)';
      this.ammoEl.textContent = game.weapons.reloading > 0
        ? 'ПЕРЕЗАРЯДКА…'
        : `${game.weapons.mag} | ${p.ammoRes}`;
      if (p.wanted !== this._lastWanted) {
        this._lastWanted = p.wanted;
        this.stars.forEach((s, i) => s.classList.toggle('on', i < p.wanted));
      }
      this.fpsEl.style.display = settings.fps ? 'block' : 'none';
      this.fpsEl.textContent = game.fps + ' FPS';
    }

    // спидометр
    const inCar = p.mode === 'car' && p.car;
    this.speedoCv.style.display = inCar ? 'block' : 'none';
    if (inCar) this.drawSpeedo(Math.abs(p.car.vLong) * 3.6, p.car.vLong < -0.5);

    // миникарта
    this.drawMinimap(game);
  }

  drawSpeedo(kmh, reverse) {
    const c = this.sp;
    const W = 150, cx = 75, cy = 82, R = 62;
    c.clearRect(0, 0, W, W);

    const a0 = Math.PI * 0.75;
    const a1 = Math.PI * 2.25;
    const vmax = 200;

    // шкала
    c.lineWidth = 7;
    c.strokeStyle = 'rgba(18,26,40,0.9)';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();

    c.strokeStyle = 'rgba(57,214,255,0.28)';
    c.beginPath();
    c.arc(cx, cy, R, a0, a1);
    c.stroke();

    // деления
    c.lineWidth = 2;
    for (let v = 0; v <= vmax; v += 20) {
      const a = a0 + (v / vmax) * (a1 - a0);
      const c1 = Math.cos(a), s1 = Math.sin(a);
      c.strokeStyle = v >= 160 ? 'rgba(255,80,80,0.8)' : 'rgba(120,200,255,0.55)';
      c.beginPath();
      c.moveTo(cx + c1 * (R - 9), cy + s1 * (R - 9));
      c.lineTo(cx + c1 * (R + 3), cy + s1 * (R + 3));
      c.stroke();
    }

    // стрелка
    const av = a0 + (clamp(kmh, 0, vmax) / vmax) * (a1 - a0);
    c.strokeStyle = '#ff5964';
    c.lineWidth = 3;
    c.shadowColor = '#ff2030';
    c.shadowBlur = 8;
    c.beginPath();
    c.moveTo(cx, cy);
    c.lineTo(cx + Math.cos(av) * (R - 6), cy + Math.sin(av) * (R - 6));
    c.stroke();
    c.shadowBlur = 0;

    // цифры
    c.fillStyle = '#dff6ff';
    c.font = 'bold 22px "Segoe UI", Arial';
    c.textAlign = 'center';
    c.shadowColor = '#39d6ff';
    c.shadowBlur = 10;
    c.fillText(String(Math.round(kmh)), cx, cy + 38);
    c.shadowBlur = 0;
    c.font = '10px "Segoe UI", Arial';
    c.fillStyle = 'rgba(160,220,255,0.75)';
    c.fillText('КМ/Ч', cx, cy + 52);
    c.fillStyle = reverse ? '#ff5964' : 'rgba(57,214,255,0.9)';
    c.font = 'bold 11px "Segoe UI", Arial';
    c.fillText(reverse ? 'R' : 'D', cx, cy + 14);
  }

  drawMinimap(game) {
    const c = this.mm;
    const S = 176, cx = S / 2, cy = S / 2;
    const scale = 0.42;
    const pt = game.playerTarget();
    const t = game.engine.time;

    c.clearRect(0, 0, S, S);
    c.save();

    // круг
    c.beginPath();
    c.arc(cx, cy, S / 2 - 4, 0, 7);
    c.clip();
    c.fillStyle = '#0a1018';
    c.fillRect(0, 0, S, S);

    // поворот: «вперёд» игрока = вверх
    c.translate(cx, cy);
    c.rotate(pt.heading - Math.PI);
    c.scale(scale, scale);
    c.translate(-pt.x, -pt.z);

    // кварталы
    for (const b of game.world.blockRects) {
      if (Math.abs(b.x0 - pt.x) > 260 || Math.abs(b.z0 - pt.z) > 260) continue;
      if (b.type === 'park') c.fillStyle = '#0f2417';
      else if (b.type === 'plaza') c.fillStyle = '#1e2d3f';
      else if (b.type === 'parking') c.fillStyle = '#181c22';
      else c.fillStyle = '#141a26';
      c.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    }

    // дороги-сетки не рисуем: их видно «фоном»

    // пикапы
    for (const it of game.pickups.items) {
      if (!it.active) continue;
      c.fillStyle = it.spot.kind === 'health' ? '#19e68c' : '#ffd400';
      c.beginPath();
      c.arc(it.spot.x, it.spot.z, 2.6, 0, 7);
      c.fill();
    }

    // трафик
    c.fillStyle = '#9db8cf';
    for (const car of game.cars) {
      if (car.ai !== 'traffic') continue;
      c.beginPath();
      c.arc(car.x, car.z, 3, 0, 7);
      c.fill();
    }

    // полиция
    for (const car of game.police.cars) {
      if (car.wrecked) continue;
      c.fillStyle = (t * 4 % 2 < 1) ? '#ff2030' : '#2244ff';
      c.beginPath();
      c.arc(car.x, car.z, 4.4, 0, 7);
      c.fill();
    }

    c.restore();

    // игрок в центре
    c.save();
    c.translate(cx, cy);
    c.fillStyle = '#ffffff';
    c.strokeStyle = 'rgba(57,214,255,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(0, -7);
    c.lineTo(5, 6);
    c.lineTo(0, 3);
    c.lineTo(-5, 6);
    c.closePath();
    c.fill();
    c.stroke();

    // прогресс ареста
    const bust = game.player.bustT;
    if (bust > 0.05) {
      c.strokeStyle = '#ff5964';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 13, -Math.PI / 2, -Math.PI / 2 + (bust / 1.6) * Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // север
    const nx = cx - Math.sin(pt.heading) * (S / 2 - 16);
    const ny = cy + Math.cos(pt.heading) * (S / 2 - 16);
    c.fillStyle = 'rgba(57,214,255,0.9)';
    c.font = 'bold 12px "Segoe UI", Arial';
    c.textAlign = 'center';
    c.fillText('N', nx, ny + 4);

    // рамка
    c.strokeStyle = 'rgba(57,160,255,0.55)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, S / 2 - 3, 0, 7);
    c.stroke();
  }
}
