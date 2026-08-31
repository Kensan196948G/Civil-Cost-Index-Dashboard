import { neon } from "@neondatabase/serverless";
import type { Env } from "../types";

// DB boundary type: rows are treated as record maps (any is deliberate at the
// driver boundary; handlers validate/coerce values before returning them).
export interface Sql {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Array<Record<string, any>>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (query: string, params?: unknown[]): Promise<Array<Record<string, any>>>;
}

type PgPoolLike = {
  query(query: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
  end(): Promise<void>;
};

const pgPools = new Map<string, Promise<PgPoolLike>>();

function isLocalPgUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.searchParams.get("sslmode") === "disable" ||
      ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

async function getPgPool(connectionString: string): Promise<PgPoolLike> {
  const existing = pgPools.get(connectionString);
  if (existing) return existing;
  const created = import("pg").then((mod) => {
    const Pool = mod.default?.Pool ?? mod.Pool;
    return new Pool({ connectionString, max: 5 }) as PgPoolLike;
  });
  pgPools.set(connectionString, created);
  return created;
}

function taggedToPgQuery(strings: TemplateStringsArray, values: unknown[]): { text: string; values: unknown[] } {
  let text = "";
  for (let i = 0; i < strings.length; i++) {
    text += strings[i];
    if (i < values.length) text += `$${i + 1}`;
  }
  return { text, values };
}

function getLocalPgSql(connectionString: string): Sql {
  return (async (stringsOrQuery: TemplateStringsArray | string, ...values: unknown[]) => {
    const pool = await getPgPool(connectionString);
    if (typeof stringsOrQuery === "string") {
      const params = Array.isArray(values[0]) ? (values[0] as unknown[]) : values;
      return (await pool.query(stringsOrQuery, params)).rows;
    }
    const query = taggedToPgQuery(stringsOrQuery, values);
    return (await pool.query(query.text, query.values)).rows;
  }) as Sql;
}

export function getSql(env: Env): Sql {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (isLocalPgUrl(env.DATABASE_URL)) {
    return getLocalPgSql(env.DATABASE_URL);
  }
  return neon(env.DATABASE_URL) as unknown as Sql;
}

export async function closeSqlConnections(): Promise<void> {
  const pools = [...pgPools.values()];
  pgPools.clear();
  await Promise.all(pools.map(async (pool) => (await pool).end()));
}
