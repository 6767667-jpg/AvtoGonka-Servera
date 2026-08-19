import { useEffect, useRef, useState } from "react";
import { FpsEngine, BUY_ITEMS } from "./game/engine";
import type { GameEvent, GamePhase, HudState, MatchStats } from "./game/engine";

const fmt$ = (n: number) => `$${n.toLocaleString("ru-RU")}`;
const fmtTimer = (s: number) => {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
};

/* ---------- SVG-иконки ---------- */
const IconHealth = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
    <path d="M6 2h4v4h4v4h-4v4H6v-4H2V6h4z" />
  </svg>
);
const IconArmor = () => (
  <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1l6 2v5c0 3.6-2.6 6.4-6 7-3.4-.6-6-3.4-6-7V3z" />
  </svg>
);
const IconHelmet = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 2a6 6 0 016 6v3h-2.4l-.8 2h-5.6l-.8-2H2V8a6 6 0 016-6z" />
  </svg>
);
const IconSkull = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1a6 6 0 00-6 6c0 2.4 1.4 4.4 3.4 5.4V15h5.2v-2.6C12.6 11.4 14 9.4 14 7a6 6 0 00-6-6zM5.5 8.8A1.4 1.4 0 115.5 6a1.4 1.4 0 010 2.8zm5 0A1.4 1.4 0 1110.5 6a1.4 1.4 0 010 2.8z" />
  </svg>
);
const IconBullet = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1c2 1.6 3 3.4 3 5.5V12H5V6.5C5 4.4 6 2.6 8 1z" />
    <rect x="4.4" y="12.6" width="7.2" height="2.4" />
  </svg>
);
const IconPistol = () => (
  <svg width="34" height="20" viewBox="0 0 34 20" fill="currentColor">
    <path d="M2 5h28v4h-3l-1 3h-6l1-3H14v3H9l-2 5H3l2-5V9H2z" />
  </svg>
);
const IconRifle = () => (
  <svg width="44" height="20" viewBox="0 0 44 20" fill="currentColor">
    <path d="M1 7h34v2h8v2h-8v1h-4l1 5h-5l-1-5h-4l-2 4h-5l2-4h-5v3H7V9H1z" />
  </svg>
);
const IconVest = () => (
  <svg width="34" height="20" viewBox="0 0 34 20" fill="currentColor">
    <path d="M11 2l-5 3v6l2 1v6h18v-6l2-1V5l-5-3-3 2h-6z" opacity="0.9" />
  </svg>
);
const IconCross = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 1v5H3v4h5v5h0v-5h5V6H8z" />
    <rect x="7.2" y="0" width="1.6" height="6" />
    <rect x="7.2" y="10" width="1.6" height="6" />
    <rect x="0" y="7.2" width="6" height="1.6" />
    <rect x="10" y="7.2" width="6" height="1.6" />
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

/* ---------- экраны ---------- */

function MenuScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 screen-in flex flex-col justify-between p-6 md:p-10 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#12100b]/88 via-[#12100b]/40 to-[#12100b]/20" />

      <div className="relative max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[#ffb42a]"><IconCross /></span>
          <span className="hud-label text-[11px]">тактический 3D-шутер · раунды · экономика · боты</span>
        </div>
        <h1 className="font-display leading-[0.92] text-shadow-hard">
          <span className="block text-4xl md:text-6xl text-[#e8e0cc]">ОПЕРАЦИЯ</span>
          <span className="title-sheen block text-7xl md:text-9xl font-bold">МИРАЖ</span>
        </h1>
        <div className="hazard-stripe mt-5 h-2.5 w-72" />
        <p className="mt-5 max-w-lg text-sm md:text-base leading-relaxed text-[#c9bda2]">
          Зачистите сектор «Песчаный двор». Противники наступают с севера — держите
          дистанцию, контролируйте спрей и не забывайте закупаться между раундами.
          Пять выигранных раундов — операция выполнена.
        </p>
      </div>

      <div className="relative flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="hud-panel px-5 py-4 max-w-md">
          <div className="hud-label mb-3">Управление</div>
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm text-[#d8cdb2]">
            <div className="flex gap-1"><span className="keycap">W</span><span className="keycap">A</span><span className="keycap">S</span><span className="keycap">D</span></div>
            <span>передвижение · мышь — прицел</span>
            <div className="flex gap-1"><span className="keycap">ЛКМ</span></div>
            <span>огонь · <span className="keycap">R</span> перезарядка</span>
            <div className="flex gap-1"><span className="keycap">SHIFT</span><span className="keycap">C</span><span className="keycap">SPACE</span></div>
            <span>тихий шаг · присесть · прыжок</span>
            <div className="flex gap-1"><span className="keycap">1</span><span className="keycap">2</span><span className="keycap">B</span></div>
            <span>оружие · меню закупки</span>
          </div>
        </div>

        <div className="flex flex-col items-start md:items-end gap-3">
          <div className="hud-panel hud-panel--amber px-5 py-3 text-left md:text-right">
            <div className="hud-label">Брифинг</div>
            <div className="font-display text-sm text-[#ffcf6e]">НАГРАДА ЗА УСТРАНЕНИЕ · $300</div>
          </div>
          <button onClick={onStart} className="btn-primary px-12 py-4 text-xl md:text-2xl">
            В бой
          </button>
          <div className="text-xs tracking-[0.2em] text-[#8a7f66] uppercase">курс мыши захватится автоматически</div>
        </div>
      </div>
    </div>
  );
}

