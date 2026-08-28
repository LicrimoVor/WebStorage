import type {
  ProcessEdgeInput,
  ProcessGraphInput,
  ProcessNode,
} from '@/entities/TechnologicalProcess';

export interface CanvasGraph extends ProcessGraphInput {
  nodes: ProcessNode[];
  edges: ProcessEdgeInput[];
}

export interface ExcalidrawDocument {
  type: 'excalidraw';
  version: 2;
  source: string;
  elements: Array<Record<string, unknown>>;
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
}

const nodeColors: Record<ProcessNode['type'], string> = {
  material: '#ffbe5c',
  manufactured_item: '#a8c7fa',
  operation: '#c5a3ff',
  output: '#78d7a7',
};

function baseElement(id: string, x: number, y: number) {
  return {
    id,
    x,
    y,
    angle: 0,
    strokeColor: '#1f2d3d',
    backgroundColor: 'transparent',
    fillStyle: 'solid',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: id.length * 7919,
    version: 1,
    versionNonce: id.length * 1543,
    isDeleted: false,
    boundElements: [],
    updated: Date.now(),
    link: null,
    locked: false,
  };
}

export function normalizeGraph(graph: ProcessGraphInput): CanvasGraph {
  return {
    schemaVersion: 1,
    name: graph.name,
    outputItemId: graph.outputItemId ?? null,
    nodes: (graph.nodes ?? []).map((node) => ({
      ...node,
      referenceId: node.referenceId ?? null,
      label: node.label ?? null,
      position: {x: node.position?.x ?? 0, y: node.position?.y ?? 0},
    })),
    edges: (graph.edges ?? []).map((edge) => ({
      ...edge,
      quantity: edge.quantity ?? null,
    })),
  };
}

export function graphToExcalidraw(graph: CanvasGraph): ExcalidrawDocument {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const rectangles = graph.nodes.map((node) => {
    const x = node.position?.x ?? 0;
    const y = node.position?.y ?? 0;
    return {
      ...baseElement(node.id, x, y),
      type: 'rectangle',
      width: 220,
      height: 112,
      backgroundColor: nodeColors[node.type],
      roundness: {type: 3},
      customData: {webStorage: {kind: 'node', node}},
    };
  });
  const texts = graph.nodes.map((node) => ({
    ...baseElement(`${node.id}-label`, (node.position?.x ?? 0) + 14, (node.position?.y ?? 0) + 18),
    type: 'text',
    width: 190,
    height: 50,
    strokeWidth: 1,
    text: node.label ?? node.type,
    fontSize: 18,
    fontFamily: 1,
    textAlign: 'left',
    verticalAlign: 'middle',
    containerId: node.id,
    originalText: node.label ?? node.type,
    autoResize: true,
    lineHeight: 1.25,
  }));
  const arrows = graph.edges.flatMap((edge) => {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) return [];
    const x = (source.position?.x ?? 0) + 220;
    const y = (source.position?.y ?? 0) + 56;
    const targetX = target.position?.x ?? 0;
    const targetY = (target.position?.y ?? 0) + 56;
    return [
      {
        ...baseElement(edge.id, x, y),
        type: 'arrow',
        width: targetX - x,
        height: targetY - y,
        points: [
          [0, 0],
          [targetX - x, targetY - y],
        ],
        lastCommittedPoint: null,
        startBinding: {elementId: source.id, focus: 0, gap: 0},
        endBinding: {elementId: target.id, focus: 0, gap: 0},
        startArrowhead: null,
        endArrowhead: 'arrow',
        elbowed: false,
        customData: {webStorage: {kind: 'edge', edge}},
      },
    ];
  });
  return {
    type: 'excalidraw',
    version: 2,
    source: 'https://webstorage.local',
    elements: [...rectangles, ...texts, ...arrows],
    appState: {viewBackgroundColor: '#f7f8fa', gridSize: 20},
    files: {},
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function nodeFromCustomData(element: Record<string, unknown>): ProcessNode | null {
  const webStorage = record(record(element.customData)?.webStorage);
  const source = record(webStorage?.node);
  if (webStorage?.kind !== 'node' || !source) return null;
  const type = source.type;
  if (
    type !== 'material' &&
    type !== 'manufactured_item' &&
    type !== 'operation' &&
    type !== 'output'
  ) {
    return null;
  }
  const id = typeof source.id === 'string' ? source.id : element.id;
  if (typeof id !== 'string') return null;
  const sourcePosition = record(source.position);
  return {
    id,
    type,
    referenceId:
      typeof source.referenceId === 'string' ? source.referenceId : null,
    label: typeof source.label === 'string' ? source.label : null,
    position: {
      x:
        typeof element.x === 'number'
          ? element.x
          : typeof sourcePosition?.x === 'number'
            ? sourcePosition.x
            : 0,
      y:
        typeof element.y === 'number'
          ? element.y
          : typeof sourcePosition?.y === 'number'
            ? sourcePosition.y
            : 0,
    },
  };
}

function edgeFromCustomData(
  element: Record<string, unknown>,
): ProcessEdgeInput | null {
  const webStorage = record(record(element.customData)?.webStorage);
  const source = record(webStorage?.edge);
  if (webStorage?.kind !== 'edge' || !source) return null;
  if (
    typeof source.id !== 'string' ||
    typeof source.source !== 'string' ||
    typeof source.target !== 'string'
  ) {
    return null;
  }
  return {
    id: source.id,
    source: source.source,
    target: source.target,
    quantity:
      typeof source.quantity === 'string' || typeof source.quantity === 'number'
        ? source.quantity
        : null,
  };
}

export function excalidrawToGraph(
  payload: unknown,
  base: Pick<CanvasGraph, 'name' | 'outputItemId'>,
): CanvasGraph {
  const document = record(payload);
  if (!Array.isArray(document?.elements)) {
    throw new Error('Файл не содержит массива Excalidraw elements');
  }
  const elements = document.elements.map(record).filter((item) => item !== null);
  const customNodes = elements
    .map(nodeFromCustomData)
    .filter((node) => node !== null);
  const customEdges = elements
    .map(edgeFromCustomData)
    .filter((edge) => edge !== null);
  if (customNodes.length > 0) {
    return normalizeGraph({
      schemaVersion: 1,
      ...base,
      nodes: customNodes,
      edges: customEdges,
    });
  }

  const textByContainer = new Map<string, string>();
  for (const element of elements) {
    if (
      element.type === 'text' &&
      typeof element.containerId === 'string' &&
      typeof element.text === 'string'
    ) {
      textByContainer.set(element.containerId, element.text);
    }
  }
  const nodes: ProcessNode[] = elements.flatMap((element) => {
    if (element.type !== 'rectangle' || typeof element.id !== 'string') return [];
    return [
      {
        id: element.id,
        type: 'material',
        referenceId: null,
        label: textByContainer.get(element.id) ?? 'Импортированный узел',
        position: {
          x: typeof element.x === 'number' ? element.x : 0,
          y: typeof element.y === 'number' ? element.y : 0,
        },
      },
    ];
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: ProcessEdgeInput[] = elements.flatMap((element) => {
    if (element.type !== 'arrow' || typeof element.id !== 'string') return [];
    const start = record(element.startBinding)?.elementId;
    const end = record(element.endBinding)?.elementId;
    if (
      typeof start !== 'string' ||
      typeof end !== 'string' ||
      !nodeIds.has(start) ||
      !nodeIds.has(end)
    ) {
      return [];
    }
    return [{id: element.id, source: start, target: end, quantity: null}];
  });
  return normalizeGraph({schemaVersion: 1, ...base, nodes, edges});
}

