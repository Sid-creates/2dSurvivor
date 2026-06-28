# 04 — Networking ⭐

This is the most concept-heavy doc. Read it slowly; it has analogies. Once this
clicks, the rest of the project makes a lot more sense.

## The problem multiplayer games solve

You and a friend are on different computers in different cities. There is one
game world, but two screens. How do both screens show the *same* world, and how
do both players' actions affect it, when the internet is slow and messy?

There are a few classic answers. We use one: **server-authoritative**.

## Server-authoritative, in plain English

> Analogy: a board game played over a video call, where one neutral **referee**
> owns the board. You text the referee "I move north." The referee moves your
> piece, resolves what happens, then *takes a photo of the board* and sends it
> to both players. You each update your copy to match the photo.

In our game:

- The **referee** is the PartyKit server (`party/server.ts`).
- The **board** is the `World` object living on that server.
- "**I move north**" is an **input message** you send.
- The "**photo**" is a **snapshot** — a complete description of the world the
  server broadcasts to both players.

The crucial word is **authoritative**: the server's world is the *real* one. Your
client's copy is just a rendering of photos it received. If your client and the
server disagree, **the server wins**.

```
   You (browser)                         Friend (browser)
        │                                       │
        │  "input: move north"                  │  "input: dash"
        ▼                                       ▼
   ┌─────────────────────────────────────────────────┐
   │            PartyKit server (the referee)         │
   │   World.step() 60×/sec → moves everything        │
   │   World.snapshot() 30×/sec → "photo of board"    │
   └─────────────────────────────────────────────────┘
        │                                       │
        │  snapshot                             │  snapshot
        ▼                                       ▼
   draws the world                         draws the world
```

### Why this is good

- **Fairness:** neither player is "host", so neither gets a latency advantage.
- **No cheating:** a player can't lie about their position; the server decides.
- **No host migration:** if one player quits, the other just keeps playing; the
  server is still there.

### The tradeoff

- There's always a little input delay (your press has to reach the server and
  come back). We hide this with **interpolation** (below).

## The pieces, concretely

### 1. The room

When P1 clicks **Create**, the client makes a 4-letter code like `M54E`
(`src/net/roomCode.ts`) and opens a WebSocket to the server at room `2ds-M54E`.
P2 types the code and joins the same room. Each room is an isolated match running
inside a Cloudflare **Durable Object** — basically a tiny persistent actor in the
cloud that holds the `World` for that room.

### 2. The connection: `NetClient.ts`

`src/net/NetClient.ts` wraps a `PartySocket` (a WebSocket client). It has a tiny
public surface:

- `host()` / `join(code)` — connect to a room.
- `send(msg)` — send a `NetMessage` to the server.
- `onMessage(cb)` — get notified when a message arrives.
- `onState(cb)` — connection status changes (connecting, connected, …).

### 3. The wire format: MessagePack

Messages on the wire are **binary**, not JSON. We use **MessagePack**
(`src/net/codec.ts`). It encodes the same data as JSON but much smaller, so a
snapshot is cheaper to send 30 times a second. `encodeMessage`/`decodeMessage`
convert between our typed `NetMessage` objects and bytes.

### 4. The message types (`src/shared/types.ts`)

Every message is one of these (`NetMessage`):

| Direction | `kind` | Purpose |
|-----------|--------|---------|
| Client → Server | `input` | "Here's what I'm pressing this frame." |
| Client → Server | `boxOpen` | "I pressed E near this box." |
| Client → Server | `boxChoice` | "I picked option #2 from this box." |
| Server → Client | `snapshot` | "Here's the entire world right now." |
| (others) | `hello`, `lobby`, `runEnded` | Legacy / lifecycle; mostly unused now. |

Notice the asymmetry: the client sends **tiny intents** (input, box open), and
the server sends back **the whole world** (snapshot). The client is "dumb" on
purpose.

### 5. The server loop: `party/server.ts`

