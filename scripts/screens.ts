/**
 * pnpm screens
 * Screenshots each screen in dark and light mode at 375px and 1440px, for the per-phase
 * visual check (CLAUDE.md "Definition of done"). Needs the dev server running.
 *
 *   SCREENS_EMAIL=... SCREENS_PASSWORD=... pnpm screens [route ...]   e.g. pnpm screens dashboard audit-log
 *
 * Output: screenshots/<theme>-<width>-<route>.png (git-ignored). Browser errors are listed.
 */
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.SCREENS_BASE ?? "http://localhost:3100";
const EMAIL = process.env.SCREENS_EMAIL;
const PASSWORD = process.env.SCREENS_PASSWORD;

const DEFAULT_ROUTES = [
  "/sign-in",
  "/dashboard",
  "/admin/settings",
  "/admin/settings?tab=numbering",
  "/admin/settings?tab=lists",
  "/admin/users",
  "/audit-log",
  "/register",
  "/change-password",
  // Phase 2
  "/payers",
  "/payers/new",
  "/payers/OGS-P-0001",
  "/payers/OGS-P-0001/edit",
  "/fee-schedule",
  "/fee-schedule/GEN-02/edit",
  "/registration-fees",
  "/licence-fee-tables",
  "/revenue-budget",
];
const WIDTHS = [375, 1440];
const THEMES = ["dark", "light"] as const;

const slug = (route: string) => route.replace(/^\//, "").replace(/[/?=&]+/g, "_") || "home";

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error("Set SCREENS_EMAIL and SCREENS_PASSWORD.");
  // Routes may omit the leading slash (Git Bash rewrites "/dashboard" into a Windows path).
  const args = process.argv.slice(2).map((r) => "/" + r.replace(/^\/+/, ""));
  const routes = args.length ? args : DEFAULT_ROUTES;
  mkdirSync("screenshots", { recursive: true });
  const browser = await chromium.launch();
  const problems: string[] = [];

  // Sign in once and reuse the session for every viewport.
  const login = await browser.newContext();
  const lp = await login.newPage();
  await lp.goto(`${BASE}/sign-in`);
  await lp.fill("#email", EMAIL);
  await lp.fill("#password", PASSWORD);
  await lp.click("button[type=submit]");
  await lp.waitForURL((u) => !u.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  const storageState = await login.storageState();
  await login.close();

  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      for (const route of routes) {
        const signedOut = route.startsWith("/sign-in");
        const ctx = await browser.newContext({
          viewport: { width, height: width < 768 ? 812 : 900 },
          storageState: signedOut ? undefined : storageState,
          reducedMotion: "reduce",
        });
        await ctx.addInitScript((t) => localStorage.setItem("ogsrr:theme", t), theme);
        const page = await ctx.newPage();
        page.on("pageerror", (e) => problems.push(`${route} [${theme} ${width}] pageerror: ${e.message}`));
        page.on("console", (m) => {
          if (m.type() === "error") problems.push(`${route} [${theme} ${width}] console: ${m.text()}`);
        });
        await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
        // Let hydration finish (dev builds are slow) before Playwright touches the DOM.
        await page.waitForTimeout(1200);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) problems.push(`${route} [${theme} ${width}] horizontal overflow of ${overflow}px`);
        const file = `screenshots/${theme}-${width}-${slug(route)}.png`;
        await page.screenshot({ path: file, fullPage: true });
        console.log(`saved ${file}`);
        await ctx.close();
      }
    }
  }
  await browser.close();
  console.log(problems.length ? `\nProblems:\n${problems.join("\n")}` : "\nNo browser errors or horizontal overflow.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
