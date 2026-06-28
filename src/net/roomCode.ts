// Short room code generation. A room code is a 4-character uppercase alphanumeric
// string (no ambiguous chars like O/0, I/1). Internally we namespace it as
// "2ds-<code>" when registering with the PeerJS broker, to avoid collisions
// with other apps using the same public broker.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
const CODE_LENGTH = 4;
const PEER_NAMESPACE = "2ds-";

export function generateRoomCode(): string {
  let code = "";
  const arr = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(arr);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[arr[i] % ALPHABET.length];
  }
  return code;
}

export function roomCodeToPeerId(code: string): string {
  return PEER_NAMESPACE + code.toUpperCase();
}

export function peerIdToRoomCode(peerId: string): string {
  if (peerId.startsWith(PEER_NAMESPACE)) {
    return peerId.slice(PEER_NAMESPACE.length);
  }
  return peerId;
}

export function isValidRoomCode(input: string): boolean {
  const upper = input.toUpperCase();
  if (upper.length !== CODE_LENGTH) return false;
  for (const ch of upper) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}
