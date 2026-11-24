// ============================================================
//  TextureFactory — весь арт игры рисуется на <canvas>.
//  Ноль внешних файлов: асфальт, разметка, фасады, неон,
//  частицы, капли дождя, лужи крови и т.д.
// ============================================================

import * as THREE from 'three';
import { rand, randi, pick } from '../core/math.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(canvas, aniso = 4) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

function speckle(ctx, w, h, n, light, dark) {
  for (let i = 0; i < n; i++) {
    const c = Math.random() < 0.5 ? light : dark;
    ctx.fillStyle = c;
    ctx.globalAlpha = rand(0.04, 0.14);
    ctx.fillRect(rand(0, w), rand(0, h), rand(1, 2.6), rand(1, 2.6));
  }
  ctx.globalAlpha = 1;
}

export class TextureFactory {
  constructor(aniso = 8) {
    this.aniso = aniso;
    this._build();
  }

  _build() {
    this.asphalt = this._asphalt();
    this.road = this._road();
    this.crosswalk = this._crosswalk();
    this.sidewalk = this._sidewalk();
    this.grass = this._grass();
    this.plaza = this._plaza();
    this.parking = this._parking();
    this.facades = this._facades();       // [{map, emissive}]
    this.neon = this._neonAtlas();        // {map, cols, count}
    this.glow = this._radial(128, 1);     // универсальное свечение
    this.smoke = this._smoke();
    this.splat = this._splat();
    this.rain = this._rainStreak();
  }

