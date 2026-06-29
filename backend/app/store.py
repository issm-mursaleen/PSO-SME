"""In-memory data store — the backend's source of truth for chat, queries and
workflows. Seeded with 2 years of realistic Pakistani SME data (June 2024 –
June 2026) using deterministic pseudo-random generation (seed=42). Sync
functions accept live data from the frontend AppContext (source of truth) and
replace the seed data once a user session is running.
"""
from __future__ import annotations

import random
import threading
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

_lock = threading.Lock()
_PKT = ZoneInfo("Asia/Karachi")


def _today() -> datetime:
    """Return current Pakistan datetime (used for seed age calculations only)."""
    return datetime.now(_PKT).replace(tzinfo=None)


# ── Seed profiles ────────────────────────────────────────────────────────────
_CUSTOMERS_META: list[dict[str, Any]] = [
    {"id": "cust-riaz",   "name": "Riaz Ahmed",          "phone": "+92 300 9876543",
     "type": "Household",        "channel": "WhatsApp", "neighborhood": "Clifton Block 2",
     "status": "Active", "lastVisitDays": 18,
     "_avg": 14_000, "_std": 4_000, "_vpw": 1.2},
    {"id": "cust-sana",   "name": "Sana Bibi",           "phone": "+92 312 3456789",
     "type": "Household",        "channel": "Call",     "neighborhood": "DHA Phase 2",
     "status": "Active", "lastVisitDays": 9,
     "_avg": 9_000,  "_std": 3_000, "_vpw": 1.8},
    {"id": "cust-iqbal",  "name": "Iqbal Confectionary", "phone": "+92 333 4567890",
     "type": "Retailer",         "channel": "SMS",      "neighborhood": "Saddar",
     "status": "Active", "lastVisitDays": 1,
     "_avg": 38_000, "_std": 9_000, "_vpw": 2.5},
    {"id": "cust-malik",  "name": "Malik Store",         "phone": "+92 321 5556667",
     "type": "Wholesaler",       "channel": "WhatsApp", "neighborhood": "Gulshan-e-Iqbal",
     "status": "Active", "lastVisitDays": 5,
     "_avg": 72_000, "_std": 18_000, "_vpw": 1.5},
    {"id": "cust-nadeem", "name": "Nadeem Chacha",       "phone": "+92 300 2223344",
     "type": "Household",        "channel": "WhatsApp", "neighborhood": "Nazimabad",
     "status": "Active", "lastVisitDays": 3,
     "_avg": 7_500,  "_std": 2_500, "_vpw": 2.2},
    {"id": "cust-gen-1",  "name": "Ali Khan",            "phone": "+92 311 1234567",
     "type": "Household",        "channel": "WhatsApp", "neighborhood": "Clifton Block 4",
     "status": "Active", "lastVisitDays": 0,
     "_avg": 5_800,  "_std": 1_800, "_vpw": 2.0},
    {"id": "cust-gen-2",  "name": "Maria Qureshi",       "phone": "+92 312 2469134",
     "type": "Retailer",         "channel": "Call",     "neighborhood": "DHA Phase 5",
     "status": "Active", "lastVisitDays": 3,
     "_avg": 28_000, "_std": 7_000, "_vpw": 1.5},
    {"id": "cust-gen-3",  "name": "Adeel Butt",          "phone": "+92 313 3703701",
     "type": "Wholesaler",       "channel": "SMS",      "neighborhood": "Saddar",
     "status": "Active", "lastVisitDays": 6,
     "_avg": 55_000, "_std": 14_000, "_vpw": 1.0},
    {"id": "cust-gen-4",  "name": "Fatima Sheikh",       "phone": "+92 314 4938268",
     "type": "Hotel / Restaurant", "channel": "WhatsApp", "neighborhood": "Gulshan-e-Iqbal",
     "status": "Active", "lastVisitDays": 9,
     "_avg": 42_000, "_std": 10_000, "_vpw": 3.5},
    {"id": "cust-gen-5",  "name": "Bilal Hussain",       "phone": "+92 315 6172835",
     "type": "Corporate",        "channel": "Call",     "neighborhood": "Nazimabad",
     "status": "Active", "lastVisitDays": 12,
     "_avg": 33_000, "_std": 8_000, "_vpw": 1.2},
]

