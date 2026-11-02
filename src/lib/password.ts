import { randomInt } from "node:crypto";

/** Agreed policy: at least 10 characters, and the new password must differ from the current one. */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

// No look-alike characters (0/O, 1/l/I), so a temporary password can be read out or copied by hand.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** A one-time temporary password, e.g. "Hq7k-Wm3p-Zt9x". */
export function generateTempPassword(): string {
  const group = () =>
    Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
}
