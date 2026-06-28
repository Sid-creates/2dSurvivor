# 02 — The tech stack (and why each piece)

This game is a **client/server** app that happens to render a game. Here's every
tool we use and the job it does.

## The cast

| Tool | Job | Where it lives |
|------|------|----------------|
| **TypeScript** | The language. Adds types to JavaScript so mistakes get caught early. | everywhere |
| **Vite** | Dev server + bundler. Serves the client while coding, builds it for production. | `vite.config.ts`, `package.json` scripts |
| **React** | Builds the UI overlays — lobby, HUD, box menu, end screen. | `src/ui/*.tsx`, `src/App.tsx` |
| **Phaser 3** | The 2D game engine. Draws the world, handles the canvas + game loop on the client. | `src/sim/GameScene.ts` |
| **PartyKit** | The multiplayer server. Runs the game rules authoritatively in the cloud. | `party/server.ts`, `partykit.json` |
| **PartySocket** | The client library that opens a WebSocket to the PartyKit server. | `src/net/NetClient.ts` |
| **MessagePack** (`@msgpack/msgpack`) | Shrinks network messages into compact binary instead of JSON. | `src/net/codec.ts` |
| **Tailwind CSS v4** | Styles the React UI with utility classes. | `src/index.css`, the `className=` strings |
| **Vitest** | Unit test runner. Tests the game rules (`World.ts`) without a browser. | `src/sim/World.test.ts` |

## Why this split? (the big idea)

The single most important design choice: **the game rules don't know about the
screen, and the screen doesn't know about the rules.**

- **Rules** = `src/sim/World.ts`. Pure TypeScript. No Phaser, no DOM, no network.
  You give it a tiny "tick" of time, it moves everything and tells you the new
  state. Because it's pure, it can run **on the server** (PartyKit) *and* in a
  **test** (`World.test.ts`) with zero changes.
- **Screen** = `src/sim/GameScene.ts` (Phaser) + `src/ui/*` (React). They just
  *display* what the rules decided and *send* the player's button presses back.

This separation is why the project is approachable: you can understand the game
by reading one file (`World.ts`), and you can test it by calling functions.

## The three "layers" running at once

When you're playing, three things are happening simultaneously:

1. **Server (PartyKit, in the cloud):** runs `World.step()` 60 times a second,
  moves enemies, resolves hits, and broadcasts the world state ("snapshot") to
  both players 30 times a second.
2. **Client simulation view (Phaser):** receives snapshots, smoothly draws them,
  reads your keyboard, and sends your inputs to the server.
3. **Client UI (React):** draws the lobby, the HUD bars, the box upgrade menu —
  anything that's easier in HTML than on a canvas.

Phaser and React don't talk to each other directly. They talk through a tiny
**event bus** called `GameBridge` (`src/bridge/GameBridge.ts`). Think of it as a
telephone between the two layers:

```
Phaser (canvas)  <--events-->  GameBridge  <--events-->  React (HUD/menus)
```

## Why PartyKit (and not "just send data between the two browsers")?

You *could* connect two browsers directly (peer-to-peer). We tried that first.
The problem: one player's browser had to be "the boss" (host-authoritative), and
the other player (guest) suffered extra latency because their button presses had
to make a round trip to the host and back.

PartyKit puts a **neutral server in the middle** that's the boss instead. Now
both players are equal: each sends inputs to the server, the server decides
everything, and both get the same snapshots. Latency is symmetric and there's no
"host migration" problem if someone disconnects. (We wrote this decision down in
`docs/adr/0004-server-authoritative-partykit-topology.md`.)

## What's *not* here (so you don't go looking)

- No backend database. Game state lives in memory inside a PartyKit **Durable
  Object** (one per room) for the duration of a match. Nothing is persisted.
- No user accounts or matchmaking. You share a 4-letter room code with a friend.
- No 3D, no physics engine. It's 2D circles and rectangles; collisions are
  hand-written math.

Next: **[03-project-map.md](03-project-map.md)** — tour the folders and files.
