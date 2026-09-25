FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MEDIA_ROOT=/app/media

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install . \
    && groupadd --gid 10001 webstorage \
    && useradd --uid 10001 --gid webstorage --no-create-home webstorage \
    && mkdir /app/media \
    && chown webstorage:webstorage /app/media
COPY alembic.ini ./
COPY migrations ./migrations
COPY docker-entrypoint.py ./

USER webstorage
EXPOSE 8000
ENTRYPOINT ["python", "/app/docker-entrypoint.py"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
