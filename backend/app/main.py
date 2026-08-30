from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers
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
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(application)
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
