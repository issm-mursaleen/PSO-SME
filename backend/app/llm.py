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

from . import config, usage, workflows
from .schemas import (
    AddCustomerIn,
    ChatAction,
    ChatIn,
    ChatOut,
    CreateInvoiceIn,
    InvoiceItemIn,
    PlanIn,
    PlanOut,
    QueryIn,
    RecordSaleIn,
    ToolCallOut,
    WorkflowResult,
)

# ── Agentic planner ──────────────────────────────────────────────────────────
# The planner is STATELESS: it picks one or more tools from the frontend-supplied
# catalog and extracts their parameters. It never mutates state or does maths —
# the frontend executes the calls against AppContext (the source of truth) and
# enforces guardrails (confirmation cards) there.

PLAN_SYSTEM_PROMPT = (
    "You are Alara, a Roman-Urdu/English co-pilot for a Pakistani shopkeeper's "
    "SALES, OUTREACH and CUSTOMER-MANAGEMENT app. There is NO credit/udhar concept — "
    "every sale is fully paid; never talk about balances, outstanding, credit limits, "
    "defaulters or repayments. You can drive the WHOLE app by calling the provided "
    "tools: record sales, add/update customers, create invoices, receive stock, draft "
    "outreach messages, run bulk outreach, answer sales/customer questions, and navigate "
    "pages. Choose the matching tool(s) and extract their parameters. You may call "
    "MULTIPLE tools when a request needs several steps. Never do arithmetic yourself — the "
    "app computes everything. Resolve pronouns/follow-ups ('usko bhi message bhejo', 'same "
    "customer') against earlier turns. Be PROACTIVE: when the user asks 'ab kya karun / what "
    "next / koi suggestion', or right after you show a customer's details, call "
    "`suggest_next_steps` (with that customer if one is in focus). Infer intent from the "
    "customer's recency (lastVisitDays) and sales history rather than asking. If the user is "
    "just chatting or intent is unclear, DON'T call a tool — reply briefly in friendly Roman Urdu.\n\n"
    "ANSWER THE EXACT QUESTION FIRST. Do NOT dump a generic customer summary when the "
    "user asked for ONE specific field. Resolve conversational references — 'ye', 'uska', "
    "'woh', 'iski', 'last time' — to the customer discussed in earlier turns.\n\n"
    "VISIT / RECENCY QUESTIONS ('X last time kab aaya/aayi', 'kitne din se nahi aaya', "
    "'aakhri baar kab aaya') → call `customer_visit`. It returns the exact visit DATE, the "
    "relative time ('3 din pehle'), the last sale amount, and typical frequency/next-expected "
    "visit when derivable. When you phrase the reply: give the human-readable date AND the "
    "relative time together, e.g. '24 June 2026 ko aaye the — yani 3 din pehle.' NEVER reduce "
    "it to just '3d ago'. Exact clock time is NOT stored — if asked, say e.g. 'Exact time "
    "record nahi hua', do NOT invent a time. Suggest at most ONE relevant next action.\n\n"
    "'Konsi customers pichle N din mein nahi aayin / inactive' → `list_customers` with "
    "filter='inactive' and idle_days=N.\n\n"
    "ANALYTICAL ANSWERS — never answer a business question with a single metric when "
    "richer data is available. 'sab se zyada business / most business / best customer' = "
    "highest LIFETIME SALES value (query_data top_by_sales). For a 360° question about one "
    "customer call `customer_insight`; for shop-wide ranking call `query_data`. These tools "
    "return the figures, context and recommended actions — so do NOT invent numbers yourself.\n\n"
    "INVENTORY & SUPPLIERS — you also know the shop's full inventory and supplier directory. "
    "For one product's stock/reorder/preferred-supplier use `get_product`; for a filtered product "
    "list (low_stock/out_of_stock/all) use `list_inventory`. For one supplier's contact info, "
    "lifetime purchases, products supplied and outstanding drafts use `get_supplier`; for the "
    "supplier directory use `list_suppliers`. These are real, live data — never invent stock "
    "levels or supplier figures.\n\n"
    "VISUALIZATIONS — call `show_visualization` with an explicit `chartType` using this rule: "
    "ONE number → kpi. Comparison between items → bar. Change over time → line. Percentage split "
    "of a whole → donut. Progress toward a target → progress. Only set `chartType` when the user's "
    "wording implies a specific style; otherwise omit it and let the `kind` pick its natural default.\n\n"
    "PROGRESSIVE DISCLOSURE: simple question = short direct answer; analytical question = "
    "answer + supporting metrics; full-profile request = detailed customer card. When you add "
    "a short reply for an analytical question, follow this order: (1) seedha jawab, (2) key "
    "figures, (3) relevant context, (4) anything notable, (5) best next action. If a required "
    "field is missing, clearly kehdein ke woh data mojood nahi — guess mat karein. Reply "
    "concise Roman Urdu matching the user's language."
)


