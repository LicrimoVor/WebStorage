import io
import threading
import zipfile
from collections.abc import Sequence
from unittest.mock import AsyncMock, MagicMock

import pytest
from app.modules.exports import service
from app.modules.exports.schemas import ExportDataset, ExportFilters
from app.modules.exports.workbook import ExportColumn, ExportSheet, build_workbook
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.parametrize("dataset", list(ExportDataset))
async def test_excel_generation_runs_outside_event_loop(
    dataset: ExportDataset, monkeypatch: pytest.MonkeyPatch,
) -> None:
    event_loop_thread = threading.get_ident()
    worker_threads: list[int] = []

    def build(sheets: Sequence[ExportSheet]) -> bytes:
        worker_threads.append(threading.get_ident())
        return build_workbook(sheets)

    monkeypatch.setattr(service, "build_workbook", build)
    monkeypatch.setattr(service.repository, "rows_for_dataset", AsyncMock(return_value=[]))
    monkeypatch.setattr(service, "procurement_rows", AsyncMock(return_value=[]))
    monkeypatch.setattr(service.analytics_service, "get_dashboard", AsyncMock())
    monkeypatch.setattr(service, "analytics_sheets", lambda _: [
        ExportSheet("Analytics", [ExportColumn("name", "Name")], []),
    ])

    result = await service.create_export(
        MagicMock(spec=AsyncSession), dataset=dataset, filters=ExportFilters(),
    )

    assert len(worker_threads) == 1
    assert worker_threads[0] != event_loop_thread
    assert result.filename.endswith(".xlsx")
    with zipfile.ZipFile(io.BytesIO(result.content)) as workbook:
        assert workbook.testzip() is None
        assert "xl/worksheets/sheet1.xml" in workbook.namelist()
