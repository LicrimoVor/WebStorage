import uuid
from datetime import datetime
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.types import Quantity


class ProcessStatus(StrEnum):
    DRAFT = "draft"
    ACTIVE = "active"
    ARCHIVED = "archived"


class ProcessNodeType(StrEnum):
    MATERIAL = "material"
    MANUFACTURED_ITEM = "manufactured_item"
    OPERATION = "operation"
    OUTPUT = "output"


class ProcessSortField(StrEnum):
    NAME = "name"
    UPDATED_AT = "updated_at"
    CREATED_AT = "created_at"


class GraphPosition(BaseModel):
    x: float = 0
    y: float = 0


class GraphNode(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str = Field(min_length=1, max_length=100)
    type: ProcessNodeType
    reference_id: uuid.UUID | None = Field(default=None, alias="referenceId")
    label: str | None = Field(default=None, max_length=200)
    position: GraphPosition = Field(default_factory=GraphPosition)


class GraphEdge(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    source: str = Field(min_length=1, max_length=100)
    target: str = Field(min_length=1, max_length=100)
    quantity: Quantity | None = None


class ProcessGraphDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    schema_version: Literal[1] = Field(default=1, alias="schemaVersion")
    name: str = Field(min_length=1, max_length=200)
    output_item_id: uuid.UUID | None = Field(default=None, alias="outputItemId")
    nodes: list[GraphNode] = Field(default_factory=list, max_length=1000)
    edges: list[GraphEdge] = Field(default_factory=list, max_length=5000)

    @model_validator(mode="after")
    def unique_external_ids(self) -> "ProcessGraphDocument":
        node_ids = [node.id for node in self.nodes]
        if len(node_ids) != len(set(node_ids)):
            raise ValueError("node ids must be unique")
        edge_ids = [edge.id for edge in self.edges]
        if len(edge_ids) != len(set(edge_ids)):
            raise ValueError("edge ids must be unique")
        return self


class ProcessCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    output_item_id: uuid.UUID


class ProcessUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    output_item_id: uuid.UUID | None = None


class ProcessVersionCreate(BaseModel):
    source_version_id: uuid.UUID | None = None


class ProcessVersionSummary(BaseModel):
    id: uuid.UUID
    version_number: int
    status: ProcessStatus
    schema_version: int
    created_by: str
    activated_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ProcessRead(BaseModel):
    id: uuid.UUID
    name: str
    output_item_id: uuid.UUID | None
    output_item_name: str | None
    archived: bool
    active_version: ProcessVersionSummary | None
    latest_version: ProcessVersionSummary
    created_at: datetime
    updated_at: datetime


class ProcessList(BaseModel):
    items: list[ProcessRead]
    page: int
    page_size: int
    total: int
    pages: int


class ProcessVersionRead(ProcessVersionSummary):
    process_id: uuid.UUID
    graph: ProcessGraphDocument


class ProcessVersionList(BaseModel):
    items: list[ProcessVersionSummary]


class ProcessImportResult(BaseModel):
    process: ProcessRead
    version: ProcessVersionRead
