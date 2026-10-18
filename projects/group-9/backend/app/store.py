"""Reads and writes data.json. Only approve may call add_booking."""

import json
import os
import tempfile
import threading
from pathlib import Path

from app.domain.booking_rules import Booking, Room


class Store:
    def __init__(self, path: Path) -> None:
        self.path = path
        # Approve holds this lock across re-check and write, so it must be re-entrant.
        self.lock = threading.RLock()

    def _read(self) -> dict:
        return json.loads(self.path.read_text(encoding="utf-8"))

    def load(self) -> tuple[list[Room], list[Booking]]:
        with self.lock:
            data = self._read()
        rooms = [Room.model_validate(r) for r in data["rooms"]]
        bookings = [Booking.model_validate(b) for b in data["bookings"]]
        return rooms, bookings

    def add_booking(self, booking: Booking) -> None:
        with self.lock:
            data = self._read()
            data["bookings"].append(booking.model_dump(mode="json"))
            self._write(data)

    def _write(self, data: dict) -> None:
        """Write to a temp file in the same folder, then replace, so a crash never leaves half a file."""
        fd, tmp = tempfile.mkstemp(dir=self.path.parent, prefix=".data-", suffix=".json")
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.write("\n")
            os.replace(tmp, self.path)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
