"""OpenAI usage + cost tracking for the Alara chat.

Every real LLM call records its token usage and an estimated USD cost (using the
model's published per-1M-token price). Events are appended to a small JSON file
so the daily/weekly/monthly counters survive restarts. When no API key is
configured the fallback parser runs and nothing is recorded — so the counters
honestly reflect actual paid usage.
"""
from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from pathlib import Path

from . import config

_LOG = Path(__file__).with_name("usage_log.json")
_lock = threading.Lock()

# Approximate USD per 1,000,000 tokens (input / output). Update as prices change.
PRICING: dict[str, dict[str, float]] = {
    "gpt-4o-mini": {"in": 0.15, "out": 0.60},
    "gpt-4o": {"in": 2.50, "out": 10.00},
    "gpt-4.1": {"in": 2.00, "out": 8.00},
    "gpt-4.1-mini": {"in": 0.40, "out": 1.60},
    "gpt-4.1-nano": {"in": 0.10, "out": 0.40},
    "o4-mini": {"in": 1.10, "out": 4.40},
}
_DEFAULT_PRICE = {"in": 0.15, "out": 0.60}

# Static USD->PKR rate used to display costs in PKR. Update as the rate moves.
USD_TO_PKR = 280.0


def _load() -> list[dict]:
    if not _LOG.exists():
        return []
    try:
        data = json.loads(_LOG.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save(events: list[dict]) -> None:
    try:
        _LOG.write_text(json.dumps(events), encoding="utf-8")
    except OSError as exc:  # pragma: no cover
        print(f"[usage] could not persist log: {exc}")


def cost_for(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    price = PRICING.get(model, _DEFAULT_PRICE)
    return round(prompt_tokens / 1e6 * price["in"] + completion_tokens / 1e6 * price["out"], 6)


def record(model: str, prompt_tokens: int, completion_tokens: int) -> dict:
    """Append one usage event and return it."""
    event = {
        "ts": datetime.now().isoformat(timespec="seconds"),
        "model": model,
        "prompt": int(prompt_tokens or 0),
        "completion": int(completion_tokens or 0),
        "cost": cost_for(model, prompt_tokens or 0, completion_tokens or 0),
    }
    with _lock:
        events = _load()
        events.append(event)
        _save(events)
    return event


def _agg(events: list[dict]) -> dict:
    usd_cost = sum(e["cost"] for e in events)
    return {
        "cost": round(usd_cost * USD_TO_PKR, 2),
        "cost_usd": round(usd_cost, 4),
        "tokens": sum(e["prompt"] + e["completion"] for e in events),
        "requests": len(events),
    }


def summary() -> dict:
    """Daily / weekly / monthly / all-time rollups plus a 14-day series."""
    with _lock:
        events = _load()

    def day_of(e: dict):
        return datetime.fromisoformat(e["ts"]).date()

    today = datetime.now().date()
    week_start = today - timedelta(days=today.weekday())  # Monday
    month_start = today.replace(day=1)

    series = []
    for i in range(13, -1, -1):
        d = today - timedelta(days=i)
        day_events = [e for e in events if day_of(e) == d]
        usd_cost = sum(e["cost"] for e in day_events)
        series.append({
            "date": d.isoformat(),
            "cost": round(usd_cost * USD_TO_PKR, 2),
            "cost_usd": round(usd_cost, 4),
            "requests": len(day_events),
        })

    total_usd = sum(e["cost"] for e in events)
    remaining_usd = max(0.0, config.OPENAI_TOTAL_BUDGET - total_usd)
    remaining_pkr = max(0.0, (config.OPENAI_TOTAL_BUDGET - total_usd) * USD_TO_PKR)

    return {
        "today": _agg([e for e in events if day_of(e) == today]),
        "week": _agg([e for e in events if day_of(e) >= week_start]),
        "month": _agg([e for e in events if day_of(e) >= month_start]),
        "total": _agg(events),
        "series": series,
        "model": config.OPENAI_MODEL,
        "currency": "PKR",
        "llm_enabled": config.LLM_ENABLED,
        "total_budget_usd": config.OPENAI_TOTAL_BUDGET,
        "total_budget_pkr": round(config.OPENAI_TOTAL_BUDGET * USD_TO_PKR, 2),
        "remaining_usd": round(remaining_usd, 4),
        "remaining_pkr": round(remaining_pkr, 2),
    }
