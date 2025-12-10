import { Pool } from "pg";
import { env } from "@lumina/config";

// Defensive check for Lite Mode
const connectionString = env.DATABASE_URL || "postgresql://dummy:dummy@localhost:5432/dummy";

export const pool = new Pool({
  connectionString,
});

export async function query<T = any>(text: string, params: any[] = []): Promise<{ rows: T[] }> {
  const client = await pool.connect();
  try {
    const result = await client.query<T>(text, params);
    return { rows: result.rows };
  } finally {
    client.release();
  }
}