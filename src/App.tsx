import { useEffect, useRef, useState } from "react";
import { NightDrive, RANKS } from "./game/engine";
import type { GameEvent, HudState, Phase } from "./game/engine";

/* ---------- форматирование ---------- */
const fmtScore = (n: number) => n.toLocaleString("ru-RU");
const fmtKm = (m: number) => `${(m / 1000).toFixed(1).replace(".", ",")} км`;
const fmtTime = (s: number) => {
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
};
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface Popup {
  id: number;
  text: string;
  color: string;
}

/* ---------- SVG-иконки ---------- */
const IconPause = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="4" height="12" />
    <rect x="9" y="2" width="4" height="12" />
  </svg>
);
const IconPlay = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2l10 6-10 6z" />
  </svg>
);
const IconSound = ({ off }: { off: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l4-3.5v11L5 10H2z" />
    {off ? (
      <path d="M11 5.5l4 5m0-5l-4 5" stroke="currentColor" strokeWidth="1.6" fill="none" />
    ) : (
      <path d="M11.5 5a4 4 0 010 6M13 3.5a6.5 6.5 0 010 9" stroke="currentColor" strokeWidth="1.4" fill="none" />
    )}
  </svg>
);
const IconBolt = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M9 1L3 9h4l-1 6 7-9H8z" />
  </svg>
);
const IconFlag = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
    <path d="M3 1v14h1.4V9.8c2.8-1.8 5.4 1.6 8.6-.3V2.2C9.8 4.1 7.2.9 4.4 2.6V1z" />
  </svg>
);

