import { describe, expect, it } from "vitest";
import { estimatePortCost, type VesselInput } from "../src/lib/portCost";

const grab: VesselInput = {
  vessel_code: "GRAB_8M3",
  vessel_name: "グラブ浚渫船 8m3",
  category: "浚渫船",
  capacity: 800,
  capacity_unit: "m3/日",
  hire_rate_per_day: 950000,
  availability_factor: 0.7,
  mobilization_days: 3,
  standby_rate: 0.5,
};

describe("estimatePortCost", () => {
  it("computes work days, standby, hire and mobilization", () => {
    const r = estimatePortCost({
      workTypeName: "浚渫工",
      unit: "m3",
      quantity: 10000,
      vessels: [{ vessel: grab, quantity_per_unit: 1, is_primary: true }],
      operationRate: 0.7,
      mobilizationDays: 2,
    });
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.daily_output).toBe(560); // 800 × 0.7
    expect(row.work_days).toBe(18); // ceil(10000 / 560)
    expect(row.standby_days).toBe(6); // ceil(18 × 0.3)
    expect(row.hire_cost).toBe(24 * 950000);
    expect(row.mobilization_cost).toBe(2 * 950000);
    expect(r.total_cost).toBe(row.hire_cost + row.mobilization_cost);
    expect(r.assumptions.length).toBeGreaterThan(3);
  });

  it("clamps operation rate", () => {
    const r = estimatePortCost({
      workTypeName: "浚渫工",
      unit: "m3",
      quantity: 1000,
      vessels: [{ vessel: grab, quantity_per_unit: 1, is_primary: true }],
      operationRate: 2,
    });
    expect(r.operation_rate).toBe(1);
  });
});
