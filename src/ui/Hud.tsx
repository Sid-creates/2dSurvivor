import { useEffect, useState } from "react";
import { bridge } from "../bridge/GameBridge";
import type { Snapshot } from "../shared/types";
import { BOX_OPEN_RANGE, BOSS_BASE_HP, BOSS_HP_PER_TIER } from "../shared/config";

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
  charging: boolean;
  chargeProgress: number;
  iFrames: number;
  downed: boolean;
  color: number;
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
  const colorHex = `#${player.color.toString(16).padStart(6, "0")}`;

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
