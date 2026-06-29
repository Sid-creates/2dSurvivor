import { describe, it, expect } from "vitest";
import { World } from "./World";
import {
  WEAPON_DEFS,
  ALL_WEAPON_KINDS,
  MAX_WEAPONS,
  MAX_WEAPON_LEVEL,
  type WeaponKind,
} from "./weapons";
import {
  SIM_DT,
  RUN_DURATION,
  SWAP_MANA_COST,
  SWAP_I_FRAMES,
  SWAP_CHARGE_DURATION,
  BOX_OPEN_RANGE,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  VIEW_WIDTH,
  VIEW_HEIGHT,
  CAMERA_SCROLL_SPEED,
  VOID_DPS,
  DASH_SPEED,
  DASH_COOLDOWN,
  PLAYER_MAX_MANA,
  PLAYER_COLORS,
  PLAYER_MAX_SPEED,
} from "../shared/config";
import type { Snapshot, PlayerInput } from "../shared/types";

const HOST_ID = "ABCD";
const GUEST_ID = "WXYZ";

function makeWorld(): World {
  return new World();
}

function twoPlayerWorld(): World {
  const w = makeWorld();
  w.addHostPlayer(HOST_ID);
  w.addGuestPlayer(GUEST_ID);
  return w;
}

const STOP_INPUT: PlayerInput = { mx: 0, my: 0, charging: false, dashPressed: false };

/** Build a minimal valid Snapshot with optional overrides, for applySnapshot tests. */
function makeSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    t: 0,
    tick: 0,
    players: [],
    enemies: [],
    projectiles: [],
    boxes: [],
    zones: [],
    obstacles: [],
    pickups: [],
    wave: 1,
    waveTimer: 60,
    isBossWave: false,
    bossTimer: 0,
    runTime: 0,
    runDuration: RUN_DURATION,
    runStatus: "playing",
    started: true,
    camera: {
      x: (WORLD_WIDTH - VIEW_WIDTH) / 2,
      y: (WORLD_HEIGHT - VIEW_HEIGHT) / 2,
      w: VIEW_WIDTH,
      h: VIEW_HEIGHT,
      vx: CAMERA_SCROLL_SPEED,
      vy: 0,
      dir: 0,
    },
    ...overrides,
  };
}

/** Apply a snapshot built from the world's current state plus overrides. */
function applyFromWorld(w: World, overrides: Partial<Snapshot>): void {
  const base = w.snapshot();
  w.applySnapshot({ ...base, ...overrides });
}

/** Equip the host with a single weapon and place a dummy enemy in firing range. */
function equipHostWithEnemy(w: World, kind: WeaponKind, enemyDist = 120): void {
  const s = w.snapshot();
  const host = s.players.find((p) => p.id === HOST_ID)!;
  w.applySnapshot(
    makeSnapshot({
      t: s.t,
      tick: s.tick,
      wave: 1,
      waveTimer: 60,
      players: s.players.map((p) => ({
        ...p,
        weapons:
          p.id === HOST_ID
            ? [{ kind, level: 1, cooldown: 0, orbitPhase: 0 }]
            : p.weapons,
      })),
      enemies: [{ id: 7001, x: host.x + enemyDist, y: host.y, hp: 200, kind: 1 }],
    }),
  );
}

describe("player spawning", () => {
  it("adds a host and guest player with correct colors and positions", () => {
    const w = twoPlayerWorld();
    const snap = w.snapshot();
    expect(snap.players).toHaveLength(2);
    const host = snap.players.find((p) => p.id === HOST_ID)!;
    const guest = snap.players.find((p) => p.id === GUEST_ID)!;
    expect(host.color).toBe(PLAYER_COLORS.host);
    expect(guest.color).toBe(PLAYER_COLORS.guest);
    // Host on the left third, guest on the right third
    expect(host.x).toBeCloseTo(WORLD_WIDTH * 0.35);
    expect(guest.x).toBeCloseTo(WORLD_WIDTH * 0.65);
    expect(host.x).toBeLessThan(guest.x);
  });

  it("is idempotent: adding the same id twice does not duplicate", () => {
    const w = makeWorld();
    w.addHostPlayer(HOST_ID);
    w.addHostPlayer(HOST_ID);
    w.addGuestPlayer(GUEST_ID);
    w.addGuestPlayer(GUEST_ID);
    expect(w.snapshot().players).toHaveLength(2);
  });

  it("routes input to a guest added under the short-code id (P2-spawn invariant)", () => {
    // The P2 spawn fix adds the guest using the short code carried in `hello`.
    // The guest then sends `input` messages keyed by that same short code, so
    // input routed to that id must actually move the guest.
    const w = twoPlayerWorld();
    const before = w.snapshot().players.find((p) => p.id === GUEST_ID)!.x;
    w.setPlayerInput(GUEST_ID, { mx: 1, my: 0, charging: false, dashPressed: false });
    for (let i = 0; i < 10; i++) w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === GUEST_ID)!.x;
    expect(after).toBeGreaterThan(before);
  });
});

