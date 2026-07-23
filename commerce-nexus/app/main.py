import asyncio
from contextlib import asynccontextmanager
import logging
from pathlib import Path
import time
import uuid

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError

from app.api.deps import DbSession
from app.api.router import api_router
from app.config import settings
from app.exceptions import AppError
from app.logging_config import configure_logging


configure_logging(settings.log_level)
logger = logging.getLogger("app.requests")

STATIC_DIR = Path(__file__).parent / "frontend" / "static"


@asynccontextmanager
async def lifespan(application: FastAPI):
    try:
        from app.database import SessionLocal
        from app.models import Tenant
        from app.seed import main as seed_db
        from sqlalchemy import select
        with SessionLocal() as db:
            if not db.scalar(select(Tenant)):
                logger.info("Auto-seeding demo tenants into database...")
                seed_db()
    except Exception as e:
        logger.warning(f"Auto-seed check warning: {e}")

    dispatcher_task = None
    stop_dispatcher = asyncio.Event()
    if settings.prismatic_webhook_url and settings.prismatic_api_key:
        from app.events.dispatcher import dispatch_pending_events

        async def run_dispatcher() -> None:
            while not stop_dispatcher.is_set():
                try:
                    await asyncio.to_thread(dispatch_pending_events)
                except Exception:
                    logger.exception("prismatic_dispatcher_failed")
                try:
                    await asyncio.wait_for(
                        stop_dispatcher.wait(),
                        timeout=settings.prismatic_dispatch_interval_seconds,
                    )
                except TimeoutError:
                    pass

        dispatcher_task = asyncio.create_task(run_dispatcher())
        logger.info("prismatic_dispatcher_started")

    try:
        yield
    finally:
        if dispatcher_task:
            stop_dispatcher.set()
            await dispatcher_task


def create_app() -> FastAPI:
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description=(
            "Veridata Commerce Nexus is a multi-tenant B2B order and integration hub "
            "showcasing embedded Prismatic connectivity with Odoo."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=settings.cors_origin_list != ["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    if STATIC_DIR.exists():
        application.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @application.middleware("http")
    async def request_logging(request: Request, call_next):
        request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "request_failed",
                extra={"request_id": request_id, "method": request.method, "path": request.url.path},
            )
            raise
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers["X-Request-ID"] = request_id
        logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

    @application.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message, "details": exc.details}},
        )

    @application.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "The request contains invalid data",
                    "details": jsonable_encoder(exc.errors()),
                }
            },
        )

    @application.exception_handler(IntegrityError)
    async def integrity_error_handler(_: Request, exc: IntegrityError):
        return JSONResponse(
            status_code=409,
            content={
                "error": {
                    "code": "conflict",
                    "message": "The operation conflicts with an existing record",
                    "details": None,
                }
            },
        )

    @application.get("/health", tags=["system"])
    def health() -> dict[str, str | None]:
        return {
            "status": "ok",
            "prismatic_organization_id": settings.prismatic_organization_id,
        }

    @application.post("/seed", tags=["system"])
    def seed_data(db: DbSession) -> dict[str, str]:
        from app.seed import TENANT_SEEDS, seed_tenant
        created = 0
        for tenant_number, (name, odoo_id, api_key) in enumerate(TENANT_SEEDS, start=1):
            created += seed_tenant(db, name, odoo_id, api_key, tenant_number)
        db.commit()
        return {"status": "ok", "message": f"Demo data seeded ({created} tenant(s) created)"}

    @application.get("/", include_in_schema=False)
    def index():
        if STATIC_DIR.exists():
            return FileResponse(STATIC_DIR / "index.html")
        return {"message": f"Welcome to {settings.app_name}"}

    application.include_router(api_router)
    return application


app = create_app()
