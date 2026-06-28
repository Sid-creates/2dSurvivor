// Shared domain types. See CONTEXT.md for the glossary.
// These types are the contract between Phaser simulation, network serialization,
// and the React UI overlay. No implementation here, just shapes.

export type PeerRole = "host" | "guest";

export type ConnectionState =
  | "idle"
  | "initializing"
  | "waiting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/** Persistent game-logical actor: owns position, mana, loadout. See CONTEXT.md. */
export interface WeaponInstance {
  kind: import("../sim/weapons").WeaponKind;
  level: number; // 1..MAX_WEAPON_LEVEL
  cooldown: number; // current cooldown remaining
  /** For orbiting weapons, the current angle of the first shard. */
  orbitPhase: number;
}

/** Persistent game-logical actor: owns position, mana, loadout. See CONTEXT.md. */
export interface PlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  /** Absorb-only HP layer; damage hits this before real HP. Phase B: Shield. */
  shieldHp: number;
  maxShield: number;
  /** Whether this player is currently charging a Swap. See CONTEXT.md: Charge. */
  charging: boolean;
  /** Charge progress 0..1. Swap fires when both players reach 1. */
  chargeProgress: number;
  /** Swap invulnerability frames remaining in seconds. See CONTEXT.md: i-frames. */
  iFrames: number;
  /** Dash cooldown remaining in seconds. 0 = ready. Phase B: Dash. */
  dashCooldown: number;
  /** Dash burst time remaining in seconds. >0 means currently dashing. */
  dashTime: number;
  /** Rolling DPS for this player over DPS_WINDOW_SECONDS. Phase B: DPS meter. */
  dps: number;
  /** True when HP reached 0; cannot act or be Swap-targeted. See CONTEXT.md: Downed. */
  downed: boolean;
  /** Downed-state revive progress 0..1; partner must be in proximity to fill. */
  reviveProgress: number;
  color: number;
  /** Active weapons this player owns. See CONTEXT.md: Weapon. */
  weapons: WeaponInstance[];
}

export interface EnemyState {
  id: number;
  x: number;
  y: number;
  hp: number;
  kind: number;
}

export interface ProjectileState {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  color: number;
  /** True if this projectile passes through enemies instead of dying on hit. */
  piercing: boolean;
  /** Lifetime in seconds remaining before despawn. */
  lifetime: number;
  /** If true, projectile orbits its owner instead of flying forward. */
  orbit: boolean;
  /** For orbiting projectiles, the angular offset from the first shard. */
  orbitOffset: number;
  /** Kind of weapon that fired this, for the orbit angle update. */
  weaponKind: import("../sim/weapons").WeaponKind;
  /** True if fired by an enemy and damages players instead of enemies. */
  hostile: boolean;
}

/** A telegraphed ground hazard that damages players standing in it. */
export interface ZoneState {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Seconds of warning before the zone becomes active. 0 once active. */
  telegraph: number;
  /** True once the zone is dealing damage. */
  active: boolean;
  /** Seconds the zone stays active before despawning. */
  duration: number;
  /** Damage per second while active. */
  dps: number;
  color: number;
}

/** A static obstacle placed on the field each wave. Phase B: obstacle field. */
export interface ObstacleState {
  id: number;
  /** "block" pushes entities out; "hazard" deals damage like a zone. */
  kind: "block" | "hazard";
  /** "rect" uses w/h; "circle" uses radius. */
  shape: "rect" | "circle";
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
  color: number;
}

/** A walk-over pickup. Phase B: health packs. */
export interface PickupState {
  id: number;
  x: number;
  y: number;
  kind: "health";
}

/** A Box (loot container) present in the world. See CONTEXT.md: Box. */
export interface BoxState {
  id: number;
  x: number;
  y: number;
  opened: boolean;
  /** The player id currently interacting (Opener). Null until picked up. */
  openerId: string | null;
  /** The three weapon options presented, if any. Null after choice. */
  options: WeaponPickOption[] | null;
}

export interface WeaponPickOption {
  /** A new weapon kind, OR an upgrade to an existing owned weapon. */
  kind: import("../sim/weapons").WeaponKind;
  /** If this option upgrades an existing weapon, its index in the loadout. -1 if new. */
  upgradeIndex: number;
  /** The resulting level after picking (1 if new, current+1 if upgrade). 0 = heal sentinel. */
  resultingLevel: number;
  /** If set, this option grants shield instead of a weapon. Phase B: defensive item. */
  shield?: number;
}

export type RunStatus = "playing" | "won" | "lost";

/** Full authoritative world snapshot, broadcast Host→Guest at 30Hz. */
export interface Snapshot {
  t: number;
  tick: number;
  players: PlayerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  boxes: BoxState[];
  zones: ZoneState[];
  obstacles: ObstacleState[];
  pickups: PickupState[];
  wave: number;
  waveTimer: number;
  isBossWave: boolean;
  bossTimer: number;
  runTime: number;
  runDuration: number;
  runStatus: RunStatus;
}

/** Per-frame input from a single Player. Sent Guest→Host each local frame. */
export interface PlayerInput {
  /** Unit vector or zero, from 8-direction movement. */
  mx: number;
  my: number;
  /** True while the Swap button is held. */
  charging: boolean;
  /** True on the frame the dash button was pressed (edge-triggered). */
  dashPressed: boolean;
}

/** Tagged union for every network message. Used by both Host and Guest. */
export type NetMessage =
  | { kind: "hello"; role: PeerRole; peerId: string }
  | { kind: "input"; peerId: string; input: PlayerInput }
  | { kind: "snapshot"; snapshot: Snapshot }
  | { kind: "lobby"; hostPeerId: string; guestPeerId: string | null }
  | { kind: "boxOpen"; boxId: number; peerId: string }
  | { kind: "boxChoice"; boxId: number; peerId: string; optionIndex: number }
  | { kind: "runEnded"; status: RunStatus };

export const ROLE_HOST: PeerRole = "host";
export const ROLE_GUEST: PeerRole = "guest";
