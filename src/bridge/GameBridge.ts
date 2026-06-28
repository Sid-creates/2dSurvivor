// Phaser <-> React bridge. A single typed EventEmitter that lets React read
// game state and send intents to the simulation, without React touching Phaser
// internals and without Phaser touching React's render tree.

type Listener<T> = (payload: T) => void;

export type BridgeEvent =
  | { type: "snapshot"; snapshot: import("../shared/types").Snapshot }
  | { type: "lobby"; hostPeerId: string; guestPeerId: string | null }
  | { type: "connection"; state: import("../shared/types").ConnectionState; message?: string }
  | { type: "role"; role: import("../shared/types").PeerRole | null }
  | { type: "localPeerId"; peerId: string | null }
  | { type: "roomCode"; code: string | null }
  | { type: "swapCharge"; playerId: string; progress: number }
  | { type: "swapFired"; aId: string; bId: string }
  | { type: "boxMenu"; boxId: number; playerId: string; options: import("../shared/types").WeaponPickOption[] }
  | { type: "boxClosed"; boxId: number }
  | { type: "runEnded"; status: import("../shared/types").RunStatus }
  | { type: "error"; message: string };

export type BridgeIntent =
  | { type: "hostGame" }
  | { type: "joinGame"; hostPeerId: string }
  | { type: "disconnect" }
  | { type: "openBox"; boxId: number }
  | { type: "chooseBox"; boxId: number; optionIndex: number }
  | { type: "cancelBox"; boxId: number }
  | { type: "returnToLobby" };

export class GameBridge {
  private listeners: Map<string, Set<Listener<unknown>>> = new Map();
  private intentListeners: Set<Listener<BridgeIntent>> = new Set();

  on<T extends BridgeEvent["type"]>(
    type: T,
    listener: Listener<Extract<BridgeEvent, { type: T }>>,
  ): () => void {
    const key = type as string;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key)!.add(listener as Listener<unknown>);
    return () => {
      this.listeners.get(key)?.delete(listener as Listener<unknown>);
    };
  }

  emit(event: BridgeEvent): void {
    this.listeners.get(event.type)?.forEach((l) => l(event as unknown as never));
  }

  onIntent(listener: Listener<BridgeIntent>): () => void {
    this.intentListeners.add(listener);
    return () => this.intentListeners.delete(listener);
  }

  sendIntent(intent: BridgeIntent): void {
    this.intentListeners.forEach((l) => l(intent));
  }
}

export const bridge = new GameBridge();
