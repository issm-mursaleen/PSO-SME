"""In-memory data store — the backend's source of truth for chat, queries and
workflows. Seeded to mirror the frontend AppContext so chat references resolve
to the same customers. Swap this module for a real DB later without touching
the workflow logic."""
from __future__ import annotations

import threading
from datetime import datetime, timedelta
from typing import Any, Optional

_lock = threading.Lock()


def _today() -> datetime:
    return datetime(2026, 6, 25)


customers: list[dict[str, Any]] = [
    {
        "id": "cust-riaz", "name": "Riaz Ahmed", "phone": "+92 300 9876543",
        "type": "Household", "channel": "WhatsApp", "neighborhood": "Clifton Block 2",
        "creditLimit": 50000, "balance": 15000, "status": "Active",
        "healthScore": 45, "lastVisitDays": 18,
    },
    {
        "id": "cust-sana", "name": "Sana Bibi", "phone": "+92 312 3456789",
        "type": "Household", "channel": "Call", "neighborhood": "DHA Phase 2",
        "creditLimit": 20000, "balance": 0, "status": "Active",
        "healthScore": 78, "lastVisitDays": 9,
    },
    {
        "id": "cust-iqbal", "name": "Iqbal Confectionary", "phone": "+92 333 4567890",
        "type": "Retailer", "channel": "SMS", "neighborhood": "Saddar",
        "creditLimit": 100000, "balance": 4500, "status": "Active",
        "healthScore": 92, "lastVisitDays": 1,
    },
    {
        "id": "cust-malik", "name": "Malik Store", "phone": "+92 321 5556667",
        "type": "Wholesaler", "channel": "WhatsApp", "neighborhood": "Gulshan-e-Iqbal",
        "creditLimit": 80000, "balance": 12000, "status": "Active",
        "healthScore": 60, "lastVisitDays": 5,
    },
    {
        "id": "cust-nadeem", "name": "Nadeem Chacha", "phone": "+92 300 2223344",
        "type": "Household", "channel": "WhatsApp", "neighborhood": "Nazimabad",
        "creditLimit": 30000, "balance": 8500, "status": "Active",
        "healthScore": 69, "lastVisitDays": 3,
    },
]

invoices: list[dict[str, Any]] = [
    {
        "id": "INV-2040", "customerId": "cust-riaz", "customerName": "Riaz Ahmed",
        "date": "2026-06-06", "amount": 15000, "status": "Overdue", "paymentType": "Udhar",
    },
    {
        "id": "INV-2041", "customerId": "cust-iqbal", "customerName": "Iqbal Confectionary",
        "date": "2026-06-24", "amount": 4500, "status": "Unpaid", "paymentType": "Udhar",
    },
]

transactions: list[dict[str, Any]] = [
    {
        "id": "TXN-1001", "customerId": "cust-malik", "customerName": "Malik Store",
        "type": "Repayment", "amount": 8000, "date": "2026-06-20", "ref": "Cash Receipt",
    },
]

_seq = {"inv": 3000, "txn": 2000, "cust": 100}


def _next(kind: str, prefix: str) -> str:
    with _lock:
        _seq[kind] += 1
        return f"{prefix}{_seq[kind]}"


def next_invoice_id() -> str:
    return _next("inv", "INV-")


def next_txn_id() -> str:
    return _next("txn", "TXN-")


def next_customer_id() -> str:
    return _next("cust", "cust-")


def sync_customers(rows: list[dict[str, Any]]) -> None:
    """Replace the roster with the live list the frontend sent, so chat can
    resolve any customer the user has (the frontend AppContext is the source of
    truth). In-place slice assignment keeps the same list object the workflows
    already reference."""
    if not rows:
        return
    mapped = [
        {
            "id": r["id"],
            "name": r["name"],
            "phone": r.get("phone", ""),
            "type": r.get("type", "Household"),
            "channel": r.get("channel", "WhatsApp"),
            "neighborhood": r.get("neighborhood", ""),
            "creditLimit": r.get("creditLimit", 0),
            "balance": r.get("balance", 0),
            "status": r.get("status", "Active"),
            "healthScore": r.get("healthScore", 70),
            "lastVisitDays": r.get("lastVisitDays", 0),
        }
        for r in rows
        if r.get("id") and r.get("name")
    ]
    with _lock:
        customers[:] = mapped


def find_customer(query: str) -> Optional[dict[str, Any]]:
    """Resolve a customer by id, exact, or fuzzy (case-insensitive substring on
    first/last name). Returns the single match, or None if absent/ambiguous."""
    if not query:
        return None
    q = query.strip().lower()
    for c in customers:
        if c["id"].lower() == q:
            return c
    exact = [c for c in customers if c["name"].lower() == q]
    if exact:
        return exact[0]
    matches = [c for c in customers if q in c["name"].lower()]
    if len(matches) == 1:
        return matches[0]
    # token match (e.g. "nadeem" against "Nadeem Chacha")
    token = [c for c in customers if any(q == part.lower() for part in c["name"].split())]
    if len(token) == 1:
        return token[0]
    return None


def find_customer_candidates(query: str) -> list[dict[str, Any]]:
    q = (query or "").strip().lower()
    return [c for c in customers if q in c["name"].lower()] if q else []


def days_since(date_str: str) -> int:
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        return (_today() - d).days
    except ValueError:
        return 0


def recovered_since(days: int) -> tuple[int, int]:
    """(total recovered, distinct customers) in the last `days`."""
    cutoff = _today() - timedelta(days=days)
    rows = [
        t for t in transactions
        if t["type"] == "Repayment" and _parse(t["date"]) >= cutoff
    ]
    total = sum(t["amount"] for t in rows)
    return total, len({t["customerId"] for t in rows})


def _parse(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return datetime(2000, 1, 1)
