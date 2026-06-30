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
    VisualizationIn,
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
    "richer data is available. For a 360° question about ONE named customer call "
    "`customer_insight`.\n\n"
    "CUSTOMER RANKING — top_customers is the ONLY supported way to rank/list multiple "
    "customers by performance; `query_data`'s template='top_by_sales' is LEGACY and reserved "
    "ONLY for a bare singular question with no ranking/graph/list/report/top-N wording, e.g. "
    "'mera best customer kaun hai?' (a short direct answer, no chart). Any request containing "
    "rank, ranking, ranked, top N, best N, highest, 'sab se zyada', a plural 'customers'/'grahak' "
    "mention, list, compare, dikhao, chart, graph, report or visualization — even phrased as "
    "'customers based on business' or 'customers ranked by sales' — MUST call "
    "`show_visualization(kind='top_customers')`, never `query_data`. If uncertain, prefer "
    "`show_visualization(kind='top_customers')` over the legacy `query_data` card. "
    "Set chartType='bar'. Set limit to the requested top-N (e.g. 'top 3'/'top3'/'best 5' → 3/5; "
    "a bare singular 'best customer' with no number → limit=1; otherwise omit it for the "
    "default of 5). Set ranking_metric='invoice_count' only when the user explicitly asks by "
    "number of invoices/transactions, otherwise ranking_metric='revenue'. Set scope='lifetime' "
    "when no date range is given, or scope='selected_period' when one is. These tools "
    "return the figures, context and recommended actions — so do NOT invent numbers yourself.\n\n"
    "OUTREACH — `draft_reminder`/`bulk_remind` auto-write a message personalized from the "
    "customer's REAL buying pattern (their actual top product(s), a discount sized to how "
    "lapsed they are) — never a generic 'khaas offers hain' line. Leave the `message` field "
    "empty unless the user dictates the exact wording themselves.\n\n"
    "INVOICES — `create_invoice` generates a NEW itemised bill (the card shows a live preview "
    "and, once confirmed, Download + 'View in Invoices' actions). `get_invoice` shows a "
    "PREVIOUSLY generated invoice — by exact ID ('INV-4821 dikhao') or by customer for their "
    "most recent one ('Tariq ka last bill dikhao'). Never use create_invoice to look up an "
    "existing bill, and never use get_invoice to make a new one. For create_invoice, if the user "
    "didn't state an item's per-unit rate, OMIT the rate field entirely — never invent 0 or any "
    "other guessed number. The app fills a known product's usual price automatically, or asks the "
    "user for it.\n\n"
    "INVENTORY & SUPPLIERS — you also know the shop's full inventory and supplier directory. "
    "For one product's stock/reorder/preferred-supplier use `get_product`; for a filtered product "
    "list (low_stock/out_of_stock/all) use `list_inventory`. For one supplier's contact info, "
    "lifetime purchases, products supplied and outstanding drafts use `get_supplier`; for the "
    "supplier directory use `list_suppliers`. These are real, live data — never invent stock "
    "levels or supplier figures.\n\n"
    "SUPPLIER OPERATIONS — for supplier discovery/contact/status use `list_suppliers` or "
    "`get_supplier`. For purchase totals, rankings, supplier-wise contribution, item/date/status "
    "filters, trends or unusual changes use `supplier_purchase_analysis`. For paid, pending, "
    "due-soon, overdue and outstanding balances use `supplier_payables`. For supplier invoice "
    "drafts use `draft_supplier_invoice`: it must show a full preview first and the app will only "
    "create/post after explicit user confirmation. For CSV/Excel/spreadsheet/sheet export requests "
    "(any of those words means the same thing here — the file is a CSV the user can open in Excel) "
    "use `export_supplier_csv`; show record count, selected columns, active filters and a 5-row "
    "preview before export. "
    "Do not invent suppliers, invoices, purchases or totals. Do not expose internal parameter names "
    "like dataset, sort or filter keys to the user; phrase them as plain business wording. "
    "Keep next actions to at most three.\n\n"
    "VISUALIZATIONS — call `show_visualization` for graphs and charts. Always extract the "
    "requested time range. Examples: '6 maheene' or 'last 6 months' means period_value=6 "
    "and period_unit='months'; '3 hafte' means period_value=3 and period_unit='weeks'; "
    "'10 din' means period_value=10 and period_unit='days'. For named periods use the "
    "preset field: 'is mahine/this month' → preset='this_month'; "
    "'pichle mahine/last month' → preset='last_month'; "
    "'is hafte/this week' → preset='this_week'; 'pichle hafte/last week' → preset='last_week'; "
    "'is saal/this year/year to date/ytd' → preset='this_year'. "
    "For explicit dates, provide date_from and date_to in YYYY-MM-DD format. "
    "Do not calculate date boundaries yourself. "
    "ALWAYS use group_by='auto' unless the user EXPLICITLY says daily/weekly/monthly/yearly. "
    "ONE number → kpi. Comparison → bar. Change over time → area or line. "
    "Percentage split → donut. Target progress → progress. "
    "MULTI-INTENT: when the user asks for several distinct analyses in one message "
    "(e.g. 'sales trend, top 3 customers aur inventory risk dikhao'), call `show_visualization` "
    "ONCE PER requested view — do not collapse them into a single generic chart. Preserve the "
    "user's stated order, and reuse the SAME date range across all of them. Never invent or "
    "duplicate a kind that wasn't asked for. Respect explicit top-N phrasing — 'top 3 customers' "
    "or 'top3' or 'best 5' → limit=3/5 on the top_customers call only.\n\n"
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
    if payload.context and payload.context.suppliers:
        names = ", ".join(s.name for s in payload.context.suppliers[:60])
        system += (
            f"\nKnown suppliers from the live app data: {names}. "
            "Use these names only for routing/resolution; never calculate supplier totals in the LLM."
        )

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
        for c in calls:
            _log_tool_call(c.name, c.args)
        return PlanOut(tool_calls=calls, source="llm")
    return PlanOut(tool_calls=[], final_text=choice.content or "Ji, batayein main kaise madad karun?", source="llm")


