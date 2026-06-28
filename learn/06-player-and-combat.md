# 06 — Player & combat

Everything your character can do, and the numbers behind it. All constants live
in `src/shared/config.ts`; the behavior lives in `src/sim/World.ts`.

## Movement

- **WASD** → a unit direction `{mx, my}`.
- Acceleration model: you accelerate toward the input direction up to
  `PLAYER_MAX_SPEED = 220 px/s`, and decelerate when you let go. Feels weighty,
  not instant.
- The world is `1280 × 720` (`WORLD_WIDTH/HEIGHT`); players are clamped inside
  with a `PLAYER_RADIUS = 14` margin.
- Solid **block obstacles** push you out (you can't walk through them).

## Dash (Shift)

A short burst used for dodging and repositioning.

- On press (edge-triggered in `InputManager`), if `dashCooldown ≤ 0`:
  - Velocity is set to `DASH_SPEED = 640 px/s` in your input direction (or your
    last facing direction if you're standing still).
  - `dashTime = 0.15s` — the burst is maintained (ignores accel/decel).
  - `dashCooldown = 3.0s` — the HUD shows this as a meter refilling.
  - `iFrames = max(iFrames, 0.18s)` — brief invulnerability ("i-frames").
- No dash while downed or on cooldown.

The i-frames are the real prize: dash *through* a boss charge or a hazard burst.

## Swap (hold Space) — the co-op signature

The team combo. Both players must participate.

- Hold Space to charge. Charging requires `mana ≥ SWAP_MANA_COST = 40`.
- `chargeProgress` fills over `SWAP_CHARGE_DURATION = 0.8s`.
- **Both** players must reach full charge in the same window; then they
  instantly **trade positions**.
- After a Swap, both get `SWAP_I_FRAMES = 0.5s` of invulnerability.
- Mana regenerates at `PLAYER_MANA_REGEN = 6/s`.
- While charging you can't shoot — it's a commitment. Cancel by releasing Space.
- Downed players are excluded (can't be part of a Swap).

> Why "both must consent"? So one player can't yank the other into danger. See
> `docs/adr/0001-swap-single-rule-consent.md`.

## Weapons (auto-fire)

You don't press fire. Each weapon in your loadout auto-fires at the nearest enemy
in its `range` when its cooldown is ready.

- Hold up to `MAX_WEAPONS = 6` weapons at once.
- Each weapon levels 1 → `MAX_WEAPON_LEVEL = 5`. Higher level = more damage +
  usually more projectiles/faster fire.
- Damage scales with level (the `damageFor()` / `intervalFor()` helpers in
  `World.ts`).

The 9 weapons (`src/sim/weapons.ts`):

| Kind | Name | Vibe |
|------|------|------|
| `pulse` | Pulse Bolt | Reliable single shot, nearest enemy. |
| `spread` | Scatter Cone | 3-shot fan; great up close. |
| `orbit` | Orbit Shard | 2 shards orbit you; piercing. |
| `lance` | Phase Lance | Long-range, fast, piercing line. |
| `nova` | Nova Burst | 12-shot radial burst around you. |
| `chain` | Arc Coil | Lightning arcs between nearby enemies (instant). |
| `frost` | Frost Bolt | Slows enemies on hit. |
| `homing` | Seeker Missile | Twin missiles that steer to targets. |
| `mine` | Spore Mine | Drops a proximity mine that explodes in an AoE. |

Each has a `range` used for targeting *and* drawn as a faint circle around your
player (so you can see what your longest weapon can reach).

## Shield (defensive)

- `shieldHp` up to `PLAYER_MAX_SHIELD = 60` is an **absorb layer** that sits on
  top of HP. Incoming damage hits the shield first, then HP (see `applyDamage`).
- You get shield from **Box options** ("Aegis +35", `SHIELD_PER_PICKUP`). It's a
  defensive alternative to picking another weapon.

## Loot Boxes (press E)

- Enemies drop boxes with `BOX_DROP_CHANCE = 5%`; bosses **always** drop one
  (`BOSS_DROP_CHANCE = 1.0`).
- Walk within `BOX_OPEN_RANGE = 50px` and press **E** → the server opens it and
  rolls **3 options** (`rollBoxOptions`).
- Options are one of:
  - **New weapon** (if you have a free slot),
  - **Upgrade** an existing weapon (if not maxed),
  - **Mend** (heal ~30% HP) — appears as a fallback when your loadout is full,
  - **Aegis** (shield top-up) — sometimes offered when you're below max shield.
- Pick one → it's applied on the server and the box despawns.
- One box per player at a time; a box claimed by you can't be stolen.

## Health packs

- Green cross pickups (`HEALTH_PACK_COLOR`). Heal `HEALTH_PACK_HEAL = 35` HP on
  walk-over (only if you're below max HP).
- Spawn periodically (`HEALTH_PACK_SPAWN_INTERVAL = 13s`) at random spots, and
  have a small extra drop chance on enemy kills (`HEALTH_PACK_DROP_CHANCE`).
- Picked up by proximity (`HEALTH_PACK_PICKUP_RANGE`).

## Downed & revive

- HP = 0 → `downed = true`. You can't act; you're not dead yet.
- Your partner stands within `REVIVE_RANGE = 80px`; a `reviveProgress` bar fills
  over `REVIVE_DURATION = 2.5s`; at full you're back up (with some HP).
- If **both** are downed → `runStatus = "lost"`.

## HUD readouts

The React HUD (`src/ui/Hud.tsx`) shows, per player:

- HP bar and **shield bar** (sits above HP),
- Mana bar + Swap charge progress,
- **Dash cooldown meter** (full = ready),
- **DPS** (rolling 5s window),
- Revive progress when relevant,
- The active weapon loadout.

Plus a **controls panel** under the top timer (WASD / Shift / Space / E) so
newcomers always know the keys.

Next: **[07-enemies-waves-boss.md](07-enemies-waves-boss.md)** — what's trying to
kill you.
