# PSO SME — Customer 360

A sales, outreach and customer-management platform with an agentic chat copilot (Alara).

## Layout

- `frontend/` — Next.js app (UI, AppContext state, Alara chat tools). See `frontend/README.md`.
- `backend/` — FastAPI service (deterministic workflows, OpenAI tool-calling planner). See `backend/README.md`.

## Quick start

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend (separate terminal)
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```
