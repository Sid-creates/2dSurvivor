// Phaser scene. Renders the authoritative World state streamed from the
// PartyKit server. The client never steps the simulation: it sends local input
// + box intents to the server, interpolates between the two most recent
// snapshots, and renders the interpolated state. See ADR 0003.

import Phaser from "phaser";
import { World } from "./World";
import { InputManager, type FrameInput } from "./InputManager";
import { bridge } from "../bridge/GameBridge";
import { NetClient } from "../net/NetClient";
import { WEAPON_DEFS } from "./weapons";
import {
  SNAPSHOT_INTERVAL,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
  BOX_RADIUS,
  BOX_COLOR,
  BOX_OPEN_RANGE,
  REVIVE_RANGE,
  ENEMY_DEFS,
  GRID_SPACING,
  GRID_COLOR,
  MINE_TRIGGER_RANGE,
} from "../shared/config";
import type { ProjectileShape } from "./weapons";
import {
  OBSTACLE_BLOCK_COLOR,
  OBSTACLE_HAZARD_COLOR,
  HEALTH_PACK_RADIUS,
  HEALTH_PACK_COLOR,
} from "./World";
import type { Snapshot } from "../shared/types";

export class GameScene extends Phaser.Scene {
  private world = new World();
  private net: NetClient;
  private inputManager: InputManager | null = null;
  private localPlayerId: string | null = null;

  // Interpolation state: lerp between the previous and latest server snapshots.
  private lastSnapshot: Snapshot | null = null;
  private prevSnapshot: Snapshot | null = null;
  private snapshotTime = 0;
  private renderGroup!: Phaser.GameObjects.Graphics;
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private runEndedEmitted = false;

  // Screen shake: shake when the local player takes damage.
  private prevLocalHp: number | null = null;

  constructor(net: NetClient) {
    super({ key: "GameScene" });
    this.net = net;
  }

  init(data: { localPlayerId: string }) {
    this.localPlayerId = data.localPlayerId;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a0a0b);

    // Plus-grid background, drawn beneath everything. Re-anchored to the
    // scrolling camera each frame in render() (Stage 2).
    this.gridGraphics = this.add.graphics();
    this.renderGroup = this.add.graphics();

    // Box intents are forwarded to the authoritative server; the local menu
    // closes optimistically so the UI feels instant.
    bridge.onIntent((intent) => {
      if (intent.type === "openBox") {
        this.net.send({ kind: "boxOpen", boxId: intent.boxId, peerId: this.localPlayerId! });
      } else if (intent.type === "chooseBox") {
        this.net.send({
          kind: "boxChoice",
          boxId: intent.boxId,
          peerId: this.localPlayerId!,
          optionIndex: intent.optionIndex,
        });
        bridge.emit({ type: "boxClosed", boxId: intent.boxId });
      } else if (intent.type === "cancelBox") {
        this.net.send({ kind: "boxChoice", boxId: intent.boxId, peerId: this.localPlayerId!, optionIndex: -1 });
        bridge.emit({ type: "boxClosed", boxId: intent.boxId });
      }
    });

    this.net.onMessage((msg) => {
      if (msg.kind === "snapshot") {
        this.prevSnapshot = this.lastSnapshot;
        this.lastSnapshot = msg.snapshot;
        this.snapshotTime = 0;
      }
    });