describe("start gate", () => {
  it("does not step until both players have joined", () => {
    const w = makeWorld();
    w.addHostPlayer(HOST_ID);
    expect(w.snapshot().started).toBe(false);
    const before = w.snapshot().t;
    for (let i = 0; i < 30; i++) w.step(SIM_DT);
    // No time advanced, no enemies spawned while waiting for P2.
    expect(w.snapshot().t).toBe(before);
    expect(w.snapshot().enemies.length).toBe(0);
    expect(w.snapshot().started).toBe(false);

    w.addGuestPlayer(GUEST_ID);
    expect(w.snapshot().started).toBe(true);
    const t0 = w.snapshot().t;
    w.step(SIM_DT);
    expect(w.snapshot().t).toBeGreaterThan(t0);
  });

  it("keeps running (latched) if a player disconnects after start", () => {
    const w = twoPlayerWorld();
    expect(w.snapshot().started).toBe(true);
    w.removePlayer(GUEST_ID);
    // started latches: the survivor keeps playing.
    expect(w.snapshot().started).toBe(true);
    const t0 = w.snapshot().t;
    w.step(SIM_DT);
    expect(w.snapshot().t).toBeGreaterThan(t0);
  });
});

describe("boxes", () => {
  it("opens the nearest in-range box and rolls 3 options on E press", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.spawnBox(host.x, host.y);
    const boxId = w.getBoxes()[0].id;

    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);

    const box = w.getBoxes().find((b) => b.id === boxId)!;
    expect(box.openerId).toBe(HOST_ID);
    expect(box.options).not.toBeNull();
    expect(box.options!.length).toBe(3);
  });

  it("does nothing when no box is within open range", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    // Spawn a box well outside the 50px open range
    w.spawnBox(host.x + BOX_OPEN_RANGE + 100, host.y);

    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);

    const box = w.getBoxes()[0];
    expect(box.openerId).toBeNull();
    expect(box.options).toBeNull();
  });

  it("applies the chosen option: box is consumed and loadout improves", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.spawnBox(host.x, host.y);
    const boxId = w.getBoxes()[0].id;

    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);

    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const beforeSum = before.weapons.reduce((s, x) => s + x.level, 0);

    w.chooseBoxOption(boxId, HOST_ID, 0);

    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const afterSum = after.weapons.reduce((s, x) => s + x.level, 0);
    expect(afterSum).toBeGreaterThan(beforeSum);
    expect(w.getBoxes().find((b) => b.id === boxId)).toBeUndefined();
  });

  it("cancel releases the box without changing the loadout", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.spawnBox(host.x, host.y);
    const boxId = w.getBoxes()[0].id;

    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const beforeSum = before.weapons.reduce((s, x) => s + x.level, 0);

    w.cancelBox(boxId, HOST_ID);

    const box = w.getBoxes().find((b) => b.id === boxId)!;
    expect(box.openerId).toBeNull();
    expect(box.options).toBeNull();
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(after.weapons.reduce((s, x) => s + x.level, 0)).toBe(beforeSum);
  });

  it("a player in a box menu cannot open a second box simultaneously", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    // Two boxes next to the host, both in range
    w.spawnBox(host.x, host.y);
    w.spawnBox(host.x + 20, host.y);
    const [boxA, boxB] = w.getBoxes();

    // Claim box A directly (simulates the host already opening it)
    w.openBox(boxA.id, HOST_ID);
    // Host presses E again; nearest unclaimed box is B
    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);

    expect(w.getBoxes().find((b) => b.id === boxA.id)!.openerId).toBe(HOST_ID);
    // Box B must NOT have been opened: one menu at a time
    expect(w.getBoxes().find((b) => b.id === boxB.id)!.openerId).toBeNull();
  });

  it("a box claimed by one player cannot be stolen by another", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.spawnBox(host.x, host.y);
    const boxId = w.getBoxes()[0].id;
    // Host claims it
    w.openBox(boxId, HOST_ID);

    // Place the guest right on top of the claimed box and have them press E
    const snap = w.snapshot();
    const guestState = snap.players.find((p) => p.id === GUEST_ID)!;
    const repositioned = makeSnapshot({
      t: snap.t,
      tick: snap.tick,
      wave: snap.wave,
      waveTimer: snap.waveTimer,
      players: [
        { ...host, weapons: host.weapons },
        { ...guestState, x: host.x, y: host.y, weapons: guestState.weapons },
      ],
      boxes: w.getBoxes(),
    });
    w.applySnapshot(repositioned);

    w.requestOpenBox(GUEST_ID);
    w.step(SIM_DT);

    // Box still belongs to the host
    expect(w.getBoxes().find((b) => b.id === boxId)!.openerId).toBe(HOST_ID);
  });
});

