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
  ENEMY_SPEED,
  ENEMY_HP,
  ENEMY_SPAWN_INTERVAL,
  ENEMY_DAMAGE,
  ENEMY_COLOR,
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
}

interface InternalEnemy extends EnemyState {
  vx: number;
  vy: number;
}

interface InternalProjectile extends ProjectileState {
  lifetime: number;
}

interface InternalBox {
  id: number;
  x: number;
  y: number;
  opened: boolean;
  openerId: string | null;
  options: WeaponPickOption[] | null;
}

let nextEnemyId = 1;
let nextProjectileId = 1;
let nextBoxId = 1;

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
    charging: false,
    chargeProgress: 0,
    iFrames: 0,
    downed: false,
    reviveProgress: 0,
    color,
    bufferedInput: { mx: 0, my: 0, charging: false },
    weapons: [{ kind: "pulse", level: 1, cooldown: 0, orbitPhase: 0 }],
    pendingOpenBoxId: null,
  };
}

function damageFor(w: InternalWeapon): number {
  const def = WEAPON_DEFS[w.kind];
  return def.baseDamage * (1 + (w.level - 1) * 0.35);
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
  private tick = 0;
  private time = 0;
  private wave = 1;
  private waveTimer = 60;
  private isBossWave = false;
  private bossTimer = 0;
  private enemySpawnCooldown = ENEMY_SPAWN_INTERVAL;
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
      if (b.opened) continue;
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

      if (candidates.length === 0) break;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      usedKinds.add(pick.kind);
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

    if (this.waveTimer <= 0) {
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
    this.resolveCombat(dt);
    this.updateRevive(dt);
    this.checkLossCondition();
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
  }

  private spawnBoss(): void {
    const id = nextEnemyId++;
    this.enemies.set(id, {
      id,
      x: WORLD_WIDTH / 2,
      y: WORLD_HEIGHT * 0.25,
      hp: 400,
      kind: 2,
      vx: 0,
      vy: 0,
    });
  }

  private updatePlayers(dt: number): void {
    for (const p of this.players.values()) {
      if (p.iFrames > 0) p.iFrames = Math.max(0, p.iFrames - dt);

      // Mana regen always
      if (p.mana < p.maxMana) {
        p.mana = Math.min(p.maxMana, p.mana + PLAYER_MANA_REGEN * dt);
      }

      if (p.downed) continue;

      // If this player is currently in a box menu, freeze input
      const inBoxMenu = [...this.boxes.values()].some((b) => b.openerId === p.id);
      const input = inBoxMenu
        ? { mx: 0, my: 0, charging: false }
        : p.bufferedInput;

      // Movement (acceleration-based, see CONTEXT.md: smooth motion)
      const moving = input.mx !== 0 || input.my !== 0;
      if (moving) {
        const len = Math.hypot(input.mx, input.my) || 1;
        const nx = input.mx / len;
        const ny = input.my / len;
        p.vx += nx * PLAYER_ACCEL * dt;
        p.vy += ny * PLAYER_ACCEL * dt;
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
          // Ensure at least countFor(w) orbit projectiles exist
          // (orbit projectiles persist; recreated each step from weapon)
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

    // Aimed weapons: target nearest enemy
    const target = this.findNearestEnemy(p.x, p.y, AUTO_ATTACK_RANGE);
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

  private updateSpawns(dt: number): void {
    if (this.isBossWave) return;
    this.enemySpawnCooldown -= dt;
    if (this.enemySpawnCooldown <= 0) {
      // Spawn rate scales with wave
      this.enemySpawnCooldown = Math.max(0.3, ENEMY_SPAWN_INTERVAL - this.wave * 0.05);
      const id = nextEnemyId++;
      const side = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (side === 0) { x = Math.random() * WORLD_WIDTH; y = ENEMY_RADIUS; }
      else if (side === 1) { x = WORLD_WIDTH - ENEMY_RADIUS; y = Math.random() * WORLD_HEIGHT; }
      else if (side === 2) { x = Math.random() * WORLD_WIDTH; y = WORLD_HEIGHT - ENEMY_RADIUS; }
      else { x = ENEMY_RADIUS; y = Math.random() * WORLD_HEIGHT; }
      this.enemies.set(id, {
        id,
        x,
        y,
        hp: ENEMY_HP + this.wave * 2,
        kind: 1,
        vx: 0,
        vy: 0,
      });
    }
  }

  private updateEnemies(dt: number): void {
    const players = [...this.players.values()].filter((p) => !p.downed);
    if (players.length === 0) return;
    for (const e of this.enemies.values()) {
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
      const d = Math.hypot(dx, dy) || 1;
      const speed = ENEMY_SPEED + (e.kind === 2 ? 10 : 0);
      e.vx = (dx / d) * speed;
      e.vy = (dy / d) * speed;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
  }

  private updateProjectiles(dt: number): void {
    for (const [id, pr] of [...this.projectiles]) {
      if (pr.orbit) {
        // Position set in refreshOrbitProjectiles; just advance phase
        const owner = this.players.get(pr.ownerId);
        if (!owner) {
          this.projectiles.delete(id);
          continue;
        }
        const w = owner.weapons.find((w) => w.kind === pr.weaponKind);
        if (!w) {
          this.projectiles.delete(id);
          continue;
        }
        const angle = w.orbitPhase + pr.orbitOffset;
        pr.x = owner.x + Math.cos(angle) * ORBIT_RADIUS;
        pr.y = owner.y + Math.sin(angle) * ORBIT_RADIUS;
        // Orbit projectiles deal damage on contact (handled in resolveCombat)
        continue;
      }

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
        continue;
      }
      // Check enemy collisions
      let hit = false;
      for (const [eid, e] of [...this.enemies]) {
        const dx = e.x - pr.x;
        const dy = e.y - pr.y;
        const r = ENEMY_RADIUS + PROJECTILE_RADIUS;
        if (dx * dx + dy * dy < r * r) {
          e.hp -= this.projectileDamage.get(id) ?? PROJECTILE_RADIUS; // fallback
          hit = true;
          if (e.hp <= 0) {
            this.enemies.delete(eid);
            const dropChance = e.kind === 2 ? BOSS_DROP_CHANCE : BOX_DROP_CHANCE;
            if (Math.random() < dropChance) {
              this.spawnBox(e.x, e.y);
            }
          }
          if (!pr.piercing) {
            this.projectiles.delete(id);
            this.projectileDamage.delete(id);
            break;
          }
        }
      }
      if (hit && !pr.piercing) continue;
    }
  }

  private resolveCombat(dt: number): void {
    // Enemy contact damage
    for (const e of this.enemies.values()) {
      for (const p of this.players.values()) {
        if (p.downed || p.iFrames > 0) continue;
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const r = PLAYER_RADIUS + ENEMY_RADIUS;
        if (dx * dx + dy * dy < r * r) {
          p.hp -= ENEMY_DAMAGE * dt;
          if (p.hp <= 0) {
            p.hp = 0;
            p.downed = true;
            p.bufferedInput = { mx: 0, my: 0, charging: false };
            p.chargeProgress = 0;
            p.charging = false;
          }
        }
      }
    }
    // Orbit projectile contact damage (projectiles that persist)
    for (const [id, pr] of this.projectiles) {
      if (!pr.orbit) continue;
      const dmg = this.projectileDamage.get(id) ?? WEAPON_DEFS.orbit.baseDamage;
      for (const [eid, e] of [...this.enemies]) {
        const dx = e.x - pr.x;
        const dy = e.y - pr.y;
        const r = ENEMY_RADIUS + PROJECTILE_RADIUS;
        if (dx * dx + dy * dy < r * r) {
          e.hp -= dmg * dt * 4; // orbit ticks continuously, scale down per-frame
          if (e.hp <= 0) {
            this.enemies.delete(eid);
            const dropChance = e.kind === 2 ? BOSS_DROP_CHANCE : BOX_DROP_CHANCE;
            if (Math.random() < dropChance) {
              this.spawnBox(e.x, e.y);
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
      charging: p.charging,
      chargeProgress: p.chargeProgress,
      iFrames: p.iFrames,
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
    }));
    const boxes: BoxState[] = [...this.boxes.values()];
    return {
      t: this.time,
      tick: this.tick,
      players,
      enemies,
      projectiles,
      boxes,
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
        bufferedInput: { mx: 0, my: 0, charging: false },
        pendingOpenBoxId: null,
        reviveProgress: ps.reviveProgress,
      });
    }
    this.enemies.clear();
    for (const e of snap.enemies) {
      this.enemies.set(e.id, { ...e, vx: 0, vy: 0 });
    }
    this.projectiles.clear();
    this.projectileDamage.clear();
    for (const pr of snap.projectiles) {
      this.projectiles.set(pr.id, { ...pr });
    }
    this.boxes.clear();
    for (const b of snap.boxes) {
      this.boxes.set(b.id, { ...b });
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
      charging: p.charging,
      chargeProgress: p.chargeProgress,
      iFrames: p.iFrames,
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
};
