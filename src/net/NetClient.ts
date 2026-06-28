// PartyKit client transport. Both players are symmetric clients of a single
// server-authoritative room; there is no host role anymore. Keeps the same
// public surface (`onState`, `onMessage`, `send`, `getLocalPeerId`, `host`,
// `join`, `teardown`) that App.tsx / GameScene.ts already consume. See ADR 0003.

import PartySocket from "partysocket";
import type { NetMessage, PeerRole, ConnectionState } from "../shared/types";
import { encodeMessage, decodeMessage } from "./codec";
import { generateRoomCode, roomCodeToRoomId, generatePlayerId } from "./roomCode";

// In `partykit dev` the server runs on localhost:1999. In production the host
// is the deployed PartyKit domain (set via VITE_PARTYKIT_HOST at build time).
const PARTYKIT_HOST =
  import.meta.env.VITE_PARTYKIT_HOST ??
  (import.meta.env.DEV ? "localhost:1999" : "partykit.sidchill.ca");

type StateListener = (state: ConnectionState, message?: string) => void;
type MessageListener = (msg: NetMessage) => void;

export class NetClient {
  private socket: PartySocket | null = null;
  private role: PeerRole | null = null;
  private state: ConnectionState = "idle";
  private stateListeners: Set<StateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private localPeerId: string | null = null; // player id (== PartySocket connection id)
  private roomCode: string | null = null;

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  getLocalPeerId(): string | null {
    return this.localPeerId;
  }

  getRemotePeerId(): string | null {
    // No peer-to-peer link anymore; the server is the other end. Kept for
    // call-site compatibility — returns the room id we're joined to.
    return this.roomCode;
  }

  getRole(): PeerRole | null {
    return this.role;
  }

  getRoomCode(): string | null {
    return this.roomCode;
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    this.stateListeners.forEach((l) => l(state, message));
  }

  host(): void {
    if (this.socket) this.teardown();
    this.role = "host"; // cosmetic only; the server treats both players equally
    const code = generateRoomCode();
    this.roomCode = code;
    this.localPeerId = generatePlayerId();
    this.setState("initializing", `creating room ${code}`);
    this.connect(roomCodeToRoomId(code), `room code: ${code}`);
  }

  join(hostCode: string): void {
    if (this.socket) this.teardown();
    this.role = "guest"; // cosmetic only
    const code = hostCode.toUpperCase();
    this.roomCode = code;
    this.localPeerId = generatePlayerId();
    this.setState("connecting", `joining room ${code}`);
    this.connect(roomCodeToRoomId(code), `joining room ${code}`);
  }

  private connect(roomId: string, waitingMessage: string): void {
    this.socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
      id: this.localPeerId ?? undefined,
    });
    this.socket.binaryType = "arraybuffer";

    this.socket.addEventListener("open", () => {
      this.setState("connected", waitingMessage);
    });

    this.socket.addEventListener("message", (event) => {
      try {
        const data = event.data;
        if (typeof data === "string") return; // we only speak MessagePack binary
        const bytes = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
        const msg = decodeMessage(bytes) as NetMessage;
        this.messageListeners.forEach((l) => l(msg));
      } catch (err) {
        console.error("client decode failure", err);
      }
    });

    this.socket.addEventListener("close", () => {
      if (this.state === "connected" || this.state === "connecting") {
        this.setState("disconnected", "connection closed");
      }
    });

    this.socket.addEventListener("error", () => {
      this.setState("error", "socket error");
    });
  }

  send(msg: NetMessage): void {
    if (!this.socket || this.socket.readyState !== this.socket.OPEN) return;
    try {
      // Copy into a plain ArrayBuffer-backed view so the strict WebSocket send
      // typing (ArrayBufferView<ArrayBuffer>) is satisfied.
      this.socket.send(new Uint8Array(encodeMessage(msg)));
    } catch (err) {
      console.error("send failure", err);
    }
  }

  teardown(): void {
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
    this.localPeerId = null;
    this.roomCode = null;
    this.role = null;
    this.setState("idle");
  }
}
