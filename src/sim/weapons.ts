// Weapon archetypes. Each weapon has its own behavior pattern: projectile
// type, fire rate, damage, projectile count, spread, speed, lifetime, color.
// A player's loadout can hold up to MAX_WEAPONS; each can be leveled up to
// MAX_WEAPON_LEVEL for incremental upgrades.

import { ORBIT_RADIUS } from "../shared/config";

export type WeaponKind =
  | "pulse" // single accurate shot at nearest enemy
  | "spread" // 3-shot fan, lower per-hit damage
  | "orbit" // 2 projectiles orbiting the player
  | "lance" // long-range fast piercing shot
  | "nova" // radial burst every interval
  | "chain" // chain lightning that arcs between nearby enemies
  | "frost" // bolt that slows enemies on hit
  | "homing" // missiles that steer toward enemies
  | "mine"; // drops a proximity mine that explodes in an AoE

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  color: number;
  baseDamage: number;
  baseInterval: number; // seconds between auto-attacks
  projectileCount: number;
  projectileSpeed: number;
  projectileLifetime: number;
  spread: number; // radians, 0 = perfectly aimed
  piercing: boolean; // projectile continues through enemies
  orbit: boolean; // projectile orbits owner instead of flying
  /** Targeting range used to acquire a nearest enemy and drawn as the range ring. */
  range: number;
  description: string;
}

export const WEAPON_DEFS: Record<WeaponKind, WeaponDef> = {
  pulse: {
    kind: "pulse",
    name: "Pulse Bolt",
    color: 0x60a5fa,
    baseDamage: 9,
    baseInterval: 0.55,
    projectileCount: 1,
    projectileSpeed: 520,
    projectileLifetime: 1.2,
    spread: 0,
    piercing: false,
    orbit: false,
    range: 340,
    description: "Single accurate bolt. Reliable damage at the nearest threat.",
  },
  spread: {
    kind: "spread",
    name: "Scatter Cone",
    color: 0xf97316,
    baseDamage: 5,
    baseInterval: 0.7,
    projectileCount: 3,
    projectileSpeed: 460,
    projectileLifetime: 0.8,
    spread: 0.4,
    piercing: false,
    orbit: false,
    range: 300,
    description: "Three bolts in a fan. Closer enemies take all three hits.",
  },
  orbit: {
    kind: "orbit",
    name: "Orbit Shard",
    color: 0xa78bfa,
    baseDamage: 4,
    baseInterval: 0.4,
    projectileCount: 2,
    projectileSpeed: 0, // not used; orbits use angular velocity
    projectileLifetime: 2.5,
    spread: 0,
    piercing: true,
    orbit: true,
    range: ORBIT_RADIUS + 16,
    description: "Two shards orbit you, damaging anything they touch.",
  },
  lance: {
    kind: "lance",
    name: "Phase Lance",
    color: 0x22d3ee,
    baseDamage: 13,
    baseInterval: 0.9,
    projectileCount: 1,
    projectileSpeed: 900,
    projectileLifetime: 0.9,
    spread: 0,
    piercing: true,
    orbit: false,
    range: 640,
    description: "Long-range piercing shot. Hits every enemy in its line.",
  },
  nova: {
    kind: "nova",
    name: "Nova Burst",
    color: 0xf43f5e,
    baseDamage: 6,
    baseInterval: 1.4,
    projectileCount: 12,
    projectileSpeed: 380,
    projectileLifetime: 0.9,
    spread: Math.PI * 2, // full radial
    piercing: false,
    orbit: false,
    range: 260,
    description: "Radial burst of twelve shards. Hits everything around you.",
  },
  chain: {
    kind: "chain",
    name: "Arc Coil",
    color: 0xfde68a,
    baseDamage: 10,
    baseInterval: 0.8,
    projectileCount: 3, // number of enemies linked per arc
    projectileSpeed: 0, // instant; visual sparks only
    projectileLifetime: 0.15,
    spread: 0,
    piercing: true,
    orbit: false,
    range: 420,
    description: "Lightning arcs from the nearest enemy to others nearby.",
  },
  frost: {
    kind: "frost",
    name: "Frost Bolt",
    color: 0x7dd3fc,
    baseDamage: 6,
    baseInterval: 0.6,
    projectileCount: 1,
    projectileSpeed: 480,
    projectileLifetime: 1.1,
    spread: 0,
    piercing: false,
    orbit: false,
    range: 320,
    description: "Chilled bolt that slows enemies it strikes.",
  },
  homing: {
    kind: "homing",
    name: "Seeker Missile",
    color: 0xf472b6,
    baseDamage: 11,
    baseInterval: 1.0,
    projectileCount: 2,
    projectileSpeed: 300,
    projectileLifetime: 2.2,
    spread: 0.25,
    piercing: false,
    orbit: false,
    range: 480,
    description: "Twin missiles that steer toward the nearest threat.",
  },
  mine: {
    kind: "mine",
    name: "Spore Mine",
    color: 0x84cc16,
    baseDamage: 22,
    baseInterval: 1.6,
    projectileCount: 1,
    projectileSpeed: 0, // stationary
    projectileLifetime: 6,
    spread: 0,
    piercing: false,
    orbit: false,
    range: 220,
    description: "Drops a mine that bursts, damaging everything nearby.",
  },
};

export const ALL_WEAPON_KINDS: WeaponKind[] = [
  "pulse",
  "spread",
  "orbit",
  "lance",
  "nova",
  "chain",
  "frost",
  "homing",
  "mine",
];

export const MAX_WEAPONS = 6;
export const MAX_WEAPON_LEVEL = 5;