# TEMP DEBUG LOGGING — verifying the customer-ranking routing fix; remove
# once confirmed query_data(top_by_sales) no longer fires for ranking/top-N
# customer requests.
def _log_tool_call(name: str, args: dict[str, Any]) -> None:
    if name not in ("show_visualization", "query_data"):
        return
    kind = args.get("kind")
    renderer = (
        ("TopCustomersVisualization" if kind == "top_customers" else "VisualizationCard")
        if name == "show_visualization"
        else "MostBusinessCard(legacy)"
    )
    print(
        f"[alara:plan] tool={name} kind={kind} limit={args.get('limit')} "
        f"scope={args.get('scope')} ranking_metric={args.get('ranking_metric')} "
        f"template={args.get('template')} renderer={renderer}"
    )


# ── Offline fallback planner (no API key) — mirrors the frontend localPlan ────
def _parse_named_period(low: str) -> dict[str, Any]:
    """Recognise Urdu + English named period phrases and map them to a preset."""
    if re.search(r"(is|iss|this)\s+(haftay|hafte|week)", low):
        return {"preset": "this_week", "group_by": "auto"}
    if re.search(r"(pichla|pichle|last)\s+(hafta|hafte|week)", low):
        return {"preset": "last_week", "group_by": "auto"}
    if re.search(r"(is|iss|this)\s+(mahine|maheene|month)", low):
        return {"preset": "this_month", "group_by": "auto"}
    if re.search(r"(pichla|pichle|last)\s+(mahina|maheena|mahine|month)", low):
        return {"preset": "last_month", "group_by": "auto"}
    if re.search(r"(is|iss|this)\s+(saal|year)", low):
        return {"preset": "this_year", "group_by": "auto"}
    if re.search(r"(year\s*to\s*date|ytd)", low):
        return {"preset": "year_to_date", "group_by": "auto"}
    if re.search(r"(last|pichle)\s+(quarter|3\s*months?|3\s*maheene)", low):
        return {"period_value": 3, "period_unit": "months", "group_by": "auto"}
    return {}


