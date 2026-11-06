import process from "node:process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { pool } from "./client";
import { CONSTANTS } from "@lumina/config";

async function main(): Promise<void> {
  await fs.mkdir(CONSTANTS.UPLOAD_DIR, { recursive: true });
  const migrationsPath = path.resolve(__dirname, "../migrations");
  const migrations = (await fs.readdir(migrationsPath))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "_Migration" (
      "name" TEXT PRIMARY KEY,
      "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

    for (const name of migrations) {
      const applied = await client.query(`SELECT 1 FROM "_Migration" WHERE name = $1`, [name]);
      if (applied.rowCount) continue;
      const sql = await fs.readFile(path.join(migrationsPath, name), "utf8");
      console.log(`Applying migration ${name}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_Migration" (name) VALUES ($1)`, [name]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    console.log(`Database is up to date (${migrations.length} migrations).`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database migration failed:", error);
  process.exitCode = 1;
});
