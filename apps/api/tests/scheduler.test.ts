import { describe, expect, it } from "vitest";
import { computeNextRun } from "../src/lib/scheduler";

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
