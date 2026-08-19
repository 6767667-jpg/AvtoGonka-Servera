/* ============================================================
   ОПЕРАЦИЯ «МИРАЖ» — 3D FPS-движок (Three.js)
   Раунды, экономика, закупка, боты с ИИ, hitscan-оружие,
   отдача/спрей, миникарта. Всё процедурное, без ассетов.
   ============================================================ */
import * as THREE from "three";
import { SoundFX } from "./audio";

export type GamePhase = "menu" | "buy" | "live" | "roundend" | "victory";

export interface HudState {
  phase: GamePhase;
  paused: boolean;
  hp: number;
  armor: number;
  helmet: boolean;
  money: number;
  mag: number;
  reserve: number;
  weaponName: string;
  weaponKind: "pistol" | "rifle";
  timer: number;
  round: number;
  wins: number;
  losses: number;
  botsLeft: number;
  kills: number;
  crossGap: number;
  crouch: boolean;
}

export interface GameEvent {
  type: "hit" | "headhit" | "kill" | "hurt" | "roundwin" | "roundlose" | "buyok" | "buyfail" | "empty";
  label?: string;
  value?: number;
}

export interface BuyItem {
  key: number;
  id: string;
  name: string;
  price: number;
  desc: string;
  kind: "pistol" | "rifle" | "gear";
}

export const BUY_ITEMS: BuyItem[] = [
  { key: 1, id: "p250", name: "P250", price: 300, desc: "Пистолет · урон 33 · магазин 13", kind: "pistol" },
  { key: 2, id: "ak", name: "АК-47", price: 2700, desc: "Штурмовая винтовка · урон 34 · авто", kind: "rifle" },
  { key: 3, id: "m4", name: "M4A4", price: 3100, desc: "Штурмовая винтовка · урон 30 · точнее", kind: "rifle" },
  { key: 4, id: "kevlar", name: "Бронежилет", price: 650, desc: "Поглощает 50% урона", kind: "gear" },
  { key: 5, id: "helm", name: "Броня + шлем", price: 1000, desc: "Жилет и шлем · урон −15% сверху", kind: "gear" },
];

export interface MatchStats {
  kills: number;
  headshots: number;
  shots: number;
  hits: number;
  wins: number;
  losses: number;
  rounds: number;
  moneyEarned: number;
}

interface Callbacks {
  hud: (h: HudState) => void;
  phase: (p: GamePhase, paused: boolean) => void;
  event: (e: GameEvent) => void;
  stats: (s: MatchStats) => void;
}

/* ---------- оружие ---------- */
type WeaponId = "usp" | "p250" | "ak" | "m4";
interface WeaponDef {
  id: WeaponId;
  name: string;
  dmg: number;
  auto: boolean;
  rps: number;
  mag: number;
  reserve: number;
  reload: number;
  spread: number;
  kick: number;
  kind: "pistol" | "rifle";
}
const WEAPONS: Record<WeaponId, WeaponDef> = {
  usp: { id: "usp", name: "USP-S", dmg: 28, auto: false, rps: 5.5, mag: 12, reserve: 24, reload: 1.7, spread: 0.008, kick: 0.011, kind: "pistol" },
  p250: { id: "p250", name: "P250", dmg: 33, auto: false, rps: 5, mag: 13, reserve: 26, reload: 1.8, spread: 0.01, kick: 0.014, kind: "pistol" },
  ak: { id: "ak", name: "АК-47", dmg: 34, auto: true, rps: 10, mag: 30, reserve: 90, reload: 2.4, spread: 0.017, kick: 0.028, kind: "rifle" },
  m4: { id: "m4", name: "M4A4", dmg: 30, auto: true, rps: 10.7, mag: 30, reserve: 90, reload: 2.6, spread: 0.012, kick: 0.02, kind: "rifle" },
};

/* ---------- карта ---------- */
interface ObstacleDef { x: number; z: number; w: number; d: number; h: number; kind: "crate" | "container" | "wall" | "sandbag" | "barrel" | "block"; color?: number }
const WORLD = { w: 64, h: 48, wallH: 5 };
const SPAWN_PLAYER = new THREE.Vector3(0, 0, 19);
const BOT_SPAWNS: [number, number][] = [[-16, -19], [0, -20.5], [16, -19], [-25, -10], [25, -10]];

const OBSTACLES: ObstacleDef[] = [
  // периметр
  { x: 0, z: -24.6, w: 66, d: 1.2, h: WORLD.wallH, kind: "wall" },
  { x: 0, z: 24.6, w: 66, d: 1.2, h: WORLD.wallH, kind: "wall" },
  { x: -32.6, z: 0, w: 1.2, d: 50.4, h: WORLD.wallH, kind: "wall" },
  { x: 32.6, z: 0, w: 1.2, d: 50.4, h: WORLD.wallH, kind: "wall" },
  // центральные укрытия
  { x: 0, z: 0, w: 7.5, d: 2.7, h: 2.7, kind: "container", color: 0x7a3b2e },
  { x: -11, z: 6.5, w: 2.7, d: 7.5, h: 2.7, kind: "container", color: 0x2e5d7a },
  { x: 11.5, z: -6, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: 13.9, z: -6, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: 12.7, z: -6, w: 2.3, d: 2.3, h: 2.1, kind: "crate", color: 0x101010 },
  { x: -7, z: -8, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: -7, z: -8, w: 2.3, d: 2.3, h: 2.1, kind: "crate", color: 0x101010 },
  { x: -15, z: -3, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: 15, z: 10, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: 15, z: 10, w: 2.3, d: 2.3, h: 2.1, kind: "crate", color: 0x101010 },
  { x: -3.5, z: 12, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  { x: 4, z: -13, w: 2.4, d: 2.4, h: 2.2, kind: "crate" },
  // низкие стены
  { x: -5, z: -5.5, w: 6, d: 0.5, h: 1.25, kind: "wall" },
  { x: 7.5, z: 6.5, w: 0.5, d: 5.5, h: 1.25, kind: "wall" },
  // мешки с песком
  { x: -19, z: 9, w: 3.2, d: 1.1, h: 0.85, kind: "sandbag" },
  { x: 19, z: -11, w: 3.2, d: 1.1, h: 0.85, kind: "sandbag" },
  { x: -8, z: 16, w: 1.1, d: 3.2, h: 0.85, kind: "sandbag" },
  // блоки-«здания» по углам
  { x: -25, z: -15, w: 8, d: 6, h: 4.2, kind: "block" },
  { x: 25, z: 15, w: 8, d: 6, h: 4.2, kind: "block" },
  { x: 26, z: -14, w: 5, d: 8, h: 3.4, kind: "block" },
  { x: -26, z: 14, w: 5, d: 8, h: 3.4, kind: "block" },
  // бочки (декор + мелкие коллайдеры)
  { x: 20.5, z: 14.5, w: 1, d: 1, h: 1.1, kind: "barrel", color: 0x4a5a34 },
  { x: -21, z: -12.5, w: 1, d: 1, h: 1.1, kind: "barrel", color: 0x7a3028 },
  { x: 9, z: 17.5, w: 1, d: 1, h: 1.1, kind: "barrel", color: 0x4a5a34 },
];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* ---------- процедурные текстуры ---------- */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function groundTexture(): THREE.CanvasTexture {
  return canvasTex(512, 512, (g) => {
    g.fillStyle = "#a8946c";
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) {
      const v = Math.random();
      g.fillStyle = v > 0.5 ? "rgba(255,240,210,0.06)" : "rgba(60,45,25,0.09)";
      g.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }
    for (let i = 0; i < 26; i++) {
      g.fillStyle = "rgba(80,62,38,0.08)";
      g.beginPath();
      g.ellipse(Math.random() * 512, Math.random() * 512, rnd(14, 60), rnd(10, 40), rnd(0, 3), 0, Math.PI * 2);
      g.fill();
    }
    // следы техники
    g.strokeStyle = "rgba(70,55,32,0.16)";
    g.lineWidth = 9;
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 512;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 40, 170, x - 40, 340, x + 20, 512);
      g.stroke();
    }
  }, [14, 14]);
}

function concreteTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#93876f";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3600; i++) {
      g.fillStyle = Math.random() > 0.5 ? "rgba(255,250,235,0.05)" : "rgba(40,32,20,0.08)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = "rgba(50,42,28,0.25)";
    g.lineWidth = 2;
    for (let y = 64; y < 256; y += 64) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
    for (let i = 0; i < 8; i++) {
      g.fillStyle = "rgba(60,50,32,0.12)";
      g.beginPath();
      g.ellipse(Math.random() * 256, Math.random() * 256, rnd(8, 30), rnd(6, 20), 0, 0, Math.PI * 2);
      g.fill();
    }
  }, [3, 1.4]);
}

function crateTexture(): THREE.CanvasTexture {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = "#7d6139";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 36) {
      g.fillStyle = y % 72 === 0 ? "#86693f" : "#745a35";
      g.fillRect(0, y, 256, 34);
      g.strokeStyle = "rgba(45,32,15,0.6)";
      g.lineWidth = 3;
      g.strokeRect(0, y, 256, 34);
    }
    g.strokeStyle = "#4c3a1e";
    g.lineWidth = 14;
    g.strokeRect(7, 7, 242, 242);
    g.lineWidth = 10;
    g.beginPath();
    g.moveTo(10, 10);
    g.lineTo(246, 246);
    g.moveTo(246, 10);
    g.lineTo(10, 246);
    g.stroke();
    for (let i = 0; i < 700; i++) {
      g.fillStyle = "rgba(30,20,8,0.1)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
  });
}

function containerTexture(color: number): THREE.CanvasTexture {
  const base = new THREE.Color(color);
  const css = `#${base.getHexString()}`;
  const dark = `#${base.clone().multiplyScalar(0.55).getHexString()}`;
  return canvasTex(256, 256, (g) => {
    g.fillStyle = css;
    g.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 18) {
      g.fillStyle = dark;
      g.fillRect(x, 0, 8, 256);
    }
    g.fillStyle = "rgba(0,0,0,0.25)";
    g.fillRect(0, 0, 256, 16);
    g.fillRect(0, 240, 256, 16);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() > 0.6 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.12)";
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    // потёртости
    g.fillStyle = "rgba(122,96,60,0.25)";
    g.fillRect(0, 200, 256, 56);
  });
}

function sandbagTexture(): THREE.CanvasTexture {
  return canvasTex(256, 128, (g) => {
    g.fillStyle = "#b3a077";
    g.fillRect(0, 0, 256, 128);
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 4; i++) {
        const x = i * 64 + (row % 2) * 32;
        g.fillStyle = row % 2 ? "#a89468" : "#b8a67c";
        g.beginPath();
        g.ellipse(x + 32, row * 44 + 24, 34, 22, 0, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = "rgba(70,58,36,0.5)";
        g.lineWidth = 2;
        g.stroke();
      }
    }
    for (let i = 0; i < 600; i++) {
      g.fillStyle = "rgba(60,48,28,0.1)";
      g.fillRect(Math.random() * 256, Math.random() * 128, 2, 2);
    }
  });
}

