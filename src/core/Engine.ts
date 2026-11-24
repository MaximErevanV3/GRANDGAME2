import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Ядро рендера: WebGL-контекст, сцена, камера, композер с bloom,
 * свет «луны» с тенями (следует за машиной) и окружение для бликов.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly composer: EffectComposer;

  private readonly bloom: UnrealBloomPass;
  private readonly moon: THREE.DirectionalLight;
  private readonly moonTarget = new THREE.Object3D();
  private readonly moonOffset = new THREE.Vector3(70, 110, -50);

  constructor() {
    const canvas = this.getCanvas();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070f);
    this.scene.fog = new THREE.FogExp2(0x070c18, 0.0042);
    this.scene.add(this.moonTarget);

    this.camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1400);
    this.camera.position.set(0, 26, -14);
    this.camera.lookAt(0, 0, 0);

    // Окружение (PMREM) — даёт блики на кузове и лужах, интенсивность низкая: ночь.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
    this.scene.environmentIntensity = 0.22;
    pmrem.dispose();

    // Небесная полусфера — холодная заливка, «луна» — направленный свет с тенями.
    const hemi = new THREE.HemisphereLight(0x2a3a5f, 0x090a12, 0.6);
    this.scene.add(hemi);

    this.moon = new THREE.DirectionalLight(0x8fb2ff, 0.55);
    this.moon.position.copy(this.moonOffset);
    this.moon.target = this.moonTarget;
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const shadowCam = this.moon.shadow.camera as THREE.OrthographicCamera;
    shadowCam.left = -80;
    shadowCam.right = 80;
    shadowCam.top = 80;
    shadowCam.bottom = -80;
    shadowCam.near = 20;
    shadowCam.far = 320;
    shadowCam.updateProjectionMatrix();
    this.moon.shadow.bias = -0.0007;
    this.moon.shadow.normalBias = 0.02;
    this.scene.add(this.moon);

    // Пост-процессинг: рендер -> bloom -> вывод. Bloom ловит только HDR-яркость (неон, фары).
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.75, // strength
      0.55, // radius
      0.82  // threshold — асфальт и окна ниже порога, неон/фары выше
    );
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
  }

  /** Тень «луны» следует за машиной, чтобы тени рядом с игроком были чёткими. */
  setFocus(position: THREE.Vector3): void {
    this.moonTarget.position.copy(position);
    this.moon.position.copy(position).add(this.moonOffset);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }

  private getCanvas(): HTMLCanvasElement {
    const el = document.getElementById('game');
    if (!(el instanceof HTMLCanvasElement)) {
      throw new Error('Не найден canvas #game — index.html повреждён');
    }
    return el;
  }
}
