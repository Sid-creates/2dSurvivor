// App: top-level React component. Owns the Phaser game instance, the NetClient,
// and the bridge wiring. Renders Lobby until connected, then the game canvas +
// HUD overlay. Per ADR 0003, Phaser owns the canvas; React DOM owns all UI.

import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";
import { NetClient } from "./net/NetClient";
import { GameScene } from "./sim/GameScene";
import { bridge } from "./bridge/GameBridge";
import { WORLD_WIDTH, WORLD_HEIGHT } from "./shared/config";
import type { RunStatus, WeaponPickOption } from "./shared/types";
import { Lobby } from "./ui/Lobby";
import { Hud } from "./ui/Hud";
import { BoxMenu } from "./ui/BoxMenu";
import { EndScreen } from "./ui/EndScreen";

type AppPhase = "lobby" | "in-game";

interface BoxMenuState {
  boxId: number;
  options: WeaponPickOption[];
}

export function App() {
  const [phase, setPhase] = useState<AppPhase>("lobby");
  const [inGame, setInGame] = useState(false);
  const [boxMenu, setBoxMenu] = useState<BoxMenuState | null>(null);
  const [runEnd, setRunEnd] = useState<{ status: RunStatus; runTime: number; wave: number } | null>(null);

  const netRef = useRef<NetClient | null>(null);
  if (!netRef.current) netRef.current = new NetClient();
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inGameRef = useRef(false);
  useEffect(() => {
    inGameRef.current = inGame;
  }, [inGame]);

  // Latest snapshot for the end screen
  const lastSnapshotRef = useRef<{ runTime: number; wave: number } | null>(null);

  // Wire NetClient -> bridge
  useEffect(() => {
    const net = netRef.current!;
    const offState = net.onState((state, message) => {
      bridge.emit({ type: "connection", state, message });
    });

    // Both clients start the game on the first authoritative snapshot from the
    // server. No hello handshake, no host role.
    const offLobby = net.onMessage((msg) => {
      if (msg.kind === "snapshot") {
        if (!inGameRef.current) startGame();
      }
    });

    const offIntent = bridge.onIntent((intent) => {
      if (intent.type === "hostGame") {
        net.host();
        bridge.emit({ type: "localPeerId", peerId: null });
        bridge.emit({ type: "roomCode", code: net.getRoomCode() });
      } else if (intent.type === "joinGame") {
        net.join(intent.hostPeerId);
        bridge.emit({ type: "localPeerId", peerId: null });
        bridge.emit({ type: "roomCode", code: net.getRoomCode() });
      } else if (intent.type === "disconnect") {
        net.teardown();
      } else if (intent.type === "openBox") {
        // Handled inside GameScene
      } else if (intent.type === "chooseBox" || intent.type === "cancelBox") {
        // Handled inside GameScene
      } else if (intent.type === "returnToLobby") {
        teardownGame();
        setRunEnd(null);
        setBoxMenu(null);
        setPhase("lobby");
        net.teardown();
      }
    });

    // Surface the local player id + room code to the bridge as soon as they exist.
    const idInterval = setInterval(() => {
      const id = net.getLocalPeerId();
      if (id) bridge.emit({ type: "localPeerId", peerId: id });
      const code = net.getRoomCode();
      if (code) bridge.emit({ type: "roomCode", code });
    }, 100);

    return () => {
      offState();
      offLobby();
      offIntent();
      clearInterval(idInterval);
    };
  }, []);

  // Track latest snapshot for end-screen stats
  useEffect(() => {
    const off = bridge.on("snapshot", (e) => {
      lastSnapshotRef.current = {
        runTime: e.snapshot.runTime,
        wave: e.snapshot.wave,
      };
    });
    return () => {
      off();
    };
  }, []);

  // Box menu events from Phaser
  useEffect(() => {
    const off = bridge.on("boxMenu", (e) => {
      setBoxMenu({ boxId: e.boxId, options: e.options });
    });
    const offClosed = bridge.on("boxClosed", (e) => {
      setBoxMenu((current) => (current?.boxId === e.boxId ? null : current));
    });
    return () => {
      off();
      offClosed();
    };
  }, []);

  // Run-ended events from Phaser
  useEffect(() => {
    const off = bridge.on("runEnded", (e) => {
      const snap = lastSnapshotRef.current;
      setRunEnd({
        status: e.status,
        runTime: snap?.runTime ?? 0,
        wave: snap?.wave ?? 1,
      });
    });
    return () => {
      off();
    };
  }, []);

  // Connection-driven phase changes
  useEffect(() => {
    const off = bridge.on("connection", (e) => {
      if (e.state === "disconnected" || e.state === "error") {
        if (inGameRef.current) {
          teardownGame();
          setPhase("lobby");
        }
      }
    });
    return () => {
      off();
    };
  }, []);

  // Forward local player id + room code to bridge once connected
  useEffect(() => {
    const off = bridge.on("connection", (e) => {
      if (e.state === "connected") {
        const id = netRef.current?.getLocalPeerId() ?? null;
        if (id) bridge.emit({ type: "localPeerId", peerId: id });
        const code = netRef.current?.getRoomCode() ?? null;
        if (code) bridge.emit({ type: "roomCode", code });
      }
    });
    return () => {
      off();
    };
  }, []);

  function startGame() {
    if (inGameRef.current) return;
    setInGame(true);
    setPhase("in-game");

    const net = netRef.current!;
    const localId = net.getLocalPeerId() ?? "local";

    if (containerRef.current && !gameRef.current) {
      gameRef.current = new Phaser.Game({
        type: Phaser.AUTO,
        parent: containerRef.current,
        width: WORLD_WIDTH,
        height: WORLD_HEIGHT,
        backgroundColor: "#0a0a0b",
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH,
        },
        physics: {
          default: "arcade",
          arcade: { gravity: { x: 0, y: 0 } },
        },
        scene: [new GameScene(net)],
      });

      gameRef.current.scene.start("GameScene", {
        localPlayerId: localId,
      });
    }
  }

  function teardownGame() {
    try {
      gameRef.current?.destroy(true);
    } catch {
      /* ignore */
    }
    gameRef.current = null;
    setInGame(false);
  }

  useEffect(() => {
    return () => {
      teardownGame();
      netRef.current?.teardown();
    };
  }, []);

  const handleHost = () => {
    bridge.sendIntent({ type: "hostGame" });
  };

  const handleJoin = (hostPeerId: string) => {
    bridge.sendIntent({ type: "joinGame", hostPeerId });
  };

  const handleChoose = (optionIndex: number) => {
    if (!boxMenu) return;
    bridge.sendIntent({ type: "chooseBox", boxId: boxMenu.boxId, optionIndex });
    setBoxMenu(null);
  };

  const handleCancelBox = () => {
    if (!boxMenu) return;
    bridge.sendIntent({ type: "cancelBox", boxId: boxMenu.boxId });
    setBoxMenu(null);
  };

  const handleReturnToLobby = () => {
    bridge.sendIntent({ type: "returnToLobby" });
  };

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--color-base)]">
      <div
        ref={containerRef}
        className="absolute inset-0 flex items-center justify-center"
      />

      {/* CRT retro overlay: scanlines + vignette + aberration. Above canvas, below menus. */}
      {phase === "in-game" && <div className="crt-overlay" aria-hidden="true" />}

      {phase === "in-game" && <Hud />}
      {phase === "in-game" && boxMenu && (
        <BoxMenu
          options={boxMenu.options}
          onChoose={handleChoose}
          onCancel={handleCancelBox}
        />
      )}
      {phase === "in-game" && runEnd && (
        <EndScreen
          status={runEnd.status}
          runTime={runEnd.runTime}
          wave={runEnd.wave}
          onReturnToLobby={handleReturnToLobby}
        />
      )}
      {phase === "lobby" && <Lobby onHost={handleHost} onJoin={handleJoin} />}
    </div>
  );
}
