// PartyKit server-authoritative game room. One Durable Object per room id runs
// the framework-free `World` simulation at a fixed 60Hz step and broadcasts
// snapshots at 30Hz. Both players are symmetric clients; the host/guest concept
// only determines spawn color (P1 = first connector, P2 = second).
//
// See docs/adr/0003 for the server-authoritative topology.

import type * as Party from "partykit/server";
import { World } from "../src/sim/World";
import { encodeMessage, decodeMessage } from "../src/net/codec";
import type { NetMessage } from "../src/shared/types";
import { SIM_DT, SNAPSHOT_INTERVAL } from "../src/shared/config";

const TICK_MS = 1000 / 60;
const MAX_FRAME_STEPS = 5;
const MAX_PLAYERS = 2;

export default class GameServer implements Party.Server {
  readonly options = { hibernate: false };

  private world = new World();
  private stepAcc = 0;
  private snapAcc = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  // Ordered connection ids; index 0 is P1 (host color), index 1 is P2 (guest color).
  private players: string[] = [];

  constructor(readonly room: Party.Room) {}

  onStart(): void {
    // Don't start the tick loop yet: the sim must wait for both players to join
    // (start gate). The timer is started in onConnect once player 2 connects.
  }

  onConnect(connection: Party.Connection): void {
    const id = connection.id;
    if (this.players.length >= MAX_PLAYERS) {
      // Spectators / third wheels are refused so the sim stays a 2-player duel.
      connection.close(4000, "room full");
      return;
    }
    if (this.players.includes(id)) return;
    if (this.players.length === 0) this.world.addHostPlayer(id);
    else this.world.addGuestPlayer(id);
    this.players.push(id);
    // Start gate: only begin stepping/broadcasting once both players are here.
    if (this.players.length === MAX_PLAYERS) this.ensureRunning();
  }

  onMessage(message: string | ArrayBuffer, sender: Party.Connection): void {
    if (typeof message === "string") return; // we only speak MessagePack binary
    const bytes = message instanceof Uint8Array ? message : new Uint8Array(message);
    let msg: NetMessage;
    try {
      msg = decodeMessage(bytes) as NetMessage;
    } catch (err) {
      console.error("server decode failure", err);
      return;
    }
    const id = sender.id; // server is authoritative about who sent it
    switch (msg.kind) {
      case "input":
        this.world.setPlayerInput(id, msg.input);
        break;
      case "boxOpen":
        this.world.openBox(msg.boxId, id);
        break;
      case "boxChoice":
        // Negative optionIndex means "cancel"; keep parity with the client intent.
        if (msg.optionIndex >= 0) this.world.chooseBoxOption(msg.boxId, id, msg.optionIndex);
        else this.world.cancelBox(msg.boxId, id);
        break;
      case "hello":
      case "lobby":
      case "snapshot":
      case "runEnded":
        // Client-only messages; ignore on the server.
        break;
    }
  }

  onClose(connection: Party.Connection): void {
    const id = connection.id;
    if (!this.players.includes(id)) return;
    this.world.removePlayer(id);
    this.players = this.players.filter((p) => p !== id);
    if (this.players.length === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      // Reset the room so a fresh pair of players starts a clean run.
      this.world = new World();
      this.stepAcc = 0;
      this.snapAcc = 0;
    } else {
      // Push an immediate snapshot so the remaining player sees the drop promptly.
      this.broadcastSnapshot();
    }
  }

  onError(connection: Party.Connection, error: Error): void {
    console.error("connection error", connection.id, error.message);
  }

  private ensureRunning(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.frame(), TICK_MS);
  }

  private frame(): void {
    // Fixed-timestep accumulator: catch up if the event loop slipped, but cap
    // the catch-up so a long stall can't spiral the sim into a death loop.
    this.stepAcc += SIM_DT;
    let steps = 0;
    while (this.stepAcc >= SIM_DT && steps < MAX_FRAME_STEPS) {
      this.world.step(SIM_DT);
      this.stepAcc -= SIM_DT;
      steps++;
    }
    if (this.stepAcc >= SIM_DT) this.stepAcc = 0; // dropped frames

    this.snapAcc += SIM_DT;
    if (this.snapAcc >= SNAPSHOT_INTERVAL) {
      this.snapAcc = 0;
      this.broadcastSnapshot();
    }
  }

  private broadcastSnapshot(): void {
    const bytes = encodeMessage({ kind: "snapshot", snapshot: this.world.snapshot() });
    // ArrayBuffer-backed copy keeps the strict broadcast typing happy.
    this.room.broadcast(new Uint8Array(bytes));
  }
}

GameServer satisfies Party.Worker;
