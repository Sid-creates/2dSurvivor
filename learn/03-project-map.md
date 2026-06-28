# 03 — Project map: which file does what

Here's the whole project, top to bottom. Use this as a "you are here" map.

```
2DSurvivor/
├── party/
│   └── server.ts            The PartyKit server. Runs World.ts 60Hz, broadcasts 30Hz.
│
├── src/
│   ├── main.tsx             App entry. Mounts <App/> into the page.
│   ├── App.tsx              Top-level React component. Owns the NetClient + Phaser lifecycle.
│   ├── index.css            Global styles + Tailwind + the CRT overlay effect.
│   ├── vite-env.d.ts        TypeScript hints for Vite env vars (VITE_PARTYKIT_HOST).
│   ├── shims.d.ts           Small type shims.
│   │
│   ├── shared/              "Contract" code shared by server + client + tests.
│   │   ├── config.ts        Every tunable number (speeds, HP, cooldowns, colors).
│   │   └── types.ts         Every data shape (PlayerState, Snapshot, NetMessage, …).
│   │
│   ├── sim/                 The game itself.
│   │   ├── World.ts         ★ The pure simulation. All rules live here.
│   │   ├── World.test.ts    Vitest unit tests for the rules.
│   │   ├── weapons.ts       The 9 weapon definitions (damage, range, behavior).
│   │   ├── GameScene.ts     The Phaser scene. Renders the world, reads input, sends to server.
│   │   └── InputManager.ts  Reads the keyboard into a tidy "frame input" object.
│   │
│   ├── net/                 Networking (client side).
│   │   ├── NetClient.ts     One WebSocket (PartySocket) to the server. send()/onMessage().
│   │   ├── codec.ts         Encode/decode messages to/from MessagePack binary.
│   │   └── roomCode.ts      Generate/parse the 4-letter room codes + player IDs.
│   │
│   ├── bridge/
│   │   └── GameBridge.ts    The event bus between Phaser and React.
│   │
│   └── ui/                  React overlays.
│       ├── Lobby.tsx        Pre-game: create/join a room, show the room code.
│       ├── Hud.tsx          In-game: HP/shield/mana bars, dash meter, DPS, controls, timer.
│       ├── BoxMenu.tsx      The "pick 1 of 3 upgrades" overlay when you open a Box.
│       └── EndScreen.tsx    The win/lose screen at the end of a run.
│
├── docs/
│   └── adr/                 "Architecture Decision Records" — why we chose what we chose.
│       ├── 0001-swap-single-rule-consent.md
│       ├── 0002-host-authoritative-topology.md   (superseded — the old P2P design)
│       ├── 0003-tech-stack.md
│       ├── 0004-server-authoritative-partykit-topology.md  ★ the current networking design
│       └── README.md
│
├── learn/                   ← you are here. This guide.
│
├── partykit.json            PartyKit server config (name, entry file, compat date).
├── package.json             Dependencies + npm scripts (dev, build, test, pk:dev, pk:deploy).
├── vite.config.ts           Vite build config.
├── tsconfig.json            TypeScript compiler config.
└── .gitignore               Files git should ignore (node_modules, dist, the token temp file, …).
```

## The "holy trinity" of files

If you only read three files, read these:

1. **`src/shared/config.ts`** — all the numbers. Want enemies faster? Change
   `ENEMY_SPEED`. Want a longer dash cooldown? Change `DASH_COOLDOWN`. This is
   the #1 place to tweak the game feel.
2. **`src/shared/types.ts`** — the *data contract*. Every value that travels
   between server and client is described here (`Snapshot`, `PlayerState`,
   `NetMessage`, …). If you change what's in a snapshot, you change it here.
3. **`src/sim/World.ts`** — the rules. Big file, but it's "just" a state machine
   you step forward. See `05-the-simulation-world.md`.

## Data flow, one frame

```
keyboard
   │  (InputManager reads keys)
   ▼
PlayerInput { mx, my, charging, dashPressed }
   │  (GameScene → NetClient.send)
   ▼
PartySocket ──► party/server.ts ──► World.setPlayerInput(...)
                                        │
                                   World.step(dt)   ← runs 60×/sec on the server
                                        │
                                   World.snapshot()
                                        │
   ┌────────────────────────────────────┘
   ▼
PartySocket ◄── server broadcasts snapshot (30×/sec)
   │  (NetClient.onMessage → GameBridge → GameScene + React HUD)
   ▼
Phaser draws it + React HUD updates
```

The key insight: **your button press travels to the server, the server moves the
world, and you get back a snapshot describing the new world.** You never move
yourself directly; you ask the server to move you.

Next: **[04-networking.md](04-networking.md)** — the deep dive on that flow.
