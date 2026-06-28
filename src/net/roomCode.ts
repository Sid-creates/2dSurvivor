// Short room code generation. A room code is a 4-character uppercase alphanumeric
// string (no ambiguous chars like O/0, I/1). The code maps directly to a PartyKit
// room id, namespaced as "2ds-<code>" so rooms never collide with other apps on
// the same PartyKit account.

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars, no 0/O/1/I
const CODE_LENGTH = 4;
const ROOM_NAMESPACE = "2ds-";

export function generateRoomCode(): string {
  let code = "";
  const arr = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(arr);
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[arr[i] % ALPHABET.length];
  }
  return code;
}

// The PartyKit room id for a given human-readable code.
export function roomCodeToRoomId(code: string): string {
  return ROOM_NAMESPACE + code.toUpperCase();
}

export function isValidRoomCode(input: string): boolean {
  const upper = input.toUpperCase();
  if (upper.length !== CODE_LENGTH) return false;
  for (const ch of upper) {
    if (!ALPHABET.includes(ch)) return false;
  }
  return true;
}

// A short, unique player id used as the PartySocket connection id and the
// authoritative player id inside the sim. Stays short so snapshots stay small.
export function generatePlayerId(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return ALPHABET[arr[0] % ALPHABET.length] + ALPHABET[arr[1] % ALPHABET.length] + Date.now().toString(36).slice(-4);
}
