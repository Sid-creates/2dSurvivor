# 01 — What is this game?

## The elevator pitch

**Cursed 2D Survivor** is a 2-player co-op, top-down, wave-based survival game.
Think *Vampire Survivors*: your weapons fire automatically, enemies swarm you,
you collect upgrades, and you try to stay alive. The twist: it's built for **two
friends over the internet**, and the two players can **Swap positions** as a
combo ability.

## The win / lose

- **Win:** survive for **10 minutes** (`RUN_DURATION = 600` seconds in
  `src/shared/config.ts`).
- **Lose:** both players are **downed** (HP hits 0) at the same time. If only one
  goes down, the other can **revive** them by standing nearby for a few seconds.

## The moment-to-moment loop

1. Enemies spawn from the edges and walk toward you.
2. Your weapons auto-fire at the nearest enemy — you don't press "shoot".
3. You move to dodge, kite, and group enemies.
4. Enemies sometimes drop **Boxes** (loot). Walk up and press **E** to open one
   and pick from 3 random upgrades (a new weapon, an upgrade, a heal, or a shield).
5. Every wave gets harder. Every 5th wave is a **boss wave**.
6. Survive. Repeat.

## Controls

| Key | What it does |
|-----|--------------|
| **W A S D** | Move (8 directions). |
| **Shift** | **Dash** — a quick burst in your movement direction with brief invulnerability. ~3s cooldown. |
| **Space** (hold) | **Charge Swap** — hold with your partner to swap positions. Costs mana. |
| **E** | **Open** the nearest loot Box / pick its option. |

You'll also see these on screen: the HUD has a **controls panel** under the timer
showing the same thing.

## The two players

- **P1** (host color = blue) and **P2** (guest color = orange). The colors are
  set in `PLAYER_COLORS` in `src/shared/config.ts`.
- You each have your own HP, mana, shield, and weapon loadout.
- The signature co-op move is **Swap**: both hold Space, both fill a charge bar,
  and you instantly trade places — great for rescuing a cornered buddy. While
  charging you can't shoot, so it's a commitment. After a Swap you get brief
  **i-frames** (invulnerability).

## A note on "downed" vs "dead"

When your HP hits 0 you're **downed**, not dead. You lie on the ground and can't
act. Your partner has **2.5 seconds** of standing next to you to revive you
(`REVIVE_DURATION`). If *both* of you are downed at once, the run ends. So
positioning and revives are the heart of the co-op.

## What "feels" like the game

The fun comes from:

- **Build variety:** 9 weapons, up to 6 at once, each levelable to level 5 → lots
  of loadout combos.
- **Positioning:** dashing through danger, swapping to save a friend, kiting
  bosses into your AoE.
- **Escalation:** waves get denser, new enemy types appear, the field gets
  cluttered with blocks and hazard zones.

Next: **[02-tech-stack.md](02-tech-stack.md)** — the tools that make this run.
