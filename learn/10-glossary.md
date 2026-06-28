# 10 — Glossary

Words you'll meet in the code and docs, defined plainly.

## Networking

- **Server-authoritative** — the server is the single source of truth for the
  game world. Clients only send inputs and render snapshots. (Opposite:
  peer-to-peer where one player's machine is the boss.)
- **PartyKit** — a Cloudflare-powered service for realtime multiplayer. We use it
  to host the authoritative server. (`party/server.ts`, `partykit.json`.)
- **Durable Object (DO)** — a Cloudflare construct: a small stateful actor in the
  cloud. Each game **room** is one DO holding one `World`. (Yes, "Durable Object"
  is two words; people say "DO".)
- **PartySocket** — the client WebSocket library that connects a browser to a
  PartyKit room. (`src/net/NetClient.ts`.)
- **Room / room code** — an isolated match identified by a 4-letter code
  (e.g. `M54E`). Wire id is `2ds-M54E`. (`src/net/roomCode.ts`.)
- **Snapshot** — a complete description of the world the server broadcasts 30×/sec.
  (`Snapshot` in `src/shared/types.ts`.)
- **Input** — a player's button state for one frame: `{mx, my, charging,
  dashPressed}`. (`PlayerInput`.)
- **Interpolation** — drawing smooth in-between frames between arriving snapshots
  so motion looks 60fps even though truth arrives 30fps.
- **i-frames (invulnerability frames)** — a short window after dashing/Swapping
  during which a player takes no damage.
- **MessagePack** — a compact binary encoding (like JSON but smaller) used on the
  wire. (`src/net/codec.ts`.)
- **Cloud-prem** — deploying PartyKit to *your own* Cloudflare account (with
  `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` + `--domain`), instead of
  PartyKit's managed `partykit.dev` zone.

## Simulation

- **`World`** — the pure game state machine. `step(dt)` advances it; `snapshot()`
  describes it. (`src/sim/World.ts`.)
- **Fixed timestep** — the sim always steps by a constant `dt = 1/60`, never by
  real elapsed time. Makes behavior deterministic.
- **`tick`** — a single `step()`; the `tick` counter increments each one.
- **`applyDamage`** — the one funnel through which all player damage flows
  (shield first, then HP, then downed). (`World.ts`.)
- **`recordDamage`** — attributes outgoing damage to a player for the DPS meter.
- **DPS** — damage per second, a rolling 5-second window per player.
  (`DPS_WINDOW_SECONDS`.)
- **Downed** — HP = 0 but not out of the run; revivable by your partner.
- **Revive** — standing near a downed partner for `REVIVE_DURATION` to bring them
  back.
- **Wave** — one round of enemies. `advanceWave()` progresses them; every 5th is
  a boss wave.
- **Formation** — a spawn pattern (cluster, line, ring, V, double-edge).
- **Zone** — a telegraphed ground hazard (warning → active → damage).
- **Obstacle** — a per-wave static field element: `block` (solid, pushes out) or
  `hazard` (damages you on it).
- **Pickup** — a walk-over item (currently: health pack).

## Player mechanics

- **Dash** — Shift; a burst with i-frames + cooldown. (`DASH_*` constants.)
- **Swap** — hold Space; both players charge, then trade places. Costs mana,
  grants i-frames, requires mutual consent.
- **Charge** — the 0→1 progress bar while holding Space. Swap fires when both hit 1.
- **Mana** — resource spent on Swap; regenerates over time.
- **Shield** — an absorb layer on top of HP (`shieldHp` / `maxShield`).
- **Loadout** — the set of weapons a player holds (max 6).
- **Box** — loot container; press E within range to open and pick 1 of 3 options.
- **Weapon level** — 1..5; higher = more damage/fire rate.

## Weapons (kinds)

`pulse`, `spread`, `orbit`, `lance`, `nova`, `chain`, `frost`, `homing`, `mine`.
See `src/sim/weapons.ts` and `06-player-and-combat.md`.

## Architecture / project

- **ADR** — Architecture Decision Record; a short doc capturing *why* a choice
  was made. Live in `docs/adr/`. (e.g. ADR 0004 = the PartyKit topology.)
- **GameBridge** — the typed event bus between Phaser and React.
  (`src/bridge/GameBridge.ts`.)
- **`Internal*`** — in-memory sim shapes with extra fields not sent over the wire
  (e.g. `InternalPlayer.bufferedInput`). `snapshot()` converts them to plain
  `*State`.
- **`*State`** — the plain, serializable shapes that travel in snapshots
  (`PlayerState`, `EnemyState`, …) defined in `src/shared/types.ts`.
- **HUD** — Heads-Up Display; the in-game React overlay. (`src/ui/Hud.tsx`.)
- **CRT overlay** — the CSS scanline/vignette retro effect. (`src/index.css` +
  the div in `App.tsx`.)

## Tooling

- **Vite** — dev server + bundler for the client.
- **Vitest** — the test runner. (`src/sim/World.test.ts`.)
- **Tailwind** — utility-class CSS framework for the React UI.
- **`tsc`** — the TypeScript compiler; `npm run build` runs `tsc -b` first.
- **`noUnusedLocals`** — a strict TS setting that errors on unused
  imports/vars. Common cause of build failures.

---

That's the whole vocabulary. If a word in the code isn't here, search this folder
or check `src/shared/config.ts` / `src/shared/types.ts` — most names are
self-describing once you know the concepts above.
