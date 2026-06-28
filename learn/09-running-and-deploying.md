# 09 — Running, testing & deploying

Everything you need to run the game on your machine and put it on the internet.

## Prerequisites

- **Node.js** (the project uses modern ESM; Node 20+ is safe).
- **npm** (comes with Node).
- A code editor (Cursor/VS Code is fine).
- For *deploying* the server: a Cloudflare account (see "Deploy" below).

## First-time setup

```bash
npm install
```

Installs everything in `package.json` — Phaser, React, PartyKit, PartySocket,
MessagePack, Tailwind, Vitest, Vite, TypeScript.

## Run the game locally (two clients on one machine)

The game needs **two** servers running at once: the PartyKit game server and the
Vite client dev server.

Terminal 1 — the game server (runs on `http://localhost:1999`):

```bash
npm run pk:dev
```

Terminal 2 — the client (the web page you open):

```bash
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

- Click **Create** → you get a 4-letter room code.
- Open a **second browser tab/window** (or incognito) to the same URL, type the
  code, click **Join**.
- Both players should spawn in. You're playing.

> In local dev, `NetClient` targets `localhost:1999` automatically
> (`import.meta.env.DEV` branch in `src/net/NetClient.ts`).

## Run the tests

```bash
npm test
```

Runs **Vitest** against `src/sim/World.test.ts`. These are pure-logic tests
(no browser), fast, and verify the rules: spawning, boxes, Swap, dash, shield,
obstacles, hazards, health packs, DPS, boss death, every weapon. **Run these
after changing `config.ts` or `World.ts`.**

Watch mode while you work:

```bash
npm run test:watch
```

## Type-check + production build

```bash
npm run build
```

Runs `tsc -b` (TypeScript type-checking, including `noUnusedLocals` strictness)
then `vite build` (bundles the client into `dist/`). Keep this green — it's the
guardrail that catches type errors and unused imports.

Preview the production build locally:

```bash
npm run preview
```

## Tuning the game

Almost all balance is in **`src/shared/config.ts`**. Change a number, re-run
`npm test` to make sure you didn't break a test, then `npm run dev` to feel it.
Common tweaks:

- `PLAYER_MAX_SPEED`, `DASH_SPEED`, `DASH_COOLDOWN` — movement feel.
- `ENEMY_SPAWN_INTERVAL`, `ENEMY_CAP`, `ENEMY_DEFS` — difficulty curve.
- `RUN_DURATION` — match length.
- Weapon numbers in `src/sim/weapons.ts` (`baseDamage`, `baseInterval`, `range`).

## Deploying

The game is two separate things on the internet:

1. **The client** (static web page) — host anywhere (Vercel, Netlify, Cloudflare
   Pages). Just deploy the `dist/` folder that `npm run build` produces.
2. **The server** (PartyKit) — the authoritative game referee.

### Deploy the PartyKit server

Log in once (opens a browser to authorize):

```bash
npx partykit login
```

Then deploy:

```bash
npm run pk:deploy
```

By default this targets `sid-2dsurvivor.partykit.dev` (a shared PartyKit zone).
**Note:** that shared `partykit.dev` zone can hit a platform-wide custom-domain
cap. If `pk:deploy` fails with "exceeded the limit of 10000 Workers custom
domains on zone 'partykit.dev'", deploy to **your own Cloudflare account** with a
custom domain instead (this is called *cloud-prem*):

```bash
$env:CLOUDFLARE_ACCOUNT_ID="<your account id>"
$env:CLOUDFLARE_API_TOKEN="<an 'Edit Cloudflare Workers' API token>"
npx partykit deploy --domain partykit.yourdomain.com
```

Requirements for the custom-domain path:
- The domain must be a zone in your Cloudflare account with nameservers pointed
  to Cloudflare (apex must resolve publicly).
- Your Cloudflare account must be on the **Workers Paid** plan ($5/mo) — the free
  plan only allows SQLite-backed Durable Objects, which PartyKit 0.0.115 doesn't
  emit a migration for. (Alternatively, deploy via raw `wrangler` + `partyserver`
  with a `new_sqlite_classes` migration to stay on free.)

### Point the client at the server

The client picks its server host from `src/net/NetClient.ts`:

```ts
const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ??
  (import.meta.env.DEV ? "localhost:1999" : "partykit.yourdomain.com");
```

For the deployed client, set `VITE_PARTYKIT_HOST` at build time to your live
server host (e.g. in Vercel project env), then rebuild. In dev it uses localhost
automatically.

### Smoke test the live server

A quick reachability check: do a WebSocket handshake to a room and look for
`101 Switching Protocols`:

```bash
curl -s -i -N --http1.1 \
  -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
  https://partykit.yourdomain.com/parties/main/TEST123
```

A `101` response means the server is live and accepting players. Then open the
deployed client URL in two browsers, create + join a room, and play.

## Common gotchas

- **`partykit dev` shows a stale error after edits:** it rebuilds on every save;
  an error from a half-saved file can linger. Save fully, or restart `pk:dev`.
- **Tests fail after adding a new `Snapshot`/`PlayerState` field:** update
  `makeSnapshot` in `World.test.ts` and any `PlayerInput` literals
  (`dashPressed`, etc.).
- **Build fails on "declared but never read":** `tsconfig` uses
  `noUnusedLocals`. Remove the unused import/var.
- **WebSocket `send` type error with `Uint8Array`:** wrap it as
  `new Uint8Array(encodeMessage(msg))` so it's `ArrayBuffer`-backed (strict WS
  typing).

Next: **[10-glossary.md](10-glossary.md)** — words defined.
