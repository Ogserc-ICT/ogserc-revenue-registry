import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/** Any Drizzle Postgres database or open transaction using this schema. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { ogsrrSql?: postgres.Sql };

function createClient() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare: false keeps us compatible with poolers in transaction mode (e.g. Neon's pooled URL).
  return postgres(url, { max: 5, prepare: false, idle_timeout: 20 });
}

const client = globalForDb.ogsrrSql ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.ogsrrSql = client;

export const db = drizzle(client, { schema });
export { schema };