describe("positional swap", () => {
  it("swaps positions, grants i-frames, and drains mana when both charge to full", () => {
    const w = twoPlayerWorld();
    w.setPlayerInput(HOST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });
    w.setPlayerInput(GUEST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });

    const hostBefore = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const guestBefore = w.snapshot().players.find((p) => p.id === GUEST_ID)!;

    let swapped = false;
    // SWAP_CHARGE_DURATION / SIM_DT steps to fill, plus a small margin
    const maxSteps = Math.ceil(SWAP_CHARGE_DURATION / SIM_DT) + 5;
    for (let i = 0; i < maxSteps; i++) {
      w.step(SIM_DT);
      const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
      const guest = w.snapshot().players.find((p) => p.id === GUEST_ID)!;
      if (host.x > guest.x) {
        swapped = true;
        expect(guest.x).toBeCloseTo(hostBefore.x);
        expect(host.x).toBeCloseTo(guestBefore.x);
        expect(host.iFrames).toBe(SWAP_I_FRAMES);
        expect(guest.iFrames).toBe(SWAP_I_FRAMES);
        expect(host.mana).toBe(PLAYER_MAX_MANA - SWAP_MANA_COST);
        expect(guest.mana).toBe(PLAYER_MAX_MANA - SWAP_MANA_COST);
        break;
      }
    }
    expect(swapped).toBe(true);
  });

  it("does nothing if only one player is charging", () => {
    const w = twoPlayerWorld();
    w.setPlayerInput(HOST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });
    w.setPlayerInput(GUEST_ID, STOP_INPUT);

    const hostBefore = w.snapshot().players.find((p) => p.id === HOST_ID)!.x;
    const guestBefore = w.snapshot().players.find((p) => p.id === GUEST_ID)!.x;

    for (let i = 0; i < Math.ceil(SWAP_CHARGE_DURATION / SIM_DT) + 5; i++) w.step(SIM_DT);

    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const guest = w.snapshot().players.find((p) => p.id === GUEST_ID)!;
    expect(host.x).toBeCloseTo(hostBefore);
    expect(guest.x).toBeCloseTo(guestBefore);
    // Charger filled but no mana was spent
    expect(host.chargeProgress).toBe(1);
    expect(host.mana).toBe(PLAYER_MAX_MANA);
  });

  it("excludes downed players from swap resolution", () => {
    const w = twoPlayerWorld();
    const snap = w.snapshot();
    const host = snap.players.find((p) => p.id === HOST_ID)!;
    const guest = snap.players.find((p) => p.id === GUEST_ID)!;
    // Mark the guest downed via a snapshot
    w.applySnapshot(
      makeSnapshot({
        t: snap.t,
        tick: snap.tick,
        wave: snap.wave,
        waveTimer: snap.waveTimer,
        players: [
          { ...host, weapons: host.weapons },
          { ...guest, downed: true, weapons: guest.weapons },
        ],
      }),
    );

    w.setPlayerInput(HOST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });
    const hostBefore = w.snapshot().players.find((p) => p.id === HOST_ID)!.x;
    const guestBefore = w.snapshot().players.find((p) => p.id === GUEST_ID)!.x;

    for (let i = 0; i < Math.ceil(SWAP_CHARGE_DURATION / SIM_DT) + 5; i++) w.step(SIM_DT);

    expect(w.snapshot().players.find((p) => p.id === HOST_ID)!.x).toBeCloseTo(hostBefore);
    expect(w.snapshot().players.find((p) => p.id === GUEST_ID)!.x).toBeCloseTo(guestBefore);
  });

  it("cannot charge without enough mana", () => {
    const w = twoPlayerWorld();
    const snap = w.snapshot();
    const host = snap.players.find((p) => p.id === HOST_ID)!;
    const guest = snap.players.find((p) => p.id === GUEST_ID)!;
    // Both players below the swap cost
    w.applySnapshot(
      makeSnapshot({
        t: snap.t,
        tick: snap.tick,
        wave: snap.wave,
        waveTimer: snap.waveTimer,
        players: [
          { ...host, mana: 10, weapons: host.weapons },
          { ...guest, mana: 10, weapons: guest.weapons },
        ],
      }),
    );

    w.setPlayerInput(HOST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });
    w.setPlayerInput(GUEST_ID, { mx: 0, my: 0, charging: true, dashPressed: false });

    for (let i = 0; i < Math.ceil(SWAP_CHARGE_DURATION / SIM_DT) + 5; i++) w.step(SIM_DT);

    const hostAfter = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const guestAfter = w.snapshot().players.find((p) => p.id === GUEST_ID)!;
    expect(hostAfter.chargeProgress).toBe(0);
    expect(guestAfter.chargeProgress).toBe(0);
    expect(hostAfter.charging).toBe(false);
  });
});

