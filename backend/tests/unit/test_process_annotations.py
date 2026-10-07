import uuid
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest
from app.core.errors import ConflictError
from app.modules.production import service as production_service
from app.modules.production.standalone import Recipe, _recipe_demand
from app.modules.technological_processes import repository, service
from app.modules.technological_processes.model import (
    TechnologicalProcess,
    TechnologicalProcessVersion,
)
from app.modules.technological_processes.schemas import GraphEdge, GraphNode, ProcessGraphDocument
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession


def document() -> ProcessGraphDocument:
    material_id, output_id = uuid.uuid4(), uuid.uuid4()
    return ProcessGraphDocument.model_validate(
        {
            "name": "Assembly",
            "outputItemId": str(output_id),
            "nodes": [
                {"id": "first", "type": "material", "referenceId": str(material_id)},
                {"id": "second", "type": "material", "referenceId": str(material_id)},
                {"id": "result", "type": "output", "referenceId": str(output_id)},
                {"id": "note", "type": "comment", "label": "Inspect before assembly"},
            ],
            "edges": [
                {"id": "a", "source": "first", "target": "result", "quantity": "2"},
                {"id": "b", "source": "second", "target": "result", "quantity": "3"},
            ],
        }
    )


@pytest.mark.parametrize("invalid", ["reference", "connection"])
def test_comments_cannot_reference_catalogs_or_enter_production_graph(invalid: str) -> None:
    data = document().model_dump(by_alias=True, mode="json")
    if invalid == "reference":
        data["nodes"][-1]["referenceId"] = str(uuid.uuid4())
    else:
        data["edges"].append({"id": "note-edge", "source": "note", "target": "result"})
    with pytest.raises(ValidationError, match="comments must not"):
        ProcessGraphDocument.model_validate(data)


@pytest.mark.asyncio
async def test_annotations_do_not_prevent_activation(monkeypatch: pytest.MonkeyPatch) -> None:
    graph = document()
    nodes, edges = service._graph_entities(uuid.uuid4(), graph)
    monkeypatch.setattr(service, "validate_recipes", AsyncMock())
    monkeypatch.setattr(
        repository,
        "get_reference_states",
        AsyncMock(
            return_value=(
                {graph.nodes[0].reference_id: False},
                {graph.output_item_id: False},
                {},
            )
        ),
    )
    monkeypatch.setattr(repository, "active_manufactured_dependencies", AsyncMock(return_value=[]))
    process = TechnologicalProcess(
        id=uuid.uuid4(),
        name=graph.name,
        output_item_id=graph.output_item_id,
    )
    errors = await service._activation_errors(AsyncMock(spec=AsyncSession), process, nodes, edges)
    assert errors == []


@pytest.mark.asyncio
async def test_material_copies_add_up_in_both_production_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    graph = document()
    version = TechnologicalProcessVersion(id=uuid.uuid4(), process_id=uuid.uuid4())
    graph.nodes.extend(
        [GraphNode(id="island-a", type="material"), GraphNode(id="island-b", type="operation")]
    )
    graph.edges.extend(
        [
            GraphEdge(id="island-1", source="island-a", target="island-b"),
            GraphEdge(id="island-2", source="island-b", target="island-a"),
        ]
    )
    nodes, edges = service._graph_entities(version.id, graph)
    monkeypatch.setattr(repository, "get_graph", AsyncMock(return_value=(nodes, edges)))
    session = AsyncMock(spec=AsyncSession)
    recipe = Recipe(version=version, target_node_id="result", source="output")
    demand = await _recipe_demand(session, recipe, Decimal("2"))
    assert demand.materials == {graph.nodes[0].reference_id: Decimal("10.000000")}
    assert not demand.operations
    session.get.return_value = TechnologicalProcess(
        id=version.process_id,
        name=graph.name,
        output_item_id=graph.output_item_id,
    )
    assert graph.output_item_id is not None
    components = await production_service._direct_components(
        session,
        item_id=graph.output_item_id,
        version=version,
        output_quantity=Decimal("2"),
    )
    assert len(components) == 1
    assert components[0].entity_id == graph.nodes[0].reference_id
    assert components[0].quantity == Decimal("10.000000")


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["operation", "manufactured_item"])
async def test_only_materials_can_repeat_catalog_references(kind: str) -> None:
    entity_id = uuid.uuid4()
    graph = ProcessGraphDocument.model_validate(
        {
            "name": "Duplicate",
            "nodes": [
                {"id": "a", "type": kind, "referenceId": str(entity_id)},
                {"id": "b", "type": kind, "referenceId": str(entity_id)},
            ],
        }
    )
    session = AsyncMock(spec=AsyncSession)
    with pytest.raises(ConflictError):
        await service.validate_recipes(session, graph)
    session.execute.assert_not_awaited()
