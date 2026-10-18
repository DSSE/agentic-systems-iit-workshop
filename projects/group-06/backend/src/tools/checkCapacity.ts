import { readBoard } from "../data/store";
import { checkCapacity as checkCapacityRule, CapacityResult } from "../domain/capacity";

export class UnknownMemberError extends Error {}

export function checkCapacity(memberId: string, additionalPoints: number): CapacityResult {
  const { members } = readBoard();
  const member = members.find((m) => m.id === memberId);
  if (!member) {
    throw new UnknownMemberError(`Unknown member: ${memberId}`);
  }
  return checkCapacityRule(member.points, additionalPoints);
}