function PauseScreen({ onResume, onMenu, muted, onMute }: { onResume: () => void; onMenu: () => void; muted: boolean; onMute: () => void }) {
  return (
    <div className="absolute inset-0 screen-in flex items-center justify-center bg-[#0c0a06]/72">
      <div className="hud-panel px-10 py-8 w-[min(92vw,420px)]">
        <div className="hazard-stripe h-2 w-full mb-6" />
        <h2 className="font-display text-4xl text-center tracking-[0.2em] text-[#e8e0cc]">ПАУЗА</h2>
        <p className="mt-2 text-center text-sm text-[#8a7f66]">Операция приостановлена</p>
        <div className="mt-7 flex flex-col gap-3">
          <button onClick={onResume} className="btn-primary px-6 py-3.5">Вернуться в бой</button>
          <button onClick={onMute} className="btn-ghost px-6 py-3 flex items-center justify-center gap-2">
            <IconSound off={muted} /> Звук: {muted ? "выкл" : "вкл"} (M)
          </button>
          <button onClick={onMenu} className="btn-ghost px-6 py-3">Выйти в меню</button>
        </div>
        <div className="mt-5 text-center text-xs text-[#8a7f66] tracking-wider">ESC — закрыть меню</div>
      </div>
    </div>
  );
}

