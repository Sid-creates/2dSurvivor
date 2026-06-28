import { motion } from "motion/react";
import type { RunStatus } from "../shared/types";

interface EndScreenProps {
  status: RunStatus;
  runTime: number;
  wave: number;
  onReturnToLobby: () => void;
}

// End-of-run screen. Per design-taste skill: minimal, single accent for win,
// danger red for loss. No em-dashes, no fake screenshots, no version stamps.

export function EndScreen({ status, runTime, wave, onReturnToLobby }: EndScreenProps) {
  const won = status === "won";
  const accent = won ? "var(--color-success)" : "var(--color-danger)";
  const headline = won ? "You survived" : "You fell";
  const sub = won
    ? "Both of you held out to the end."
    : "Both players went down at the same time.";

  const minutes = Math.floor(runTime / 60);
  const seconds = Math.floor(runTime % 60);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-base)]/95 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md px-6"
      >
        <p
          className="font-mono text-[11px] uppercase tracking-[0.22em]"
          style={{ color: accent }}
        >
          {won ? "Win" : "Loss"}
        </p>
        <h1 className="mt-3 text-4xl tracking-tight text-[var(--color-text)]">
          {headline}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">{sub}</p>

        <div className="mt-8 flex gap-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Time
            </p>
            <p className="mt-1 font-mono text-2xl text-[var(--color-text)]">
              {minutes}:{seconds.toString().padStart(2, "0")}
            </p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
              Wave
            </p>
            <p className="mt-1 font-mono text-2xl text-[var(--color-text)]">{wave}</p>
          </div>
        </div>

        <button
          onClick={onReturnToLobby}
          className="mt-10 w-full rounded-lg bg-[var(--color-accent)] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-bright)] active:translate-y-[1px]"
        >
          Back to lobby
        </button>
      </motion.div>
    </div>
  );
}
