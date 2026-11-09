import { readFileSync } from "node:fs";
import path from "node:path";
import { Font } from "@react-pdf/renderer";

// Never split words across lines ("col-lected"); wrap whole words only.
Font.registerHyphenationCallback((word) => [word]);

/**
 * The logo as file data: react-pdf treats a bare path as a URL to fetch. Read once per process.
 * ogserc-logo.png is 1920 x 1038, so show it at about 100 x 54.
 */
let logoData: { data: Buffer; format: "png" } | undefined;
export function pdfLogo() {
  logoData ??= { data: readFileSync(path.join(process.cwd(), "public", "brand", "ogserc-logo.png")), format: "png" };
  return logoData;
}
