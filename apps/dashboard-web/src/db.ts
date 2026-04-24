import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  pool = new Pool({
    connectionString: url,
    max: 8,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: readonly unknown[] = []
): Promise<T[]> {
  const res = await getPool().query(sql, params as unknown[]);
  return res.rows as T[];
}
