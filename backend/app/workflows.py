"""Component 2 — deterministic workflows.

Every business action is a fixed validate -> execute -> confirm pipeline with
no model in the loop (no LLM math). Both the REST endpoints (app UI) and the
chat layer call these same functions, so behaviour is identical regardless of
entry point.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from . import store
from .schemas import (
    AddCustomerIn,
    CreateInvoiceIn,
    QueryIn,
    RecordSaleIn,
    VisualizationIn,
    WorkflowResult,
)

_PKT = ZoneInfo("Asia/Karachi")


def _pkr(n: float) -> str:
    return f"PKR {int(round(n)):,}"


def current_date() -> date:
    """Current date in Pakistan Standard Time (UTC+5). Avoids off-by-one errors
    when the server runs in UTC and a request arrives near midnight PST."""
    return datetime.now(_PKT).date()


# ── W1 — Record a Sale ──────────────────────────────────────────────────────
def record_sale(inp: RecordSaleIn) -> WorkflowResult:
    cust = store.find_customer(inp.customer)
    if cust is None:
        cands = store.find_customer_candidates(inp.customer)
        if len(cands) > 1:
            return WorkflowResult(
                ok=False, workflow="record_sale",
                confirm=f"Kaunsa {inp.customer}? ({', '.join(c['name'] for c in cands)})",
                error="ambiguous_customer",
                needs={"candidates": [{"id": c["id"], "name": c["name"]} for c in cands]},
            )
        return WorkflowResult(ok=False, workflow="record_sale",
                              confirm=f"Customer '{inp.customer}' nahi mila.",
                              error="customer_not_found")
    if inp.amount <= 0:
        return WorkflowResult(ok=False, workflow="record_sale",
                              confirm="Amount 0 se zyada honi chahiye.", error="invalid_amount")

    inv_id = store.next_invoice_id()
    store.invoices.append({
        "id": inv_id, "customerId": cust["id"], "customerName": cust["name"],
        "date": current_date().isoformat(),
        "amount": inp.amount, "status": "Paid",
    })
    cust["lastVisitDays"] = 0

    msg = f"{cust['name']} ka {_pkr(inp.amount)} sale likh diya."
    return WorkflowResult(ok=True, workflow="record_sale", confirm=msg,
                          data={"invoice_id": inv_id, "customer_id": cust["id"]})


# ── W2 — Add / Update Customer ──────────────────────────────────────────────
def add_customer(inp: AddCustomerIn) -> WorkflowResult:
    dupes = [
        c for c in store.customers
        if inp.name.lower() in c["name"].lower()
        and (not inp.area or (c.get("neighborhood", "").lower().startswith(inp.area.lower()[:4])))
    ]
    if dupes:
        return WorkflowResult(
            ok=False, workflow="add_customer",
            confirm=f"'{dupes[0]['name']}' pehle se mojood hai ({dupes[0]['neighborhood']}). Phir bhi add karein?",
            error="possible_duplicate",
            needs={"duplicate": {"id": dupes[0]["id"], "name": dupes[0]["name"]}},
        )
    cid = store.next_customer_id()
    cust = {
        "id": cid, "name": inp.name, "phone": inp.phone or "",
        "type": inp.type, "channel": "WhatsApp", "neighborhood": inp.area or "",
        "status": "Active", "lastVisitDays": 0,
    }
    store.customers.append(cust)
    return WorkflowResult(ok=True, workflow="add_customer",
                          confirm=f"{inp.name} add ho gaya.",
                          data={"customer_id": cid})


# ── W3 — Generate Invoice ───────────────────────────────────────────────────
def create_invoice(inp: CreateInvoiceIn) -> WorkflowResult:
    cust = store.find_customer(inp.customer)
    if cust is None:
        return WorkflowResult(ok=False, workflow="create_invoice",
                              confirm=f"Customer '{inp.customer}' nahi mila.",
                              error="customer_not_found")
    if not inp.items:
        return WorkflowResult(ok=False, workflow="create_invoice",
                              confirm="Invoice mein kam az kam ek item hona chahiye.",
                              error="no_items")
    for it in inp.items:
        if it.qty <= 0 or it.rate < 0:
            return WorkflowResult(ok=False, workflow="create_invoice",
                                  confirm=f"'{it.name}' ki qty/rate ghalat hai.",
                                  error="invalid_item")

    # Deterministic totals — computed here, never by the model.
    line_items = [
        {"name": it.name, "qty": it.qty, "rate": it.rate, "total": round(it.qty * it.rate, 2)}
        for it in inp.items
    ]
    total = round(sum(li["total"] for li in line_items), 2)
    inv_id = store.next_invoice_id()
    store.invoices.append({
        "id": inv_id, "customerId": cust["id"], "customerName": cust["name"],
        "date": current_date().isoformat(),
        "amount": total, "status": "Paid",
    })
    cust["lastVisitDays"] = 0
    phone = "".join(ch for ch in cust["phone"] if ch.isdigit())
    text = f"Salam {cust['name']}, aap ka bill {_pkr(total)} ({inv_id}) - PSO SME. Shukriya."
    wa_link = f"https://wa.me/{phone}?text={text.replace(' ', '%20')}" if phone else None
    return WorkflowResult(ok=True, workflow="create_invoice",
                          confirm=f"Bill ban gaya — {_pkr(total)}. WhatsApp pe bhejein?",
                          data={"invoice_id": inv_id, "customer_id": cust["id"],
                                "customer_name": cust["name"], "items": line_items,
                                "total": total, "whatsapp_link": wa_link})


# ── W4 — Query Data (parameterised templates, no free-form SQL) ──────────────
def _lifetime(cust_id: str) -> float:
    return sum(i["amount"] for i in store.invoices if i["customerId"] == cust_id)


def query_data(inp: QueryIn) -> WorkflowResult:
    if inp.template == "sales_today":
        today = current_date().isoformat()
        rows = [i for i in store.invoices if i["date"] == today]
        total = sum(i["amount"] for i in rows)
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"Aaj ki sales {_pkr(total)} ({len(rows)} transactions).",
                              data={"total": total, "count": len(rows)})
    if inp.template == "top_by_sales":
        ranked = sorted(store.customers, key=lambda c: _lifetime(c["id"]), reverse=True)
        ranked = [c for c in ranked if _lifetime(c["id"]) > 0][:3]
        names = ", ".join(f"{c['name']} ({_pkr(_lifetime(c['id']))})" for c in ranked) or "koi nahi"
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"Sab se zyada business: {names}.",
                              data={"top": [{"id": c["id"], "name": c["name"], "lifetime": _lifetime(c["id"])} for c in ranked]})
    return WorkflowResult(ok=False, workflow="query_data",
                          confirm="Yeh query samajh nahi aayi.", error="unknown_template")


# ── Date helpers ──────────────────────────────────────────────────────────────
def _subtract_months(day: date, months: int) -> date:
    month_index = day.month - 1 - months
    year = day.year + month_index // 12
    month = month_index % 12 + 1
    next_month = date(year + (1 if month == 12 else 0), 1 if month == 12 else month + 1, 1)
    month_end = (next_month - timedelta(days=1)).day
    return date(year, month, min(day.day, month_end))


def _parse_iso_date(s: str) -> date:
    """Parse YYYY-MM-DD. Raises ValueError with a user-friendly message on failure."""
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        raise ValueError(f"Date '{s}' YYYY-MM-DD format mein honi chahiye.")


def resolve_date_range(
    period_value: int | None = None,
    period_unit: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    preset: str | None = None,
) -> tuple[date, date]:
    """Compute (start, end) from either a preset, explicit ISO dates, or a
    relative period.  Raises ValueError for invalid inputs or reversed ranges."""
    today = current_date()

    # ── Preset resolution ────────────────────────────────────────────────────
    if preset:
        if preset == "this_week":
            start = today - timedelta(days=today.weekday())
            return start, today
        if preset == "last_week":
            week_start = today - timedelta(days=today.weekday())
            end = week_start - timedelta(days=1)
            start = end - timedelta(days=6)
            return start, end
        if preset == "this_month":
            return today.replace(day=1), today
        if preset == "last_month":
            first_this = today.replace(day=1)
            end = first_this - timedelta(days=1)
            return end.replace(day=1), end
        if preset in ("this_year", "year_to_date"):
            return today.replace(month=1, day=1), today
        # Unknown preset — fall through to relative/explicit.

    # ── Explicit date range ──────────────────────────────────────────────────
    end = _parse_iso_date(date_to) if date_to else today
    if date_from:
        start = _parse_iso_date(date_from)
        if start > end:
            raise ValueError("Start date, end date ke baad nahi ho sakti.")
        return start, end

    # ── Relative period ──────────────────────────────────────────────────────
    value = period_value or 30
    unit = period_unit or "days"
    if value <= 0:
        raise ValueError("Period 0 se zyada hona chahiye.")

    if unit == "days":
        start = end - timedelta(days=value - 1)
    elif unit == "weeks":
        start = end - timedelta(weeks=value) + timedelta(days=1)
    elif unit == "months":
        start = _subtract_months(end, value)
    elif unit == "years":
        start = _subtract_months(end, value * 12)
    else:
        raise ValueError(f"Unsupported period unit: {unit}")

    if start > end:
        raise ValueError("Start date, end date ke baad nahi ho sakti.")

    return start, end


# ── Single source-of-truth for grouping ──────────────────────────────────────
def resolve_group_by(start: date, end: date, requested: str) -> str:
    """Auto-select the best grouping granularity unless the user explicitly
    requested one ('day', 'week', 'month', 'year').  'auto' triggers the rule."""
    if requested and requested != "auto":
        return requested
    total_days = (end - start).days + 1
    if total_days <= 31:
        return "day"
    if total_days <= 120:
        return "week"
    if total_days <= 730:
        return "month"
    return "year"


# ── Period-key + next-period helpers (used for zero-filling) ─────────────────
def _period_key(day: date, group_by: str) -> str:
    if group_by == "week":
        return (day - timedelta(days=day.weekday())).isoformat()
    if group_by == "month":
        return day.strftime("%Y-%m")
    if group_by == "year":
        return day.strftime("%Y")
    return day.isoformat()


def _next_period(day: date, group_by: str) -> date:
    if group_by == "week":
        return day + timedelta(weeks=1)
    if group_by == "month":
        if day.month == 12:
            return date(day.year + 1, 1, 1)
        return date(day.year, day.month + 1, 1)
    if group_by == "year":
        return date(day.year + 1, 1, 1)
    return day + timedelta(days=1)


def _fill_periods(
    series: list[dict],
    start: date,
    end: date,
    group_by: str,
    value_key: str,
    count_key: str,
) -> list[dict]:
    """Ensure every period between start and end is represented, padding
    missing ones with zeros so the chart never has invisible gaps."""
    existing = {row["period"]: row for row in series}

    # Align cursor to the beginning of the first period.
    if group_by == "week":
        cursor = start - timedelta(days=start.weekday())
    elif group_by == "month":
        cursor = start.replace(day=1)
    elif group_by == "year":
        cursor = start.replace(month=1, day=1)
    else:
        cursor = start

    output: list[dict] = []
    while cursor <= end:
        key = _period_key(cursor, group_by)
        output.append(
            existing.get(key, {"period": key, value_key: 0.0, count_key: 0})
        )
        cursor = _next_period(cursor, group_by)

    return output


# ── Data filters and series builders ─────────────────────────────────────────
def filter_invoices_by_date(date_from: date, date_to: date) -> list[dict]:
    rows: list[dict] = []
    for invoice in store.invoices:
        try:
            invoice_date = datetime.strptime(invoice["date"], "%Y-%m-%d").date()
        except (KeyError, TypeError, ValueError):
            continue
        if date_from <= invoice_date <= date_to:
            rows.append(invoice)
    return rows


def filter_supplier_purchases_by_date(date_from: date, date_to: date) -> list[dict]:
    """Filter store.supplier_purchases (live-synced from frontend) by date range."""
    rows: list[dict] = []
    for purchase in store.supplier_purchases:
        try:
            purchase_date = datetime.strptime(purchase["date"], "%Y-%m-%d").date()
        except (KeyError, TypeError, ValueError):
            continue
        if date_from <= purchase_date <= date_to:
            rows.append(purchase)
    return rows


def build_sales_series(rows: list[dict], group_by: str) -> list[dict]:
    grouped: dict[str, dict[str, float | int]] = defaultdict(lambda: {"sales": 0.0, "invoices": 0})
    for invoice in rows:
        invoice_date = datetime.strptime(invoice["date"], "%Y-%m-%d").date()
        key = _period_key(invoice_date, group_by)
        grouped[key]["sales"] += float(invoice["amount"])
        grouped[key]["invoices"] += 1
    return [
        {"period": key, "sales": round(float(values["sales"]), 2), "invoices": int(values["invoices"])}
        for key, values in sorted(grouped.items())
    ]


def build_purchase_series(rows: list[dict], group_by: str) -> list[dict]:
    """Aggregate supplier purchases into a time series (parallel to build_sales_series)."""
    grouped: dict[str, dict[str, float | int]] = defaultdict(lambda: {"purchases": 0.0, "invoices": 0})
    for purchase in rows:
        purchase_date = datetime.strptime(purchase["date"], "%Y-%m-%d").date()
        key = _period_key(purchase_date, group_by)
        grouped[key]["purchases"] += float(purchase["amount"])
        grouped[key]["invoices"] += 1
    return [
        {"period": key, "purchases": round(float(values["purchases"]), 2), "invoices": int(values["invoices"])}
        for key, values in sorted(grouped.items())
    ]


# ── W5 — Show Visualization (kind-based dispatch) ────────────────────────────
def _viz_sales(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    rows = filter_invoices_by_date(start, end)
    series = build_sales_series(rows, group_by)
    series = _fill_periods(series, start, end, group_by, "sales", "invoices")
    total = sum(float(r["amount"]) for r in rows)
    count = len(rows)
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=(
            f"{start.strftime('%d %b %Y')} se {end.strftime('%d %b %Y')} tak "
            f"{_pkr(total)} sales record hui ({count} invoices)."
        ),
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "area",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": total,
            "record_count": count,
            "series": series,
        },
    )


def _viz_supplier_purchases(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    rows = filter_supplier_purchases_by_date(start, end)
    series = build_purchase_series(rows, group_by)
    series = _fill_periods(series, start, end, group_by, "purchases", "invoices")
    total = sum(float(r["amount"]) for r in rows)
    count = len(rows)
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=(
            f"{start.strftime('%d %b %Y')} se {end.strftime('%d %b %Y')} tak "
            f"{_pkr(total)} supplier purchases ({count} invoices)."
        ),
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "area",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": total,
            "record_count": count,
            "series": series,
        },
    )


def _viz_top_customers(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    """Top customers by sales amount within the requested date range."""
    rows = filter_invoices_by_date(start, end)
    tally: dict[str, dict] = {}
    for inv in rows:
        cid = inv["customerId"]
        if cid not in tally:
            tally[cid] = {"id": cid, "name": inv["customerName"], "total": 0.0, "invoices": 0}
        tally[cid]["total"] += float(inv["amount"])
        tally[cid]["invoices"] += 1
    ranked = sorted(tally.values(), key=lambda x: x["total"], reverse=True)[: inp.limit]
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=f"{start.strftime('%d %b %Y')} se {end.strftime('%d %b %Y')} tak top {len(ranked)} customers.",
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "bar",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": sum(r["total"] for r in ranked),
            "record_count": len(ranked),
            "series": [{"period": r["name"], "sales": round(r["total"], 2), "invoices": r["invoices"]} for r in ranked],
        },
    )


def _viz_product_mix(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    """Product mix: which items appear most in invoices (by count)."""
    rows = filter_invoices_by_date(start, end)
    # Best-effort: invoices in the store don't have line items, so we bucket by customerName as proxy
    # This can be improved when the store carries line-item detail.
    tally: dict[str, int] = defaultdict(int)
    for inv in rows:
        tally[inv.get("customerName", "Unknown")] += 1
    total = sum(tally.values()) or 1
    series = [
        {"period": name, "sales": round(cnt / total * 100, 1), "invoices": cnt}
        for name, cnt in sorted(tally.items(), key=lambda x: x[1], reverse=True)
    ]
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=f"{start.strftime('%d %b %Y')} se {end.strftime('%d %b %Y')} tak product mix ({len(rows)} invoices).",
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "donut",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": len(rows),
            "record_count": len(rows),
            "series": series,
        },
    )


def _viz_customer_type_split(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    """Customer type percentage split (Household / Retailer / Wholesaler …)."""
    tally: dict[str, int] = defaultdict(int)
    for c in store.customers:
        tally[c.get("type", "Other")] += 1
    total = sum(tally.values()) or 1
    series = [
        {"period": ctype, "sales": round(cnt / total * 100, 1), "invoices": cnt}
        for ctype, cnt in sorted(tally.items(), key=lambda x: x[1], reverse=True)
    ]
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=f"Customer type split across {total} customers.",
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "donut",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": total,
            "record_count": total,
            "series": series,
        },
    )


def _viz_inventory_risk(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    """Inventory risk: SKUs at or below reorder level."""
    at_risk = [
        item for item in store.inventory
        if isinstance(item.get("current"), (int, float))
        and isinstance(item.get("reorder"), (int, float))
        and item["current"] <= item["reorder"]
    ]
    series = [
        {
            "period": item.get("product", item.get("sku", "?")),
            "sales": item.get("current", 0),
            "invoices": item.get("reorder", 0),
        }
        for item in sorted(at_risk, key=lambda x: x.get("current", 0))[:20]
    ]
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=f"{len(at_risk)} SKUs reorder level pe ya neeche hain.",
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "bar",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": len(at_risk),
            "record_count": len(at_risk),
            "series": series,
        },
    )


def _viz_reorder_progress(inp: VisualizationIn, start: date, end: date, group_by: str) -> WorkflowResult:
    """Reorder progress: current stock as % of reorder level for each SKU."""
    items = [
        item for item in store.inventory
        if isinstance(item.get("current"), (int, float))
        and isinstance(item.get("reorder"), (int, float))
        and item["reorder"] > 0
    ]
    series = [
        {
            "period": item.get("product", item.get("sku", "?")),
            "sales": round(item["current"] / item["reorder"] * 100, 1),
            "invoices": item.get("current", 0),
        }
        for item in sorted(items, key=lambda x: x["current"] / x["reorder"])[:20]
    ]
    return WorkflowResult(
        ok=True,
        workflow="show_visualization",
        confirm=f"{len(items)} SKUs ki reorder progress.",
        data={
            "kind": inp.kind,
            "chartType": inp.chartType or "progress",
            "date_from": start.isoformat(),
            "date_to": end.isoformat(),
            "group_by": group_by,
            "total": len(items),
            "record_count": len(items),
            "series": series,
        },
    )


_VIZ_HANDLERS = {
    "sales_trend": _viz_sales,
    "supplier_purchase_trend": _viz_supplier_purchases,
    "top_customers": _viz_top_customers,
    "product_mix": _viz_product_mix,
    "customer_type_split": _viz_customer_type_split,
    "inventory_risk": _viz_inventory_risk,
    "reorder_progress": _viz_reorder_progress,
}


def show_visualization(inp: VisualizationIn) -> WorkflowResult:
    handler = _VIZ_HANDLERS.get(inp.kind)
    if handler is None:
        return WorkflowResult(
            ok=False,
            workflow="show_visualization",
            confirm=f"'{inp.kind}' chart type abhi available nahi.",
            error="unsupported_visualization",
        )

    try:
        start, end = resolve_date_range(
            period_value=inp.period_value,
            period_unit=inp.period_unit,
            date_from=inp.date_from,
            date_to=inp.date_to,
            preset=getattr(inp, "preset", None),
        )
    except ValueError as exc:
        return WorkflowResult(
            ok=False,
            workflow="show_visualization",
            confirm=f"Date range ghalat hai: {exc}",
            error="invalid_date_range",
        )

    group_by = resolve_group_by(start, end, inp.group_by)
    return handler(inp, start, end, group_by)


# ── W6 — Automated Alerts & Outreach triggers (rules engine) ─────────────────
def compute_alerts() -> list[dict]:
    """Deterministic rules over current state. Surfaces in app badges/home and
    is also offered proactively in chat, each with a drafted outreach message."""
    alerts: list[dict] = []
    for c in store.customers:
        idle = c["lastVisitDays"]
        if idle >= 14:
            alerts.append(_alert("lapsed", "HIGH", c,
                                 f"{c['name']} {idle} din se nahi aaya",
                                 f"Salam {c['name']}, kaafi arsa ho gaya aap tashreef nahi laaye. Aap ke liye khaas offers hain — zaroor aaiye!"))
        elif idle >= 7:
            alerts.append(_alert("cooling", "MEDIUM", c,
                                 f"{c['name']} {idle} din se nahi aaya",
                                 f"Salam {c['name']}, umeed hai khairiyat se hain. Humare paas aaj kuch khaas offers hain — zaroor visit karein!"))
    return alerts


def _alert(rule: str, urgency: str, c: dict, summary: str, draft: str) -> dict:
    return {
        "rule": rule, "urgency": urgency, "customerId": c["id"],
        "customerName": c["name"], "summary": summary, "draft": draft,
    }
