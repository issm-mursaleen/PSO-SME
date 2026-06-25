# ALARA SME — Backend (FastAPI)

A lean shared API for **Component 2 — Deterministic Workflows** and the
OpenAI-powered chat. Inspired by the c360 chat idea, without the
over-engineering. Every business action is a fixed `validate → execute →
confirm` pipeline (no LLM math); both the app UI (REST) and the chat layer call
the **same** workflow functions.

## Layout
```
backend/
  app/
    config.py      env + settings (OpenAI key, model, CORS)
    store.py       in-memory data, seeded to mirror the frontend AppContext
    schemas.py     pydantic request/response models (also the OpenAI tool schemas)
    workflows.py   W1–W6 deterministic workflows
    llm.py         conversation layer — OpenAI tool-calling + offline fallback parser
    main.py        FastAPI app, CORS, routes
  requirements.txt
  .env.example
```

## Workflows
| | Workflow | REST | Chat phrase (example) |
|---|---|---|---|
| W1 | Record sale | `POST /api/workflows/record-sale` | "Nadeem ne 1200 ka saman liya, udhar" |
| W2 | Record payment | `POST /api/workflows/record-payment` | "Sana Bibi ne 3000 de diye" |
| W3 | Add customer | `POST /api/workflows/add-customer` | "naya customer — Imran, Saddar, hotel wala" |
| W4 | Generate invoice | `POST /api/workflows/create-invoice` | "Tariq ka bill — 50 doodh @ 200, 10 cheeni @ 300" |
| W5 | Query data | `POST /api/workflows/query` | "pichle hafte kitna udhar recover hua?" |
| W6 | Alerts & outreach | `GET /api/alerts` | (rules engine; surfaces drafts) |

Chat entry point: `POST /api/chat` → `{ text, card_type, card_data, action, source }`.
`source` is `"llm"` when an OpenAI key is set, else `"fallback"` (offline parser).

## Run
```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # (Windows)
cp .env.example .env        # add OPENAI_API_KEY for the LLM path (optional)
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```
Health check: `GET http://localhost:8000/api/health`.

## Frontend wiring
The Next app reads `NEXT_PUBLIC_API_URL` (see `../.env.local`, default
`http://localhost:8000`). `src/lib/api.ts` POSTs chat messages here; the chat
falls back to a local mock if the backend is unreachable. Balance-affecting chat
actions are mirrored into the frontend `AppContext` so the UI stays in sync.

> Note: the backend keeps its **own** seeded store. It's the source of truth for
> chat/queries/alerts; the app pages still read the client `AppContext`. Migrating
> the pages to read/write the backend is the natural next step.
