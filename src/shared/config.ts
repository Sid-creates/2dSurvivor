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
