# 05 — The simulation: `World.ts`

`src/sim/World.ts` is the heart of the game. It's a **pure state machine**: you
hand it a slice of time, it advances the world, and it can describe itself as a
plain object (`snapshot()`) for the network and the screen.

## The mental model

Imagine the world as a big box of objects:

```
World
 ├── players   (Map<id, InternalPlayer>)   ← the 2 players
 ├── enemies   (Map<id, InternalEnemy>)    ← the swarm
 ├── projectiles (Map<id, InternalProjectile>) ← bullets, bolts, mines, hostile shots
 ├── zones     (Map<id, InternalZone>)     ← telegraphed ground hazards
 ├── obstacles (Map<id, InternalObstacle>) ← blocks + hazard obstacles
 ├── pickups   (Map<id, InternalPickup>)   ← health packs
 └── boxes     (Map<id, InternalBox>)      ← loot boxes
```

Plus some scalar state: `time`, `tick`, `wave`, `waveTimer`, `isBossWave`,
`bossTimer`, `runStatus`, and id counters.

`Internal*` just means "the in-memory shape with extra fields the sim uses but
doesn't send over the wire" (e.g. `bufferedInput`, `facingX`, cooldowns). The
`snapshot()` method converts these to the plain `*State` shapes from
`src/shared/types.ts`.

## The heartbeat: `step(dt)`

The server calls `World.step(SIM_DT)` 60 times per second. `step()` runs the
whole update in a fixed order. Conceptually:

```
step(dt):
  0. Start gate: if not `started`, return early (wait for both players)
  1. If boss wave and boss is dead            → advanceWave()
  2. Wave timer / spawn logic                 → spawn enemies, advance waves
  3. updateCamera(dt)                         → auto-scroll the safe zone, bounce off edges
  4. updatePlayers(dt)                        → movement, dash, void damage, swap charge, firing
  5. updateSpawns(dt)                         → spawn formations ahead of the camera
  6. updateEnemies(dt)                        → chase AI, caster fire, separation, collisions
  7. updateProjectiles(dt)                    → move bullets, homing, orbits, mines
  8. updateZones(dt)                          → telegraph → activate → damage (players OR enemies)
  9. updateObstacles(dt) / updatePickups(dt)  → hazard damage, health pack spawn/collect
 10. resolveCombat(dt)                        → bullets hit enemies, enemies touch players
 11. updateDps(dt) + revive logic + checkLossCondition()
 12. time += dt, tick += 1
```

### Start gate

The world has a `started` flag that latches `true` the moment both players have
joined (in `addHostPlayer` / `addGuestPlayer`). Until then, `step()` returns
immediately — no time passes, no enemies spawn, no snapshots are broadcast. The
PartyKit server only starts its tick loop once the second player connects, so P1
sits in a "Waiting for Player 2…" lobby until P2 arrives. The flag latches (it
does not reset if someone disconnects mid-run), so the survivor keeps playing
even if their partner drops.

### The scrolling camera and the void

The world is a large field (`WORLD_WIDTH × WORLD_HEIGHT`, 3200²). The action
happens inside a smaller **safe zone** — a fixed-size camera rect
(`VIEW_WIDTH × VIEW_HEIGHT`, 1280×720) that **auto-scrolls** across the world at
`CAMERA_SCROLL_SPEED`. Each wave, `advanceWave()` picks a new scroll direction
from a set of 8, so the swarm streams in from a different side every wave. The
camera bounces off the world edges by reflecting its velocity.

Players outside the safe zone take **void damage** (`VOID_DPS` per second) and
get a soft pull back toward the zone. The server owns the camera and includes it
in every snapshot (`snapshot.camera`); the client just sets its Phaser camera
scroll to match and render-culls anything outside it.

### Fixed timestep (why 60Hz matters)

The sim runs at a **fixed** `dt = 1/60`. It never asks "how much real time
passed"; it always steps by exactly that. This makes the simulation
**deterministic**: same inputs → same result, which is great for testing and
fairness. The server uses an accumulator to catch up if the event loop stalls,
with a cap so it can't spiral into a "death loop" of catch-up steps
(`MAX_FRAME_STEPS` in `party/server.ts`).

