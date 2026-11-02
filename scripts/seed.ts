/**
 * pnpm seed                 reference data + the 36 real payers (production)
 * pnpm seed --with-sample   also the 10 sample payers, 7 DNs and 17 receipts (dev / preview only)
 */
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";
import { seedDatabase } from "../src/db/seed";

config({ path: ".env.local" });

async function main() {
  const withSample = process.argv.includes("--with-sample");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  if (withSample && process.env.APP_ENV === "production") {
    throw new Error("Refusing to load sample data: APP_ENV is production. Run `pnpm seed` without --with-sample.");
  }

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const db = drizzle(client, { schema });
  try {
    const result = await seedDatabase(db, { withSample });
    console.log(`Seed loaded (${withSample ? "with sample data" : "reference data only"}):`);
    console.table(result);
    console.log("Existing rows were left unchanged; serials were only raised, never lowered.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