def _parse_period(low: str) -> dict[str, Any]:
    # Named period presets take priority over numeric parsing.
    named = _parse_named_period(low)
    if named:
        return named

    match = re.search(
        r"(?:pichle|last|past)?\s*(\d+)\s*"
        r"(din|dino|days?|hafte|hafton|weeks?|maheene|mahine|months?|saal|years?)",
        low,
    )
    if not match:
        return {}

    value = int(match.group(1))
    raw_unit = match.group(2).lower()
    if re.search(r"din|day", raw_unit):
        unit = "days"
    elif re.search(r"hafte|hafton|week", raw_unit):
        unit = "weeks"
    elif re.search(r"maheene|mahine|month", raw_unit):
        unit = "months"
    else:
        unit = "years"

    # Always send group_by='auto' — the backend resolves_group_by() is the
    # single source of truth for granularity selection.
    return {"period_value": value, "period_unit": unit, "group_by": "auto"}


# ── Customer-ranking routing (high priority — see PLAN_SYSTEM_PROMPT's
# "CUSTOMER RANKING" section). show_visualization(kind='top_customers') is the
# single source of truth for ranking multiple customers; query_data's
# top_by_sales template is legacy, reserved only for a bare singular question
# with no ranking/graph/list/report/top-N wording. ──────────────────────────
def _parse_top_limit(text: str, default: int = 5) -> int:
    match = re.search(
        r"\b(?:top|best)\s*(\d+)\b|"
        r"\brank(?:ed|ing)?\s+(?:my\s+)?(?:top\s*)?(\d+)\b",
        text,
        re.I,
    )
    if not match:
        return default

    value = next(
        int(group)
        for group in match.groups()
        if group is not None
    )
    return max(1, min(value, 20))


def _is_customer_ranking_request(text: str) -> bool:
    """A plural "customers" mention reaching this point in the cascade (every
    more-specific earlier intent already ruled out) is treated as ranking —
    matches phrasing like "customers based on business" that carries no
    explicit rank/top-N word. A bare SINGULAR "customer" mention only counts
    when paired with an explicit number, a rank word, or an action word
    (chart/list/report/...) — so "mera best customer kaun hai?" stays a plain
    question routed to the legacy query_data tool, while "best customer ka
    chart dikhao" routes to show_visualization with limit=1."""
    has_plural_customer = bool(re.search(r"\b(customers|grahak\w*|clients)\b", text, re.I))
    has_singular_customer = bool(re.search(r"\bcustomer\b", text, re.I)) and not has_plural_customer
    if not (has_plural_customer or has_singular_customer):
        return False

    has_explicit_trigger = bool(
        re.search(
            r"\b(rank|ranking|ranked|highest|sab\s*se\s*zyada|sabse\s*zyada)\b|"
            r"\b(top|best)\s*\d+\b|"
            r"(chart|graph|visual|dikhao|report|\blist\b|compare|comparison)",
            text,
            re.I,
        )
    )
    return True if has_plural_customer else has_explicit_trigger


def _customer_ranking_args(low: str, period_args: dict[str, Any]) -> dict[str, Any]:
    has_plural_customer = bool(re.search(r"\b(customers|grahak\w*|clients)\b", low, re.I))
    return {
        "kind": "top_customers",
        "chartType": "bar",
        "limit": _parse_top_limit(low, default=5 if has_plural_customer else 1),
        "ranking_metric": (
            "invoice_count"
            if re.search(r"(invoice count|transactions?|number of invoices)", low)
            else "revenue"
        ),
        "scope": "selected_period" if period_args else "lifetime",
        **period_args,
    }


