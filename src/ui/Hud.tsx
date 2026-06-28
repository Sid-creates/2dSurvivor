import { useEffect, useState } from "react";
import { bridge } from "../bridge/GameBridge";
import type { Snapshot } from "../shared/types";

// In-game HUD overlay. Reads snapshots from the bridge and renders HP, mana,
// wave timer, boss timer, swap charge meters. Positioned absolutely over the
// Phaser canvas. No em-dashes, no decorative dots, no version stamps.

export function Hud() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const off = bridge.on("snapshot", (e) => setSnap(e.snapshot));
    return () => {
      off();
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

  // Box prompt: is the local player near a box?
  // (Rendered as a contextual hint at the bottom of the screen.)
  // We rely on the bridge's "boxMenu" event to surface the actual menu;
  // here we only show the proximity prompt.

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      {/* Top center: wave + run timer */}
      <div className="absolute left-1/2 top-4 -translate-x-1/2">
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/85 px-4 py-2 backdrop-blur-md">
          <div className="flex flex-col items-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Run
            </span>
            <span className="font-mono text-base text-[var(--color-text)]">
              {runMin}:{runSec.toString().padStart(2, "0")} / {runTotalMin}:00
            </span>
          </div>
          <div className="h-8 w-px bg-[var(--color-border)]" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Wave
            </span>
            <span className="font-mono text-base text-[var(--color-text)]">{snap.wave}</span>
          </div>
          <div className="h-8 w-px bg-[var(--color-border)]" />
          <div className="flex flex-col items-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              {snap.isBossWave ? "Boss" : "Survive"}
            </span>
            <span
              className={`font-mono text-base ${
                snap.isBossWave
                  ? "text-[var(--color-danger)]"
                  : "text-[var(--color-text)]"
              }`}
            >
              {waveMin}:{waveSec.toString().padStart(2, "0")}
            </span>
          </div>
          {snap.isBossWave && snap.bossTimer > 0 && (
            <>
              <div className="h-8 w-px bg-[var(--color-border)]" />
              <div className="flex flex-col items-center">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                  DPS check
                </span>
                <span className="font-mono text-base text-[var(--color-danger)]">
                  {Math.ceil(snap.bossTimer)}s
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom left: player 1 stats */}
      {p1 && <PlayerStatBlock player={p1} label="P1" align="left" />}

      {/* Bottom right: player 2 stats */}
      {p2 && <PlayerStatBlock player={p2} label="P2" align="right" />}

      {/* Bottom center: swap charge meters */}
      {snap.players.length === 2 && (
        <SwapMeters p1={p1!} p2={p2!} />
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
