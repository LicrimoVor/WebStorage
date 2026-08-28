import asyncio
import base64
import binascii
import uuid

from app.core.config import get_settings
from app.core.errors import DomainValidationError
from app.modules.media.schemas import ImageUploadRead, ImageUploadRequest

MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _detected_type(content: bytes) -> tuple[str, str] | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif", ".gif"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


async def upload(payload: ImageUploadRequest, *, base_url: str) -> ImageUploadRead:
    try:
        content = base64.b64decode(payload.content_base64, validate=True)
    except (binascii.Error, ValueError) as error:
        raise DomainValidationError("Image payload is not valid base64") from error
    if not content:
        raise DomainValidationError("Image file is empty")
    if len(content) > MAX_IMAGE_BYTES:
        raise DomainValidationError("Image file exceeds the 5 MB limit")
    detected = _detected_type(content)
    if detected is None:
        raise DomainValidationError("Only PNG, JPEG, GIF and WebP images are supported")
    content_type, suffix = detected
    if payload.content_type.lower() != content_type:
        raise DomainValidationError("Declared image type does not match file contents")

    media_root = get_settings().media_root.resolve()
    await asyncio.to_thread(media_root.mkdir, parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{suffix}"
    destination = (media_root / filename).resolve()
    if destination.parent != media_root:  # pragma: no cover - UUID name is controlled
        raise DomainValidationError("Invalid image destination")
    await asyncio.to_thread(destination.write_bytes, content)
    return ImageUploadRead(
        url=f"{base_url.rstrip('/')}/media/{filename}",
        content_type=content_type,
        size=len(content),
    )
