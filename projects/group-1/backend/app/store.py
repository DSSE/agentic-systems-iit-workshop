"""Reads and writes data.json. Only tools.create_booking may call save()."""

import json
import os
import tempfile
import threading

from .config import data_path
from .domain.models import Booking, Room

# Held by create_booking across re-check and save, so two approvals can't both pass the overlap check.
write_lock = threading.Lock()


def load_raw() -> dict:
    with open(data_path(), encoding="utf-8") as f:
        return json.load(f)


def load() -> tuple[list[Room], list[Booking]]:
    raw = load_raw()
    rooms = [Room(**r) for r in raw.get("rooms", [])]
    bookings = [Booking(**b) for b in raw.get("bookings", [])]
    return rooms, bookings


def save_raw(raw: dict) -> None:
    """Write to a temp file and swap it in, so a crash never leaves data.json half-written."""
    path = data_path()
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=".data-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(raw, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.remove(tmp)
        raise
