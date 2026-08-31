#!/usr/bin/env node
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

function percentile(sorted, value) {
  if (sorted.length === 0) return null;
  return sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];
}

export function summarizeRequestLogs(entries) {
  const requests = entries.filter((entry) => entry?.event === "http_request");
  const durations = requests
    .map((entry) => Number(entry.duration_ms))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const serverErrors = requests.filter((entry) => Number(entry.status) >= 500).length;
  return {
    requests: requests.length,
    server_errors: serverErrors,
    server_error_rate: requests.length === 0 ? 0 : serverErrors / requests.length,
    duration_ms: {
      p50: percentile(durations, 0.5),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      max: durations.at(-1) ?? null,
    },
  };
}

async function main() {
  const entries = [];
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) continue;
    try {
      entries.push(JSON.parse(line.slice(jsonStart)));
    } catch {
      // Ignore non-JSON container output.
    }
  }
  console.log(JSON.stringify(summarizeRequestLogs(entries), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
