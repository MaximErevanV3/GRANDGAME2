// ============================================================
//  Настройки игры: значения по умолчанию + localStorage.
// ============================================================

const KEY = 'gc2-settings-v3';

const DEFAULTS = {
  quality: 'high',   // low | medium | high
  bloom: true,       // свечение неона
  shadows: true,     // динамические тени
  rain: true,        // дождь
  shake: true,       // тряска камеры
  fps: true,         // счётчик FPS
  volume: 0.6        // 0..1
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch (e) { /* приватный режим — используем дефолты */ }
  return { ...DEFAULTS };
}

export const settings = load();

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch (e) { /* ignore */ }
}
