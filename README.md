# 2DSurvivor

A peer-to-peer co-op survivor-like where two players fight waves of enemies, find random weapons from boxes, and can coordinate a position Swap to trade places on the battlefield.

## Play with a friend

You and your friend both load the same deployed URL. One clicks **Host**, shares the **room code**, the other types the code and clicks **Join**.

### Host it free on Vercel (recommended)

```bash
npm install -g vercel
vercel
```

Follow the prompts (accept defaults). Vercel gives you a URL like `2dsurvivor.vercel.app`. Share that URL with your friend. Both of you open it in your browser.

The game is pure peer-to-peer WebRTC. Vercel only hosts the static files. No game server runs anywhere. The PeerJS public broker (`0.peerjs.com`) handles the brief signaling handshake to punch through NAT; once connected, the two browsers talk directly to each other.

### Host it locally for same-network testing

```bash
npm run dev
```

Open `http://localhost:5173/` in your own browser, and `http://<your-local-ip>:5173/` on another device on the same WiFi (Vite prints the network URL on startup).

### Why not PartyKit / a real game server?

This game uses WebRTC data channels. The two players' browsers connect directly to each other after a one-time signaling handshake. There is no server-authoritative game loop running anywhere in production; the Host peer's browser runs the simulation. So you only need static file hosting plus the PeerJS public broker. PartyKit would be the right choice if we had a WebSocket-based server-authoritative model, but for P2P it's unnecessary overhead.

### Controls

- **WASD** or **arrow keys** to move (acceleration-based, with momentum).
- **Space** (hold) to charge a Swap. Both players must hold and complete their charge to fire the Swap, which trades their positions and grants i-frames to both. Costs mana.
- **E** to open a nearby Box (triggers the pick-3 weapon menu).

## Architecture

See [`CONTEXT.md`](./CONTEXT.md) for the domain glossary and [`docs/adr/`](./docs/adr/) for the architectural decisions. The short version:

- **Phaser 3** owns the game canvas (world, sprites, projectiles, enemy AI). Simple shapes are drawn with graphics primitives, no assets.
- **React + Tailwind v4 + Motion** renders all UI as DOM overlays (lobby, HUD, swap charge meters) over the Phaser canvas.
- **PeerJS** over WebRTC for the data channel. Host-authoritative: the Host simulates at 60Hz and broadcasts snapshots at 30Hz; the Guest sends inputs and renders interpolated state.
- **MessagePack** for wire serialization.

## Project structure

```
src/
  shared/           # Pure types and constants. No framework code.
    types.ts        # Domain types (Player, Peer, Snapshot, etc.)
    config.ts       # Tunable constants (tick rates, speeds, costs)
  sim/              # Phaser game world. No React, no networking.
    World.ts        # Pure simulation. Could run headless.
    GameScene.ts    # Phaser scene. Renders World. Host steps, Guest interpolates.
    InputManager.ts # Keyboard input sampling.
  net/              # Networking. No Phaser, no React.
    NetClient.ts    # PeerJS wrapper. Host/Guest roles.
    codec.ts        # MessagePack encode/decode.
  bridge/
    GameBridge.ts   # Typed event bus between Phaser and React.
  ui/               # React DOM overlays. No Phaser, no networking.
    Lobby.tsx       # Pre-game: host/join screen.
    Hud.tsx         # In-game: HP, mana, wave timer, swap charge meters.
  App.tsx           # Top-level orchestrator.
  main.tsx          # React root.
  index.css         # Tailwind v4 + design tokens.
```

## Status

v1 playable prototype. Working:

- WebRTC connection via PeerJS with short 4-character room codes
- Host-authoritative simulation with fixed-timestep 60Hz step
- 30Hz snapshot broadcast, guest-side interpolation
- Acceleration/momentum player movement
- Five distinct weapons (Pulse Bolt, Scatter Cone, Orbit Shard, Phase Lance, Nova Burst) with leveling
- Auto-attack with nearest-enemy targeting, per-weapon fire patterns
- Weapon loadout system (up to 4 weapons per player, upgradeable to level 4)
- Box loot drops from enemies and bosses; press E near a box to open
- Pick-3 weapon menu (choose new weapon or upgrade existing; "Mend" heal option when loadout is full)
- Boss waves every 5 waves with DPS-check timer
- Two-party-consent Swap mechanic with charge meters and i-frames
- Downed state with proximity revive (stand near your downed partner for 2.5s)
- Contact damage, HP/mana bars, run timer
- Win condition: survive 10 minutes
- Loss condition: both players downed simultaneously
- End-of-run screen with stats and return-to-lobby

Not yet built:

- Host migration (host disconnect ends the session)
- Production signaling server (uses PeerJS public broker)
- More enemy types and bosses (currently one basic enemy + one boss)
- Sound and music
- Persistent unlocks or meta-progression
