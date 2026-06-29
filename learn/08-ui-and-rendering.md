# 08 — UI & rendering

How the world (rules) becomes a picture (screen) plus menus. Two rendering
systems work side by side: **Phaser** (the canvas/game) and **React** (HTML
overlays), bridged by `GameBridge`.

## The two renderers, and why both

- **Phaser 3** is great at thousands of moving sprites on a canvas at 60fps.
  It draws the world: players, enemies, bullets, zones, obstacles, health packs,
  boxes, the range ring, and the screen shake.
- **React** is great at structured UI: bars, menus, text, buttons, layout.
  It draws the lobby, HUD, box menu, and end screen.

We use each for what it's best at. They never call into each other directly.

## `GameBridge.ts` — the telephone

A tiny typed event bus (`src/bridge/GameBridge.ts`). Phaser emits events like
"snapshot arrived", "my HP changed", "a box opened with these options". React
subscribes and updates the HUD/menu. React emits events like "player picked box
option #2". Phaser (or `App.tsx`) subscribes and sends the corresponding network
message.

```
Phaser  ──emit──►  GameBridge  ──subscribe──►  React (HUD/menu)
React   ──emit──►  GameBridge  ──subscribe──►  Phaser / App  ──►  server
```

This decoupling is why you can change the HUD without touching the game loop.

## Phaser: `GameScene.ts`

`src/sim/GameScene.ts` is a Phaser `Scene`. Per render frame it:

1. Reads the keyboard via `InputManager` → builds a `PlayerInput` → sends
   `{ kind: "input" }` to the server.
2. Takes the latest **snapshot** from `NetClient` and **interpolates** every
   sprite toward its snapshot position (smoothness — see `04-networking.md`).
3. Sets the Phaser camera scroll to `snapshot.camera.x/y` so the view follows the
   server-owned **auto-scrolling safe zone**.
4. Draws a **plus-grid background** (`GRID_SPACING = 64px`) only across the
   visible camera region (re-anchored each frame).
5. **Render-culls** entities outside the safe zone (+ margin) so the large world
   doesn't waste draw calls.
6. Draws/updates sprites for: players, enemies, projectiles (each weapon has a
   distinct **shape** — circle, triangle, square, diamond, star, rect, spark),
   zones (telegraph vs active vs dash-trail), obstacles, pickups, boxes.
7. Draws **per-weapon range rings** around the local player — a faint outer ring
   at each weapon's `range` and a brighter inner ring at its `activationRange`.
8. Draws the **void edge** — a border around the safe zone (turns red when you're
   outside and taking void damage).
9. Draws an **off-screen buddy arrow** at the screen edge pointing toward your
   partner if they're outside the safe zone.
10. **Screen shake**: if the local player's HP just dropped, calls
    `this.cameras.main.shake(...)` for punchy feedback.
11. Forwards box-open/box-choice intents through the bridge → server.

`GameScene` does **not** run the simulation. It only renders snapshots and sends
inputs. The server is the boss.

## React overlays (`src/ui/`)

- **`Lobby.tsx`** — pre-game. Create or join a room, see/share the 4-letter room
  code, connection status. Once connected, shows **"Waiting for Player 2 to
  join…"** until the server starts the run (start gate).
- **`Hud.tsx`** — in-game overlay. Per-player stat blocks (HP, shield, mana,
  Swap charge, dash cooldown meter, **dash upgrade tags**, **curse tags**, DPS),
  the wave/timer header, and a **controls panel** (WASD / Shift / Space / E).
- **`BoxMenu.tsx`** — when you open a box, a modal with 3 cards (new weapon /
  upgrade / Mend / Aegis / **dash upgrades** / **cursed** picks). Cursed cards
  use a red warning style; dash cards use a gold accent. Each weapon card shows
  damage, fire rate, range, pierce/orbit tags. Click one → emits the choice →
  server applies it.
- **`EndScreen.tsx`** — the win/lose screen when `runStatus` becomes `won`/`lost`.

## `App.tsx` — the conductor

`src/App.tsx` is the top-level React component. It:

- Owns the `NetClient` (the WebSocket) and the Phaser game instance lifecycle.
- Watches connection state → drives `phase` (`lobby` / `in-game` / `ended`).
- On the **first `snapshot` with `started === true`** from the server, starts the
  Phaser game (both players do this — symmetric). P1 stays in the lobby until P2
  joins and the server latches `started`.
- Creates the Phaser game at **`VIEW_WIDTH × VIEW_HEIGHT`** (1280×720) — the
  safe-zone viewport — not the full world size.
- Emits the local player id + room code to the bridge (for the HUD/lobby).
- Renders the CRT overlay div during play (see below).

## The CRT retro effect

A pure-CSS overlay (`src/index.css` `.crt-overlay`) rendered as a fixed div in
`App.tsx` during `in-game`:

- **Scanlines** via `repeating-linear-gradient`,
- **Vignette** (darkened edges) via `radial-gradient`,
- faint **chromatic aberration** via a `::after` gradient.

`pointer-events: none` so it never blocks clicks, `z-index` above the canvas but
below menus. It's the "retro monitor" vibe and easy to toggle off by removing the
div.

## Styling: Tailwind v4

The React UI uses **Tailwind** utility classes (e.g. `className="rounded-lg
border bg-[var(--color-surface)] …"`). Design tokens (colors like
`--color-accent`, `--color-surface`) are defined in `src/index.css`. It's a dark,
focused, game-arcade aesthetic.

## Where the colors come from

Entity colors are numbers (e.g. `0x60a5fa` blue, `0xf97316` orange) defined in
`config.ts` (`PLAYER_COLORS`, `ENEMY_COLOR`, `OBSTACLE_*_COLOR`,
`HEALTH_PACK_COLOR`, weapon colors in `weapons.ts`). Phaser renders them
directly; the React HUD uses the CSS tokens for the chrome.

Next: **[09-running-and-deploying.md](09-running-and-deploying.md)** — run it,
test it, ship it.
