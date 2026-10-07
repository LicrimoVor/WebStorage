import {participatingNodes} from '../model/participatingNodes';
import {ArrowRotateLeft, ArrowRotateRight, ArrowDownToLine, ArrowUpFromLine, LayoutCells, CircleQuestion, Copy, Pencil, TrashBin} from '@gravity-ui/icons';
import {Select, TextArea, TextInput} from '@/shared/ui/FormControls';
import {CanvasNodeImage} from './CanvasNodeImage';
import {NodeRecipe} from './NodeRecipe';
import {Alert, Button, Card, Dialog, Icon, Label, MobileProvider, RadioGroup, Tab, TabList, Text} from '@gravity-ui/uikit';
import { useMutation } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";

import { useManufacturedItemsQuery } from "@/entities/ManufacturedItem";
import {useInventoryGroupsQuery} from "@/entities/InventoryGroup";
import { useMaterialsQuery } from "@/entities/Material";
import { useOperationsQuery } from "@/entities/Operation";
import { ProduceManufacturedItemButton } from "@/features/ProduceManufacturedItem";
import {
  saveTechnologicalProcessDraft,
  type ProcessEdgeInput,
  type ProcessNode,
  type ProcessVersion,
} from "@/entities/TechnologicalProcess";
import { getErrorMessage } from "@/shared/api";
import { formatDecimal, formatFixedDecimal, isDecimal, normalizeDecimal } from "@/shared/lib";

import {
  excalidrawToGraph,
  graphToExcalidraw,
  normalizeGraph,
  type CanvasGraph,
} from "../model/excalidraw";
import styles from "./ProcessCanvas.module.scss";

const NODE_WIDTH = 260;
const NODE_HEIGHT = 168;

const nodeTypeView: Record<
  ProcessNode["type"],
  { title: string; theme: "warning" | "info" | "utility" | "success" }
> = {
  material: { title: "Материал", theme: "warning" },
  manufactured_item: { title: "Полуфабрикат", theme: "info" },
  operation: { title: "Операция", theme: "utility" },
  output: { title: "Результат", theme: "info" },
  comment: { title: "Комментарий", theme: "success" },
};

const nodeTypeOptions = [
  { value: "material", content: "Материал" },
  { value: "manufactured_item", content: "Полуфабрикат" },
  { value: "operation", content: "Операция" },
  { value: "comment", content: "Комментарий" },
];

interface GraphHistory {
  graph: CanvasGraph;
  canUndo: boolean;
  canRedo: boolean;
  commit: (graph: CanvasGraph) => void;
  undo: () => void;
  redo: () => void;
}

function useGraphHistory(initialGraph: CanvasGraph): GraphHistory {
  const [snapshots, setSnapshots] = useState<CanvasGraph[]>([initialGraph]);
  const [index, setIndex] = useState(0);
  const graph = snapshots[index] ?? initialGraph;
  const commit = (next: CanvasGraph) => {
    if (JSON.stringify(next) === JSON.stringify(graph)) return;
    setSnapshots((current) =>
      [...current.slice(0, index + 1), next].slice(-80),
    );
    setIndex((current) => Math.min(current + 1, 79));
  };
  return {
    graph,
    canUndo: index > 0,
    canRedo: index < snapshots.length - 1,
    commit,
    undo: () => setIndex((current) => Math.max(0, current - 1)),
    redo: () =>
      setIndex((current) => Math.min(snapshots.length - 1, current + 1)),
  };
}

interface NodeDialogState {
  mode: "add" | "edit";
  nodeId?: string;
  type: ProcessNode["type"];
  referenceId: string;
  groupId: string;
  label: string;
}

interface EdgeDialogState {
  edgeId: string;
  quantity: string;
}

interface ConnectionDrag {
  source: string;
  x: number;
  y: number;
  target?: string;
}

interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

interface PanState {
  x: number;
  y: number;
  originX: number;
  originY: number;
}

export interface ProcessCanvasHandle {
  save: () => Promise<ProcessVersion | undefined>;
}

interface ProcessCanvasProps {
  lockedInputIds?: string[];
  defaultGroupId?: string | null | undefined;
  processId: string;
  version: ProcessVersion;
  editable: boolean;
  onVersionUpdate: (version: ProcessVersion) => void;
}

