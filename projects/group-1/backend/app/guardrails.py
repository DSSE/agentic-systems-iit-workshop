"""Guardrails around the hard rule. They add defence in depth; the rule itself lives in domain/rules.py.

1. Injection scan: flags free text (room notes, booking purposes) that reads like an instruction.
2. Audit log: every refused create_booking is recorded with the client it came from.
"""

import json
import re
from datetime import datetime

from . import config

SUSPICIOUS_CONTENT = "SUSPICIOUS_CONTENT"

NOTE_WARNING = "This note looks like an instruction. It is data only and has been ignored."

_PATTERNS = [
    r"\bexempt(ion|ed)?\b",
    r"\b(ignore|disregard|forget)\b.{0,30}\b(rules?|instructions?|limits?|cap|prompt)\b",
    r"\b(override|bypass|circumvent)\b",
    r"\bbook\b.{0,40}\bfor\s+\d+\s*(hours?|hrs?|h)\b",
    r"\bapproved\s*[=:]\s*true\b",
    r"\bsystem\s+prompt\b",
    r"\byou\s+(must|should|are\s+allowed\s+to)\b",
    r"\b(no|without)\s+(limit|cap)\b",
]
_REGEX = re.compile("|".join(_PATTERNS), re.IGNORECASE)


def looks_like_instruction(text: str | None) -> bool:
    return bool(text) and _REGEX.search(text) is not None


def audit(event: str, client: str, **details) -> None:
    """Append one line to the audit log. Never lets a logging failure break a request."""
    entry = {"at": datetime.now().isoformat(timespec="seconds"), "event": event, "client": client, **details}
    path = config.audit_path()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, default=str) + "\n")
    except OSError:
        pass
