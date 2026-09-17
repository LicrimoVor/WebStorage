import io
import uuid
import zipfile
from decimal import Decimal
from xml.etree import ElementTree

import pytest
from app.modules.exports.schemas import ExportDataset
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine
from tests.integration.helpers import funding_source

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def worksheet(content: bytes, index: int = 1) -> ElementTree.Element:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        assert archive.testzip() is None
        return ElementTree.fromstring(
            archive.read(f"xl/worksheets/sheet{index}.xml")
        )


def rows(root: ElementTree.Element) -> list[ElementTree.Element]:
    return root.findall(".//x:sheetData/x:row", NS)


def inline_text(cell: ElementTree.Element) -> str:
    return "".join(node.text or "" for node in cell.findall(".//x:t", NS))


@pytest.mark.asyncio
async def test_material_export_contains_all_filtered_rows_and_selected_ids(
    client: AsyncClient, database_engine: AsyncEngine
) -> None:
    material_ids = [uuid.uuid4() for _ in range(120)]
    async with database_engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO materials "
                "(id, name, unit, price, archived, created_at, updated_at) "
                "VALUES (:id, :name, 'kg', :price, false, now(), now())"
            ),
            [
                {"id": material_id, "name": f"Export material {index:03d}", "price": "2.50"}
                for index, material_id in enumerate(material_ids)
            ],
        )

    response = await client.get(
        "/api/v1/exports/materials.xlsx",
        params={"search": "Export material", "sort_by": "name"},
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert "materials_" in response.headers["content-disposition"]
    root = worksheet(response.content)
    exported_rows = rows(root)
    assert len(exported_rows) == 121
    first_data_cells = exported_rows[1].findall("x:c", NS)
    assert inline_text(first_data_cells[0]) == "Export material 000"
    assert first_data_cells[3].get("s") == "5"
    assert first_data_cells[5].get("s") == "4"
    assert first_data_cells[8].get("s") == "3"

    selected = await client.get(
        "/api/v1/exports/materials.xlsx",
        params=[
            ("ids", str(material_ids[3])),
            ("ids", str(material_ids[7])),
        ],
    )
    assert selected.status_code == 200, selected.text
    assert len(rows(worksheet(selected.content))) == 3


@pytest.mark.asyncio
async def test_sales_export_preserves_numeric_cells_and_human_names(
    client: AsyncClient,
) -> None:
    product_response = await client.post(
        "/api/v1/manufactured-items",
        json={
            "name": "Export finished product",
            "is_product": True,
            "unit": "pcs",
            "initial_quantity": "5",
        },
    )
    assert product_response.status_code == 201, product_response.text
    product = product_response.json()
    sale = await client.post(
        "/api/v1/sales",
        headers={"Idempotency-Key": "export-sale"},
        json={
            "funding_source_id": await funding_source(client),
            "product_id": product["id"],
            "quantity": "2.125",
            "unit_price": "12.34",
            "sold_at": "2026-08-20T08:30:00Z",
        },
    )
    assert sale.status_code == 201, sale.text

    response = await client.get(
        "/api/v1/exports/sales.xlsx",
        params={
            "product_id": product["id"],
            "date_from": "2026-08-20T00:00:00Z",
            "date_to": "2026-08-20T23:59:59Z",
        },
    )
    assert response.status_code == 200, response.text
    assert "sales_2026-08-20_2026-08-20.xlsx" in response.headers["content-disposition"]
    root = worksheet(response.content)
    data_cells = rows(root)[1].findall("x:c", NS)
    assert data_cells[0].get("s") == "3"
    assert inline_text(data_cells[1]) == "Export finished product"
    assert product["id"] not in response.content.decode("latin1")
    assert data_cells[2].get("s") == "5"
    assert Decimal(data_cells[2].findtext("x:v", namespaces=NS) or "0") == Decimal("2.125")
    assert data_cells[4].get("s") == "4"
    assert Decimal(data_cells[4].findtext("x:v", namespaces=NS) or "0") == Decimal("12.34")


@pytest.mark.asyncio
async def test_every_required_dataset_produces_a_valid_workbook(
    client: AsyncClient,
) -> None:
    for dataset in ExportDataset:
        response = await client.get(f"/api/v1/exports/{dataset.value}.xlsx")
        assert response.status_code == 200, (dataset, response.text)
        with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
            assert archive.testzip() is None
            assert "xl/workbook.xml" in archive.namelist()
            assert "xl/styles.xml" in archive.namelist()