This is the referee's brain. Per room:

- On `onConnect`: assign the player a slot (P1 then P2; max 2; others refused).
- A `setInterval` ticks **60 times per second** (`SIM_DT = 1/60`):
  - `World.step(SIM_DT)` — advance the simulation.
- Every tick also accumulates toward a **30 Hz snapshot** (`SNAPSHOT_INTERVAL`):
  - When due, `World.snapshot()` is encoded and `room.broadcast(...)` sends it to
    *both* players.
- On `onMessage`: decode, then either set the player's input or handle a box
  action — all by calling methods on `World`.
- On `onClose`: remove that player; if the room empties, reset it for the next
  pair.

So the server is a clean loop: **gather inputs → step → broadcast → repeat.**

## Snapshots: the "photo of the board"

A `Snapshot` (`src/shared/types.ts`) contains everything needed to draw the
world:

- `players[]` — both players' positions, HP, mana, shield, dash state, DPS,
  weapons, charge, i-frames, downed/revive state, color.
- `enemies[]`, `projectiles[]`, `boxes[]`, `zones[]`, `obstacles[]`,
  `pickups[]` — every entity.
- `wave`, `waveTimer`, `isBossWave`, `bossTimer` — wave state.
- `runTime`, `runDuration`, `runStatus` — match timer + win/lose.
- `t`, `tick` — a timestamp and a tick counter (used for interpolation).

The server sends the **entire** snapshot each time. For a game this size that's
fine and keeps the client simple (no "delta" math).

## Interpolation: making it look smooth ⭐

Here's the subtle part. The server sends snapshots **30×/sec**, but your screen
refreshes **60×/sec** (or more). If you just drew each snapshot the instant it
arrived, the game would look choppy and jittery.

The fix: **interpolation**. Instead of jumping to the snapshot's positions, the
client **eases toward them** over a few frames. It's like stop-motion animation
with "in-between" frames drawn for you.

`src/sim/GameScene.ts` keeps the latest snapshot and each render frame moves the
on-screen sprites a fraction of the way toward the snapshot's positions. The
result: smooth motion even though the truth only arrives 30×/sec.

> Because of this, what you see is always **a tiny bit behind** the server's real
> state (by design — that's the cost of smoothness). It's a few milliseconds;
> you don't notice.

## Inputs: sending your button presses

Each frame, `GameScene` reads the keyboard via `InputManager`, builds a
`PlayerInput` (`{ mx, my, charging, dashPressed }`), and calls
`net.send({ kind: "input", input })`. The server stores it and uses it on the
next `World.step()`. Movement (`mx, my`) is a **direction**, not a position —
the server applies your speed and collision. That's the authority in action.

## What happens when a player disconnects?

The server's `onClose` removes that player from the `World` and immediately
broadcasts a fresh snapshot so the remaining player sees their buddy vanish
promptly. The run continues for the survivor. If the room empties entirely, the
server resets the `World` so the next two players start clean.

## Putting it together (one round trip)

1. You press **W**. `InputManager` reports `my: -1`.
2. `GameScene` sends `{ kind: "input", input: { mx:0, my:-1, ... } }`.
3. Server receives it, calls `World.setPlayerInput(yourId, input)`.
4. On the next 60Hz tick, `World.step()` moves you north (respecting speed,
   walls, obstacles) and moves everything else.
5. On the next 30Hz snapshot, `World.snapshot()` is broadcast.
6. Both clients receive it; `GameScene` interpolates your sprite northward; the
   React HUD updates your HP/mana bars.

That's the whole multiplayer model. Everything else is rules and rendering.

## Further reading

- `docs/adr/0004-server-authoritative-partykit-topology.md` — the formal "why we
  chose this" write-up.
- `docs/adr/0002-host-authoritative-topology.md` — the *old* P2P design and why
  we left it (guest latency).

Next: **[05-the-simulation-world.md](05-the-simulation-world.md)** — inside the
referee's brain.
