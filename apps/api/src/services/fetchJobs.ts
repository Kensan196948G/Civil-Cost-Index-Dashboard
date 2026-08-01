import type { Sql } from "../lib/db";

export async function listFetchJobs(
  sql: Sql,
  opts: { status?: string; limit: number }
) {
  const conditions: string[] = ["1 = 1"];
  const params: unknown[] = [];
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`tl.transform_status = $${params.length}`);
  }
  params.push(opts.limit);
  const rows = await sql(
    `
    SELECT sf.id, sf.data_source_id, ds.source_name, sf.original_url,
           COALESCE(tl.transform_status, sf.fetch_status) AS status,
           sf.file_name, sf.file_hash, sf.fetched_at,
           tl.total_rows, tl.success_rows, tl.error_rows, tl.error_detail,
           tl.started_at, tl.finished_at
    FROM source_files sf
    JOIN data_sources ds ON ds.id = sf.data_source_id
    LEFT JOIN transform_logs tl ON tl.source_file_id = sf.id
    WHERE ${conditions.join(" AND ")}
    ORDER BY sf.fetched_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    data_source_id: r.data_source_id,
    data_source_name: r.source_name,
    job_type: r.original_url ? "manual_fetch" : "manual_upload",
    status: r.status,
    file_name: r.file_name,
    original_url: r.original_url,
    file_hash: r.file_hash ? `sha256:${r.file_hash}` : null,
    total_rows: r.total_rows,
    success_rows: r.success_rows,
    error_rows: r.error_rows,
    error_detail: r.error_detail ?? [],
    started_at: r.started_at ?? r.fetched_at,
    finished_at: r.finished_at,
  }));
}
