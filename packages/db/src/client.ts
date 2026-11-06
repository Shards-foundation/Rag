import { Pool, type QueryResultRow } from "pg";
import { env } from "@lumina/config";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  max: 20,
});

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: any[] = [],
): Promise<{ rows: T[] }> {
  if (!env.DATABASE_URL) {
    throw new Error("Database access requires DATABASE_URL. Lite Mode does not use PostgreSQL.");
  }
  const client = await pool.connect();
  try {
    const result = await client.query<T>(text, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
}
