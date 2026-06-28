"""Runtime configuration, loaded from environment / .env."""
import os

from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip()
OPENAI_TOTAL_BUDGET: float = float(os.getenv("OPENAI_TOTAL_BUDGET", "10.0").strip())

CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS", "http://localhost:3000,http://localhost:3002,http://127.0.0.1:3000,http://127.0.0.1:3002"
    ).split(",")
    if o.strip()
]

# When no key is configured the chat uses the deterministic fallback parser.
LLM_ENABLED: bool = bool(OPENAI_API_KEY)
