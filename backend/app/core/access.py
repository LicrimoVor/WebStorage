from enum import StrEnum
from typing import Annotated

from fastapi import Depends, Request

from app.core.errors import AuthorizationError
from app.core.security import Actor, Role, get_current_actor


class Section(StrEnum):
    PLANNING = "planning"
    PROCESSES = "processes"
    WAREHOUSE = "warehouse"
    OPERATIONS = "operations"
    PERSONNEL = "personnel"
    REPAIRS = "repairs"
    SALES = "sales"
    FINANCE = "finance"


def permissions_for(roles: list[str], permissions: list[str] | None) -> list[Section]:
    if "admin" in roles:
        return list(Section)
    if permissions is not None:
        return [Section(value) for value in permissions]
    legacy = {
        "production": {Section.PLANNING, Section.PROCESSES, Section.OPERATIONS, Section.REPAIRS},
        "warehouse": {Section.WAREHOUSE, Section.REPAIRS},
        "finance": {Section.FINANCE, Section.SALES, Section.PERSONNEL},
        "manager": set(Section),
    }
    return sorted(set().union(*(legacy.get(role, set()) for role in roles)))


def required_sections(
    path: str,
    method: str,
    kind: str | None = None,
    entity_type: str | None = None,
) -> set[Section]:
    """Fail closed. Shared read-only catalogs are needed by forms in other tabs."""
    parts = path.removeprefix("/api/v1/").strip("/").split("/")
    resource = parts[0]
    read = method in {"GET", "HEAD"}
    if read and parts == ["warehouse", "revision"] and entity_type == "material":
        return {Section.WAREHOUSE, Section.REPAIRS}
    if resource == "operations" and "work-entries" in parts:
        return {Section.OPERATIONS, Section.PERSONNEL}
    if resource == "work-entries":
        return {Section.OPERATIONS, Section.PERSONNEL}
    if resource == "business-documents":
        return {Section.REPAIRS} if kind == "repair" else {Section.WAREHOUSE}
    if resource == "exports":
        dataset = parts[-1].removesuffix(".xlsx")
        if dataset == "work_entries":
            return {Section.OPERATIONS, Section.PERSONNEL}
        exports = {
            "procurement": Section.WAREHOUSE,
            "materials": Section.WAREHOUSE,
            "manufactured_items": Section.WAREHOUSE,
            "inventory_movements": Section.WAREHOUSE,
            "operations": Section.OPERATIONS,
            "employees": Section.PERSONNEL,
            "work_entries": Section.PERSONNEL,
            "payroll_accruals": Section.PERSONNEL,
            "employee_payments": Section.PERSONNEL,
            "production_plans": Section.PLANNING,
            "production_records": Section.PLANNING,
            "sales": Section.SALES,
            "finance_entries": Section.FINANCE,
            "analytics": Section.FINANCE,
        }
        return {exports[dataset]} if dataset in exports else set()
    if resource == "manufactured-items" and any(
        part in {"production", "produce", "production-records", "production-preview"}
        for part in parts[1:]
    ):
        return {Section.PLANNING, Section.WAREHOUSE, Section.PROCESSES}
    owners = {
        "production-plans": Section.PLANNING,
        "technological-processes": Section.PROCESSES,
        "materials": Section.WAREHOUSE,
        "manufactured-items": Section.WAREHOUSE,
        "inventory-groups": Section.WAREHOUSE,
        "warehouse": Section.WAREHOUSE,
        "procurement": Section.WAREHOUSE,
        "operations": Section.OPERATIONS,
        "operation-groups": Section.OPERATIONS,
        "employees": Section.PERSONNEL,
        "work-entries": Section.PERSONNEL,
        "employee-payments": Section.PERSONNEL,
        "payroll": Section.PERSONNEL,
        "repairs": Section.REPAIRS,
        "sales": Section.SALES,
        "finance": Section.FINANCE,
        "analytics": Section.FINANCE,
        "funding-sources": Section.FINANCE,
    }
    if resource == "media":
        return {Section.WAREHOUSE, Section.OPERATIONS, Section.PLANNING, Section.REPAIRS}
    if resource == "product-units" and read:
        return {Section.WAREHOUSE, Section.PLANNING, Section.REPAIRS, Section.SALES}
    # Only catalog reads, never movements, payroll, exports or mutations.
    shared = {
        "materials": {Section.PLANNING, Section.PROCESSES, Section.REPAIRS},
        "manufactured-items": {Section.PLANNING, Section.PROCESSES, Section.REPAIRS, Section.SALES},
        "operations": {Section.PLANNING, Section.PROCESSES, Section.PERSONNEL, Section.REPAIRS},
        "operation-groups": {Section.PROCESSES, Section.PERSONNEL, Section.REPAIRS},
        "inventory-groups": {Section.PROCESSES},
        "technological-processes": {Section.PLANNING},
        "production-plans": {Section.PERSONNEL},
        "employees": {
            Section.REPAIRS,
            Section.PLANNING,
            Section.OPERATIONS,
            Section.WAREHOUSE,
            Section.PROCESSES,
        },
        "funding-sources": {Section.WAREHOUSE, Section.PERSONNEL, Section.REPAIRS, Section.SALES},
    }
    required = {owners[resource]} if resource in owners else set()
    if read and len(parts) <= 2:
        required |= shared.get(resource, set())
    return required


async def require_section_access(
    request: Request, actor: Annotated[Actor, Depends(get_current_actor)]
) -> None:
    if Role.ADMIN in actor.roles or request.url.path == "/api/v1/me":
        return
    required = required_sections(
        request.url.path,
        request.method,
        request.query_params.get("kind"),
        request.query_params.get("type"),
    )
    if not actor.permissions.intersection(required):
        raise AuthorizationError("Нет доступа к этому разделу. Обратитесь к администратору.")
