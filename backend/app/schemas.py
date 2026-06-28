"""Request/response models for the shared workflow + chat API."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel


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


class ChatContext(BaseModel):
    active_customer_id: Optional[str] = None
    current_page: Optional[str] = None
    customers: list[CustomerCtx] = []


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
        Literal["metric", "confirmation", "invoice", "sale_confirmation", "customer_confirmation"]
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
