from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ProblemDetail(BaseModel):
    status: int
    code: str
    detail: str
    fields: list[dict[str, Any]] | None = None


class ApplicationError(Exception):
    status_code = 400
    code = "application_error"

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class NotFoundError(ApplicationError):
    status_code = 404
    code = "not_found"


class ConflictError(ApplicationError):
    status_code = 409
    code = "conflict"


class AuthenticationError(ApplicationError):
    status_code = 401
    code = "authentication_required"


class AuthorizationError(ApplicationError):
    status_code = 403
    code = "forbidden"


class DomainValidationError(ApplicationError):
    status_code = 422
    code = "domain_validation_error"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApplicationError)
    async def handle_application_error(_request: Request, error: ApplicationError) -> JSONResponse:
        problem = ProblemDetail(
            status=error.status_code,
            code=error.code,
            detail=error.detail,
        )
        headers = {"WWW-Authenticate": "Bearer"} if error.status_code == 401 else None
        return JSONResponse(
            status_code=error.status_code,
            content=problem.model_dump(mode="json"),
            headers=headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(
        _request: Request, error: RequestValidationError
    ) -> JSONResponse:
        fields = [
            {
                "location": [str(part) for part in item["loc"]],
                "message": item["msg"],
                "type": item["type"],
            }
            for item in error.errors()
        ]
        problem = ProblemDetail(
            status=422,
            code="validation_error",
            detail="Request validation failed",
            fields=fields,
        )
        return JSONResponse(status_code=422, content=problem.model_dump(mode="json"))
