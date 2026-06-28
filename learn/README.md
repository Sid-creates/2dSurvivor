# Learn — how this game works

A plain-language guide to the **Cursed 2D Survivor** project. No prior experience
assumed. Read the files in order, or jump to whatever you're curious about.

> New to coding or multiplayer games? Start with `01-what-is-this-game.md`, then
> `02-tech-stack.md`. The networking one (`04-networking.md`) is the most
> "concepts-heavy" — take it slow, it has analogies.

## Read in this order

1. **[01-what-is-this-game.md](01-what-is-this-game.md)** — the game, the loop, the controls, the goal.
2. **[02-tech-stack.md](02-tech-stack.md)** — every tool we use and why (Phaser, React, PartyKit, …).
3. **[03-project-map.md](03-project-map.md)** — which file does what, folder by folder.
4. **[04-networking.md](04-networking.md)** — how two computers play together: server-authoritative, snapshots, interpolation. ⭐
5. **[05-the-simulation-world.md](05-the-simulation-world.md)** — the "physics engine" of the game (`World.ts`).
6. **[06-player-and-combat.md](06-player-and-combat.md)** — movement, dash, Swap, weapons, shield, loot boxes, health packs.
7. **[07-enemies-waves-boss.md](07-enemies-waves-boss.md)** — enemy types, formations, damage zones, boss waves.
8. **[08-ui-and-rendering.md](08-ui-and-rendering.md)** — how the picture gets on screen (Phaser) and the React HUD/menus.
9. **[09-running-and-deploying.md](09-running-and-deploying.md)** — install, run locally, test, build, put it on the internet.
10. **[10-glossary.md](10-glossary.md)** — words you'll see in the code, defined.

## Quick orientation

- **What it is:** a 2-player, top-down, wave-based survival game (like *Vampire
  Survivors* meets a co-op buddy). You both fight off waves of enemies, pick up
  loot, and try to survive 10 minutes.
- **Where the "truth" lives:** a single server (PartyKit) runs the game rules.
  Your browser is just a *remote control + screen*. This is called
  **server-authoritative** and is the single most important idea in the project.
- **Code shape:** the rules are in one framework-free file (`src/sim/World.ts`)
  so the *same code* runs on the server and in tests. The screen is Phaser
  (`src/sim/GameScene.ts`). The menus/HUD are React (`src/ui/`). They talk
  through a tiny event bus (`src/bridge/GameBridge.ts`).

## How to use this guide

- Words in `code font` are file names, variable names, or things you can search
  for in the codebase.
- ⭐ marks the conceptually important stuff.
- When a doc says "see `file.ts`", open that file and skim it — the docs are a
  map, the code is the territory.
