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
