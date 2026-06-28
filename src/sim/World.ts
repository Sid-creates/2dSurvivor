// Pure world simulation. No Phaser, no DOM, no rendering. Just state and a
// step(dt, inputs) function. Host-authoritative per ADR 0002.
//
// This file is intentionally framework-free so the same sim could run headless
// (for tests or a dedicated server) without modification.

import type {
  PlayerState,
  EnemyState,
  ProjectileState,
  BoxState,
  ZoneState,
  ObstacleState,
  PickupState,
  Snapshot,
  PlayerInput,
  WeaponPickOption,
  RunStatus,
} from "../shared/types";
import type { WeaponKind } from "./weapons";
import {
  WEAPON_DEFS,
  ALL_WEAPON_KINDS,
  MAX_WEAPONS,
  MAX_WEAPON_LEVEL,
} from "./weapons";
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_MAX_HP,
  PLAYER_MAX_MANA,
  PLAYER_MANA_REGEN,
  PLAYER_MAX_SPEED,
  PLAYER_ACCEL,
  PLAYER_DECEL,
  PLAYER_COLORS,
  SIM_DT,
  SWAP_MANA_COST,
  SWAP_CHARGE_DURATION,
  SWAP_I_FRAMES,
  RUN_DURATION,
  ENEMY_RADIUS,
  ENEMY_SPAWN_INTERVAL,
  ENEMY_COLOR,
  ENEMY_DEFS,
  EnemyDef,
  BOSS_BASE_HP,
  BOSS_HP_PER_TIER,
  CASTER_FIRE_INTERVAL,
  CASTER_PREF_RANGE,
  CASTER_FIRE_RANGE,
  ENEMY_PROJ_SPEED,
  ENEMY_PROJ_DAMAGE,
  ENEMY_PROJ_LIFETIME,
  BOSS_ZONE_INTERVAL,
  BOSS_SUMMON_INTERVAL,
  BOSS_SUMMON_COUNT,
  ZONE_TELEGRAPH,
  ZONE_DURATION,
  ZONE_RADIUS,
  ZONE_DPS,
  ZONE_COLOR,
  FROST_SLOW_DURATION,
  FROST_SLOW_FACTOR,
  MINE_ARM_TIME,
  MINE_TRIGGER_RANGE,
  MINE_BLAST_RADIUS,
  MINE_LIFETIME,
  CHAIN_RANGE,
  HOMING_TURN_RATE,
  ENEMY_CAP,
  PROJECTILE_RADIUS,
  AUTO_ATTACK_RANGE,
  BOX_RADIUS,
  BOX_COLOR,
  BOX_OPEN_RANGE,
  BOX_DROP_CHANCE,
  BOSS_DROP_CHANCE,
  REVIVE_RANGE,
  REVIVE_DURATION,
  ORBIT_RADIUS,
  ORBIT_ANGULAR_SPEED,
  DASH_SPEED,
  DASH_DURATION,
  DASH_COOLDOWN,
  DASH_I_FRAMES,
  PLAYER_MAX_SHIELD,
  SHIELD_PER_PICKUP,
  OBSTACLE_BLOCK_COLOR,
  OBSTACLE_HAZARD_COLOR,
  OBSTACLE_HAZARD_DPS,
  OBSTACLE_BLOCK_MARGIN,
  OBSTACLE_COUNT_BASE,
  OBSTACLE_HAZARD_CHANCE,
  HEALTH_PACK_HEAL,
  HEALTH_PACK_SPAWN_INTERVAL,
  HEALTH_PACK_RADIUS,
  HEALTH_PACK_COLOR,
  HEALTH_PACK_DROP_CHANCE,
  HEALTH_PACK_PICKUP_RANGE,
  DPS_WINDOW_SECONDS,
} from "../shared/config";

interface InternalWeapon {
  kind: WeaponKind;
  level: number;
  cooldown: number;
  orbitPhase: number;
}

interface InternalPlayer extends PlayerState {
  /** Local input from Guest (host has it directly). */
  bufferedInput: PlayerInput;
  weapons: InternalWeapon[];
  /** Pending interaction request (press E on a box). */
  pendingOpenBoxId: number | null;
  reviveProgress: number;
  /** Last non-zero movement direction, used to orient a dash with no input. */
  facingX: number;
  facingY: number;
  /** Rolling DPS samples: [time, damage] pairs within DPS_WINDOW_SECONDS. */
  damageLog: Array<[number, number]>;
  /** Accumulated damage within the rolling window since last DPS recompute. */
  damageAccum: number;
  damageWindowStart: number;
}

interface InternalEnemy extends EnemyState {
  vx: number;
  vy: number;
  attackCd: number; // ranged/boss attack cooldown
  slowTimer: number; // frost slow remaining
}

interface InternalProjectile extends ProjectileState {
  lifetime: number;
  /** For mines: seconds until armed. */
  armTimer: number;
  /** Damage carried for this projectile (not on the wire type). */
  damage: number;
  /** For homing: current heading. */
  angle: number;
}

interface InternalZone {
  id: number;
  x: number;
  y: number;
  radius: number;
  telegraph: number;
  active: boolean;
  duration: number;
  dps: number;
  color: number;
}

interface InternalBox {
  id: number;
  x: number;
  y: number;
  opened: boolean;
  openerId: string | null;
  options: WeaponPickOption[] | null;
}

interface InternalObstacle {
  id: number;
  kind: "block" | "hazard";
  shape: "rect" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  color: number;
}

interface InternalPickup {
  id: number;
  x: number;
  y: number;
  kind: "health";
}

let nextEnemyId = 1;
let nextProjectileId = 1;
let nextBoxId = 1;
let nextZoneId = 1;
let nextObstacleId = 1;
let nextPickupId = 1;

function makePlayer(id: string, color: number, x: number, y: number): InternalPlayer {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: PLAYER_MAX_HP,
    maxHp: PLAYER_MAX_HP,
    mana: PLAYER_MAX_MANA,
    maxMana: PLAYER_MAX_MANA,
    shieldHp: 0,
    maxShield: PLAYER_MAX_SHIELD,
    charging: false,
    chargeProgress: 0,
    iFrames: 0,
    dashCooldown: 0,
    dashTime: 0,
    dps: 0,
    downed: false,
    reviveProgress: 0,
    color,
    bufferedInput: { mx: 0, my: 0, charging: false, dashPressed: false },
    weapons: [{ kind: "pulse", level: 1, cooldown: 0, orbitPhase: 0 }],
    pendingOpenBoxId: null,
    facingX: 1,
    facingY: 0,
    damageLog: [],
    damageAccum: 0,
    damageWindowStart: 0,
  };
}

function damageFor(w: InternalWeapon): number {
  const def = WEAPON_DEFS[w.kind];
  // Tuned down (Phase B): 0.25 per level instead of 0.35 so kills take longer.
  return def.baseDamage * (1 + (w.level - 1) * 0.25);
}

function intervalFor(w: InternalWeapon): number {
  const def = WEAPON_DEFS[w.kind];
  return def.baseInterval * Math.pow(0.9, w.level - 1);
}

function countFor(w: InternalWeapon): number {
  const def = WEAPON_DEFS[w.kind];
  return def.projectileCount + Math.floor((w.level - 1) / 2);
}

export class World {
  private players: Map<string, InternalPlayer> = new Map();
  private enemies: Map<number, InternalEnemy> = new Map();
  private projectiles: Map<number, InternalProjectile> = new Map();
  private boxes: Map<number, InternalBox> = new Map();
  private zones: Map<number, InternalZone> = new Map();
  private obstacles: Map<number, InternalObstacle> = new Map();
  private pickups: Map<number, InternalPickup> = new Map();
  private tick = 0;
  private time = 0;
  private wave = 1;
  private waveTimer = 60;
  private isBossWave = false;
  private bossTimer = 0;
  private enemySpawnCooldown = ENEMY_SPAWN_INTERVAL;
  private healthPackCooldown = HEALTH_PACK_SPAWN_INTERVAL;
  private runStatus: RunStatus = "playing";

