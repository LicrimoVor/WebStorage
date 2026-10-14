import pytest
from app.core.access import Section, required_sections


@pytest.mark.parametrize(
    ("path", "method", "expected"),
    [
        ("/production-plans", "POST", "planning"),
        ("/manufactured-items/id/production-preview", "POST", "planning"),
        ("/manufactured-items/id/produce", "POST", "planning"),
        ("/materials/id/movements", "POST", "warehouse"),
        ("/technological-processes/id/versions", "POST", "processes"),
        ("/operations", "POST", "operations"),
        ("/operations/import", "POST", "operations"),
        ("/warehouse/import", "POST", "warehouse"),
        ("/operations/id/work-entries", "POST", "personnel"),
        ("/employees/id/payments", "POST", "personnel"),
        ("/repairs", "POST", "repairs"),
        ("/sales", "POST", "sales"),
        ("/finance/entries", "GET", "finance"),
        ("/exports/employees.xlsx", "GET", "personnel"),
    ],
)
def test_write_and_sensitive_read_permissions(path: str, method: str, expected: str) -> None:
    assert Section(expected) in required_sections(f"/api/v1{path}", method)


def test_unknown_and_admin_only_routes_fail_closed() -> None:
    for path in ["/users", "/audit-events", "/unknown", "/exports/unknown.xlsx"]:
        assert required_sections(f"/api/v1{path}", "GET") == set()


@pytest.mark.parametrize("catalog", ["materials", "manufactured-items"])
def test_personnel_can_read_external_cost_catalogs_but_cannot_change_inventory(
    catalog: str,
) -> None:
    assert Section.PERSONNEL in required_sections(f"/api/v1/{catalog}", "GET")
    assert Section.PERSONNEL not in required_sections(f"/api/v1/{catalog}", "POST")
    assert Section.PERSONNEL not in required_sections(f"/api/v1/{catalog}/id/movements", "POST")


def test_external_setup_and_receipt_require_their_own_sections() -> None:
    assert required_sections("/api/v1/external-offers", "POST") == {Section.PERSONNEL}
    assert required_sections("/api/v1/external-providers/id", "PATCH") == {Section.PERSONNEL}
    assert required_sections("/api/v1/external-receipts", "POST") == {Section.WAREHOUSE}
    assert Section.WAREHOUSE in required_sections("/api/v1/external-offers", "GET")
