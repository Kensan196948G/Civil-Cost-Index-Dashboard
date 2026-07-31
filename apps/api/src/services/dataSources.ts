import { z } from "zod";
import type { Sql } from "../lib/db";

export const dataSourceCreateSchema = z.object({
  source_code: z.string().min(1).max(100),
  source_name: z.string().min(1).max(200),
  source_type: z.enum(["material", "labor", "index", "fuel", "other"]),
  provider_name: z.string().min(1).max(200),
  source_url: z.string().url().optional().nullable(),
  file_format: z.enum(["csv", "xlsx", "pdf", "html", "api"]).optional().nullable(),
  update_frequency: z.enum(["monthly", "yearly", "irregular"]).optional().nullable(),
  license_note: z.string().optional().nullable(),
  is_active: z.boolean().optional(),
});

export const dataSourcePatchSchema = dataSourceCreateSchema.partial();

export async function listDataSources(sql: Sql) {
  const rows = await sql`
    SELECT id, source_code, source_name, source_type, provider_name, source_url,
           file_format, update_frequency, license_note, is_active,
           last_fetched_at, created_at, updated_at
    FROM data_sources
    ORDER BY is_active DESC, source_code
  `;
  return rows.map((r) => ({
    id: r.id,
    source_code: r.source_code,
    source_name: r.source_name,
    source_type: r.source_type,
    provider_name: r.provider_name,
    source_url: r.source_url,
    file_format: r.file_format,
    update_frequency: r.update_frequency,
    license_note: r.license_note,
    is_active: r.is_active,
    last_fetched_at: r.last_fetched_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }));
}

export async function createDataSource(sql: Sql, input: z.infer<typeof dataSourceCreateSchema>) {
  try {
    const [row] = await sql`
      INSERT INTO data_sources
        (source_code, source_name, source_type, provider_name, source_url,
         file_format, update_frequency, license_note, is_active)
      VALUES
        (${input.source_code}, ${input.source_name}, ${input.source_type}, ${input.provider_name},
         ${input.source_url ?? null}, ${input.file_format ?? null}, ${input.update_frequency ?? null},
         ${input.license_note ?? null}, ${input.is_active ?? true})
      RETURNING id, source_code, source_name, source_type, provider_name, source_url,
                file_format, update_frequency, license_note, is_active,
                last_fetched_at, created_at, updated_at
    `;
    return row;
  } catch (e) {
    if (String(e).includes("duplicate key")) {
      const err = new Error(`データソースコード ${input.source_code} は既に登録されています。`);
      (err as Error & { status?: number }).status = 409;
      throw err;
    }
    throw e;
  }
}

export async function updateDataSource(
  sql: Sql,
  id: string,
  input: z.infer<typeof dataSourcePatchSchema>
) {
  const currentRows = await sql`
    SELECT source_code, source_name, source_type, provider_name, source_url,
           file_format, update_frequency, license_note, is_active
    FROM data_sources WHERE id = ${id}
  `;
  if (currentRows.length === 0) return null;
  const current = currentRows[0];
  const merged = {
    source_code: input.source_code ?? current.source_code,
    source_name: input.source_name ?? current.source_name,
    source_type: input.source_type ?? current.source_type,
    provider_name: input.provider_name ?? current.provider_name,
    source_url: input.source_url !== undefined ? input.source_url : current.source_url,
    file_format: input.file_format !== undefined ? input.file_format : current.file_format,
    update_frequency:
      input.update_frequency !== undefined ? input.update_frequency : current.update_frequency,
    license_note: input.license_note !== undefined ? input.license_note : current.license_note,
    is_active: input.is_active ?? current.is_active,
  };
  const [row] = await sql`
    UPDATE data_sources SET
      source_code = ${merged.source_code},
      source_name = ${merged.source_name},
      source_type = ${merged.source_type},
      provider_name = ${merged.provider_name},
      source_url = ${merged.source_url},
      file_format = ${merged.file_format},
      update_frequency = ${merged.update_frequency},
      license_note = ${merged.license_note},
      is_active = ${merged.is_active},
      updated_at = now()
    WHERE id = ${id}
    RETURNING id, source_code, source_name, source_type, provider_name, source_url,
              file_format, update_frequency, license_note, is_active,
              last_fetched_at, created_at, updated_at
  `;
  return row;
}
