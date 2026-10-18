import { describe, expect, it } from "vitest";
import { checkCapacity, MAX_POINTS } from "./capacity";

describe("checkCapacity (hard rule: max 8 points per member)", () => {
  it("allows a member to land exactly on 8 points (boundary)", () => {
    const result = checkCapacity(5, 3);
    expect(result.ok).toBe(true);
    expect(result.projected).toBe(8);
    expect(result.max).toBe(MAX_POINTS);
  });

  it("refuses a member landing on 9 points (breaks the rule)", () => {
    const result = checkCapacity(5, 4);
    expect(result.ok).toBe(false);
    expect(result.projected).toBe(9);
  });

  it("refuses assigning all 6 backlog points (19) to one member starting at 0", () => {
    const result = checkCapacity(0, 19);
    expect(result.ok).toBe(false);
  });
});
