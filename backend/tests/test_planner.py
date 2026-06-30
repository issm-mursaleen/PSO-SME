"""Backend planner — shared corpus parity + behavioural checks.

Asserts the backend spec interpreter (_plan_from_spec) against the SAME golden
corpus the frontend asserts against (frontend/src/lib/alara/__tests__/planner.spec.ts).
FE == golden  ∧  BE == golden  ⟹  FE == BE — the planners cannot drift.
"""
import json
from pathlib import Path

import pytest

from app.llm import _plan_from_spec
from app.intents_generated import INTENT_SPEC_HASH

_CORPUS = json.loads(
    (Path(__file__).resolve().parents[2] / "shared" / "alara-utterances.json").read_text(encoding="utf-8")
)


def _normalize(message: str) -> dict:
    r = _plan_from_spec(message)
    return {
        "tools": [c.name for c in r.tool_calls],
        "args": [c.args for c in r.tool_calls],
        "final_text": r.final_text,
    }


@pytest.mark.parametrize(
    "case",
    _CORPUS["cases"],
    ids=[c["utterance"] for c in _CORPUS["cases"]],
)
def test_corpus_parity(case):
    assert _normalize(case["utterance"]) == case["expect"]


def test_today_vs_lifetime():
    r = _plan_from_spec("aaj ki total sales kitni hain")
    assert r.tool_calls[0].name == "query_data"
    assert r.tool_calls[0].args["template"] == "sales_today"


def test_revenue_vs_invoice_count():
    inv = _plan_from_spec("top 5 customers by number of invoices")
    assert inv.tool_calls[0].args["ranking_metric"] == "invoice_count"
    rev = _plan_from_spec("top 3 customers")
    assert rev.tool_calls[0].args["ranking_metric"] == "revenue"


def test_multi_tool_order():
    r = _plan_from_spec("pichle 3 hafton ki sales trend aur top 3 customers dikhao")
    assert [c.args["kind"] for c in r.tool_calls] == ["sales_trend", "top_customers"]


def test_simple_lookup_is_single_call():
    r = _plan_from_spec("Sindh Dairy kitne din se nahi aaya")
    assert len(r.tool_calls) == 1
    assert r.tool_calls[0].name == "customer_visit"


def test_spec_hash_exposed():
    assert _plan_from_spec("hello").intent_spec_hash == INTENT_SPEC_HASH
