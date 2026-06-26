"""Conversation layer.

Maps a natural-language (Roman-Urdu/English) message to ONE deterministic
workflow call, executes it, and returns a c360-style chat response. Uses OpenAI
tool-calling when a key is configured; otherwise a regex fallback recognises the
spec's example phrasings so the demo runs fully offline.

The LLM only *selects the workflow and extracts parameters* — all maths and
state changes happen in workflows.py, never in the model.
"""
from __future__ import annotations

import json
import re
from typing import Any

from . import config, workflows
from .schemas import (
    AddCustomerIn,
    ChatAction,
    ChatIn,
    ChatOut,
    CreateInvoiceIn,
    InvoiceItemIn,
    QueryIn,
    RecordPaymentIn,
    RecordSaleIn,
    WorkflowResult,
)

SYSTEM_PROMPT = (
    "You are Alara, a Roman-Urdu/English assistant for a Pakistani shopkeeper's "
    "sales-and-credit (udhar) ledger. Decide if the user wants to record a sale, "
    "record a payment, add a customer, create an invoice, or query data, and call "
    "the matching tool with extracted parameters. Never do arithmetic yourself — "
    "the tools compute everything. Use the earlier conversation turns for context: "
    "resolve pronouns and follow-ups (e.g. 'usko 500 aur de do', 'same customer', "
    "'aur ek aur') against the customer/amounts mentioned earlier in the chat. "
    "If the user is just chatting or the intent is unclear, reply briefly in "
    "friendly Roman Urdu without calling a tool."
)

TOOLS: list[dict[str, Any]] = [
    {"type": "function", "function": {
        "name": "record_sale",
        "description": "Record a sale for a customer (cash, udhar/credit, or partial).",
        "parameters": {"type": "object", "properties": {
            "customer": {"type": "string"},
            "amount": {"type": "number"},
            "payment_type": {"type": "string", "enum": ["Cash", "Udhar", "Partial"]},
            "amount_paid": {"type": "number"},
        }, "required": ["customer", "amount", "payment_type"]}}},
    {"type": "function", "function": {
        "name": "record_payment",
        "description": "Record an udhar (credit) repayment received from a customer.",
        "parameters": {"type": "object", "properties": {
            "customer": {"type": "string"}, "amount": {"type": "number"},
        }, "required": ["customer", "amount"]}}},
    {"type": "function", "function": {
        "name": "add_customer",
        "description": "Add a new customer.",
        "parameters": {"type": "object", "properties": {
            "name": {"type": "string"}, "area": {"type": "string"},
            "type": {"type": "string"}, "phone": {"type": "string"},
        }, "required": ["name"]}}},
    {"type": "function", "function": {
        "name": "create_invoice",
        "description": "Generate an invoice with line items for a customer.",
        "parameters": {"type": "object", "properties": {
            "customer": {"type": "string"},
            "items": {"type": "array", "items": {"type": "object", "properties": {
                "name": {"type": "string"}, "qty": {"type": "number"}, "rate": {"type": "number"},
            }, "required": ["name", "qty", "rate"]}},
        }, "required": ["customer", "items"]}}},
    {"type": "function", "function": {
        "name": "query_data",
        "description": "Answer a data question using a fixed template.",
        "parameters": {"type": "object", "properties": {
            "template": {"type": "string", "enum": [
                "udhar_recovered", "total_outstanding", "sales_today", "top_defaulters"]},
            "days": {"type": "integer"},
        }, "required": ["template"]}}},
]


def handle_chat(payload: ChatIn) -> ChatOut:
    if config.LLM_ENABLED:
        try:
            return _handle_with_llm(payload)
        except Exception as exc:  # noqa: BLE001 — never 500 the chat; degrade.
            print(f"[chat] LLM error, using fallback: {exc}")
    return _handle_fallback(payload.message)


