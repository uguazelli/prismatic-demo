FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.8.19 /uv /uvx /bin/
COPY pyproject.toml uv.lock README.md ./
RUN uv sync --frozen --no-install-project

COPY alembic.ini ./
COPY alembic ./alembic
COPY app ./app
COPY tests ./tests
COPY requests ./requests
RUN uv sync --frozen

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
