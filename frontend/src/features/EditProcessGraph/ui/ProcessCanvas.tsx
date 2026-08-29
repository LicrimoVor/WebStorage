import {
  Alert,
  Button,
  Card,
  Dialog,
  Label,
  Select,
  Tab,
  TabList,
  Text,
  TextInput,
} from "@gravity-ui/uikit";
import { useMutation } from "@tanstack/react-query";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";

import { useManufacturedItemsQuery } from "@/entities/ManufacturedItem";
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
import { formatFixedDecimal, isDecimal, normalizeDecimal } from "@/shared/lib";

import {
  excalidrawToGraph,
  graphToExcalidraw,
  normalizeGraph,
  type CanvasGraph,
} from "../model/excalidraw";
import { calculateDroppedNodePosition } from "../model/geometry";
import styles from "./ProcessCanvas.module.scss";

const NODE_WIDTH = 220;
const NODE_HEIGHT = 116;

const nodeTypeView: Record<
  ProcessNode["type"],
  { title: string; theme: "warning" | "info" | "utility" | "success" }
> = {
  material: { title: "Материал", theme: "warning" },
  manufactured_item: { title: "Полуфабрикат", theme: "info" },
  operation: { title: "Операция", theme: "utility" },
  output: { title: "Результат", theme: "success" },
};

