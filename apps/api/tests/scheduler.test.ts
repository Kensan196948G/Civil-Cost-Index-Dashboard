import { describe, expect, it } from "vitest";
import { computeNextRun, staleThresholdDays } from "../src/lib/scheduler";
import { parseSchedulerSeconds, runSchedulerLoop } from "../src/lib/schedulerLoop";

describe("computeNextRun", () => {
  const base = new Date("2026-08-04T01:00:00+09:00");

  it("daily advances one day", () => {
    const next = computeNextRun("daily", null, base);
    expect(next.getTime()).toBe(base.getTime() + 24 * 60 * 60 * 1000);
  });

  it("monthly advances one month and uses expected day", () => {
    const next = computeNextRun("monthly", 25, base);
    expect(next.getMonth()).toBe(8); // 9月
    expect(next.getDate()).toBe(25);
  });

  it("monthly clamps expected day to month end", () => {
    const next = computeNextRun("monthly", 31, new Date("2026-01-31T01:00:00+09:00"));
    expect(next.getMonth()).toBe(1); // 2月
    expect(next.getDate()).toBe(28);
  });

  it("yearly advances one year", () => {
    const next = computeNextRun("yearly", 1, base);
    expect(next.getFullYear()).toBe(2027);
    expect(next.getDate()).toBe(1);
  });
});

describe("staleThresholdDays", () => {
  it.each([
    ["daily", null, 2],
    ["monthly", null, 62],
    ["yearly", null, 730],
    ["monthly", 40, 80],
  ])("uses twice the planned interval for %s", (type, expected, threshold) => {
    expect(staleThresholdDays(type, expected)).toBe(threshold);
  });
});

describe("parseSchedulerSeconds", () => {
  it("accepts an integer at or above the minimum", () => {
    expect(parseSchedulerSeconds("60", 300, 30)).toBe(60);
  });

  it.each([undefined, "", "29", "1.5", "invalid"])("uses the fallback for %s", (value) => {
    expect(parseSchedulerSeconds(value, 300, 30)).toBe(300);
  });
});

describe("runSchedulerLoop", () => {
  it("runs immediately and does not overlap cycles", async () => {
    const controller = new AbortController();
    let active = 0;
    let maximumActive = 0;
    let runs = 0;

    await runSchedulerLoop({
      intervalMilliseconds: 1,
      signal: controller.signal,
      runOnce: async () => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        runs++;
        await new Promise((resolve) => setTimeout(resolve, 2));
        active--;
        if (runs === 2) controller.abort();
      },
      onError: () => undefined,
    });

    expect(runs).toBe(2);
    expect(maximumActive).toBe(1);
  });

  it("continues after a cycle fails", async () => {
    const controller = new AbortController();
    let runs = 0;
    const errors: unknown[] = [];

    await runSchedulerLoop({
      intervalMilliseconds: 1,
      signal: controller.signal,
      runOnce: async () => {
        runs++;
        if (runs === 1) throw new Error("temporary failure");
        controller.abort();
      },
      onError: (error) => errors.push(error),
    });

    expect(runs).toBe(2);
    expect(errors).toHaveLength(1);
  });
});