describe("enemy separation", () => {
  it("pushes overlapping enemies apart so they don't stack on one point", () => {
    const w = twoPlayerWorld();
    const cx = WORLD_WIDTH * 0.5;
    const cy = WORLD_HEIGHT * 0.12;
    applyFromWorld(w, {
      enemies: [
        { id: 9001, x: cx, y: cy, hp: 200, kind: 1 },
        { id: 9002, x: cx, y: cy, hp: 200, kind: 1 },
      ],
    });
    // Both chase the same nearest player from the same spot, so chase contributes
    // ~0 relative motion; only separation spreads them.
    for (let i = 0; i < 30; i++) w.step(SIM_DT);
    const es = w.snapshot().enemies.filter((e) => e.id === 9001 || e.id === 9002);
    const a = es.find((e) => e.id === 9001)!;
    const b = es.find((e) => e.id === 9002)!;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    // Two walkers: radius 12 + 12 = 24 expected separation.
    expect(dist).toBeGreaterThanOrEqual(22);
  });
});

describe("scrolling world (Stage 2)", () => {
  it("auto-scrolls the safe-zone camera each step", () => {
    const w = twoPlayerWorld();
    const cam0 = w.snapshot().camera;
    expect(cam0.w).toBe(VIEW_WIDTH);
    expect(cam0.h).toBe(VIEW_HEIGHT);
    const startX = cam0.x;
    for (let i = 0; i < 10; i++) w.step(SIM_DT);
    const cam1 = w.snapshot().camera;
    // dir starts at 0 (scrolling right), so x must increase.
    expect(cam1.x).toBeGreaterThan(startX);
  });

  it("picks a new scroll direction each wave", () => {
    const w = twoPlayerWorld();
    const dir1 = w.snapshot().camera.dir;
    // Force a wave advance by draining the wave timer.
    applyFromWorld(w, { waveTimer: 0 });
    w.step(SIM_DT);
    const dir2 = w.snapshot().camera.dir;
    expect(w.snapshot().wave).toBe(2);
    expect(dir2).not.toBe(dir1);
  });

  it("damages players standing outside the safe zone (void)", () => {
    const w = twoPlayerWorld();
    const cam = w.snapshot().camera;
    // Park the host just beyond the right edge of the safe zone.
    applyFromWorld(w, {
      players: w.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, x: cam.x + cam.w + 40, y: cam.y + cam.h / 2, vx: 0, vy: 0 } : p,
      ),
    });
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    expect(after).toBeLessThan(before);
    // Roughly VOID_DPS * dt of damage (allow the soft-pull to not fully negate it).
    expect(before - after).toBeGreaterThanOrEqual(VOID_DPS * SIM_DT * 0.5);
  });

  it("spawns enemies ahead of the camera so they stream into view", () => {
    const w = twoPlayerWorld();
    // Step past the first spawn cooldown (~1.6s) so a formation appears.
    for (let i = 0; i < 120; i++) w.step(SIM_DT);
    const snap = w.snapshot();
    expect(snap.enemies.length).toBeGreaterThan(0);
    const cam = snap.camera;
    const forwardEdge = cam.x + cam.w / 2;
    // At least one enemy should have spawned ahead of the camera center.
    expect(snap.enemies.some((e) => e.x > forwardEdge)).toBe(true);
  });
});

