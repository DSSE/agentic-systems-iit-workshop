import { fmtDay, fmtTime } from "@/lib/time";
import type { RuleResult, Slot } from "@/lib/types";

type Props = { result: RuleResult; onUseSuggestion?: (slot: Slot) => void };

export default function RuleBox({ result, onUseSuggestion }: Props) {
  const slot = result.suggestion;
  return (
    <div className={`rule-box ${result.ok ? "ok" : "refused"}`} role="status">
      {result.rule_code && <code className="rule-code">{result.rule_code}</code>}
      <p>{result.message}</p>
      {slot && (
        <div className="suggestion">
          <span>
            Suggested: {slot.room_id} · {fmtDay(slot.start)} {fmtTime(slot.start)}–{fmtTime(slot.end)}
          </span>
          {onUseSuggestion && (
            <button type="button" className="secondary" onClick={() => onUseSuggestion(slot)}>
              Use this
            </button>
          )}
        </div>
      )}
    </div>
  );
}
