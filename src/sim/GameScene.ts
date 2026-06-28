// Phaser scene. Renders the World with simple graphics primitives. No assets.
//
// Two modes (per ADR 0002):
//   Host: steps the world at 60Hz, sends snapshots at 30Hz, applies local input
//   Guest: receives snapshots, interpolates positions, sends local input

import Phaser from "phaser";
import { World } from "./World";
import { InputManager, type FrameInput } from "./InputManager";
import { bridge } from "../bridge/GameBridge";
import { NetClient } from "../net/NetClient";
import {
  SIM_DT,
  SNAPSHOT_INTERVAL,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
  BOX_RADIUS,
  BOX_COLOR,
  BOX_OPEN_RANGE,
  REVIVE_RANGE,
  ENEMY_DEFS,
} from "../shared/config";
import type { Snapshot } from "../shared/types";

export class GameScene extends Phaser.Scene {
  private world = new World();
  private net: NetClient;
  private inputManager: InputManager | null = null;
  private localPlayerId: string | null = null;
  // Guest peer id captured before this scene was ready (hello race fix).
  private pendingGuestId: string | null = null;

  private accumulator = 0;
  private snapshotAccumulator = 0;

  // Guest-side interpolation state
  private lastSnapshot: Snapshot | null = null;
  private prevSnapshot: Snapshot | null = null;
  private snapshotTime = 0;
  private renderGroup!: Phaser.GameObjects.Graphics;
  private runEndedEmitted = false;

  constructor(net: NetClient) {
    super({ key: "GameScene" });
    this.net = net;
  }

  init(data: { localPlayerId: string; guestPeerId?: string | null }) {
    this.localPlayerId = data.localPlayerId;
    this.pendingGuestId = data.guestPeerId ?? null;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a0a0b);
    this.renderGroup = this.add.graphics();

    const outline = this.add.graphics();
    outline.lineStyle(2, 0x2a2a30, 1);
    outline.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // Subscribe to bridge intents that affect the local sim (host) or are net-bound (guest)
    bridge.onIntent((intent) => {
      if (intent.type === "openBox") {
        // Local player wants to open a box
        if (this.net.getRole() === "host") {
          this.world.openBox(intent.boxId, this.localPlayerId!);
        } else {
          this.net.send({ kind: "boxOpen", boxId: intent.boxId, peerId: this.localPlayerId! });
        }
      } else if (intent.type === "chooseBox") {
        if (this.net.getRole() === "host") {
          this.world.chooseBoxOption(intent.boxId, this.localPlayerId!, intent.optionIndex);
          bridge.emit({ type: "boxClosed", boxId: intent.boxId });
        } else {
          this.net.send({
            kind: "boxChoice",
            boxId: intent.boxId,
            peerId: this.localPlayerId!,
            optionIndex: intent.optionIndex,
          });
          bridge.emit({ type: "boxClosed", boxId: intent.boxId });
        }
      } else if (intent.type === "cancelBox") {
        if (this.net.getRole() === "host") {
          this.world.cancelBox(intent.boxId, this.localPlayerId!);
        } else {
          this.net.send({ kind: "boxChoice", boxId: intent.boxId, peerId: this.localPlayerId!, optionIndex: -1 });
        }
        bridge.emit({ type: "boxClosed", boxId: intent.boxId });
      }
    });

    if (this.net.getRole() === "host") {
      this.setupHost();
    } else if (this.net.getRole() === "guest") {
      this.setupGuest();
    }