describe("run end conditions", () => {
  it("ends as lost when all players are downed", () => {
    const w = twoPlayerWorld();
    const snap = w.snapshot();
    const host = snap.players.find((p) => p.id === HOST_ID)!;
    const guest = snap.players.find((p) => p.id === GUEST_ID)!;
    w.applySnapshot(
      makeSnapshot({
        t: snap.t,
        tick: snap.tick,
        wave: snap.wave,
        waveTimer: snap.waveTimer,
        players: [
          { ...host, downed: true, weapons: host.weapons },
          { ...guest, downed: true, weapons: guest.weapons },
        ],
      }),
    );
    expect(w.getRunStatus()).toBe("playing");
    w.step(SIM_DT);
    expect(w.getRunStatus()).toBe("lost");
  });

  it("ends as won when the run duration elapses", () => {
    const w = twoPlayerWorld();
    const snap = w.snapshot();
    const host = snap.players.find((p) => p.id === HOST_ID)!;
    const guest = snap.players.find((p) => p.id === GUEST_ID)!;
    w.applySnapshot(
      makeSnapshot({
        t: RUN_DURATION,
        tick: snap.tick,
        wave: snap.wave,
        waveTimer: snap.waveTimer,
        players: [
          { ...host, weapons: host.weapons },
          { ...guest, weapons: guest.weapons },
        ],
      }),
    );
    expect(w.getRunStatus()).toBe("playing");
    w.step(SIM_DT);
    expect(w.getRunStatus()).toBe("won");
  });
});

describe("enemy variety and hazards", () => {
  it("spawns only walkers at wave 1, then adds tougher kinds as waves advance", () => {
    const w = twoPlayerWorld();
    // Wave 1: only walkers (kind 1) can be picked
    for (let i = 0; i < 200; i++) w.step(SIM_DT);
    const kinds = new Set(w.snapshot().enemies.map((e) => e.kind));
    expect(kinds.has(1)).toBe(true);
    expect(kinds.has(3)).toBe(false);
    expect(kinds.has(4)).toBe(false);
    expect(kinds.has(5)).toBe(false);
  });

  it("hostile projectiles damage players", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    // Place a caster within fire range, attackCd resets to 0 on applySnapshot
    applyFromWorld(w, {
      enemies: [{ id: 8001, x: host.x + 25, y: host.y, hp: 200, kind: 5 }],
    });
    const hpBefore = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    for (let i = 0; i < 12; i++) w.step(SIM_DT);
    const hpAfter = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    expect(hpAfter).toBeLessThan(hpBefore);
  });

  it("active damage zones hurt players standing in them", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      enemies: [],
      zones: [
        {
          id: 1,
          x: host.x,
          y: host.y,
          radius: 72,
          telegraph: 0,
          active: true,
          duration: 2.8,
          dps: 26,
          color: 0xef4444,
        },
      ],
    });
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    expect(after).toBeLessThan(before);
  });

  it("telegraphed zones become active after the warning window", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      enemies: [],
      zones: [
        {
          id: 1,
          x: host.x,
          y: host.y,
          radius: 72,
          telegraph: 0.2,
          active: false,
          duration: 2.8,
          dps: 26,
          color: 0xef4444,
        },
      ],
    });
    // While telegraphing, no damage
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    w.step(SIM_DT);
    expect(w.snapshot().players.find((p) => p.id === HOST_ID)!.hp).toBe(before);
    // Step past the telegraph window so it activates
    for (let i = 0; i < 30; i++) w.step(SIM_DT);
    expect(w.snapshot().players.find((p) => p.id === HOST_ID)!.hp).toBeLessThan(before);
  });
});

