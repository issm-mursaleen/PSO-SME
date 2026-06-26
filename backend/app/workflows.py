"""Component 2 — deterministic workflows.

Every business action is a fixed validate -> execute -> confirm pipeline with
no model in the loop (no LLM math). Both the REST endpoints (app UI) and the
chat layer call these same functions, so behaviour is identical regardless of
entry point.
"""
from __future__ import annotations

from datetime import datetime

from . import store
from .schemas import (
    AddCustomerIn,
    CreateInvoiceIn,
    QueryIn,
    RecordPaymentIn,
    RecordSaleIn,
    WorkflowResult,
)


def _pkr(n: float) -> str:
    return f"PKR {int(round(n)):,}"


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
        "date": datetime(2026, 6, 25).strftime("%Y-%m-%d"),
        "amount": inp.amount, "status": "Paid" if inp.payment_type == "Cash" else "Unpaid",
        "paymentType": inp.payment_type,
    })
    if inp.payment_type == "Udhar":
        cust["balance"] += inp.amount
    elif inp.payment_type == "Partial":
        paid = inp.amount_paid or 0
        cust["balance"] += max(0, inp.amount - paid)
    cust["lastVisitDays"] = 0

    msg = f"{cust['name']} ka {_pkr(inp.amount)} ({inp.payment_type}) likh diya."
    if inp.payment_type != "Cash":
        msg += f" Baqi ab {_pkr(cust['balance'])}."
    return WorkflowResult(ok=True, workflow="record_sale", confirm=msg,
                          data={"invoice_id": inv_id, "customer_id": cust["id"],
                                "balance": cust["balance"]})


# ── W2 — Record Payment (Udhar recovery) ────────────────────────────────────
def record_payment(inp: RecordPaymentIn) -> WorkflowResult:
    cust = store.find_customer(inp.customer)
    if cust is None:
        return WorkflowResult(ok=False, workflow="record_payment",
                              confirm=f"Customer '{inp.customer}' nahi mila.",
                              error="customer_not_found")
    if inp.amount <= 0:
        return WorkflowResult(ok=False, workflow="record_payment",
                              confirm="Amount 0 se zyada honi chahiye.", error="invalid_amount")
    if cust["balance"] <= 0:
        return WorkflowResult(ok=False, workflow="record_payment",
                              confirm=f"{cust['name']} ka koi udhar baqi nahi hai.",
                              error="no_balance")

    warn = ""
    applied = inp.amount
    if inp.amount > cust["balance"]:
        warn = f" (Note: {_pkr(inp.amount)} balance {_pkr(cust['balance'])} se zyada hai.)"

    cust["balance"] = max(0, cust["balance"] - applied)
    store.transactions.append({
        "id": store.next_txn_id(), "customerId": cust["id"], "customerName": cust["name"],
        "type": "Repayment", "amount": applied,
        "date": datetime(2026, 6, 25).strftime("%Y-%m-%d"), "ref": "Cash Receipt",
    })
    cleared = cust["balance"] == 0
    msg = f"{cust['name']} ka {_pkr(applied)} mil gaya. " + (
        "Account clear!" if cleared else f"{_pkr(cust['balance'])} baqi.") + warn
    return WorkflowResult(ok=True, workflow="record_payment", confirm=msg,
                          data={"customer_id": cust["id"], "balance": cust["balance"],
                                "cleared": cleared})


# ── W3 — Add / Update Customer ──────────────────────────────────────────────
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
        "creditLimit": 20000, "balance": 0, "status": "Active",
        "healthScore": 70, "lastVisitDays": 0,
    }
    store.customers.append(cust)
    return WorkflowResult(ok=True, workflow="add_customer",
                          confirm=f"{inp.name} add ho gaya.",
                          data={"customer_id": cid})


