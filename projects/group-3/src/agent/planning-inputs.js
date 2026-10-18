// Parse explicit human-provided event budget and attendee capacity.
// Seed values are useful for the demo UI, but never count as confirmed chat inputs.
const readNumber = (value) => Number(String(value).replaceAll(',', ''));

export function extractPlanningInputs(message = '', history = []) {
  const messages = [...history.filter((m) => m.role === 'user').map((m) => m.content), message]
    .filter((value) => typeof value === 'string');
  const budgetPatterns = [
    /\b([\d,]+)\s*(?:bdt\s*)?(?:event\s+)?(?:budget|spending\s+limit|cap)\b/i,
    /\b(?:budget|spending\s+limit|cap)\b[^\d]{0,24}([\d,]+)/i,
    /\b([\d,]+)\s*(?:bdt|taka|tk)\b/i,
  ];
  const capacityPatterns = [
    /\b(?:attendee\s+capacity|capacity)\b\s*(?:is|of|:|=|for)?\s*(\d+)/i,
    /\b(\d+)\s*(?:people|persons|attendees|guests|members)\b/i,
    /\b(?:attendees|people|persons|guests)\s*(?:capacity|count)?\s*(?:is|of|:|=)?\s*(\d+)/i,
  ];
  let budget = null;
  let capacity = null;
  for (const text of messages) {
    const budgetMatch = budgetPatterns.map((pattern) => text.match(pattern)).find(Boolean);
    const capacityMatch = capacityPatterns.map((pattern) => text.match(pattern)).find(Boolean);
    if (budgetMatch) budget = readNumber(budgetMatch[1]);
    if (capacityMatch) capacity = readNumber(capacityMatch[1]);
  }
  return {
    budget,
    capacity,
  };
}

export function isPlanningRequest(message = '') {
  return /\b(plan|planning|budget|spend|expense|propos(?:e|al)|add|order|book|buy|cater(?:ing)?|snacks?|speaker|food|lunch|dinner|meal|refreshments?|banner|sound|microphone)\b/i.test(message);
}

export function planningQuestion({ budget, capacity }) {
  if (budget == null && capacity == null) {
    return 'What is the total event budget in BDT, and how many people should I plan for?';
  }
  if (budget == null) return 'What is the total event budget in BDT?';
  if (capacity == null) return 'How many people should I plan for?';
  return null;
}