function downloadFile(contents: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = window.document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export const ProcessCanvas = forwardRef<
  ProcessCanvasHandle,
  ProcessCanvasProps
>(function ProcessCanvas(
  { processId, version, editable, onVersionUpdate, defaultGroupId, lockedInputIds = [] },
  ref,
) {
  const initialGraph = useMemo(
    () => normalizeGraph(version.graph),
    [version.graph],
  );
  const history = useGraphHistory(initialGraph);
  const { graph } = history;
  const graphSignature = useMemo(() => JSON.stringify(graph), [graph]);
  const [savedSignature, setSavedSignature] = useState(graphSignature);
  const [saveError, setSaveError] = useState<string>();
  const failedSignatureRef = useRef<string | undefined>(undefined);
  const groupsQuery = useInventoryGroupsQuery();
  const [revision, setRevision] = useState(version.revision);
  const revisionRef = useRef(version.revision);
  const savePromiseRef = useRef<Promise<ProcessVersion> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionArea, setSelectionArea] = useState<{x: number; y: number; endX: number; endY: number}>();
  const [dragPreview, setDragPreview] = useState<{nodes: ProcessNode[]; dx: number; dy: number; copy: boolean}>();
  const dragFrameRef = useRef<number | null>(null);
  const dragRef = useRef<{x: number; y: number; nodes: ProcessNode[]; copy: boolean; dx: number; dy: number} | null>(null);
  const [connectionError, setConnectionError] = useState<string>();
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 70, zoom: 1 });
  const [pan, setPan] = useState<PanState>();
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag>();
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState>();
  const [nodeDialogError, setNodeDialogError] = useState<string>();
  const [nodeDialogTab, setNodeDialogTab] = useState("settings");
  const [edgeDialog, setEdgeDialog] = useState<EdgeDialogState>();
  const [edgeDialogError, setEdgeDialogError] = useState<string>();
  const [importError, setImportError] = useState<string>();

  useEffect(() => () => {
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
  }, []);

  const materialsQuery = useMaterialsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
  }, true);
  const itemsQuery = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
    kind: "semi_finished",
  }, true);
  const operationsQuery = useOperationsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
  });
  const materialById = useMemo(() => new Map(materialsQuery.data?.items.map((item) => [item.id, item])), [materialsQuery.data]);
  const itemById = useMemo(() => new Map(itemsQuery.data?.items.map((item) => [item.id, item])), [itemsQuery.data]);
  const nodeCatalogQuery = nodeDialog?.type === 'material' ? materialsQuery
    : nodeDialog?.type === 'operation' ? operationsQuery : itemsQuery;

  const saveMutation = useMutation({
    mutationFn: (payload: { graph: CanvasGraph; expectedRevision: number }) =>
      saveTechnologicalProcessDraft(processId, version.id, {
        expected_revision: payload.expectedRevision,
        graph: payload.graph,
      }),
  });

  const {mutateAsync: saveDraft} = saveMutation;
  const persist = useCallback(async (): Promise<ProcessVersion | undefined> => {
    if (!editable || (graphSignature === savedSignature && version.status !== "error")) return undefined;
    if (savePromiseRef.current) return savePromiseRef.current;
    const submittedGraph = graph;
    const submittedSignature = graphSignature;
    const request = saveDraft({
        graph: submittedGraph,
        expectedRevision: revisionRef.current,
      })
      .then((savedVersion) => {
        revisionRef.current = savedVersion.revision;
        setRevision(savedVersion.revision);
        failedSignatureRef.current = undefined;
        setSaveError(undefined);
        setSavedSignature(submittedSignature);
        onVersionUpdate(savedVersion);
        return savedVersion;
      })
      .catch((error: unknown) => {
        failedSignatureRef.current = submittedSignature;
        setSaveError(getErrorMessage(error));
        throw error;
      })
      .finally(() => {
        savePromiseRef.current = null;
      });
    savePromiseRef.current = request;
    return request;
  }, [
    editable,
    graph,
    graphSignature,
    onVersionUpdate,
    saveDraft,
    savedSignature,
    version.status,
  ]);

  useImperativeHandle(ref, () => ({ save: persist }), [persist]);

  useEffect(() => {
    if (
      !editable ||
      graphSignature === savedSignature ||
      graphSignature === failedSignatureRef.current ||
      saveMutation.isPending
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => void persist().catch(() => undefined), 700);
    return () => window.clearTimeout(timer);
  }, [
    editable,
    graphSignature,
    persist,
    saveMutation.isPending,
    savedSignature,
  ]);

  useEffect(() => {
    if (!editable) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {setSelectedIds(new Set()); setSelectionArea(undefined); setDragPreview(undefined); dragRef.current = null;}
      if ((event.target as Element)?.closest("input, textarea, [contenteditable=true]")) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) history.redo();
        else history.undo();
      } else if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        history.redo();
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persist().catch(() => undefined);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editable, history, persist]);

  const referenceOptions = useMemo(() => {
    if (!nodeDialog) return [];
    const matchesGroup = (item: {groups?: Array<{id: string}>}) => !nodeDialog.groupId ||
      item.groups?.some((group) => group.id === nodeDialog.groupId ||
        groupsQuery.data?.find((candidate) => candidate.id === group.id)?.parent_id === nodeDialog.groupId);
    if (nodeDialog.type === "material") {
      return (
        materialsQuery.data?.items.filter(matchesGroup).map((item) => ({
          value: item.id,
          content: `${item.name} · ${item.unit}`,
        })) ?? []
      );
    }
    if (nodeDialog.type === "manufactured_item") {
      return (
        itemsQuery.data?.items
          .filter(matchesGroup)
          .filter((item) => item.id !== graph.outputItemId && !graph.nodes.some((node) => node.id !== nodeDialog.nodeId && node.type === 'manufactured_item' && node.referenceId === item.id))
          .map((item) => ({
            value: item.id,
            content: `${item.name} · ${item.unit}`,
          })) ?? []
      );
    }
    if (nodeDialog.type === "output" || nodeDialog.type === "comment") return [];
    return (
      operationsQuery.data?.items.filter((operation) => !graph.nodes.some((node) => node.id !== nodeDialog.nodeId && node.type === 'operation' && node.referenceId === operation.id)).map((operation) => ({
        value: operation.id,
        content: operation.name,
      })) ?? []
    );
  }, [
    groupsQuery.data,
    graph.outputItemId,
    graph.nodes,
    itemsQuery.data,
    materialsQuery.data,
    nodeDialog,
    operationsQuery.data,
  ]);

  const openNodeDialog = (node: ProcessNode) => {
    setNodeDialogError(undefined);
    if (
      !editable &&
      !["manufactured_item", "output"].includes(node.type)
    ) {
      return;
    }
    setNodeDialogTab(editable ? "settings" : node.referenceId ? "production" : "composition");
    setNodeDialog({
      mode: "edit",
      groupId: "",
      nodeId: node.id,
      type: node.type,
      referenceId: node.referenceId ?? "",
      label: node.label ?? "",
    });
  };

  const openEdgeDialog = (edge: ProcessEdgeInput) => {
    setEdgeDialog({
      edgeId: edge.id,
      quantity:
        edge.quantity === null || edge.quantity === undefined
          ? ""
          : formatFixedDecimal(edge.quantity),
    });
    setEdgeDialogError(undefined);
  };

  const commitNodeDialog = () => {
    if (!nodeDialog) return;
    if (nodeDialog.type !== 'material' && nodeDialog.type !== 'comment' && nodeDialog.referenceId && graph.nodes.some((node) =>
      node.id !== nodeDialog.nodeId && node.type === nodeDialog.type && node.referenceId === nodeDialog.referenceId)) {
      setNodeDialogError('Эта сущность уже добавлена в техпроцесс. Повторять можно материалы.');
      return;
    }
    if (nodeDialog.type === 'comment' && !nodeDialog.label.trim()) {
      setNodeDialogError('Введите текст комментария.');
      return;
    }
    const selected = referenceOptions.find(
      (option) => option.value === nodeDialog.referenceId,
    );
    const label =
      nodeDialog.label.trim() || selected?.content.split(" · ")[0] || null;
    if (nodeDialog.mode === "edit" && nodeDialog.nodeId) {
      history.commit({
        ...graph,
        edges: nodeDialog.type === 'comment'
          ? graph.edges.filter((edge) => edge.source !== nodeDialog.nodeId && edge.target !== nodeDialog.nodeId)
          : ['material', 'operation'].includes(nodeDialog.type)
            ? graph.edges.filter((edge) => edge.target !== nodeDialog.nodeId)
            : graph.edges,
        nodes: graph.nodes.map((node) =>
          node.id === nodeDialog.nodeId
            ? {
                ...node,
                type: nodeDialog.type,
                referenceId: nodeDialog.type === 'comment' ? null : nodeDialog.referenceId || null,
                label,
              }
            : node,
        ),
      });
    } else {
      const rect = canvasRef.current?.getBoundingClientRect();
      const x = ((rect?.width ?? 800) / 2 - viewport.x) / viewport.zoom;
      const y = ((rect?.height ?? 600) / 2 - viewport.y) / viewport.zoom;
      history.commit({
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: crypto.randomUUID(),
            type: nodeDialog.type,
            referenceId: nodeDialog.type === 'comment' ? null : nodeDialog.referenceId || null,
            label,
            position: { x, y },
          },
        ],
      });
    }
    setNodeDialog(undefined);
    setNodeDialogError(undefined);
  };

  const commitEdgeDialog = () => {
    if (!edgeDialog) return;
    if (
      !isDecimal(edgeDialog.quantity) ||
      Number(normalizeDecimal(edgeDialog.quantity)) <= 0
    ) {
      setEdgeDialogError("Количество должно быть положительным числом");
      return;
    }
    const quantity = formatFixedDecimal(normalizeDecimal(edgeDialog.quantity));
    history.commit({
      ...graph,
      edges: graph.edges.map((edge) =>
        edge.id === edgeDialog.edgeId ? { ...edge, quantity } : edge,
      ),
    });
    setEdgeDialog(undefined);
    setEdgeDialogError(undefined);
  };

  const deleteEdge = (edgeId: string) => {
    history.commit({
      ...graph,
      edges: graph.edges.filter((edge) => edge.id !== edgeId),
    });
    if (edgeDialog?.edgeId === edgeId) {
      setEdgeDialog(undefined);
      setEdgeDialogError(undefined);
    }
  };

  const deleteNode = (nodeId: string) => {
    setSelectedIds((current) => {const next = new Set(current); next.delete(nodeId); return next;});
    history.commit({
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      edges: graph.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    });
    if (connectionDrag?.source === nodeId) setConnectionDrag(undefined);
  };

  const copiedNode = (node: ProcessNode): ProcessNode => ({...node, id: crypto.randomUUID(),
    referenceId: node.type === 'material' || node.type === 'comment' ? node.referenceId ?? null : null});
  const copyMaterial = (node: ProcessNode) => {
    history.commit({...graph, nodes: [...graph.nodes, {...copiedNode(node),
      position: {x: (node.position?.x ?? 0) + 40, y: (node.position?.y ?? 0) + 40},
    }]});
  };

  const connectionPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - viewport.x) / viewport.zoom,
      y: (clientY - rect.top - viewport.y) / viewport.zoom,
    };
  };

  const connectionTargetAt = (clientX: number, clientY: number) =>
    window.document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-process-node-id]")?.dataset.processNodeId;

  const onConnectionPointerDown = (
    event: PointerEvent<HTMLButtonElement>,
    source: string,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setConnectionDrag({
      source,
      ...connectionPoint(event.clientX, event.clientY),
    });
  };

  const onConnectionPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (!connectionDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const target = connectionTargetAt(event.clientX, event.clientY);
    setConnectionDrag({
      source: connectionDrag.source,
      ...connectionPoint(event.clientX, event.clientY),
      ...(target && target !== connectionDrag.source ? { target } : {}),
    });
  };

  const onConnectionPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (!connectionDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const target = connectionTargetAt(event.clientX, event.clientY);
    const duplicate = graph.edges.some(
      (edge) => edge.source === connectionDrag.source && edge.target === target,
    );
    const targetNode = target ? nodeById.get(target) : undefined;
    const locked = targetNode?.type === 'manufactured_item' && targetNode.referenceId && lockedInputIds.includes(targetNode.referenceId);
    const leafTarget = targetNode?.type === 'material' || targetNode?.type === 'operation';
    if (leafTarget) setConnectionError('Материалы и операции не могут иметь входящие связи.');
    else if (locked) setConnectionError('У полуфабриката уже есть рецепт. Входящие связи запрещены; исходящие разрешены.');
    else setConnectionError(undefined);
    if (target && !locked && !leafTarget && targetNode?.type !== 'comment' && target !== connectionDrag.source && !duplicate) {
      history.commit({
        ...graph,
        edges: [
          ...graph.edges,
          {
            id: crypto.randomUUID(),
            source: connectionDrag.source,
            target,
            quantity: "1",
          },
        ],
      });
    }
    setConnectionDrag(undefined);
  };

  const onNodePointerDown = (event: PointerEvent<HTMLDivElement>, node: ProcessNode) => {
    if (event.button !== 0 || (event.target as Element).closest('button, input, a')) return;
    event.preventDefault(); event.stopPropagation();
    if (event.shiftKey) {
      setSelectedIds((current) => {const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next;});
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const ids = selectedIds.has(node.id) ? selectedIds : new Set([node.id]);
    const nodes = graph.nodes.filter((item) => ids.has(item.id));
    const copy = editable && event.altKey;
    const moving = copy ? nodes.filter((item) => item.type !== 'output').map(copiedNode) : nodes;
    setSelectedIds(new Set(moving.map((item) => item.id)));
    dragRef.current = {x: event.clientX, y: event.clientY, nodes: moving, copy, dx: 0, dy: 0};
    setDragPreview({nodes: moving, dx: 0, dy: 0, copy});
  };
  const onNodePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    event.stopPropagation();
    let dx = (event.clientX - drag.x) / viewport.zoom;
    let dy = (event.clientY - drag.y) / viewport.zoom;
    const anchor = drag.nodes[0]?.position ?? {x: 0, y: 0};
    if (snapToGrid || event.ctrlKey || event.metaKey) {
      dx = Math.round((anchor.x + dx) / 24) * 24 - anchor.x;
      dy = Math.round((anchor.y + dy) / 24) * 24 - anchor.y;
    }
    drag.dx = dx; drag.dy = dy;
    if (dragFrameRef.current === null) dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const latest = dragRef.current;
      if (latest) setDragPreview({nodes: latest.nodes, dx: latest.dx, dy: latest.dy, copy: latest.copy});
    });
  };
  const onNodePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (dragFrameRef.current !== null) cancelAnimationFrame(dragFrameRef.current);
    dragFrameRef.current = null;
    event.stopPropagation();
    if (drag.dx || drag.dy) {
      const moved = new Map(drag.nodes.map((node) => [node.id, {...node, position: {
        x: (node.position?.x ?? 0) + drag.dx, y: (node.position?.y ?? 0) + drag.dy}}]));
      history.commit({...graph, nodes: drag.copy ? [...graph.nodes, ...moved.values()]
        : graph.nodes.map((node) => moved.get(node.id) ?? node)});
    } else if (drag.copy) setSelectedIds(new Set());
    dragRef.current = null; setDragPreview(undefined);
  };

  const onCanvasPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (
      (event.target as Element).closest(
        "[data-process-node], [data-process-edge]",
      )
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (editable && event.shiftKey) {
      const point = connectionPoint(event.clientX, event.clientY);
      setSelectionArea({...point, endX: point.x, endY: point.y});
      return;
    }
    setSelectedIds(new Set());
    setPan({
      x: event.clientX,
      y: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  };
  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (selectionArea) {
      const point = connectionPoint(event.clientX, event.clientY);
      setSelectionArea({...selectionArea, endX: point.x, endY: point.y});
      return;
    }
    if (!pan) return;
    setViewport((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.x,
      y: pan.originY + event.clientY - pan.y,
    }));
  };
  const onCanvasPointerUp = () => {
    if (selectionArea) {
      const left = Math.min(selectionArea.x, selectionArea.endX), right = Math.max(selectionArea.x, selectionArea.endX);
      const top = Math.min(selectionArea.y, selectionArea.endY), bottom = Math.max(selectionArea.y, selectionArea.endY);
      setSelectedIds(new Set(graph.nodes.filter((node) => {
        const {x, y} = node.position ?? {x: 0, y: 0};
        return x <= right && x + NODE_WIDTH >= left && y <= bottom && y + NODE_HEIGHT >= top;
      }).map((node) => node.id)));
      setSelectionArea(undefined);
    }
    setPan(undefined);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const onWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      setViewport((current) => {
        const nextZoom = Math.min(
          2,
          Math.max(0.35, current.zoom * (event.deltaY > 0 ? 0.9 : 1.1)),
        );
        const worldX = (event.clientX - rect.left - current.x) / current.zoom;
        const worldY = (event.clientY - rect.top - current.y) / current.zoom;
        return {
          zoom: nextZoom,
          x: event.clientX - rect.left - worldX * nextZoom,
          y: event.clientY - rect.top - worldY * nextZoom,
        };
      });
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

  const fitToScreen = () => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || graph.nodes.length === 0) return;
    const minX = Math.min(...graph.nodes.map((node) => node.position?.x ?? 0));
    const minY = Math.min(...graph.nodes.map((node) => node.position?.y ?? 0));
    const maxX = Math.max(
      ...graph.nodes.map((node) => (node.position?.x ?? 0) + NODE_WIDTH),
    );
    const maxY = Math.max(
      ...graph.nodes.map((node) => (node.position?.y ?? 0) + NODE_HEIGHT),
    );
    const zoom = Math.min(
      1.4,
      Math.max(
        0.35,
        Math.min(
          (rect.width - 100) / (maxX - minX),
          (rect.height - 100) / (maxY - minY),
        ),
      ),
    );
    setViewport({
      zoom,
      x: (rect.width - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (rect.height - (maxY - minY) * zoom) / 2 - minY * zoom,
    });
  };

  const importExcalidraw = async (file: File) => {
    try {
      const imported = excalidrawToGraph(JSON.parse(await file.text()), {
        name: graph.name,
        outputItemId: graph.outputItemId ?? null,
        defaultGroupId: graph.defaultGroupId ?? null,
      });
      const outputNodes = graph.nodes.filter((node) => node.type === "output");
      if (!imported.nodes.some((node) => node.type === "output")) {
        imported.nodes.push(...outputNodes);
      }
      history.commit(imported);
      setImportError(undefined);
    } catch (error) {
      setImportError(
        error instanceof Error
          ? error.message
          : "Не удалось импортировать файл",
      );
    }
  };

  const worldWidth = Math.max(
    2200,
    ...graph.nodes.map((node) => (node.position?.x ?? 0) + 500),
  );
  const worldHeight = Math.max(
    1400,
    ...graph.nodes.map((node) => (node.position?.y ?? 0) + 400),
  );
  const persistedNodes = useMemo(() => new Set(version.graph.nodes?.map((node) => node.id)), [version.graph]);
  const participating = useMemo(() => participatingNodes(normalizeGraph(version.graph)), [version.graph]);
  const movingById = new Map(dragPreview?.nodes.map((node) => [node.id, {...node,
    position: {x: (node.position?.x ?? 0) + dragPreview.dx, y: (node.position?.y ?? 0) + dragPreview.dy}}]));
  const renderedNodes = graph.nodes.map((node) => movingById.get(node.id) ?? node);
  if (dragPreview?.copy) renderedNodes.push(...movingById.values());
  const nodeById = new Map(renderedNodes.map((node) => [node.id, node]));
  const saveStatus = !editable
    ? { text: version.status === "active" ? "Активная версия" : "Только просмотр", theme: "info" as const }
    : saveMutation.isPending
    ? { text: "Сохранение…", theme: "info" as const }
    : saveError
      ? { text: "Ошибка сохранения", theme: "danger" as const }
      : graphSignature === savedSignature
        ? version.status === 'error' ? {text: "Сохранено с ошибкой", theme: "danger" as const}
          : { text: "Сохранено", theme: "success" as const }
        : { text: "Есть изменения", theme: "warning" as const };

  return (
    <Card view="outlined" className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <Text as="h2" variant="header-2">
            Canvas
          </Text>
          <Label theme={saveStatus.theme}>{saveStatus.text}</Label>
          <Text color="secondary" variant="caption-2">
            rev. {revision}
          </Text>
        </div>
        <div className={styles.toolbarGroup}>
          {editable ? (
            <Button
              view="action"
              onClick={() => {
                setNodeDialogError(undefined);
                setNodeDialogTab("settings");
                setNodeDialog({
                  mode: "add",
                  groupId: defaultGroupId ?? "",
                  type: "material",
                  referenceId: "",
                  label: "",
                });
              }}
            >
              Добавить узел
            </Button>
          ) : null}
          <Button
            view="outlined"
            aria-label="Отменить (Ctrl+Z)" title="Отменить (Ctrl+Z)"
            onClick={history.undo}
            disabled={!editable || !history.canUndo}
          >
            <Icon data={ArrowRotateLeft} size={20} />
          </Button>
          <Button
            view="outlined"
            aria-label="Повторить (Ctrl+Y)" title="Повторить (Ctrl+Y)"
            onClick={history.redo}
            disabled={!editable || !history.canRedo}
          >
            <Icon data={ArrowRotateRight} size={20} />
          </Button>
          <Button view="outlined" aria-label="Помощь по клавишам" title="Помощь по клавишам" onClick={() => setHelpOpen(true)}><Icon data={CircleQuestion} size={20} /></Button>
          {editable && <Button view={snapToGrid ? 'outlined-action' : 'flat-secondary'}
            aria-label="Привязка к сетке" title="Привязка к сетке (Ctrl при перетаскивании)"
            selected={snapToGrid} onClick={() => setSnapToGrid((current) => !current)}>
            <Icon data={LayoutCells} size={20} /></Button>}
          <Button view="outlined" onClick={fitToScreen}>
            По размеру
          </Button>
          <Button
            view="outlined"
            onClick={() =>
              setViewport((current) => ({
                ...current,
                zoom: Math.min(2, current.zoom + 0.1),
              }))
            }
          >
            +
          </Button>
          <Button
            view="outlined"
            onClick={() =>
              setViewport((current) => ({
                ...current,
                zoom: Math.max(0.35, current.zoom - 0.1),
              }))
            }
          >
            −
          </Button>
          <input
            ref={importRef}
            className={styles.fileInput}
            type="file"
            accept=".excalidraw,application/json"
            aria-label="Импорт Excalidraw"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importExcalidraw(file);
            }}
          />
          {editable ? (
            <Button view="outlined" aria-label="Импорт Excalidraw" title="Импорт Excalidraw" onClick={() => importRef.current?.click()}>
              <Icon data={ArrowUpFromLine} size={20} />
            </Button>
          ) : null}
          <Button
            view="outlined" aria-label="Экспорт Excalidraw" title="Экспорт Excalidraw"
            onClick={() =>
              downloadFile(
                JSON.stringify(graphToExcalidraw(graph), null, 2),
                `process-v${version.version_number}.excalidraw`,
                "application/json",
              )
            }
          >
            <Icon data={ArrowDownToLine} size={20} />
          </Button>
          {editable ? (
            <Button
              view="outlined"
              onClick={() => void persist().catch(() => undefined)}
              loading={saveMutation.isPending}
              disabled={graphSignature === savedSignature && version.status !== "error"}
            >
              Сохранить сейчас
            </Button>
          ) : null}
        </div>
      </div>

      {saveError ? (
        <Alert
          theme="danger"
          title="Черновик не сохранён"
          message={saveError}
        />
      ) : null}
      {importError ? <Alert theme="danger" message={importError} /> : null}

      {version.status === 'error' && <Alert theme="danger" title="Схема сохранена с ошибками" message={(version.validation_errors ?? []).join('; ')} />}
      {connectionError && <Alert theme="warning" message={connectionError} />}
      <div className={styles.workspace}>
        <div
          ref={canvasRef}
          className={`${styles.canvas} ${pan ? styles.panning : ""}`}
          style={{backgroundSize: `${24 * viewport.zoom}px ${24 * viewport.zoom}px`, backgroundPosition: `${viewport.x}px ${viewport.y}px`}}
          aria-label="Полотно технологического процесса"
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
        >
          <div
            className={styles.world}
            style={{
              width: worldWidth,
              height: worldHeight,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
            }}
          >
            <svg
              className={styles.edges}
              width={worldWidth}
              height={worldHeight}
              aria-hidden="true"
            >
              <defs>
                <marker
                  id={`arrow-${version.id}`}
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" />
                </marker>
              </defs>
              {graph.edges.map((edge) => {
                const source = nodeById.get(edge.source);
                const target = nodeById.get(edge.target);
                if (!source || !target) return null;
                const x1 = (source.position?.x ?? 0) + NODE_WIDTH;
                const y1 = (source.position?.y ?? 0) + NODE_HEIGHT / 2;
                const x2 = target.position?.x ?? 0;
                const y2 = (target.position?.y ?? 0) + NODE_HEIGHT / 2;
                const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
                return (
                  <g
                    key={edge.id}
                    className={!participating.has(edge.target) ? styles.inactive : undefined}
                    data-process-edge
                    onDoubleClick={(event) => {
                      event.stopPropagation();
                      if (editable) openEdgeDialog(edge);
                    }}
                  >
                    {editable ? (
                      <title>Двойной клик — изменить соединение</title>
                    ) : null}
                    <path
                      className={styles.edgePath}
                      d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                      markerEnd={`url(#arrow-${version.id})`}
                    />
                    {editable ? (
                      <path
                        className={styles.edgeHitArea}
                        d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                      />
                    ) : null}
                    <text
                      className={styles.edgeLabel}
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 8}
                    >
                      {edge.quantity === null || edge.quantity === undefined
                        ? "?"
                        : formatDecimal(edge.quantity)}
                    </text>
                  </g>
                );
              })}
              {connectionDrag
                ? (() => {
                    const source = nodeById.get(connectionDrag.source);
                    if (!source) return null;
                    const target = connectionDrag.target
                      ? nodeById.get(connectionDrag.target)
                      : undefined;
                    const x1 = (source.position?.x ?? 0) + NODE_WIDTH;
                    const y1 = (source.position?.y ?? 0) + NODE_HEIGHT / 2;
                    const x2 = target?.position?.x ?? connectionDrag.x;
                    const y2 = target
                      ? (target.position?.y ?? 0) + NODE_HEIGHT / 2
                      : connectionDrag.y;
                    const curve = Math.max(70, Math.abs(x2 - x1) * 0.45);
                    return (
                      <path
                        className={`${styles.edgePath} ${styles.draftEdge}`}
                        d={`M ${x1} ${y1} C ${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}`}
                        markerEnd={`url(#arrow-${version.id})`}
                      />
                    );
                  })()
                : null}
            </svg>
            {selectionArea && <div className={styles.selectionArea} style={{left: Math.min(selectionArea.x, selectionArea.endX), top: Math.min(selectionArea.y, selectionArea.endY), width: Math.abs(selectionArea.endX - selectionArea.x), height: Math.abs(selectionArea.endY - selectionArea.y)}} />}
            {renderedNodes.map((node) => {
              const view = nodeTypeView[node.type];
              return (
                <div
                  key={node.id}
                  data-process-node
                  data-process-node-id={node.id}
                  data-process-participating={node.type === "comment" || participating.has(node.id)}
                  className={`${styles.node} ${styles[node.type]} ${node.type !== "comment" && persistedNodes.has(node.id) && !participating.has(node.id) ? styles.inactive : ""} ${selectedIds.has(node.id) ? styles.selected : ""} ${connectionDrag?.source === node.id ? styles.connecting : ""} ${connectionDrag?.target === node.id ? styles.connectionTarget : ""}`}
                  style={{
                    transform: `translate(${node.position?.x ?? 0}px, ${node.position?.y ?? 0}px)`,
                  }}
                  onPointerDown={(event) => onNodePointerDown(event, node)}
                  onPointerMove={onNodePointerMove}
                  onPointerUp={onNodePointerUp}
                  onPointerCancel={() => {dragRef.current = null; setDragPreview(undefined);}}
                  onDoubleClick={(event) => {
                    if (!(event.target as Element).closest("button, input")) {
                      openNodeDialog(node);
                    }
                  }}
                >
                  <div className={styles.nodeHeading}>
                    <Label theme={view.theme} size="s">
                      {view.title}
                    </Label>
                    <Text color="secondary" variant="caption-2">
                      {node.id.slice(0, 8)}
                    </Text>
                  </div>
                  {node.type === 'operation' && <svg className={styles.operationShape} viewBox="0 0 220 144" preserveAspectRatio="none" aria-hidden="true"><polygon points="20,1 200,1 219,72 200,143 20,143 1,72" /></svg>}
                  {node.type === 'comment' && <svg className={styles.commentShape} viewBox="0 0 220 144" preserveAspectRatio="none" aria-hidden="true"><polygon points="20,1 219,1 200,143 1,143" /></svg>}
                  <div className={styles.nodeContent} title={node.label ?? view.title}>
                  {(node.type === 'material' || node.type === 'manufactured_item' || node.type === 'output') && <CanvasNodeImage
                    type={node.type === 'material' ? 'material' : 'manufactured_item'} referenceId={node.referenceId} name={node.label ?? view.title}
                    image={(node.type === 'material' ? materialById : itemById).get(node.referenceId ?? '')?.image} />}
                  <Text className={styles.nodeLabel} variant="subheader-2">
                    {node.label ?? "Не сопоставлено"}
                  </Text>
                  </div>
                  <div className={styles.nodeActions}>
                    {editable && node.type !== "output" ? (
                      <Button
                        view="flat"
                        size="m"
                        aria-label="Изменить" title="Изменить узел"
                        onClick={() => openNodeDialog(node)}
                      >
                        <Icon data={Pencil} size={20} />
                      </Button>
                    ) : null}
                    {editable && node.type !== 'output' ? <Button view="flat" size="m" aria-label={`Создать копию ${node.type === 'material' ? 'материала' : 'узла'} ${node.label ?? node.id}`} title="Создать копию" onClick={() => copyMaterial(node)}><Icon data={Copy} size={20} /></Button> : null}
                    {editable && node.type !== 'comment' && node.type !== 'output' ? (
                      <button
                        className={styles.connector}
                        type="button"
                        draggable={false}
                        aria-label={`Потянуть связь из ${node.label ?? node.id}`}
                        title="Потяните к другому узлу"
                        onDragStart={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onPointerDown={(event) =>
                          onConnectionPointerDown(event, node.id)
                        }
                        onPointerMove={onConnectionPointerMove}
                        onPointerUp={onConnectionPointerUp}
                        onPointerCancel={() => setConnectionDrag(undefined)}
                      />
                    ) : null}
                    {editable && node.type !== "output" ? (
                      <Button
                        view="flat-danger"
                        size="m"
                        aria-label={`Удалить узел ${node.label ?? node.id}`} title="Удалить узел"
                        onClick={() => deleteNode(node.id)}
                      >
                        <Icon data={TrashBin} size={20} />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <div className={styles.zoom}>{Math.round(viewport.zoom * 100)}%</div>
        </div>

        {/* <aside className={styles.connections}>
          <div>
            <Text as="h3" variant="subheader-2">
              Связи
            </Text>
          </div>
          {graph.edges.length === 0 ? (
            <Text color="secondary">Связей пока нет</Text>
          ) : (
            graph.edges.map((edge) => (
              <div className={styles.edgeEditor} key={edge.id}>
                <Text variant="caption-2">
                  {nodeById.get(edge.source)?.label ?? edge.source} →{" "}
                  {nodeById.get(edge.target)?.label ?? edge.target}
                </Text>
                <div className={styles.edgeEditorControls}>
                  <Text className={styles.edgeQuantity} variant="subheader-2">
                    {edge.quantity === null || edge.quantity === undefined
                      ? "?"
                      : formatDecimal(edge.quantity)}
                  </Text>
                  {editable ? (
                    <>
                      <Button view="flat" onClick={() => openEdgeDialog(edge)}>
                        <Icon data={Pencil} size={20} />
                      </Button>
                      <Button
                        view="flat-danger"
                        onClick={() => deleteEdge(edge.id)}
                      >
                        Удалить
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </aside> */}
      </div>

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)}>
        <Dialog.Header caption="Клавиши и управление" />
        <Dialog.Body><ul>
          <li>Колесо мыши — масштаб; перетаскивание фона — перемещение схемы.</li>
          <li>Ctrl / Cmd + S — сохранить; Ctrl / Cmd + Z — отменить; Ctrl / Cmd + Shift + Z — повторить.</li>
          <li>Ctrl при перетаскивании — привязка к сетке. Кнопка с сеткой включает её постоянно.</li>
          <li>Alt + перетаскивание — копия. У операций и полуфабрикатов копия создаётся без привязки к справочнику; результат не копируется.</li>
          <li>Shift + выделение области или Shift + клик — выбрать несколько узлов. Перетаскивание выбранного узла перемещает всю группу.</li>
          <li>Двойной клик — изменить узел или соединение. Escape — снять выделение.</li>
        </ul></Dialog.Body>
        <Dialog.Footer textButtonCancel="Закрыть" onClickButtonCancel={() => setHelpOpen(false)} />
      </Dialog>
      <Dialog
        open={Boolean(nodeDialog)}
        onClose={() => setNodeDialog(undefined)}
        maxWidth="m"
        fullWidth
      >
        {!editable && nodeDialogTab === "production" ? (
          <Dialog.Header caption={`Производство: ${nodeDialog?.label ?? ""}`} />
        ) : (
          <Dialog.Header
          caption={!editable ? `Узел: ${nodeDialog?.label ?? ""}` : nodeDialog?.mode === "edit" ? "Изменить узел" : "Новый узел"}
          />
        )}
        <Dialog.Body>
          {nodeDialog ? (
            <div className={styles.dialogForm}>
              {nodeDialog.mode === "edit" &&
              ["manufactured_item", "output"].includes(nodeDialog.type) ? (
                <TabList value={nodeDialogTab} onUpdate={setNodeDialogTab}>
                  {editable && <Tab value="settings">Настройки</Tab>}
                  <Tab value="composition">Состав</Tab>
                  {nodeDialog.referenceId && <Tab value="production">Производство</Tab>}
                </TabList>
              ) : null}
              {nodeDialogTab === "composition" && nodeDialog.nodeId ? (
                <NodeRecipe graph={graph} node={graph.nodes.find((node) => node.id === nodeDialog.nodeId)!}
                  processId={processId} onSelect={(ids) => {setSelectedIds(ids); setNodeDialog(undefined);}} />
              ) : nodeDialogTab === "production" ? (
                <div className={styles.productionTab}>
                  <Text color="secondary">
                    Расчёт использует активный рецепт и сначала расходует доступные
                    полуфабрикаты со склада.
                  </Text>
                  {nodeDialog.type === "output" ? <Button href="/production-plans?tab=release" view="action">Открыть выпуск продукции</Button> : <ProduceManufacturedItemButton
                    itemId={nodeDialog.referenceId}
                    itemName={nodeDialog.label || "Позиция"}
                    size="l"
                    view="action"
                  />}
                </div>
              ) : nodeDialog.type === "output" ? (
                <Text color="secondary">
                  Финальный результат процесса: тип и сопоставление
                  зафиксированы.
                </Text>
              ) : (
                <>
                  <div>
                  <Text as="div">Тип</Text>
                  <RadioGroup
                    direction="horizontal"
                    options={nodeTypeOptions}
                    value={nodeDialog.type}
                    onUpdate={(value) => {
                      setNodeDialogError(undefined);
                      setNodeDialog({
                        ...nodeDialog,
                        type: value as NodeDialogState["type"],
                        referenceId: "",
                      })
                    }}
                    aria-label="Тип узла"
                  />
                  </div>
                  {["material", "manufactured_item"].includes(nodeDialog.type) && <MobileProvider mobile={false}><Select
                    label="Группа / подгруппа" aria-label="Группа узла" disablePortal popupPlacement={["bottom-start", "bottom-end"]} popupWidth="fit"
                    popupClassName={styles.nodeSelectPopup} filterable hasClear width="max"
                    value={nodeDialog.groupId ? [nodeDialog.groupId] : []}
                    placeholder="Все группы" loading={groupsQuery.isPending}
                    options={(groupsQuery.data ?? []).map((group) => ({value: group.id,
                      content: group.parent_id ? `${groupsQuery.data?.find((parent) => parent.id === group.parent_id)?.name} / ${group.name}` : group.name}))}
                    onUpdate={(ids) => setNodeDialog({...nodeDialog, groupId: ids[0] ?? "", referenceId: ""})} /></MobileProvider>}
                  {nodeDialog.type !== 'comment' && <MobileProvider mobile={false}><Select
                    label="Сущность"
                    disablePortal
                    popupPlacement={["bottom-start", "bottom-end"]}
                    popupWidth="fit"
                    popupClassName={styles.nodeSelectPopup}
                    options={referenceOptions}
                    loading={nodeCatalogQuery.isPending}
                    value={
                      nodeDialog.referenceId ? [nodeDialog.referenceId] : []
                    }
                    onUpdate={(values) =>
                      setNodeDialog({
                        ...nodeDialog,
                        referenceId: values[0] ?? "",
                      })
                    }
                    placeholder="Можно сопоставить позже"
                    filterable
                    width="max"
                    aria-label="Сущность узла"
                  /></MobileProvider>}
                  {nodeDialog.type === 'manufactured_item' && lockedInputIds.includes(nodeDialog.referenceId) && <Alert theme="info" message="У полуфабриката уже есть рецепт: можно проводить связи от него, но нельзя к нему." />}
                  {nodeDialog.type !== 'comment' && nodeCatalogQuery.isError && <Alert theme="danger"
                    title="Не удалось загрузить справочник" message={getErrorMessage(nodeCatalogQuery.error)}
                    actions={<Button onClick={() => nodeCatalogQuery.refetch()}>Повторить</Button>} />}
                </>
              )}
              {editable && nodeDialogTab === "settings" ? (
              nodeDialog.type === 'comment' ? <TextArea label="Комментарий" value={nodeDialog.label}
                onUpdate={(label) => {setNodeDialogError(undefined); setNodeDialog({...nodeDialog, label});}}
                controlProps={{'aria-label': 'Текст комментария', maxLength: 200}} /> : <TextInput
                label="Подпись"
                disabled={!editable}
                value={nodeDialog.label}
                onUpdate={(label) => setNodeDialog({ ...nodeDialog, label })}
                controlProps={{ "aria-label": "Подпись узла" }}
              />
              ) : null}
              {nodeDialogError && <Alert theme="danger" message={nodeDialogError} />}
              {['material', 'operation'].includes(nodeDialog.type) && graph.edges.some((edge) => edge.target === nodeDialog.nodeId) &&
                <Alert theme="warning" message="Входящие связи будут удалены: материалы и операции могут быть только источниками." />}
              {nodeDialog.type === 'comment' && graph.edges.some((edge) => edge.source === nodeDialog.nodeId || edge.target === nodeDialog.nodeId) &&
                <Alert theme="warning" message="При превращении узла в комментарий его производственные связи будут удалены." />}
            </div>
          ) : null}
        </Dialog.Body>
        {!editable || nodeDialogTab !== "settings" ? (
          <Dialog.Footer
            textButtonCancel="Закрыть"
            onClickButtonCancel={() => setNodeDialog(undefined)}
          />
        ) : (
          <Dialog.Footer
            textButtonApply="Готово"
            textButtonCancel="Отмена"
            onClickButtonApply={commitNodeDialog}
            onClickButtonCancel={() => setNodeDialog(undefined)}
          />
        )}
      </Dialog>

      <Dialog
        open={Boolean(edgeDialog)}
        onClose={() => {
          setEdgeDialog(undefined);
          setEdgeDialogError(undefined);
        }}
      >
        <Dialog.Header caption="Изменить соединение" />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <TextInput
              label="Количество"
              value={edgeDialog?.quantity ?? ""}
              onUpdate={(quantity) =>
                edgeDialog && setEdgeDialog({ ...edgeDialog, quantity })
              }
              controlProps={{
                "aria-label": "Количество соединения",
                inputMode: "decimal",
              }}
              {...(edgeDialogError
                ? {
                    validationState: "invalid" as const,
                    errorMessage: edgeDialogError,
                  }
                : {})}
              autoFocus
            />
            {edgeDialog ? (
              <Button
                view="flat-danger"
                onClick={() => deleteEdge(edgeDialog.edgeId)}
              >
                Удалить соединение
              </Button>
            ) : null}
          </div>
        </Dialog.Body>
        <Dialog.Footer
          textButtonApply="Сохранить"
          textButtonCancel="Отмена"
          onClickButtonApply={commitEdgeDialog}
          onClickButtonCancel={() => {
            setEdgeDialog(undefined);
            setEdgeDialogError(undefined);
          }}
        />
      </Dialog>
    </Card>
  );
});
