// ============================================================
//  Menu — главное меню, настройки (с сохранением), управление,
//  пауза, экраны «ПОТРАЧЕНО»/«ПОЙМАН». Неоновый UI на CSS.
// ============================================================

import { settings, saveSettings } from '../config/settings.js';
import { GAME_VERSION } from '../config/constants.js';

const CONTROLS = [
  ['Газ / тормоз-задний', 'W / S  или  ↑ / ↓'],
  ['Поворот', 'A / D  или  ← / →'],
  ['Ручник (дрифт)', 'ПРОБЕЛ'],
  ['Сесть / выйти / угнать', 'F'],
  ['Фары', 'L'],
  ['Стрелять', 'ЛКМ (мышь — прицел)'],
  ['Перезарядка', 'R'],
  ['Пауза', 'ESC']
];

const SCHEMA = [
  { key: 'quality', label: 'Качество графики', type: 'seg', opts: ['low', 'medium', 'high'], names: ['НИЗКОЕ', 'СРЕДНЕЕ', 'ВЫСОКОЕ'] },
  { key: 'volume', label: 'Громкость', type: 'range', min: 0, max: 1, step: 0.05 },
  { key: 'bloom', label: 'Свечение неона (Bloom)', type: 'toggle' },
  { key: 'shadows', label: 'Динамические тени', type: 'toggle' },
  { key: 'rain', label: 'Дождь', type: 'toggle' },
  { key: 'shake', label: 'Тряска камеры', type: 'toggle' },
  { key: 'fps', label: 'Счётчик FPS', type: 'toggle' }
];