def plan(payload: PlanIn) -> PlanOut:
    if config.LLM_ENABLED and payload.tools:
        try:
            return _plan_with_llm(payload)
        except Exception as exc:  # noqa: BLE001 — never 500 the chat; degrade.
            print(f"[plan] LLM error, using fallback: {exc}")
    return _plan_fallback(payload.message)


def _plan_with_llm(payload: PlanIn) -> PlanOut:
    from openai import OpenAI

    client = OpenAI(api_key=config.OPENAI_API_KEY)

    system = PLAN_SYSTEM_PROMPT
    if payload.context and payload.context.active_customer_id:
        system += f"\nThe user is currently viewing customer id '{payload.context.active_customer_id}'."
    if payload.context and payload.context.customers:
        names = ", ".join(c.name for c in payload.context.customers[:60])
        system += f"\nKnown customers: {names}."

    messages: list[dict[str, Any]] = [{"role": "system", "content": system}]
    for turn in payload.history[-12:]:
        messages.append({"role": turn.role, "content": turn.content})
    messages.append({"role": "user", "content": payload.message})

    tools = [
        {"type": "function", "function": {
            "name": t.name, "description": t.description, "parameters": t.parameters,
        }}
        for t in payload.tools
    ]

    resp = client.chat.completions.create(
        model=config.OPENAI_MODEL,
        messages=messages,
        tools=tools,
        tool_choice="auto",
        temperature=0,
    )
    # Record token usage + cost for the credits counter (never fail the chat).
    try:
        if getattr(resp, "usage", None):
            usage.record(config.OPENAI_MODEL, resp.usage.prompt_tokens, resp.usage.completion_tokens)
    except Exception as exc:  # noqa: BLE001
        print(f"[usage] record failed: {exc}")

    choice = resp.choices[0].message
    if choice.tool_calls:
        calls = [
            ToolCallOut(name=c.function.name, args=json.loads(c.function.arguments or "{}"))
            for c in choice.tool_calls
        ]
        return PlanOut(tool_calls=calls, source="llm")
    return PlanOut(tool_calls=[], final_text=choice.content or "Ji, batayein main kaise madad karun?", source="llm")


