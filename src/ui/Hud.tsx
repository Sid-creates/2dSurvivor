import { useEffect, useState } from "react";
import { bridge } from "../bridge/GameBridge";
import {
  BOX_OPEN_RANGE,
  BOSS_BASE_HP,
  BOSS_HP_PER_TIER,
  DASH_COOLDOWN,
  DASH_CD_REDUCTION,
  DASH_CD_MIN,
} from "../shared/config";
import type { CurseKind, Snapshot } from "../shared/types";

const CURSE_TAGS: Record<CurseKind, string> = {
  spawn: "Swarm",
  speed: "Haste",
  hp: "Frailty",
  scroll: "Drift",
};

// In-game HUD overlay. Reads snapshots from the bridge and renders HP, mana,
// wave timer, boss timer, swap charge meters. Positioned absolutely over the
// Phaser canvas. No em-dashes, no decorative dots, no version stamps.

export function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [localPeerId, setLocalPeerId] = useState<string | null>(null);

  useEffect(() => {
    const off = bridge.on("snapshot", (e) => setSnap(e.snapshot));
    const offId = bridge.on("localPeerId", (e) => setLocalPeerId(e.peerId));
    return () => {
      off();
      offId();
    };
  }, []);

  if (!snap) return null;

  const [p1, p2] = snap.players;
  const waveSeconds = Math.ceil(snap.waveTimer);
  const waveMin = Math.floor(waveSeconds / 60);
  const waveSec = waveSeconds % 60;

  const runSecondsTotal = Math.floor(snap.runTime);
  const runMin = Math.floor(runSecondsTotal / 60);
  const runSec = runSecondsTotal % 60;
  const runTotalMin = Math.floor(snap.runDuration / 60);

  // Box prompt: is the local player near an unopened box?
  const me = localPeerId
    ? (snap.players.find((p) => p.id === localPeerId) ?? null)
    : null;
  const nearBox =
    me !== null &&
    !me.downed &&
    snap.boxes.some(
      (b) =>
        !b.opened &&
        b.openerId === null &&
        Math.hypot(b.x - me.x, b.y - me.y) <= BOX_OPEN_RANGE,
    );

  // Boss HP bar (boss waves end when the boss dies, not on a timer)
  const boss = snap.enemies.find((e) => e.kind === 2);
  const bossTier = Math.floor(snap.wave / 5);
  const bossMaxHp = BOSS_BASE_HP + (bossTier - 1) * BOSS_HP_PER_TIER;
  const bossHpFrac = boss ? Math.max(0, Math.min(1, boss.hp / bossMaxHp)) : 0;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Top center: wave + run timer */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <div className="flex items-center gap-5 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)]/92 px-6 py-3 shadow-lg shadow-black/40 backdrop-blur-md">
          <div className="flex flex-col items-center">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Run
            </span>
            <span className="font-mono text-xl font-medium tabular-nums text-[var(--color-text)]">
              {runMin}:{runSec.toString().padStart(2, "0")}
              <span className="text-[var(--color-text-faint)]"> / {runTotalMin}:00</span>
            </span>
          </div>
          <div className="h-10 w-px bg-[var(--color-border)]" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              Wave
            </span>
            <span className="font-mono text-xl font-medium tabular-nums text-[var(--color-text)]">
              {snap.wave}
            </span>
          </div>
          <div className="h-10 w-px bg-[var(--color-border)]" />
          <div className="flex flex-col items-center">
            <span
              className={`font-mono text-xs uppercase tracking-[0.2em] ${
                snap.isBossWave
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {snap.isBossWave ? "Boss" : "Survive"}
            </span>
            <span
              className={`font-mono text-xl font-medium tabular-nums ${
                snap.isBossWave
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              {snap.isBossWave ? "Slay" : `${waveMin}:${waveSec.toString().padStart(2, "0")}`}
            </span>
          </div>
        </div>

        {/* Boss HP bar */}
        {snap.isBossWave && boss && (
          <div className="mt-2 w-full rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-surface)]/92 px-4 py-2 backdrop-blur-md">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--color-danger)]">
                Boss
              </span>
              <span className="font-mono text-[11px] tabular-nums text-[var(--color-text-muted)]">
                {Math.ceil(boss.hp)} / {bossMaxHp}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-base)]">
              <div
                className="h-full rounded-full bg-[var(--color-danger)] transition-[width] duration-100 ease-out"
                style={{ width: `${bossHpFrac * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Controls panel (under the timer) */}
        <ControlsPanel />
      </div>

      {/* Bottom left: player 1 stats */}
      {p1 && <PlayerStatBlock player={p1} label="P1" align="left" />}

      {/* Bottom right: player 2 stats */}
      {p2 && <PlayerStatBlock player={p2} label="P2" align="right" />}

      {/* Bottom center: swap charge meters */}
      {snap.players.length === 2 && (
        <SwapMeters p1={p1!} p2={p2!} />
      )}

      {/* Contextual box-open prompt */}
      {nearBox && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2">
          <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)]/90 px-4 py-2 backdrop-blur-md">
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text)]">
              Press <span className="text-[var(--color-accent-bright)]">E</span> to open Box
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface PlayerStat {
  id: string;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  shieldHp: number;
  maxShield: number;
  charging: boolean;
  chargeProgress: number;
  iFrames: number;
  dashCooldown: number;
  dashTime: number;
  dps: number;
  downed: boolean;
  color: number;
  dashMods: { range: number; trail: number; cooldown: number };
  curses: CurseKind[];
}

function PlayerStatBlock({
  player,
  label,
  align,
}: {
  player: PlayerStat;
  label: string;
  align: "left" | "right";
}) {
  const hpFrac = Math.max(0, player.hp / player.maxHp);
  const manaFrac = Math.max(0, player.mana / player.maxMana);
  const shieldFrac = player.maxShield > 0 ? Math.max(0, player.shieldHp / player.maxShield) : 0;
  // Stage 3: cooldown levels shorten the dash cooldown, so scale the meter to
  // the player's effective max rather than the base.
  const dashMax = DASH_COOLDOWN * Math.max(DASH_CD_MIN, 1 - player.dashMods.cooldown * DASH_CD_REDUCTION);
  const dashFrac = Math.max(0, 1 - player.dashCooldown / dashMax);
  const dashReady = player.dashCooldown <= 0;
  const colorHex = `#${player.color.toString(16).padStart(6, "0")}`;
  const hasDashMods =
    player.dashMods.range + player.dashMods.trail + player.dashMods.cooldown > 0;

  return (
    <div
      className={`absolute bottom-4 ${
        align === "left" ? "left-4" : "right-4"
      } w-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/85 p-3 backdrop-blur-md ${
        player.downed ? "opacity-60" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
            {Math.round(player.dps)} dps
          </span>
          {player.downed && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-danger)]">
              Downed
            </span>
          )}
          {player.iFrames > 0 && !player.downed && (
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-accent-bright)]">
              i-frames
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: colorHex }}
        />
        <div className="flex-1">
          <Bar
            value={hpFrac}
            color="var(--color-success)"
            trackColor="var(--color-base)"
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {Math.ceil(player.hp)}
        </span>
      </div>

      {/* Shield (absorb) bar */}
      <div className="mt-1 flex items-center gap-2">
        <span className="inline-block h-2 w-2 rounded-full bg-[#7dd3fc]" />
        <div className="flex-1">
          <Bar value={shieldFrac} color="#7dd3fc" trackColor="var(--color-base)" height={4} />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {Math.ceil(player.shieldHp)}
        </span>
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <span className="inline-block h-2 w-2" />
        <div className="flex-1">
          <Bar
            value={manaFrac}
            color="var(--color-accent)"
            trackColor="var(--color-base)"
            height={3}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-[var(--color-text-muted)]">
          {Math.ceil(player.mana)}
        </span>
      </div>

      {/* Dash cooldown meter */}
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={`inline-block h-2 w-2 ${
            dashReady ? "rounded-full bg-[var(--color-accent-bright)]" : "bg-[var(--color-text-faint)]"
          }`}
        />
        <div className="flex-1">
          <Bar
            value={dashFrac}
            color={dashReady ? "var(--color-accent-bright)" : "var(--color-text-faint)"}
            trackColor="var(--color-base)"
            height={3}
          />
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
          {dashReady ? "Dash" : `${player.dashCooldown.toFixed(1)}s`}
        </span>
      </div>

      {/* Stage 3: dash upgrade levels + active curses */}
      {hasDashMods && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {player.dashMods.range > 0 && (
            <span className="rounded border border-[#fbbf24]/50 px-1.5 py-0.5 font-mono text-[10px] text-[#fbbf24]">
              Reach {player.dashMods.range}
            </span>
          )}
          {player.dashMods.trail > 0 && (
            <span className="rounded border border-[#fbbf24]/50 px-1.5 py-0.5 font-mono text-[10px] text-[#fbbf24]">
              Trail {player.dashMods.trail}
            </span>
          )}
          {player.dashMods.cooldown > 0 && (
            <span className="rounded border border-[#fbbf24]/50 px-1.5 py-0.5 font-mono text-[10px] text-[#fbbf24]">
              Cooldown {player.dashMods.cooldown}
            </span>
          )}
        </div>
      )}
      {player.curses.length > 0 && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {player.curses.map((c) => (
            <span
              key={c}
              className="rounded border border-[var(--color-danger)]/60 px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-danger)]"
            >
              {CURSE_TAGS[c]} Curse
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ControlsPanel() {
  const rows: Array<[string, string]> = [
    ["WASD", "Move"],
    ["Shift", "Dash"],
    ["Space", "Charge Swap"],
    ["E", "Open Box"],
  ];
  return (
    <div className="mt-2 flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/80 px-3 py-1.5 backdrop-blur-md">
      {rows.map(([key, action]) => (
        <div key={key} className="flex items-center gap-1.5">
          <span className="rounded border border-[var(--color-border-strong)] bg-[var(--color-surface-elevated)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text)]">
            {key}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
            {action}
          </span>
        </div>
      ))}
    </div>
  );
}

function SwapMeters({ p1, p2 }: { p1: PlayerStat; p2: PlayerStat }) {
  const anyCharging = p1.charging || p2.charging;
  if (!anyCharging && p1.chargeProgress === 0 && p2.chargeProgress === 0) {
    return (
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/85 px-4 py-2 backdrop-blur-md">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
            Hold Space to charge Swap
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
      <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-surface)]/90 px-4 py-2 backdrop-blur-md">
        <div className="mb-1 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
          Swap
        </div>
        <div className="flex items-center gap-3">
          <ChargeMeter progress={p1.chargeProgress} label="P1" />
          <ChargeMeter progress={p2.chargeProgress} label="P2" />
        </div>
      </div>
    </div>
  );
}

function ChargeMeter({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--color-base)]">
        <div
          className="h-full rounded-full bg-[var(--color-accent-bright)] transition-[width] duration-100 ease-out"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
        {label}
      </span>
    </div>
  );
}

function Bar({
  value,
  color,
  trackColor,
  height = 5,
}: {
  value: number;
  color: string;
  trackColor: string;
  height?: number;
}) {
  return (
    <div
      className="overflow-hidden rounded-full"
      style={{ backgroundColor: trackColor, height }}
    >
      <div
        className="h-full rounded-full"
        style={{ width: `${value * 100}%`, backgroundColor: color }}
      />
    </div>
  );
}