    this.inputManager = new InputManager(this.input.keyboard!);
  }

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const frame = this.inputManager?.sample() ?? { movement: { mx: 0, my: 0, charging: false, dashPressed: false }, openBoxPressed: false };

    this.clientUpdate(dt, frame);

    this.maybeShakeOnHit();
    this.render();
    this.emitBoxMenuEvents();
    this.emitRunEndedIfDone();
  }

  /** Shake the camera when the local player's HP (or shield) drops between snapshots. */
  private maybeShakeOnHit(): void {
    if (!this.localPlayerId) return;
    const me = this.world.getPlayers().find((p) => p.id === this.localPlayerId);
    if (!me) return;
    const effective = me.hp + me.shieldHp;
    if (this.prevLocalHp !== null && effective < this.prevLocalHp - 0.5) {
      this.cameras.main.shake(120, 0.006);
    }
    this.prevLocalHp = effective;
  }

  private clientUpdate(dt: number, frame: FrameInput) {
    // Ship local input to the server every frame.
    this.net.send({ kind: "input", peerId: this.localPlayerId!, input: frame.movement });

    // E pressed: ask the server to open the nearest in-range box from our last snapshot.
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

    // Interpolate toward the latest snapshot for smooth remote motion.
    this.snapshotTime += dt;
    const alpha = Math.min(1, this.snapshotTime / SNAPSHOT_INTERVAL);

    if (this.prevSnapshot && this.lastSnapshot) {
      const interp: Snapshot = {
        ...this.lastSnapshot,
        players: this.lastSnapshot.players.map((p) => {
          const prev = this.prevSnapshot!.players.find((q) => q.id === p.id);
          if (!prev) return p;
          return { ...p, x: prev.x + (p.x - prev.x) * alpha, y: prev.y + (p.y - prev.y) * alpha };
        }),
        enemies: this.lastSnapshot.enemies.map((e) => {
          const prev = this.prevSnapshot!.enemies.find((q) => q.id === e.id);
          if (!prev) return e;
          return { ...e, x: prev.x + (e.x - prev.x) * alpha, y: prev.y + (e.y - prev.y) * alpha };
        }),
        projectiles: this.lastSnapshot.projectiles.map((pr) => {
          const prev = this.prevSnapshot!.projectiles.find((q) => q.id === pr.id);
          if (!prev) return pr;
          return { ...pr, x: prev.x + (pr.x - prev.x) * alpha, y: prev.y + (pr.y - prev.y) * alpha };
        }),
      };
      this.world.applySnapshot(interp);
    } else if (this.lastSnapshot) {
      this.world.applySnapshot(this.lastSnapshot);
    }

    bridge.emit({ type: "snapshot", snapshot: this.world.snapshot() });
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
    }
  }

  /** Draw faint `+` marks across the given world-space rectangle. */
  private drawGrid(minX: number, minY: number, maxX: number, maxY: number): void {
    const g = this.gridGraphics;
    g.clear();
    g.lineStyle(1, GRID_COLOR, 1);
    const arm = 3; // half-length of each plus arm
    const startX = Math.floor(minX / GRID_SPACING) * GRID_SPACING;
    const startY = Math.floor(minY / GRID_SPACING) * GRID_SPACING;
    for (let x = startX; x <= maxX; x += GRID_SPACING) {
      for (let y = startY; y <= maxY; y += GRID_SPACING) {
        g.beginPath();
        g.moveTo(x - arm, y);
        g.lineTo(x + arm, y);
        g.moveTo(x, y - arm);
        g.lineTo(x, y + arm);
        g.strokePath();
      }
    }
  }

  /** Fill a rotated polygon from local-space points (tip points toward +x). */
  private fillPoly(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    pts: Array<[number, number]>,
    color: number,
    alpha: number,
  ): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const vecs = pts.map(([px, py]) =>
      new Phaser.Math.Vector2(x + px * cos - py * sin, y + px * sin + py * cos),
    );
    g.fillStyle(color, alpha);
    g.fillPoints(vecs, true);
  }

  private starPoints(inner: number, outer: number, spikes = 5): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = (i / (spikes * 2)) * Math.PI * 2;
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }

  /** Render a projectile using its weapon's visual shape (Stage 1). */
  private drawProjectileShape(
    g: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    angle: number,
    shape: ProjectileShape,
    color: number,
  ): void {
    const R = PROJECTILE_RADIUS;
    switch (shape) {
      case "circle":
        g.fillStyle(color, 1);
        g.fillCircle(x, y, R);
        break;
      case "square":
        g.fillStyle(color, 1);
        g.fillRect(x - R, y - R, R * 2, R * 2);
        break;
      case "triangle":
        this.fillPoly(g, x, y, angle, [[R * 1.4, 0], [-R * 0.8, R], [-R * 0.8, -R]], color, 1);
        break;
      case "diamond":
        this.fillPoly(g, x, y, angle, [[0, -R], [R, 0], [0, R], [-R, 0]], color, 1);
        break;
      case "rect":
        this.fillPoly(
          g,
          x,
          y,
          angle,
          [
            [R * 3, R * 0.55],
            [R * 3, -R * 0.55],
            [-R * 3, -R * 0.55],
            [-R * 3, R * 0.55],
          ],
          color,
          1,
        );
        break;
      case "star":
        this.fillPoly(g, x, y, angle, this.starPoints(R * 0.5, R * 1.4, 5), color, 1);
        break;
      case "spark":
        this.fillPoly(
          g,
          x,
          y,
          angle,
          [
            [R * 2.5, R * 0.4],
            [R * 2.5, -R * 0.4],
            [-R * 2.5, -R * 0.4],
            [-R * 2.5, R * 0.4],
          ],
          color,
          1,
        );
        break;
      default:
        g.fillStyle(color, 1);
        g.fillCircle(x, y, R);
        break;
    }
  }

  private render() {
    const g = this.renderGroup;
    g.clear();

    // Follow the server's auto-scrolling safe-zone camera (Stage 2).
    const cam = this.lastSnapshot?.camera;
    const camX = cam?.x ?? 0;
    const camY = cam?.y ?? 0;
    const camW = cam?.w ?? VIEW_WIDTH;
    const camH = cam?.h ?? VIEW_HEIGHT;
    this.cameras.main.scrollX = camX;
    this.cameras.main.scrollY = camY;

    // Re-anchor the grid to the visible camera region each frame.
    this.drawGrid(camX - GRID_SPACING, camY - GRID_SPACING, camX + camW + GRID_SPACING, camY + camH + GRID_SPACING);

    // Culling margin: skip entities well outside the safe zone.
    const MARGIN = 80;
    const inView = (x: number, y: number): boolean =>
      x >= camX - MARGIN && x <= camX + camW + MARGIN && y >= camY - MARGIN && y <= camY + camH + MARGIN;

    // Local player's per-weapon range indicators (Stage 1.6): one faint outer ring
    // per owned weapon at its max `range` (tinted to the weapon), plus a slightly
    // brighter inner `activationRange` ring where it actually acquires targets.
    if (this.localPlayerId) {
      const me = this.world.getPlayers().find((p) => p.id === this.localPlayerId);
      if (me && !me.downed && me.weapons.length > 0) {
        // Draw largest ranges first so smaller rings sit on top and stay legible.
        const ordered = [...me.weapons].sort(
          (a, b) => WEAPON_DEFS[b.kind].range - WEAPON_DEFS[a.kind].range,
        );
        for (const w of ordered) {
          const def = WEAPON_DEFS[w.kind];
          if (def.range > 0) {
            g.lineStyle(1, def.color, 0.16);
            g.strokeCircle(me.x, me.y, def.range);
          }
          if (def.activationRange > 0 && def.activationRange !== def.range) {
            g.lineStyle(1, def.color, 0.34);
            g.strokeCircle(me.x, me.y, def.activationRange);
          }
        }
      }
    }

    // Obstacles (per-wave field): blocks are solid, hazards glow red.
    for (const o of this.world.getObstacles()) {
      const ocx = o.shape === "circle" ? o.x : o.x + o.w / 2;
      const ocy = o.shape === "circle" ? o.y : o.y + o.h / 2;
      if (!inView(ocx, ocy)) continue;
      if (o.kind === "hazard") {
        g.fillStyle(OBSTACLE_HAZARD_COLOR, 0.28);
        g.lineStyle(2, OBSTACLE_HAZARD_COLOR, 0.9);
      } else {
        g.fillStyle(OBSTACLE_BLOCK_COLOR, 0.9);
        g.lineStyle(2, 0x202024, 0.9);
      }
      if (o.shape === "circle") {
        g.fillCircle(o.x, o.y, o.radius);
        g.strokeCircle(o.x, o.y, o.radius);
      } else {
        g.fillRect(o.x, o.y, o.w, o.h);
        g.strokeRect(o.x, o.y, o.w, o.h);
      }
    }

    // Damage zones (drawn under everything): telegraph vs active
    for (const z of this.world.getZones()) {
      if (!inView(z.x, z.y)) continue;
      if (z.ownerId) {
        // Stage 3 dash trail: friendly zone that damages enemies.
        g.fillStyle(z.color, 0.28);
        g.fillCircle(z.x, z.y, z.radius);
        g.lineStyle(2, z.color, 0.9);
        g.strokeCircle(z.x, z.y, z.radius);
        continue;
      }
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
      if (!inView(b.x, b.y)) continue;
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

    // Health packs: green cross walk-over pickups.
    for (const pk of this.world.getPickups()) {
      if (!inView(pk.x, pk.y)) continue;
      g.fillStyle(HEALTH_PACK_COLOR, 0.18);
      g.fillCircle(pk.x, pk.y, HEALTH_PACK_RADIUS + 4);
      g.fillStyle(HEALTH_PACK_COLOR, 1);
      const t = 3;
      const a = HEALTH_PACK_RADIUS;
      g.fillRect(pk.x - a, pk.y - t, a * 2, t * 2);
      g.fillRect(pk.x - t, pk.y - a, t * 2, a * 2);
    }

    // Projectiles (orbiting drawn first so they sit under flying projectiles)
    for (const pr of this.world.getProjectiles()) {
      if (!inView(pr.x, pr.y)) continue;
      if (pr.weaponKind === "mine") {
        g.fillStyle(pr.color, 0.95);
        g.fillCircle(pr.x, pr.y, 6);
        g.lineStyle(2, 0x000000, 0.5);
        g.strokeCircle(pr.x, pr.y, 6);
        g.lineStyle(1, pr.color, 0.4);
        g.strokeCircle(pr.x, pr.y, MINE_TRIGGER_RANGE);
        continue;
      }
      this.drawProjectileShape(g, pr.x, pr.y, pr.angle, pr.shape, pr.color);
      if (pr.hostile) {
        g.lineStyle(2, 0xef4444, 0.9);
        g.strokeCircle(pr.x, pr.y, PROJECTILE_RADIUS + 2);
      }
    }

    // Enemies
    for (const e of this.world.getEnemies()) {
      if (!inView(e.x, e.y)) continue;
      const def = ENEMY_DEFS[e.kind] ?? ENEMY_DEFS[1];
      const r = def.radius;
      g.fillStyle(def.color, 1);
      g.fillCircle(e.x, e.y, r);
      g.lineStyle(2, 0x000000, 0.45);
      g.strokeCircle(e.x, e.y, r);
      if (def.ranged) {
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
      // Shield ring (defensive item): brighter as it absorbs more.
      if (p.shieldHp > 0) {
        const sFrac = Math.max(0, Math.min(1, p.shieldHp / p.maxShield));
        g.lineStyle(2, 0x7dd3fc, 0.4 + sFrac * 0.5);
        g.strokeCircle(p.x, p.y, PLAYER_RADIUS + 5);
      }
      const baseColor = p.downed ? 0x56565d : p.color;
      g.fillStyle(baseColor, 1);
      g.fillCircle(p.x, p.y, PLAYER_RADIUS);
      g.lineStyle(2, 0xffffff, 0.6);
      g.strokeCircle(p.x, p.y, PLAYER_RADIUS);
      if (p.downed) {
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

    // --- Void edge (Stage 2): the safe-zone boundary. Brighter/red when the
    // local player is outside it (taking void damage). ---
    let localOff = false;
    if (this.localPlayerId) {
      const me = this.world.getPlayers().find((p) => p.id === this.localPlayerId);
      if (me) {
        localOff =
          me.x < camX || me.x > camX + camW || me.y < camY || me.y > camY + camH;
      }
    }
    g.lineStyle(localOff ? 5 : 3, localOff ? 0xef4444 : 0x3a1d1d, localOff ? 0.85 : 0.55);
    g.strokeRect(camX, camY, camW, camH);
    // Inner hazard glow when outside.
    if (localOff) {
      g.lineStyle(1, 0xef4444, 0.25);
      g.strokeRect(camX + 6, camY + 6, camW - 12, camH - 12);
    }

    // --- Off-screen buddy arrow: point toward the partner if they're outside
    // the safe zone, so you can regroup before the void kills them. ---
    if (this.localPlayerId) {
      const partner = this.world.getPlayers().find((p) => p.id !== this.localPlayerId);
      if (partner && (partner.x < camX || partner.x > camX + camW || partner.y < camY || partner.y > camY + camH)) {
        const ccx = camX + camW / 2;
        const ccy = camY + camH / 2;
        const dx = partner.x - ccx;
        const dy = partner.y - ccy;
        const halfW = camW / 2 - 18;
        const halfH = camH / 2 - 18;
        const t = Math.min(
          dx > 0 ? halfW / dx : dx < 0 ? -halfW / dx : Infinity,
          dy > 0 ? halfH / dy : dy < 0 ? -halfH / dy : Infinity,
        );
        const ex = ccx + dx * t;
        const ey = ccy + dy * t;
        const ang = Math.atan2(dy, dx);
        // Dark backing triangle for contrast, then the colored arrowhead on top.
        this.fillPoly(
          g,
          ex,
          ey,
          ang,
          [
            [15, 0],
            [-9, 9],
            [-9, -9],
          ],
          0x000000,
          0.6,
        );
        this.fillPoly(
          g,
          ex,
          ey,
          ang,
          [
            [12, 0],
            [-8, 7],
            [-8, -7],
          ],
          partner.color,
          0.95,
        );
      }
    }
  }
}