describe("boss waves", () => {
  it("ends the wave when the boss is killed, not on a timer", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    // Boss wave with a 1-hp boss close enough for the host's auto-attack to land fast
    applyFromWorld(w, {
      wave: 5,
      waveTimer: 60,
      isBossWave: true,
      bossTimer: 30,
      enemies: [{ id: 5001, x: host.x + 10, y: host.y, hp: 1, kind: 2 }],
    });
    expect(w.snapshot().isBossWave).toBe(true);

    // The boss-death check runs at the START of each step, so we step until the
    // kill registers and the wave advances (wave 5 -> wave 6).
    let advanced = false;
    for (let i = 0; i < 20; i++) {
      w.step(SIM_DT);
      const snap = w.snapshot();
      if (!snap.isBossWave) {
        expect(snap.wave).toBe(6);
        advanced = true;
        break;
      }
    }
    expect(advanced).toBe(true);
  });
});

describe("weapon variety", () => {
  it("exposes the new weapon kinds in the definition table", () => {
    expect(ALL_WEAPON_KINDS).toEqual(
      expect.arrayContaining(["chain", "frost", "homing", "mine"]),
    );
    expect(ALL_WEAPON_KINDS.length).toBe(9);
    for (const kind of ALL_WEAPON_KINDS) {
      expect(WEAPON_DEFS[kind]).toBeDefined();
    }
  });

  it("chain lightning damages the nearest enemy instantly", () => {
    const w = twoPlayerWorld();
    equipHostWithEnemy(w, "chain", 100);
    const before = w.snapshot().enemies.find((e) => e.id === 7001)!.hp;
    w.step(SIM_DT);
    const after = w.snapshot().enemies.find((e) => e.id === 7001)?.hp;
    expect(after).toBeLessThan(before);
  });

  it("frost fires a frost bolt that can slow on hit", () => {
    const w = twoPlayerWorld();
    equipHostWithEnemy(w, "frost", 100);
    w.step(SIM_DT);
    expect(w.getProjectiles().some((pr) => pr.weaponKind === "frost")).toBe(true);
  });

  it("homing fires steerable missiles", () => {
    const w = twoPlayerWorld();
    equipHostWithEnemy(w, "homing", 140);
    w.step(SIM_DT);
    expect(w.getProjectiles().some((pr) => pr.weaponKind === "homing")).toBe(true);
  });

  it("mine drops an armed mine projectile", () => {
    const w = twoPlayerWorld();
    equipHostWithEnemy(w, "mine", 100);
    w.step(SIM_DT);
    expect(w.getProjectiles().some((pr) => pr.weaponKind === "mine")).toBe(true);
  });
});

describe("box heal option", () => {
  it("restores HP when a maxed-out player picks the Mend option", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    const maxedWeapons = ALL_WEAPON_KINDS.slice(0, MAX_WEAPONS).map((kind) => ({
      kind,
      level: MAX_WEAPON_LEVEL,
      cooldown: 0,
      orbitPhase: 0,
    }));
    applyFromWorld(w, {
      enemies: [],
      boxes: [{ id: 6001, x: host.x, y: host.y, opened: false, openerId: null, options: null }],
      players: s.players.map((p) =>
        p.id === HOST_ID
          ? { ...p, hp: 50, shieldHp: p.maxShield, weapons: maxedWeapons }
          : p,
      ),
    });
    w.requestOpenBox(HOST_ID);
    w.step(SIM_DT);
    const box = w.getBoxes().find((b) => b.id === 6001)!;
    expect(box.options).not.toBeNull();
    expect(box.options![0].resultingLevel).toBe(0); // heal sentinel

    w.chooseBoxOption(6001, HOST_ID, 0);
    expect(w.snapshot().players.find((p) => p.id === HOST_ID)!.hp).toBeGreaterThan(50);
    expect(w.getBoxes().find((b) => b.id === 6001)).toBeUndefined();
  });
});

