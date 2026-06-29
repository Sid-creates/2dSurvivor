// Constants tunable in one place. Tuned for v1 spike, not final balance.

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 3200;

// --- Scrolling camera / safe zone (Stage 2) ---
// The camera is a fixed-size viewport (the "safe zone") that auto-scrolls
// across the large world. Players outside it take void damage.
export const VIEW_WIDTH = 1280;
export const VIEW_HEIGHT = 720;
export const CAMERA_SCROLL_SPEED = 38; // px/s
export const VOID_DPS = 18; // damage per second while off-screen
export const VOID_PULL_ACCEL = 240; // gentle pull back toward the safe zone
export const WORLD_PADDING = 160; // margin ahead of the camera used for spawning

// --- Plus-grid background (Stage 1) ---
export const GRID_SPACING = 64;
export const GRID_COLOR = 0x1a1a20;

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
export const ENEMY_SPAWN_INTERVAL = 1.6; // seconds (Stage 1: slower baseline for a calmer early game)
export const ENEMY_DAMAGE = 12; // per contact, per second
export const ENEMY_COLOR = 0xef4444;

// --- Early-game difficulty curve (Stage 1) ---
// Waves 1-5 are intentionally gentle, then the ramp kicks in. Per-wave HP bonus
// uses the early rate through wave 5, then the steeper late rate after.
export const EARLY_GAME_WAVES = 5;
export const ENEMY_HP_PER_WAVE_EARLY = 1;
export const ENEMY_HP_PER_WAVE_LATE = 3;
// Per-wave spawn-interval acceleration (seconds shaved off per wave).
export const ENEMY_SPAWN_ACCEL = 0.03;

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

// --- Enemy-enemy separation (Stage 1) ---
// Enemies push each other apart so swarms don't collapse into one blob.
// `gain` converts overlap (px) into added separation velocity (px/s); `max` caps
// that contribution so a tiny enemy wedged under a boss doesn't get launched.
export const ENEMY_SEPARATION_GAIN = 10;
export const ENEMY_SEPARATION_MAX = 160;

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

// --- Dash (Phase B) ---
export const DASH_SPEED = 640; // px/s burst velocity
export const DASH_DURATION = 0.15; // seconds the burst is maintained
export const DASH_COOLDOWN = 3.0; // seconds before the next dash
export const DASH_I_FRAMES = 0.18; // i-frames granted at dash start

// --- Dash upgrades (Stage 3) ---
// `rangeLevel` extends the dash burst speed; `cooldownLevel` shortens the
// cooldown; `trailLevel` leaves a damaging trail zone along the dash path.
export const DASH_RANGE_BONUS = 0.3; // +30% burst speed per range level
export const DASH_CD_REDUCTION = 0.15; // -15% cooldown per cooldown level
export const DASH_CD_MIN = 0.6; // floor for the cooldown multiplier
export const DASH_TRAIL_DPS = 60; // damage per second of a trail zone
export const DASH_TRAIL_DURATION = 1.6; // seconds the trail lingers
export const DASH_TRAIL_RADIUS = 34; // radius of each trail zone segment
export const DASH_TRAIL_COLOR = 0xfbbf24;

// --- Cursed upgrades (Stage 3) ---
// A curse is a run-long negative modifier traded for a strong positive pick.
export const CURSE_SPAWN_MULT = 1.4; // +40% enemy spawn rate
export const CURSE_ENEMY_SPEED_MULT = 1.25; // +25% enemy speed
export const CURSE_MAX_HP_MULT = 0.75; // max HP cut to 75%
export const CURSE_SCROLL_SPEED_MULT = 1.5; // camera scrolls 50% faster

// --- Shield (defensive item, Phase B) ---
export const PLAYER_MAX_SHIELD = 60;
export const SHIELD_PER_PICKUP = 35;

// --- Per-wave obstacle field (Phase B) ---
export const OBSTACLE_BLOCK_COLOR = 0x3a3a42;
export const OBSTACLE_HAZARD_COLOR = 0xb91c1c;
export const OBSTACLE_HAZARD_DPS = 22; // damage per second for hazard obstacles
export const OBSTACLE_BLOCK_MARGIN = 60; // keep blocks away from spawn lanes / edges
export const OBSTACLE_COUNT_BASE = 4; // base obstacles per wave
export const OBSTACLE_HAZARD_CHANCE = 0.28; // chance a given obstacle is a hazard

// --- Health packs (Phase B) ---
export const HEALTH_PACK_HEAL = 35;
export const HEALTH_PACK_SPAWN_INTERVAL = 13; // seconds between periodic spawns
export const HEALTH_PACK_RADIUS = 12;
export const HEALTH_PACK_COLOR = 0x22c55e;
export const HEALTH_PACK_DROP_CHANCE = 0.02; // extra drop chance per enemy kill
export const HEALTH_PACK_PICKUP_RANGE = PLAYER_RADIUS + HEALTH_PACK_RADIUS + 4;

// --- DPS meter (Phase B) ---
export const DPS_WINDOW_SECONDS = 5; // rolling window for per-player DPS
