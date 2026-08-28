from pydantic import BaseModel, Field


class ImageUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: str = Field(min_length=1, max_length=100)
    content_base64: str = Field(min_length=1, max_length=7_100_000)


class ImageUploadRead(BaseModel):
    url: str
    content_type: str
    size: int