_SUPPLIERS_META: list[dict[str, Any]] = [
    {"id": "sup-grain",   "name": "Al-Madina Grain Traders",
     "contactPerson": "Hassan Ali",   "phone": "+92 300 1112233",
     "category": "Grains & Pulses",  "address": "Shop 8, Lyari Grain Market, Karachi",
     "status": "Active", "notes": "Bulk rice, wheat flour and pulses. Delivers weekly.",
     "_avg": 52_000, "_std": 12_000, "_opm": 5},
    {"id": "sup-spice",   "name": "Karachi Spice Co.",
     "contactPerson": "Imran Sheikh", "phone": "+92 301 2223344",
     "category": "Spices",           "address": "Plot 14, Jodia Bazaar, Karachi",
     "status": "Active", "notes": "Whole and ground spices, sourced from Sindh.",
     "_avg": 19_000, "_std": 5_000,  "_opm": 2},
    {"id": "sup-dairy",   "name": "Sindh Dairy Suppliers",
     "contactPerson": "Bilal Qureshi", "phone": "+92 302 3334455",
     "category": "Dairy & Beverages", "address": "Warehouse 3, SITE Area, Karachi",
     "status": "Active", "notes": "Milk, cream and packaged beverages — cold chain delivery.",
     "_avg": 34_000, "_std": 8_000,  "_opm": 8},
    {"id": "sup-general", "name": "City Wholesale Mart",
     "contactPerson": "Faisal Rana",  "phone": "+92 303 4445566",
     "category": "General Goods",    "address": "Warehouse 11, Korangi Industrial Area, Karachi",
     "status": "Active", "notes": "Detergents, toiletries and packaged snacks.",
     "_avg": 27_000, "_std": 7_000,  "_opm": 4},
    {"id": "sup-snacks",  "name": "Metro Snacks & Confectionery",
     "contactPerson": "Waqar Hussain", "phone": "+92 304 5556677",
     "category": "Snacks & Confectionery", "address": "Shop 22, Bahadurabad Market, Karachi",
     "status": "Active", "notes": "Chips, chocolates and soft drinks — twice-weekly delivery.",
     "_avg": 16_000, "_std": 4_000,  "_opm": 6},
]


# ── Seasonality helpers ───────────────────────────────────────────────────────
def _seasonal(month: int, year: int) -> float:
    """Pakistani retail seasonality pattern."""
    ramazan = {2024: 3, 2025: 3, 2026: 2}       # Ramazan month by year
    if month == ramazan.get(year, -1):
        return 1.55
    if month in (3, 4):   return 1.35             # Post-Ramazan Eid
    if month in (6, 7, 8): return 1.20            # Summer peak
    if month in (10, 11): return 1.40             # Eid al-Adha / festive
    if month == 12:        return 0.80             # Year-end dip
    if month == 1:         return 0.75             # January slump
    return 1.0


def _dow(weekday: int) -> float:
    """Pakistan weekend: Friday half-day, Saturday off."""
    if weekday == 4: return 0.55   # Friday
    if weekday == 5: return 0.40   # Saturday
    if weekday == 6: return 1.15   # Sunday rebound
    if weekday == 0: return 1.10   # Monday
    return 1.0


def _growth(days: int) -> float:
    """Gentle +20 % business growth over 2 years."""
    return 1.0 + 0.20 * (days / 730)


# ── Deterministic 2-year data generation ─────────────────────────────────────
def _generate() -> tuple[list[dict], list[dict], int, int]:
    rng = random.Random(42)
    _start = datetime(2024, 6, 1)
    _end   = datetime(2026, 6, 28)

    inv_list:  list[dict] = []
    pinv_list: list[dict] = []
    inv_num  = 1000
    pinv_num = 2000

    cur = _start
    day = 0
    while cur <= _end:
        sm = _seasonal(cur.month, cur.year)
        dm = _dow(cur.weekday())
        gm = _growth(day)
        date_str = cur.strftime("%Y-%m-%d")

        # ── Customer sales ──────────────────────────────────────────────────
        for cm in _CUSTOMERS_META:
            prob = (cm["_vpw"] / 7) * sm * dm
            if rng.random() < prob:
                raw = rng.gauss(cm["_avg"], cm["_std"]) * sm * gm
                amt = int(max(1_000, round(raw / 100) * 100))
                inv_num += 1
                inv_list.append({
                    "id": f"INV-{inv_num}",
                    "customerId":   cm["id"],
                    "customerName": cm["name"],
                    "date": date_str,
                    "amount": amt,
                    "status": "Paid",
                })

        # ── Supplier purchases (no deliveries on Fri/Sat) ───────────────────
        if cur.weekday() not in (4, 5):
            for sm_sup in _SUPPLIERS_META:
                prob = (sm_sup["_opm"] / 26) * sm * gm
                if rng.random() < prob:
                    raw = rng.gauss(sm_sup["_avg"], sm_sup["_std"]) * sm * gm
                    amt = int(max(5_000, round(raw / 500) * 500))
                    pinv_num += 1
                    pinv_list.append({
                        "id": f"PINV-{pinv_num}",
                        "supplierId":   sm_sup["id"],
                        "supplierName": sm_sup["name"],
                        "date": date_str,
                        "amount": amt,
                        "status": "Paid",
                    })

        cur += timedelta(days=1)
        day += 1

    return inv_list, pinv_list, inv_num, pinv_num


