from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.modules.audit.middleware import AuditMiddleware
from app.modules.auth.router import router as auth_router
from app.modules.operation_instructions.router import public_router


def create_app() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        description="Inventory, operations and employees API",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )
    application.add_middleware(GZipMiddleware, minimum_size=1000)

    @application.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        origin = request.headers.get("origin")
        if (
            request.method not in {"GET", "HEAD", "OPTIONS"}
            and origin
            and origin not in settings.cors_origins
        ):
            response = JSONResponse(
                status_code=403,
                content={
                    "status": 403,
                    "code": "forbidden_origin",
                    "detail": "The request origin is not allowed",
                    "fields": None,
                },
            )
        else:
            response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["X-Robots-Tag"] = "noindex, nofollow, noarchive"
        if settings.session_cookie_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    application.add_middleware(AuditMiddleware)
    install_error_handlers(application)
    application.include_router(auth_router, prefix="/api/v1")
    application.include_router(api_router, prefix="/api/v1")
    application.include_router(public_router, prefix="/api/v1")
    application.mount(
        "/media",
        StaticFiles(directory=settings.media_root, check_dir=False),
        name="media",
    )

    @application.get("/health/live", tags=["health"], include_in_schema=False)
    async def liveness() -> dict[str, str]:
        return {"status": "ok"}

    return application


app = create_app()
