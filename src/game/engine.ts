/* ============================================================
   НОЧНАЯ ТРАССА — 3D-движок (Three.js)
   Бесконечная ночная трасса под дождём: поток машин, нитро,
   near-miss комбо, урон, ранги. Всё процедурное, без ассетов.
   ============================================================ */
import * as THREE from "three";
import { SoundFX } from "./audio";

export type Phase = "menu" | "running" | "paused" | "over";

export interface HudState {
  score: number;
  speed: number; // км/ч
  distance: number; // метры
  time: number; // секунды
  nitro: number; // 0..100
  nitroOn: boolean;
  damage: number; // 0..3
  combo: number;
  rank: number;
  rankName: string;
  best: number;
}

export interface GameEvent {
  type: "hit" | "nearmiss" | "pickup" | "rankup" | "scrape" | "gameover" | "newrecord";
  value?: number;
  label?: string;
}

interface Callbacks {
  hud: (h: HudState) => void;
  phase: (p: Phase) => void;
  event: (e: GameEvent) => void;
}

export const RANKS = [
  { d: 0, name: "НОВИЧОК" },
  { d: 2000, name: "КУРЬЕР" },
  { d: 5000, name: "ГОНЩИК" },
  { d: 10000, name: "АС ТРАССЫ" },
  { d: 20000, name: "ЛЕГЕНДА НОЧИ" },
];

