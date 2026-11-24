/**
 * GRANDGAME2 — контракт типов (Шаг 1).
 * Всё игровое состояние, конфиг машины и вход описываются здесь.
 */

/** Константы мира. Сетка 6x6 кварталов; дороги идут по линиям, кратным CELL_SIZE. */
export const WORLD = {
  /** Количество ячеек (квартал + дорога) по каждой оси. */
  GRID: 6,
  /** Размер ячейки: квартал 40 + дорога 16. */
  CELL_SIZE: 56,
  /** Застроенная часть квартала. */
  BLOCK_SIZE: 40,
  /** Ширина проезжей части (две полосы). */
  ROAD_WIDTH: 16,
  /** Половина города: |x|, |z| <= 168 — крайняя линия дорог. */
  CITY_HALF: 168,
  /** Смещение центра полосы от оси дороги. */
  LANE_OFFSET: 4,
  /** Высота тротуарной плиты. */
  SIDEWALK_HEIGHT: 0.18,
} as const;

/** Точка на плоскости XZ. */
export interface Vec2 {
  x: number;
  z: number;
}

/** Настройки аркадной физики машины. */
export interface CarConfig {
  /** Максимальная скорость вперёд, м/с (~165 км/ч). */
  maxSpeed: number;
  /** Максимальная скорость заднего хода, м/с. */
  maxReverse: number;
  /** Ускорение при полном газе, м/с^2. */
  engineAccel: number;
  /** Замедление при торможении, м/с^2. */
  brakeDecel: number;
  /** Ускорение заднего хода, м/с^2. */
  reverseAccel: number;
  /** Выкат (сопротивление качению) при отпущенном газе, м/с^2. */
  dragDecel: number;
  /** Базовая скорость поворота руля, рад/с (на умеренной скорости). */
  steerRate: number;
  /** Боковое сцепление: коэффициент экспоненциального затухания боковой скорости, 1/с. */
  lateralGrip: number;
  /** То же на ручнике — сильно меньше -> дрифт. */
  handbrakeGrip: number;
  /** Множитель скорости поворота на ручнике (контролируемый занос). */
  driftSteerBoost: number;
}

/** Игроковая машина Шага 1. */
export const DEFAULT_CAR_CONFIG: CarConfig = {
  maxSpeed: 46,
  maxReverse: 12,
  engineAccel: 17,
  brakeDecel: 32,
  reverseAccel: 9,
  dragDecel: 1.6,
  steerRate: 2.1,
  lateralGrip: 7.5,
  handbrakeGrip: 1.6,
  driftSteerBoost: 1.55,
};

/** Снимок входа на текущем кадре. */
export interface InputState {
  /** -1 (назад) .. +1 (вперёд). */
  throttle: number;
  /** -1 (влево) .. +1 (вправо). */
  steer: number;
  /** Ручник (Space). */
  handbrake: boolean;
  /** Зажата ЛКМ (стрельба — Шаг 2). */
  shoot: boolean;
  /** Нажата L на этом кадре (переключить фары). */
  headlightsToggled: boolean;
  /** Нажата F на этом кадре (вход/выход — Шаг 2). */
  carToggled: boolean;
  /** Нажата H на этом кадре (подсказка). */
  helpToggled: boolean;
}

/** AABB-препятствие (здание или стена города). */
export interface BuildingBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Высота (для будущих шагов). */
  height: number;
}

/** Снимок состояния игры для HUD и систем. */
export interface GameState {
  time: number;
  speedKmh: number;
  posX: number;
  posZ: number;
  yaw: number;
  /** Модуль боковой скорости — сила дрифта, м/с. */
  driftAmount: number;
  /** Повреждения, 0..100. */
  damage: number;
  headlightsOn: boolean;
  inCar: boolean;
  /** Импульс последнего удара на кадре (для тряски камеры), м/с. */
  impact: number;
}

/** Начальное состояние. */
export function createInitialState(): GameState {
  return {
    time: 0,
    speedKmh: 0,
    posX: -WORLD.LANE_OFFSET,
    posZ: -10,
    yaw: 0,
    driftAmount: 0,
    damage: 0,
    headlightsOn: true,
    inCar: true,
    impact: 0,
  };
}
