FROM python:3.11-slim

WORKDIR /app

# Faster, quieter installs; no .pyc cache bloating the image.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app

EXPOSE 8001

# No --reload here — that's a dev-only flag. For hot-reload during local
# development, run uvicorn directly on the host instead (see backend/README.md).
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