    this.inputManager = new InputManager(this.input.keyboard!);
  }

  private setupHost() {
    this.world.addHostPlayer(this.localPlayerId!);

    // hello may have arrived before this scene registered its listener. If App
    // captured the guest id, spawn the guest now so snapshots include both
    // players from the very first broadcast.
    if (this.pendingGuestId && !this.world.getPlayerIds().includes(this.pendingGuestId)) {
      this.world.addGuestPlayer(this.pendingGuestId);
      bridge.emit({
        type: "lobby",
        hostPeerId: this.localPlayerId!,
        guestPeerId: this.pendingGuestId,
      });
    }
    this.pendingGuestId = null;

    this.net.onMessage((msg) => {
      if (msg.kind === "hello" && msg.role === "guest") {
        if (!this.world.getPlayerIds().includes(msg.peerId)) {
          this.world.addGuestPlayer(msg.peerId);
          bridge.emit({
            type: "lobby",
            hostPeerId: this.localPlayerId!,
            guestPeerId: msg.peerId,
          });
        }
      } else if (msg.kind === "input") {
        this.world.setPlayerInput(msg.peerId, msg.input);
      } else if (msg.kind === "boxOpen") {
        this.world.openBox(msg.boxId, msg.peerId);
      } else if (msg.kind === "boxChoice") {
        if (msg.optionIndex >= 0) {
          this.world.chooseBoxOption(msg.boxId, msg.peerId, msg.optionIndex);
        } else {
          this.world.cancelBox(msg.boxId, msg.peerId);
        }
        bridge.emit({ type: "boxClosed", boxId: msg.boxId });
      }
    });
  }

  private setupGuest() {
    this.net.onMessage((msg) => {
      if (msg.kind === "snapshot") {
        this.prevSnapshot = this.lastSnapshot;
        this.lastSnapshot = msg.snapshot;
        this.snapshotTime = 0;
      }
    });
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const frame = this.inputManager?.sample() ?? { movement: { mx: 0, my: 0, charging: false }, openBoxPressed: false };

    if (this.net.getRole() === "host") {
      this.hostUpdate(dt, frame);
    } else {
      this.guestUpdate(dt, frame);
    }

    this.render();
    this.emitBoxMenuEvents();
    this.emitRunEndedIfDone();
  }

  private hostUpdate(dt: number, frame: FrameInput) {
    this.world.setLocalInput(this.localPlayerId!, frame.movement);
    if (frame.openBoxPressed) {
      this.world.requestOpenBox(this.localPlayerId!);
    }

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= SIM_DT && steps < 5) {
      this.world.step(SIM_DT);
      this.accumulator -= SIM_DT;
      steps++;
    }

    this.snapshotAccumulator += dt;
    if (this.snapshotAccumulator >= SNAPSHOT_INTERVAL) {
      this.snapshotAccumulator = 0;
      const snap = this.world.snapshot();
      this.net.send({ kind: "snapshot", snapshot: snap });
      bridge.emit({ type: "snapshot", snapshot: snap });
    }
  }

  private guestUpdate(dt: number, frame: FrameInput) {
    // Send local input to host
    this.net.send({ kind: "input", peerId: this.localPlayerId!, input: frame.movement });

    // Box open: local player pressed E, find nearest box from the latest snapshot
    if (frame.openBoxPressed && this.lastSnapshot) {
      const me = this.lastSnapshot.players.find((p) => p.id === this.localPlayerId);
      if (me) {
        const box = this.lastSnapshot.boxes.find(
          (b) => !b.opened && b.openerId === null && Math.hypot(b.x - me.x, b.y - me.y) <= BOX_OPEN_RANGE,
        );
        if (box) {
          this.net.send({ kind: "boxOpen", boxId: box.id, peerId: this.localPlayerId! });
        }
      }
    }

    this.snapshotTime += dt;
    const alpha = Math.min(1, this.snapshotTime / SNAPSHOT_INTERVAL);

    if (this.prevSnapshot && this.lastSnapshot) {
      const interp: Snapshot = {
        ...this.lastSnapshot,
        players: this.lastSnapshot.players.map((p) => {
          const prev = this.prevSnapshot!.players.find((q) => q.id === p.id);
          if (!prev) return p;
          return {
            ...p,
            x: prev.x + (p.x - prev.x) * alpha,
            y: prev.y + (p.y - prev.y) * alpha,
          };
        }),
        enemies: this.lastSnapshot.enemies.map((e) => {
          const prev = this.prevSnapshot!.enemies.find((q) => q.id === e.id);
          if (!prev) return e;
          return {
            ...e,
            x: prev.x + (e.x - prev.x) * alpha,
            y: prev.y + (e.y - prev.y) * alpha,
          };
        }),
        projectiles: this.lastSnapshot.projectiles.map((pr) => {
          const prev = this.prevSnapshot!.projectiles.find((q) => q.id === pr.id);
          if (!prev) return pr;
          return {
            ...pr,
            x: prev.x + (pr.x - prev.x) * alpha,
            y: prev.y + (pr.y - prev.y) * alpha,
          };
        }),
      };
      this.world.applySnapshot(interp);
    } else if (this.lastSnapshot) {
      this.world.applySnapshot(this.lastSnapshot);
    }

    const snap = this.world.snapshot();
    bridge.emit({ type: "snapshot", snapshot: snap });
  }

  /** Push box-menu-open events to React for any box whose openerId just got set. */
  private emittedBoxMenus: Set<number> = new Set();
  private emitBoxMenuEvents(): void {
    const boxes = this.world.getBoxes();
    for (const b of boxes) {
      if (
        b.openerId !== null &&
        b.openerId === this.localPlayerId &&
        b.options &&
        !this.emittedBoxMenus.has(b.id)
      ) {
        this.emittedBoxMenus.add(b.id);
        bridge.emit({
          type: "boxMenu",
          boxId: b.id,
          playerId: b.openerId,
          options: b.options,
        });
      }
      if (b.openerId !== this.localPlayerId || !b.options) {
        this.emittedBoxMenus.delete(b.id);
      }
    }
  }

  private emitRunEndedIfDone(): void {
    if (this.runEndedEmitted) return;
    const status = this.world.getRunStatus();
    if (status !== "playing") {
      this.runEndedEmitted = true;
      bridge.emit({ type: "runEnded", status });
      if (this.net.getRole() === "host") {
        this.net.send({ kind: "runEnded", status });
      }
    }
  }

  private render() {
    const g = this.renderGroup;
    g.clear();

    // Damage zones (drawn under everything): telegraph vs active
    for (const z of this.world.getZones()) {
      if (!z.active) {
        g.fillStyle(0xef4444, 0.08);
        g.fillCircle(z.x, z.y, z.radius);
        g.lineStyle(3, 0xef4444, 0.85);
        g.strokeCircle(z.x, z.y, z.radius);
      } else {
        g.fillStyle(0xef4444, 0.3);
        g.fillCircle(z.x, z.y, z.radius);
        g.lineStyle(2, 0xfca5a5, 0.9);
        g.strokeCircle(z.x, z.y, z.radius);
      }
    }

    // Boxes
    for (const b of this.world.getBoxes()) {
      const claimed = b.openerId !== null;
      g.fillStyle(claimed ? 0x56565d : BOX_COLOR, 0.9);
      g.fillRoundedRect(b.x - BOX_RADIUS, b.y - BOX_RADIUS, BOX_RADIUS * 2, BOX_RADIUS * 2, 4);
      g.lineStyle(2, claimed ? 0x8a8a92 : 0xfde68a, 1);
      g.strokeRoundedRect(b.x - BOX_RADIUS, b.y - BOX_RADIUS, BOX_RADIUS * 2, BOX_RADIUS * 2, 4);
      // "?" mark
      g.fillStyle(0x000000, 0.7);
      g.fillRect(b.x - 3, b.y - 5, 6, 2);
      g.fillRect(b.x - 3, b.y, 6, 2);
    }

    // Projectiles (orbiting drawn first so they sit under flying projectiles)
    for (const pr of this.world.getProjectiles()) {
      if (pr.weaponKind === "mine") {
        // Mine: small armed marker
        g.fillStyle(pr.color, 0.95);
        g.fillCircle(pr.x, pr.y, 6);
        g.lineStyle(2, 0x000000, 0.5);
        g.strokeCircle(pr.x, pr.y, 6);
        continue;
      }
      g.fillStyle(pr.color, 1);
      g.fillCircle(pr.x, pr.y, PROJECTILE_RADIUS);
      if (pr.hostile) {
        g.lineStyle(2, 0xef4444, 0.9);
        g.strokeCircle(pr.x, pr.y, PROJECTILE_RADIUS + 2);
      }
    }

    // Enemies
    for (const e of this.world.getEnemies()) {
      const def = ENEMY_DEFS[e.kind] ?? ENEMY_DEFS[1];
      const r = def.radius;
      g.fillStyle(def.color, 1);
      g.fillCircle(e.x, e.y, r);
      g.lineStyle(2, 0x000000, 0.45);
      g.strokeCircle(e.x, e.y, r);
      if (def.ranged) {
        // Casters get an inner core to read at a glance
        g.fillStyle(0x0a0a0b, 0.6);
        g.fillCircle(e.x, e.y, r * 0.45);
      }
      const maxHp = def.hp;
      const hpFrac = Math.max(0, Math.min(1, e.hp / maxHp));
      g.fillStyle(0x000000, 0.5);
      g.fillRect(e.x - r, e.y - r - 8, r * 2, 4);
      g.fillStyle(0xef4444, 1);
      g.fillRect(e.x - r, e.y - r - 8, r * 2 * hpFrac, 4);
    }

    // Players
    for (const p of this.world.getPlayers()) {
      if (p.iFrames > 0) {
        g.fillStyle(p.color, 0.2);
        g.fillCircle(p.x, p.y, PLAYER_RADIUS + 10);
      }
      const baseColor = p.downed ? 0x56565d : p.color;
      g.fillStyle(baseColor, 1);
      g.fillCircle(p.x, p.y, PLAYER_RADIUS);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeCircle(p.x, p.y, PLAYER_RADIUS);
      if (p.downed) {
        // Downed X marker + revive ring
        g.lineStyle(2, 0xef4444, 1);
        const d = PLAYER_RADIUS * 0.6;
        g.beginPath();
        g.moveTo(p.x - d, p.y - d);
        g.lineTo(p.x + d, p.y + d);
        g.moveTo(p.x + d, p.y - d);
        g.lineTo(p.x - d, p.y + d);
        g.strokePath();
        if (p.reviveProgress > 0) {
          g.lineStyle(4, 0x22c55e, 1);
          g.beginPath();
          g.arc(p.x, p.y, PLAYER_RADIUS + 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.reviveProgress, false);
          g.strokePath();
        }
        // Range circle for revive (subtle)
        g.lineStyle(1, 0x22c55e, 0.2);
        g.strokeCircle(p.x, p.y, REVIVE_RANGE);
      }
      if (p.chargeProgress > 0) {
        g.lineStyle(3, 0xfbbf24, 1);
        g.beginPath();
        g.arc(p.x, p.y, PLAYER_RADIUS + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.chargeProgress, false);
        g.strokePath();
      }
      const hpFrac = Math.max(0, p.hp / p.maxHp);
      g.fillStyle(0x000000, 0.5);
      g.fillRect(p.x - PLAYER_RADIUS, p.y - PLAYER_RADIUS - 8, PLAYER_RADIUS * 2, 3);
      g.fillStyle(0x22c55e, 1);
      g.fillRect(p.x - PLAYER_RADIUS, p.y - PLAYER_RADIUS - 8, PLAYER_RADIUS * 2 * hpFrac, 3);
      const mFrac = Math.max(0, p.mana / p.maxMana);
      g.fillStyle(0x000000, 0.5);
      g.fillRect(p.x - PLAYER_RADIUS, p.y - PLAYER_RADIUS - 4, PLAYER_RADIUS * 2, 2);
      g.fillStyle(0x60a5fa, 1);
      g.fillRect(p.x - PLAYER_RADIUS, p.y - PLAYER_RADIUS - 4, PLAYER_RADIUS * 2 * mFrac, 2);
    }
  }
}
