import type {CanvasGraph} from './excalidraw';
export function participatingNodes(graph: CanvasGraph, targets?: string[]): Set<string> {
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
  const pending = targets ? [...targets] : graph.nodes.filter((node) => node.type === 'output').map((node) => node.id);
  const reached = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...(incoming.get(id) ?? []));
  }
  return reached;
}
