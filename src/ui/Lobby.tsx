import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { bridge } from "../bridge/GameBridge";
import type { ConnectionState } from "../shared/types";

interface LobbyProps {
  onHost: () => void;
  onJoin: (hostPeerId: string) => void;
}

type LobbyPhase = "choose" | "hosting" | "joining" | "connected";

export function Lobby({ onHost, onJoin }: LobbyProps) {
  const [phase, setPhase] = useState<LobbyPhase>("choose");
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinPeerId, setJoinPeerId] = useState("");
  const [connState, setConnState] = useState<ConnectionState>("idle");
  const [connMessage, setConnMessage] = useState<string | undefined>();

  useEffect(() => {
    const offConn = bridge.on("connection", (e) => {
      setConnState(e.state);
      setConnMessage(e.message);
      if (e.state === "connected") setPhase("connected");
    });
    const offRoom = bridge.on("roomCode", (e) => setRoomCode(e.code));
    return () => {
      offConn();
      offRoom();
    };
  }, []);

  const handleHost = () => {
    setPhase("hosting");
    setConnState("initializing");
    onHost();
  };

  const handleJoin = () => {
    if (!joinPeerId.trim()) return;
    setPhase("joining");
    setConnState("initializing");
    onJoin(joinPeerId.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-base)] px-6">
      <div className="w-full max-w-md">
        <header className="mb-12">
          <h1 className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-faint)]">
            2DSurvivor
          </h1>
          <p className="mt-3 text-2xl tracking-tight text-[var(--color-text)]">
            Co-op survivor-like
          </p>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Server-hosted. Two players. One swap.
          </p>
        </header>

        <AnimatePresence mode="wait">
          {phase === "choose" && (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col gap-3"
            >
              <button
                onClick={handleHost}
                className="rounded-lg bg-[var(--color-accent)] px-5 py-3 text-left text-sm font-medium text-white transition-transform duration-150 hover:bg-[var(--color-accent-bright)] active:translate-y-[1px]"
              >
                Host a game
              </button>
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <label className="mb-2 block font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                  Join with room code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinPeerId}
                    onChange={(e) => setJoinPeerId(e.target.value.toUpperCase().slice(0, 4))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleJoin();
                    }}
                    placeholder="ABCD"
                    maxLength={4}
                    className="flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-base)] px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-[var(--color-text)] placeholder:text-[var(--color-text-faint)] placeholder:tracking-[0.3em] focus:border-[var(--color-accent)] focus:outline-none"
                  />
                  <button
                    onClick={handleJoin}
                    disabled={joinPeerId.length !== 4}
                    className="rounded-md bg-[var(--color-surface-elevated)] px-4 py-2 text-xs font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-border-strong)] disabled:cursor-not-allowed disabled:text-[var(--color-text-faint)] disabled:hover:bg-[var(--color-surface-elevated)]"
                  >
                    Join
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {(phase === "hosting" || phase === "joining") && (
            <motion.div
              key="connecting"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                {phase === "hosting" ? "Hosting" : "Joining"}
              </p>

              {roomCode && (
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                    {phase === "hosting" ? "Your room code" : "Joining room"}
                  </p>
                  <p className="mt-1 text-center font-mono text-2xl tracking-[0.4em] text-[var(--color-text)]">
                    {roomCode}
                  </p>
                  {phase === "hosting" && (
                    <p className="mt-2 text-center text-[10px] text-[var(--color-text-faint)]">
                      Share this code with your friend
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
                <span className="text-xs text-[var(--color-text-muted)]">
                  {connMessage ?? "Working"}
                </span>
              </div>
            </motion.div>
          )}

          {phase === "connected" && (
            <motion.div
              key="connected"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-lg border border-[var(--color-success)] bg-[var(--color-surface)] p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--color-success)]">
                Connected
              </p>

              {roomCode && (
                <div className="mt-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-text-faint)]">
                    Your room code
                  </p>
                  <p className="mt-1 text-center font-mono text-2xl tracking-[0.4em] text-[var(--color-text)]">
                    {roomCode}
                  </p>
                  <p className="mt-2 text-center text-[10px] text-[var(--color-text-faint)]">
                    Share this code with your friend
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-accent)]" />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Waiting for Player 2 to join…
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {connState === "error" && connMessage && (
          <p className="mt-6 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] px-3 py-2 text-xs text-[var(--color-danger)]">
            {connMessage}
          </p>
        )}
      </div>
    </div>
  );
}