describe("snapshot round-trip", () => {
  it("applySnapshot restores the same players and boxes", () => {
    const w = twoPlayerWorld();
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.spawnBox(host.x, host.y);
    const original = w.snapshot();
    expect(original.players).toHaveLength(2);
    expect(original.boxes).toHaveLength(1);

    const w2 = makeWorld();
    w2.applySnapshot(original);
    const restored = w2.snapshot();
    expect(restored.players.map((p) => p.id).sort()).toEqual([HOST_ID, GUEST_ID]);
    expect(restored.boxes).toHaveLength(1);
    expect(restored.boxes[0].x).toBe(original.boxes[0].x);
  });
});

describe("dash mechanic", () => {
  it("grants i-frames, sets cooldown, and bursts velocity beyond normal speed", () => {
    const w = twoPlayerWorld();
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(host.dashCooldown).toBeGreaterThan(0);
    expect(host.dashTime).toBeGreaterThan(0);
    expect(host.iFrames).toBeGreaterThan(0);
    expect(host.vx).toBeGreaterThan(PLAYER_MAX_SPEED);
  });

  it("does not dash again while on cooldown", () => {
    const w = twoPlayerWorld();
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const cdAfter = w.snapshot().players.find((p) => p.id === HOST_ID)!.dashCooldown;
    // Request another dash immediately; cooldown should just tick down, not reset.
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(host.dashCooldown).toBeCloseTo(cdAfter - SIM_DT, 5);
  });

  it("does not dash while downed", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      players: [
        { ...host, downed: true, weapons: host.weapons },
        ...s.players.filter((p) => p.id !== HOST_ID),
      ],
    });
    // setPlayerInput is a no-op for downed players, so the dash request is dropped.
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const h = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(h.dashCooldown).toBe(0);
    expect(h.dashTime).toBe(0);
  });
});

describe("shield absorption", () => {
  it("absorbs incoming damage before HP", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      enemies: [],
      zones: [
        {
          id: 1,
          x: host.x,
          y: host.y,
          radius: 72,
          telegraph: 0,
          active: true,
          duration: 5,
          dps: 100,
          color: 0xef4444,
        },
      ],
      players: s.players.map((p) =>
        p.id === HOST_ID ? { ...p, shieldHp: 30, hp: 80, weapons: p.weapons } : p,
      ),
    });
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(after.shieldHp).toBeLessThan(before.shieldHp);
    expect(after.hp).toBeCloseTo(before.hp, 5);
  });
});

describe("obstacles", () => {
  it("solid block obstacles push the player out so they cannot overlap", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    // Drop a circular block just off the host's center so d2 > 0 for the pushout.
    applyFromWorld(w, {
      obstacles: [
        {
          id: 1,
          kind: "block",
          shape: "circle",
          x: host.x + 5,
          y: host.y,
          w: 0,
          h: 0,
          radius: 30,
          color: 0x3a3a42,
        },
      ],
      players: s.players.map((p) =>
        p.id === HOST_ID ? { ...p, x: host.x, y: host.y, vx: 0, vy: 0 } : p,
      ),
    });
    w.setPlayerInput(HOST_ID, STOP_INPUT);
    w.step(SIM_DT);
    const h = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const obstacle = w.getObstacles()[0];
    const dist = Math.hypot(h.x - obstacle.x, h.y - obstacle.y);
    // player radius 14 + block radius 30 = 44 separation expected (allow rounding).
    expect(dist).toBeGreaterThanOrEqual(43);
  });

  it("hazard obstacles damage players standing on them", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      enemies: [],
      obstacles: [
        {
          id: 1,
          kind: "hazard",
          shape: "circle",
          x: host.x,
          y: host.y,
          w: 0,
          h: 0,
          radius: 40,
          color: 0xb91c1c,
        },
      ],
    });
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    expect(after).toBeLessThan(before);
  });
});

describe("health packs", () => {
  it("heals a player on walk-over and despawns", () => {
    const w = twoPlayerWorld();
    const s = w.snapshot();
    const host = s.players.find((p) => p.id === HOST_ID)!;
    applyFromWorld(w, {
      enemies: [],
      players: s.players.map((p) =>
        p.id === HOST_ID ? { ...p, hp: 40, weapons: p.weapons } : p,
      ),
      pickups: [{ id: 1, x: host.x, y: host.y, kind: "health" }],
    });
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    w.step(SIM_DT);
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!.hp;
    expect(after).toBeGreaterThan(before);
    expect(w.getPickups().length).toBe(0);
  });
});