## The public API (what the server/UI call)

| Method | Who calls it | What it does |
|--------|--------------|--------------|
| `addHostPlayer(id)` / `addGuestPlayer(id)` | server `onConnect` | Spawn a player. |
| `removePlayer(id)` | server `onClose` | Despawn a player. |
| `setPlayerInput(id, input)` | server `onMessage` | Store this player's latest input. |
| `step(dt)` | server loop | Advance the world. |
| `snapshot()` | server broadcast | Produce the plain `Snapshot` to send/draw. |
| `applySnapshot(snap)` | tests | Load a snapshot (lets tests set up exact scenarios). |
| `openBox(id, playerId)` / `chooseBoxOption(...)` / `cancelBox(...)` | server `onMessage` | Box interactions. |
| `applyPickOption(playerId, option)` | `chooseBoxOption` / tests | Apply one option (weapon/shield/dash mod/curse/heal). |
| `requestOpenBox(playerId)` | server | "Player pressed E — find nearest box in range." |
| `spawnBox(x, y)` | tests / drops | Drop a loot box. |
| `getRunStatus()` | UI | `playing` / `won` / `lost`. |
| `getPlayers()` / `getEnemies()` / … | renderer / tests | Read-only views. |

## Inputs flow in, snapshots flow out

Notice the symmetry with the networking doc:

- **In:** `setPlayerInput` stores each player's `{mx, my, charging, dashPressed}`
  in `bufferedInput`. During `updatePlayers`, the world reads that input to move
  the player, start a dash, charge a Swap, etc.
- **Out:** `snapshot()` walks every map and emits plain data.

The world never touches the network or the screen. It's a hermetically sealed
rule engine. That's the whole reason it can run on the server *and* in tests.

## Waves and time

- `RUN_DURATION = 600` s (10 min). When `time >= runDuration` → `runStatus =
  "won"`.
- Waves have a `waveTimer`. When it hits 0 (normal wave) or the boss dies (boss
  wave), `advanceWave()` increments `wave`, picks a new camera scroll direction,
  clears obstacles, generates a fresh obstacle field, and (every 5th wave)
  triggers a boss wave.
- Enemy spawns are throttled by `ENEMY_SPAWN_INTERVAL` and a soft `ENEMY_CAP`.
  The first 5 waves use a gentler difficulty curve (slower spawns, smaller
  formations, slower HP ramp, later enemy-kind unlocks) before ramping up.
- Formations spawn **ahead of the scrolling camera** so enemies stream into view
  from the travel direction. `updateEnemies` also runs a **separation pass** so
  the swarm doesn't collapse into a single blob.

## Damage application: one funnel (`applyDamage`)

All damage to a player goes through one private method, `applyDamage(player,
amount)`:

1. If the player has i-frames or is downed → ignore.
2. Subtract from **shield first** (`shieldHp`), then HP.
3. If HP ≤ 0 → mark `downed`, clear their input/charge/dash.

Centralizing this means shields, hazards, zones, projectiles, and enemy contact
all behave consistently. Outgoing damage is attributed via `recordDamage(owner,
amount)` which feeds the **DPS meter** (a rolling 5-second window per player).

## Testing it (`World.test.ts`)

Because `World` is pure, tests just construct a world, poke it, and assert on
`snapshot()`. Helpers:

- `twoPlayerWorld()` — a fresh world with P1 + P2.
- `makeSnapshot(overrides)` / `applyFromWorld(...)` — set up precise scenarios
  (e.g. "place a boss with 1 HP next to the host").
- Tests cover: start gate, spawning, boxes, Swap, run end conditions, enemy
  separation, enemy variety, boss death, every weapon, dash i-frames/cooldown,
  dash upgrades (range/trail/cooldown), curses (spawn/speed/hp), shield
  absorption, obstacle collisions, hazard damage, health packs, DPS attribution,
  and the scrolling camera + void damage.

Run them with `npm test`. They're fast (no browser) and are the safety net when
you tweak `config.ts` or rules.

Next: **[06-player-and-combat.md](06-player-and-combat.md)** — the player's kit.