  addHostPlayer(id: string): void {
    if (this.players.has(id)) return;
    const p = makePlayer(id, PLAYER_COLORS.host, WORLD_WIDTH * 0.35, WORLD_HEIGHT * 0.5);
    this.players.set(id, p);
  }

  addGuestPlayer(id: string): void {
    if (this.players.has(id)) return;
    const p = makePlayer(id, PLAYER_COLORS.guest, WORLD_WIDTH * 0.65, WORLD_HEIGHT * 0.5);
    this.players.set(id, p);
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  getPlayerIds(): string[] {
    return [...this.players.keys()];
  }

  setPlayerInput(id: string, input: PlayerInput): void {
    const p = this.players.get(id);
    if (!p || p.downed) return;
    p.bufferedInput = input;
  }

  setLocalInput(id: string, input: PlayerInput): void {
    this.setPlayerInput(id, input);
  }

  /** Shield absorbs first; remainder hits HP. Centralizes the downed transition. */
  private applyDamage(p: InternalPlayer, amount: number): void {
    if (p.iFrames > 0 || p.downed) return;
    let remaining = amount;
    if (p.shieldHp > 0) {
      const absorbed = Math.min(p.shieldHp, remaining);
      p.shieldHp -= absorbed;
      remaining -= absorbed;
    }
    if (remaining > 0) {
      p.hp -= remaining;
      if (p.hp <= 0) {
        p.hp = 0;
        p.downed = true;
        p.bufferedInput = { mx: 0, my: 0, charging: false, dashPressed: false };
        p.chargeProgress = 0;
        p.charging = false;
        p.dashTime = 0;
      }
    }
  }

  /** Attribute outgoing damage to a player for the DPS meter. */
  private recordDamage(ownerId: string, amount: number): void {
    const p = this.players.get(ownerId);
    if (!p) return;
    p.damageAccum += amount;
    p.damageLog.push([this.time, amount]);
  }

  /** Recompute each player's rolling-window DPS, pruning stale samples. */
  private updateDps(): void {
    const cutoff = this.time - DPS_WINDOW_SECONDS;
    for (const p of this.players.values()) {
      if (p.damageLog.length > 0) {
        // Drop samples older than the window.
        while (p.damageLog.length > 0 && p.damageLog[0][0] < cutoff) {
          p.damageLog.shift();
        }
      }
      let sum = 0;
      for (const [, dmg] of p.damageLog) sum += dmg;
      p.dps = sum / DPS_WINDOW_SECONDS;
      p.damageAccum = 0;
    }
  }

  /** Mark that a player wants to open the nearest box this frame. */
  requestOpenBox(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p || p.downed) return;
    const box = this.nearestBoxInRange(p.x, p.y, BOX_OPEN_RANGE);
    p.pendingOpenBoxId = box?.id ?? null;
  }

