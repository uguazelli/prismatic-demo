# AGENTS.md — Prismatic Commerce Nexus

## Project structure

This is a **multi-project monorepo** (not a managed workspace). Two independent sub-projects:

| Directory | Purpose | Language | Entrypoint |
|-----------|---------|----------|------------|
| `commerce-nexus/` | Multi-tenant B2B commerce hub (FastAPI backend) | Python 3.12 | `app/main.py` |
| `Nexus_Odoo-code-native-integration/` | Prismatic code-native integration (Odoo sync) | TypeScript 5.8 | `src/index.ts` |
| `odoo/` | Odoo ERP instance (Docker-only infra) | — | `docker-compose.yml` |

Root `docker-compose.yml` includes both sub-project compose files and the shared Docker network `veridata.network` (must exist before first run — auto-created by compose).

## Existing reference files

- **`PRISMATIC_SETUP_GUIDE.md`** — 329-line cookbook: credentials, CLI workflow, embedded SDK setup, double-creation loop prevention, execution log fetching. Read this before making integration changes.
- **`.agents/skills/`** (symlinked to `.claude/skills/`) — 5 skill directories with 90+ files covering integration, component, embedded, API, and docs patterns. Load skills with `skill` tool as needed.

## Commands

### TypeScript integration (`Nexus_Odoo-code-native-integration/`)

```bash
npm run build       # webpack production bundle
npm run import      # build + import draft to Prismatic
npm run publish     # import + publish (reads .spectral/prism.json)
npm test            # jest (ts-jest)
npm run lint        # eslint --ext .ts .
npm run lint-fix    # eslint --fix --quiet --ext .ts .
npm run format      # prettier . --write
```

### Python backend (`commerce-nexus/`)

```bash
uv sync --frozen              # install deps
uv run pytest                 # run all tests
uv run alembic upgrade head   # run DB migrations
uv run python -m app.seed     # seed demo data (idempotent)
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Docker variants:
```bash
docker compose run --rm demo-saas-api uv run pytest
docker compose exec demo-saas-api uv run alembic upgrade head
docker compose exec demo-saas-api uv run python -m app.seed
```

## Architecture rules (do not violate)

1. **Double-creation loop prevention**: Prismatic calls `POST /webhooks/odoo` (not `PUT /customers/{id}`) to update Nexus records from Odoo. This endpoint updates `external_id` and `sync_status` **without** emitting a new `customer.updated` event. If you create new endpoints that receive callbacks from Prismatic, they must follow the same pattern — update the record without emitting events to avoid recursive sync loops.

2. **Idempotency-Key is required**: All `POST` endpoints for customer, product, and order creation require an `Idempotency-Key` header. Repeated requests with the same key return the original `201` + body. Scoped per `(tenant_id, endpoint, idempotency_key)` — see `commerce-nexus/app/services/idempotency.py`.

3. **Event outbox**: Mutations emit `IntegrationEvent` records transactionally via `emit_event()` in `app/events/publisher.py`. A background `asyncio` task dispatches them to Prismatic with exponential backoff (5 retries). For production with multiple replicas, run the dispatcher in a single worker or add DB-level row claiming.

4. **Delta cursor via instanceState**: The `odooToNexusSync` scheduled flow persists `lastPollTime` in `instanceState`. If any partner sync fails, the entire batch errors and the cursor does NOT advance (intentional). `singletonExecutions: true` prevents overlapping runs.

## Testing quirks

- **Python tests** use SQLite in-memory (`sqlite+pysqlite:///:memory:`) not PostgreSQL — raw SQL dialect differences (JSON columns, datetime precision) can slip through.
- `prismatic_webhook_url` and `prismatic_api_key` are set to `None` in tests to prevent accidental outbound dispatch.
- **TypeScript tests** only cover the `odooToNexusSync` flow, not the `contact` flow or `odooSync.ts` services.

## Other gotchas

- **Private npm registry**: `@component-manifests/*` packages come from `https://app.prismatic.io/packages/npm` — configured in `.npmrc`.
- **One-way conversion**: Integration was converted from low-code (`metadata.json: {convertedFromLowCode: true}`). Cannot convert back.
- **Embedded signing key** can be: direct string, base64 env var, or PEM file (default `.secrets/prismatic-embedded-private-key.pem`).
- **Structured logging**: All logs are JSON with `request_id`, `method`, `path`, `status_code`, `duration_ms`, `tenant_id` attached via `extra=` dict on logger calls.
- **API error envelope**: All errors return `{"error": {"code": "snake_case", "message": "...", "details": ...}}`.
- **CORS**: When `CORS_ORIGINS=*`, `allow_credentials=False`.
- **CI**: `.github/workflows/deploy.yml` deploys to VPS via SSH on push to `main` — no lint, test, or typecheck step runs.