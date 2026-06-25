"""ALARA SME backend — a lean shared API for the deterministic workflows and the
OpenAI-powered chat. Inspired by the c360 chat idea, without the over-engineering.

Run:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, llm, store, workflows
from .schemas import (
    AddCustomerIn,
    ChatIn,
    ChatOut,
    CreateInvoiceIn,
    QueryIn,
    RecordPaymentIn,
    RecordSaleIn,
    WorkflowResult,
)

app = FastAPI(title="ALARA SME API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "llm_enabled": config.LLM_ENABLED, "model": config.OPENAI_MODEL}


# ── Read models for the app UI ──────────────────────────────────────────────
@app.get("/api/customers")
def list_customers() -> list[dict]:
    return store.customers


@app.get("/api/invoices")
def list_invoices() -> list[dict]:
    return store.invoices


@app.get("/api/alerts")
def alerts() -> list[dict]:
    return workflows.compute_alerts()


# ── Shared deterministic workflows (W1-W5) — same code the chat calls ────────
@app.post("/api/workflows/record-sale", response_model=WorkflowResult)
def w_record_sale(inp: RecordSaleIn) -> WorkflowResult:
    return workflows.record_sale(inp)


@app.post("/api/workflows/record-payment", response_model=WorkflowResult)
def w_record_payment(inp: RecordPaymentIn) -> WorkflowResult:
    return workflows.record_payment(inp)


@app.post("/api/workflows/add-customer", response_model=WorkflowResult)
def w_add_customer(inp: AddCustomerIn) -> WorkflowResult:
    return workflows.add_customer(inp)


@app.post("/api/workflows/create-invoice", response_model=WorkflowResult)
def w_create_invoice(inp: CreateInvoiceIn) -> WorkflowResult:
    return workflows.create_invoice(inp)


@app.post("/api/workflows/query", response_model=WorkflowResult)
def w_query(inp: QueryIn) -> WorkflowResult:
    return workflows.query_data(inp)


# ── Conversation layer (W5 NL + drives W1-W4) ───────────────────────────────
@app.post("/api/chat", response_model=ChatOut)
def chat(inp: ChatIn) -> ChatOut:
    return llm.handle_chat(inp)