function BuyMenu({ hud, onBuy, onClose, onReady }: { hud: HudState; onBuy: (id: string) => void; onClose: () => void; onReady: () => void }) {
  const ownedPistol = hud.weaponName === "P250" || false;
  const stateOf = (id: string): { disabled: boolean; note: string } => {
    if (id === "p250" && ownedPistol) return { disabled: true, note: "Уже в кобуре" };
    if ((id === "ak" || id === "m4") && hud.weaponName === (id === "ak" ? "АК-47" : "M4A4")) return { disabled: true, note: "В руках" };
    if (id === "kevlar" && hud.armor >= 100) return { disabled: true, note: "Броня полная" };
    if (id === "helm" && hud.armor >= 100 && hud.helmet) return { disabled: true, note: "Полный комплект" };
    if (hud.money < BUY_ITEMS.find((i) => i.id === id)!.price) return { disabled: true, note: "Нет денег" };
    return { disabled: false, note: "" };
  };
  return (
    <div className="absolute left-1/2 bottom-24 -translate-x-1/2 screen-in w-[min(94vw,660px)]">
      <div className="hud-panel hud-panel--amber px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-display text-2xl text-[#ffcf6e] tracking-widest">ЗАКУПКА СНАРЯЖЕНИЯ</div>
            <div className="hud-label mt-0.5">нажмите цифру или кликните · <span className="text-[#52e06a]">{fmt$(hud.money)}</span> на счету</div>
          </div>
          <div className="text-right">
            <div className="hud-label">до начала раунда</div>
            <div className="font-display text-3xl text-[#ffb42a] buy-pulse">{Math.ceil(hud.timer)}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {BUY_ITEMS.map((item) => {
            const st = stateOf(item.id);
            return (
              <button
                key={item.id}
                onClick={() => onBuy(item.id)}
                className={`buy-card hud-panel px-4 py-3 text-left flex flex-col gap-1.5 ${st.disabled ? "buy-disabled" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <span className="keycap" style={{ minWidth: 26, height: 24, fontSize: 11 }}>{item.key}</span>
                  <span className="font-display text-lg" style={{ color: item.kind === "gear" ? "#8fd0ff" : "#ffcf6e" }}>{fmt$(item.price)}</span>
                </div>
                <div className="flex items-center gap-2 text-[#cbb489]">
                  {item.kind === "pistol" && <IconPistol />}
                  {item.kind === "rifle" && <IconRifle />}
                  {item.kind === "gear" && <IconVest />}
                  <span className="font-display text-base text-[#e8e0cc]">{item.name}</span>
                </div>
                <div className="text-[11px] leading-tight text-[#8a7f66]">{st.note || item.desc}</div>
              </button>
            );
          })}
          <div className="hud-panel px-4 py-3 flex flex-col justify-center gap-1" style={{ borderColor: "rgba(82,224,106,0.35)" }}>
            <div className="flex items-center gap-2 text-[#52e06a]"><IconBullet /><span className="font-display text-base">Боезапас</span></div>
            <div className="text-[11px] text-[#8a7f66] leading-tight">Магазины пополняются бесплатно в начале каждого раунда</div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-xs text-[#8a7f66] hidden sm:block">Оружие и броня сохраняются между раундами · HP восстанавливается</div>
          <div className="flex items-center gap-2.5">
            <button onClick={onClose} className="btn-ghost px-5 py-2.5 text-sm">Свернуть (B)</button>
            <button onClick={onReady} className="btn-primary px-7 py-2.5 text-base">Начать раунд</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function VictoryScreen({ stats, onContinue, onRestart }: { stats: MatchStats; onContinue: () => void; onRestart: () => void }) {
  const acc = stats.shots > 0 ? Math.round((stats.hits / stats.shots) * 100) : 0;
  const rows = [
    { l: "Раундов выиграно", v: String(stats.wins) },
    { l: "Раундов проиграно", v: String(stats.losses) },
    { l: "Устранений", v: String(stats.kills) },
    { l: "В голову", v: String(stats.headshots) },
    { l: "Точность", v: `${acc}%` },
    { l: "Заработано", v: fmt$(stats.moneyEarned) },
  ];
  return (
    <div className="absolute inset-0 screen-in flex items-center justify-center bg-[#12100b]/70">
      <div className="hud-panel hud-panel--green px-8 md:px-12 py-8 w-[min(94vw,560px)]">
        <div className="hazard-stripe h-2 w-full mb-5" />
        <div className="text-center">
          <div className="hud-label">операция завершена</div>
          <h2 className="font-display text-6xl md:text-7xl text-[#52e06a] mt-1" style={{ textShadow: "0 0 40px rgba(82,224,106,0.5)" }}>
            ПОБЕДА
          </h2>
          <p className="mt-2 text-sm text-[#a9c9ae]">Сектор «Песчаный двор» зачищен. Отличная работа, боец.</p>
        </div>
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
          {rows.map((r) => (
            <div key={r.l} className="hud-panel px-4 py-3">
              <div className="hud-label">{r.l}</div>
              <div className="font-display text-2xl text-[#e8e0cc]">{r.v}</div>
            </div>
          ))}
        </div>
        <div className="mt-7 flex flex-col sm:flex-row gap-3">
          <button onClick={onContinue} className="btn-primary px-6 py-3.5 flex-1">Следующие 5 раундов</button>
          <button onClick={onRestart} className="btn-ghost px-6 py-3.5">Новая операция</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- HUD ---------- */

function Crosshair({ gap, flash, headFlash }: { gap: number; flash: number; headFlash: number }) {
  const L = 9;
  const T = 2;
  const color = headFlash > 0 ? "#ff4545" : "#4dff78";
  const op = flash > 0 || headFlash > 0 ? 1 : 0.92;
  return (
    <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none" style={{ opacity: op }}>
      <div className="relative" style={{ width: gap * 2 + L * 2, height: gap * 2 + L * 2 }}>
        <div style={{ position: "absolute", left: "50%", top: 0, width: T, height: L, marginLeft: -T / 2, background: color, boxShadow: `0 0 4px ${color}` }} />
        <div style={{ position: "absolute", left: "50%", bottom: 0, width: T, height: L, marginLeft: -T / 2, background: color, boxShadow: `0 0 4px ${color}` }} />
        <div style={{ position: "absolute", top: "50%", left: 0, height: T, width: L, marginTop: -T / 2, background: color, boxShadow: `0 0 4px ${color}` }} />
        <div style={{ position: "absolute", top: "50%", right: 0, height: T, width: L, marginTop: -T / 2, background: color, boxShadow: `0 0 4px ${color}` }} />
        <div style={{ position: "absolute", left: "50%", top: "50%", width: 2, height: 2, marginLeft: -1, marginTop: -1, background: color }} />
      </div>
    </div>
  );
}

function Hud({
  hud,
  feed,
  onMute,
  muted,
  minimapRef,
}: {
  hud: HudState;
  feed: { id: number; text: string; head: boolean }[];
  onMute: () => void;
  muted: boolean;
  minimapRef: (c: HTMLCanvasElement | null) => void;
}) {
  const hpColor = hud.hp > 50 ? "#e8e0cc" : hud.hp > 25 ? "#ffb42a" : "#ff4545";
  return (
    <div className="pointer-events-none absolute inset-0">
      {/* таймер и счёт раундов — сверху по центру */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 flex flex-col items-center gap-1.5">
        <div className="hud-panel px-6 py-1.5 flex items-center gap-4">
          <span className="font-display text-xl text-[#52e06a]">{hud.wins}</span>
          <span className="text-[#8a7f66] text-xs">·</span>
          <div className="text-center">
            <div className={`font-display text-2xl leading-none ${hud.phase === "buy" ? "text-[#ffb42a]" : hud.timer < 11 ? "text-[#ff4545]" : "text-[#e8e0cc]"}`}>
              {fmtTimer(hud.timer)}
            </div>
            <div className="hud-label mt-0.5" style={{ fontSize: 9 }}>
              {hud.phase === "buy" ? "фаза закупки" : hud.phase === "roundend" ? "конец раунда" : `раунд ${hud.round} · противников: ${hud.botsLeft}`}
            </div>
          </div>
          <span className="text-[#8a7f66] text-xs">·</span>
          <span className="font-display text-xl text-[#ff4545]">{hud.losses}</span>
        </div>
      </div>

      {/* килл-фид — сверху справа */}
      <div className="absolute right-4 top-3 flex flex-col items-end gap-1.5">
        {feed.map((f) => (
          <div key={f.id} className="feed-in hud-panel px-3.5 py-1.5 flex items-center gap-2">
            <span className="text-[#52e06a] font-display text-xs">ВЫ</span>
            <span className={f.head ? "text-[#ff4545]" : "text-[#cbb489]"}><IconSkull /></span>
            <span className="text-xs text-[#d8cdb2]">{f.text}</span>
          </div>
        ))}
      </div>

      {/* кнопка звука */}
      <div className="absolute right-4 top-3 translate-y-0 pointer-events-auto" style={{ marginTop: feed.length > 0 ? feed.length * 38 + 8 : 0 }}>
        <button onClick={onMute} className="btn-ghost p-2" title="Звук (M)"><IconSound off={muted} /></button>
      </div>

      {/* миникарта — сверху слева */}
      <div className="absolute left-4 top-3">
        <div className="hud-panel p-1.5">
          <canvas ref={minimapRef} width={176} height={132} className="block" style={{ width: 176, height: 132 }} />
        </div>
        <div className="hud-panel mt-1.5 px-3 py-1.5 flex items-center gap-2">
          <IconBullet />
          <span className="hud-label" style={{ fontSize: 9 }}>убийств: <span className="text-[#e8e0cc] text-xs font-display">{hud.kills}</span></span>
        </div>
      </div>

      {/* здоровье/броня/деньги — снизу слева */}
      <div className="absolute left-4 bottom-4 flex items-end gap-3">
        <div className={`hud-panel px-5 py-3 ${hud.hp <= 25 ? "hud-panel--red" : ""}`}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2" style={{ color: hpColor }}>
              <IconHealth />
              <span className="font-display text-4xl leading-none" style={{ color: hpColor }}>{hud.hp}</span>
            </div>
            <div className="flex items-center gap-2" style={{ color: hud.armor > 0 ? "#8fd0ff" : "#4a463a" }}>
              <IconArmor />
              <span className="font-display text-4xl leading-none">{hud.armor}</span>
              {hud.helmet && <span className="text-[#8fd0ff]"><IconHelmet /></span>}
            </div>
          </div>
        </div>
        <div className="hud-panel hud-panel--green px-4 py-3">
          <div className="hud-label" style={{ color: "rgba(82,224,106,0.75)" }}>Баланс</div>
          <div className="font-display text-2xl text-[#52e06a] leading-none">{fmt$(hud.money)}</div>
        </div>
      </div>

      {/* оружие — снизу справа */}
      <div className="absolute right-4 bottom-4">
        <div className="hud-panel px-5 py-3 text-right">
          <div className="hud-label flex items-center justify-end gap-2">
            {hud.weaponKind === "rifle" ? <IconRifle /> : <IconPistol />}
            {hud.weaponName}
            {hud.crouch && <span className="text-[#8fd0ff]">· присел</span>}
          </div>
          <div className="font-display text-5xl leading-none text-[#e8e0cc]">
            {hud.mag}
            <span className="text-xl text-[#8a7f66]"> / {hud.reserve}</span>
          </div>
          <div className="mt-1.5 flex gap-1 justify-end">
            {Array.from({ length: hud.weaponKind === "rifle" ? 30 : 13 }).map((_, i) => (
              <div
                key={i}
                style={{
                  width: 3,
                  height: 9,
                  background: i < hud.mag ? "#ffcf6e" : "rgba(203,180,137,0.18)",
                  transform: "skewX(-12deg)",
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* подсказка снизу по центру */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] tracking-wider" style={{ color: "rgba(138,127,102,0.8)" }}>
        R — перезарядка · C — присесть · SHIFT — тихий шаг · B — закупка · 1/2 — оружие
      </div>

      {/* индикатор низкого HP */}
      {hud.hp <= 30 && <div className="absolute inset-0 lowhp" />}
    </div>
  );
}

/* ============================================================ */

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<FpsEngine | null>(null);
  const [phase, setPhase] = useState<GamePhase>("menu");
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [feed, setFeed] = useState<{ id: number; text: string; head: boolean }[]>([]);
  const [banner, setBanner] = useState<{ id: number; text: string; win: boolean } | null>(null);
  const [hitFlash, setHitFlash] = useState(0);
  const [hitmark, setHitmark] = useState(0);
  const [headmark, setHeadmark] = useState(0);
  const [buyOpen, setBuyOpen] = useState(false);
  const [stats, setStats] = useState<MatchStats | null>(null);
  const idRef = useRef(0);
  const phaseRef = useRef<GamePhase>("menu");
  phaseRef.current = phase;
  const pausedRef = useRef(false);
  pausedRef.current = paused;
  const buyOpenRef = useRef(false);
  buyOpenRef.current = buyOpen;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const eng = new FpsEngine(canvas, {
      hud: setHud,
      phase: (p, ps) => {
        setPhase(p);
        setPaused(ps);
        setBuyOpen(p === "buy");
      },
      stats: setStats,
      event: (e: GameEvent) => {
        switch (e.type) {
          case "hit":
            setHitmark((k) => k + 1);
            break;
          case "headhit":
            setHeadmark((k) => k + 1);
            break;
          case "kill": {
            const id = ++idRef.current;
            setFeed((f) => [...f.slice(-3), { id, text: e.label ?? "", head: (e.label ?? "").includes("В ГОЛОВУ") }]);
            window.setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200);
            break;
          }
          case "hurt":
            setHitFlash((k) => k + 1);
            break;
          case "roundwin":
            setBanner({ id: ++idRef.current, text: e.label ?? "", win: true });
            break;
          case "roundlose":
            setBanner({ id: ++idRef.current, text: e.label ?? "", win: false });
            break;
          default:
            break;
        }
      },
    });
    engineRef.current = eng;
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  // клавиши уровня приложения
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      if (e.code === "KeyB" && phaseRef.current === "buy") {
        setBuyOpen((b) => !b);
      }
      if (e.code === "KeyM") toggleMute();
      if (e.code === "Enter" && (phaseRef.current === "menu" || phaseRef.current === "victory")) startGame();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startGame = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.sfx.init();
    eng.sfx.click();
    setFeed([]);
    setBanner(null);
    setStats(null);
    eng.startMatch();
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

  const resume = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.sfx.click();
    eng.resumeFromPause();
  };

  const inGame = phase !== "menu" && phase !== "victory";

  return (
    <div className="relative h-full w-full overflow-hidden select-none" style={{ height: "100dvh", background: "#12100b" }}>
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />

      {/* атмосферные оверлеи */}
      <div className="pointer-events-none absolute inset-0 vignette" />
      {hitFlash > 0 && <div key={`hf${hitFlash}`} className="pointer-events-none absolute inset-0 hitflash" />}

      {/* хитмаркеры */}
      {hitmark > 0 && (
        <div key={`hm${hitmark}`} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="hitmark relative" style={{ width: 26, height: 26 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 12,
                  top: 12,
                  width: 3,
                  height: 10,
                  background: "#ffffff",
                  boxShadow: "0 0 6px rgba(255,255,255,0.9)",
                  transform: `rotate(${45 + i * 90}deg) translateY(-9px)`,
                  transformOrigin: "50% 50%",
                }}
              />
            ))}
          </div>
        </div>
      )}
      {headmark > 0 && (
        <div key={`hd${headmark}`} className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="hitmark relative" style={{ width: 32, height: 32 }}>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: 15,
                  top: 15,
                  width: 3,
                  height: 12,
                  background: "#ff4545",
                  boxShadow: "0 0 8px rgba(255,69,69,0.95)",
                  transform: `rotate(${45 + i * 90}deg) translateY(-11px)`,
                  transformOrigin: "50% 50%",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* прицел */}
      {inGame && hud && !paused && phase !== "roundend" && (
        <Crosshair gap={hud.crossGap} flash={hitmark} headFlash={headmark} />
      )}

      {/* баннер конца раунда */}
      {banner && phase === "roundend" && (
        <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[30%] flex justify-center">
          <div className="round-banner text-center">
            <div
              className="font-display text-5xl md:text-7xl tracking-[0.12em]"
              style={{
                color: banner.win ? "#52e06a" : "#ff4545",
                textShadow: `0 0 46px ${banner.win ? "rgba(82,224,106,0.6)" : "rgba(255,69,69,0.6)"}, 0 3px 0 rgba(0,0,0,0.5)`,
              }}
            >
              {banner.win ? "РАУНД ВЫИГРАН" : "РАУНД ПРОИГРАН"}
            </div>
            <div className="font-display text-xl mt-2 text-[#ffcf6e] text-shadow-hard">{banner.win ? "+$3250" : "+$1400"}</div>
          </div>
        </div>
      )}

      {inGame && hud && !paused && (
        <Hud
          hud={hud}
          feed={feed}
          onMute={toggleMute}
          muted={muted}
          minimapRef={(c) => {
            if (c) engineRef.current?.attachMinimap(c);
          }}
        />
      )}

      {phase === "buy" && !paused && buyOpen && hud && (
        <BuyMenu
          hud={hud}
          onBuy={(id) => {
            engineRef.current?.buy(id);
          }}
          onClose={() => setBuyOpen(false)}
          onReady={() => engineRef.current?.readyUp()}
        />
      )}

      {phase === "menu" && <MenuScreen onStart={startGame} />}
      {paused && inGame && (
        <PauseScreen onResume={resume} onMenu={() => engineRef.current?.toMenu()} muted={muted} onMute={toggleMute} />
      )}
      {phase === "victory" && stats && (
        <VictoryScreen
          stats={stats}
          onContinue={() => {
            engineRef.current?.sfx.click();
            engineRef.current?.continueAfterVictory();
          }}
          onRestart={startGame}
        />
      )}
    </div>
  );
}
