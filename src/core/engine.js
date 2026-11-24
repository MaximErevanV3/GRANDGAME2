// ============================================================
//  Рендер-движок: WebGL, пост-обработка (bloom), свет, туман.
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY, TUNE } from '../config/constants.js';
import { settings } from '../config/settings.js';

export class Engine {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070e);
    this.scene.fog = new THREE.FogExp2(0x05070e, 0.0042);

    this.camera = new THREE.PerspectiveCamera(48, 1, 2, 540);
    this.camera.position.set(0, 60, 90);
    this.camera.lookAt(0, 0, 0);

    // --- Свет: «небо города» + «луна» с тенями ---
    this.hemi = new THREE.HemisphereLight(0x36416e, 0x0a0c12, 0.7);
    this.scene.add(this.hemi);

    this.moon = new THREE.DirectionalLight(0x93a7ff, 0.75);
    this.moon.castShadow = true;
    const sc = this.moon.shadow;
    sc.left = -85; sc.right = 85; sc.top = 85; sc.bottom = -85;
    sc.near = 20; sc.far = 320;
    sc.bias = -0.0008;
    sc.normalBias = 0.02;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    // --- Пост-обработка ---
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.55, 0.82);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.clock = new THREE.Clock();
    this.time = 0;
    this._raf = 0;

    window.addEventListener('resize', () => this.resize());
    this.applyQuality();
    this.resize();
  }

  get preset() { return QUALITY[settings.quality] || QUALITY.high; }

  // Пересборка параметров качества без перезагрузки страницы
  applyQuality() {
    const p = this.preset;
    const pr = Math.min(window.devicePixelRatio || 1, p.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = !!(settings.shadows && p.shadows);
    if (this.moon.shadow.map) { this.moon.shadow.map.dispose(); this.moon.shadow.map = null; }
    this.moon.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    this.bloomPass.enabled = !!(settings.bloom && p.bloom);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // масштаб gl_PointSize: сколько пикселей занимает 1 ед. размера на дистанции 1
    this.pxScale = (h * this.renderer.getPixelRatio()) / (2 * Math.tan((this.camera.fov * Math.PI / 180) / 2));
  }

  // Луч экран->земля (для прицеливания мышью)
  screenToGround(ndcX, ndcY, y = 1.1) {
    const v = new THREE.Vector3(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = v.sub(this.camera.position).normalize();
    if (Math.abs(dir.y) < 1e-4) dir.y = -1e-4;
    const t = (y - this.camera.position.y) / dir.y;
    return new THREE.Vector3().copy(this.camera.position).addScaledVector(dir, t);
  }

  // Теневая камера «луны» следует за игроком
  updateShadowRig(x, z) {
    this.moon.position.set(x - 70, 110, z + 50);
    this.moon.target.position.set(x, 0, z);
    this.moon.target.updateMatrixWorld();
  }

  start(loop) {
    const tick = () => {
      const dt = Math.min(this.clock.getDelta(), TUNE.dtMax);
      this.time += dt;
      loop(dt, this.time);
      this.render();
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.renderer.dispose();
  }
}
