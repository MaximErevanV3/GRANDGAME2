// ============================================================
//  Ввод: клавиатура + мышь, схема действий.
// ============================================================

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

const ACTIONS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  brake: ['Space'],
  enter: ['KeyF'],
  lights: ['KeyL'],
  reload: ['KeyR'],
  pause: ['Escape']
};

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();   // нажатия «в этом кадре»
    this.mouse = { x: 0, y: 0, ndcX: 0, ndcY: 0, down: false };
    this.capture = false;       // глотать пробел/стрелки только в игре
    this._rect = null;

    window.addEventListener('keydown', (e) => {
      if (this.capture && PREVENT.has(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.down = false; });

    window.addEventListener('mousemove', (e) => this._updateMouse(e));
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouse.down = true; this.pressed.add('Mouse0'); this._updateMouse(e); }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _updateMouse(e) {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
    const w = window.innerWidth, h = window.innerHeight;
    this.mouse.ndcX = (e.clientX / w) * 2 - 1;
    this.mouse.ndcY = -(e.clientY / h) * 2 + 1;
  }

  isDown(action) {
    if (action === 'fire') return this.mouse.down;
    const codes = ACTIONS[action];
    if (!codes) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  // Одно нажатие за кадр (клавиши действия + ЛКМ как 'fire')
  justPressed(action) {
    if (action === 'fire') return this.pressed.has('Mouse0');
    const codes = ACTIONS[action];
    if (!codes) return false;
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  }

  // Вектор движения WASD в экранных осях: x — вправо, z — «вверх экрана»
  moveVector() {
    let x = 0, z = 0;
    if (this.isDown('up')) z += 1;
    if (this.isDown('down')) z -= 1;
    if (this.isDown('left')) x -= 1;
    if (this.isDown('right')) x += 1;
    if (x !== 0 && z !== 0) { const k = Math.SQRT1_2; x *= k; z *= k; }
    return { x, z };
  }

  endFrame() { this.pressed.clear(); }
}
