// The hard rule, in one place: the API, the MCP server and the agent
// must all call this module instead of re-implementing the limit.
export const MAX_POINTS = 8;

export interface CapacityResult {
  ok: boolean;
  current: number;
  projected: number;
  max: number;
}

export function checkCapacity(currentPoints: number, additionalPoints: number): CapacityResult {
  const projected = currentPoints + additionalPoints;
  return {
    ok: projected <= MAX_POINTS,
    current: currentPoints,
    projected,
    max: MAX_POINTS,
  };
}
