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
    payment_type: Literal["Cash", "Udhar", "Partial"] = "Cash"
    amount_paid: float | None = None


class RecordPaymentIn(BaseModel):
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
    template: Literal[
        "udhar_recovered", "total_outstanding", "sales_today", "top_defaulters"
    ]
    days: int = 7


# ── Chat ────────────────────────────────────────────────────────────────────
class ChatContext(BaseModel):
    active_customer_id: Optional[str] = None
    current_page: Optional[str] = None


class ChatIn(BaseModel):
    message: str
    context: ChatContext = ChatContext()


class ChatAction(BaseModel):
    """A workflow the frontend should apply to its own state, mirroring the
    deterministic execution the backend already performed."""
    workflow: str
    params: dict[str, Any]


class ChatOut(BaseModel):
    text: str
    card_type: Optional[Literal["metric", "confirmation", "invoice"]] = None
    card_data: Optional[dict[str, Any]] = None
    action: Optional[ChatAction] = None
    source: Literal["llm", "fallback"] = "fallback"