  private nearestBoxInRange(x: number, y: number, range: number): InternalBox | null {
    let best: InternalBox | null = null;
    let bestDist = range * range;
    for (const b of this.boxes.values()) {
      // Skip opened boxes and boxes someone else is already interacting with,
      // so a second player can't steal / re-target a claimed box.
      if (b.opened || b.openerId !== null) continue;
      const dx = b.x - x;
      const dy = b.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        best = b;
        bestDist = d2;
      }
    }
    return best;
  }

  /** Apply a box-open intent (sent from either Host or Guest via bridge/net). */
  openBox(boxId: number, playerId: string): void {
    const box = this.boxes.get(boxId);
    const player = this.players.get(playerId);
    if (!box || box.opened || !player || player.downed) return;
    // If a player is already inside a box menu somewhere, ignore the second
    if ([...this.boxes.values()].some((b) => b.openerId === playerId)) return;
    box.openerId = playerId;
    box.options = this.rollBoxOptions(player);
  }

  /** Apply a player's choice from the box menu. */
  chooseBoxOption(boxId: number, playerId: string, optionIndex: number): void {
    const box = this.boxes.get(boxId);
    const player = this.players.get(playerId);
    if (!box || !box.options || box.openerId !== playerId || !player) return;
    const option = box.options[optionIndex];
    if (!option) return;

    // Heal sentinel (resultingLevel === 0): restore HP and close the box.
    if (option.resultingLevel === 0) {
      player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.3);
      box.opened = true;
      box.options = null;
      box.openerId = null;
      this.boxes.delete(boxId);
      return;
    }

    // Shield defensive item (option.shield set): top up the absorb layer.
    if (option.shield !== undefined) {
      player.shieldHp = Math.min(player.maxShield, player.shieldHp + option.shield);
      box.opened = true;
      box.options = null;
      box.openerId = null;
      this.boxes.delete(boxId);
      return;
    }

    if (option.upgradeIndex >= 0 && option.upgradeIndex < player.weapons.length) {
      // Upgrade existing weapon
      player.weapons[option.upgradeIndex].level = Math.min(
        MAX_WEAPON_LEVEL,
        player.weapons[option.upgradeIndex].level + 1,
      );
    } else if (player.weapons.length < MAX_WEAPONS) {
      // Add new weapon
      player.weapons.push({
        kind: option.kind,
        level: 1,
        cooldown: 0,
        orbitPhase: 0,
      });
    }
    box.opened = true;
    box.options = null;
    box.openerId = null;
    // Remove box from world after a short delay (next step removes opened boxes)
    this.boxes.delete(boxId);
  }

  /** Player cancelled their box menu without choosing. */
  cancelBox(boxId: number, playerId: string): void {
    const box = this.boxes.get(boxId);
    if (!box || box.openerId !== playerId) return;
    box.openerId = null;
    box.options = null;
  }

  private rollBoxOptions(player: InternalPlayer): WeaponPickOption[] {
    const pool: WeaponKind[] = [...ALL_WEAPON_KINDS];
    const options: WeaponPickOption[] = [];
    const usedKinds = new Set<WeaponKind>();

    // For each of 3 options, prefer upgrades to existing weapons if possible,
    // otherwise offer new weapons.
    for (let i = 0; i < 3; i++) {
      const candidates: WeaponPickOption[] = [];

      // Upgrade candidates: any owned weapon not at max level
      for (let idx = 0; idx < player.weapons.length; idx++) {
        const w = player.weapons[idx];
        if (w.level >= MAX_WEAPON_LEVEL) continue;
        if (usedKinds.has(w.kind)) continue;
        candidates.push({
          kind: w.kind,
          upgradeIndex: idx,
          resultingLevel: w.level + 1,
        });
      }

      // New weapon candidates: any weapon kind not yet owned, if loadout has room
      if (player.weapons.length < MAX_WEAPONS) {
        for (const kind of pool) {
          if (usedKinds.has(kind)) continue;
          if (player.weapons.some((w) => w.kind === kind)) continue;
          candidates.push({
            kind,
            upgradeIndex: -1,
            resultingLevel: 1,
          });
        }
      }

      // Defensive option: a shield top-up. Offered sometimes so it competes with
      // weapons but doesn't dominate. Only meaningful while below max shield.
      if (player.shieldHp < player.maxShield && Math.random() < 0.45) {
        candidates.push({
          kind: "pulse", // placeholder kind; `shield` flag makes the client render it as a shield
          upgradeIndex: -1,
          resultingLevel: -1, // -1 = shield sentinel (distinct from 0 = heal, >=1 = weapon)
          shield: SHIELD_PER_PICKUP,
        });
      }

      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      if (pick.shield === undefined) usedKinds.add(pick.kind);
      options.push(pick);
    }

    // Edge case: maxed loadout, all weapons at max level (no upgrades available)
    if (options.length === 0) {
      // Offer a "heal" stand-in (we represent this as pulse upgrade level stays same)
      // For simplicity, give the player a small instant heal by treating it as a no-op
      // and closing the box. We handle this as a special "heal" option.
      options.push({
        kind: "pulse",
        upgradeIndex: -1,
        resultingLevel: 0, // 0 = heal sentinel
      });
    }

    return options;
  }

  spawnBox(x: number, y: number): void {
    const id = nextBoxId++;
    this.boxes.set(id, { id, x, y, opened: false, openerId: null, options: null });
  }

  step(dt: number = SIM_DT): void {
    if (this.runStatus !== "playing") return;
    this.tick++;
    this.time += dt;
    this.waveTimer = Math.max(0, this.waveTimer - dt);
    if (this.bossTimer > 0) this.bossTimer = Math.max(0, this.bossTimer - dt);

    // Boss waves end the moment the boss dies (not when the timer runs out).
    if (this.isBossWave) {
      if (!this.bossAlive()) {
        this.advanceWave();
      }
    } else if (this.waveTimer <= 0) {
      this.advanceWave();
    }

    // Run timer win check
    if (this.time >= RUN_DURATION) {
      this.runStatus = "won";
      return;
    }

    this.processPendingBoxOpens();
    this.updatePlayers(dt);
    this.updateSpawns(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateZones(dt);
    this.updateObstacles(dt);
    this.updatePickups(dt);
    this.resolveCombat(dt);
    this.updateRevive(dt);
    this.updateDps();
    this.checkLossCondition();
  }

  private bossAlive(): boolean {
    for (const e of this.enemies.values()) {
      if (e.kind === 2) return true;
    }
    return false;
  }

  private processPendingBoxOpens(): void {
    for (const p of this.players.values()) {
      if (p.pendingOpenBoxId !== null && !p.downed) {
        // Only host actually mutates box state; this method is host-only
        this.openBox(p.pendingOpenBoxId, p.id);
        p.pendingOpenBoxId = null;
      }
    }
  }

  private advanceWave(): void {
    this.wave++;
    this.waveTimer = 60;
    this.isBossWave = this.wave % 5 === 0;
    if (this.isBossWave) {
      this.bossTimer = 30;
      this.spawnBoss();
    }
    // Per-wave obstacle field: clear the old layout and generate a fresh one.
    this.obstacles.clear();
    if (!this.isBossWave) {
      this.generateObstacles(this.wave);
    }
  }

  /** Seed an obstacle layout for the wave. Deterministic-ish variety per wave. */
  private generateObstacles(wave: number): void {
    const count = OBSTACLE_COUNT_BASE + Math.floor(wave / 3);
    const margin = OBSTACLE_BLOCK_MARGIN;
    const minX = margin;
    const maxX = WORLD_WIDTH - margin;
    const minY = margin;
    const maxY = WORLD_HEIGHT - margin;
    // Seeded RNG so a wave looks the same to both clients within a run, but
    // varies across waves. (Host is authoritative; this just shapes the layout.)
    let seed = wave * 2654435761;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < count; i++) {
      const isHazard = rand() < OBSTACLE_HAZARD_CHANCE;
      const shape: "rect" | "circle" = rand() < 0.5 ? "rect" : "circle";
      const id = nextObstacleId++;
      if (shape === "circle") {
        const radius = 26 + rand() * 30;
        this.obstacles.set(id, {
          id,
          kind: isHazard ? "hazard" : "block",
          shape,
          x: minX + rand() * (maxX - minX),
          y: minY + rand() * (maxY - minY),
          w: 0,
          h: 0,
          radius,
          color: isHazard ? OBSTACLE_HAZARD_COLOR : OBSTACLE_BLOCK_COLOR,
        });
      } else {
        const w = 40 + rand() * 70;
        const h = 40 + rand() * 70;
        this.obstacles.set(id, {
          id,
          kind: isHazard ? "hazard" : "block",
          shape,
          x: minX + rand() * (maxX - minX),
          y: minY + rand() * (maxY - minY),
          w,
          h,
          radius: 0,
          color: isHazard ? OBSTACLE_HAZARD_COLOR : OBSTACLE_BLOCK_COLOR,
        });
      }
    }
  }

  /** Push a circle (player/enemy) out of a rect/circle obstacle. Returns true if it collided. */
  private collideObstacle(
    x: number,
    y: number,
    r: number,
  ): { x: number; y: number; hit: InternalObstacle | null } {
    let nx = x;
    let ny = y;
    let hit: InternalObstacle | null = null;
    for (const ob of this.obstacles.values()) {
      if (ob.kind !== "block") continue;
      if (ob.shape === "circle") {
        const dx = nx - ob.x;
        const dy = ny - ob.y;
        const minDist = r + ob.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 < minDist * minDist && d2 > 0) {
          const d = Math.sqrt(d2);
          nx = ob.x + (dx / d) * minDist;
          ny = ob.y + (dy / d) * minDist;
          hit = ob;
        }
      } else {
        // Closest point on rect to the circle center.
        const cx = Math.max(ob.x, Math.min(nx, ob.x + ob.w));
        const cy = Math.max(ob.y, Math.min(ny, ob.y + ob.h));
        const dx = nx - cx;
        const dy = ny - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0) {
            const d = Math.sqrt(d2);
            nx = cx + (dx / d) * r;
            ny = cy + (dy / d) * r;
          } else {
            // Center inside the rect: push out along the smallest penetration axis.
            const left = nx - ob.x;
            const right = ob.x + ob.w - nx;
            const top = ny - ob.y;
            const bottom = ob.y + ob.h - ny;
            const m = Math.min(left, right, top, bottom);
            if (m === left) nx = ob.x - r;
            else if (m === right) nx = ob.x + ob.w + r;
            else if (m === top) ny = ob.y - r;
            else ny = ob.y + ob.h + r;
          }
          hit = ob;
        }
      }
    }
    return { x: nx, y: ny, hit };
  }

  private updateObstacles(dt: number): void {
    // Hazard obstacles deal damage like standing in a zone (no telegraph).
    for (const ob of this.obstacles.values()) {
      if (ob.kind !== "hazard") continue;
      for (const p of this.players.values()) {
        if (p.downed || p.iFrames > 0) continue;
        const inside =
          ob.shape === "circle"
            ? (p.x - ob.x) ** 2 + (p.y - ob.y) ** 2 <= ob.radius * ob.radius
            : p.x >= ob.x && p.x <= ob.x + ob.w && p.y >= ob.y && p.y <= ob.y + ob.h;
        if (inside) this.applyDamage(p, OBSTACLE_HAZARD_DPS * dt);
      }
    }
  }

  private updatePickups(dt: number): void {
    // Periodic health pack spawn.
    this.healthPackCooldown -= dt;
    if (this.healthPackCooldown <= 0) {
      this.healthPackCooldown = HEALTH_PACK_SPAWN_INTERVAL;
      this.spawnHealthPack();
    }
    // Walk-over pickup.
    for (const [id, pk] of [...this.pickups]) {
      for (const p of this.players.values()) {
        if (p.downed) continue;
        const dx = p.x - pk.x;
        const dy = p.y - pk.y;
        if (dx * dx + dy * dy <= HEALTH_PACK_PICKUP_RANGE * HEALTH_PACK_PICKUP_RANGE) {
          if (p.hp < p.maxHp) {
            p.hp = Math.min(p.maxHp, p.hp + HEALTH_PACK_HEAL);
            this.pickups.delete(id);
            break;
          }
        }
      }
    }
  }

  private spawnHealthPack(x?: number, y?: number): void {
    const id = nextPickupId++;
    const px = x ?? (60 + Math.random() * (WORLD_WIDTH - 120));
    const py = y ?? (60 + Math.random() * (WORLD_HEIGHT - 120));
    this.pickups.set(id, { id, x: px, y: py, kind: "health" });
  }

  private spawnBoss(): void {
    const id = nextEnemyId++;
    const tier = Math.floor(this.wave / 5); // 1 at wave 5, 2 at wave 10, ...
    this.enemies.set(id, {
      id,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT * 0.25,
      hp: BOSS_BASE_HP + (tier - 1) * BOSS_HP_PER_TIER,
      kind: 2,
      vx: 0,
      vy: 0,
      attackCd: BOSS_ZONE_INTERVAL,
      slowTimer: 0,
    });
  }

  private updatePlayers(dt: number): void {
    for (const p of this.players.values()) {
      if (p.iFrames > 0) p.iFrames = Math.max(0, p.iFrames - dt);
      if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      if (p.dashTime > 0) p.dashTime = Math.max(0, p.dashTime - dt);

      // Mana regen always
      if (p.mana < p.maxMana) {
        p.mana = Math.min(p.maxMana, p.mana + PLAYER_MANA_REGEN * dt);
      }

      if (p.downed) continue;

      // If this player is currently in a box menu, freeze input
      const inBoxMenu = [...this.boxes.values()].some((b) => b.openerId === p.id);
      const input = inBoxMenu
        ? { mx: 0, my: 0, charging: false, dashPressed: false }
        : p.bufferedInput;

      // Dash: edge-triggered, costs no mana, grants brief i-frames. No dash while
      // downed (handled above) or still on cooldown.
      if (input.dashPressed && p.dashCooldown <= 0 && p.dashTime <= 0) {
        let dx = input.mx;
        let dy = input.my;
        if (dx === 0 && dy === 0) {
          dx = p.facingX;
          dy = p.facingY;
        }
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        p.facingX = dx;
        p.facingY = dy;
        p.vx = dx * DASH_SPEED;
        p.vy = dy * DASH_SPEED;
        p.dashTime = DASH_DURATION;
        p.dashCooldown = DASH_COOLDOWN;
        p.iFrames = Math.max(p.iFrames, DASH_I_FRAMES);
      }

      const moving = input.mx !== 0 || input.my !== 0;
      if (moving) {
        const len = Math.hypot(input.mx, input.my) || 1;
        const nx = input.mx / len;
        const ny = input.my / len;
        p.facingX = nx;
        p.facingY = ny;
      }

      if (p.dashTime > 0) {
        // During the dash burst, maintain dash velocity (ignore accel/decel).
      } else if (moving) {
        p.vx += p.facingX * PLAYER_ACCEL * dt;
        p.vy += p.facingY * PLAYER_ACCEL * dt;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > PLAYER_MAX_SPEED) {
          p.vx = (p.vx / speed) * PLAYER_MAX_SPEED;
          p.vy = (p.vy / speed) * PLAYER_MAX_SPEED;
        }
      } else {
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > 0) {
          const decel = PLAYER_DECEL * dt;
          if (speed <= decel) {
            p.vx = 0;
            p.vy = 0;
          } else {
            p.vx -= (p.vx / speed) * decel;
            p.vy -= (p.vy / speed) * decel;
          }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const r = PLAYER_RADIUS;
      p.x = Math.max(r, Math.min(WORLD_WIDTH - r, p.x));
      p.y = Math.max(r, Math.min(WORLD_HEIGHT - r, p.y));

      // Solid block obstacles push the player out.
      const col = this.collideObstacle(p.x, p.y, r);
      if (col.hit) {
        p.x = col.x;
        p.y = col.y;
        // Kill velocity into the wall so we don't stick vibrating against it.
        p.vx *= 0.2;
        p.vy *= 0.2;
      }

      // Swap charge progression (ADR 0001: both must charge to fire)
      p.charging = input.charging && p.mana >= SWAP_MANA_COST;
      if (p.charging) {
        p.chargeProgress = Math.min(1, p.chargeProgress + dt / SWAP_CHARGE_DURATION);
      } else {
        p.chargeProgress = 0;
      }

      // Weapon firing
      for (const w of p.weapons) {
        w.cooldown -= dt;
        if (w.kind === "orbit") {
          w.orbitPhase += ORBIT_ANGULAR_SPEED * dt;
          continue;
        }
        if (w.cooldown <= 0) {
          this.fireWeapon(p, w);
          w.cooldown = intervalFor(w);
        }
      }
    }

    // Spawn / refresh orbit projectiles for any player with an orbit weapon
    this.refreshOrbitProjectiles();

    // Swap resolution: ADR 0001.
    this.tryResolveSwap();
  }

  private refreshOrbitProjectiles(): void {
    for (const p of this.players.values()) {
      if (p.downed) continue;
      for (const w of p.weapons) {
        if (w.kind !== "orbit") continue;
        const def = WEAPON_DEFS[w.kind];
        const want = countFor(w);
        // Find existing orbit projectiles for this owner + weapon kind
        const existing = [...this.projectiles.values()].filter(
          (pr) => pr.ownerId === p.id && pr.orbit && pr.weaponKind === w.kind,
        );
        // Remove extras
        while (existing.length > want) {
          const extra = existing.pop()!;
          this.projectiles.delete(extra.id);
        }
        // Add missing
        while (existing.length < want) {
          const id = nextProjectileId++;
          this.projectiles.set(id, {
            id,
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            ownerId: p.id,
            color: def.color,
            piercing: true,
            lifetime: 999, // persists until weapon removed or player downed
            orbit: true,
            orbitOffset: (existing.length / want) * Math.PI * 2,
            weaponKind: w.kind,
            hostile: false,
            armTimer: 0,
            damage: damageFor(w),
            angle: 0,
          });
          existing.push({
            id,
            x: p.x,
            y: p.y,
            vx: 0,
            vy: 0,
            ownerId: p.id,
            color: def.color,
            piercing: true,
            lifetime: 999,
            orbit: true,
            orbitOffset: (existing.length / want) * Math.PI * 2,
            weaponKind: w.kind,
            hostile: false,
            armTimer: 0,
            damage: damageFor(w),
            angle: 0,
          });
        }
      }
    }
    // Also remove orbit projectiles whose owner is downed or no longer has the weapon
    for (const [id, pr] of [...this.projectiles]) {
      if (!pr.orbit) continue;
      const owner = this.players.get(pr.ownerId);
      if (!owner || owner.downed || !owner.weapons.some((w) => w.kind === pr.weaponKind)) {
        this.projectiles.delete(id);
      }
    }
  }

  private fireWeapon(p: InternalPlayer, w: InternalWeapon): void {
    const def = WEAPON_DEFS[w.kind];
    if (def.orbit) return; // orbit handled separately

    const count = countFor(w);
    const dmg = damageFor(w);

    if (w.kind === "nova") {
      // Radial burst
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        this.spawnProjectile(p, w, def.color, dmg, angle, def.projectileSpeed, def.projectileLifetime, def.piercing);
      }
      return;
    }

    if (w.kind === "mine") {
      // Drop stationary mines around the player
      for (let i = 0; i < count; i++) {
        const spread = count > 1 ? (i - (count - 1) / 2) * 26 : 0;
        const ang = Math.random() * Math.PI * 2;
        const off = 18 + Math.random() * 14;
        const mx = p.x + Math.cos(ang) * off + spread;
        const my = p.y + Math.sin(ang) * off;
        this.spawnMine(p, w, def.color, dmg, mx, my);
      }
      return;
    }

    if (w.kind === "chain") {
      this.fireChain(p, w, count, dmg);
      return;
    }

    // Aimed weapons (pulse/spread/lance/frost/homing): target nearest enemy in range
    const target = this.findNearestEnemy(p.x, p.y, def.range);
    if (!target) return;

    const baseAngle = Math.atan2(target.y - p.y, target.x - p.x);
    for (let i = 0; i < count; i++) {
      const offset = def.spread === 0
        ? 0
        : (i - (count - 1) / 2) * (def.spread / Math.max(1, count - 1));
      const angle = baseAngle + offset;
      this.spawnProjectile(p, w, def.color, dmg, angle, def.projectileSpeed, def.projectileLifetime, def.piercing);
    }
  }

  private fireChain(p: InternalPlayer, w: InternalWeapon, links: number, dmg: number): void {
    const def = WEAPON_DEFS[w.kind];
    let from = { x: p.x, y: p.y };
    let current = this.findNearestEnemy(from.x, from.y, def.range);
    if (!current) return;
    const hit = new Set<number>();
    let damage = dmg;
    for (let i = 0; i < links && current; i++) {
      hit.add(current.id);
      const applied = Math.min(damage, current.hp + damage); // cap at the HP the enemy actually had
      current.hp -= damage;
      this.recordDamage(p.id, applied);
      if (current.hp <= 0) {
        const eid = current.id;
        this.enemies.delete(eid);
        if (Math.random() < BOX_DROP_CHANCE) this.spawnBox(current.x, current.y);
        if (Math.random() < HEALTH_PACK_DROP_CHANCE) this.spawnHealthPack(current.x, current.y);
      }
      // Visual spark from `from` to current
      this.spawnSpark(def.color, from.x, from.y, current.x, current.y);
      from = { x: current.x, y: current.y };
      damage *= 0.75;
      current = this.findNearestEnemyExcluding(from.x, from.y, CHAIN_RANGE, hit);
    }
  }

  private spawnSpark(color: number, x0: number, y0: number, x1: number, y1: number): void {
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const id = nextProjectileId++;
    this.projectiles.set(id, {
      id,
      x: x0,
      y: y0,
      vx: Math.cos(angle) * Math.max(400, dist * 8),
      vy: Math.sin(angle) * Math.max(400, dist * 8),
      ownerId: "spark",
      color,
      piercing: true,
      lifetime: 0.12,
      orbit: false,
      orbitOffset: 0,
      weaponKind: "chain",
      hostile: false,
      armTimer: 0,
      damage: 0,
      angle,
    });
  }

  private spawnMine(
    p: InternalPlayer,
    w: InternalWeapon,
    color: number,
    damage: number,
    x: number,
    y: number,
  ): void {
    const id = nextProjectileId++;
    this.projectiles.set(id, {
      id,
      x,
      y,
      vx: 0,
      vy: 0,
      ownerId: p.id,
      color,
      piercing: false,
      lifetime: MINE_LIFETIME,
      orbit: false,
      orbitOffset: 0,
      weaponKind: w.kind,
      hostile: false,
      armTimer: MINE_ARM_TIME,
      damage,
      angle: 0,
    });
    this.projectileDamage.set(id, damage);
  }

  private findNearestEnemyExcluding(
    x: number,
    y: number,
    maxRange: number,
    exclude: Set<number>,
  ): InternalEnemy | null {
    let best: InternalEnemy | null = null;
    let bestDist = maxRange * maxRange;
    for (const e of this.enemies.values()) {
      if (exclude.has(e.id)) continue;
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        best = e;
        bestDist = d2;
      }
    }
    return best;
  }

  private spawnProjectile(
    p: InternalPlayer,
    w: InternalWeapon,
    color: number,
    damage: number,
    angle: number,
    speed: number,
    lifetime: number,
    piercing: boolean,
  ) {
    const id = nextProjectileId++;
    this.projectiles.set(id, {
      id,
      x: p.x,
      y: p.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ownerId: p.id,
      color,
      piercing,
      lifetime,
      orbit: false,
      orbitOffset: 0,
      weaponKind: w.kind,
      hostile: false,
      armTimer: 0,
      damage,
      angle,
    });
    // Stash damage on the projectile via a side map (avoids extending the wire type)
    this.projectileDamage.set(id, damage);
  }

  private projectileDamage: Map<number, number> = new Map();

  private tryResolveSwap(): void {
    const players = [...this.players.values()].filter((p) => !p.downed);
    if (players.length !== 2) return;
    const [a, b] = players;
    if (a.chargeProgress >= 1 && b.chargeProgress >= 1) {
      const ax = a.x, ay = a.y;
      a.x = b.x;
      a.y = b.y;
      b.x = ax;
      b.y = ay;
      a.iFrames = SWAP_I_FRAMES;
      b.iFrames = SWAP_I_FRAMES;
      for (const p of [a, b]) {
        p.mana = Math.max(0, p.mana - SWAP_MANA_COST);
        p.chargeProgress = 0;
        p.charging = false;
        p.bufferedInput.charging = false;
      }
    }
  }

  private findNearestEnemy(
    x: number,
    y: number,
    maxRange: number,
  ): InternalEnemy | null {
    let best: InternalEnemy | null = null;
    let bestDist = maxRange * maxRange;
    for (const e of this.enemies.values()) {
      const dx = e.x - x;
      const dy = e.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestDist) {
        best = e;
        bestDist = d2;
      }
    }
    return best;
  }

  private pickSpawnKind(): number {
    const w = this.wave;
    const weights: Array<[number, number]> = [
      [1, 10], // Walker: always common
      [3, w >= 3 ? 4 : 0], // Charger: from wave 3
      [4, w >= 4 ? 3 : 0], // Brute: from wave 4
      [5, w >= 6 ? 3 : 0], // Caster: from wave 6
    ];
    let total = 0;
    for (const [, weight] of weights) total += weight;
    if (total <= 0) return 1;
    let r = Math.random() * total;
    for (const [kind, weight] of weights) {
      r -= weight;
      if (r < 0) return kind;
    }
    return 1;
  }

  private spawnEnemyAt(def: EnemyDef, x: number, y: number): void {
    if (this.enemies.size >= ENEMY_CAP) return;
    const id = nextEnemyId++;
    const r = def.radius;
    const cx = Math.max(r, Math.min(WORLD_WIDTH - r, x));
    const cy = Math.max(r, Math.min(WORLD_HEIGHT - r, y));
    this.enemies.set(id, {
      id,
      x: cx,
      y: cy,
      hp: def.hp + this.wave * 2,
      kind: def.kind,
      vx: 0,
      vy: 0,
      attackCd: CASTER_FIRE_INTERVAL * (0.5 + Math.random()),
      slowTimer: 0,
    });
  }

  /** Edge anchor + inward direction for a given side (0=top,1=right,2=bottom,3=left). */
  private edgeAnchor(side: number, inset: number): { x: number; y: number; idx: number; idy: number } {
    let x = 0;
    let y = 0;
    let idx = 0;
    let idy = 0;
    if (side === 0) { x = Math.random() * WORLD_WIDTH; y = inset; idy = 1; }
    else if (side === 1) { x = WORLD_WIDTH - inset; y = Math.random() * WORLD_HEIGHT; idx = -1; }
    else if (side === 2) { x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT - inset; idy = -1; }
    else { x = inset; y = Math.random() * WORLD_HEIGHT; idx = 1; }
    // Tangent vector (along the edge)
    return { x, y, idx, idy };
  }

  /**
   * Spawn a formation (cluster / line / ring / V / double-edge) instead of a
   * single random edge enemy. Pattern is keyed by wave so each wave feels
   * distinct; boss waves skip this (boss + adds only).
   */
  private spawnFormation(): void {
    const w = this.wave;
    const patterns: Array<"cluster" | "line" | "ring" | "v" | "doubleEdge"> = [
      "cluster",
      "line",
      "v",
      "ring",
      "doubleEdge",
    ];
    const pattern = patterns[w % patterns.length];
    const def = ENEMY_DEFS[this.pickSpawnKind()] ?? ENEMY_DEFS[1];
    const inset = 24;
    const side = Math.floor(Math.random() * 4);
    const anchor = this.edgeAnchor(side, inset);
    // Tangent = perpendicular to inward direction.
    const tx = -anchor.idy;
    const ty = anchor.idx;
    const baseN = 4 + Math.floor(w / 4);
    const n = Math.min(baseN, ENEMY_CAP - this.enemies.size);
    if (n <= 0) return;

    if (pattern === "cluster") {
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const rad = Math.random() * 36;
        this.spawnEnemyAt(def, anchor.x + Math.cos(ang) * rad, anchor.y + Math.sin(ang) * rad);
      }
    } else if (pattern === "line") {
      const spacing = 38;
      for (let i = 0; i < n; i++) {
        const o = (i - (n - 1) / 2) * spacing;
        this.spawnEnemyAt(def, anchor.x + tx * o, anchor.y + ty * o);
      }
    } else if (pattern === "ring") {
      const radius = 56;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        this.spawnEnemyAt(def, anchor.x + anchor.idx * 30 + Math.cos(ang) * radius, anchor.y + anchor.idy * 30 + Math.sin(ang) * radius);
      }
    } else if (pattern === "v") {
      // Two arms forming a V pointing inward from the edge anchor.
      const armLen = Math.ceil(n / 2);
      const spread = 30;
      for (let i = 0; i < armLen; i++) {
        const d = (i + 1) * spread;
        // Left arm: inward + tangent*0.6
        this.spawnEnemyAt(def, anchor.x + anchor.idx * d + tx * d * 0.6, anchor.y + anchor.idy * d + ty * d * 0.6);
        // Right arm: inward - tangent*0.6 (skip duplicate of center if odd)
        if (i < armLen - 1 || n % 2 === 0) {
          this.spawnEnemyAt(def, anchor.x + anchor.idx * d - tx * d * 0.6, anchor.y + anchor.idy * d - ty * d * 0.6);
        }
      }
    } else {
      // doubleEdge: spawn half on `side`, half on the opposite edge.
      const opp = (side + 2) % 4;
      const a2 = this.edgeAnchor(opp, inset);
      const half = Math.floor(n / 2);
      for (let i = 0; i < half; i++) this.spawnEnemyAt(def, anchor.x + tx * (i - half / 2) * 30, anchor.y + ty * (i - half / 2) * 30);
      const t2x = -a2.idy;
      const t2y = a2.idx;
      for (let i = 0; i < n - half; i++) this.spawnEnemyAt(def, a2.x + t2x * (i - (n - half) / 2) * 30, a2.y + t2y * (i - (n - half) / 2) * 30);
    }
  }

  private updateSpawns(dt: number): void {
    if (this.isBossWave) return;
    if (this.enemies.size >= ENEMY_CAP) return;
    this.enemySpawnCooldown -= dt;
    if (this.enemySpawnCooldown <= 0) {
      // Spawn rate scales with wave; each tick spawns a whole formation.
      this.enemySpawnCooldown = Math.max(0.5, ENEMY_SPAWN_INTERVAL - this.wave * 0.04);
      this.spawnFormation();
    }
  }

  private updateEnemies(dt: number): void {
    const players = [...this.players.values()].filter((p) => !p.downed);
    if (players.length === 0) {
      // No living players: drift to a stop
      for (const e of this.enemies.values()) {
        e.vx = 0;
        e.vy = 0;
      }
      return;
    }
    for (const e of this.enemies.values()) {
      const def = ENEMY_DEFS[e.kind] ?? ENEMY_DEFS[1];
      if (e.slowTimer > 0) e.slowTimer = Math.max(0, e.slowTimer - dt);

      // Find nearest living player
      let target: InternalPlayer | null = null;
      let bestDist = Infinity;
      for (const p of players) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
          bestDist = d2;
          target = p;
        }
      }
      if (!target) continue;

      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const slow = e.slowTimer > 0 ? FROST_SLOW_FACTOR : 1;
      const speed = (def.speed + (e.kind === 2 ? 0 : 0)) * slow;

      if (def.ranged) {
        // Caster: keep preferred range; fire on cooldown when in line of sight
        e.attackCd -= dt;
        if (dist > CASTER_PREF_RANGE + 20) {
          e.vx = (dx / dist) * speed;
          e.vy = (dy / dist) * speed;
        } else if (dist < CASTER_PREF_RANGE - 40) {
          e.vx = -(dx / dist) * speed;
          e.vy = -(dy / dist) * speed;
        } else {
          // Strafe slowly
          e.vx = (-dy / dist) * speed * 0.4;
          e.vy = (dx / dist) * speed * 0.4;
        }
        if (e.attackCd <= 0 && dist <= CASTER_FIRE_RANGE) {
          e.attackCd = CASTER_FIRE_INTERVAL;
          this.spawnEnemyProjectile(e, target, ENEMY_PROJ_DAMAGE, ENEMY_PROJ_SPEED);
        }
      } else if (def.boss) {
        // Boss: chase, periodically cast a damage zone on a player and summon adds
        e.vx = (dx / dist) * speed;
        e.vy = (dy / dist) * speed;
        e.attackCd -= dt;
        if (e.attackCd <= 0) {
          e.attackCd = BOSS_ZONE_INTERVAL;
          // Target the farther player to pressure both, else nearest
          const zoneTarget = this.pickBossZoneTarget(target);
          this.spawnZone(zoneTarget.x, zoneTarget.y);
        }
        this.bossSummonTimer = (this.bossSummonTimer ?? BOSS_SUMMON_INTERVAL) - dt;
        if ((this.bossSummonTimer ?? 0) <= 0) {
          this.bossSummonTimer = BOSS_SUMMON_INTERVAL;
          this.summonAdds(e);
        }
      } else {
        // Walker / Charger / Brute: chase nearest
        e.vx = (dx / dist) * speed;
        e.vy = (dy / dist) * speed;
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;

      // Solid blocks push enemies out too (but enemies can occupy hazard tiles).
      const er = def.radius;
      const ecol = this.collideObstacle(e.x, e.y, er);
      if (ecol.hit) {
        e.x = ecol.x;
        e.y = ecol.y;
      }
    }
  }

  private bossSummonTimer: number | undefined;

  private pickBossZoneTarget(fallback: InternalPlayer): { x: number; y: number } {
    const living = [...this.players.values()].filter((p) => !p.downed);
    if (living.length <= 1) return { x: fallback.x, y: fallback.y };
    // Pick the player farthest from the boss to spread pressure
    let far = living[0];
    let farDist = -1;
    for (const p of living) {
      const d = Math.hypot(p.x - WORLD_WIDTH / 2, p.y - WORLD_HEIGHT * 0.25);
      if (d > farDist) {
        farDist = d;
        far = p;
      }
    }
    return { x: far.x, y: far.y };
  }

  private summonAdds(boss: InternalEnemy): void {
    const def = ENEMY_DEFS[3] ?? ENEMY_DEFS[1]; // summon chargers
    for (let i = 0; i < BOSS_SUMMON_COUNT; i++) {
      if (this.enemies.size >= ENEMY_CAP) break;
      const id = nextEnemyId++;
      const ang = Math.random() * Math.PI * 2;
      const dist = 40 + Math.random() * 30;
      this.enemies.set(id, {
        id,
        x: boss.x + Math.cos(ang) * dist,
        y: boss.y + Math.sin(ang) * dist,
        hp: def.hp + this.wave * 2,
        kind: def.kind,
        vx: 0,
        vy: 0,
        attackCd: CASTER_FIRE_INTERVAL,
        slowTimer: 0,
      });
    }
  }

  private spawnEnemyProjectile(
    from: InternalEnemy,
    target: InternalPlayer,
    damage: number,
    speed: number,
  ): void {
    const angle = Math.atan2(target.y - from.y, target.x - from.x);
    const id = nextProjectileId++;
    this.projectiles.set(id, {
      id,
      x: from.x,
      y: from.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      ownerId: `enemy:${from.id}`,
      color: 0x22d3ee,
      piercing: false,
      lifetime: ENEMY_PROJ_LIFETIME,
      orbit: false,
      orbitOffset: 0,
      weaponKind: "pulse",
      hostile: true,
      armTimer: 0,
      damage,
      angle,
    });
  }

  private spawnZone(x: number, y: number): void {
    const id = nextZoneId++;
    // Keep zones within bounds
    const cx = Math.max(ZONE_RADIUS, Math.min(WORLD_WIDTH - ZONE_RADIUS, x));
    const cy = Math.max(ZONE_RADIUS, Math.min(WORLD_HEIGHT - ZONE_RADIUS, y));
    this.zones.set(id, {
      id,
      x: cx,
      y: cy,
      radius: ZONE_RADIUS,
      telegraph: ZONE_TELEGRAPH,
      active: false,
      duration: ZONE_DURATION,
      dps: ZONE_DPS,
      color: ZONE_COLOR,
    });
  }

  private updateZones(dt: number): void {
    for (const [id, z] of [...this.zones]) {
      if (!z.active) {
        z.telegraph -= dt;
        if (z.telegraph <= 0) {
          z.active = true;
          z.telegraph = 0;
        }
        continue;
      }
      z.duration -= dt;
      if (z.duration <= 0) {
        this.zones.delete(id);
        continue;
      }
      // Damage living players standing in the zone (i-frames grant safety)
      for (const p of this.players.values()) {
        if (p.downed || p.iFrames > 0) continue;
        const dx = p.x - z.x;
        const dy = p.y - z.y;
        if (dx * dx + dy * dy <= z.radius * z.radius) {
          this.applyDamage(p, z.dps * dt);
        }
      }
    }
  }

  private updateProjectiles(dt: number): void {
    for (const [id, pr] of [...this.projectiles]) {
      if (pr.orbit) {
        // Position set in refreshOrbitProjectiles; just advance phase
        const owner = this.players.get(pr.ownerId);
        if (!owner) {
          this.projectiles.delete(id);
          this.projectileDamage.delete(id);
          continue;
        }
        const w = owner.weapons.find((w) => w.kind === pr.weaponKind);
        if (!w) {
          this.projectiles.delete(id);
          this.projectileDamage.delete(id);
          continue;
        }
        const angle = w.orbitPhase + pr.orbitOffset;
        pr.x = owner.x + Math.cos(angle) * ORBIT_RADIUS;
        pr.y = owner.y + Math.sin(angle) * ORBIT_RADIUS;
        continue;
      }

      if (pr.hostile) {
        this.updateHostileProjectile(id, pr, dt);
        continue;
      }

      if (pr.weaponKind === "mine") {
        this.updateMine(id, pr, dt);
        continue;
      }

      if (pr.weaponKind === "homing") {
        this.steerHoming(pr, dt);
      }

      this.updatePlayerProjectile(id, pr, dt);
    }
  }

  private updateHostileProjectile(id: number, pr: InternalProjectile, dt: number): void {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.lifetime -= dt;
    if (pr.lifetime <= 0 || pr.x < 0 || pr.x > WORLD_WIDTH || pr.y < 0 || pr.y > WORLD_HEIGHT) {
      this.projectiles.delete(id);
      return;
    }
    for (const p of this.players.values()) {
      if (p.downed || p.iFrames > 0) continue;
      const dx = p.x - pr.x;
      const dy = p.y - pr.y;
      const r = PLAYER_RADIUS + PROJECTILE_RADIUS;
      if (dx * dx + dy * dy < r * r) {
        this.applyDamage(p, pr.damage);
        this.projectiles.delete(id);
        return;
      }
    }
  }

  private updatePlayerProjectile(id: number, pr: InternalProjectile, dt: number): void {
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.lifetime -= dt;
    if (
      pr.lifetime <= 0 ||
      pr.x < 0 || pr.x > WORLD_WIDTH ||
      pr.y < 0 || pr.y > WORLD_HEIGHT
    ) {
      this.projectiles.delete(id);
      this.projectileDamage.delete(id);
      return;
    }
    for (const [eid, e] of [...this.enemies]) {
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      const r = (ENEMY_DEFS[e.kind]?.radius ?? ENEMY_RADIUS) + PROJECTILE_RADIUS;
      if (dx * dx + dy * dy < r * r) {
        const applied = Math.min(pr.damage, Math.max(0, e.hp));
        e.hp -= pr.damage;
        if (applied > 0) this.recordDamage(pr.ownerId, applied);
        if (pr.weaponKind === "frost") e.slowTimer = FROST_SLOW_DURATION;
        if (e.hp <= 0) {
          this.enemies.delete(eid);
          const dropChance = e.kind === 2 ? BOSS_DROP_CHANCE : BOX_DROP_CHANCE;
          if (Math.random() < dropChance) {
            this.spawnBox(e.x, e.y);
          }
          if (Math.random() < HEALTH_PACK_DROP_CHANCE) {
            this.spawnHealthPack(e.x, e.y);
          }
        }
        if (!pr.piercing) {
          this.projectiles.delete(id);
          this.projectileDamage.delete(id);
          break;
        }
      }
    }
  }

  private steerHoming(pr: InternalProjectile, dt: number): void {
    const target = this.findNearestEnemy(pr.x, pr.y, AUTO_ATTACK_RANGE * 2);
    if (!target) return;
    const desired = Math.atan2(target.y - pr.y, target.x - pr.x);
    // Rotate pr.angle toward desired by at most HOMING_TURN_RATE * dt
    let diff = desired - pr.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = HOMING_TURN_RATE * dt;
    pr.angle += Math.max(-maxTurn, Math.min(maxTurn, diff));
    const speed = Math.hypot(pr.vx, pr.vy) || 1;
    pr.vx = Math.cos(pr.angle) * speed;
    pr.vy = Math.sin(pr.angle) * speed;
  }

  private updateMine(id: number, pr: InternalProjectile, dt: number): void {
    pr.armTimer = Math.max(0, pr.armTimer - dt);
    pr.lifetime -= dt;
    if (pr.lifetime <= 0) {
      this.projectiles.delete(id);
      this.projectileDamage.delete(id);
      return;
    }
    if (pr.armTimer > 0) return;
    // Detonate when an enemy is within trigger range
    for (const e of this.enemies.values()) {
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy <= MINE_TRIGGER_RANGE * MINE_TRIGGER_RANGE) {
        this.detonateMine(pr);
        this.projectiles.delete(id);
        this.projectileDamage.delete(id);
        return;
      }
    }
  }

  private detonateMine(pr: InternalProjectile): void {
    for (const [eid, e] of [...this.enemies]) {
      const dx = e.x - pr.x;
      const dy = e.y - pr.y;
      if (dx * dx + dy * dy <= MINE_BLAST_RADIUS * MINE_BLAST_RADIUS) {
        const applied = Math.min(pr.damage, Math.max(0, e.hp));
        e.hp -= pr.damage;
        if (applied > 0) this.recordDamage(pr.ownerId, applied);
        if (e.hp <= 0) {
          this.enemies.delete(eid);
          const dropChance = e.kind === 2 ? BOSS_DROP_CHANCE : BOX_DROP_CHANCE;
          if (Math.random() < dropChance) {
            this.spawnBox(e.x, e.y);
          }
          if (Math.random() < HEALTH_PACK_DROP_CHANCE) {
            this.spawnHealthPack(e.x, e.y);
          }
        }
      }
    }
  }

  private resolveCombat(dt: number): void {
    // Enemy contact damage (shield absorbs first via applyDamage)
    for (const e of this.enemies.values()) {
      const def = ENEMY_DEFS[e.kind] ?? ENEMY_DEFS[1];
      if (def.damage <= 0) continue;
      for (const p of this.players.values()) {
        if (p.downed || p.iFrames > 0) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const r = PLAYER_RADIUS + def.radius;
        if (dx * dx + dy * dy < r * r) {
          this.applyDamage(p, def.damage * dt);
        }
      }
    }
    // Orbit projectile contact damage (projectiles that persist)
    for (const [id, pr] of this.projectiles) {
      if (!pr.orbit) continue;
      const dmg = pr.damage || this.projectileDamage.get(id) || WEAPON_DEFS.orbit.baseDamage;
      for (const [eid, e] of [...this.enemies]) {
        const dx = e.x - pr.x;
        const dy = e.y - pr.y;
        const r = (ENEMY_DEFS[e.kind]?.radius ?? ENEMY_RADIUS) + PROJECTILE_RADIUS;
        if (dx * dx + dy * dy < r * r) {
          const tickDmg = dmg * dt * 4; // orbit ticks continuously, scale down per-frame
          const applied = Math.min(tickDmg, Math.max(0, e.hp));
          e.hp -= tickDmg;
          if (applied > 0) this.recordDamage(pr.ownerId, applied);
          if (e.hp <= 0) {
            this.enemies.delete(eid);
            const dropChance = e.kind === 2 ? BOSS_DROP_CHANCE : BOX_DROP_CHANCE;
            if (Math.random() < dropChance) {
              this.spawnBox(e.x, e.y);
            }
            if (Math.random() < HEALTH_PACK_DROP_CHANCE) {
              this.spawnHealthPack(e.x, e.y);
            }
          }
        }
      }
    }
  }

  private updateRevive(dt: number): void {
    const downed = [...this.players.values()].filter((p) => p.downed);
    const up = [...this.players.values()].filter((p) => !p.downed);
    if (downed.length === 0) return;
    for (const d of downed) {
      const helper = up.find((p) => Math.hypot(p.x - d.x, p.y - d.y) <= REVIVE_RANGE);
      if (helper) {
        d.reviveProgress = Math.min(1, d.reviveProgress + dt / REVIVE_DURATION);
        if (d.reviveProgress >= 1) {
          d.downed = false;
          d.hp = d.maxHp * 0.5;
          d.iFrames = 1.5;
          d.reviveProgress = 0;
        }
      } else {
        // Decay revive progress slowly when no helper
        d.reviveProgress = Math.max(0, d.reviveProgress - dt / (REVIVE_DURATION * 2));
      }
    }
  }

  private checkLossCondition(): void {
    const players = [...this.players.values()];
    if (players.length === 0) return;
    if (players.every((p) => p.downed)) {
      this.runStatus = "lost";
    }
  }

  snapshot(): Snapshot {
    const players: PlayerState[] = [...this.players.values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      hp: p.hp,
      maxHp: p.maxHp,
      mana: p.mana,
      maxMana: p.maxMana,
      shieldHp: p.shieldHp,
      maxShield: p.maxShield,
      charging: p.charging,
      chargeProgress: p.chargeProgress,
      iFrames: p.iFrames,
      dashCooldown: p.dashCooldown,
      dashTime: p.dashTime,
      dps: p.dps,
      downed: p.downed,
      reviveProgress: p.reviveProgress,
      color: p.color,
      weapons: p.weapons.map((w) => ({
        kind: w.kind,
        level: w.level,
        cooldown: 0,
        orbitPhase: w.orbitPhase,
      })),
    }));
    const enemies: EnemyState[] = [...this.enemies.values()].map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      hp: e.hp,
      kind: e.kind,
    }));
    const projectiles: ProjectileState[] = [...this.projectiles.values()].map((pr) => ({
      id: pr.id,
      x: pr.x,
      y: pr.y,
      vx: pr.vx,
      vy: pr.vy,
      ownerId: pr.ownerId,
      color: pr.color,
      piercing: pr.piercing,
      lifetime: pr.lifetime,
      orbit: pr.orbit,
      orbitOffset: pr.orbitOffset,
      weaponKind: pr.weaponKind,
      hostile: pr.hostile,
    }));
    const boxes: BoxState[] = [...this.boxes.values()];
    const zones: ZoneState[] = [...this.zones.values()];
    const obstacles: ObstacleState[] = [...this.obstacles.values()].map((o) => ({
      id: o.id,
      kind: o.kind,
      shape: o.shape,
      x: o.x,
      y: o.y,
      w: o.w,
      h: o.h,
      radius: o.radius,
      color: o.color,
    }));
    const pickups: PickupState[] = [...this.pickups.values()].map((pk) => ({
      id: pk.id,
      x: pk.x,
      y: pk.y,
      kind: pk.kind,
    }));
    return {
      t: this.time,
      tick: this.tick,
      players,
      enemies,
      projectiles,
      boxes,
      zones,
      obstacles,
      pickups,
      wave: this.wave,
      waveTimer: this.waveTimer,
      isBossWave: this.isBossWave,
      bossTimer: this.bossTimer,
      runTime: this.time,
      runDuration: RUN_DURATION,
      runStatus: this.runStatus,
    };
  }

  applySnapshot(snap: Snapshot): void {
    this.tick = snap.tick;
    this.time = snap.t;
    this.wave = snap.wave;
    this.waveTimer = snap.waveTimer;
    this.isBossWave = snap.isBossWave;
    this.bossTimer = snap.bossTimer;
    this.runStatus = snap.runStatus;

    this.players.clear();
    for (const ps of snap.players) {
      this.players.set(ps.id, {
        ...ps,
        weapons: ps.weapons.map((w) => ({ ...w })),
        bufferedInput: { mx: 0, my: 0, charging: false, dashPressed: false },
        pendingOpenBoxId: null,
        reviveProgress: ps.reviveProgress,
        facingX: 1,
        facingY: 0,
        damageLog: [],
        damageAccum: 0,
        damageWindowStart: 0,
      });
    }
    this.enemies.clear();
    for (const e of snap.enemies) {
      this.enemies.set(e.id, { ...e, vx: 0, vy: 0, attackCd: 0, slowTimer: 0 });
    }
    this.projectiles.clear();
    this.projectileDamage.clear();
    for (const pr of snap.projectiles) {
      this.projectiles.set(pr.id, {
        ...pr,
        armTimer: 0,
        damage: 0,
        angle: Math.atan2(pr.vy, pr.vx),
      });
    }
    this.boxes.clear();
    for (const b of snap.boxes) {
      this.boxes.set(b.id, { ...b });
    }
    this.zones.clear();
    for (const z of snap.zones) {
      this.zones.set(z.id, { ...z });
    }
    this.obstacles.clear();
    for (const o of snap.obstacles) {
      this.obstacles.set(o.id, { ...o });
    }
    this.pickups.clear();
    for (const pk of snap.pickups) {
      this.pickups.set(pk.id, { ...pk });
    }
  }

  getRunStatus(): RunStatus {
    return this.runStatus;
  }

  // Read-only access for the renderer
  getPlayers(): PlayerState[] {
    return [...this.players.values()].map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      hp: p.hp,
      maxHp: p.maxHp,
      mana: p.mana,
      maxMana: p.maxMana,
      shieldHp: p.shieldHp,
      maxShield: p.maxShield,
      charging: p.charging,
      chargeProgress: p.chargeProgress,
      iFrames: p.iFrames,
      dashCooldown: p.dashCooldown,
      dashTime: p.dashTime,
      dps: p.dps,
      downed: p.downed,
      reviveProgress: p.reviveProgress,
      color: p.color,
      weapons: p.weapons.map((w) => ({
        kind: w.kind,
        level: w.level,
        cooldown: 0,
        orbitPhase: w.orbitPhase,
      })),
    }));
  }

  getEnemies(): EnemyState[] {
    return [...this.enemies.values()].map((e) => ({
      id: e.id,
      x: e.x,
      y: e.y,
      hp: e.hp,
      kind: e.kind,
    }));
  }

  getProjectiles(): ProjectileState[] {
    return [...this.projectiles.values()];
  }

  getBoxes(): BoxState[] {
    return [...this.boxes.values()];
  }

  getZones(): ZoneState[] {
    return [...this.zones.values()];
  }

  getObstacles(): ObstacleState[] {
    return [...this.obstacles.values()];
  }

  getPickups(): PickupState[] {
    return [...this.pickups.values()];
  }

  getWaveInfo(): { wave: number; waveTimer: number; isBossWave: boolean; bossTimer: number } {
    return {
      wave: this.wave,
      waveTimer: this.waveTimer,
      isBossWave: this.isBossWave,
      bossTimer: this.bossTimer,
    };
  }
}

// Re-export constants the renderer needs
export {
  PLAYER_RADIUS,
  ENEMY_RADIUS,
  PROJECTILE_RADIUS,
  BOX_RADIUS,
  BOX_COLOR,
  BOX_OPEN_RANGE,
  ENEMY_COLOR,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  REVIVE_RANGE,
  ENEMY_DEFS,
  ZONE_COLOR,
  ZONE_RADIUS,
  MINE_BLAST_RADIUS,
  OBSTACLE_BLOCK_COLOR,
  OBSTACLE_HAZARD_COLOR,
  HEALTH_PACK_RADIUS,
  HEALTH_PACK_COLOR,
};
