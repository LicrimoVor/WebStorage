import {formatFixedDecimal, normalizeDecimal} from '@/shared/lib';
import type {CanvasGraph} from './excalidraw';
import {participatingNodes} from './participatingNodes';

export function recipeComposition(graph: CanvasGraph, target: string) {
  const ids = participatingNodes(graph, [target]);
  const nodes = graph.nodes.filter((node) => ids.has(node.id));
  const edges = graph.edges.filter((edge) => ids.has(edge.target));
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  const incoming = new Map<string, typeof edges>();
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) {
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  }
  const pending = nodes.filter((node) => degree.get(node.id) === 0).map((node) => node.id);
  const ordered: string[] = [];
  while (pending.length) {
    const id = pending.pop()!;
    ordered.push(id);
    for (const next of outgoing.get(id) ?? []) {
      degree.set(next, degree.get(next)! - 1);
      if (degree.get(next) === 0) pending.push(next);
    }
  }
  const scale = 1_000_000n;
  const demand = new Map<string, bigint>([[target, scale]]);
  let error: string | undefined;
  if (ordered.length !== nodes.length) error = 'В рецепте есть цикл. Исправьте связи для расчёта состава.';
  else for (const id of ordered.reverse()) {
    for (const edge of incoming.get(id) ?? []) {
      const source = normalizeDecimal(String(edge.quantity ?? ''));
      if (!/^\d+(?:\.\d+)?$/.test(source)) {
        error = 'Для расчёта состава задайте положительные количества связей.';
        break;
      }
      const value = BigInt(formatFixedDecimal(source, 6).replace('.', ''));
      if (value <= 0n) {
        error = 'Для расчёта состава задайте положительные количества связей.';
        break;
      }
      demand.set(edge.source, (demand.get(edge.source) ?? 0n) + ((demand.get(id) ?? 0n) * value + scale / 2n) / scale);
    }
    if (error) break;
  }
  const quantities = new Map([...demand].map(([id, value]) => [id, `${value / scale}.${(value % scale).toString().padStart(6, '0')}`]));
  return {ids, nodes: nodes.filter((node) => node.id !== target && node.type !== 'comment'), quantities, error};
}