# ── Offline fallback planner (no API key) — mirrors the frontend localPlan ────
def _plan_fallback(message: str) -> PlanOut:
    text = message.strip()
    low = text.lower()
    amt = _parse_amount(low)

    def call(name: str, args: dict[str, Any]) -> PlanOut:
        return PlanOut(tool_calls=[ToolCallOut(name=name, args=args)], source="fallback")

    if re.search(r"\b(liya|le liya|saman|kharid|bika|sale|becha)\b", low) and amt:
        cust = _name_before(text, r"ne|ka|ki")
        if cust:
            return call("record_sale", {"customer": cust, "amount": amt})

    m = re.search(r"(naya customer|add customer|new customer)\s*[—\-:]?\s*(.+)", low)
    if m:
        parts = [p.strip() for p in re.split(r"[,—\-]", text[m.start(2):]) if p.strip()]
        if parts:
            ctype = "Hotel / Restaurant" if "hotel" in low else "Household"
            return call("add_customer", {"name": parts[0].title(),
                                         "area": parts[1] if len(parts) > 1 else None, "type": ctype})

    # Invoice: "Tariq Hotel ka bill — 50L doodh @ 200, 10kg cheeni @ 300".
    if re.search(r"\b(bill|invoice)\b", low):
        cm = re.match(r"\s*(.+?)\s+(?:ka|ki)\s+(?:bill|invoice)", text, re.I)
        customer = cm.group(1).strip() if cm else None
        items = [
            {"name": mm.group(2).strip(), "qty": float(mm.group(1)), "rate": float(mm.group(3))}
            for mm in re.finditer(r"(\d+(?:\.\d+)?)\s*[a-zA-Z]*\s+([A-Za-z][A-Za-z\s]*?)\s*@\s*(\d+(?:\.\d+)?)", text)
        ]
        if customer and items:
            return call("create_invoice", {"customer": customer, "items": items})
        if customer:
            return PlanOut(
                tool_calls=[],
                final_text=f'{customer} ka bill banane ke liye har item ka rate bhi likhein, e.g. "50 doodh @ 200".',
                source="fallback",
            )

    # Bulk outreach FIRST so "inactive walon ko message" doesn't grab a name.
    if re.search(r"(sab|bulk|inactive|lapsed|purane|walon)", low) and \
            re.search(r"(reminder|message|bhej|yaad|offer)", low):
        return call("bulk_remind", {"filter": "inactive"})

    # Single reminder/outreach: "X ko message likhdo / reminder / yaad dilao".
    if re.search(r"(message|msg|reminder|remind|yaad dila|likh ?do|likho|draft)", low):
        cust = _name_before(text, r"ko|ka|ki|ke")
        if cust:
            return call("draft_reminder", {"customer": cust})

    # Visit / recency for ONE customer.
    if re.search(r"(kab aa\w*|last time|aakhri baar|kitne din|visit kab|kab aya)", low):
        cust = _name_before(text, r"last|kab|kitne|aakhri|ka|ki|ko|ne")
        if cust:
            return call("customer_visit", {"customer": cust})
    # "Which customers haven't come in the last N days" → inactive list.
    if re.search(r"(nahi aa\w*|nahin aa\w*|inactive|gayab)", low) and \
            re.search(r"(din|days|customer|grahak|kaun|konsi|konse)", low):
        dm = re.search(r"(\d+)\s*(din|day)", low)
        idle = int(dm.group(1)) if dm else 7
        return call("list_customers", {"filter": "inactive", "idle_days": idle})

    # Dynamic visualization cards: charts/graphs with explanations + suggested actions.
    # Keep this in backend fallback because /api/plan can return fallback successfully,
    # which means the frontend's local fallback is not used.
    if re.search(
        r"(visual|visualization|chart|graph|dashboard|breakdown|trend|compare|comparison|split|percentage|share|progress|target|goal)",
        low,
    ):
        if re.search(r"(progress|target|goal)", low) and re.search(r"(inventory|stock|sku|reorder|low)", low):
            return call("show_visualization", {"kind": "reorder_progress"})
        if re.search(r"(split|percentage|share)", low) and re.search(r"(customer|grahak|client|type|segment)", low):
            return call("show_visualization", {"kind": "customer_type_split"})
        if re.search(r"(inventory|stock|sku|reorder|low)", low):
            return call("show_visualization", {"kind": "inventory_risk"})
        if re.search(r"(product|item|sku|mix)", low):
            return call("show_visualization", {"kind": "product_mix"})
        if re.search(r"(customer|grahak|client|top|best)", low):
            return call("show_visualization", {"kind": "top_customers"})
        return call("show_visualization", {"kind": "sales_trend"})

    if re.search(r"(ab kya|next step|what next|kya karu|suggest|suggestion|recommend|advice|mashwara)", low):
        cust = _name_before(text, r"ke|ka|ki|ko|for")
        return call("suggest_next_steps", {"customer": cust} if cust else {})
    if re.search(r"(sab se zyada|sabse zyada|most|best|top).*(business|sale|customer|grahak)|business.*(zyada|most)", low):
        return call("query_data", {"template": "top_by_sales"})
    if re.search(r"(business|performance|profile|kaisa|kaisi|analysis|insight|360)", low):
        cust = _name_before(text, r"ka|ki|ke|kaisa|kaisi")
        if cust:
            return call("customer_insight", {"customer": cust})
    if "sales today" in low or ("aaj" in low and "sale" in low):
        return call("query_data", {"template": "sales_today"})
    if low.startswith("open ") or "kholo" in low or "khol" in low:
        page = re.sub(r"open |kholo|khol", "", low).strip()
        return call("navigate", {"page": page})

    return PlanOut(
        tool_calls=[],
        final_text=("Ji, main sale likh sakti hun, customer add/update kar sakti hun, "
                    "invoice bana sakti hun, outreach message bhej sakti hun, ya koi page khol sakti hun. Kya karna hai?"),
        source="fallback",
    )