def _plan_fallback(message: str) -> PlanOut:
    text = message.strip()
    low = text.lower()
    amt = _parse_amount(low)
    period_args = _parse_period(low)

    def call(name: str, args: dict[str, Any]) -> PlanOut:
        _log_tool_call(name, args)
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
            re.search(r"(reminder|message|bhej|yaad|offer|outreach)", low):
        return call("bulk_remind", {"filter": "inactive"})

    # Single reminder/outreach: "X ko message likhdo / reminder / yaad dilao / outreach karo".
    if re.search(r"(message|msg|reminder|remind|yaad dila|likh ?do|likho|draft|outreach)", low):
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

    # Supplier operations, including phrases that do not literally say "supplier".
    if re.search(r"(supplier|purchase|purchases|payable|outstanding|overdue|payment|receive hui)", low):
        supplier = _name_before(text, r"ki|ka|ke|se|supplier")
        supplier_arg = {"supplier": supplier} if supplier else {}
        if period_args and re.search(r"(purchase|purchases)", low):
            return call(
                "show_visualization",
                {
                    "kind": "supplier_purchase_trend",
                    "chartType": "bar" if re.search(r"(compare|comparison)", low) else "area",
                    **period_args,
                },
            )
        if re.search(r"(csv|excel|xlsx?|spreadsheet|sheet|export|download)", low):
            dataset = "supplier_purchase_items" if re.search(r"(item|line)", low) else \
                "suppliers" if re.search(r"(directory|list|contact)", low) else "supplier_invoices"
            return call("export_supplier_csv", {"dataset": dataset, **supplier_arg})
        if re.search(r"(payable|outstanding|overdue|due|payment|pending)", low):
            status = "overdue" if "overdue" in low else \
                "due_soon" if "due" in low else \
                "paid" if "paid" in low else \
                "pending" if re.search(r"(pending|outstanding)", low) else "all"
            return call("supplier_payables", {"status": status, **supplier_arg})
        if re.search(r"(invoice|bill|draft|generate|banao|banado|receive hui)", low):
            return call("draft_supplier_invoice", supplier_arg)
        if re.search(r"(analysis|trend|rank|compare|contribution|history|purchase|purchases)", low):
            return call("supplier_purchase_analysis", supplier_arg)
        if re.search(r"(list|sab|all|directory|kitne)", low):
            return call("list_suppliers", {})
        if supplier:
            return call("get_supplier", {"supplier": supplier})
        return call("list_suppliers", {})

    # High-priority customer-ranking intent — checked before generic
    # time-period analytics, generic visualization, and query_data.
    if _is_customer_ranking_request(low):
        return call("show_visualization", _customer_ranking_args(low, period_args))

    has_time_period = bool(period_args)
    has_analytics_subject = bool(re.search(r"(sale|sales|revenue|purchase|purchases|customer|inventory|stock)", low))
    if has_time_period and has_analytics_subject:
        return call(
            "show_visualization",
            {
                "kind": "supplier_purchase_trend" if re.search(r"(purchase|purchases)", low) else "sales_trend",
                "chartType": "bar" if re.search(r"(compare|comparison)", low) else "area",
                **period_args,
            },
        )

    # Dynamic visualization cards: charts/graphs with explanations + suggested actions.
    # Keep this in backend fallback because /api/plan can return fallback successfully,
    # which means the frontend's local fallback is not used.
    if re.search(
        r"(visual|visualization|chart|graph|dashboard|breakdown|trend|compare|comparison|split|percentage|share|progress|target|goal)",
        low,
    ):
        if re.search(r"(progress|target|goal)", low) and re.search(r"(inventory|stock|sku|reorder|low)", low):
            return call("show_visualization", {"kind": "reorder_progress", **period_args})
        if re.search(r"(split|percentage|share)", low) and re.search(r"(customer|grahak|client|type|segment)", low):
            return call("show_visualization", {"kind": "customer_type_split", **period_args})
        if re.search(r"(inventory|stock|sku|reorder|low)", low):
            return call("show_visualization", {"kind": "inventory_risk", **period_args})
        if re.search(r"(product|item|sku|mix)", low):
            return call("show_visualization", {"kind": "product_mix", **period_args})
        if re.search(r"(customer|grahak|client|top|best)", low):
            return call("show_visualization", {"kind": "top_customers", **period_args})
        return call(
            "show_visualization",
            {
                "kind": "supplier_purchase_trend" if re.search(r"(purchase|purchases)", low) else "sales_trend",
                "chartType": "area",
                **period_args,
            },
        )

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
    {"type": "function", "function": {
        "name": "show_visualization",
        "description": (
            "Show a sales or supplier-purchase visualization for a requested "
            "relative or explicit date range. Use kind='sales_trend' for customer "
            "sales, 'supplier_purchase_trend' for supplier purchases, "
            "'top_customers' for ANY customer ranking/top-N/list request (preferred over the "
            "legacy query_data tool whenever uncertain), 'product_mix' for item breakdown, "
            "'customer_type_split' for a segment pie, 'inventory_risk' for low-stock "
            "SKUs, 'reorder_progress' for reorder level progress."
        ),
        "parameters": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": [
                "sales_trend", "supplier_purchase_trend", "top_customers",
                "product_mix", "customer_type_split", "inventory_risk", "reorder_progress",
            ]},
            "chartType": {"type": "string", "enum": ["area", "line", "bar", "donut", "progress"]},
            "preset": {"type": "string", "enum": [
                "this_week", "last_week", "this_month", "last_month",
                "this_year", "year_to_date",
            ]},
            "period_value": {"type": "integer", "minimum": 1},
            "period_unit": {"type": "string", "enum": ["days", "weeks", "months", "years"]},
            "date_from": {"type": "string"},
            "date_to": {"type": "string"},
            "group_by": {"type": "string", "enum": ["day", "week", "month", "year", "auto"]},
            "limit": {"type": "integer", "minimum": 1, "maximum": 20, "description": "Top-N for ranking kinds, e.g. \"top 3 customers\" -> 3. Default 5."},
            "scope": {"type": "string", "enum": ["lifetime", "selected_period"], "description": "top_customers only: lifetime (default, no date range given) or selected_period (a date range was given)."},
            "ranking_metric": {"type": "string", "enum": ["revenue", "invoice_count"], "description": "top_customers only: revenue (default) or invoice_count."},
        }, "required": ["kind"]}}},
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
    _log_tool_call(name, args)
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
    if name == "show_visualization":
        res = workflows.show_visualization(VisualizationIn(**args))
        return _to_chat(res, "visualization", source)
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
    period_args = _parse_period(low)

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

    # High-priority customer-ranking intent — must win over the legacy
    # query_data top_by_sales template (see PLAN_SYSTEM_PROMPT's "CUSTOMER
    # RANKING" section / _plan_fallback's equivalent check).
    if _is_customer_ranking_request(low):
        return _run("show_visualization", _customer_ranking_args(low, period_args), "fallback")
    if "sab se zyada" in low or "most business" in low or "best customer" in low:
        return _run("query_data", {"template": "top_by_sales"}, "fallback")

    # Visualization (mirrors _plan_fallback logic for the legacy /chat route).
    has_analytics = bool(re.search(r"(sale|sales|revenue|purchase|purchases|customer|inventory|stock|graph|chart|visual|trend)", low))
    if (period_args or re.search(r"(visual|chart|graph|trend|split|percentage)", low)) and has_analytics:
        kind = "supplier_purchase_trend" if re.search(r"(purchase|purchases)", low) else "sales_trend"
        if re.search(r"(split|percentage|share).*(customer|type|segment)", low):
            kind = "customer_type_split"
        elif re.search(r"(inventory|stock|reorder|low)", low):
            kind = "inventory_risk"
        elif re.search(r"(top|best).*(customer)", low):
            kind = "top_customers"
        return _run("show_visualization", {"kind": kind, **period_args}, "fallback")

    return ChatOut(
        text=("Ji, main sale likh sakti hun, customer add kar sakti hun, "
              "invoice bana sakti hun, graph/chart dikhao sakti hun, ya sales/customer "
              "ke sawal ka jawab de sakti hun. Kya karna hai?"),
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
