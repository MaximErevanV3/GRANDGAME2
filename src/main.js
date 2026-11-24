// ============================================================
//  GRAND CITY 2 — v3.0.0 — точка входа.
//  Стек: чистый JavaScript (ES-модули) + Three.js.
//  Весь арт и звук генерируются процедурно, без файлов.
// ============================================================

import { Game } from './core/game.js';
import { settings } from './config/settings.js';

function showError(msg) {
  const el = document.getElementById('err-root');
  el.textContent = 'Ошибка: ' + msg + ' — сделайте скриншот и сообщите разработчику';
  el.classList.add('show');
}

window.addEventListener('error', (e) => {
  showError(e.message || String(e.error));
});

window.addEventListener('unhandledrejection', (e) => {
  showError(String(e.reason));
});

const game = new Game(document.getElementById('app'));
game.applySettings();
window.game = game; // отладочный доступ из консоли браузера

// разблокировка звука по первому жесту (политика автоплея)
const unlock = () => game.audio.ensure();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