# ── W4 — Generate Invoice ───────────────────────────────────────────────────
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
        "date": datetime(2026, 6, 25).strftime("%Y-%m-%d"),
        "amount": total, "status": "Unpaid", "paymentType": "Udhar",
    })
    phone = "".join(ch for ch in cust["phone"] if ch.isdigit())
    text = f"Salam {cust['name']}, aap ka bill {_pkr(total)} ({inv_id}) - PSO SME. Shukriya."
    wa_link = f"https://wa.me/{phone}?text={text.replace(' ', '%20')}" if phone else None
    return WorkflowResult(ok=True, workflow="create_invoice",
                          confirm=f"Bill ban gaya — {_pkr(total)}. WhatsApp pe bhejein?",
                          data={"invoice_id": inv_id, "customer_id": cust["id"],
                                "customer_name": cust["name"], "items": line_items,
                                "total": total, "whatsapp_link": wa_link})


# ── W5 — Query Data (parameterised templates, no free-form SQL) ──────────────
def query_data(inp: QueryIn) -> WorkflowResult:
    if inp.template == "udhar_recovered":
        total, n = store.recovered_since(inp.days)
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"{_pkr(total)} recover hue, {n} customers se (pichle {inp.days} din).",
                              data={"total": total, "customers": n, "days": inp.days})
    if inp.template == "total_outstanding":
        total = sum(c["balance"] for c in store.customers)
        defaulters = sum(1 for c in store.customers if c["balance"] > 0)
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"Total outstanding udhar {_pkr(total)} hai, {defaulters} accounts par.",
                              data={"total": total, "defaulters": defaulters})
    if inp.template == "sales_today":
        rows = [i for i in store.invoices if i["date"] == "2026-06-25"]
        total = sum(i["amount"] for i in rows)
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"Aaj ki sales {_pkr(total)} ({len(rows)} transactions).",
                              data={"total": total, "count": len(rows)})
    if inp.template == "top_defaulters":
        ranked = sorted([c for c in store.customers if c["balance"] > 0],
                        key=lambda c: c["balance"], reverse=True)[:3]
        names = ", ".join(f"{c['name']} ({_pkr(c['balance'])})" for c in ranked) or "koi nahi"
        return WorkflowResult(ok=True, workflow="query_data",
                              confirm=f"Sab se zyada udhar: {names}.",
                              data={"top": [{"id": c["id"], "name": c["name"], "balance": c["balance"]} for c in ranked]})
    return WorkflowResult(ok=False, workflow="query_data",
                          confirm="Yeh query samajh nahi aayi.", error="unknown_template")


# ── W6 — Automated Alerts & Outreach triggers (rules engine) ────────────────
def compute_alerts() -> list[dict]:
    """Deterministic rules over current state. Surfaces in app badges/home and
    is also offered proactively in chat, each with a drafted outreach message."""
    alerts: list[dict] = []
    for c in store.customers:
        bal, idle = c["balance"], c["lastVisitDays"]
        if bal > c["creditLimit"]:
            alerts.append(_alert("threshold_breach", "HIGH", c,
                                 f"{c['name']} ka {_pkr(bal)} — limit {_pkr(c['creditLimit'])}",
                                 f"Salam {c['name']}, aap ka udhar credit limit se barh gaya hai ({_pkr(bal)}). Baraye meherbani jald clear karein."))
        elif bal > 0 and idle >= 7:
            alerts.append(_alert("udhar_overdue", "HIGH", c,
                                 f"{c['name']} ka {_pkr(bal)} — {idle} din",
                                 f"Salam {c['name']}, aap ka {_pkr(bal)} udhar {idle} din se baqi hai. Shukriya."))
        elif bal == 0 and idle >= 7:
            alerts.append(_alert("inactive", "MEDIUM", c,
                                 f"{c['name']} {idle} din se nahi aaya",
                                 f"Salam {c['name']}, kaafi din se mulaqat nahi hui. Aaj kuch khaas offers hain!"))
    return alerts


def _alert(rule: str, urgency: str, c: dict, summary: str, draft: str) -> dict:
    return {
        "rule": rule, "urgency": urgency, "customerId": c["id"],
        "customerName": c["name"], "summary": summary, "draft": draft,
    }
