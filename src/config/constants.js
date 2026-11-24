// ============================================================
//  GRAND CITY 2 — v3.0
//  Константы движка, города, физики и геймплея.
//  Все «магические числа» проекта живут здесь.
// ============================================================

export const GAME_VERSION = '3.0.0';
export const GAME_TITLE = 'GRAND CITY 2';

// ---------- Город ----------
export const CITY = {
  N: 8,        // клеток по каждой оси (8x8 = 64 квартала)
  CELL: 56,    // размер клетки, м
  ROAD: 16,    // ширина дороги, м
  BLOCK: 40,   // застроенная часть клетки, м
  INNER: 33,   // внутренняя зона (здания/парк), м
  SIDEWALK: 3.5,
  HALF: 224,   // половина города: N*CELL/2
  LANE: 3.9    // смещение полосы от оси дороги
};

export const NEON_PALETTE = [0x33e0ff, 0xff41c8, 0xffb347, 0x54ff9f, 0x9d6bff, 0xff5964];

// ---------- Качество ----------
export const QUALITY = {
  low:    { traffic: 6,  peds: 10, shadows: false, shadowSize: 1024, bloom: false, pixelRatio: 1.0,  particles: 700,  rain: 350 },
  medium: { traffic: 10, peds: 16, shadows: true,  shadowSize: 1024, bloom: true,  pixelRatio: 1.25, particles: 1500, rain: 550 },
  high:   { traffic: 14, peds: 22, shadows: true,  shadowSize: 2048, bloom: true,  pixelRatio: 1.75, particles: 2600, rain: 750 }
};

// ---------- Физика ----------
export const TUNE = {
  dtMax: 0.05,          // защита от «прыжков» симуляции
  restitution: 0.25,    // упругость о здания
  restitutionCar: 0.35, // упругость машина-машина
  handbrakeGrip: 1.6,   // боковое сцепление при ручнике (низкое = дрифт)
  yawBoost: 1.55,       // множитель поворота при ручнике
  sparkSpeed: 5.5,      // порог искр о стену, м/с
  killSpeed: 4.5        // скорость, с которой машина давит пешехода
};

// ---------- Машины ----------
export const CAR_TYPES = {
  compact: {
    ru: 'Компакт', maxSpeed: 31, accel: 13.5, grip: 8.4, steer: 2.15, brake: 30,
    w: 2.0, l: 4.2, health: 100,
    colors: [0x2a66cc, 0xcc3d3d, 0x2f9e63, 0x8a8f99, 0xd8d3c4]
  },
  sport: {
    ru: 'Спорткар', maxSpeed: 44, accel: 21.5, grip: 7.4, steer: 2.55, brake: 34,
    w: 2.1, l: 4.5, health: 90,
    colors: [0xff5c2e, 0xffd400, 0x18c8e8, 0xd41a6b, 0xf2f2f2]
  },
  taxi: {
    ru: 'Такси', maxSpeed: 34, accel: 15.0, grip: 8.0, steer: 2.25, brake: 30,
    w: 2.05, l: 4.4, health: 110,
    colors: [0xffc400]
  },
  police: {
    ru: 'Полиция', maxSpeed: 40, accel: 19.0, grip: 8.8, steer: 2.4, brake: 33,
    w: 2.1, l: 4.5, health: 130,
    colors: [0x14161c]
  }
};

// ---------- Пешеходы ----------
export const PED = {
  walk: 1.7,
  run: 5.0,
  flee: 4.4,
  radius: 0.45,
  despawnFar: 130,
  spawnMin: 45,
  spawnMax: 110,
  deadFade: 14 // сек до «погружения» трупа
};

// ---------- Оружие ----------
export const WEAPON = {
  rate: 0.16,     // сек между выстрелами
  range: 70,
  mag: 12,
  reload: 1.15,
  dmgCar: 5,
  startAmmo: 48,
  ammoPickup: 24
};

// ---------- Розыск ----------
export const WANTED = {
  max: 5,
  perStar: 20,      // теплоты на звезду
  pedKill: 18,
  copCarKill: 30,
  copKill: 40,
  ramCop: 8,
  shotNearCop: 5,
  steal: 12,
  stealPolice: 30,
  decayDelay: 6,    // сек без преступления
  decayRate: 1.6,   // теплоты в секунду
  loseDist: 60      // «нет копа рядом»
};

// ---------- Игрок ----------
export const PLAYER = {
  health: 100,
  footSpeed: 5.2,
  enterDist: 3.4,
  explosionDmg: 80,
  bustedTime: 1.6
};

// ---------- Аптечки/патроны ----------
export const PICKUP = {
  count: 10,
  health: 25,
  respawn: 30
};
