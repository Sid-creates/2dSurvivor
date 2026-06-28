// Weapon archetypes. Each weapon has its own behavior pattern: projectile
// type, fire rate, damage, projectile count, spread, speed, lifetime, color.
// A player's loadout can hold up to MAX_WEAPONS; each can be leveled up to
// MAX_WEAPON_LEVEL for incremental upgrades.

export type WeaponKind =
  | "pulse" // single accurate shot at nearest enemy
  | "spread" // 3-shot fan, lower per-hit damage
  | "orbit" // 2 projectiles orbiting the player
  | "lance" // long-range fast piercing shot
  | "nova"; // radial burst every interval

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
  description: string;
}

export const WEAPON_DEFS: Record<WeaponKind, WeaponDef> = {
  pulse: {
    kind: "pulse",
    name: "Pulse Bolt",
    color: 0x60a5fa,
    baseDamage: 12,
    baseInterval: 0.55,
    projectileCount: 1,
    projectileSpeed: 520,
    projectileLifetime: 1.2,
    spread: 0,
    piercing: false,
    orbit: false,
    description: "Single accurate bolt. Reliable damage at the nearest threat.",
  },
  spread: {
    kind: "spread",
    name: "Scatter Cone",
    color: 0xf97316,
    baseDamage: 7,
    baseInterval: 0.7,
    projectileCount: 3,
    projectileSpeed: 460,
    projectileLifetime: 0.8,
    spread: 0.4,
    piercing: false,
    orbit: false,
    description: "Three bolts in a fan. Closer enemies take all three hits.",
  },
  orbit: {
    kind: "orbit",
    name: "Orbit Shard",
    color: 0xa78bfa,
    baseDamage: 6,
    baseInterval: 0.4,
    projectileCount: 2,
    projectileSpeed: 0, // not used; orbits use angular velocity
    projectileLifetime: 2.5,
    spread: 0,
    piercing: true,
    orbit: true,
    description: "Two shards orbit you, damaging anything they touch.",
  },
  lance: {
    kind: "lance",
    name: "Phase Lance",
    color: 0x22d3ee,
    baseDamage: 18,
    baseInterval: 0.9,
    projectileCount: 1,
    projectileSpeed: 900,
    projectileLifetime: 0.7,
    spread: 0,
    piercing: true,
    orbit: false,
    description: "Long-range piercing shot. Hits every enemy in its line.",
  },
  nova: {
    kind: "nova",
    name: "Nova Burst",
    color: 0xf43f5e,
    baseDamage: 9,
    baseInterval: 1.4,
    projectileCount: 12,
    projectileSpeed: 380,
    projectileLifetime: 0.9,
    spread: Math.PI * 2, // full radial
    piercing: false,
    orbit: false,
    description: "Radial burst of twelve shards. Hits everything around you.",
  },
};

export const ALL_WEAPON_KINDS: WeaponKind[] = [
  "pulse",
  "spread",
  "orbit",
  "lance",
  "nova",
];

export const MAX_WEAPONS = 4;
export const MAX_WEAPON_LEVEL = 4;