SYSTEM_PROMPT = (
    "You are Alara, a Roman-Urdu/English assistant for a Pakistani shopkeeper's "
    "SALES, OUTREACH and CUSTOMER-MANAGEMENT app. There is NO credit/udhar — every "
    "sale is fully paid. Decide if the user wants to record a sale, add a customer, "
    "create an invoice, or query data, and call the matching tool with extracted "
    "parameters. Never do arithmetic yourself — the tools compute everything. Use the "
    "earlier conversation turns for context: resolve pronouns and follow-ups against "
    "the customer mentioned earlier in the chat. If the user is just chatting or the "
    "intent is unclear, reply briefly in friendly Roman Urdu without calling a tool."
)

TOOLS: list[dict[str, Any]] = [
    {"type": "function", "function": {
        "name": "record_sale",
        "description": "Record a completed (paid) sale for a customer.",
        "parameters": {"type": "object", "properties": {
            "customer": {"type": "string"},
            "amount": {"type": "number"},
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
            "template": {"type": "string", "enum": ["sales_today", "top_by_sales"]},
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

    text = f"{cust['name']} ka PKR {int(inp.amount):,} sale draft ready hai. Confirm karein."
    return ChatOut(
        text=text,
        card_type="sale_confirmation",
        card_data={
            "customer_id": cust["id"],
            "customer_name": cust["name"],
            "amount": inp.amount,
            "payment_type": "Paid",
            "item_name": "Quick sale",
        },
        action=ChatAction(
            workflow="record_sale",
            params={
                "customer": cust["name"],
                "customer_id": cust["id"],
                "amount": inp.amount,
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

    # W1 — sale: "... ne 1200 ka saman liya"
    if re.search(r"\b(liya|le liya|saman|kharid|bika|sale|becha)\b", low):
        amt = _parse_amount(low)
        cust = _name_before(text, r"ne|ka|ki")
        if amt and cust:
            return _run("record_sale", {"customer": cust, "amount": amt}, "fallback")

    # W2 — add customer: "naya customer — Imran, Street 9, hotel wala"
    m = re.search(r"(naya customer|add customer|new customer)\s*[—\-:]?\s*(.+)", low)
    if m:
        rest = text[m.start(2):]
        parts = [p.strip() for p in re.split(r"[,—\-]", rest) if p.strip()]
        if parts:
            name = parts[0].title()
            area = parts[1] if len(parts) > 1 else None
            ctype = "Hotel / Restaurant" if "hotel" in low else "Household"
            return _run("add_customer", {"name": name, "area": area, "type": ctype}, "fallback")

    # W4 — queries
    if ("aaj" in low and "sale" in low) or "sales today" in low:
        return _run("query_data", {"template": "sales_today"}, "fallback")
    if "sab se zyada" in low or "most business" in low or "best customer" in low:
        return _run("query_data", {"template": "top_by_sales"}, "fallback")

    return ChatOut(
        text=("Ji, main sale likh sakta hun, customer add kar sakta hun, "
              "invoice bana sakta hun, ya sales/customer ke sawal ka jawab de sakta hun. "
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
