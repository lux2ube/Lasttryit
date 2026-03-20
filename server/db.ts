import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error("SUPABASE_DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString,
  max: 2,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
