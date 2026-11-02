/** Pure number formatters, safe to import in client components. */

const pad = (n: number, width: number) => String(n).padStart(width, "0");

/** OGSERC/RCT/2026/00018 */
export function formatReceiptNo(prefix: string, year: number, serial: number): string {
  return `${prefix}/${year}/${pad(serial, 5)}`;
}

/** OGSERC/DN/2026/0008 */
export function formatDnNo(prefix: string, year: number, serial: number): string {
  return `${prefix}/${year}/${pad(serial, 4)}`;
}

/** OGS-P-0047 */
export function formatPayerId(prefix: string, serial: number): string {
  return `${prefix}${pad(serial, 4)}`;
}

/** Parses the serial out of a formatted number, e.g. "OGSERC/DN/2026/0007" -> 7. */
export function parseSerial(formatted: string): number | null {
  const m = /(\d+)$/.exec(formatted);
  return m ? Number(m[1]) : null;
}
