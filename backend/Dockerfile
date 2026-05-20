FROM python:3.10-slim AS base

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/chroma_db

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000
ENV DATABASE_URL=sqlite+aiosqlite:///./data/shiguang.db
ENV CHROMA_PERSIST_DIR=/app/chroma_db

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
