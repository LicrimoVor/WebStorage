from collections import defaultdict

from app.modules.technological_processes.model import (
    TechnologicalProcessEdge,
    TechnologicalProcessNode,
)


def participating_graph(
    nodes: list[TechnologicalProcessNode],
    edges: list[TechnologicalProcessEdge],
    targets: set[str] | None = None,
) -> tuple[list[TechnologicalProcessNode], list[TechnologicalProcessEdge]]:
    """Keep only ancestors of the result (or of a specific production target)."""
    roots = (
        targets
        if targets is not None
        else {n.external_id for n in nodes if n.node_type == "output"}
    )
    if not roots:
        return nodes, edges
    incoming: dict[str, list[str]] = defaultdict(list)
    for edge in edges:
        incoming[edge.target_node_id].append(edge.source_node_id)
    reached: set[str] = set()
    pending = list(roots)
    while pending:
        node_id = pending.pop()
        if node_id in reached:
            continue
        reached.add(node_id)
        pending.extend(incoming[node_id])
    return (
        [node for node in nodes if node.external_id in reached],
        [
            edge
            for edge in edges
            if edge.target_node_id in reached or (targets is None and edge.source_node_id in roots)
        ],
    )