  // ---------- Грунт / дороги ----------
  _asphalt() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#191b21';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, 2600, '#2a2d35', '#0e1014');
    // трещины
    x.strokeStyle = 'rgba(8,9,12,0.5)';
    x.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      x.beginPath();
      let px = rand(0, 256), py = rand(0, 256);
      x.moveTo(px, py);
      for (let s = 0; s < 5; s++) { px += rand(-30, 30); py += rand(-30, 30); x.lineTo(px, py); }
      x.stroke();
    }
    return toTex(c, this.aniso);
  }

  // Плитка дороги: 16 м (ширина) x 8 м (длина)
  _road() {
    const [c, x] = makeCanvas(256, 128);
    x.fillStyle = '#1b1d24';
    x.fillRect(0, 0, 256, 128);
    speckle(x, 256, 128, 1300, '#2c2f38', '#101216');
    // боковые белые линии (по 1.5 м от края)
    x.fillStyle = 'rgba(210,220,230,0.55)';
    x.fillRect(22, 0, 4, 128);
    x.fillRect(230, 0, 4, 128);
    // центральная жёлтая прерывистая: штрих 3 м, зазор 5 м
    x.fillStyle = 'rgba(235,190,70,0.7)';
    x.fillRect(125, 6, 6, 44);
    return toTex(c, this.aniso);
  }

  // Зебра: 14 м x 2.4 м
  _crosswalk() {
    const [c, x] = makeCanvas(224, 40);
    for (let s = 0; s < 7; s++) {
      x.fillStyle = `rgba(215,225,235,${rand(0.3, 0.55)})`;
      x.fillRect(8 + s * 32, 0, 15, 40);
    }
    const t = toTex(c, this.aniso);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  _sidewalk() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#262a31';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, 1800, '#31353d', '#1a1d22');
    x.strokeStyle = 'rgba(12,14,18,0.9)';
    x.lineWidth = 2;
    for (let g = 0; g <= 256; g += 64) { // плитки 2 м
      x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 256); x.stroke();
      x.beginPath(); x.moveTo(0, g); x.lineTo(256, g); x.stroke();
    }
    // пятна
    for (let i = 0; i < 5; i++) {
      x.fillStyle = `rgba(10,12,16,${rand(0.1, 0.25)})`;
      x.beginPath();
      x.arc(rand(0, 256), rand(0, 256), rand(12, 34), 0, 7);
      x.fill();
    }
    return toTex(c, this.aniso);
  }

  _grass() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#0d2016';
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = pick(['#0c2417', '#123021', '#0a1b12']);
      x.globalAlpha = rand(0.3, 0.7);
      x.beginPath();
      x.ellipse(rand(0, 256), rand(0, 256), rand(8, 40), rand(6, 26), rand(0, 3), 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    speckle(x, 256, 256, 900, '#1c4530', '#081410');
    return toTex(c, 4);
  }

  _plaza() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#2b2f38';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, 1400, '#363b45', '#20242b');
    x.strokeStyle = 'rgba(12,14,18,0.8)';
    x.lineWidth = 3;
    for (let g = 0; g <= 256; g += 128) { // плиты 4 м
      x.beginPath(); x.moveTo(g, 0); x.lineTo(g, 256); x.stroke();
      x.beginPath(); x.moveTo(0, g); x.lineTo(256, g); x.stroke();
    }
    return toTex(c, this.aniso);
  }

  _parking() {
    const [c, x] = makeCanvas(256, 256);
    x.fillStyle = '#1b1d23';
    x.fillRect(0, 0, 256, 256);
    speckle(x, 256, 256, 1200, '#2a2d35', '#0f1116');
    // разметка парковочных мест (шаг 2 м)
    x.strokeStyle = 'rgba(210,220,230,0.4)';
    x.lineWidth = 3;
    for (let gx = 16; gx < 256; gx += 64) {
      x.beginPath(); x.moveTo(gx, 16); x.lineTo(gx, 112); x.stroke();
      x.beginPath(); x.moveTo(gx, 144); x.lineTo(gx, 240); x.stroke();
    }
    x.beginPath(); x.moveTo(8, 128); x.lineTo(248, 128); x.stroke();
    return toTex(c, this.aniso);
  }

  // ---------- Фасады: 4 варианта {map, emissive}, плитка 12.8 x 12.8 м ----------
  _facades() {
    const variants = [
      { base: '#3a3e47', glass: '#101823', litP: 0.42, warm: 0.6 },   // бетон
      { base: '#1d2836', glass: '#0c1420', litP: 0.5,  warm: 0.25 },  // стеклянная башня
      { base: '#4b3028', glass: '#12141a', litP: 0.36, warm: 0.75 },  // кирпич
      { base: '#242730', glass: '#0e1218', litP: 0.3,  warm: 0.5 }    // тёмный модерн
    ];
    return variants.map((v) => this._facade(v));
  }

  _facade(v) {
    const S = 512, BAND = 56; // нижняя полоса = «крыша»
    // --- альбедо ---
    const [c, x] = makeCanvas(S, S);
    x.fillStyle = v.base;
    x.fillRect(0, 0, S, S);
    // потёки
    for (let i = 0; i < 26; i++) {
      const px = rand(0, S), py = rand(BAND, S), len = rand(30, 130);
      const g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(0,0,0,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(px, py, rand(3, 9), len);
    }
    speckle(x, S, S, 2400, '#ffffff', '#000000');
    // окна 4x4 (кроме полосы-крыши)
    const rows = 4, cols = 4, cellH = (S - BAND) / rows, cellW = S / cols;
    const ww = cellW * 0.6, wh = cellH * 0.62;
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const wx = cIdx * cellW + (cellW - ww) / 2;
        const wy = BAND + r * cellH + (cellH - wh) / 2;
        x.fillStyle = 'rgba(8,10,14,0.9)'; // рама
        x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        x.fillStyle = v.glass;            // стекло
        x.fillRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(120,150,190,0.08)'; // блик
        x.fillRect(wx, wy, ww, wh * 0.28);
      }
    }
    // полоса-крыша
    x.fillStyle = '#0c0e13';
    x.fillRect(0, S - BAND, S, BAND);
    speckle(x, S, BAND, 300, '#151820', '#05060a');

    // --- эмиссия (светящиеся окна) ---
    const [c2, x2] = makeCanvas(S, S);
    x2.fillStyle = '#000';
    x2.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        if (Math.random() > v.litP) continue;
        const wx = cIdx * cellW + (cellW - ww) / 2;
        const wy = BAND + r * cellH + (cellH - wh) / 2;
        const warm = Math.random() < v.warm;
        x2.fillStyle = warm
          ? `rgba(255,${randi(170, 210)},${randi(90, 130)},${rand(0.5, 1)})`
          : `rgba(${randi(120, 160)},${randi(190, 220)},255,${rand(0.5, 1)})`;
        if (Math.random() < 0.3) {
          x2.fillRect(wx, wy + wh * 0.45, ww, wh * 0.55); // занавес
        } else {
          x2.fillRect(wx, wy, ww, wh);
        }
      }
    }
    return { map: toTex(c, this.aniso), emissive: toTex(c2, this.aniso) };
  }

  // ---------- Атлас неоновых вывесок 4x2 ----------
  _neonAtlas() {
    const W = 1024, H = 512, cols = 4;
    const texts = ['НЕОН', 'БАР', 'ОТЕЛЬ', '24 ЧАСА', 'КАЗИНО', 'ТУРБО', 'СУШИ', 'МОТЕЛЬ'];
    const colors = ['#33e0ff', '#ff41c8', '#ffb347', '#54ff9f', '#9d6bff', '#ff5964', '#39d6ff', '#ffd400'];
    const [c, x] = makeCanvas(W, H);
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    texts.forEach((txt, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const cx = col * 256 + 128, cy = row * 256 + 128;
      const color = colors[i];
      // рамка
      x.strokeStyle = color;
      x.lineWidth = 4;
      x.globalAlpha = 0.85;
      x.shadowColor = color;
      x.shadowBlur = 16;
      x.strokeRect(col * 256 + 18, row * 256 + 78, 220, 100);
      x.globalAlpha = 1;
      // текст
      let size = 52;
      x.font = `bold ${size}px Arial, sans-serif`;
      while (x.measureText(txt).width > 200 && size > 24) {
        size -= 4;
        x.font = `bold ${size}px Arial, sans-serif`;
      }
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.shadowBlur = 26;
      x.shadowColor = color;
      x.fillStyle = color;
      x.fillText(txt, cx, cy);
      x.shadowBlur = 0;
      x.fillStyle = 'rgba(255,255,255,0.92)';
      x.fillText(txt, cx, cy);
    });
    const t = toTex(c, this.aniso);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return { map: t, cols, count: texts.length };
  }

  // ---------- Спрайты частиц ----------
  _radial(size, hardness) {
    const [c, x] = makeCanvas(size, size);
    const r = size / 2;
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25 * hardness, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _smoke() {
    const [c, x] = makeCanvas(128, 128);
    const r = 64;
    const g = x.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.3)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(r, r, r, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  // Белая клякса — тонируется вершинным цветом (кровь/гарь)
  _splat() {
    const [c, x] = makeCanvas(128, 128);
    x.fillStyle = 'rgba(255,255,255,0.95)';
    x.beginPath(); x.ellipse(64, 64, 30, 26, rand(0, 3), 0, 7); x.fill();
    for (let i = 0; i < 9; i++) {
      const a = rand(0, 6.28), d = rand(28, 56);
      x.globalAlpha = rand(0.5, 0.95);
      x.beginPath();
      x.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, rand(3, 11), 0, 7);
      x.fill();
    }
    x.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  _rainStreak() {
    const [c, x] = makeCanvas(16, 64);
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.5)');
    g.addColorStop(0.8, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(7, 0, 2.5, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
}
