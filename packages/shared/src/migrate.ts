import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./db.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema.sql");

async function main(): Promise<void> {
  const sql = readFileSync(schemaPath, "utf8");
  const pool = getPool();
  await pool.query(sql);
  console.log("[migrate] applied schema.sql");
  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
