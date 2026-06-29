# 07 — Enemies, waves & boss

What's trying to kill you, how it spawns, and how it escalates. Definitions live
in `src/shared/config.ts` (`ENEMY_DEFS`, wave constants); behavior in
`src/sim/World.ts`.

## Enemy types (`ENEMY_DEFS`)

| kind | Name | HP | Speed | Notes |
|------|------|----|----|-------|
| 1 | Walker | 20 | 70 | The basic chaser. Available from wave 1. |
| 2 | Boss | 400 (+220/tier) | 55 | Big; casts zones + summons adds. Every 5th wave. |
| 3 | Charger | 12 | 138 | Fast, fragile. Rushes you. |
| 4 | Brute | 90 | 42 | Tanky, slow, high contact damage. |
| 5 | Caster | 34 | 50 | **Ranged**: keeps distance and fires hostile projectiles. |

Enemy contact deals `damage` per second while overlapping you. Casters fire
projectiles (`ENEMY_PROJ_SPEED`, `ENEMY_PROJ_DAMAGE`) every
`CASTER_FIRE_INTERVAL = 2.2s` when in range, and try to keep
`CASTER_PREF_RANGE = 240px` from you.

## How enemies spawn — formations

Instead of a random trickle, each wave picks a **formation pattern** and spawns a
group at once, **just ahead of the scrolling camera** so the swarm streams into
view from the travel direction. This makes waves feel distinct and ties into the
moving safe zone. Patterns (see `spawnFormation` in `World.ts`):

- **cluster** — a tight blob ahead of the camera.
- **line** — a row across the camera's forward edge.
- **ring** — a ring charging in.
- **V** — a wedge pointing back toward the players.
- **flank** — half ahead, half from one perpendicular flank (pincer).

The formation picker is keyed by wave number, so higher waves use meaner
patterns. Spawns are still throttled by `ENEMY_SPAWN_INTERVAL` and a soft
`ENEMY_CAP = 90` so the screen never melts. Enemies also run a **separation
pass** every tick so they spread out instead of collapsing into one blob.

## Waves & escalation

- Each wave has a timer (`waveTimer`). Clear the timer → `advanceWave()`:
  - `wave += 1`,
  - pick a **new camera scroll direction** (8 directions, cycled per wave),
  - clear the old obstacle field and generate a **new** one within a band around
    the camera (`generateObstacles(wave)`),
  - every 5th wave (`wave % 5 === 0`) → **boss wave**.
- **Early-game curve**: waves 1–5 are gentler — slower spawns, smaller
  formations (`3 + floor(wave/5)`), a slower HP ramp, and later enemy-kind
  unlocks (Charger from wave 4, Brute from wave 6, Caster from wave 8). After
  wave 5 the ramp steepens.
- A **Swarm curse** (Stage 3) multiplies the spawn rate for the rest of the run.

## Boss waves

- `isBossWave = true`; a Boss spawns (`spawnBoss()`). Boss HP scales by tier:
  `BOSS_BASE_HP + (tier-1) * BOSS_HP_PER_TIER`, where `tier = floor(wave/5)`.
- The wave **does not end on a timer** — it ends when **the boss is killed**
  (there's a check at the top of `step()`). This was a deliberate fix: previously
  the timer ran out and skipped the boss.
- While alive, the boss:
  - casts **damage zones** every `BOSS_ZONE_INTERVAL = 3.4s`,
  - **summons adds** (`BOSS_SUMMON_COUNT = 3`) every `BOSS_SUMMON_INTERVAL = 6.5s`.
- Bosses always drop a loot box on death.

## Damage zones (telegraphed ground hazards)

Cast by bosses (and represented as `ZoneState` on the wire).

- A zone appears with a **telegraph** warning (`ZONE_TELEGRAPH = 1.2s`) — a
  visible circle showing where it will erupt. No damage yet.
- After the telegraph, `active = true` for `ZONE_DURATION = 2.8s`, dealing
  `ZONE_DPS = 26` damage/s to any player inside.
- So the loop is: **see the circle → get out → it erupts → avoid it.**

## Obstacles (per-wave field)

Each wave sprinkles `OBSTACLE_COUNT_BASE + floor(wave/3)` obstacles across the
field (seeded by wave, so both players see the same layout):

- **block** (`OBSTACLE_BLOCK_COLOR`): solid; pushes players *and* enemies out.
  Use them to break enemy pathing and line-of-sight.
- **hazard** (`OBSTACLE_HAZARD_COLOR`, ~28% chance): deals
  `OBSTACLE_HAZARD_DPS = 22` damage/s while you stand on it — like a permanent
  mini-zone. Don't kite through these.

Shapes are mixed `rect` / `circle`. They're cleared and regenerated every wave.

## Status effects

- **Frost slow**: `frost` weapons apply `FROST_SLOW_FACTOR = 0.5` (half speed)
  for `FROST_SLOW_DURATION = 1.6s`. Great vs. chargers and the boss.
- **Mines**: `mine` drops a stationary mine; after `MINE_ARM_TIME` it arms, and
  when an enemy comes within `MINE_TRIGGER_RANGE` it detonates a
  `MINE_BLAST_RADIUS` AoE for big damage.

## Putting it together — a typical wave

1. Wave starts; a new obstacle field appears.
2. A formation (say, **double-edge**) spawns walkers + a couple chargers from
   both sides.
3. You dash through a gap, your pulse/lance auto-fire, a frost bolt slows a
   charger.
4. A caster hangs back plinking you; you swap with your partner to dive it.
5. A box drops; you grab it mid-fight, pick an upgrade, keep going.
6. Timer ends → next wave, harder, new layout.

Every 5th wave, swap the trickle for a boss + zones + adds and survive the
eruptions.

Next: **[08-ui-and-rendering.md](08-ui-and-rendering.md)** — how all this gets
drawn.
