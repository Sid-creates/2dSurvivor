// MessagePack helpers. MessagePack is the wire format for all peer messages
// (ADR 0003). Centralized here so the rest of the codebase never touches
// the serialization library directly.

import { encode, decode } from "@msgpack/msgpack";
import type { NetMessage } from "../shared/types";

export function encodeMessage(msg: NetMessage): Uint8Array {
  return encode(msg);
}

export function decodeMessage(data: ArrayBuffer | Uint8Array): NetMessage {
  return decode(data) as NetMessage;
}
