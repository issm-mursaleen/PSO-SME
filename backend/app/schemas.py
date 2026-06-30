"""Request/response models for the shared workflow + chat API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ── Workflow results ────────────────────────────────────────────────────────
class WorkflowResult(BaseModel):
    """Uniform validate -> execute -> confirm envelope returned by every
    deterministic workflow (W1-W6)."""
    ok: bool
    workflow: str
    confirm: str                      # human-readable confirmation / answer
    data: dict[str, Any] = {}         # structured payload (record, totals, ...)
    error: Optional[str] = None       # validation failure reason
    needs: Optional[dict[str, Any]] = None  # disambiguation prompt (e.g. candidates)


# ── Workflow inputs (also used as OpenAI tool schemas) ──────────────────────
class RecordSaleIn(BaseModel):
    customer: str
    amount: float


class AddCustomerIn(BaseModel):
    name: str
    area: str | None = None
    type: str = "Household"
    phone: str | None = None


class InvoiceItemIn(BaseModel):
    name: str
    qty: float
    rate: float


class CreateInvoiceIn(BaseModel):
    customer: str
    items: list[InvoiceItemIn]


class QueryIn(BaseModel):
    template: Literal["sales_today", "top_by_sales"]
    days: int = 7


class VisualizationIn(BaseModel):
    kind: str = "sales_trend"
    chartType: str | None = None
    period_value: int | None = None
    period_unit: Literal["days", "weeks", "months", "years"] | None = None
    date_from: str | None = None
    date_to: str | None = None
    group_by: Literal["day", "week", "month", "year", "auto"] = "auto"
    # Named period presets: "this_week", "last_week", "this_month", "last_month",
    # "this_year", "year_to_date". Takes precedence over period_value/period_unit.
    preset: str | None = None
    # Top-N for ranking-style kinds (e.g. top_customers). "top 3 customers" → 3.
    limit: int = Field(default=5, ge=1, le=20)
    # top_customers only: rank over all-time invoices ("lifetime", default when no date
    # range given) or just the resolved date range ("selected_period", when one is given).
    scope: Literal["lifetime", "selected_period"] = "lifetime"
    # top_customers only: rank by total revenue (default) or by invoice count.
    ranking_metric: Literal["revenue", "invoice_count"] = "revenue"


# ── Chat ────────────────────────────────────────────────────────────────────
class CustomerCtx(BaseModel):
    """A customer row sent by the frontend so the backend resolves names against
    the live roster (the AppContext is the source of truth)."""
    id: str
    name: str
    phone: str = ""
    type: str = "Household"
    channel: str = "WhatsApp"
    neighborhood: str = ""
    status: str = "Active"
    lastVisitDays: int = 0


class SupplierCtx(BaseModel):
    """A supplier row sent by the frontend so the planner can resolve supplier
    names against the live AppContext roster. The backend still never computes
    supplier totals; frontend tools do that from AppContext."""
    id: str
    name: str
    category: str = ""
    status: str = "Active"


class SupplierInvoiceCtx(BaseModel):
    """A supplier invoice row sent by the frontend so the backend can build
    accurate supplier purchase trend visualizations."""
    id: str
    supplierId: str = ""
    supplierName: str = ""
    date: str = ""
    amount: float = 0.0
    status: str = "Paid"


class ChatContext(BaseModel):
    active_customer_id: Optional[str] = None
    current_page: Optional[str] = None
    customers: list[CustomerCtx] = []
    suppliers: list[SupplierCtx] = []
    supplier_invoices: list[SupplierInvoiceCtx] = []


class ChatHistoryMessage(BaseModel):
    """A prior conversation turn, so the agent remembers earlier chats."""
    role: Literal["user", "assistant"]
    content: str


class ChatIn(BaseModel):
    message: str
    context: ChatContext = ChatContext()
    history: list[ChatHistoryMessage] = []


class ChatAction(BaseModel):
    """A workflow the frontend should apply to its own state, mirroring the
    deterministic execution the backend already performed."""
    workflow: str
    params: dict[str, Any]


class ChatOut(BaseModel):
    text: str
    card_type: Optional[
        Literal["metric", "confirmation", "invoice", "sale_confirmation", "customer_confirmation", "visualization"]
    ] = None
    card_data: Optional[dict[str, Any]] = None
    action: Optional[ChatAction] = None
    source: Literal["llm", "fallback"] = "fallback"


# ── Agentic planner (stateless) ──────────────────────────────────────────────
class ToolSchemaIn(BaseModel):
    """A tool the frontend exposes. The frontend owns the registry and sends the
    catalog with every request, so the backend has no hardcoded tool list."""
    name: str
    description: str
    parameters: dict[str, Any]


class ToolCallOut(BaseModel):
    name: str
    args: dict[str, Any] = {}


class PlanIn(BaseModel):
    message: str
    tools: list[ToolSchemaIn] = []
    context: ChatContext = ChatContext()
    history: list[ChatHistoryMessage] = []


class PlanOut(BaseModel):
    """The planner only selects tools + extracts params; it never mutates state
    or does arithmetic. The frontend executes the calls against its own store."""
    tool_calls: list[ToolCallOut] = []
    final_text: Optional[str] = None
    source: Literal["llm", "fallback"] = "fallback"
    # Hash of the shared intent spec this planner was built from — lets callers
    # verify the frontend and backend were generated from identical rules.
    intent_spec_hash: Optional[str] = None
