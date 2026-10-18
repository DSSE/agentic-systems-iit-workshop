from __future__ import annotations

import json
import os
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = Path(os.getenv("CLUBOPS_DATA_FILE", ROOT / "data.json"))
DB_FILE = Path(os.getenv("CLUBOPS_SQLITE_FILE", ROOT / "clubops.sqlite3"))
CAP_POISHA = 100
MAX_QUANTITY = 10000
PROPOSAL_TTL_SECONDS = 30 * 60

app = FastAPI(title="ClubOps API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)
proposal_lock = threading.RLock()
proposals: dict[str, dict[str, Any]] = {}


class LineItem(BaseModel):
    vendor_id: str
    quantity: int = Field(gt=0, le=MAX_QUANTITY)


class Basket(BaseModel):
    items: list[LineItem] = Field(min_length=1, max_length=50)
    description: str = Field(default="", max_length=500)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_FILE, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialise() -> None:
    source = json.loads(DATA_FILE.read_text())
    event = source["event"]
    with connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS event (
              id INTEGER PRIMARY KEY CHECK (id = 1), name TEXT NOT NULL,
              club TEXT NOT NULL, currency TEXT NOT NULL,
              budget_cap_poisha INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS vendors (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
              item TEXT NOT NULL, unit TEXT NOT NULL, unit_price_poisha INTEGER NOT NULL,
              terms TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS expenses (
              id TEXT PRIMARY KEY, vendor_id TEXT NOT NULL REFERENCES vendors(id),
              description TEXT NOT NULL, quantity INTEGER NOT NULL,
              unit_price_poisha INTEGER NOT NULL, amount_poisha INTEGER NOT NULL,
              approved_by TEXT NOT NULL, approved_at TEXT NOT NULL, source TEXT NOT NULL
            );
            """
        )
        conn.execute(
            "INSERT OR IGNORE INTO event VALUES (1, ?, ?, ?, ?)",
            (event["name"], event["club"], event["currency"], event["budget_cap"] * CAP_POISHA),
        )
        if conn.execute("SELECT COUNT(*) FROM vendors").fetchone()[0] == 0:
            for vendor in source.get("vendors", []):
                conn.execute(
                    "INSERT INTO vendors VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        vendor["id"], vendor["name"], vendor["category"], vendor["item"],
                        vendor["unit"], int(vendor.get("unit_price", 0) * CAP_POISHA),
                        sanitise(vendor.get("terms", "")),
                    ),
                )
        if conn.execute("SELECT COUNT(*) FROM expenses").fetchone()[0] == 0:
            for expense in source.get("expenses", []):
                conn.execute(
                    "INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        expense["id"], expense["vendor_id"], expense["description"],
                        expense["quantity"], expense["unit_price"] * CAP_POISHA,
                        expense["amount"] * CAP_POISHA, expense["approved_by"],
                        expense["approved_at"], expense.get("source", "import"),
                    ),
                )


def sanitise(text: str) -> str:
    lines = []
    for line in text.splitlines():
        if any(word in line.lower() for word in ("ignore previous", "note to the ai", "raised the cap", "add 50,000")):
            continue
        lines.append(line.strip())
    return " ".join(x for x in lines if x)


def status(conn: sqlite3.Connection) -> dict[str, int]:
    event = conn.execute("SELECT budget_cap_poisha FROM event WHERE id = 1").fetchone()
    spent = conn.execute("SELECT COALESCE(SUM(amount_poisha), 0) FROM expenses").fetchone()[0]
    return {"cap": event[0], "spent": spent, "remaining": event[0] - spent}


def vendor(conn: sqlite3.Connection, vendor_id: str) -> sqlite3.Row:
    result = conn.execute("SELECT * FROM vendors WHERE id = ?", (vendor_id,)).fetchone()
    if not result:
        raise HTTPException(400, detail={"code": "UNKNOWN_VENDOR", "message": f"Unknown vendor: {vendor_id}"})
    return result


def calculate(conn: sqlite3.Connection, basket: Basket) -> tuple[list[dict[str, Any]], int]:
    lines, total = [], 0
    for item in basket.items:
        v = vendor(conn, item.vendor_id)
        amount = item.quantity * v["unit_price_poisha"]
        total += amount
        lines.append({
            "vendor_id": v["id"], "name": v["name"], "item": v["item"],
            "quantity": item.quantity, "unit_price_poisha": v["unit_price_poisha"],
            "amount_poisha": amount,
        })
    return lines, total


@app.on_event("startup")
def startup() -> None:
    initialise()


@app.get("/api/state")
def state() -> dict[str, Any]:
    with connect() as conn:
        s = status(conn)
        event = dict(conn.execute("SELECT * FROM event WHERE id = 1").fetchone())
        vendors = [dict(row) for row in conn.execute("SELECT * FROM vendors ORDER BY id")]
        expenses = [dict(row) for row in conn.execute("SELECT * FROM expenses ORDER BY approved_at DESC")]
        return {"event": event, "status": s, "vendors": vendors, "expenses": expenses}


@app.get("/api/vendors")
def list_vendors() -> dict[str, Any]:
    with connect() as conn:
        return {"vendors": [dict(row) for row in conn.execute("SELECT id, name, category, item, unit, unit_price_poisha, terms FROM vendors ORDER BY id")]}


@app.post("/api/check")
def check_budget(basket: Basket) -> dict[str, Any]:
    with connect() as conn:
        lines, total = calculate(conn, basket)
        s = status(conn)
        remaining = s["remaining"] - total
        return {"ok": remaining >= 0, "lines": lines, "proposed_total_poisha": total,
                "current_total_poisha": s["spent"], "cap_poisha": s["cap"],
                "remaining_after_poisha": remaining,
                **({"code": "BUDGET_CAP_EXCEEDED"} if remaining < 0 else {})}


@app.post("/api/proposals", status_code=201)
def create_proposal(basket: Basket, request: Request) -> dict[str, Any]:
    with proposal_lock, connect() as conn:
        lines, total = calculate(conn, basket)
        s = status(conn)
        if s["spent"] + total > s["cap"]:
            raise HTTPException(422, detail={"code": "BUDGET_CAP_EXCEEDED", "cap_poisha": s["cap"], "remaining_poisha": s["remaining"]})
        proposal_id = secrets.token_urlsafe(12)
        proposal = {"id": proposal_id, "session": request.headers.get("x-session-id", ""),
                    "expires_at": time.time() + PROPOSAL_TTL_SECONDS, "lines": lines,
                    "description": basket.description, "total_poisha": total,
                    "projected_spend_poisha": s["spent"] + total}
        proposals[proposal_id] = proposal
        return {"ok": True, "proposal": proposal}


@app.post("/api/proposals/{proposal_id}/approve")
def approve(proposal_id: str, request: Request) -> dict[str, Any]:
    with proposal_lock:
        proposal = proposals.get(proposal_id)
        if not proposal or proposal["expires_at"] < time.time():
            proposals.pop(proposal_id, None)
            raise HTTPException(404, detail={"code": "PROPOSAL_NOT_FOUND"})
        if proposal["session"] != request.headers.get("x-session-id", ""):
            raise HTTPException(403, detail={"code": "PROPOSAL_SESSION_MISMATCH"})
        with connect() as conn:
            if proposal.get("approved"):
                return {"ok": True, "proposal": proposal}
            for line in proposal["lines"]:
                current = vendor(conn, line["vendor_id"])
                if current["unit_price_poisha"] != line["unit_price_poisha"]:
                    raise HTTPException(409, detail={"code": "PROPOSAL_STALE", "message": "Vendor prices changed; create a fresh proposal."})
            conn.execute("BEGIN IMMEDIATE")
            s = status(conn)
            if s["spent"] + proposal["total_poisha"] > s["cap"]:
                raise HTTPException(422, detail={"code": "BUDGET_CAP_EXCEEDED"})
            now = str(time.time())
            for line in proposal["lines"]:
                conn.execute(
                    "INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (f"E-{secrets.token_hex(6)}", line["vendor_id"], proposal["description"] or line["item"],
                     line["quantity"], line["unit_price_poisha"], line["amount_poisha"],
                     "ui user", now, "ui"),
                )
        proposal["approved"] = True
        return {"ok": True, "proposal": proposal}


@app.post("/api/proposals/{proposal_id}/reject")
def reject(proposal_id: str) -> dict[str, bool]:
    if not proposals.pop(proposal_id, None):
        raise HTTPException(404, detail={"code": "PROPOSAL_NOT_FOUND"})
    return {"ok": True}