# ── Module-level data (generated once at import) ──────────────────────────────
_hist_invoices, _hist_purchases, _last_inv, _last_pinv = _generate()

# Strip private meta fields from customer/supplier public records.
customers: list[dict[str, Any]] = [
    {k: v for k, v in c.items() if not k.startswith("_")}
    for c in _CUSTOMERS_META
]

# Extra customers that exist in the frontend AppContext but have less activity.
customers += [
    {"id": "cust-gen-6",  "name": "Ayesha Siddiqui", "phone": "+92 316 7407402",
     "type": "Household",   "channel": "SMS",      "neighborhood": "PECHS Block 6",
     "status": "Active", "lastVisitDays": 15},
    {"id": "cust-gen-7",  "name": "Imran Farooq",    "phone": "+92 317 8641969",
     "type": "Retailer",    "channel": "WhatsApp", "neighborhood": "Korangi",
     "status": "Active", "lastVisitDays": 18},
    {"id": "cust-gen-8",  "name": "Zoya Malik",      "phone": "+92 318 9876536",
     "type": "Wholesaler",  "channel": "Call",     "neighborhood": "Malir Cantt",
     "status": "Active", "lastVisitDays": 21},
    {"id": "cust-gen-9",  "name": "Kamran Akhtar",   "phone": "+92 319 1111110",
     "type": "Hotel / Restaurant", "channel": "SMS", "neighborhood": "North Nazimabad",
     "status": "Active", "lastVisitDays": 2},
    {"id": "cust-gen-10", "name": "Hina Raza",       "phone": "+92 320 1234567",
     "type": "Corporate",   "channel": "WhatsApp", "neighborhood": "Gulistan-e-Johar",
     "status": "Active", "lastVisitDays": 5},
]

invoices: list[dict[str, Any]] = list(_hist_invoices)

suppliers: list[dict[str, Any]] = [
    {k: v for k, v in s.items() if not k.startswith("_")}
    for s in _SUPPLIERS_META
]

supplier_purchases: list[dict[str, Any]] = list(_hist_purchases)

# Inventory stub — sync_inventory() replaces this with live data from the frontend.
inventory: list[dict[str, Any]] = []

# Sequence counters: start well above historical IDs so new records never clash.
_seq = {"inv": _last_inv + 1000, "cust": 200}


def _next(kind: str, prefix: str) -> str:
    with _lock:
        _seq[kind] += 1
        return f"{prefix}{_seq[kind]}"


def next_invoice_id() -> str:
    return _next("inv", "INV-")


def next_customer_id() -> str:
    return _next("cust", "cust-")


# ── Live sync from frontend AppContext (source of truth) ──────────────────────
def sync_customers(rows: list[dict[str, Any]]) -> None:
    """Replace the roster with the live list the frontend sent."""
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
            "status": r.get("status", "Active"),
            "lastVisitDays": r.get("lastVisitDays", 0),
        }
        for r in rows
        if r.get("id") and r.get("name")
    ]
    with _lock:
        customers[:] = mapped


def sync_supplier_invoices(rows: list[dict[str, Any]]) -> None:
    """Merge live frontend supplier invoices with the historical seed data.

    Strategy: keep the historical seed rows that don't appear in the live list
    (so charts have 2 years of history), then append the live rows on top.
    Live rows are identified by IDs starting with 'PINV-' with numbers above
    the seed range (> 2590). This preserves rich historical context while
    showing any purchases the user has recorded in the current session.
    """
    if not rows:
        return
    live = [
        {
            "id": r["id"],
            "supplierId":   r.get("supplierId", ""),
            "supplierName": r.get("supplierName", ""),
            "date": r.get("date", ""),
            "amount": float(r.get("amount", 0)),
            "status": r.get("status", "Paid"),
        }
        for r in rows
        if r.get("id") and r.get("date")
    ]
    live_ids = {r["id"] for r in live}
    # Keep historical seed rows not overridden by live data.
    seed_rows = [r for r in _hist_purchases if r["id"] not in live_ids]
    with _lock:
        supplier_purchases[:] = seed_rows + live


def sync_inventory(rows: list[dict[str, Any]]) -> None:
    """Replace the inventory stub with the live data the frontend sent."""
    if not rows:
        return
    with _lock:
        inventory[:] = list(rows)


# ── Customer lookup helpers ───────────────────────────────────────────────────
def find_customer(query: str) -> Optional[dict[str, Any]]:
    """Resolve a customer by id, exact name, or fuzzy substring."""
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


def _parse(date_str: str) -> datetime:
    try:
        return datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return datetime(2000, 1, 1)