const LANES = [-3.66, 0, 3.66];
const ROAD_HALF = 5.8;
const CLAMP_X = 4.55;
const FOG_COLOR = 0x070b16;
const BEST_KEY = "nightroad_best_v1";

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ---------- вспомогательные текстуры (canvas) ---------- */

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roadTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 1024;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14171d";
  g.fillRect(0, 0, 256, 1024);
  // зерно асфальта
  for (let i = 0; i < 5200; i++) {
    const v = Math.random();
    g.fillStyle = v > 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.16)";
    g.fillRect(Math.random() * 256, Math.random() * 1024, 1.6, 1.6);
  }
  // мокрые продольные разводы
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 256;
    g.fillStyle = Math.random() > 0.5 ? "rgba(120,160,200,0.05)" : "rgba(0,0,0,0.08)";
    g.fillRect(x, 0, rnd(2, 7), 1024);
  }
  // краевые линии
  g.fillStyle = "rgba(228,233,240,0.85)";
  g.fillRect(6, 0, 5, 1024);
  g.fillRect(245, 0, 5, 1024);
  // пунктир между полосами (плитка = 15 м, штрих ~6 м)
  g.fillStyle = "rgba(240,244,250,0.8)";
  for (const lx of [256 / 3, (256 / 3) * 2]) {
    for (let y = 0; y < 1024; y += 1024) {
      g.fillRect(lx - 3, y + 120, 6, 410);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1, 60);
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowsTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#05070c";
  g.fillRect(0, 0, 128, 256);
  const warm = ["#ffd9a0", "#ffc36e", "#9fe8ff", "#ffe9c4"];
  for (let y = 6; y < 250; y += 12) {
    for (let x = 6; x < 122; x += 12) {
      if (Math.random() < 0.42) {
        g.fillStyle = warm[Math.floor(Math.random() * warm.length)];
        g.globalAlpha = rnd(0.35, 1);
        g.fillRect(x, y, 6, 7);
        g.globalAlpha = 1;
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function envTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, "#0a1424");
  grad.addColorStop(0.42, "#152238");
  grad.addColorStop(0.52, "#3d311c");
  grad.addColorStop(0.58, "#101318");
  grad.addColorStop(1, "#05070c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = Math.random() > 0.5 ? "rgba(255,200,120,0.8)" : "rgba(159,232,255,0.7)";
    g.fillRect(Math.random() * 256, 58 + Math.random() * 10, rnd(1, 3), 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const SIGN_WORDS = ["АЗС 24", "МОТЕЛЬ", "НЕОН", "КАФЕ", "ЭКСПРЕСС", "ТАКСИ", "БАР «ЛУНА»", "ШИНОМОНТАЖ"];
const SIGN_COLORS = ["#19e6ff", "#ffb020", "#ff2e4d", "#7dff8a"];

function makeSignTexture(word: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#070a11";
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = color;
  g.lineWidth = 6;
  g.strokeRect(14, 14, 484, 228);
  g.font = 'bold 76px "Russo One", "Arial Black", sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = color;
  g.shadowBlur = 34;
  g.fillStyle = color;
  g.fillText(word, 256, 128);
  g.shadowBlur = 12;
  g.fillStyle = "#ffffff";
  g.globalAlpha = 0.85;
  g.fillText(word, 256, 128);
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ---------- типы сущностей ---------- */

interface TrafficCar {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  brakeMat: THREE.MeshStandardMaterial;
  blinkMatL: THREE.MeshStandardMaterial;
  blinkMatR: THREE.MeshStandardMaterial;
  speed: number;
  lane: number;
  x: number;
  z: number;
  passed: boolean;
  mode: "cruise" | "signal" | "change";
  timer: number;
  targetLane: number;
  active: boolean;
}

interface Pickup {
  group: THREE.Group;
  kind: "nitro" | "bonus";
  z: number;
  x: number;
  active: boolean;
}

interface Spark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
}

interface Ripple {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  active: boolean;
}

interface Sign {
  group: THREE.Group;
  mat: THREE.MeshBasicMaterial;
  z: number;
}

/* ============================================================ */

export class NightDrive {
  private cb: Callbacks;
  sfx = new SoundFX();

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private elapsed = 0;

  phase: Phase = "menu";

  // --- игровое состояние ---
  private px = 0;
  private pvx = 0;
  private speed = 0;
  private nitro = 60;
  private nitroOn = false;
  private damage = 0;
  private invuln = 0;
  private score = 0;
  private combo = 0;
  private comboTimer = 0;
  private distance = 0;
  private runTime = 0;
  private rankIdx = 0;
  private best = 0;
  private shake = 0;
  private scrapeTimer = 0;
  private spawnTimer = 1.2;

  private keys = new Set<string>();

  // --- объекты сцены ---
  private player!: THREE.Group;
  private playerBrake!: THREE.MeshStandardMaterial;
  private playerBlinkL!: THREE.MeshStandardMaterial;
  private playerBlinkR!: THREE.MeshStandardMaterial;
  private headSpots: THREE.SpotLight[] = [];

  private traffic: TrafficCar[] = [];
  private pickups: Pickup[] = [];
  private sparks: Spark[] = [];
  private sparkGeo!: THREE.BufferGeometry;
  private sparkPts!: THREE.Points;
  private ripples: Ripple[] = [];
  private rippleTimer = 0;
  private poles: THREE.Group[] = [];
  private signs: Sign[] = [];
  private rain!: THREE.Points;
  private rainPos!: Float32Array;
  private rainVel!: Float32Array;
  private roadTex!: THREE.Texture;
  private scrollDist = 0;
  private moonLight!: THREE.DirectionalLight;
  private glowTex!: THREE.Texture;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.cb = cb;
    try {
      this.best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
    } catch {
      this.best = 0;
    }

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 950);
    this.camera.position.set(0, 4.6, 9.4);

    this.scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0125);
    this.scene.environment = envTexture();

    this.glowTex = glowTexture();
    this.buildSky();
    this.buildLights();
    this.buildRoad();
    this.buildCity();
    this.buildPoles();
    this.buildSigns();
    this.buildRain();
    this.buildSparks();
    this.buildRipples();
    this.buildPlayer();
    this.buildTrafficPool();
    this.buildPickupPool();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ================= построение сцены ================= */

  private buildSky() {
    const geo = new THREE.SphereGeometry(850, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#020409") },
        mid: { value: new THREE.Color("#0b1526") },
        glow: { value: new THREE.Color("#33261a") },
      },
      vertexShader: `
        varying vec3 vP;
        void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
      `,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 glow;
        varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 col = mix(glow, mid, smoothstep(-0.02, 0.16, h));
          col = mix(col, top, smoothstep(0.10, 0.55, h));
          col = mix(vec3(0.012,0.016,0.024), col, smoothstep(-0.25, 0.0, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    // звёзды
    const starGeo = new THREE.BufferGeometry();
    const n = 420;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * Math.PI * 0.48 + 0.06;
      const r = 780;
      pos[i * 3] = Math.cos(a) * Math.cos(e) * r;
      pos[i * 3 + 1] = Math.sin(e) * r;
      pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({
      color: 0xcfe4ff,
      size: 1.7,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.75,
      fog: false,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(starGeo, starMat));

    // луна
    const moon = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, color: 0xe9f2ff, fog: false, depthWrite: false, transparent: true, opacity: 0.95 })
    );
    moon.position.set(-240, 300, -700);
    moon.scale.setScalar(150);
    this.scene.add(moon);
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: this.glowTex, color: 0x9fb8e8, fog: false, depthWrite: false, transparent: true, opacity: 0.28 })
    );
    halo.position.copy(moon.position);
    halo.scale.setScalar(420);
    this.scene.add(halo);
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0x2a3a56, 0x0b0d12, 0.65);
    this.scene.add(hemi);

    this.moonLight = new THREE.DirectionalLight(0x8fb4ff, 1.15);
    this.moonLight.position.set(-14, 28, -20);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.mapSize.set(1024, 1024);
    this.moonLight.shadow.camera.left = -16;
    this.moonLight.shadow.camera.right = 16;
    this.moonLight.shadow.camera.top = 30;
    this.moonLight.shadow.camera.bottom = -40;
    this.moonLight.shadow.camera.far = 120;
    this.moonLight.shadow.bias = -0.002;
    this.scene.add(this.moonLight);
    this.scene.add(this.moonLight.target);
  }

  private buildRoad() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2200, 2200),
      new THREE.MeshStandardMaterial({ color: 0x06080d, roughness: 1, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    this.scene.add(ground);

    this.roadTex = roadTexture();
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 940),
      new THREE.MeshStandardMaterial({
        map: this.roadTex,
        color: 0xffffff,
        roughness: 0.42,
        metalness: 0.55,
        envMapIntensity: 0.55,
      })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -400);
    road.receiveShadow = true;
    this.scene.add(road);

    // отбойники
    const railMat = new THREE.MeshStandardMaterial({ color: 0x59636f, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.8 });
    const railGeo = new THREE.BoxGeometry(0.14, 0.5, 940);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(sx * (ROAD_HALF + 0.55), 0.62, -400);
      this.scene.add(rail);
      const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 940), railMat);
      rail2.position.set(sx * (ROAD_HALF + 0.55), 0.3, -400);
      this.scene.add(rail2);
    }
  }

  private buildCity() {
    const tex = windowsTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x0c111b,
      emissive: 0xffd9a0,
      emissiveMap: tex,
      emissiveIntensity: 0.75,
      roughness: 0.9,
      metalness: 0.1,
    });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const count = 96;
    const inst = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const w = rnd(9, 22);
      const h = rnd(9, 52);
      const d = rnd(9, 22);
      dummy.position.set(side * rnd(26, 90), h / 2 - 0.1, rnd(-820, 60));
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    this.scene.add(inst);
  }

  private buildPoles() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x20262e, roughness: 0.6, metalness: 0.7 });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x1a1206,
      emissive: 0xffb020,
      emissiveIntensity: 3.2,
      roughness: 0.4,
    });
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xffb020,
      transparent: true,
      opacity: 0.045,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const SPACING = 22;
    const PER_SIDE = 20;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < PER_SIDE; i++) {
        const g = new THREE.Group();
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6.6, 8), poleMat);
        pole.position.y = 3.3;
        g.add(pole);
        const arm = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.09, 0.09), poleMat);
        arm.position.set(-side * 0.85, 6.5, 0);
        g.add(arm);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), lampMat);
        lamp.position.set(-side * 1.7, 6.42, 0);
        g.add(lamp);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffb020, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
        );
        glow.position.copy(lamp.position);
        glow.scale.setScalar(3.4);
        g.add(glow);
        const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 6.5, 18, 1, true), coneMat);
        cone.position.set(-side * 1.7, 3.15, 0);
        g.add(cone);
        g.position.set(side * (ROAD_HALF + 1.5), 0, -i * SPACING + 12);
        this.scene.add(g);
        this.poles.push(g);
      }
    }
  }

  private buildSigns() {
    for (let i = 0; i < 5; i++) {
      const word = SIGN_WORDS[i % SIGN_WORDS.length];
      const color = SIGN_COLORS[i % SIGN_COLORS.length];
      const tex = makeSignTexture(word, color);
      const mat = new THREE.MeshBasicMaterial({ map: tex });
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), mat);
      board.position.y = 6.4;
      g.add(board);
      const back = new THREE.Mesh(
        new THREE.BoxGeometry(9.3, 4.8, 0.3),
        new THREE.MeshStandardMaterial({ color: 0x0a0e15, roughness: 0.8, metalness: 0.4 })
      );
      back.position.set(0, 6.4, -0.22);
      g.add(back);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.6, metalness: 0.7 });
      for (const lx of [-3.4, 3.4]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.4, 8), legMat);
        leg.position.set(lx, 2.2, -0.1);
        g.add(leg);
      }
      const side = i % 2 === 0 ? -1 : 1;
      g.position.set(side * rnd(12, 16), 0, -i * 150 - 70);
      g.rotation.y = side > 0 ? -Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25;
      this.scene.add(g);
      this.signs.push({ group: g, mat, z: g.position.z });
    }
  }

  private buildRain() {
    const n = 1300;
    this.rainPos = new Float32Array(n * 3);
    this.rainVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.rainPos[i * 3] = rnd(-46, 46);
      this.rainPos[i * 3 + 1] = rnd(0, 26);
      this.rainPos[i * 3 + 2] = rnd(-130, 24);
      this.rainVel[i] = rnd(24, 34);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xaecfe8,
      size: 0.085,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.rain = new THREE.Points(geo, mat);
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private buildSparks() {
    const n = 150;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    this.sparkGeo = new THREE.BufferGeometry();
    this.sparkGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffc46e,
      size: 0.2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPts = new THREE.Points(this.sparkGeo, mat);
    this.sparkPts.frustumCulled = false;
    this.scene.add(this.sparkPts);
    for (let i = 0; i < n; i++) {
      this.sparks.push({ pos: new THREE.Vector3(0, -999, 0), vel: new THREE.Vector3(), life: 0 });
    }
  }

  private buildRipples() {
    const geo = new THREE.RingGeometry(0.3, 0.38, 22);
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0x9fd0ff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.rotation.x = -Math.PI / 2;
      m.position.y = 0.03;
      m.visible = false;
      this.scene.add(m);
      this.ripples.push({ mesh: m, mat, life: 0, active: false });
    }
  }

  /* ---------- машины ---------- */

  private buildCar(bodyColor: number, isPlayer: boolean) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.3,
      metalness: 0.72,
      envMapIntensity: 0.9,
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0b1626,
      roughness: 0.12,
      metalness: 0.9,
      envMapIntensity: 1.3,
    });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x0c0e12, roughness: 0.85, metalness: 0.2 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.52, 4.5), bodyMat);
    body.position.y = 0.56;
    body.castShadow = true;
    g.add(body);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.3, 1.25), bodyMat);
    hood.position.set(0, 0.92, -1.5);
    hood.castShadow = true;
    g.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.34, 0.95), bodyMat);
    trunk.position.set(0, 0.94, 1.62);
    trunk.castShadow = true;
    g.add(trunk);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.52, 2.15), glassMat);
    cabin.position.set(0, 1.08, 0.12);
    cabin.castShadow = true;
    g.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.26, 14);
    for (const [wx, wz] of [
      [-0.92, -1.45],
      [0.92, -1.45],
      [-0.92, 1.45],
      [0.92, 1.45],
    ]) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.33, wz);
      g.add(w);
    }

    // фары (вперёд = -z)
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d8, emissive: 0xfff0c0, emissiveIntensity: 3.4, roughness: 0.3 });
    for (const hx of [-0.62, 0.62]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.06), headMat);
      h.position.set(hx, 0.66, -2.27);
      g.add(h);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff0c8, transparent: true, opacity: isPlayer ? 0.85 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      sp.position.set(hx, 0.66, -2.4);
      sp.scale.setScalar(isPlayer ? 1.7 : 1.1);
      g.add(sp);
    }

    // задние фонари
    const brakeMat = new THREE.MeshStandardMaterial({ color: 0x38060c, emissive: 0xff2020, emissiveIntensity: 2.2, roughness: 0.4 });
    for (const tx of [-0.66, 0.66]) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.11, 0.06), brakeMat);
      t.position.set(tx, 0.72, 2.27);
      g.add(t);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff3030, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      sp.position.set(tx, 0.72, 2.42);
      sp.scale.setScalar(1.15);
      g.add(sp);
    }

    // поворотники
    const mkBlink = () =>
      new THREE.MeshStandardMaterial({ color: 0x2a1802, emissive: 0xffa020, emissiveIntensity: 0, roughness: 0.4 });
    const blinkMatL = mkBlink();
    const blinkMatR = mkBlink();
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), blinkMatL);
    bl.position.set(-0.95, 0.62, -1.7);
    g.add(bl);
    const bl2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), blinkMatL);
    bl2.position.set(-0.95, 0.62, 1.7);
    g.add(bl2);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), blinkMatR);
    br.position.set(0.95, 0.62, -1.7);
    g.add(br);
    const br2 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.34), blinkMatR);
    br2.position.set(0.95, 0.62, 1.7);
    g.add(br2);

    if (isPlayer) {
      // подсветка днища
      const under = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 4.8),
        new THREE.MeshBasicMaterial({ color: 0x19e6ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      under.rotation.x = -Math.PI / 2;
      under.position.y = 0.06;
      g.add(under);
      const underLight = new THREE.PointLight(0x19e6ff, 26, 9, 1.8);
      underLight.position.set(0, 0.3, 0);
      g.add(underLight);

      // реальные фары-прожекторы
      for (const hx of [-0.62, 0.62]) {
        const spot = new THREE.SpotLight(0xffe7b0, 2600, 85, 0.52, 0.65, 1.9);
        spot.position.set(hx, 0.7, -2.1);
        const tgt = new THREE.Object3D();
        tgt.position.set(hx * 1.6, -0.6, -46);
        g.add(tgt);
        spot.target = tgt;
        g.add(spot);
        this.headSpots.push(spot);
      }
    }

    return { group: g, bodyMat, brakeMat, blinkMatL, blinkMatR };
  }

  private buildPlayer() {
    const { group, brakeMat, blinkMatL, blinkMatR } = this.buildCar(0xd81f3f, true);
    this.player = group;
    this.playerBrake = brakeMat;
    this.playerBlinkL = blinkMatL;
    this.playerBlinkR = blinkMatR;
    this.scene.add(this.player);
  }

  private buildTrafficPool() {
    const colors = [0x8a93a3, 0x274b8f, 0x7d1f2b, 0x1f6e4e, 0x11141a, 0xc9a227, 0x4a3f66, 0xb8b2a4];
    for (let i = 0; i < 14; i++) {
      const { group, bodyMat, brakeMat, blinkMatL, blinkMatR } = this.buildCar(colors[i % colors.length], false);
      group.visible = false;
      this.scene.add(group);
      this.traffic.push({
        group,
        bodyMat,
        brakeMat,
        blinkMatL,
        blinkMatR,
        speed: 20,
        lane: 0,
        x: 0,
        z: -9999,
        passed: false,
        mode: "cruise",
        timer: rnd(2, 6),
        targetLane: 0,
        active: false,
      });
    }
  }

  private buildPickupPool() {
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const kind: "nitro" | "bonus" = i % 2 === 0 ? "nitro" : "bonus";
      const color = kind === "nitro" ? 0x19e6ff : 0xffb020;
      const core = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.55, 0),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 2.4,
          roughness: 0.25,
          metalness: 0.6,
        })
      );
      core.position.y = 1.1;
      g.add(core);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.85, 0.045, 8, 28),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.1;
      g.add(ring);
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      sp.position.y = 1.1;
      sp.scale.setScalar(3);
      g.add(sp);
      g.visible = false;
      this.scene.add(g);
      this.pickups.push({ group: g, kind, z: -9999, x: 0, active: false });
    }
  }

  /* ================= управление состоянием ================= */

  begin() {
    this.px = 0;
    this.pvx = 0;
    this.speed = 8;
    this.nitro = 60;
    this.nitroOn = false;
    this.damage = 0;
    this.invuln = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.distance = 0;
    this.runTime = 0;
    this.rankIdx = 0;
    this.shake = 0;
    this.spawnTimer = 1.4;
    for (const c of this.traffic) {
      c.active = false;
      c.group.visible = false;
      c.z = -9999;
    }
    for (const p of this.pickups) {
      p.active = false;
      p.group.visible = false;
      p.z = -9999;
    }
    this.player.visible = true;
    this.setPhase("running");
  }

  togglePause() {
    if (this.phase === "running") {
      this.setPhase("paused");
      this.sfx.engineStop();
    } else if (this.phase === "paused") {
      this.setPhase("running");
      this.last = performance.now();
    }
  }

  toMenu() {
    for (const c of this.traffic) {
      c.active = false;
      c.group.visible = false;
    }
    for (const p of this.pickups) {
      p.active = false;
      p.group.visible = false;
    }
    this.player.visible = true;
    this.speed = 16;
    this.sfx.engineStop();
    this.setPhase("menu");
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.cb.phase(p);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.renderer.dispose();
  }

  /* ================= ввод ================= */

  private onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if ((e.code === "KeyP" || e.code === "Escape") && (this.phase === "running" || this.phase === "paused")) {
      this.togglePause();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private onVis = () => {
    if (document.hidden && this.phase === "running") this.togglePause();
  };
  private onBlur = () => {
    this.keys.clear();
    if (this.phase === "running") this.togglePause();
  };
  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  /* ================= игровой цикл ================= */

  private loop = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((t - this.last) / 1000, 0, 0.05);
    this.last = t;
    this.elapsed += dt;

    if (this.phase === "running") this.simulate(dt);
    else if (this.phase === "menu") this.attract(dt);
    else if (this.phase === "over") this.aftermath(dt);
    // paused: статичный кадр

    this.renderer.render(this.scene, this.camera);
  };

  /* ---------- режим меню: живой фон ---------- */
  private attract(dt: number) {
    this.speed = 16;
    this.scrollWorld(dt, this.speed);
    this.px = Math.sin(this.elapsed * 0.45) * 2.4;
    this.player.position.set(this.px, 0, 0);
    this.player.rotation.y = Math.cos(this.elapsed * 0.45) * 0.09;
    this.player.rotation.z = -Math.cos(this.elapsed * 0.45) * 0.045;
    this.updateRain(dt, this.speed);
    this.updateRipples(dt, this.speed);
    this.updateSparks(dt);
    this.updateCamera(dt, 0);
    this.emitHud();
    this.sfx.engine(0.18, false);
  }

  private aftermath(dt: number) {
    this.speed = Math.max(0, this.speed - 26 * dt);
    this.scrollWorld(dt, this.speed);
    this.updateRain(dt, this.speed);
    this.updateRipples(dt, this.speed);
    this.updateSparks(dt);
    this.updateTrafficVisual(dt);
    this.updateCamera(dt, 0);
    this.emitHud();
  }

  /* ---------- основная симуляция ---------- */
  private simulate(dt: number) {
    this.runTime += dt;
    const k = this.keys;
    const left = k.has("ArrowLeft") || k.has("KeyA");
    const right = k.has("ArrowRight") || k.has("KeyD");
    const throttle = k.has("ArrowUp") || k.has("KeyW");
    const brake = k.has("ArrowDown") || k.has("KeyS");
    const nitroKey = k.has("Space") || k.has("ShiftLeft") || k.has("ShiftRight");

    // нитро
    const wantNitro = nitroKey && this.nitro > 1;
    if (wantNitro && !this.nitroOn) this.sfx.nitro();
    this.nitroOn = wantNitro;
    if (this.nitroOn) this.nitro = Math.max(0, this.nitro - 24 * dt);
    else this.nitro = Math.min(100, this.nitro + 2.2 * dt);

    // продольная динамика
    const maxSpeed = this.nitroOn ? 76 : 56;
    if (this.nitroOn) this.speed += 30 * dt;
    else if (throttle) this.speed += 15 * dt;
    else if (brake) this.speed -= 34 * dt;
    else this.speed += (30 - this.speed) * 0.35 * dt; // крейсерская ~30
    this.speed = clamp(this.speed, 6, maxSpeed);

    // руление
    const steer = (left ? -1 : 0) + (right ? 1 : 0);
    const steerPower = 11 + this.speed * 0.12;
    this.pvx += (steer * steerPower - this.pvx) * Math.min(1, 9 * dt);
    this.px += this.pvx * dt;

    // отбойники
    if (Math.abs(this.px) > CLAMP_X) {
      this.px = Math.sign(this.px) * CLAMP_X;
      this.pvx *= -0.25;
      this.speed *= 0.985;
      this.scrapeTimer -= dt;
      if (this.scrapeTimer <= 0) {
        this.scrapeTimer = 0.14;
        this.sfx.scrape();
        this.burstSparks(new THREE.Vector3(this.px + Math.sign(this.px) * 0.9, 0.5, 0.4), 3, 0.5);
      }
    }

    this.player.position.set(this.px, 0, 0);
    this.player.rotation.y = -this.pvx * 0.028;
    this.player.rotation.z = -this.pvx * 0.016;
    this.playerBrake.emissiveIntensity = brake ? 4.6 : 2.2;

    // мигание при неуязвимости
    if (this.invuln > 0) {
      this.invuln -= dt;
      this.player.visible = Math.floor(this.elapsed * 14) % 2 === 0;
    } else {
      this.player.visible = true;
    }

    // очки и дистанция
    this.distance += this.speed * dt;
    this.score += this.speed * dt * 2.2;
    this.scrollDist += this.speed * dt;

    // комбо-таймер
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // ранги
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (this.distance >= RANKS[i].d) r = i;
    if (r > this.rankIdx) {
      this.rankIdx = r;
      this.cb.event({ type: "rankup", label: RANKS[r].name });
      this.sfx.rankUp();
    }

    this.scrollWorld(dt, this.speed);
    this.updateTraffic(dt);
    this.updatePickups(dt);
    this.updateRain(dt, this.speed);
    this.updateRipples(dt, this.speed);
    this.updateSparks(dt);
    this.updateCamera(dt, this.nitroOn ? 1 : 0);

    this.sfx.engine(clamp(this.speed / 70, 0, 1), this.nitroOn);
    this.emitHud();
  }

  /* ---------- мир прокручивается мимо игрока ---------- */
  private scrollWorld(dt: number, v: number) {
    const dz = v * dt;
    this.roadTex.offset.y = (this.scrollDist / 15) % 1;

    for (const p of this.poles) {
      p.position.z += dz;
      if (p.position.z > 26) p.position.z -= 22 * 20;
    }
    for (const s of this.signs) {
      s.z += dz;
      if (s.z > 40) {
        s.z -= 5 * 150;
        const word = SIGN_WORDS[Math.floor(Math.random() * SIGN_WORDS.length)];
        const color = SIGN_COLORS[Math.floor(Math.random() * SIGN_COLORS.length)];
        s.mat.map?.dispose();
        s.mat.map = makeSignTexture(word, color);
        s.mat.needsUpdate = true;
        s.group.position.z = s.z;
        s.group.position.x = (Math.random() > 0.5 ? 1 : -1) * rnd(12, 16);
        const side = s.group.position.x > 0 ? 1 : -1;
        s.group.rotation.y = side > 0 ? -Math.PI / 2 - 0.25 : Math.PI / 2 + 0.25;
      } else {
        s.group.position.z = s.z;
      }
    }
  }

  /* ---------- трафик ---------- */
  private updateTraffic(dt: number) {
    // спавн
    this.spawnTimer -= dt;
    const interval = clamp(1.5 - this.distance / 14000, 0.72, 1.5);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = interval * rnd(0.75, 1.25);
      const lanesToSpawn = Math.random() < 0.3 ? 2 : 1;
      const chosen: number[] = [];
      for (let s = 0; s < lanesToSpawn; s++) {
        const lane = Math.floor(Math.random() * 3);
        if (chosen.includes(lane)) continue;
        // не спавним, если в этой полосе близко есть машина
        const blocked = this.traffic.some((c) => c.active && c.lane === lane && c.z < -150 && c.z > -340);
        if (blocked) continue;
        const car = this.traffic.find((c) => !c.active);
        if (!car) break;
        chosen.push(lane);
        car.active = true;
        car.group.visible = true;
        car.lane = lane;
        car.x = LANES[lane];
        car.z = -rnd(240, 330);
        car.speed = rnd(15, 29);
        car.passed = false;
        car.mode = "cruise";
        car.timer = rnd(2.5, 7);
        car.targetLane = lane;
        car.group.position.set(car.x, 0, car.z);
      }
    }

    for (const c of this.traffic) {
      if (!c.active) continue;
      c.z += (this.speed - c.speed) * dt;

      // ИИ: перестроения с поворотником
      c.timer -= dt;
      if (c.mode === "cruise" && c.timer <= 0 && c.z < -40) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        const nl = clamp(c.lane + dir, 0, 2);
        const clear = !this.traffic.some((o) => o !== c && o.active && o.lane === nl && Math.abs(o.z - c.z) < 26);
        if (nl !== c.lane && clear) {
          c.mode = "signal";
          c.targetLane = nl;
          c.timer = 0.9;
        } else {
          c.timer = rnd(2, 5);
        }
      } else if (c.mode === "signal") {
        const dir = Math.sign(LANES[c.targetLane] - c.x) || 1;
        const blink = Math.floor(this.elapsed * 6) % 2 === 0 ? 3.4 : 0;
        if (dir < 0) {
          c.blinkMatL.emissiveIntensity = blink;
          c.blinkMatR.emissiveIntensity = 0;
        } else {
          c.blinkMatR.emissiveIntensity = blink;
          c.blinkMatL.emissiveIntensity = 0;
        }
        if (c.timer <= 0) {
          c.mode = "change";
          c.timer = 1.1;
        }
      } else if (c.mode === "change") {
        const tx = LANES[c.targetLane];
        c.x = Math.abs(tx - c.x) < 0.05 ? tx : c.x + Math.sign(tx - c.x) * Math.min(3.4 * dt, Math.abs(tx - c.x));
        c.group.rotation.y = -Math.sign(tx - c.x) * 0.08;
        const dir = Math.sign(tx - c.x) || 1;
        const blink = Math.floor(this.elapsed * 6) % 2 === 0 ? 3.4 : 0;
        if (dir < 0) c.blinkMatL.emissiveIntensity = blink;
        else c.blinkMatR.emissiveIntensity = blink;
        if (Math.abs(tx - c.x) < 0.06) {
          c.lane = c.targetLane;
          c.x = tx;
          c.mode = "cruise";
          c.timer = rnd(3, 8);
          c.group.rotation.y = 0;
          c.blinkMatL.emissiveIntensity = 0;
          c.blinkMatR.emissiveIntensity = 0;
        }
      }

      c.group.position.set(c.x, 0, c.z);

      // near-miss: игрок обогнал машину вплотную
      if (!c.passed && c.z > 2.4) {
        c.passed = true;
        const dx = Math.abs(c.x - this.px);
        if (dx < 3.0) {
          this.combo = Math.min(this.combo + 1, 20);
          this.comboTimer = 3.5;
          const pts = 100 * this.combo;
          this.score += pts;
          this.cb.event({ type: "nearmiss", value: pts });
          this.sfx.nearMiss(this.combo);
        }
      }

      // столкновение
      if (this.invuln <= 0 && Math.abs(c.z) < 3.9 && Math.abs(c.x - this.px) < 1.72) {
        this.onCrash(c);
      }

      // убрать позади / слишком далеко
      if (c.z > 46 || c.z < -560) {
        c.active = false;
        c.group.visible = false;
        c.z = -9999;
      }
    }
  }

  private updateTrafficVisual(dt: number) {
    for (const c of this.traffic) {
      if (!c.active) continue;
      c.z += (this.speed - c.speed) * dt;
      c.group.position.set(c.x, 0, c.z);
      if (c.z > 60) {
        c.active = false;
        c.group.visible = false;
      }
    }
  }

  private onCrash(c: TrafficCar) {
    this.damage += 1;
    this.invuln = 1.7;
    this.shake = 1.0;
    this.speed *= 0.38;
    this.combo = 0;
    this.comboTimer = 0;
    // отталкиваем игрока от машины
    this.px += Math.sign(this.px - c.x || 1) * 1.1;
    c.speed = Math.max(10, c.speed - 6);
    this.burstSparks(new THREE.Vector3((c.x + this.px) / 2, 0.8, (c.z) / 2 - 1.4), 26, 1);
    this.sfx.crash(this.damage >= 3);
    this.cb.event({ type: "hit", value: this.damage });

    if (this.damage >= 3) {
      this.burstSparks(new THREE.Vector3(this.px, 1, -1), 60, 1.6);
      this.shake = 1.6;
      this.player.visible = true;
      this.player.rotation.set(0, rnd(-0.5, 0.5), 0);
      this.sfx.engineStop();
      this.sfx.gameOver();
      let record = false;
      const finalScore = Math.round(this.score);
      if (finalScore > this.best) {
        this.best = finalScore;
        record = true;
        try {
          localStorage.setItem(BEST_KEY, String(finalScore));
        } catch {
          /* ignore */
        }
      }
      this.setPhase("over");
      this.cb.event({ type: "gameover", value: finalScore });
      if (record) this.cb.event({ type: "newrecord", value: finalScore });
    }
  }

  /* ---------- бонусы ---------- */
  private updatePickups(dt: number) {
    // спавн
    const activeCount = this.pickups.filter((p) => p.active).length;
    if (activeCount < 2 && Math.random() < dt * 0.5) {
      const p = this.pickups.find((q) => !q.active);
      if (p) {
        p.active = true;
        p.group.visible = true;
        p.kind = Math.random() < 0.55 ? "nitro" : "bonus";
        const color = p.kind === "nitro" ? 0x19e6ff : 0xffb020;
        const core = p.group.children[0] as THREE.Mesh;
        const mat = core.material as THREE.MeshStandardMaterial;
        mat.color.setHex(color);
        mat.emissive.setHex(color);
        const ring = p.group.children[1] as THREE.Mesh;
        (ring.material as THREE.MeshBasicMaterial).color.setHex(color);
        ((p.group.children[2] as THREE.Sprite).material as THREE.SpriteMaterial).color.setHex(color);
        p.x = LANES[Math.floor(Math.random() * 3)];
        p.z = -rnd(200, 300);
        p.group.position.set(p.x, 0, p.z);
      }
    }

    for (const p of this.pickups) {
      if (!p.active) continue;
      p.z += this.speed * dt;
      p.group.position.set(p.x, 0, p.z);
      p.group.children[0].rotation.y += 2.4 * dt;
      p.group.children[0].rotation.x += 1.1 * dt;
      (p.group.children[1] as THREE.Mesh).rotation.z += 1.6 * dt;
      p.group.children[0].position.y = 1.1 + Math.sin(this.elapsed * 3 + p.z) * 0.14;

      if (Math.abs(p.z) < 2.7 && Math.abs(p.x - this.px) < 1.55) {
        p.active = false;
        p.group.visible = false;
        p.z = -9999;
        this.burstSparks(new THREE.Vector3(p.x, 1.1, 0), 14, 0.8);
        if (p.kind === "nitro") {
          this.nitro = Math.min(100, this.nitro + 45);
          this.cb.event({ type: "pickup", label: "НИТРО +45" });
        } else {
          this.score += 500;
          this.cb.event({ type: "pickup", label: "+500 ОЧКОВ" });
        }
        this.sfx.pickup();
      } else if (p.z > 30) {
        p.active = false;
        p.group.visible = false;
        p.z = -9999;
      }
    }
  }

  /* ---------- эффекты ---------- */
  private burstSparks(at: THREE.Vector3, count: number, power: number) {
    let spawned = 0;
    for (const s of this.sparks) {
      if (s.life > 0) continue;
      s.pos.copy(at);
      s.vel.set(rnd(-6, 6) * power, rnd(1, 9) * power, rnd(-6, 6) * power);
      s.life = rnd(0.35, 0.8);
      if (++spawned >= count) break;
    }
  }

  private updateSparks(dt: number) {
    const attr = this.sparkGeo.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i];
      if (s.life <= 0) {
        arr[i * 3 + 1] = -999;
        continue;
      }
      s.life -= dt;
      s.vel.y -= 22 * dt;
      s.pos.addScaledVector(s.vel, dt);
      if (s.pos.y < 0.02) {
        s.pos.y = 0.02;
        s.vel.y *= -0.4;
        s.vel.x *= 0.8;
        s.vel.z *= 0.8;
      }
      arr[i * 3] = s.pos.x;
      arr[i * 3 + 1] = s.pos.y;
      arr[i * 3 + 2] = s.pos.z;
    }
    attr.needsUpdate = true;
  }

  private updateRain(dt: number, v: number) {
    const pos = this.rainPos;
    const n = pos.length / 3;
    const fall = dt * 1.6;
    for (let i = 0; i < n; i++) {
      pos[i * 3 + 1] -= this.rainVel[i] * fall * 1.9;
      pos[i * 3 + 2] += v * dt;
      pos[i * 3] -= 2.2 * dt;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = rnd(18, 26);
        pos[i * 3] = rnd(-46, 46);
        pos[i * 3 + 2] = rnd(-130, -60);
      }
      if (pos[i * 3 + 2] > 26) pos[i * 3 + 2] -= 156;
      if (pos[i * 3] < -48) pos[i * 3] += 96;
    }
    (this.rain.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateRipples(dt: number, v: number) {
    this.rippleTimer -= dt;
    if (this.rippleTimer <= 0) {
      this.rippleTimer = 0.05;
      const r = this.ripples.find((q) => !q.active);
      if (r) {
        r.active = true;
        r.life = 0;
        r.mesh.visible = true;
        r.mesh.position.set(rnd(-5.4, 5.4), 0.03, rnd(-70, 6));
        r.mesh.scale.setScalar(0.3);
      }
    }
    for (const r of this.ripples) {
      if (!r.active) continue;
      r.life += dt * 1.9;
      r.mesh.position.z += v * dt;
      r.mesh.scale.setScalar(0.3 + r.life * 1.7);
      r.mat.opacity = Math.max(0, 0.5 * (1 - r.life));
      if (r.life >= 1) {
        r.active = false;
        r.mesh.visible = false;
      }
    }
  }

  private updateCamera(dt: number, nitro: number) {
    const spd01 = clamp(this.speed / 70, 0, 1);
    const tx = this.px * 0.55;
    const ty = 4.4 + spd01 * 1.0;
    const tz = 9.4;
    const l = 1 - Math.exp(-6 * dt);
    this.camera.position.x += (tx - this.camera.position.x) * l;
    this.camera.position.y += (ty - this.camera.position.y) * l;
    this.camera.position.z += (tz - this.camera.position.z) * l;

    this.shake = Math.max(0, this.shake - 2.6 * dt);
    if (this.shake > 0) {
      const a = this.shake * this.shake * 0.5;
      this.camera.position.x += rnd(-a, a);
      this.camera.position.y += rnd(-a, a) * 0.6;
    }

    this.camera.lookAt(this.px * 0.8, 1.25, -17);

    const targetFov = 62 + spd01 * 17 + nitro * 7 + this.shake * 3;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 5 * dt);
      this.camera.updateProjectionMatrix();
    }

    // лунный свет следует за игроком
    this.moonLight.position.set(this.px - 14, 28, -20);
    this.moonLight.target.position.set(this.px, 0, -6);
  }

  private emitHud() {
    this.cb.hud({
      score: Math.round(this.score),
      speed: Math.round(this.speed * 3.6),
      distance: Math.round(this.distance),
      time: this.runTime,
      nitro: this.nitro,
      nitroOn: this.nitroOn,
      damage: this.damage,
      combo: this.combo,
      rank: this.rankIdx,
      rankName: RANKS[this.rankIdx].name,
      best: this.best,
    });
  }
}
