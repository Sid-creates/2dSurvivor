# 0003 - Tech stack: Phaser 3 + PeerJS + MessagePack, React UI overlay

## Context

2DSurvivor is a WebRTC P2P co-op survivor-like with real-time combat, hundreds of on-screen enemies, a pick-3 loot menu, and a coordinated Swap mechanic. We needed to pick the rendering engine, the networking library, the serialization format, and the tick rate. These cluster as one architectural decision because they constrain each other.

## Decision

- **Rendering / game engine**: Phaser 3. Phaser owns the game canvas (world, sprites, projectiles, enemy AI, collisions).
- **UI**: React + Tailwind v4 + Motion, rendered as DOM overlays positioned absolutely on top of the Phaser canvas. React reads game state via a pub/sub bridge off Phaser's event emitter (`Phaser.Events.EventEmitter`). Phaser does not render UI; React does not render world.
- **Networking**: PeerJS over WebRTC data channels. PeerJS handles signaling, offer/answer, ICE; v1 uses PeerJS's public broker for signaling, production replaces with a self-hosted signaling server (Cloudflare Worker or small Node process).
- **Serialization**: MessagePack (@msgpack/msgpack). All Host→Guest snapshots and Guest→Host input messages use MessagePack, not JSON.
- **Tick rate**: Host simulates at 60 Hz. Host broadcasts snapshots at 30 Hz. Guests interpolate snapshot state to display refresh (typically 60-144 Hz).

## Why

**Phaser 3 over PixiJS or Canvas 2D**: Phaser provides input, audio, asset loading, physics, and scene management out of the box. The cost is that Phaser's UI primitives are weak and its rendering owns the canvas. We mitigate by offloading all UI to React DOM overlays, which lets the design-taste skill apply to the parts of the game users perceive as "the interface."

**React DOM overlays over Phaser-native UI**: the UI design language (Tailwind + Motion + the design-taste skill's directives) requires the DOM. Phaser's text rendering and scene-based UI cannot satisfy the typography, motion, accessibility, and contrast requirements the project demands. The cost is a bridge between Phaser's event system and React's state system; the bridge is a well-trodden pattern and worth the UI quality payoff.

**PeerJS over raw RTCPeerConnection**: PeerJS handles the signaling dance (offer/answer/ICE/candidate exchange) over a broker. Raw WebRTC would require us to write a signaling protocol and host a signaling server before any game worked. v1 uses PeerJS's public broker; the swap to a self-hosted signaling server is a deployment change, not an architecture change.

**MessagePack over JSON**: at 30 Hz with up to 200+ enemies, projectiles, and 2-4 players, JSON snapshots would be multiple MB/s and choke consumer connections. MessagePack is roughly 3-5x smaller for the same schema and has a fast JS implementation. The cost is binary debug-ability; mitigated by a dev-mode JSON fallback.

**60 Hz sim, 30 Hz snapshot, display-interpolated**: standard for host-authoritative games of this topology. Higher snapshot rates (60 Hz) double bandwidth for marginal smoothness gain; lower (15 Hz) produces visible stutter. The Guest's local Player movement uses client-side prediction to mask input latency; enemy positions use snapshot interpolation.

## Trade-offs accepted

- Two rendering systems (Phaser canvas + React DOM) means two coordinate spaces and a state bridge. This is the cost of having both a real game engine and a real UI framework.
- Input latency asymmetry between Host and Guest is inherent to host-authoritative topology (see ADR 0002).
- PeerJS public broker is not a production signaling solution; it is a v1 dev convenience. Production requires self-hosted signaling.
