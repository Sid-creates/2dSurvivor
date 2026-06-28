// Constants tunable in one place. Tuned for v1 spike, not final balance.

export const WORLD_WIDTH = 1280;
export const WORLD_HEIGHT = 720;

export const PLAYER_RADIUS = 14;
export const PLAYER_MAX_SPEED = 220; // px/s
export const PLAYER_ACCEL = 1400; // px/s^2
export const PLAYER_DECEL = 2400; // px/s^2 when no input
export const PLAYER_MAX_HP = 100;
export const PLAYER_MAX_MANA = 100;
export const PLAYER_MANA_REGEN = 6; // per second
export const SWAP_MANA_COST = 40;
export const SWAP_CHARGE_DURATION = 0.8; // seconds to fill charge
export const SWAP_I_FRAMES = 0.5; // seconds of invuln after a completed Swap

export const PLAYER_COLORS: { host: number; guest: number } = {
  host: 0x60a5fa, // accent blue
  guest: 0xf97316, // orange
};

export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
export const SNAPSHOT_HZ = 30;
export const SNAPSHOT_INTERVAL = 1 / SNAPSHOT_HZ;

export const RUN_DURATION = 600; // 10 minutes, see CONTEXT.md: Run win condition

export const ENEMY_RADIUS = 12;
export const ENEMY_SPEED = 70;
export const ENEMY_HP = 20;
export const ENEMY_SPAWN_INTERVAL = 1.2; // seconds
export const ENEMY_DAMAGE = 12; // per contact, per second
export const ENEMY_COLOR = 0xef4444;

// Enemy archetypes. `kind` is the discriminator on EnemyState. Stats are derived
// from this table on the host; guests render radius/color from the same table.
export interface EnemyDef {
  kind: number;
  name: string;
  hp: number;
  speed: number;
  damage: number; // contact damage per second
  radius: number;
  color: number;
  /** Ranged enemies keep their distance and fire hostile projectiles. */
  ranged?: boolean;
  /** Bosses cast damage zones and summon adds. */
  boss?: boolean;
}

export const ENEMY_DEFS: Record<number, EnemyDef> = {
  1: { kind: 1, name: "Walker", hp: 20, speed: 70, damage: 12, radius: 12, color: 0xef4444 },
  2: { kind: 2, name: "Boss", hp: 400, speed: 55, damage: 28, radius: 36, color: 0xef4444, boss: true },
  3: { kind: 3, name: "Charger", hp: 12, speed: 138, damage: 10, radius: 10, color: 0xfbbf24 },
  4: { kind: 4, name: "Brute", hp: 90, speed: 42, damage: 24, radius: 18, color: 0xa78bfa },
  5: { kind: 5, name: "Caster", hp: 34, speed: 50, damage: 6, radius: 12, color: 0x22d3ee, ranged: true },
};

export const BOSS_BASE_HP = 400;
export const BOSS_HP_PER_TIER = 220; // extra hp per boss wave tier (wave 10, 15, ...)
export const CASTER_FIRE_INTERVAL = 2.2; // seconds between casts
export const CASTER_PREF_RANGE = 240; // distance casters try to keep
export const CASTER_FIRE_RANGE = 360;
export const ENEMY_PROJ_SPEED = 230;
export const ENEMY_PROJ_DAMAGE = 10;
export const ENEMY_PROJ_LIFETIME = 2.4;
export const BOSS_ZONE_INTERVAL = 3.4; // seconds between boss zone casts
export const BOSS_SUMMON_INTERVAL = 6.5; // seconds between boss add-summons
export const BOSS_SUMMON_COUNT = 3;
export const ZONE_TELEGRAPH = 1.2; // seconds of warning
export const ZONE_DURATION = 2.8; // seconds active
export const ZONE_RADIUS = 72;
export const ZONE_DPS = 26;
export const ZONE_COLOR = 0xef4444;
export const FROST_SLOW_DURATION = 1.6; // seconds
export const FROST_SLOW_FACTOR = 0.5; // multiply speed while slowed
export const MINE_ARM_TIME = 0.5;
export const MINE_TRIGGER_RANGE = 46;
export const MINE_BLAST_RADIUS = 70;
export const MINE_LIFETIME = 6;
export const CHAIN_RANGE = 180; // max link distance between chained enemies
export const HOMING_TURN_RATE = 6; // radians/sec steering
export const ENEMY_CAP = 90; // soft cap on concurrent enemies

export const PROJECTILE_RADIUS = 5;
export const PROJECTILE_DAMAGE = 10;
export const PROJECTILE_LIFETIME = 1.2; // seconds
export const AUTO_ATTACK_INTERVAL = 0.6; // seconds between auto-attacks
export const AUTO_ATTACK_RANGE = 320;

export const BOX_RADIUS = 18;
export const BOX_COLOR = 0xfbbf24;
export const BOX_OPEN_RANGE = 50; // distance to interact
export const BOX_DROP_CHANCE = 0.05; // chance per normal enemy
export const BOSS_DROP_CHANCE = 1.0; // bosses always drop a box

export const REVIVE_RANGE = 80;
export const REVIVE_DURATION = 2.5; // seconds of proximity to revive

export const ORBIT_RADIUS = 50;
export const ORBIT_ANGULAR_SPEED = 4; // radians per second