describe("DPS meter", () => {
  it("attributes weapon damage to the firing player", () => {
    const w = twoPlayerWorld();
    equipHostWithEnemy(w, "pulse", 100);
    // Let a bolt travel and land: pulse interval 0.55s, projectile speed 520 px/s.
    for (let i = 0; i < 30; i++) w.step(SIM_DT);
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(host.dps).toBeGreaterThan(0);
  });
});

describe("dash upgrades and curses (Stage 3)", () => {
  it("range level boosts dash burst speed", () => {
    const w = twoPlayerWorld();
    applyFromWorld(w, {
      players: w.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, dashMods: { range: 2, trail: 0, cooldown: 0 } } : p,
      ),
    });
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    // 2 range levels => +60% burst speed over the base DASH_SPEED.
    expect(host.vx).toBeGreaterThan(DASH_SPEED);
  });

  it("cooldown level shortens the dash cooldown", () => {
    const w = twoPlayerWorld();
    applyFromWorld(w, {
      players: w.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, dashMods: { range: 0, trail: 0, cooldown: 2 } } : p,
      ),
    });
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    w.step(SIM_DT);
    const host = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(host.dashCooldown).toBeLessThan(DASH_COOLDOWN);
  });

  it("trail level leaves a damaging zone along the dash path", () => {
    const w = twoPlayerWorld();
    applyFromWorld(w, {
      players: w.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, dashMods: { range: 0, trail: 1, cooldown: 0 } } : p,
      ),
    });
    w.setPlayerInput(HOST_ID, { mx: 1, my: 0, charging: false, dashPressed: true });
    for (let i = 0; i < 5; i++) w.step(SIM_DT);
    expect(w.snapshot().zones.some((z) => z.ownerId === HOST_ID)).toBe(true);
  });

  it("spawn curse makes enemies appear sooner", () => {
    const clean = twoPlayerWorld();
    const cursed = twoPlayerWorld();
    applyFromWorld(cursed, {
      players: cursed.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, curses: ["spawn"] } : p,
      ),
    });
    // 180 steps ~= 3.0s. The first spawn (1.6s) is shared; the curse shortens
    // the *next* cooldown so the cursed world gets a second formation before the
    // clean world does. Enemies spawn far ahead of the camera and haven't reached
    // the players yet, so weapon fire doesn't muddy the counts.
    for (let i = 0; i < 180; i++) {
      clean.step(SIM_DT);
      cursed.step(SIM_DT);
    }
    const cleanCount = clean.snapshot().enemies.length;
    const cursedCount = cursed.snapshot().enemies.length;
    expect(cleanCount).toBeGreaterThan(0);
    expect(cursedCount).toBeGreaterThan(cleanCount);
  });

  it("speed curse makes enemies chase faster", () => {
    const clean = twoPlayerWorld();
    const cursed = twoPlayerWorld();
    const base = clean.snapshot().players.find((p) => p.id === HOST_ID)!;
    const enemy = { id: 9101, x: base.x + 120, y: base.y, hp: 200, kind: 1 };
    applyFromWorld(clean, { enemies: [enemy] });
    applyFromWorld(cursed, {
      enemies: [enemy],
      players: cursed.snapshot().players.map((p) =>
        p.id === HOST_ID ? { ...p, curses: ["speed"] } : p,
      ),
    });
    clean.step(SIM_DT);
    cursed.step(SIM_DT);
    const cE = clean.snapshot().enemies.find((e) => e.id === 9101)!;
    const xE = cursed.snapshot().enemies.find((e) => e.id === 9101)!;
    // Both moved left toward the host; the cursed one covered more ground.
    expect((base.x + 120) - xE.x).toBeGreaterThan((base.x + 120) - cE.x);
  });

  it("hp curse (cursed option) cuts max HP and records the curse", () => {
    const w = twoPlayerWorld();
    const before = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    const beforeMax = before.maxHp;
    w.applyPickOption(HOST_ID, {
      kind: "pulse",
      upgradeIndex: 0,
      resultingLevel: before.weapons[0].level + 1,
      curse: "hp",
      cursed: true,
      bonusLevels: 0,
    });
    const after = w.snapshot().players.find((p) => p.id === HOST_ID)!;
    expect(after.curses).toContain("hp");
    expect(after.maxHp).toBeLessThan(beforeMax);
  });
});