/* ---------- экран: меню ---------- */
function MenuScreen({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <div className="absolute inset-0 screen-in flex flex-col justify-between p-6 md:p-10">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#03050a]/85 via-transparent to-[#03050a]/40" />

      {/* верх: рекорд справа */}
      <div className="relative flex items-start justify-end">
        <div className="hud-panel hud-panel--amber px-5 py-3">
          <div className="hud-label" style={{ color: "rgba(255,200,120,0.85)" }}>Рекорд трассы</div>
          <div className="font-display text-2xl text-[#ffcf6e] text-stroke-dark">{fmtScore(best)}</div>
        </div>
      </div>

      {/* заголовок слева */}
      <div className="relative max-w-3xl">
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[#19e6ff]"><IconFlag /></span>
          <span className="hud-label text-[11px]">3D-симулятор · ночь · дождь · трафик</span>
        </div>
        <h1 className="font-display leading-[0.95] text-stroke-dark">
          <span className="block text-5xl md:text-7xl text-white">НОЧНАЯ</span>
          <span className="title-glow block text-6xl md:text-8xl text-[#19e6ff]">ТРАССА</span>
        </h1>
        <div className="hazard-stripe mt-5 h-2.5 w-64" />
        <p className="mt-4 max-w-md text-sm md:text-base leading-relaxed text-[#a8c3dd]">
          Мокрый асфальт, слепящие фары и поток машин. Обгоняй вплотную, копи комбо,
          следи за прочностью кузова — трёх ударов достаточно, чтобы заезд закончился.
        </p>
      </div>

      {/* низ: управление + старт */}
      <div className="relative flex flex-col md:flex-row md:items-end gap-6 justify-between">
        <div className="hud-panel px-5 py-4">
          <div className="hud-label mb-3">Управление</div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm text-[#c6d9ec]">
            <div className="flex gap-1"><span className="keycap">A</span><span className="keycap">D</span></div>
            <span>руль <span className="text-[#6d87a3]">(или ← →)</span></span>
            <div className="flex gap-1"><span className="keycap">W</span><span className="keycap">S</span></div>
            <span>газ / тормоз <span className="text-[#6d87a3]">(или ↑ ↓)</span></span>
            <div><span className="keycap" style={{ minWidth: 78 }}>SPACE</span></div>
            <span>нитро-ускорение</span>
            <div className="flex gap-1"><span className="keycap">P</span><span className="keycap">M</span></div>
            <span>пауза / звук</span>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3">
          <button onClick={onStart} className="btn-race px-10 py-4 text-lg md:text-xl flex items-center gap-3">
            <IconPlay />
            Старт двигателя
          </button>
          <div className="text-xs tracking-widest text-[#6d87a3] uppercase">
            или нажми <span className="keycap" style={{ minWidth: 0, height: 22, fontSize: 10 }}>ENTER</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- экран: пауза ---------- */
function PauseScreen({ onResume, onRestart, onMenu }: { onResume: () => void; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 screen-in flex items-center justify-center bg-[#03050a]/70">
      <div className="hud-panel px-10 py-8 w-[min(92vw,420px)]">
        <div className="hazard-stripe h-2 w-full mb-6" />
        <h2 className="font-display text-4xl text-white text-center tracking-widest">ПАУЗА</h2>
        <p className="mt-2 text-center text-sm text-[#8fa9c4]">Двигатель работает на холостых</p>
        <div className="mt-7 flex flex-col gap-3">
          <button onClick={onResume} className="btn-race px-6 py-3.5 flex items-center justify-center gap-2">
            <IconPlay /> Продолжить
          </button>
          <button onClick={onRestart} className="btn-ghost px-6 py-3">Заезд заново</button>
          <button onClick={onMenu} className="btn-ghost px-6 py-3">В меню</button>
        </div>
        <div className="mt-6 text-center text-xs text-[#6d87a3] tracking-wider">
          P / ESC — вернуться на трассу
        </div>
      </div>
    </div>
  );
}

/* ---------- экран: авария ---------- */
function OverScreen({
  hud,
  isRecord,
  onRestart,
  onMenu,
}: {
  hud: HudState;
  isRecord: boolean;
  onRestart: () => void;
  onMenu: () => void;
}) {
  const stats = [
    { label: "Счёт", value: fmtScore(hud.score), accent: "#ffb020" },
    { label: "Дистанция", value: fmtKm(hud.distance), accent: "#19e6ff" },
    { label: "Время", value: fmtTime(hud.time), accent: "#dfe9f5" },
    { label: "Ранг", value: RANKS[hud.rank].name, accent: "#7dff8a" },
  ];
  return (
    <div className="absolute inset-0 screen-in flex items-center justify-center bg-[#160309]/55">
      <div className="hud-panel hud-panel--red px-8 md:px-12 py-8 w-[min(94vw,560px)]">
        <div className="hazard-stripe h-2 w-full mb-5" />
        <div className="text-center">
          <h2 className="font-display text-5xl md:text-6xl text-[#ff2e4d]" style={{ textShadow: "0 0 34px rgba(255,46,77,0.6)" }}>
            АВАРИЯ
          </h2>
          <p className="mt-1 text-sm text-[#d48a97]">Кузов не выдержал. Эвакуатор уже выехал.</p>
        </div>

        {isRecord && (
          <div className="mt-4 mx-auto w-fit px-4 py-1.5 font-display text-sm text-[#051018] bg-[#ffb020] clip-none"
            style={{ clipPath: "polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)", boxShadow: "0 0 30px rgba(255,176,32,0.6)" }}>
            НОВЫЙ РЕКОРД ТРАССЫ
          </div>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="hud-panel px-4 py-3">
              <div className="hud-label">{s.label}</div>
              <div className="font-display text-xl md:text-2xl" style={{ color: s.accent }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <button onClick={onRestart} className="btn-race px-6 py-3.5 flex-1 flex items-center justify-center gap-2">
            <IconPlay /> Ещё заезд
          </button>
          <button onClick={onMenu} className="btn-ghost px-6 py-3.5">В меню</button>
        </div>
        <div className="mt-4 text-center text-xs text-[#6d87a3] tracking-wider">
          R — мгновенный рестарт · рекорд: <span className="text-[#ffcf6e]">{fmtScore(hud.best)}</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- HUD ---------- */
function Hud({ hud, onPause, muted, onMute }: { hud: HudState; onPause: () => void; muted: boolean; onMute: () => void }) {
  const nitroCells = 12;
  const filled = Math.round((hud.nitro / 100) * nitroCells);
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* верх слева: счёт + комбо */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="hud-panel hud-panel--amber px-5 py-3">
          <div className="hud-label" style={{ color: "rgba(255,200,120,0.8)" }}>Счёт</div>
          <div className="font-display text-3xl leading-none text-[#ffcf6e] text-stroke-dark">{fmtScore(hud.score)}</div>
        </div>
        {hud.combo > 1 && (
          <div key={hud.combo} className="combo-pop hud-panel px-4 py-2 w-fit">
            <span className="font-display text-lg text-[#19e6ff]" style={{ textShadow: "0 0 16px rgba(25,230,255,0.8)" }}>
              КОМБО ×{hud.combo}
            </span>
          </div>
        )}
      </div>

      {/* верх центр: дистанция/время */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2 flex gap-2">
        <div className="hud-panel px-4 py-2 text-center">
          <div className="hud-label">Дистанция</div>
          <div className="font-display text-lg text-white">{fmtKm(hud.distance)}</div>
        </div>
        <div className="hud-panel px-4 py-2 text-center">
          <div className="hud-label">Время</div>
          <div className="font-display text-lg text-white">{fmtTime(hud.time)}</div>
        </div>
      </div>

      {/* верх справа: скорость + ранг + кнопки */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <div className="hud-panel px-5 py-3 text-right">
          <div className="hud-label">Скорость</div>
          <div className="font-display text-4xl leading-none text-white text-stroke-dark">
            {hud.speed}
            <span className="ml-1.5 text-sm text-[#8fa9c4]">км/ч</span>
          </div>
        </div>
        <div className="hud-panel px-4 py-1.5 flex items-center gap-2">
          <span className="text-[#7dff8a]"><IconFlag /></span>
          <span className="font-display text-xs tracking-widest text-[#7dff8a]">{hud.rankName}</span>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button onClick={onPause} className="btn-ghost p-2.5" title="Пауза (P)"><IconPause /></button>
          <button onClick={onMute} className="btn-ghost p-2.5" title="Звук (M)">
            <IconSound off={muted} />
          </button>
        </div>
      </div>

      {/* низ слева: нитро */}
      <div className="absolute bottom-4 left-4">
        <div className={`hud-panel px-5 py-3 w-[240px] ${hud.nitroOn ? "hud-panel--red" : ""}`}>
          <div className="flex items-center justify-between mb-2">
            <div className="hud-label flex items-center gap-1.5" style={{ color: "#7ee7ff" }}>
              <IconBolt /> Нитро
            </div>
            <span className="text-[10px] tracking-widest text-[#6d87a3]">SPACE</span>
          </div>
          <div className="relative h-3.5 bg-[#0a1420] border border-[#123246]"
            style={{ clipPath: "polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)" }}>
            <div
              className={`h-full ${hud.nitroOn ? "nitro-fill" : ""}`}
              style={{
                width: `${hud.nitro}%`,
                background: hud.nitroOn ? undefined : "linear-gradient(90deg,#0e7ba0,#19c8e8)",
                transition: "width 0.15s linear",
                boxShadow: "0 0 14px rgba(25,230,255,0.5)",
              }}
            />
            <div className="absolute inset-0 flex">
              {Array.from({ length: nitroCells - 1 }).map((_, i) => (
                <div key={i} className="flex-1 border-r border-[#05101c]/80" />
              ))}
            </div>
          </div>
          {hud.nitro < 12 && <div className="danger-pulse mt-1.5 text-[10px] font-bold tracking-[0.25em] text-[#ff2e4d]">НИТРО НА ИСХОДЕ</div>}
        </div>
      </div>

      {/* низ справа: прочность */}
      <div className="absolute bottom-4 right-4">
        <div className={`hud-panel px-5 py-3 ${hud.damage >= 2 ? "hud-panel--red" : ""}`}>
          <div className="hud-label mb-2 text-right">Прочность кузова</div>
          <div className="flex gap-2 justify-end">
            {[0, 1, 2].map((i) => {
              const alive = i >= hud.damage;
              return (
                <svg key={i} width="30" height="26" viewBox="0 0 30 26"
                  className={alive && hud.damage === 2 ? "danger-pulse" : ""}>
                  <path d="M15 1l13 6v12L15 25 2 19V7z"
                    fill={alive ? (hud.damage === 2 ? "#ff2e4d" : "#19e6ff") : "rgba(255,46,77,0.08)"}
                    stroke={alive ? "transparent" : "#7a2436"}
                    strokeWidth="1.5"
                    style={alive ? { filter: `drop-shadow(0 0 6px ${hud.damage === 2 ? "#ff2e4d" : "#19e6ff"})` } : undefined}
                  />
                  {!alive && <path d="M9 8l12 10M21 8L9 18" stroke="#7a2436" strokeWidth="1.5" />}
                </svg>
              );
            })}
          </div>
        </div>
      </div>

      {/* низ центр: подсказка */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] tracking-wider whitespace-nowrap"
        style={{ color: "rgba(110,140,170,0.75)" }}>
        A/D — руль · W — газ · S — тормоз · SPACE — нитро · P — пауза
      </div>
    </div>
  );
}

/* ============================================================ */

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<NightDrive | null>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [isRecord, setIsRecord] = useState(false);
  const popupId = useRef(0);
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const addPopup = (text: string, color: string) => {
      const id = ++popupId.current;
      setPopups((p) => [...p.slice(-4), { id, text, color }]);
      window.setTimeout(() => setPopups((p) => p.filter((x) => x.id !== id)), 1050);
    };

    const onEvent = (e: GameEvent) => {
      switch (e.type) {
        case "nearmiss":
          addPopup(`+${fmtScore(e.value ?? 0)} ВПЛОТНУЮ`, "#19e6ff");
          break;
        case "pickup":
          addPopup(e.label ?? "+", "#ffb020");
          break;
        case "rankup":
          addPopup(`НОВЫЙ РАНГ: ${e.label}`, "#7dff8a");
          break;
        case "hit":
          setFlashKey((k) => k + 1);
          break;
        case "gameover":
          setIsRecord(false);
          break;
        case "newrecord":
          setIsRecord(true);
          break;
        default:
          break;
      }
    };

    const eng = new NightDrive(canvas, { hud: setHud, phase: setPhase, event: onEvent });
    engineRef.current = eng;
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  // Enter / R / M на уровне приложения
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (e.code === "Enter" && (phaseRef.current === "menu" || phaseRef.current === "over")) {
        startGame();
      } else if (e.code === "KeyR" && phaseRef.current === "over") {
        startGame();
      } else if (e.code === "KeyM") {
        toggleMute();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGame = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.sfx.init();
    eng.sfx.ui();
    setIsRecord(false);
    eng.begin();
  };

  const toggleMute = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.sfx.init();
    setMuted((m) => {
      eng.sfx.setMuted(!m);
      return !m;
    });
  };

  const speedlineOpacity = hud ? clamp01((hud.speed - 115) / 160) * 0.6 : 0;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d] select-none" style={{ height: "100dvh" }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ display: "block" }} />

      {/* атмосферные оверлеи */}
      <div className="pointer-events-none absolute inset-0 vignette" />
      <div className="pointer-events-none absolute inset-0 speedlines" style={{ opacity: speedlineOpacity }} />
      <div className="pointer-events-none absolute inset-0 nitro-tint" style={{ opacity: hud?.nitroOn ? 1 : 0 }} />
      {flashKey > 0 && <div key={flashKey} className="pointer-events-none absolute inset-0 hitflash" />}

      {/* всплывающие очки */}
      <div className="pointer-events-none absolute left-1/2 top-[38%] -translate-x-1/2 flex flex-col items-center gap-1">
        {popups.map((p) => (
          <div key={p.id} className="popup-float font-display text-2xl md:text-3xl text-stroke-dark" style={{ color: p.color }}>
            {p.text}
          </div>
        ))}
      </div>

      {phase === "running" && hud && (
        <Hud hud={hud} onPause={() => engineRef.current?.togglePause()} muted={muted} onMute={toggleMute} />
      )}
      {phase === "menu" && <MenuScreen best={hud?.best ?? 0} onStart={startGame} />}
      {phase === "paused" && (
        <PauseScreen
          onResume={() => engineRef.current?.togglePause()}
          onRestart={startGame}
          onMenu={() => engineRef.current?.toMenu()}
        />
      )}
      {phase === "over" && hud && (
        <OverScreen hud={hud} isRecord={isRecord} onRestart={startGame} onMenu={() => engineRef.current?.toMenu()} />
      )}
    </div>
  );
}
