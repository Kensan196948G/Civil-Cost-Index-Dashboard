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

export function getSql(env: Env): Sql {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  return neon(env.DATABASE_URL) as unknown as Sql;
}