const nodeTypeOptions = [
  { value: "material", content: "Материал" },
  { value: "manufactured_item", content: "Полуфабрикат" },
  { value: "operation", content: "Операция" },
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
  { processId, version, editable, onVersionUpdate },
  ref,
) {
  const initialGraph = useMemo(
    () => normalizeGraph(version.graph),
    [version.graph],
  );
  const history = useGraphHistory(initialGraph);
  const { graph } = history;
  const graphSignature = JSON.stringify(graph);
  const [savedSignature, setSavedSignature] = useState(graphSignature);
  const [revision, setRevision] = useState(version.revision);
  const revisionRef = useRef(version.revision);
  const savePromiseRef = useRef<Promise<ProcessVersion> | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const [viewport, setViewport] = useState<Viewport>({ x: 80, y: 70, zoom: 1 });
  const [pan, setPan] = useState<PanState>();
  const [connectionDrag, setConnectionDrag] = useState<ConnectionDrag>();
  const [nodeDialog, setNodeDialog] = useState<NodeDialogState>();
  const [nodeDialogTab, setNodeDialogTab] = useState("settings");
  const [edgeDialog, setEdgeDialog] = useState<EdgeDialogState>();
  const [edgeDialogError, setEdgeDialogError] = useState<string>();
  const [importError, setImportError] = useState<string>();

  const materialsQuery = useMaterialsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
  });
  const itemsQuery = useManufacturedItemsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
    kind: "semi_finished",
  });
  const operationsQuery = useOperationsQuery({
    page: 1,
    page_size: 100,
    sort_by: "name",
    sort_order: "asc",
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { graph: CanvasGraph; expectedRevision: number }) =>
      saveTechnologicalProcessDraft(processId, version.id, {
        expected_revision: payload.expectedRevision,
        graph: payload.graph,
      }),
  });

  const persist = useCallback(async (): Promise<ProcessVersion | undefined> => {
    if (!editable || graphSignature === savedSignature) return undefined;
    if (savePromiseRef.current) return savePromiseRef.current;
    const submittedGraph = graph;
    const submittedSignature = graphSignature;
    const request = saveMutation
      .mutateAsync({
        graph: submittedGraph,
        expectedRevision: revisionRef.current,
      })
      .then((savedVersion) => {
        revisionRef.current = savedVersion.revision;
        setRevision(savedVersion.revision);
        setSavedSignature(submittedSignature);
        onVersionUpdate(savedVersion);
        return savedVersion;
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
    saveMutation,
    savedSignature,
  ]);

  useImperativeHandle(ref, () => ({ save: persist }), [persist]);

  useEffect(() => {
    if (
      !editable ||
      graphSignature === savedSignature ||
      saveMutation.isPending
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => void persist(), 700);
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
        void persist();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editable, history, persist]);

  const referenceOptions = useMemo(() => {
    if (!nodeDialog) return [];
    if (nodeDialog.type === "material") {
      return (
        materialsQuery.data?.items.map((item) => ({
          value: item.id,
          content: `${item.name} · ${item.unit}`,
        })) ?? []
      );
    }
    if (nodeDialog.type === "manufactured_item") {
      return (
        itemsQuery.data?.items
          .filter((item) => item.id !== graph.outputItemId)
          .map((item) => ({
            value: item.id,
            content: `${item.name} · ${item.unit}`,
          })) ?? []
      );
    }
    if (nodeDialog.type === "output") return [];
    return (
      operationsQuery.data?.items.map((operation) => ({
        value: operation.id,
        content: operation.name,
      })) ?? []
    );
  }, [
    graph.outputItemId,
    itemsQuery.data,
    materialsQuery.data,
    nodeDialog,
    operationsQuery.data,
  ]);

  const openNodeDialog = (node: ProcessNode) => {
    setNodeDialogTab("settings");
    setNodeDialog({
      mode: "edit",
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
    const selected = referenceOptions.find(
      (option) => option.value === nodeDialog.referenceId,
    );
    const label =
      nodeDialog.label.trim() || selected?.content.split(" · ")[0] || null;
    if (nodeDialog.mode === "edit" && nodeDialog.nodeId) {
      history.commit({
        ...graph,
        nodes: graph.nodes.map((node) =>
          node.id === nodeDialog.nodeId
            ? {
                ...node,
                type: nodeDialog.type,
                referenceId: nodeDialog.referenceId || null,
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
            referenceId: nodeDialog.referenceId || null,
            label,
            position: { x, y },
          },
        ],
      });
    }
    setNodeDialog(undefined);
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
    history.commit({
      ...graph,
      nodes: graph.nodes.filter((node) => node.id !== nodeId),
      edges: graph.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId,
      ),
    });
    if (connectionDrag?.source === nodeId) setConnectionDrag(undefined);
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
    if (target && target !== connectionDrag.source && !duplicate) {
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

  const onDragStart = (event: DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragOffsetRef.current = {
      x: (event.clientX - rect.left) / viewport.zoom,
      y: (event.clientY - rect.top) / viewport.zoom,
    };
    event.dataTransfer.effectAllowed = "move";
  };
  const onDragEnd = (event: DragEvent<HTMLDivElement>, nodeId: string) => {
    if (!editable || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const position = calculateDroppedNodePosition(
      { x: event.clientX, y: event.clientY },
      rect,
      viewport,
      dragOffsetRef.current,
    );
    history.commit({
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === nodeId ? { ...node, position } : node,
      ),
    });
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
    setPan({
      x: event.clientX,
      y: event.clientY,
      originX: viewport.x,
      originY: viewport.y,
    });
  };
  const onCanvasPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!pan) return;
    setViewport((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.x,
      y: pan.originY + event.clientY - pan.y,
    }));
  };
  const onCanvasPointerUp = () => setPan(undefined);

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
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const saveStatus = saveMutation.isPending
    ? { text: "Сохранение…", theme: "info" as const }
    : saveMutation.isError
      ? { text: "Ошибка сохранения", theme: "danger" as const }
      : graphSignature === savedSignature
        ? { text: "Сохранено", theme: "success" as const }
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
                setNodeDialogTab("settings");
                setNodeDialog({
                  mode: "add",
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
            onClick={history.undo}
            disabled={!editable || !history.canUndo}
          >
            Undo
          </Button>
          <Button
            view="outlined"
            onClick={history.redo}
            disabled={!editable || !history.canRedo}
          >
            Redo
          </Button>
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
            <Button view="outlined" onClick={() => importRef.current?.click()}>
              Импорт .excalidraw
            </Button>
          ) : null}
          <Button
            view="outlined"
            onClick={() =>
              downloadFile(
                JSON.stringify(graphToExcalidraw(graph), null, 2),
                `process-v${version.version_number}.excalidraw`,
                "application/json",
              )
            }
          >
            Экспорт .excalidraw
          </Button>
          {editable ? (
            <Button
              view="outlined"
              onClick={() => void persist()}
              loading={saveMutation.isPending}
              disabled={graphSignature === savedSignature}
            >
              Сохранить сейчас
            </Button>
          ) : null}
        </div>
      </div>

      {saveMutation.error ? (
        <Alert
          theme="danger"
          title="Черновик не сохранён"
          message={getErrorMessage(saveMutation.error)}
        />
      ) : null}
      {importError ? <Alert theme="danger" message={importError} /> : null}

      <div className={styles.workspace}>
        <div
          ref={canvasRef}
          className={`${styles.canvas} ${pan ? styles.panning : ""}`}
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
                        : formatFixedDecimal(edge.quantity)}
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
            {graph.nodes.map((node) => {
              const view = nodeTypeView[node.type];
              return (
                <div
                  key={node.id}
                  data-process-node
                  data-process-node-id={node.id}
                  className={`${styles.node} ${styles[node.type]} ${connectionDrag?.source === node.id ? styles.connecting : ""} ${connectionDrag?.target === node.id ? styles.connectionTarget : ""}`}
                  style={{
                    transform: `translate(${node.position?.x ?? 0}px, ${node.position?.y ?? 0}px)`,
                  }}
                  draggable={editable && !connectionDrag}
                  onDragStart={onDragStart}
                  onDragEnd={(event) => onDragEnd(event, node.id)}
                  onDoubleClick={(event) => {
                    if (
                      editable &&
                      !(event.target as Element).closest("button, input")
                    ) {
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
                  <Text className={styles.nodeLabel} variant="subheader-2">
                    {node.label ?? "Не сопоставлено"}
                  </Text>
                  <div className={styles.nodeActions}>
                    {editable && node.type !== "output" ? (
                      <Button
                        view="flat"
                        size="s"
                        onClick={() => openNodeDialog(node)}
                      >
                        Изменить
                      </Button>
                    ) : null}
                    {editable ? (
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
                        size="s"
                        onClick={() => deleteNode(node.id)}
                      >
                        ×
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
                      : formatFixedDecimal(edge.quantity)}
                  </Text>
                  {editable ? (
                    <>
                      <Button view="flat" onClick={() => openEdgeDialog(edge)}>
                        Изменить
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

      <Dialog
        open={Boolean(nodeDialog)}
        onClose={() => setNodeDialog(undefined)}
        maxWidth="m"
        fullWidth
      >
        <Dialog.Header
          caption={nodeDialog?.mode === "edit" ? "Изменить узел" : "Новый узел"}
        />
        <Dialog.Body>
          {nodeDialog ? (
            <div className={styles.dialogForm}>
              {nodeDialog.mode === "edit" &&
              ["manufactured_item", "output"].includes(nodeDialog.type) &&
              nodeDialog.referenceId ? (
                <TabList value={nodeDialogTab} onUpdate={setNodeDialogTab}>
                  <Tab value="settings">Настройки</Tab>
                  <Tab value="production">Производство</Tab>
                </TabList>
              ) : null}
              {nodeDialogTab === "production" ? (
                <div className={styles.productionTab}>
                  <Text color="secondary">
                    Расчёт использует активный рецепт и сначала расходует доступные
                    полуфабрикаты со склада.
                  </Text>
                  <ProduceManufacturedItemButton
                    itemId={nodeDialog.referenceId}
                    itemName={nodeDialog.label || "Позиция"}
                    size="l"
                    view="action"
                  />
                </div>
              ) : nodeDialog.type === "output" ? (
                <Text color="secondary">
                  Финальный результат процесса: тип и сопоставление
                  зафиксированы.
                </Text>
              ) : (
                <>
                  <Select
                    label="Тип"
                    options={nodeTypeOptions}
                    value={[nodeDialog.type]}
                    onUpdate={(values) =>
                      setNodeDialog({
                        ...nodeDialog,
                        type: (values[0] ??
                          "material") as NodeDialogState["type"],
                        referenceId: "",
                      })
                    }
                    width="max"
                    aria-label="Тип узла"
                  />
                  <Select
                    label="Сущность"
                    options={referenceOptions}
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
                  />
                </>
              )}
              <TextInput
                label="Подпись"
                value={nodeDialog.label}
                onUpdate={(label) => setNodeDialog({ ...nodeDialog, label })}
                controlProps={{ "aria-label": "Подпись узла" }}
              />
            </div>
          ) : null}
        </Dialog.Body>
        {nodeDialogTab === "production" ? (
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