# ── OpenAI path ─────────────────────────────────────────────────────────────
def _handle_with_llm(payload: ChatIn) -> ChatOut:
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)

    system = SYSTEM_PROMPT
    if payload.context and payload.context.active_customer_id:
        system += f"\nThe user is currently viewing customer id '{payload.context.active_customer_id}'."

    # Replay prior turns so the agent remembers earlier chats and resolves
    # follow-up references (e.g. "usko 500 aur de do" → the last customer).
    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in payload.history[-12:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": payload.message})

    resp = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=0,
    )
    choice = resp.choices[0].message
    if choice.tool_calls:
        call = choice.tool_calls[0]
        args = json.loads(call.function.arguments or "{}")
        return _run(call.function.name, args, source="llm")
    return ChatOut(text=choice.content or "Ji, batayein main kaise madad karun?", source="llm")


# ── Deterministic dispatch (shared by LLM + fallback) ───────────────────────
def _run(name: str, args: dict[str, Any], source: str) -> ChatOut:
    if name == "record_sale":
        return _preview_record_sale(args, source)
    if name == "record_payment":
        res = workflows.record_payment(RecordPaymentIn(**args))
        return _to_chat(res, "confirmation", source,
                        action={"customer": args.get("customer"), "amount": args.get("amount")})
    if name == "add_customer":
        return _preview_add_customer(args, source)
    if name == "create_invoice":
        items = [InvoiceItemIn(**it) for it in args.get("items", [])]
        res = workflows.create_invoice(CreateInvoiceIn(customer=args.get("customer", ""), items=items))
        return _to_chat(res, "invoice", source, action=args)
    if name == "query_data":
        res = workflows.query_data(QueryIn(**args))
        return _to_chat(res, "metric", source)
    return ChatOut(text="Maaf kijiye, samajh nahi aaya.", source=source)


def _preview_record_sale(args: dict[str, Any], source: str) -> ChatOut:
    inp = RecordSaleIn(**args)
    cust = workflows.store.find_customer(inp.customer)
    if cust is None:
        cands = workflows.store.find_customer_candidates(inp.customer)
        if len(cands) > 1:
            names = ", ".join(c["name"] for c in cands)
            return ChatOut(text=f"Kaunsa {inp.customer}? ({names})", source=source)
        return ChatOut(text=f"Customer '{inp.customer}' nahi mila.", source=source)
    if inp.amount <= 0:
        return ChatOut(text="Amount 0 se zyada honi chahiye.", source=source)

    amount_paid = inp.amount if inp.payment_type == "Cash" else (inp.amount_paid or 0)
    unpaid = 0 if inp.payment_type == "Cash" else max(0, inp.amount - amount_paid)
    balance_after = cust["balance"] + unpaid
    text = (
        f"{cust['name']} ka PKR {int(inp.amount):,} sale draft ready hai. "
        f"Confirm karein to {'udhar balance update hoga' if unpaid else 'cash sale record hogi'}."
    )
    return ChatOut(
        text=text,
        card_type="sale_confirmation",
        card_data={
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "amount": inp.amount,
            "payment_type": inp.payment_type,
            "amount_paid": amount_paid,
            "balance_before": cust["balance"],
            "balance_after": balance_after,
            "item_name": "Quick sale",
        },
        action=ChatAction(
            workflow="record_sale",
            params={
                "customer": cust["name"],
                "customer_id": cust["id"],
                "amount": inp.amount,
                "payment_type": inp.payment_type,
                "amount_paid": amount_paid,
            },
        ),
        source=source,
    )


def _preview_add_customer(args: dict[str, Any], source: str) -> ChatOut:
    inp = AddCustomerIn(**args)
    # Fuzzy duplicate check (name substring against the live roster).
    dupes = [c for c in workflows.store.customers if inp.name.strip().lower() in c["name"].lower()]
    dupe = dupes[0]["name"] if dupes else None
    text = (
        f"'{dupe}' pehle se mojood hai. Phir bhi naya customer '{inp.name}' add karna hai? Confirm karein."
        if dupe
        else f"Naya customer '{inp.name}' add karne ke liye tayyar. Confirm karein."
    )
    return ChatOut(
        text=text,
        card_type="customer_confirmation",
        card_data={
            "name": inp.name,
            "area": inp.area or "",
            "type": inp.type,
            "phone": inp.phone or "",
            "balance": 0,
            "duplicate": dupe,
        },
        action=ChatAction(
            workflow="add_customer",
            params={"name": inp.name, "area": inp.area, "type": inp.type, "phone": inp.phone},
        ),
        source=source,
    )


