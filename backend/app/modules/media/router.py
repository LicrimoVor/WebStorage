from fastapi import APIRouter, Request, status

from app.core.errors import ProblemDetail
from app.modules.media import service
from app.modules.media.schemas import ImageUploadRead, ImageUploadRequest

router = APIRouter(
    prefix="/media",
    tags=["media"],
    responses={422: {"model": ProblemDetail}},
)


@router.post(
    "/images",
    response_model=ImageUploadRead,
    status_code=status.HTTP_201_CREATED,
    operation_id="uploadImage",
)
async def upload_image(payload: ImageUploadRequest, request: Request) -> ImageUploadRead:
    return await service.upload(payload, base_url=str(request.base_url))
