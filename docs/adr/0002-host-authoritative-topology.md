# 0002 - Host-authoritative network topology

> **Superseded by [0004](./0004-server-authoritative-partykit-topology.md).**
> We moved off the PeerJS host-authoritative P2P topology to a PartyKit
> server-authoritative model because the guest player carried the host's
> simulation round-trip as input latency. 0002 is retained for history.

## Context

2DSurvivor is a WebRTC peer-to-peer game starting at 2 players and scaling to 4. The world can contain hundreds of simultaneous enemies, projectiles, and loot boxes. We had to choose between host-authoritative simulation (one peer simulates, others render) and symmetric lockstep/rollback (all peers simulate, reconcile via deterministic simulation or rollback).

## Decision

One peer is the **Host**: it owns the world simulation (enemy spawns, AI, projectile motion, box rolls, collision, damage). All other peers are **Guests**: they send their local player's inputs to the Host and render snapshots the Host broadcasts at a fixed tick rate (target 30 Hz, interpolated to display refresh).

## Why

Symmetric lockstep over WebRTC for a survivor-like with 200+ active entities is impractical:

- Determinism across browsers and OSes is fragile (floating-point, Math.random, JS engine differences). One desync propagates forever.
- Lockstep introduces input latency proportional to peer RTT, which feels terrible in a twitchy survivor-like.
- Rollback (GGPO-style) requires the entire sim to be rewindable and replays to converge, which is a multi-quarter project on its own before any game design happens.

Host-authoritative has clear costs:

- The Guest experiences input latency equal to half-RTT plus interpolation delay (~50-100ms typical). We mitigate with client-side input prediction for the local player's own movement only (not for enemies, not for Swap resolution).
- The Host has authority over loot rolls and box contents, which means a malicious Host could cheat. We accept this for a co-op game between friends; anti-cheat is out of scope for v1.

The Host/Guest distinction is a **Peer role**, not a Player property. A Player is the persistent game-logical actor; the Host is which Peer happens to be simulating this session. Host migration (if the Host disconnects) is a future concern, not v1.

## Trade-off accepted

- Input latency asymmetry between Host and Guest players. This is the cost of ship-ability.
