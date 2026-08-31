import { writeFile } from "node:fs/promises";
import { closeSqlConnections, getSql } from "./lib/db";
import { runScheduledJobs } from "./lib/scheduler";
import { parseSchedulerSeconds, runSchedulerLoop } from "./lib/schedulerLoop";
import type { Env } from "./types";

const intervalSeconds = parseSchedulerSeconds(process.env.SCHEDULER_INTERVAL_SECONDS, 300, 30);
const retrySeconds = parseSchedulerSeconds(process.env.SCHEDULER_RETRY_SECONDS, 3600, 60);
const leaseSeconds = parseSchedulerSeconds(process.env.SCHEDULER_LEASE_SECONDS, 900, 60);

const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL ?? "",
  ADMIN_API_KEY: "",
  CORS_ORIGINS: "",
  APP_VERSION: process.env.APP_VERSION ?? "0.1.0",
  FETCH_ALLOWED_HOSTS: process.env.FETCH_ALLOWED_HOSTS ?? "",
  NOTIFY_TEAMS_URL: process.env.NOTIFY_TEAMS_URL ?? "",
  NOTIFY_SLACK_URL: process.env.NOTIFY_SLACK_URL ?? "",
};

const abortController = new AbortController();
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(JSON.stringify({ event: "scheduler_shutdown", signal }));
    abortController.abort();
  });
}

const sql = getSql(env);
console.log(JSON.stringify({ event: "scheduler_started", interval_seconds: intervalSeconds }));

await runSchedulerLoop({
  intervalMilliseconds: intervalSeconds * 1000,
  signal: abortController.signal,
  runOnce: async () => {
    const summary = await runScheduledJobs(sql, env, new Date(), { leaseSeconds, retrySeconds });
    await writeFile("/tmp/cci-scheduler-heartbeat", String(Date.now()), "utf8");
    console.log(JSON.stringify({ event: "scheduler_cycle", ...summary }));
  },
  onError: (error) => console.error("scheduler_cycle_failed", error),
});

await closeSqlConnections();
