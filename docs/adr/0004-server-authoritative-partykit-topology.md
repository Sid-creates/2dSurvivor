# 0004 - Server-authoritative PartyKit topology

Supersedes [0002 - host-authoritative network topology](./0002-host-authoritative-topology.md).

## Context

0002 put one peer (the "Host") in charge of the simulation over a PeerJS WebRTC
connection. That worked, but the **Guest** paid the full host round-trip on every
input plus interpolation delay, so the two players had visibly asymmetric latency.
The simulation already lives in a framework-free `World.ts` (no Phaser, no DOM),
so it can run anywhere. The natural fix is to move the authoritative sim off the
clients entirely and onto a server, making both players symmetric clients.

## Decision

Run the authoritative `World` inside a **PartyKit** Durable Object (`party/server.ts`).
One room = one Durable Object instance. Both players are symmetric clients that
connect with `PartySocket`:

- The server steps `World` at a fixed 60Hz and broadcasts snapshots at 30Hz.
- Clients send `input`, `boxOpen`, and `boxChoice` messages; the server applies
  them authoritatively (using the connection id as the player id).
- Clients interpolate between the two most recent snapshots and render. The
  client never steps the simulation.
- `onConnect` assigns slots in connection order (first = P1/host color, second =
  P2/guest color). The room is capped at 2 players. `onClose` removes the player
  and the sim continues; when the room empties it resets for the next pair.

The static client still ships on Vercel; only the authoritative sim moved to
PartyKit. Room codes (`2ds-XXXX`) map directly to PartyKit room ids.

## Why

- **Symmetric latency.** Both clients now experience the same one-way trip to the
  server instead of one client hosting the other. Guests no longer carry the
  host's simulation tick as added input delay.
- **No host migration problem.** The server owns state, so a disconnect just
  drops that player; the sim keeps running. (We explicitly do not add host
  migration, persistent meta-progression, or anti-cheat — same trade-offs as
  0002 for a co-op game between friends.)
- **Reuse.** `World.ts`, the MessagePack codec, `types.ts`, and `config.ts` are
  shared verbatim between client and server, so the migration was a transport
  change, not a sim rewrite.

## Trade-off accepted

- Added infrastructure: a PartyKit deployment in addition to the Vercel client.
- The server is now a single per-room authority, so its tick rate and broadcast
  cadence bound the experience for everyone in that room. Acceptable for 2
  players per room.