function glowTexture(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.3, "rgba(255,255,255,0.5)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ---------- сущности ---------- */

interface Bot {
  group: THREE.Group;
  headMesh: THREE.Mesh;
  torsoMesh: THREE.Mesh;
  legsMesh: THREE.Mesh;
  mats: THREE.MeshStandardMaterial[];
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  muzzle: THREE.Object3D;
  flashSprite: THREE.Sprite;
  hp: number;
  active: boolean;
  dying: boolean;
  dieT: number;
  yaw: number;
  strafeDir: number;
  strafeTimer: number;
  shootCd: number;
  burstLeft: number;
  burstTimer: number;
  speed: number;
  range: number;
  flash: number;
  walkT: number;
  name: string;
}

interface Tracer { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; life: number; active: boolean }
interface Casing { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; vel: THREE.Vector3; spin: THREE.Vector3; life: number; active: boolean }

interface Pool {
  pos: Float32Array;
  vel: Float32Array;
  life: Float32Array;
  geo: THREE.BufferGeometry;
  n: number;
}

interface AABB { x: number; z: number; hx: number; hz: number; h: number }

/* ============================================================ */

export class FpsEngine {
  sfx = new SoundFX();
  private cb: Callbacks;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private disposed = false;

  phase: GamePhase = "menu";
  paused = false;

  // игрок
  private pos = SPAWN_PLAYER.clone();
  private vel = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0;
  private grounded = true;
  private crouch = false;
  private hp = 100;
  private armor = 0;
  private helmet = false;
  private money = 800;
  private dead = false;
  private deadT = 0;
  private shake = 0;
  private bobT = 0;
  private stepT = 0;
  private stepAlt = false;
  private recoilKick = 0;

  // оружие
  private owned: WeaponId[] = ["usp"];
  private slotPrimary: WeaponId | null = null;
  private slotSecondary: WeaponId = "usp";
  private current: WeaponId = "usp";
  private mags: Record<string, number> = {};
  private reserves: Record<string, number> = {};
  private fireCd = 0;
  private shotsFired = 0;
  private sinceFire = 1;
  private reloading = false;
  private reloadT = 0;
  private reloadStaged = 0;
  private switchT = 0;
  private switchingTo: WeaponId | null = null;
  private mouseDown = false;
  private mouseClicked = false;
  private bloom = 0;

  // раунд
  private round = 0;
  private wins = 0;
  private losses = 0;
  private matchTarget = 5;
  private timer = 0;
  private roundendWin = false;
  private moneyEarned = 0;

  // статистика
  private kills = 0;
  private headshots = 0;
  private shots = 0;
  private hits = 0;

  private keys = new Set<string>();

  // сцена
  private colliders: AABB[] = [];
  private worldMeshes: THREE.Mesh[] = [];
  private bots: Bot[] = [];
  private tracers: Tracer[] = [];
  private casings: Casing[] = [];
  private blood!: Pool;
  private sparks!: Pool;
  private glowTex!: THREE.Texture;
  private vmPistol!: THREE.Group;
  private vmRifle!: THREE.Group;
  private vmMuzzlePistol!: THREE.Object3D;
  private vmMuzzleRifle!: THREE.Object3D;
  private vmOffset = new THREE.Vector3();
  private muzzleLight!: THREE.PointLight;
  private muzzleLightT = 0;
  private sun!: THREE.DirectionalLight;

  // миникарта
  private miniCtx: CanvasRenderingContext2D | null = null;
  private miniStatic: HTMLCanvasElement | null = null;

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.cb = cb;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.camera = new THREE.PerspectiveCamera(78, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);

    this.scene.fog = new THREE.FogExp2(0xc9b892, 0.0075);
    this.glowTex = glowTexture();

    this.buildSky();
    this.buildLights();
    this.buildGround();
    this.buildObstacles();
    this.buildDust();
    this.buildPools();
    this.buildViewmodels();
    this.buildBotPool();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("pointerlockchange", this.onLockChange);
    canvas.addEventListener("contextmenu", this.onCtx);

    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ================= сцена ================= */

  private buildSky() {
    const geo = new THREE.SphereGeometry(480, 24, 14);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#5f87ad") },
        mid: { value: new THREE.Color("#9db8d0") },
        hor: { value: new THREE.Color("#dcc79e") },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP;
        void main(){
          float h = vP.y;
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.22, h));
          col = mix(col, top, smoothstep(0.18, 0.6, h));
          col = mix(vec3(0.72,0.62,0.45), col, smoothstep(-0.2, 0.02, h));
          gl_FragColor = vec4(col,1.0);
        }`,
    });
    this.scene.add(new THREE.Mesh(geo, mat));

    // солнце
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xfff2d0, fog: false, depthWrite: false, transparent: true, opacity: 0.95 }));
    sun.position.set(180, 260, -300);
    sun.scale.setScalar(120);
    this.scene.add(sun);

    // дальние силуэты за стенами
    const sil = new THREE.MeshStandardMaterial({ color: 0x8d7c5c, roughness: 1 });
    const defs: [number, number, number, number, number][] = [
      [-90, -70, 40, 26, 30], [60, -95, 55, 20, 36], [110, 40, 34, 30, 26], [-120, 60, 46, 24, 34], [0, 120, 70, 18, 30],
    ];
    for (const [x, z, w, d, h] of defs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), sil);
      m.position.set(x, h / 2 - 1, z);
      this.scene.add(m);
    }
  }

  private buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbcd3e8, 0x8a7355, 0.85));
    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
    this.sun.position.set(-30, 46, -24);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 34;
    this.sun.shadow.camera.bottom = -34;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.bias = -0.0006;
    this.scene.add(this.sun);
    this.muzzleLight = new THREE.PointLight(0xffd27a, 0, 14, 1.6);
    this.scene.add(this.muzzleLight);
  }

  private buildGround() {
    const g = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 560),
      new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95, metalness: 0 })
    );
    g.rotation.x = -Math.PI / 2;
    g.receiveShadow = true;
    this.scene.add(g);
    this.worldMeshes.push(g);
  }

  private buildObstacles() {
    const concrete = concreteTexture();
    const crate = crateTexture();
    const sandbag = sandbagTexture();
    for (const o of OBSTACLES) {
      let mesh: THREE.Mesh;
      if (o.kind === "wall" || o.kind === "block") {
        const tex = concrete.clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, o.w / 6), Math.max(1, o.h / 3));
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, o.d),
          new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0.02 })
        );
      } else if (o.kind === "crate") {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, o.d),
          new THREE.MeshStandardMaterial({ map: crate.clone(), roughness: 0.85, metalness: 0.05 })
        );
        (mesh.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
        if (o.color === 0x101010) mesh.position.y += 2.15;
      } else if (o.kind === "container") {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, o.d),
          new THREE.MeshStandardMaterial({ map: containerTexture(o.color ?? 0x7a3b2e), roughness: 0.6, metalness: 0.5 })
        );
      } else if (o.kind === "sandbag") {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(o.w, o.h, o.d),
          new THREE.MeshStandardMaterial({ map: sandbag.clone(), roughness: 1 })
        );
        (mesh.material as THREE.MeshStandardMaterial).map!.needsUpdate = true;
      } else {
        // бочка
        mesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.5, 0.5, 1.1, 14),
          new THREE.MeshStandardMaterial({ color: o.color, roughness: 0.55, metalness: 0.55 })
        );
      }
      mesh.position.set(o.x, mesh.position.y + o.h / 2, o.z);
      if (o.kind === "crate" && o.color === 0x101010) mesh.position.y = 2.15 + o.h / 2;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.worldMeshes.push(mesh);
      this.colliders.push({ x: o.x, z: o.z, hx: o.w / 2, hz: o.d / 2, h: o.h });
    }
  }

  private buildDust() {
    const n = 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rnd(-30, 30);
      pos[i * 3 + 1] = rnd(0.2, 6);
      pos[i * 3 + 2] = rnd(-23, 23);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xe8d8b0, size: 0.05, transparent: true, opacity: 0.4, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.name = "dust";
    this.scene.add(pts);
  }

  private makePool(n: number, color: number, size: number): Pool {
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    const life = new Float32Array(n);
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    return { pos, vel, life, geo, n };
  }

  private buildPools() {
    this.blood = this.makePool(260, 0xd02020, 0.09);
    this.sparks = this.makePool(140, 0xffc46e, 0.07);
    // трассеры
    const tGeo = new THREE.BoxGeometry(0.03, 0.03, 1);
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const mesh = new THREE.Mesh(tGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.tracers.push({ mesh, mat, life: 0, active: false });
    }
    // гильзы
    const cGeo = new THREE.BoxGeometry(0.022, 0.06, 0.022);
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.MeshStandardMaterial({ color: 0xd8a838, roughness: 0.35, metalness: 0.9, transparent: true });
      const mesh = new THREE.Mesh(cGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.casings.push({ mesh, mat, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, active: false });
    }
  }

  /* ---------- вьюмодели оружия ---------- */

  private buildViewmodels() {
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.42, metalness: 0.85 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.6, metalness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6e4526, roughness: 0.7, metalness: 0.1 });

    // пистолет
    const p = new THREE.Group();
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.3), metal);
    slide.position.set(0, 0.03, -0.06);
    p.add(slide);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.24), dark);
    frame.position.set(0, -0.025, -0.02);
    p.add(frame);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), dark);
    grip.position.set(0, -0.1, 0.06);
    grip.rotation.x = 0.28;
    p.add(grip);
    const pm = new THREE.Object3D();
    pm.position.set(0, 0.035, -0.23);
    p.add(pm);
    p.position.set(0.24, -0.22, -0.46);
    this.camera.add(p);
    this.vmPistol = p;
    this.vmMuzzlePistol = pm;

    // винтовка
    const r = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.52), metal);
    body.position.set(0, 0, -0.1);
    r.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.012, -0.56);
    r.add(barrel);
    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.06, 0.22), wood);
    handguard.position.set(0, -0.005, -0.42);
    r.add(handguard);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.08), dark);
    mag.position.set(0, -0.11, -0.14);
    mag.rotation.x = 0.22;
    r.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.2), wood);
    stock.position.set(0, -0.02, 0.22);
    r.add(stock);
    const grip2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.11, 0.055), dark);
    grip2.position.set(0, -0.1, 0.02);
    grip2.rotation.x = 0.3;
    r.add(grip2);
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.02), dark);
    sight.position.set(0, 0.06, -0.3);
    r.add(sight);
    const rm = new THREE.Object3D();
    rm.position.set(0, 0.012, -0.78);
    r.add(rm);
    r.position.set(0.26, -0.24, -0.42);
    this.camera.add(r);
    this.vmRifle = r;
    this.vmMuzzleRifle = rm;
  }

  /* ---------- боты ---------- */

  private buildBotPool() {
    for (let i = 0; i < 8; i++) {
      const g = new THREE.Group();
      const cloth = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x6d6148 : 0x4a4438, roughness: 0.9 });
      const cloth2 = new THREE.MeshStandardMaterial({ color: i % 2 ? 0x57503c : 0x3a352b, roughness: 0.9 });
      const skin = new THREE.MeshStandardMaterial({ color: 0xc9996b, roughness: 0.8 });
      const mask = new THREE.MeshStandardMaterial({ color: 0x1c1e1c, roughness: 0.95 });
      const mats = [cloth, cloth2, skin, mask];

      const mkPivot = (x: number, y: number) => {
        const pv = new THREE.Group();
        pv.position.set(x, y, 0);
        g.add(pv);
        return pv;
      };

      const legL = mkPivot(-0.11, 0.52);
      const legR = mkPivot(0.11, 0.52);
      const legGeo = new THREE.BoxGeometry(0.15, 0.52, 0.17);
      const ll = new THREE.Mesh(legGeo, cloth2);
      ll.position.y = -0.26;
      ll.castShadow = true;
      legL.add(ll);
      const lr = new THREE.Mesh(legGeo, cloth2);
      lr.position.y = -0.26;
      lr.castShadow = true;
      legR.add(lr);

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.26), cloth);
      torso.position.y = 0.84;
      torso.castShadow = true;
      g.add(torso);
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.34, 0.3), cloth2);
      vest.position.y = 0.88;
      g.add(vest);

      const armL = mkPivot(-0.28, 1.06);
      const armR = mkPivot(0.28, 1.06);
      const armGeo = new THREE.BoxGeometry(0.11, 0.46, 0.12);
      const al = new THREE.Mesh(armGeo, cloth);
      al.position.y = -0.2;
      al.castShadow = true;
      armL.add(al);
      const ar = new THREE.Mesh(armGeo, cloth);
      ar.position.y = -0.2;
      ar.castShadow = true;
      armR.add(ar);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 12, 10), mask);
      head.position.y = 1.3;
      head.castShadow = true;
      g.add(head);
      const face = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.05), skin);
      face.position.set(0, 1.29, -0.115);
      g.add(face);

      // оружие бота
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.62), new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.5, metalness: 0.7 }));
      gun.position.set(0.2, 1.05, -0.35);
      g.add(gun);
      const muzzle = new THREE.Object3D();
      muzzle.position.set(0.2, 1.06, -0.7);
      g.add(muzzle);

      const flashSprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: this.glowTex, color: 0xffcf80, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
      );
      flashSprite.position.copy(muzzle.position);
      flashSprite.scale.setScalar(0.7);
      g.add(flashSprite);

      // хитбоксы
      head.userData = { bot: i, part: "head" };
      torso.userData = { bot: i, part: "body" };
      const legsHit = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
      legsHit.position.y = 0.3;
      legsHit.userData = { bot: i, part: "body" };
      g.add(legsHit);

      g.visible = false;
      this.scene.add(g);
      this.bots.push({
        group: g, headMesh: head, torsoMesh: torso, legsMesh: legsHit, mats, legL, legR, armL, armR,
        muzzle, flashSprite, hp: 100, active: false, dying: false, dieT: 0, yaw: 0,
        strafeDir: 1, strafeTimer: 1, shootCd: 1, burstLeft: 0, burstTimer: 0,
        speed: 3, range: 12, flash: 0, walkT: Math.random() * 6,
        name: `Противник ${i + 1}`,
      });
    }
  }

  /* ================= управление состоянием ================= */

  attachMinimap(canvas: HTMLCanvasElement) {
    this.miniCtx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;
    const st = document.createElement("canvas");
    st.width = w;
    st.height = h;
    const g = st.getContext("2d")!;
    g.fillStyle = "rgba(10,11,8,0.88)";
    g.fillRect(0, 0, w, h);
    const sx = w / WORLD.w;
    const sy = h / WORLD.h;
    const wx = (x: number) => (x + WORLD.w / 2) * sx;
    const wz = (z: number) => (z + WORLD.h / 2) * sy;
    g.fillStyle = "rgba(203,180,137,0.16)";
    g.fillRect(wx(-32), wz(-24), 64 * sx, 48 * sy);
    for (const o of OBSTACLES) {
      if (o.kind === "barrel") continue;
      g.fillStyle = o.kind === "wall" ? "rgba(203,180,137,0.65)" : "rgba(203,180,137,0.34)";
      g.fillRect(wx(o.x - o.w / 2), wz(o.z - o.d / 2), o.w * sx, o.d * sy);
    }
    // спавны
    g.fillStyle = "rgba(82,224,106,0.5)";
    g.beginPath();
    g.arc(wx(SPAWN_PLAYER.x), wz(SPAWN_PLAYER.z), 4, 0, Math.PI * 2);
    g.fill();
    this.miniStatic = st;
  }

  toMenu() {
    this.deactivateBots();
    this.exitLock();
    this.paused = false;
    this.setPhase("menu");
  }

  startMatch() {
    this.paused = false;
    this.money = 800;
    this.moneyEarned = 0;
    this.wins = 0;
    this.losses = 0;
    this.matchTarget = 5;
    this.round = 0;
    this.kills = 0;
    this.headshots = 0;
    this.shots = 0;
    this.hits = 0;
    this.owned = ["usp"];
    this.slotPrimary = null;
    this.slotSecondary = "usp";
    this.armor = 0;
    this.helmet = false;
    this.deactivateBots();
    this.startBuy();
  }

  private startBuy() {
    this.round++;
    this.setPhase("buy");
    this.timer = this.round === 1 ? 16 : 12;
    this.hp = 100;
    this.dead = false;
    this.pos.copy(SPAWN_PLAYER);
    this.vel.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = false;
    this.reloading = false;
    this.shotsFired = 0;
    this.deactivateBots();
    // пополнение боезапаса
    for (const id of this.owned) {
      this.mags[id] = WEAPONS[id].mag;
      this.reserves[id] = WEAPONS[id].reserve;
    }
    this.equip(this.slotPrimary ?? this.slotSecondary, true);
    this.exitLock(); // курсор свободен для магазина закупки
    this.sfx.beep();
    this.emitHud();
  }

  /** игрок нажал «Готов» в магазине — сразу начинаем раунд */
  readyUp() {
    if (this.phase !== "buy" || this.paused) return;
    this.requestLock();
    this.startLive();
  }

  private startLive() {
    this.setPhase("live");
    this.timer = 90;
    this.sfx.beep(true);
    // если лок не захватился (браузер требует жест) — покажем паузу
    window.setTimeout(() => {
      if (this.phase === "live" && !this.paused && document.pointerLockElement !== this.renderer.domElement) {
        this.setPaused(true);
      }
    }, 400);
    const n = Math.min(3 + (this.round - 1), 8);
    const free = [...this.bots];
    for (let i = 0; i < n; i++) {
      const b = free[i];
      const sp = BOT_SPAWNS[i % BOT_SPAWNS.length];
      b.active = true;
      b.dying = false;
      b.hp = 100;
      b.group.visible = true;
      b.group.position.set(sp[0] + rnd(-1.5, 1.5), 0, sp[1] + rnd(-1, 1));
      b.group.rotation.set(0, 0, 0);
      b.yaw = Math.atan2(-(SPAWN_PLAYER.x - b.group.position.x), -(SPAWN_PLAYER.z - b.group.position.z));
      b.speed = rnd(2.7, 3.5) + Math.min(this.round * 0.08, 0.6);
      b.range = rnd(9, 16);
      b.shootCd = rnd(0.8, 1.6);
      b.burstLeft = 0;
      b.strafeDir = Math.random() > 0.5 ? 1 : -1;
      b.strafeTimer = rnd(1, 2);
    }
    this.requestLock();
    this.emitHud();
  }

  private deactivateBots() {
    for (const b of this.bots) {
      b.active = false;
      b.dying = false;
      b.group.visible = false;
      b.group.rotation.set(0, 0, 0);
      b.flashSprite.material.opacity = 0;
    }
  }

  private roundEnd(win: boolean) {
    this.roundendWin = win;
    if (win) {
      this.wins++;
      this.money = Math.min(16000, this.money + 3250);
      this.moneyEarned += 3250;
      this.sfx.win();
      this.cb.event({ type: "roundwin", label: "РАУНД ВЫИГРАН  +$3250" });
    } else {
      this.losses++;
      this.money = Math.min(16000, this.money + 1400);
      this.moneyEarned += 1400;
      this.sfx.lose();
      this.cb.event({ type: "roundlose", label: "РАУНД ПРОИГРАН  +$1400" });
    }
    this.setPhase("roundend");
    this.timer = 3.2;
    this.emitHud();
  }

  private checkVictory() {
    if (this.wins >= this.matchTarget) {
      this.setPhase("victory");
      this.exitLock();
      this.cb.stats(this.getStats());
    } else {
      this.startBuy();
    }
  }

  continueAfterVictory() {
    this.matchTarget += 5;
    this.startBuy();
  }

  private getStats(): MatchStats {
    return {
      kills: this.kills,
      headshots: this.headshots,
      shots: this.shots,
      hits: this.hits,
      wins: this.wins,
      losses: this.losses,
      rounds: this.round,
      moneyEarned: this.moneyEarned,
    };
  }

  private setPhase(p: GamePhase) {
    this.phase = p;
    this.cb.phase(p, this.paused);
  }

  setPaused(p: boolean) {
    if (this.paused === p) return;
    this.paused = p;
    if (!p) this.last = performance.now();
    this.cb.phase(this.phase, p);
  }

  buy(id: string): boolean {
    if (this.phase !== "buy") {
      this.sfx.deny();
      this.cb.event({ type: "buyfail", label: "Закупка доступна только в начале раунда" });
      return false;
    }
    const item = BUY_ITEMS.find((i) => i.id === id);
    if (!item) return false;
    const ok = (msg?: string) => {
      this.sfx.buy();
      this.cb.event({ type: "buyok", label: msg ?? `Куплено: ${item.name}` });
      this.emitHud();
      return true;
    };
    if (this.money < item.price) {
      this.sfx.deny();
      this.cb.event({ type: "buyfail", label: "Недостаточно денег" });
      return false;
    }
    if (id === "p250") {
      if (this.owned.includes("p250")) { this.sfx.deny(); return false; }
      this.money -= item.price;
      this.owned.push("p250");
      this.slotSecondary = "p250";
      this.mags["p250"] = WEAPONS.p250.mag;
      this.reserves["p250"] = WEAPONS.p250.reserve;
      this.equip("p250", true);
      return ok();
    }
    if (id === "ak" || id === "m4") {
      if (this.slotPrimary === id) { this.sfx.deny(); return false; }
      this.money -= item.price;
      if (!this.owned.includes(id)) this.owned.push(id);
      this.slotPrimary = id;
      this.mags[id] = WEAPONS[id].mag;
      this.reserves[id] = WEAPONS[id].reserve;
      this.equip(id, true);
      return ok();
    }
    if (id === "kevlar") {
      if (this.armor >= 100) { this.sfx.deny(); this.cb.event({ type: "buyfail", label: "Броня уже полная" }); return false; }
      this.money -= item.price;
      this.armor = 100;
      return ok();
    }
    if (id === "helm") {
      if (this.armor >= 100 && this.helmet) { this.sfx.deny(); this.cb.event({ type: "buyfail", label: "Броня уже полная" }); return false; }
      this.money -= item.price;
      this.armor = 100;
      this.helmet = true;
      return ok();
    }
    return false;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("pointerlockchange", this.onLockChange);
    this.renderer.dispose();
  }

  /* ================= ввод ================= */

  private requestLock() {
    try {
      const r = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === "function") r.catch(() => {});
    } catch {
      /* браузер отклонил — пауза покажется через onLockChange */
    }
  }

  private exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  private onLockChange = () => {
    const locked = document.pointerLockElement === this.renderer.domElement;
    // Esc игрока в бою отпускает курсор — пауза. В фазе закупки курсор свободен специально.
    if (!locked && this.phase === "live" && !this.paused) {
      this.setPaused(true);
    }
  };

  resumeFromPause() {
    this.setPaused(false);
    if (this.phase === "live") {
      this.requestLock();
      // Chrome может отклонить повторный захват сразу после Esc — перепроверяем
      window.setTimeout(() => {
        if (this.phase === "live" && !this.paused && document.pointerLockElement !== this.renderer.domElement) {
          this.setPaused(true);
        }
      }, 1300);
    }
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);

    // пауза: P — в бою и закупке (в бою Esc отдаёт курсор и паузится через lockchange)
    if (e.code === "KeyP" && (this.phase === "live" || this.phase === "buy")) {
      if (this.paused) {
        this.setPaused(false);
        if (this.phase === "live") this.requestLock();
      } else {
        this.setPaused(true);
      }
      return;
    }
    if (e.code === "Escape" && this.phase === "buy" && !this.paused) {
      this.setPaused(true);
      return;
    }

    if (this.paused) return;

    if (this.phase === "buy") {
      const item = BUY_ITEMS.find((i) => e.code === `Digit${i.key}`);
      if (item) this.buy(item.id);
    }

    if (e.code === "KeyR" && (this.phase === "live")) this.startReload();
    if (e.code === "KeyC" && (this.phase === "live")) this.crouch = !this.crouch;
    if (e.code === "Digit1" && this.phase === "live" && this.slotPrimary) this.equip(this.slotPrimary);
    if (e.code === "Digit2" && this.phase === "live") this.equip(this.slotSecondary);
  };

  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => {
    this.keys.clear();
    this.mouseDown = false;
  };
  private onCtx = (e: Event) => e.preventDefault();

  private onMouseMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    if (this.paused || this.phase === "menu" || this.phase === "victory" || this.dead) return;
    this.yaw -= e.movementX * 0.0023;
    this.pitch -= e.movementY * 0.0023;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
  };

  private onMouseDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    if (e.button === 0) {
      this.mouseDown = true;
      this.mouseClicked = true;
    }
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onWheel = (e: WheelEvent) => {
    if (this.phase !== "live" || this.paused || this.dead) return;
    if (!this.slotPrimary) return;
    this.equip(this.current === this.slotPrimary ? this.slotSecondary : this.slotPrimary);
    void e;
  };

  private onResize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private equip(id: WeaponId, instant = false) {
    if (id === this.current && !instant) return;
    if (!this.owned.includes(id)) return;
    if (this.reloading) {
      this.reloading = false;
    }
    this.switchingTo = id;
    this.switchT = instant ? 0.001 : 0.22;
    this.sfx.switchWeapon();
  }

  /* ================= основной цикл ================= */

  private loop = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = clamp((t - this.last) / 1000, 0, 0.05);
    this.last = t;

    if (!this.paused) {
      this.elapsed += dt;
      if (this.phase === "menu") this.attract(dt);
      else if (this.phase === "buy") this.updateBuy(dt);
      else if (this.phase === "live") this.updateLive(dt);
      else if (this.phase === "roundend") this.updateRoundend(dt);
      else if (this.phase === "victory") this.updateVictoryCam(dt);
      this.updateFx(dt);
      this.updateViewmodel(dt);
    }

    this.renderer.render(this.scene, this.camera);
    this.drawMinimap();
  };

  private attract(dt: number) {
    const a = this.elapsed * 0.09;
    this.camera.position.set(Math.sin(a) * 30, 13 + Math.sin(a * 0.7) * 2, Math.cos(a) * 24);
    this.camera.lookAt(0, 1.2, 0);
    this.camera.rotation.order = "YXZ";
    this.vmPistol.visible = false;
    this.vmRifle.visible = false;
    // пара ботов для атмосферы
    if (!this.bots[0].active) {
      for (let i = 0; i < 3; i++) {
        const b = this.bots[i];
        b.active = true;
        b.group.visible = true;
        b.group.position.set(rnd(-14, 14), 0, rnd(-14, 6));
      }
    }
    for (let i = 0; i < 3; i++) {
      const b = this.bots[i];
      b.walkT += dt * 4;
      b.group.rotation.y += dt * 0.25;
      this.animateBotWalk(b, 0.5);
    }
    this.updateDust(dt);
    void dt;
  }

  private updateBuy(dt: number) {
    this.timer -= dt;
    // можно осматриваться (если есть лок) — движение заморожено
    this.updatePlayerCamera(dt, true);
    if (this.timer <= 0) this.startLive();
    this.updateDust(dt);
    this.throttledHud(dt);
  }

  private updateRoundend(dt: number) {
    this.timer -= dt;
    this.updatePlayerCamera(dt, false);
    this.updateBotsVisual(dt);
    this.updateDust(dt);
    if (this.timer <= 0) {
      if (this.roundendWin) this.checkVictory();
      else this.startBuy();
    }
    this.throttledHud(dt);
  }

  private updateVictoryCam(dt: number) {
    const a = this.elapsed * 0.12;
    this.camera.position.set(Math.sin(a) * 22, 9, Math.cos(a) * 18);
    this.camera.lookAt(0, 1, 0);
    this.vmPistol.visible = false;
    this.vmRifle.visible = false;
    this.updateDust(dt);
    void dt;
  }

  /* ---------- LIVE: главная симуляция ---------- */

  private updateLive(dt: number) {
    this.timer -= dt;

    if (this.dead) {
      this.deadT += dt;
      // камера падает
      this.camera.position.y = Math.max(0.4, this.camera.position.y - 2.6 * dt);
      this.camera.rotation.z = Math.min(1.2, this.camera.rotation.z + 2.2 * dt);
      if (this.deadT > 1.4) this.roundEnd(false);
      this.updateBotsVisual(dt);
      this.throttledHud(dt);
      return;
    }

    // --- движение ---
    const k = this.keys;
    const f = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const s = (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0) - (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0);
    const walk = k.has("ShiftLeft") || k.has("ShiftRight");
    const maxSpeed = this.crouch ? 2.1 : walk ? 2.7 : 5.4;

    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = -sin * f + cos * s;
    const wishZ = -cos * f - sin * s;
    const wl = Math.hypot(wishX, wishZ);

    const accel = this.grounded ? 14 : 3;
    if (wl > 0) {
      this.vel.x += (wishX / wl) * accel * dt * 10 * 0.24;
      this.vel.z += (wishZ / wl) * accel * dt * 10 * 0.24;
    }
    // трение
    if (this.grounded) {
      const damp = Math.exp(-(wl > 0 ? 4.5 : 11) * dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }
    const hSpeed = Math.hypot(this.vel.x, this.vel.z);
    if (hSpeed > maxSpeed) {
      const sc = maxSpeed / hSpeed;
      this.vel.x *= sc;
      this.vel.z *= sc;
    }

    // прыжок и гравитация
    if (k.has("Space") && this.grounded && !this.crouch) {
      this.vel.y = 5.4;
      this.grounded = false;
    }
    this.vel.y -= 15 * dt;

    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > 0.01) {
      this.grounded = false;
    }

    // коллизии
    this.resolveCollisions(0.45);
    this.pos.x = clamp(this.pos.x, -31.6, 31.6);
    this.pos.z = clamp(this.pos.z, -23.6, 23.6);

    // шаги
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    if (this.grounded && speed2d > 1.2) {
      this.bobT += dt * speed2d * 1.35;
      this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = walk || this.crouch ? 0.62 : 0.4;
        this.stepAlt = !this.stepAlt;
        this.sfx.foot(this.stepAlt);
      }
    }

    this.updatePlayerCamera(dt, false);

    // --- оружие ---
    this.fireCd -= dt;
    this.sinceFire += dt;
    if (this.sinceFire > 0.28) this.shotsFired = 0;
    if (this.reloading) this.updateReload(dt);
    if (!this.reloading && this.switchT <= 0) {
      const def = WEAPONS[this.current];
      if (def.auto ? this.mouseDown : this.mouseClicked) this.fire();
    }
    this.mouseClicked = false;

    // --- боты ---
    this.updateBots(dt);

    // таймер раунда
    if (this.timer <= 0 && !this.dead) this.roundEnd(false);

    this.updateDust(dt);
    this.throttledHud(dt);
  }

  private updatePlayerCamera(dt: number, frozen: boolean) {
    const eye = this.crouch ? 1.15 : 1.62;
    const speed2d = frozen ? 0 : Math.hypot(this.vel.x, this.vel.z);
    const bob = this.grounded ? Math.sin(this.bobT * 2) * 0.028 * clamp(speed2d / 5.4, 0, 1) : 0;

    // отдача восстанавливается
    this.recoilKick *= Math.exp(-9 * dt);

    this.camera.position.set(this.pos.x, this.pos.y + eye + bob, this.pos.z);
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch + this.recoilKick * 0.24;
    if (!this.dead) this.camera.rotation.z = 0;

    // тряска
    this.shake = Math.max(0, this.shake - 2.4 * dt);
    if (this.shake > 0.01) {
      const a = this.shake * this.shake * 0.35;
      this.camera.position.x += rnd(-a, a);
      this.camera.position.y += rnd(-a, a) * 0.7;
    }
  }

  private resolveCollisions(radius: number) {
    for (const c of this.colliders) {
      const dx = this.pos.x - c.x;
      const dz = this.pos.z - c.z;
      const px = c.hx + radius - Math.abs(dx);
      const pz = c.hz + radius - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) {
          this.pos.x += Math.sign(dx) * px;
          this.vel.x *= 0.2;
        } else {
          this.pos.z += Math.sign(dz) * pz;
          this.vel.z *= 0.2;
        }
      }
    }
  }

  /* ---------- стрельба игрока ---------- */

  private startReload() {
    const def = WEAPONS[this.current];
    if (this.reloading || this.mags[this.current] >= def.mag) return;
    if ((this.reserves[this.current] ?? 0) <= 0) return;
    this.reloading = true;
    this.reloadT = def.reload;
    this.reloadStaged = 0;
    this.sfx.reload(0);
  }

  private updateReload(dt: number) {
    const def = WEAPONS[this.current];
    this.reloadT -= dt;
    const prog = 1 - this.reloadT / def.reload;
    if (this.reloadStaged === 0 && prog > 0.35) {
      this.reloadStaged = 1;
      this.sfx.reload(1);
    }
    if (this.reloadT <= 0) {
      this.reloading = false;
      const need = def.mag - this.mags[this.current];
      const take = Math.min(need, this.reserves[this.current]);
      this.mags[this.current] += take;
      this.reserves[this.current] -= take;
      this.sfx.reload(2);
    }
  }

  private fire() {
    const def = WEAPONS[this.current];
    if (this.fireCd > 0) return;
    if (this.mags[this.current] <= 0) {
      this.sfx.dry();
      this.fireCd = 0.25;
      this.cb.event({ type: "empty" });
      this.startReload();
      return;
    }

    this.mags[this.current]--;
    this.fireCd = 1 / def.rps;
    this.shots++;
    this.shotsFired++;
    this.sinceFire = 0;

    // отдача в прицел
    const kick = def.kick * (1 + Math.min(this.shotsFired * 0.09, 1.3));
    this.pitch += kick;
    this.yaw += Math.sin(this.shotsFired * 1.9) * def.kick * 0.4;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.recoilKick = Math.min(this.recoilKick + 0.5, 1.2);
    this.bloom = Math.min(this.bloom + 0.5, 1.6);

    // разброс
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    let spread = def.spread * (1 + (speed2d / 5.4) * 1.5 + (!this.grounded ? 1.6 : 0) + this.shotsFired * 0.05);
    if (this.crouch) spread *= 0.55;

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += rnd(-spread, spread);
    dir.y += rnd(-spread, spread);
    dir.z += rnd(-spread, spread);
    dir.normalize();

    // цели
    const targets: THREE.Object3D[] = [...this.worldMeshes];
    for (const b of this.bots) {
      if (b.active && !b.dying) targets.push(b.headMesh, b.torsoMesh, b.legsMesh);
    }
    const ray = new THREE.Raycaster(origin, dir, 0, 250);
    const hitsAll = ray.intersectObjects(targets, false);
    const hit = hitsAll.length > 0 ? hitsAll[0] : null;

    const muzzle = (def.kind === "rifle" ? this.vmMuzzleRifle : this.vmMuzzlePistol);
    const mPos = new THREE.Vector3();
    muzzle.getWorldPosition(mPos);
    this.muzzleLight.position.copy(mPos);
    this.muzzleLight.intensity = 60;
    this.muzzleLightT = 0.05;

    const endPoint = hit ? hit.point.clone() : origin.clone().addScaledVector(dir, 120);
    this.spawnTracer(mPos, endPoint);
    this.ejectCasing(mPos);
    this.sfx.shot(def.kind);

    if (hit && hit.object.userData && hit.object.userData.bot !== undefined) {
      const bot = this.bots[hit.object.userData.bot as number];
      const part = hit.object.userData.part as string;
      let dmg = def.dmg;
      const head = part === "head";
      if (head) dmg *= 4;
      // лёгкое затухание с дистанцией
      dmg *= clamp(1.15 - hit.distance * 0.006, 0.6, 1.15);
      this.hits++;
      if (head) this.headshots++;
      this.damageBot(bot, dmg, hit.point, head);
    } else if (hit) {
      this.burst(this.sparks, hit.point, 7, 4, 0.4);
    }
  }

  private damageBot(b: Bot, dmg: number, at: THREE.Vector3, head: boolean) {
    if (!b.active || b.dying) return;
    b.hp -= dmg;
    b.flash = 0.13;
    this.burst(this.blood, at, head ? 18 : 10, head ? 5.5 : 3.5, 0.5);
    this.cb.event({ type: head ? "headhit" : "hit" });
    this.sfx.hit(head);
    if (b.hp <= 0) {
      b.dying = true;
      b.dieT = 0;
      this.kills++;
      this.money = Math.min(16000, this.money + 300);
      this.moneyEarned += 300;
      this.sfx.kill();
      this.cb.event({ type: "kill", label: `${head ? "В ГОЛОВУ · " : ""}${WEAPONS[this.current].name} ▸ ${b.name}` });
      // проверить конец раунда
      const left = this.bots.filter((x) => x.active && !x.dying).length;
      if (left === 0) {
        window.setTimeout(() => {
          if (this.phase === "live" && !this.dead) this.roundEnd(true);
        }, 700);
      }
    }
  }

  /* ---------- ИИ ботов ---------- */

  private botHasLOS(b: Bot, dist: number): boolean {
    const from = new THREE.Vector3();
    b.muzzle.getWorldPosition(from);
    const to = this.camera.position.clone();
    const d = to.clone().sub(from).normalize();
    const ray = new THREE.Raycaster(from, d, 0, dist);
    const hits = ray.intersectObjects(this.worldMeshes, false);
    return hits.length === 0;
  }

  private updateBots(dt: number) {
    const playerEye = this.camera.position.clone();
    const playerSpeed = Math.hypot(this.vel.x, this.vel.z);

    for (const b of this.bots) {
      if (!b.active) continue;
      if (b.dying) {
        b.dieT += dt;
        const p = clamp(b.dieT / 0.4, 0, 1);
        b.group.rotation.x = -p * p * Math.PI * 0.5;
        b.group.position.y = -p * 0.15;
        if (b.dieT > 2.4) {
          b.active = false;
          b.dying = false;
          b.group.visible = false;
          b.group.rotation.set(0, 0, 0);
          b.group.position.y = 0;
        }
        continue;
      }

      const bp = b.group.position;
      const dx = this.pos.x - bp.x;
      const dz = this.pos.z - bp.z;
      const dist = Math.hypot(dx, dz);
      const targetYaw = Math.atan2(-dx, -dz);
      let dy = targetYaw - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += clamp(dy, -4 * dt, 4 * dt);
      b.group.rotation.y = b.yaw;

      // движение
      let mx = 0;
      let mz = 0;
      if (!this.dead) {
        if (dist > b.range) {
          mx = (dx / dist) * b.speed;
          mz = (dz / dist) * b.speed;
        } else {
          b.strafeTimer -= dt;
          if (b.strafeTimer <= 0) {
            b.strafeDir *= -1;
            b.strafeTimer = rnd(1, 2.2);
          }
          const px = -dz / dist;
          const pz = dx / dist;
          mx = px * b.speed * 0.62 * b.strafeDir;
          mz = pz * b.speed * 0.62 * b.strafeDir;
        }
      }
      bp.x += mx * dt;
      bp.z += mz * dt;

      // коллизии бота
      const saved = this.pos.clone();
      this.pos.set(bp.x, 0, bp.z);
      this.resolveCollisions(0.4);
      bp.x = clamp(this.pos.x, -31.4, 31.4);
      bp.z = clamp(this.pos.z, -23.4, 23.4);
      this.pos.copy(saved);

      // расталкивание ботов
      for (const o of this.bots) {
        if (o === b || !o.active || o.dying) continue;
        const sx = bp.x - o.group.position.x;
        const sz = bp.z - o.group.position.z;
        const sd = Math.hypot(sx, sz);
        if (sd < 1.05 && sd > 0.001) {
          const push = (1.05 - sd) * 0.5;
          bp.x += (sx / sd) * push;
          bp.z += (sz / sd) * push;
        }
      }

      // анимация ходьбы
      const moving = Math.hypot(mx, mz) > 0.2;
      b.walkT += dt * (moving ? b.speed * 2.4 : 0);
      this.animateBotWalk(b, moving ? 1 : 0.15);

      // вспышка попадания
      if (b.flash > 0) {
        b.flash -= dt;
        const e = clamp(b.flash / 0.13, 0, 1) * 0.9;
        for (const m of b.mats) m.emissive.setRGB(e, e * 0.1, e * 0.05);
      } else {
        for (const m of b.mats) m.emissive.setRGB(0, 0, 0);
      }

      // стрельба
      if (this.dead) continue;
      const los = dist < 46 && this.botHasLOS(b, dist);
      if (!los) {
        b.burstLeft = 0;
        continue;
      }
      if (b.burstLeft > 0) {
        b.burstTimer -= dt;
        if (b.burstTimer <= 0) {
          b.burstLeft--;
          b.burstTimer = 0.105;
          this.botFire(b, dist, playerEye, playerSpeed);
        }
      } else {
        b.shootCd -= dt;
        if (b.shootCd <= 0) {
          b.burstLeft = 2 + Math.floor(Math.random() * 3);
          b.burstTimer = 0.02;
          b.shootCd = rnd(0.85, 1.5) * clamp(1.06 - this.round * 0.05, 0.55, 1.06);
        }
      }
    }
  }

  private botFire(b: Bot, dist: number, playerEye: THREE.Vector3, playerSpeed: number) {
    const mPos = new THREE.Vector3();
    b.muzzle.getWorldPosition(mPos);
    b.flashSprite.material.opacity = 1;
    window.setTimeout(() => { b.flashSprite.material.opacity = 0; }, 60);
    this.sfx.distantShot(dist);

    // шанс попадания
    let chance = 0.5 - dist * 0.0065 - playerSpeed * 0.05 + (this.crouch ? 0.07 : 0) - (this.grounded ? 0 : -0.08);
    chance = clamp(chance + Math.min(this.round * 0.012, 0.1), 0.06, 0.55);
    const isHit = Math.random() < chance;

    const target = playerEye.clone();
    if (!isHit) {
      target.x += rnd(-0.9, 0.9);
      target.y += rnd(-0.5, 0.5);
      target.z += rnd(-0.9, 0.9);
    }
    this.spawnTracer(mPos, target);

    if (isHit && !this.dead) {
      let dmg = rnd(7, 14) + Math.min(this.round, 6);
      if (this.helmet) dmg *= 0.85;
      if (this.armor > 0) {
        const absorbed = Math.min(this.armor, dmg * 0.5);
        this.armor = Math.max(0, this.armor - absorbed);
        dmg -= absorbed;
      }
      this.hp -= dmg;
      this.shake = Math.min(this.shake + 0.5, 1);
      this.sfx.hurt();
      this.cb.event({ type: "hurt", value: Math.round(dmg) });
      if (this.hp <= 0) {
        this.hp = 0;
        this.dead = true;
        this.deadT = 0;
        this.mouseDown = false;
        this.mouseClicked = false;
      }
    }
  }

  private updateBotsVisual(dt: number) {
    for (const b of this.bots) {
      if (!b.active) continue;
      if (b.dying) {
        b.dieT += dt;
        const p = clamp(b.dieT / 0.4, 0, 1);
        b.group.rotation.x = -p * p * Math.PI * 0.5;
        b.group.position.y = -p * 0.15;
      }
      if (b.flash > 0) {
        b.flash -= dt;
        const e = clamp(b.flash / 0.13, 0, 1) * 0.9;
        for (const m of b.mats) m.emissive.setRGB(e, e * 0.1, e * 0.05);
      }
    }
  }

  private animateBotWalk(b: Bot, amt: number) {
    const sw = Math.sin(b.walkT * 2.2) * 0.55 * amt;
    b.legL.rotation.x = sw;
    b.legR.rotation.x = -sw;
    b.armL.rotation.x = -sw * 0.7;
    b.armR.rotation.x = -0.9 + sw * 0.3; // держит оружие
  }

  /* ---------- эффекты ---------- */

  private burst(pool: Pool, at: THREE.Vector3, count: number, power: number, life: number) {
    let spawned = 0;
    for (let i = 0; i < pool.n; i++) {
      if (pool.life[i] > 0) continue;
      pool.pos[i * 3] = at.x;
      pool.pos[i * 3 + 1] = at.y;
      pool.pos[i * 3 + 2] = at.z;
      pool.vel[i * 3] = rnd(-1, 1) * power;
      pool.vel[i * 3 + 1] = rnd(0.2, 1.2) * power;
      pool.vel[i * 3 + 2] = rnd(-1, 1) * power;
      pool.life[i] = rnd(life * 0.6, life);
      if (++spawned >= count) break;
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3) {
    const t = this.tracers.find((q) => !q.active);
    if (!t) return;
    t.active = true;
    t.life = 0.055;
    t.mesh.visible = true;
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const len = from.distanceTo(to);
    t.mesh.position.copy(mid);
    t.mesh.lookAt(to);
    t.mesh.scale.set(1, 1, Math.max(0.1, len));
    t.mat.opacity = 0.9;
  }

  private ejectCasing(from: THREE.Vector3) {
    const c = this.casings.find((q) => !q.active);
    if (!c) return;
    c.active = true;
    c.life = 1.6;
    c.mesh.visible = true;
    c.mat.opacity = 1;
    c.mesh.position.copy(from);
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(right);
    right.cross(this.camera.up).normalize();
    c.vel.copy(right).multiplyScalar(rnd(1.6, 2.6));
    c.vel.y = rnd(1.8, 2.8);
    c.spin.set(rnd(-10, 10), rnd(-10, 10), rnd(-10, 10));
  }

  private updateFx(dt: number) {
    // частицы
    for (const pool of [this.blood, this.sparks]) {
      const attr = pool.geo.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < pool.n; i++) {
        if (pool.life[i] <= 0) {
          arr[i * 3 + 1] = -999;
          continue;
        }
        pool.life[i] -= dt;
        pool.vel[i * 3 + 1] -= 16 * dt;
        arr[i * 3] += pool.vel[i * 3] * dt;
        arr[i * 3 + 1] += pool.vel[i * 3 + 1] * dt;
        arr[i * 3 + 2] += pool.vel[i * 3 + 2] * dt;
        if (arr[i * 3 + 1] < 0.02) {
          arr[i * 3 + 1] = 0.02;
          pool.vel[i * 3 + 1] *= -0.3;
        }
      }
      attr.needsUpdate = true;
    }
    // трассеры
    for (const t of this.tracers) {
      if (!t.active) continue;
      t.life -= dt;
      t.mat.opacity = clamp(t.life / 0.055, 0, 1) * 0.9;
      if (t.life <= 0) {
        t.active = false;
        t.mesh.visible = false;
      }
    }
    // гильзы
    for (const c of this.casings) {
      if (!c.active) continue;
      c.life -= dt;
      c.vel.y -= 14 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.mesh.position.y < 0.03) {
        c.mesh.position.y = 0.03;
        c.vel.y *= -0.35;
        c.vel.x *= 0.7;
        c.vel.z *= 0.7;
        c.spin.multiplyScalar(0.6);
      }
      if (c.life < 0.3) c.mat.opacity = clamp(c.life / 0.3, 0, 1);
      if (c.life <= 0) {
        c.active = false;
        c.mesh.visible = false;
      }
    }
    // свет дула
    if (this.muzzleLightT > 0) {
      this.muzzleLightT -= dt;
      if (this.muzzleLightT <= 0) this.muzzleLight.intensity = 0;
    }
    // вспышки ботов гаснут через opacity в botFire timeout; дополнительно:
    for (const b of this.bots) {
      if (b.flashSprite.material.opacity > 0 && !b.active) b.flashSprite.material.opacity = 0;
    }
    this.bloom = Math.max(0, this.bloom - 3.2 * dt);
  }

  private updateDust(dt: number) {
    const dust = this.scene.getObjectByName("dust") as THREE.Points | null;
    if (!dust) return;
    const attr = dust.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3] += Math.sin(this.elapsed * 0.3 + i) * 0.004 + 0.004;
      arr[i * 3 + 1] += Math.sin(this.elapsed * 0.5 + i * 2) * 0.003;
      if (arr[i * 3] > 31) arr[i * 3] = -31;
    }
    attr.needsUpdate = true;
    void dt;
  }

  private updateViewmodel(dt: number) {
    if (this.phase === "menu" || this.phase === "victory") return;
    const def = WEAPONS[this.current];
    const isRifle = def.kind === "rifle";

    // смена оружия
    if (this.switchingTo && this.switchT > 0) {
      this.switchT -= dt;
      if (this.switchT <= 0) {
        this.current = this.switchingTo;
        this.switchingTo = null;
      }
    }
    this.vmPistol.visible = !isRifle;
    this.vmRifle.visible = isRifle;

    // покачивание и отдача
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    const sway = Math.sin(this.bobT * 2) * 0.006 * clamp(speed2d / 5.4, 0, 1);
    const swayY = Math.abs(Math.cos(this.bobT * 2)) * 0.006 * clamp(speed2d / 5.4, 0, 1);
    const rec = this.recoilKick;

    let dropY = 0;
    let rotX = 0;
    if (this.reloading) {
      const p = 1 - this.reloadT / WEAPONS[this.current].reload;
      dropY = Math.sin(p * Math.PI) * 0.22;
      rotX = Math.sin(p * Math.PI) * 0.7;
    }
    let switchDrop = 0;
    if (this.switchingTo || this.switchT > 0) {
      switchDrop = 0.25;
    }

    this.vmOffset.set(sway, swayY - dropY - switchDrop, -rec * 0.06);
    const vm = isRifle ? this.vmRifle : this.vmPistol;
    const base = isRifle ? new THREE.Vector3(0.26, -0.24, -0.42) : new THREE.Vector3(0.24, -0.22, -0.46);
    vm.position.copy(base).add(this.vmOffset);
    vm.rotation.x = rotX + rec * 0.12;
  }

  /* ---------- HUD ---------- */

  private hudAcc = 0;
  private throttledHud(dt: number) {
    this.hudAcc += dt;
    if (this.hudAcc < 0.05) return;
    this.hudAcc = 0;
    this.emitHud();
  }

  private emitHud() {
    const def = WEAPONS[this.current];
    const speed2d = Math.hypot(this.vel.x, this.vel.z);
    let gap = 6 + (speed2d / 5.4) * 10 + this.bloom * 12 + (this.grounded ? 0 : 10);
    if (this.crouch) gap *= 0.6;
    gap = clamp(gap, 5, 40);
    this.cb.hud({
      phase: this.phase,
      paused: this.paused,
      hp: Math.max(0, Math.round(this.hp)),
      armor: Math.round(this.armor),
      helmet: this.helmet,
      money: this.money,
      mag: this.mags[this.current] ?? 0,
      reserve: this.reserves[this.current] ?? 0,
      weaponName: def.name,
      weaponKind: def.kind,
      timer: Math.max(0, this.timer),
      round: this.round,
      wins: this.wins,
      losses: this.losses,
      botsLeft: this.bots.filter((b) => b.active && !b.dying).length,
      kills: this.kills,
      crossGap: gap,
      crouch: this.crouch,
    });
  }

  /* ---------- миникарта ---------- */

  private drawMinimap() {
    const ctx = this.miniCtx;
    if (!ctx || !this.miniStatic) return;
    const w = this.miniStatic.width;
    const h = this.miniStatic.height;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.miniStatic, 0, 0);
    const sx = w / WORLD.w;
    const sy = h / WORLD.h;
    const wx = (x: number) => (x + WORLD.w / 2) * sx;
    const wz = (z: number) => (z + WORLD.h / 2) * sy;

    if (this.phase === "menu" || this.phase === "victory") return;

    // боты
    for (const b of this.bots) {
      if (!b.active || b.dying) continue;
      ctx.fillStyle = "#ff4545";
      ctx.shadowColor = "#ff4545";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(wx(b.group.position.x), wz(b.group.position.z), 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // игрок (стрелка по направлению взгляда)
    const px = wx(this.pos.x);
    const pz = wz(this.pos.z);
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const ang = Math.atan2(fx * sx, -fz * sy);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(ang);
    ctx.fillStyle = "#52e06a";
    ctx.shadowColor = "#52e06a";
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
  }
}