export class Menu {
  constructor(game) {
    this.game = game;
    this.cur = null;

    const root = document.getElementById('ui-root');
    root.insertAdjacentHTML('beforeend', `
      <div id="menu">
        <div class="menu-bg"></div>

        <section class="scr" id="scr-main">
          <h1 class="logo">GRAND&nbsp;CITY&nbsp;<span>2</span></h1>
          <div class="tagline">ретро-футуристичный неоновый открытый мир</div>
          <div class="btns">
            <button class="btn primary" data-act="play">ИГРАТЬ</button>
            <button class="btn" data-act="settings">НАСТРОЙКИ</button>
            <button class="btn" data-act="controls">УПРАВЛЕНИЕ</button>
          </div>
          <div class="ver">v${GAME_VERSION} · движок GRANDGAME2 · ноль внешних ассетов — весь город генерируется кодом</div>
        </section>

        <section class="scr" id="scr-settings">
          <h2 class="scr-title">НАСТРОЙКИ</h2>
          <div class="rows" id="settings-rows"></div>
          <div class="btns"><button class="btn primary" data-act="back">НАЗАД</button></div>
        </section>

        <section class="scr" id="scr-controls">
          <h2 class="scr-title">УПРАВЛЕНИЕ</h2>
          <table class="ctrl-table"></table>
          <div class="hint">Совет: зажми ПРОБЕЛ в повороте — получится дрифт. F у чужой машины — угон (полиция это не оценит).</div>
          <div class="btns"><button class="btn primary" data-act="back">НАЗАД</button></div>
        </section>

        <section class="scr" id="scr-pause">
          <h2 class="scr-title small">ПАУЗА</h2>
          <div class="btns">
            <button class="btn primary" data-act="resume">ПРОДОЛЖИТЬ</button>
            <button class="btn" data-act="restart">ЗАНОВО</button>
            <button class="btn" data-act="settings">НАСТРОЙКИ</button>
            <button class="btn" data-act="tomenu">ГЛАВНОЕ МЕНЮ</button>
          </div>
        </section>

        <section class="scr" id="scr-over">
          <h1 class="over-title" id="over-title">ПОТРАЧЕНО</h1>
          <div class="stats-grid" id="over-stats"></div>
          <div class="btns">
            <button class="btn primary" data-act="restart">ЗАНОВО</button>
            <button class="btn" data-act="tomenu">ГЛАВНОЕ МЕНЮ</button>
          </div>
        </section>
      </div>`);

    this.menu = root.querySelector('#menu');
    this.screens = {};
    for (const s of this.menu.querySelectorAll('.scr')) this.screens[s.id] = s;

    // клики
    this.menu.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      this.game.audio.ensure();
      this.game.audio.ui();
      this.act(btn.dataset.act);
    });

    this._buildControls();
    this._buildSettings();
    this.show('main');
  }

  act(a) {
    const g = this.game;
    switch (a) {
      case 'play': g.newRun(); break;
      case 'resume': g.resume(); break;
      case 'restart': g.newRun(); break;
      case 'tomenu': g.toMenu(); break;
      case 'settings':
        this._settingsBack = g.state === 'paused' ? 'pause' : 'main';
        this.show('settings');
        break;
      case 'back': this.show(this._settingsBack || 'main'); break;
      case 'controls': this.show('controls'); break;
    }
  }

  show(name) {
    this.cur = name;
    this.menu.classList.toggle('hidden', !name);
    for (const id in this.screens) {
      this.screens[id].classList.toggle('hidden', id !== ('scr-' + name));
    }
  }

  showOver(title, stats) {
    this.menu.querySelector('#over-title').textContent = title;
    this.menu.querySelector('#over-title').dataset.kind = title === 'ПОЙМАН' ? 'busted' : 'wasted';
    const mm = Math.floor(stats.time / 60), ss = Math.floor(stats.time % 60);
    this.menu.querySelector('#over-stats').innerHTML = `
      <div><span>ВРЕМЯ</span><b>${mm}:${String(ss).padStart(2, '0')}</b></div>
      <div><span>МАКС. РОЗЫСК</span><b>${'★'.repeat(Math.max(1, stats.maxWanted))}</b></div>
      <div><span>ПЕШЕХОДОВ</span><b>${stats.peds}</b></div>
      <div><span>ПАТРУЛЕЙ</span><b>${stats.cops}</b></div>
      <div><span>ВЫСТРЕЛОВ</span><b>${stats.shots}</b></div>`;
    this.show('over');
  }

  _buildControls() {
    const tbl = this.menu.querySelector('.ctrl-table');
    for (const [a, k] of CONTROLS) {
      tbl.insertAdjacentHTML('beforeend',
        `<tr><td>${a}</td><td><b>${k}</b></td></tr>`);
    }
  }

  _buildSettings() {
    const rows = this.menu.querySelector('#settings-rows');
    for (const s of SCHEMA) {
      const row = document.createElement('div');
      row.className = 'row';

      if (s.type === 'seg') {
        row.innerHTML = `<div class="row-label">${s.label}</div><div class="seg" data-key="${s.key}"></div>`;
        const seg = row.querySelector('.seg');
        s.opts.forEach((o, i) => {
          const b = document.createElement('button');
          b.className = 'seg-btn';
          b.textContent = s.names[i];
          b.dataset.val = o;
          b.addEventListener('click', () => {
            settings[s.key] = o;
            this._apply();
            seg.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('on', x.dataset.val === o));
          });
          if (settings[s.key] === o) b.classList.add('on');
          seg.appendChild(b);
        });
      } else if (s.type === 'toggle') {
        const b = document.createElement('button');
        b.className = 'toggle';
        b.innerHTML = `<div class="row-label">${s.label}</div><div class="t-val"></div>`;
        const sync = () => {
          b.querySelector('.t-val').textContent = settings[s.key] ? 'ВКЛ' : 'ВЫКЛ';
          b.classList.toggle('on', !!settings[s.key]);
        };
        b.addEventListener('click', () => {
          settings[s.key] = !settings[s.key];
          sync();
          this._apply();
        });
        sync();
        row.appendChild(b);
      } else if (s.type === 'range') {
        row.innerHTML = `<div class="row-label">${s.label}</div>
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${settings[s.key]}">
          <div class="range-val">${Math.round(settings[s.key] * 100)}%</div>`;
        const inp = row.querySelector('input');
        inp.addEventListener('input', () => {
          settings[s.key] = parseFloat(inp.value);
          row.querySelector('.range-val').textContent = Math.round(settings[s.key] * 100) + '%';
          this._apply();
        });
      }
      rows.appendChild(row);
    }
  }

  _apply() {
    saveSettings();
    this.game.applySettings();
  }
}
