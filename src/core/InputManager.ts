import type { InputState } from '../types/game.js';

/**
 * Ввод: клавиатура (WASD/стрелки, Space, L, F, H) и ЛКМ.
 * Тогглы (L/F/H) срабатывают на нажатии и «потребляются» при чтении состояния.
 */
export class InputManager {
  private readonly keys = new Set<string>();
  private headlightToggle = false;
  private carToggle = false;
  private helpToggle = false;
  private shooting = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (this.preventDefaultFor(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyL') this.headlightToggle = true;
      if (e.code === 'KeyF') this.carToggle = true;
      if (e.code === 'KeyH') this.helpToggle = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // При потере фокуса отпускаем всё, чтобы машина не уезжала сама.
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.shooting = false;
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.shooting = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.shooting = false;
    });
    window.addEventListener('contextmenu', (e) => {
      if (e.target instanceof HTMLCanvasElement) e.preventDefault();
    });
  }

  /** Снимок входа; тогглы L/F/H читаются один раз за кадр. */
  getState(): InputState {
    const forward = this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0;
    const back = this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0;
    const left = this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0;
    const right = this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0;

    const state: InputState = {
      throttle: forward - back,
      steer: right - left,
      handbrake: this.keys.has('Space'),
      shoot: this.shooting,
      headlightsToggled: this.headlightToggle,
      carToggled: this.carToggle,
      helpToggled: this.helpToggle,
    };

    this.headlightToggle = false;
    this.carToggle = false;
    this.helpToggle = false;
    return state;
  }

  private preventDefaultFor(code: string): boolean {
    return code === 'Space' || code.startsWith('Arrow');
  }
}
