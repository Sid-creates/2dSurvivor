// PeerJS wrapper. One class, two roles (Host or Guest). Host listens for an
// incoming connection from a Guest; Guest dials a known Host peer id.
// All payload is MessagePack-encoded NetMessage. See ADR 0002, ADR 0003.

import Peer, { type DataConnection } from "peerjs";
import type { NetMessage, PeerRole, ConnectionState } from "../shared/types";
import { encodeMessage, decodeMessage } from "./codec";
import { generateRoomCode, roomCodeToPeerId } from "./roomCode";

type StateListener = (state: ConnectionState, message?: string) => void;
type MessageListener = (msg: NetMessage) => void;

export class NetClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private role: PeerRole | null = null;
  private state: ConnectionState = "idle";
  private stateListeners: Set<StateListener> = new Set();
  private messageListeners: Set<MessageListener> = new Set();
  private localPeerId: string | null = null;
  private remotePeerId: string | null = null;

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
    return this.remotePeerId;
  }

  getRole(): PeerRole | null {
    return this.role;
  }

  private setState(state: ConnectionState, message?: string): void {
    this.state = state;
    this.stateListeners.forEach((l) => l(state, message));
  }

  host(): void {
    if (this.peer) this.teardown();
    this.role = "host";
    this.setState("initializing");
    const code = generateRoomCode();
    this.localPeerId = code;
    this.peer = new Peer(roomCodeToPeerId(code), { debug: 1 });

    this.peer.on("open", (id) => {
      // Server may append a suffix to our requested ID on collision; surface
      // only the code portion so users always see a short code.
      this.localPeerId = id.startsWith("2ds-") ? id.slice(4) : id;
      this.setState("waiting", `room code: ${this.localPeerId}`);
    });

    this.peer.on("connection", (conn) => {
      if (this.conn) {
        conn.close();
        return;
      }
      this.conn = conn;
      this.bindConn(conn);
    });

    this.peer.on("error", (err) => {
      // On ID collision, regenerate with a fresh code and retry once
      if (err.type === "unavailable-id") {
        this.setState("initializing", "picking a new room code");
        const retryCode = generateRoomCode();
        this.localPeerId = retryCode;
        try {
          this.peer?.destroy();
        } catch {
          /* ignore */
        }
        this.peer = new Peer(roomCodeToPeerId(retryCode), { debug: 1 });
        this.bindHostPeerEvents();
        return;
      }
      this.setState("error", err.message ?? String(err));
    });
  }

  private bindHostPeerEvents(): void {
    if (!this.peer) return;
    this.peer.on("open", (id) => {
      this.localPeerId = id.startsWith("2ds-") ? id.slice(4) : id;
      this.setState("waiting", `room code: ${this.localPeerId}`);
    });
    this.peer.on("connection", (conn) => {
      if (this.conn) {
        conn.close();
        return;
      }
      this.conn = conn;
      this.bindConn(conn);
    });
    this.peer.on("error", (err) => {
      this.setState("error", err.message ?? String(err));
    });
  }

  join(hostCode: string): void {
    if (this.peer) this.teardown();
    this.role = "guest";
    this.setState("initializing");
    // Guest uses a random short code too, so its ID is also short and predictable
    const guestCode = generateRoomCode();
    this.localPeerId = guestCode;
    this.peer = new Peer(roomCodeToPeerId(guestCode), { debug: 1 });

    this.peer.on("open", (id) => {
      this.localPeerId = id.startsWith("2ds-") ? id.slice(4) : id;
      const hostPeerId = roomCodeToPeerId(hostCode.toUpperCase());
      this.setState("connecting", `dialing room ${hostCode.toUpperCase()}`);
      const conn = this.peer!.connect(hostPeerId, {
        reliable: false,
        serialization: "binary",
      });
      this.conn = conn;
      this.bindConn(conn);
    });

    this.peer.on("error", (err) => {
      this.setState("error", err.message ?? String(err));
    });
  }

  private bindConn(conn: DataConnection): void {
    conn.on("open", () => {
      this.remotePeerId = conn.peer;
      this.setState("connected", `linked to ${conn.peer}`);
      if (this.role === "guest") {
        this.send({ kind: "hello", role: "guest", peerId: this.localPeerId! });
      }
    });

    conn.on("data", (data) => {
      try {
        let bytes: ArrayBuffer | Uint8Array;
        if (data instanceof ArrayBuffer) bytes = data;
        else if (data instanceof Uint8Array) bytes = data;
        else if (Array.isArray(data)) bytes = new Uint8Array(data);
        else return;
        const msg = decodeMessage(bytes);
        this.messageListeners.forEach((l) => l(msg));
      } catch (err) {
        console.error("decode failure", err);
      }
    });

    conn.on("close", () => {
      this.setState("disconnected", "remote closed");
      this.conn = null;
    });

    conn.on("error", (err) => {
      this.setState("error", err.message ?? String(err));
    });
  }

  send(msg: NetMessage): void {
    if (!this.conn || !this.conn.open) return;
    try {
      const bytes = encodeMessage(msg);
      // ArrayBufferView is fine for peerjs binary mode
      this.conn.send(bytes);
    } catch (err) {
      console.error("send failure", err);
    }
  }

  teardown(): void {
    try {
      this.conn?.close();
    } catch {
      /* ignore */
    }
    try {
      this.peer?.destroy();
    } catch {
      /* ignore */
    }
    this.conn = null;
    this.peer = null;
    this.localPeerId = null;
    this.remotePeerId = null;
    this.role = null;
    this.setState("idle");
  }
}
