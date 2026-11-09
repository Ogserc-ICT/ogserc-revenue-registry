/**
 * Colours for server-generated PDFs. The PDF renderer can't read CSS variables, so this is the
 * one place they are defined. DESIGN.md 6: print documents are black on white, no gradients,
 * whatever the theme. Watermark colours follow DESIGN.md 6 (light grey; light red).
 */
export const PRINT = {
  ink: "#000000",
  rule: "#9a9a9a",
  muted: "#555555",
  alert: "#b3261e",
  watermarkGrey: "#d9d9d9",
  watermarkRed: "#f2b8b5",
} as const;