def _to_chat(res: WorkflowResult, card_type: str, source: str,
             action: dict | None = None) -> ChatOut:
    if not res.ok:
        return ChatOut(text=res.confirm, source=source)
    out = ChatOut(text=res.confirm, card_type=card_type, card_data=res.data, source=source)
    if action is not None:
        out.action = ChatAction(workflow=res.workflow, params=action)
    return out


# ── Offline fallback parser (no API key) ────────────────────────────────────
def _parse_amount(s: str) -> float | None:
    m = re.search(r"\d[\d,]*", s)
    return float(m.group(0).replace(",", "")) if m else None


def _handle_fallback(message: str) -> ChatOut:
    text = message.strip()
    low = text.lower()

    # W2 — payment: "... ne 3000 de diye" / "received / mil gaye / payment"
    if re.search(r"(de di\w*|de dy\w*|mil ga\w*|received|payment|recover|wapas|jama)", low):
        amt = _parse_amount(low)
        cust = _name_before(text, r"ne|se|ka|ki")
        if amt and cust:
            return _run("record_payment", {"customer": cust, "amount": amt}, "fallback")

    # W1 — sale: "... ne 1200 ka saman liya udhar/cash"
    if re.search(r"\b(liya|le liya|saman|kharid|bika|sale|becha)\b", low):
        amt = _parse_amount(low)
        cust = _name_before(text, r"ne|ka|ki")
        if amt and cust:
            pt = "Udhar" if "udhar" in low else ("Partial" if "partial" in low else "Cash")
            return _run("record_sale", {"customer": cust, "amount": amt, "payment_type": pt}, "fallback")

    # W3 — add customer: "naya customer — Imran, Street 9, hotel wala"
    m = re.search(r"(naya customer|add customer|new customer)\s*[—\-:]?\s*(.+)", low)
    if m:
        rest = text[m.start(2):]
        parts = [p.strip() for p in re.split(r"[,—\-]", rest) if p.strip()]
        if parts:
            name = parts[0].title()
            area = parts[1] if len(parts) > 1 else None
            ctype = "Hotel / Restaurant" if "hotel" in low else "Household"
            return _run("add_customer", {"name": name, "area": area, "type": ctype}, "fallback")

    # W5 — queries
    if "recover" in low or ("kitna" in low and "udhar" in low):
        days = 7
        if "mahine" in low or "month" in low:
            days = 30
        return _run("query_data", {"template": "udhar_recovered", "days": days}, "fallback")
    if "outstanding" in low or "total udhar" in low or "kitna udhar" in low:
        return _run("query_data", {"template": "total_outstanding"}, "fallback")
    if "aaj" in low and "sale" in low or "sales today" in low:
        return _run("query_data", {"template": "sales_today"}, "fallback")
    if "defaulter" in low or "sab se zyada" in low:
        return _run("query_data", {"template": "top_defaulters"}, "fallback")

    return ChatOut(
        text=("Ji, main sale ya payment likh sakta hun, customer add kar sakta hun, "
              "invoice bana sakta hun, ya udhar/sales ke sawal ka jawab de sakta hun. "
              "Kya karna hai?"),
        source="fallback",
    )


def _name_before(text: str, stop_words: str) -> str | None:
    """Grab the customer name appearing before a stop word (ne/ka/se...)."""
    m = re.match(rf"\s*([A-Za-z][A-Za-z\s]+?)\s+(?:{stop_words})\b", text)
    if m:
        return m.group(1).strip()
    # else: first capitalised token sequence
    m = re.search(r"([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)", text)
    return m.group(1).strip() if m else None
