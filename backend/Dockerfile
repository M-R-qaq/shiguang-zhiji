FROM python:3.10-slim AS base

RUN if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources; \
    elif [ -f /etc/apt/sources.list ]; then \
        sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list; \
    fi \
    && apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple \
    && pip config set global.trusted-host pypi.tuna.tsinghua.edu.cn \
    && pip config set global.timeout 120

COPY requirements.txt .
RUN pip install --no-cache-dir setuptools wheel \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/data /app/chroma_db

EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000
ENV DATABASE_URL=sqlite+aiosqlite:///./data/shiguang.db
ENV CHROMA_PERSIST_DIR=/app/chroma_db

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
